// node --import ./scripts/jsx-loader.mjs — lets node:test import .jsx sources
// directly. esbuild does the transform; these are only Node's module hooks.
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';
import { JSX_OPTIONS } from './lib/jsx-build-options.mjs';

registerHooks({
  load(url, context, nextLoad) {
    if (!url.startsWith('file:') || !url.endsWith('.jsx')) return nextLoad(url, context);
    const loaded = nextLoad(url, { ...context, format: 'module' });
    const { code } = transformSync(String(loaded.source), {
      ...JSX_OPTIONS,
      loader: 'jsx',
      format: 'esm',
      sourcefile: fileURLToPath(url),
      sourcemap: 'inline',
    });
    return { format: 'module', source: code, shortCircuit: true };
  },
});
