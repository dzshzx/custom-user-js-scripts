import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const defaultUserscriptPath = path.resolve(import.meta.dirname, '../../src/web-page-assistant.user.js');

export async function readInstallableBlock(markerPrefix, options = {}) {
  const userscriptPath = options.userscriptPath || defaultUserscriptPath;
  const content = await readFile(userscriptPath, 'utf8');
  const blockStart = `// ${markerPrefix}_START`;
  const blockEnd = `// ${markerPrefix}_END`;
  const startIndex = content.indexOf(blockStart);
  const endIndex = content.indexOf(blockEnd);

  assert.notEqual(startIndex, -1, `${markerPrefix} start marker is missing`);
  assert.notEqual(endIndex, -1, `${markerPrefix} end marker is missing`);
  assert.ok(endIndex > startIndex, `${markerPrefix} markers are out of order`);

  return content.slice(startIndex + blockStart.length, endIndex);
}

export async function loadInstallableBlock({
  markerPrefix,
  prefixSource = '',
  returnExpression,
  userscriptPath,
}) {
  assert.equal(typeof markerPrefix, 'string', 'markerPrefix is required');
  assert.equal(typeof returnExpression, 'string', 'returnExpression is required');

  const block = await readInstallableBlock(markerPrefix, { userscriptPath });
  return vm.runInThisContext(`
    (() => {
      ${prefixSource}
      ${block}
      return ${returnExpression};
    })()
  `);
}
