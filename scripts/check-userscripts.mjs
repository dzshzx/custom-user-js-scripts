import { installUrlIssues, missingRequiredFields } from './lib/userscript-metadata.mjs';
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
  for (const message of missingRequiredFields(file.metadata)) report(file.path, message);
}
for (const record of inventory.records) {
  for (const script of [record.metadataOwner, record.entry && record.bridge, record.entry && record.dist].filter(
    Boolean,
  )) {
    if (!script.metadata) continue;
    for (const message of installUrlIssues(script.metadata, record.dist?.path || script.path)) {
      report(script.path, message);
    }
  }
}
// Only the shared adapter probes the userscript manager API; scripts go
// through resolveGmApi so GM_* / GM.* precedence stays in one place.
const GM_ADAPTER = 'src/userscripts/shared/shared-gm.lib.ts';
const GM_PROBE = /typeof\s+GM(?:_\w+)?\b/;
const modules = await worktreeSource(process.cwd(), {
  dirs: ['src'],
  include: (file) => /\.(lib|entry)\.[jt]sx?$/.test(file) && file !== GM_ADAPTER,
});
for (const file of modules.files) {
  if (GM_PROBE.test(await modules.readText(file))) {
    report(file, `probes the GM API directly; use resolveGmApi from ${GM_ADAPTER}`);
  }
}
const installables = inventory.files.filter((file) => file.path.endsWith('.user.js'));
if (!installables.some((file) => file.path.startsWith('src/'))) console.warn('No .user.js files found in src/.');
if (hasError) process.exitCode = 1;
else console.log(`Checked ${installables.length} userscript file(s).`);
