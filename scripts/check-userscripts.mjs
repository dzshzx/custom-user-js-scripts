import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  REQUIRED_METADATA_FIELDS,
  UNIQUE_METADATA_FIELDS,
  extractMetadataBlockText,
  firstMetadataValue,
  installIdentity,
  listUserScripts,
  parseMetadataBlock,
} from './lib/userscript-metadata.mjs';

const root = process.cwd();
const srcDir = path.join(root, 'src');
const distDir = path.join(root, 'dist');

let hasError = false;
const seenInstallKeys = new Map();

function report(file, message) {
  console.error(`${path.relative(root, file)}: ${message}`);
  hasError = true;
}

async function listOptional(dir) {
  try {
    return await listUserScripts(dir);
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function loadScript(file) {
  const content = await readFile(file, 'utf8');
  return {
    file,
    content,
    metadata: parseMetadataBlock(content),
    metadataText: extractMetadataBlockText(content),
  };
}

function scriptId(file) {
  return path.basename(file, '.user.js');
}

// A bridge stub is a src userscript whose download URL points at its own dist
// counterpart; it exists only to keep the legacy install path discoverable.
function isBridge(script) {
  if (!script.metadata) return false;
  const downloadUrl = firstMetadataValue(script.metadata, '@downloadURL');
  return downloadUrl.endsWith(`/dist/${scriptId(script.file)}.user.js`);
}

function checkRequiredFields(script) {
  if (!script.metadata) {
    report(script.file, 'missing userscript metadata block');
    return false;
  }
  for (const field of REQUIRED_METADATA_FIELDS) {
    if (!script.metadata.has(field)) {
      report(script.file, `missing ${field}`);
    }
  }
  return true;
}

function registerUniqueness(script, label) {
  const identity = installIdentity(script.metadata);
  if (identity) {
    const key = `identity:${identity}`;
    const previous = seenInstallKeys.get(key);
    if (previous) {
      report(script.file, `duplicate userscript install identity with ${previous}`);
    } else {
      seenInstallKeys.set(key, label);
    }
  }

  for (const field of UNIQUE_METADATA_FIELDS) {
    for (const value of script.metadata.get(field) || []) {
      if (!value) continue;
      const key = `${field}:${value}`;
      const previous = seenInstallKeys.get(key);
      if (previous) {
        report(script.file, `duplicate ${field} value with ${previous}`);
      } else {
        seenInstallKeys.set(key, label);
      }
    }
  }
}

const srcScripts = await Promise.all((await listOptional(srcDir)).map(loadScript));
const distScripts = await Promise.all((await listOptional(distDir)).map(loadScript));

if (srcScripts.length === 0) {
  console.warn('No .user.js files found in src/.');
}

const distById = new Map(distScripts.map((script) => [scriptId(script.file), script]));
const pairedDistIds = new Set();

for (const script of srcScripts) {
  if (!checkRequiredFields(script)) continue;

  if (isBridge(script)) {
    const id = scriptId(script.file);
    const dist = distById.get(id);
    if (!dist) {
      report(script.file, `bridge stub's dist counterpart dist/${id}.user.js is missing`);
      continue;
    }
    pairedDistIds.add(id);
    if (script.content !== dist.content) {
      report(script.file, `bridge content does not match dist/${id}.user.js (rebuild with npm run build)`);
      continue;
    }
    // The pair is one logical script: register its identity and URLs once.
    registerUniqueness(script, `${path.relative(root, script.file)} + dist/${id}.user.js`);
    continue;
  }

  registerUniqueness(script, path.relative(root, script.file));
}

for (const script of distScripts) {
  const id = scriptId(script.file);
  if (!pairedDistIds.has(id)) {
    report(script.file, `missing bridge stub under src/ (expected a ${id}.user.js bridge with matching metadata)`);
    continue;
  }
  checkRequiredFields(script);
}

if (hasError) {
  process.exitCode = 1;
} else {
  console.log(`Checked ${srcScripts.length + distScripts.length} userscript file(s).`);
}
