import path from 'node:path';
import { firstMetadataValue, installIdentity, parseMetadataBlock } from './userscript-metadata.mjs';
import { isUserscriptFile } from './userscript-sources.mjs';

// Facts only: consumers decide whether missing/stale generated outputs are legal
// at their stage. No source module is imported or evaluated.
export async function readUserscriptInventory({ files, readText }) {
  const paths = [...new Set(files.map((file) => path.posix.normalize(file.replaceAll('\\', '/'))))]
    .filter((file) => isUserscriptFile(file) && /^(src\/|dist\/)/.test(file))
    .sort();
  const facts = new Map();
  const issues = [];
  const issue = (type, file, message, related = []) => issues.push({ type, file, related, message });
  const reads = await Promise.all(
    paths.map(async (file) => {
      try {
        return { file, read: true, content: await readText(file) };
      } catch (error) {
        return { file, read: false, error };
      }
    }),
  );
  for (const { file, read, content, error } of reads) {
    if (read) {
      const metadata = parseMetadataBlock(content);
      facts.set(file, { path: file, exists: true, content, metadata });
      if (!metadata) issue('invalid-metadata', file, 'missing userscript metadata block');
    } else {
      const missing = error?.code === 'ENOENT';
      facts.set(file, { path: file, exists: !missing, error: error.message, code: error.code });
      issue(missing ? 'missing-file' : 'read-failed', file, `cannot read ${file}: ${error.message}`);
    }
  }
  const fact = (file) => facts.get(file) || { path: file, exists: false };
  const records = [];
  const claimed = new Map();
  function claim(record, file) {
    if (claimed.has(file))
      issue('ownership-conflict', file, 'multiple metadata owners claim this path', [
        claimed.get(file),
        record.metadataOwner.path,
      ]);
    claimed.set(file, record.metadataOwner.path);
  }
  function add(owner, entry, dist) {
    const record = {
      scriptId: path.posix.basename(owner.path).replace(/\.(entry\.ts|user\.js)$/, ''),
      identity: owner.metadata ? installIdentity(owner.metadata) : '',
      metadataOwner: owner,
      entry,
      dist,
      ownership: entry ? 'entry' : 'single',
    };
    records.push(record);
    for (const file of [owner, dist].filter(Boolean)) claim(record, file.path);
    if (entry && !dist.exists) issue('missing-dist', owner.path, `missing dist bundle ${dist.path}`, [dist.path]);
    if (entry && dist.content !== undefined) {
      if (
        !dist.metadata ||
        installIdentity(dist.metadata) !== record.identity ||
        firstMetadataValue(dist.metadata, '@version') !== firstMetadataValue(entry.metadata || new Map(), '@version')
      ) {
        issue('metadata-mismatch', dist.path, `does not match ${entry.path} install identity and @version`, [
          entry.path,
        ]);
      }
    }
    return record;
  }
  for (const file of paths.filter((file) => file.startsWith('src/') && file.endsWith('.entry.ts'))) {
    const entry = fact(file);
    if (!entry.exists) continue;
    const id = path.posix.basename(file, '.entry.ts');
    if (file !== `src/userscripts/${id}/${id}.entry.ts`) {
      issue('invalid-entry-path', file, 'entry path must be src/userscripts/<script-id>/<script-id>.entry.ts');
    }
    add(entry, entry, fact(`dist/${id}.user.js`));
  }
  for (const file of paths.filter((file) => file.startsWith('src/') && file.endsWith('.user.js'))) {
    if (!claimed.has(file)) add(fact(file), null, null);
  }
  for (const file of paths.filter((file) => file.startsWith('dist/') && !claimed.has(file))) {
    issue('orphan-dist', file, 'orphan installable without a source entry owner');
  }
  const seen = new Map();
  for (const record of records) {
    const owner = record.metadataOwner;
    if (!owner.metadata) continue;
    for (const [field, values] of [
      ['identity', [record.identity]],
      ...['@downloadURL', '@updateURL'].map((key) => [key, owner.metadata.get(key) || []]),
    ]) {
      for (const value of values.filter(Boolean)) {
        const key = `${field}:${value}`;
        if (seen.has(key))
          issue(
            field === 'identity' ? 'duplicate-identity' : 'duplicate-url',
            owner.path,
            `duplicate ${field === 'identity' ? 'userscript install identity' : `${field} value`} with ${seen.get(key)}`,
            [seen.get(key)],
          );
        else seen.set(key, owner.path);
      }
    }
  }
  const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  records.sort((a, b) => compare(a.metadataOwner.path, b.metadataOwner.path));
  issues.sort((a, b) => compare(a.file, b.file) || compare(a.type, b.type));
  return { records, issues, files: [...facts.values()] };
}
