# Automated verification

Use the Node 24 LTS selected by `.node-version` for development and CI (minimum compatible version: 22.18), then `npm ci`, `npm run test:prepare`,
and `npm run verify`. Preparation uses the installed Playwright CLI (exact pin in `package.json`),
including its matching Chromium and OS libraries; Linux may require sudo for
OS dependencies. No npx package download or user-cache search participates in
browser tests. Playwright's standard `PLAYWRIGHT_BROWSERS_PATH` can select an
isolated cache; it must contain this package's matching browser revision.

Verify builds once, checks committed dist freshness, metadata, the strict
`tsc` type check (`tsconfig.json`, no emit), ESLint (`eslint.config.js`, zero errors), Biome (`biome.json`: each
function's cognitive complexity at most 15, no `biome-ignore` comments) and formatting (`scripts/format.sh --check`), then
runs the complete node:test suite. Independent lint/test commands build
first. The complete entries accept no filters. For focused debugging use
`node --import ./scripts/jsx-loader.mjs --test test/<name>.test.mjs` after building (the loader lets tests import `.ts`/`.tsx` sources through the same esbuild transform options as the bundle; `npm test` sets it for every file).

Any failed, skipped or todo result fails verification. The runner uses Node's native
[TestsStream pass/fail events](https://nodejs.org/download/release/v22.23.2/docs/api/test.html#class-testsstream),
including skip/todo metadata, and never parses console TAP; it prints each
non-passing result and the final counts. Browser fixtures use synthetic content.

These tests do not establish userscript-manager installation, human interaction
or live-site compatibility. Real JavDB/Feishu pages,
third-party userscripts and manual browser acceptance remain separate pending
checks.
