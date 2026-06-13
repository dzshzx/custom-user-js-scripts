# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run lint   # validate installable userscript metadata (scripts/check-userscripts.mjs)
npm test       # run all Node tests (node --test over test/*.test.mjs)

node --test test/codex-quota-compass-core.test.mjs   # run a single test file
```

There is no build step or transpiler — userscripts ship as plain ES that runs directly in the browser via a script manager.

## Architecture

Each installable userscript lives in `src/userscripts/<script-id>/` and is split into:

- `<script-id>.user.js` — the **install entry**. Holds the `// ==UserScript== ...` metadata block and a top-level IIFE that wires the helper modules together.
- `<script-id>-*.lib.js` — **support modules**. Each is an IIFE of the form `(function attachXLib(globalObject){ ... globalObject.XLib = {...} })(globalThis ?? window)` that attaches one namespace to the global object.

How the two halves connect differs by environment, and this is the key thing to understand:

- **In the browser**, the entry's metadata block lists each `.lib.js` as a `@require` pointing at a **raw GitHub URL on the `master` branch**. The manager fetches and concatenates them before running the entry. Because of this, local edits to a `.lib.js` are not seen by an installed script until they are pushed to `master` — the `@require` URLs are the source the manager actually loads.
- **In tests**, the lib files are pulled in with `await import('../src/userscripts/.../x.lib.js')` purely for their side effect (attaching the namespace to `globalThis`), then assertions read `globalThis.XLib`.

`@require` order is significant: a lib reads its dependencies off the global object and throws on load if a prerequisite is missing (e.g. `CodexQuotaCompassCoreLib` requires `CodexQuotaCompassContractLib` first). Keep the `@require` list in dependency order, and keep it in sync with what the entry's IIFE expects.

### Storage

Userscripts persist through the script-manager storage API (`GM_getValue`/`GM_setValue` or `GM.*`) and **fall back to page `localStorage`** when the GM API is unavailable. Storage keys are part of the user-data contract — preserve them across renames/migrations unless a task explicitly migrates data.

### Tests

Node's built-in test runner (`node:test` + `node:assert/strict`), no framework. Tests are unit-level, exercising the lib namespaces directly against `globalThis`. `test/helpers/installable-block-loader.mjs` can extract and `vm`-eval a marked `// PREFIX_START` / `// PREFIX_END` region from an entry file for testing inline (non-lib) blocks.

The repo is deliberately **dependency-free** — no `dependencies`/`devDependencies`, no lockfile. DOM-level UI/UX tests are the one exception: they need a DOM library that is installed locally on demand (`npm install --no-save --no-package-lock happy-dom`) and never recorded in `package.json`. Such tests import `test/helpers/dom-env.mjs` and pass `{ skip: domSkip }`, so they self-skip when the library is absent (clean clone, CI) and `npm test` still passes with zero dependencies. See `test/codex-quota-compass-panel-shell-dom.test.mjs`.

### Lint

`npm run lint` walks every `*.user.js` under `src/`, parses the metadata block, and fails if any of `@name @namespace @version @description @match` is missing, or if two scripts collide on install identity (`@namespace :: @name`), `@downloadURL`, or `@updateURL`.

## Conventions

- **Do not bump `@version`** for ordinary feature/UI/fix changes — only when explicitly asked. The lint requires the field to exist, not to change.
- When renaming or moving a userscript file, update in lockstep: README/docs links, test paths, and the `@downloadURL` / `@updateURL` / `@require` raw URLs. See `docs/script-template.md`.
- Injected UI follows `DESIGN.md`: quiet, familiar controls, CSS scoped to the script root, no layout jumps. Read it before touching any injected interface.
- Stable domain vocabulary (Quota Snapshot, Snapshot Archive, Gist Sync, etc.) is defined in `CONTEXT.md` — use those terms and avoid the listed alternatives.

## Docs map

- `README.md` — repo entry, per-script summaries, install instructions.
- `PRODUCT.md` — product scope, users, boundaries, data principles, versioning policy.
- `DESIGN.md` — injected-UI design rules.
- `CONTEXT.md` — domain glossary.
- `docs/scripts/` — per-script runbooks (installable list, Codex Gist sync, Feishu tools).
- `docs/agents/` — agent-skill config (issue tracker, triage labels, domain layout).

This project is also managed by **Trellis** (see `.trellis/`) and carries Codex agent instructions in `AGENTS.md`; prefer Trellis commands when available on the platform.
