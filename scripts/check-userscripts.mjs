import { installUrlIssues, missingRequiredFields } from './lib/userscript-metadata.mjs';
import { readUserscriptInventory } from './lib/userscript-inventory.mjs';
import { worktreeSource } from './lib/userscript-sources.mjs';

const inventory = await readUserscriptInventory(await worktreeSource(process.cwd()));
let hasError = false;
function report(file, message) {
  console.error(`${file}: ${message}`);
  hasError = true;
}
for (const issue of inventory.issues) report(issue.file, issue.message);
for (const file of inventory.files) {
  if (!file.metadata) continue;
  for (const message of missingRequiredFields(file.metadata)) report(file.path, message);
}
for (const record of inventory.records) {
  for (const script of [record.metadataOwner, record.entry && record.dist].filter(Boolean)) {
    if (!script.metadata) continue;
    for (const message of installUrlIssues(script.metadata, record.dist?.path || script.path)) {
      report(script.path, message);
    }
  }
}
const installables = inventory.files.filter((file) => file.path.endsWith('.user.js'));
if (!installables.some((file) => file.path.startsWith('src/'))) console.warn('No .user.js files found in src/.');
if (hasError) process.exitCode = 1;
else console.log(`Checked ${installables.length} userscript file(s).`);
