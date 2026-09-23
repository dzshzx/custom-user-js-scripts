# Automated verification

Use Node 22 (CI) or newer, then `npm ci`, `npm run test:prepare`,
and `npm run verify`. Preparation uses the installed Playwright 1.61.1 CLI,
including its matching Chromium and OS libraries; Linux may require sudo for
OS dependencies. No npx package download or user-cache search participates in
browser tests. Playwright's standard `PLAYWRIGHT_BROWSERS_PATH` can select an
isolated cache; it must contain this package's matching browser revision.

Verify builds once, checks committed dist/bridge freshness and metadata, then
runs the complete node:test suite. Independent lint/test commands still build
first. The complete entries accept no filters. For focused debugging use
`node --test test/<name>.test.mjs` after building.

The five required browser tests retain their existing exact name plus owning
file as the identifier (listed in scripts/run-tests.mjs). Quota disposal and
sync drafts, Assistant lifecycle, JavDB compatibility, QR state capture and
Feishu page.evaluate equivalence must each emit exactly one passing result.
Missing, duplicate, skipped, todo or failed results fail verification; any
other suite failure, skip or todo also prevents a green complete report.
This uses Node's native
[TestsStream pass/fail events](https://nodejs.org/download/release/v22.23.2/docs/api/test.html#class-testsstream),
including skip/todo metadata, and never parses console TAP.

Reports live under `.scratch/test-report/`:

- preparation.json: Node/Playwright versions, browser/OS setup duration and exit.
- results.json: tested HEAD and dirty flag, Node/Playwright/launched browser
  versions, scope, environment preflight/build/test timings, per-test results
  and failure/skip reasons, and each mandatory acceptance result.

CI uploads this directory through GitHub Actions artifacts even on failure.
No full environment, credentials, browser state or real account data is added
to reports. Browser fixtures use synthetic content. Browser version comes from
a launched browser; the report's commit identifies HEAD and the dirty flag
explicitly marks a run over uncommitted edits.

These tests do not establish userscript-manager installation, human interaction
or live-site compatibility. Real ChatGPT/JavDB/Feishu pages, actual QR login,
third-party userscripts and manual browser acceptance remain separate pending
checks. Daily browser-tools keep their compatibility loader; its fallback test
copies the real module outside the checkout so the pinned project dependency
cannot hide fallback behavior.
