import { REQUIRED_METADATA_FIELDS, firstMetadataValue } from './lib/userscript-metadata.mjs';
import { readUserscriptInventory } from './lib/userscript-inventory.mjs';
import { worktreeSource } from './lib/userscript-sources.mjs';

const inventory = await readUserscriptInventory(await worktreeSource(process.cwd()));
let hasError = false;
function report(file, message) {
  console.error(`${file}: ${message}`);
  hasError = true;
}
for (const issue of inventory.issues) {
  // Historical URL-inferred pairs remain valid at lint time.
  if (issue.type === 'missing-entry') continue;
  let message = issue.message;
  if (issue.type === 'orphan-dist') message = 'missing bridge file under src/ (expected matching metadata)';
  if (issue.type === 'missing-companion' && issue.related[0].startsWith('dist/')) {
    message = `bridge file's dist counterpart ${issue.related[0]} is missing`;
  }
  report(issue.file, message);
}
for (const file of inventory.files) {
  if (!file.metadata) continue;
  for (const field of REQUIRED_METADATA_FIELDS) {
    if (!file.metadata.has(field)) report(file.path, `missing ${field}`);
  }
}
for (const record of inventory.records) {
  for (const script of [record.metadataOwner, record.entry && record.bridge, record.entry && record.dist].filter(Boolean)) {
    if (!script.metadata) continue;
    const expected = record.dist?.path || script.path;
    const download = firstMetadataValue(script.metadata, '@downloadURL');
    const update = firstMetadataValue(script.metadata, '@updateURL');
    if (!download || !update) {
      report(script.path, `missing @downloadURL/@updateURL (must point both at their own raw path, ending with /${expected})`);
      continue;
    }
    if (download !== update) report(script.path, '@downloadURL and @updateURL differ');
    if (!download.endsWith(`/${expected}`)) report(script.path, `@downloadURL must end with /${expected} (the script's own path)`);
  }
}
const installables = inventory.files.filter((file) => file.path.endsWith('.user.js'));
if (!installables.some((file) => file.path.startsWith('src/'))) console.warn('No .user.js files found in src/.');
if (hasError) process.exitCode = 1;
else console.log(`Checked ${installables.length} userscript file(s).`);
