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
      scriptId: path.posix.basename(owner.path).replace(/\.(entry\.[jt]s|user\.js)$/, ''),
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
  // Entries are TypeScript (<id>.entry.ts); .entry.js stays readable so Git refs
  // from before the TypeScript migration still form a complete version baseline.
  for (const file of paths.filter((file) => file.startsWith('src/') && /\.entry\.[jt]s$/.test(file))) {
    const entry = fact(file);
    if (!entry.exists) continue;
    const extension = file.slice(-'.entry.ts'.length);
    const stem = file.slice(0, -extension.length);
    if (file !== `src/userscripts/${path.posix.basename(stem)}/${path.posix.basename(stem)}${extension}`) {
      issue('invalid-entry-path', file, 'entry path must be src/userscripts/<script-id>/<script-id>.entry.ts');
    }
    add(entry, entry, fact(`dist/${path.posix.basename(stem)}.user.js`));
    // Refs before 2026-11 carry a generated src copy of the bundle beside the entry;
    // it adds no identity, so those refs still form a version baseline.
    if (facts.has(`${stem}.user.js`)) {
      claimed.set(`${stem}.user.js`, file);
      issue('legacy-src-copy', `${stem}.user.js`, 'bundled scripts install only from dist/; delete this copy');
    }
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
