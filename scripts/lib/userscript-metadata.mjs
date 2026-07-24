import { readdir } from 'node:fs/promises';
import path from 'node:path';

export const REQUIRED_METADATA_FIELDS = ['@name', '@namespace', '@version', '@description', '@match'];
export const UNIQUE_METADATA_FIELDS = ['@downloadURL', '@updateURL'];

export async function listUserScripts(dir) {
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

export function extractMetadataBlockText(content) {
  const match = content.match(/\/\/ ==UserScript==\n[\s\S]*?\/\/ ==\/UserScript==/);
  return match ? match[0] : null;
}

export function parseMetadataBlock(content) {
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

export function firstMetadataValue(metadata, field) {
  return metadata.get(field)?.[0] || '';
}

export function installIdentity(metadata) {
  const namespace = firstMetadataValue(metadata, '@namespace');
  const name = firstMetadataValue(metadata, '@name');
  return namespace && name ? `${namespace} :: ${name}` : '';
}
