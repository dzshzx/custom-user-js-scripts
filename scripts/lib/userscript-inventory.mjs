import path from 'node:path';
import { firstMetadataValue, installIdentity, parseMetadataBlock } from './userscript-metadata.mjs';
import { isUserscriptFile } from './userscript-sources.mjs';

// Lists the [field, value] pairs a metadata owner claims: its install identity,
// then each non-empty @downloadURL and @updateURL value.
function installValues(record) {
  const metadata = record.metadataOwner.metadata;
  return [
    ['identity', [record.identity]],
    ...['@downloadURL', '@updateURL'].map((key) => [key, metadata.get(key) || []]),
  ].flatMap(([field, values]) => values.filter(Boolean).map((value) => [field, value]));
}

// Reports a later metadata owner that repeats an install identity, @downloadURL or @updateURL.
function reportDuplicateInstallValues(records, issue) {
  const seen = new Map();
  for (const record of records) {
    const owner = record.metadataOwner;
    if (!owner.metadata) continue;
    for (const [field, value] of installValues(record)) {
      const key = `${field}:${value}`;
      if (!seen.has(key)) {
        seen.set(key, owner.path);
        continue;
      }
      const first = seen.get(key);
      if (field === 'identity')
        issue('duplicate-identity', owner.path, `duplicate userscript install identity with ${first}`, [first]);
      else issue('duplicate-url', owner.path, `duplicate ${field} value with ${first}`, [first]);
    }
  }
}

// Reads every path once; a failed read becomes a fact with its error instead of throwing.
function readFiles(paths, readText) {
  return Promise.all(
    paths.map(async (file) => {
      try {
        return { file, read: true, content: await readText(file) };
      } catch (error) {
        return { file, read: false, error };
      }
    }),
  );
}

// Turns one read result into a file fact, reporting a missing metadata block or a failed read.
function fileFact({ file, read, content, error }, issue) {
  if (read) {
    const metadata = parseMetadataBlock(content);
    if (!metadata) issue('invalid-metadata', file, 'missing userscript metadata block');
    return { path: file, exists: true, content, metadata };
  }
  const missing = error?.code === 'ENOENT';
  issue(missing ? 'missing-file' : 'read-failed', file, `cannot read ${file}: ${error.message}`);
  return { path: file, exists: !missing, error: error.message, code: error.code };
}

// An entry's dist bundle must carry the entry's install identity and @version.
function distMatchesEntry(entry, dist, identity) {
  return (
    Boolean(dist.metadata) &&
    installIdentity(dist.metadata) === identity &&
    firstMetadataValue(dist.metadata, '@version') === firstMetadataValue(entry.metadata || new Map(), '@version')
  );
}

// Facts only: consumers decide whether missing/stale generated outputs are legal
// at their stage. No source module is imported or evaluated.
export async function readUserscriptInventory({ files, readText }) {
  const paths = [...new Set(files.map((file) => path.posix.normalize(file.replaceAll('\\', '/'))))]
    .filter((file) => isUserscriptFile(file) && /^(src\/|dist\/)/.test(file))
    .sort();
  const facts = new Map();
  const issues = [];
  const issue = (type, file, message, related = []) => issues.push({ type, file, related, message });
  for (const result of await readFiles(paths, readText)) facts.set(result.file, fileFact(result, issue));
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
    if (entry && dist.content !== undefined && !distMatchesEntry(entry, dist, record.identity)) {
      issue('metadata-mismatch', dist.path, `does not match ${entry.path} install identity and @version`, [entry.path]);
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
  reportDuplicateInstallValues(records, issue);
  const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  records.sort((a, b) => compare(a.metadataOwner.path, b.metadataOwner.path));
  issues.sort((a, b) => compare(a.file, b.file) || compare(a.type, b.type));
  return { records, issues, files: [...facts.values()] };
}
