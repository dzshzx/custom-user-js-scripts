export const REQUIRED_METADATA_FIELDS = ['@name', '@namespace', '@version', '@description', '@match'];

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

// Metadata rules shared by the build (entries) and the lint (every owner and
// generated companion), so both stages reject the same mistakes.
export function missingRequiredFields(metadata) {
  return REQUIRED_METADATA_FIELDS.filter((field) => !metadata.has(field)).map((field) => `missing ${field}`);
}

// expectedPath is the repository path the install URLs must serve, e.g. dist/<id>.user.js.
export function installUrlIssues(metadata, expectedPath) {
  const download = firstMetadataValue(metadata, '@downloadURL');
  const update = firstMetadataValue(metadata, '@updateURL');
  if (!download || !update) {
    return [`missing @downloadURL/@updateURL (must point both at their own raw path, ending with /${expectedPath})`];
  }
  const issues = [];
  if (download !== update) issues.push('@downloadURL and @updateURL differ');
  if (!download.endsWith(`/${expectedPath}`)) {
    issues.push(`@downloadURL must end with /${expectedPath} (the script's own path)`);
  }
  return issues;
}

export function installIdentity(metadata) {
  const namespace = firstMetadataValue(metadata, '@namespace');
  const name = firstMetadataValue(metadata, '@name');
  return namespace && name ? `${namespace} :: ${name}` : '';
}
