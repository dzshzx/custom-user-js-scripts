import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const srcDir = path.join(root, 'src');

async function listUserScripts(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return listUserScripts(fullPath);
      }
      return entry.isFile() && entry.name.endsWith('.user.js') ? [fullPath] : [];
    }),
  );

  return files.flat();
}

const requiredMetadata = ['@name', '@namespace', '@version', '@description', '@match'];
const files = await listUserScripts(srcDir);
let hasError = false;

if (files.length === 0) {
  console.warn('No .user.js files found in src/.');
}

for (const file of files) {
  const content = await readFile(file, 'utf8');
  const relativePath = path.relative(root, file);

  if (!content.includes('// ==UserScript==') || !content.includes('// ==/UserScript==')) {
    console.error(`${relativePath}: missing userscript metadata block`);
    hasError = true;
    continue;
  }

  for (const field of requiredMetadata) {
    if (!content.includes(field)) {
      console.error(`${relativePath}: missing ${field}`);
      hasError = true;
    }
  }
}

if (hasError) {
  process.exitCode = 1;
} else {
  console.log(`Checked ${files.length} userscript file(s).`);
}
