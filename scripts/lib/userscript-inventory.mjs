import path from 'node:path';
import { firstMetadataValue, installIdentity, parseMetadataBlock } from './userscript-metadata.mjs';

// Facts only: consumers decide whether missing/stale generated outputs are legal
// at their stage. No source module is imported or evaluated.
export async function readUserscriptInventory({ files, readText }) {
  const paths = [...new Set(files.map((file) => path.posix.normalize(file.replaceAll('\\', '/'))))]
    .filter((file) => /\.(entry|user)\.js$/.test(file) && /^(src\/|dist\/)/.test(file)).sort();
  const facts = new Map();
  const issues = [];
  const issue = (type, file, message, related = []) => issues.push({ type, file, related, message });
  for (const file of paths) {
    try {
      const content = await readText(file);
      const metadata = parseMetadataBlock(content);
      facts.set(file, { path: file, exists: true, content, metadata });
      if (!metadata) issue('invalid-metadata', file, 'missing userscript metadata block');
    } catch (error) {
      const missing = error?.code === 'ENOENT';
      facts.set(file, { path: file, exists: !missing, error: error.message, code: error.code });
      issue(missing ? 'missing-file' : 'read-failed', file, `cannot read ${file}: ${error.message}`);
    }
  }
  const fact = (file) => facts.get(file) || { path: file, exists: false };
  const records = [];
  const claimed = new Map();
  function claim(record, file) {
    if (claimed.has(file)) issue('ownership-conflict', file, 'multiple metadata owners claim this path', [claimed.get(file), record.metadataOwner.path]);
    claimed.set(file, record.metadataOwner.path);
  }
  function add(owner, entry, bridge, dist, single) {
    const record = {
      scriptId: path.posix.basename(owner.path).replace(/\.(entry|user)\.js$/, ''),
      identity: owner.metadata ? installIdentity(owner.metadata) : '',
      metadataOwner: owner, entry, bridge, dist, single,
      ownership: entry ? 'entry' : bridge ? 'url' : 'single',
    };
    records.push(record);
    for (const file of [entry, bridge, dist, single].filter(Boolean)) claim(record, file.path);
    if (bridge && dist) {
      for (const file of [bridge, dist]) {
        if (!file.exists) issue('missing-companion', owner.path, `missing installable companion ${file.path}`, [file.path]);
      }
      if (bridge.content !== undefined && dist.content !== undefined && bridge.content !== dist.content) {
        issue('content-mismatch', bridge.path, `bridge content does not match ${dist.path} (rebuild with npm run build)`, [dist.path]);
      }
    }
    if (entry) {
      for (const companion of [bridge, dist].filter((file) => file.exists && file.content !== undefined)) {
        if (!companion.metadata || installIdentity(companion.metadata) !== record.identity ||
            firstMetadataValue(companion.metadata, '@version') !== firstMetadataValue(entry.metadata || new Map(), '@version')) {
          issue('metadata-mismatch', companion.path, `does not match ${entry.path} install identity and @version`, [entry.path]);
        }
      }
    }
    return record;
  }
  for (const file of paths.filter((file) => file.startsWith('src/') && file.endsWith('.entry.js'))) {
    const entry = fact(file);
    if (!entry.exists) continue;
    const stem = file.slice(0, -'.entry.js'.length);
    if (file !== `src/userscripts/${path.posix.basename(stem)}/${path.posix.basename(stem)}.entry.js`) {
      issue('invalid-entry-path', file, 'entry path must be src/userscripts/<script-id>/<script-id>.entry.js');
    }
    add(entry, entry, fact(`${stem}.user.js`), fact(`dist/${path.posix.basename(stem)}.user.js`), null);
  }
  for (const file of paths.filter((file) => file.startsWith('src/') && file.endsWith('.user.js'))) {
    if (claimed.has(file)) continue;
    const owner = fact(file);
    const id = path.posix.basename(file, '.user.js');
    if (owner.metadata && firstMetadataValue(owner.metadata, '@downloadURL').endsWith(`/dist/${id}.user.js`)) {
      add(owner, null, owner, fact(`dist/${id}.user.js`), null);
      issue('missing-entry', file, 'URL-inferred bridge has no source entry owner');
    } else add(owner, null, null, null, owner);
  }
  for (const file of paths.filter((file) => file.startsWith('dist/') && !claimed.has(file))) {
    issue('orphan-dist', file, 'orphan installable without a source entry owner');
  }
  const seen = new Map();
  for (const record of records) {
    const owner = record.metadataOwner;
    if (!owner.metadata) continue;
    for (const [field, values] of [['identity', [record.identity]], ...['@downloadURL', '@updateURL'].map((key) => [key, owner.metadata.get(key) || []])]) {
      for (const value of values.filter(Boolean)) {
        const key = `${field}:${value}`;
        if (seen.has(key)) issue(field === 'identity' ? 'duplicate-identity' : 'duplicate-url', owner.path,
          `duplicate ${field === 'identity' ? 'userscript install identity' : `${field} value`} with ${seen.get(key)}`, [seen.get(key)]);
        else seen.set(key, owner.path);
      }
    }
  }
  const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  records.sort((a, b) => compare(a.metadataOwner.path, b.metadataOwner.path));
  issues.sort((a, b) => compare(a.file, b.file) || compare(a.type, b.type));
  return { records, issues, files: [...facts.values()] };
}
