import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const srcDir = path.join(root, 'src');
const requiredMetadata = ['@name', '@namespace', '@version', '@description', '@match'];
const uniqueMetadata = ['@downloadURL', '@updateURL'];

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

function parseMetadataBlock(content) {
  const match = content.match(/\/\/ ==UserScript==\n([\s\S]*?)\/\/ ==\/UserScript==/);
  if (!match) return null;

  const metadata = new Map();
  for (const line of match[1].split('\n')) {
    const fieldMatch = line.match(/^\s*\/\/\s+(@\S+)(?:\s+(.*))?$/);
    if (!fieldMatch) continue;

    const field = fieldMatch[1];
    const value = (fieldMatch[2] || '').trim();
    const values = metadata.get(field) || [];
    values.push(value);
    metadata.set(field, values);
  }

  return metadata;
}

function firstMetadataValue(metadata, field) {
  return metadata.get(field)?.[0] || '';
}

function installIdentity(metadata) {
  const namespace = firstMetadataValue(metadata, '@namespace');
  const name = firstMetadataValue(metadata, '@name');
  return namespace && name ? `${namespace} :: ${name}` : '';
}

const files = await listUserScripts(srcDir);
let hasError = false;
const seenInstallKeys = new Map();

if (files.length === 0) {
  console.warn('No .user.js files found in src/.');
}

for (const file of files) {
  const content = await readFile(file, 'utf8');
  const relativePath = path.relative(root, file);
  const metadata = parseMetadataBlock(content);

  if (!metadata) {
    console.error(`${relativePath}: missing userscript metadata block`);
    hasError = true;
    continue;
  }

  for (const field of requiredMetadata) {
    if (!metadata.has(field)) {
      console.error(`${relativePath}: missing ${field}`);
      hasError = true;
    }
  }

  const identity = installIdentity(metadata);
  if (identity) {
    const key = `identity:${identity}`;
    const previous = seenInstallKeys.get(key);
    if (previous) {
      console.error(`${relativePath}: duplicate userscript install identity with ${previous}`);
      hasError = true;
    } else {
      seenInstallKeys.set(key, relativePath);
    }
  }

  for (const field of uniqueMetadata) {
    for (const value of metadata.get(field) || []) {
      if (!value) continue;
      const key = `${field}:${value}`;
      const previous = seenInstallKeys.get(key);
      if (previous) {
        console.error(`${relativePath}: duplicate ${field} value with ${previous}`);
        hasError = true;
      } else {
        seenInstallKeys.set(key, relativePath);
      }
    }
  }
}

if (hasError) {
  process.exitCode = 1;
} else {
  console.log(`Checked ${files.length} userscript file(s).`);
}
