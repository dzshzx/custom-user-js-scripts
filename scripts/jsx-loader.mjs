// node --import ./scripts/jsx-loader.mjs — lets node:test import .ts/.tsx (and
// .jsx) sources directly. esbuild does the transform with the options the
// bundle build uses; these are only Node's module hooks.
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';
import { TRANSFORM_OPTIONS } from './lib/jsx-build-options.mjs';

const LOADERS = { '.jsx': 'jsx', '.ts': 'ts', '.tsx': 'tsx' };

registerHooks({
  load(url, context, nextLoad) {
    const pathname = url.startsWith('file:') ? new URL(url).pathname : '';
    const loader = LOADERS[pathname.slice(pathname.lastIndexOf('.'))];
    if (!loader) return nextLoad(url, context);
    const loaded = nextLoad(url, { ...context, format: 'module' });
    const { code } = transformSync(String(loaded.source), {
      ...TRANSFORM_OPTIONS,
      loader,
      format: 'esm',
      sourcefile: fileURLToPath(url),
      sourcemap: 'inline',
    });
    return { format: 'module', source: code, shortCircuit: true };
  },
});
