# Directory Structure

> How browser userscript code is organized in this project.

---

## Overview

This repository is not a bundled web app. It stores standalone `.user.js`
files that can be pasted or installed into a browser userscript manager.
Each userscript should remain installable without a build step. Small scripts
can stay as one `.user.js` file, while larger scripts should use script-scoped
support modules loaded through userscript metadata or test loaders.

---

## Directory Layout

```text
.
|-- docs/                 # Human-facing docs, script runbooks, conventions
|-- scripts/              # Local Node.js helper scripts
|-- snippets/             # Reusable plain browser JavaScript snippets
|-- src/
|   `-- userscripts/
|       `-- <script-id>/
|           |-- <script-id>.user.js
|           `-- *.lib.js
`-- test/                 # Node tests for scripts and tooling
```

The repository is currently migrating from the old flat `src/*.user.js` layout
to the target `src/userscripts/<script-id>/` layout. During migration, update
tests, metadata URLs, and documentation links in the same task that moves the
files.

- `src/example.user.js` is the current minimal metadata and IIFE template until
  the layout migration moves it.
- `src/codex-quota-compass.user.js` is the current installable entrypoint for a
  complex userscript with support modules.
- `snippets/dom-ready.js` contains a small reusable DOM readiness helper.
- `scripts/check-userscripts.mjs` is the local lint script run by
  `npm run lint`.

---

## Module Organization

Put installable userscripts under `src/userscripts/<script-id>/` and give each
entrypoint a `.user.js` suffix. A userscript should target one site, page
family, or feature area. Keep the userscript metadata block at the top of the
entrypoint and keep direct runtime bootstrapping inside an IIFE with
`'use strict'`.

Same-script support modules belong next to the entrypoint as `*.lib.js` files.
When the entrypoint depends on those modules in a userscript manager, declare
the raw file URLs with `@require` and keep those URLs aligned with the
repository path.

Reusable snippets belong in `snippets/`. Because there is no bundler today,
snippets are reference material to copy or adapt into userscripts, not imports
from installable userscripts.

Local development tools belong in `scripts/`. Tooling files use Node ESM, as
shown by `scripts/check-userscripts.mjs` and `"type": "module"` in
`package.json`.

Human-facing project notes and script runbooks belong in `docs/`. Agent
configuration belongs in `docs/agents/`. Implementation rules belong in
`.trellis/spec/`, and domain vocabulary belongs in `CONTEXT.md`.

---

## Naming Conventions

- Userscript folders: `kebab-case`, for example
  `src/userscripts/codex-quota-compass/`.
- Userscript entrypoints: `kebab-case.user.js`, for example
  `src/userscripts/codex-quota-compass/codex-quota-compass.user.js`.
- Same-script libraries: `kebab-case.lib.js`, kept next to the entrypoint.
- Snippets: `kebab-case.js`, for example `snippets/dom-ready.js`.
- Node tools: `kebab-case.mjs`, for example `scripts/check-userscripts.mjs`.
- Metadata fields are part of the install contract. At minimum, keep
  `@name`, `@namespace`, `@version`, `@description`, and `@match`.
- Use `@grant none` when no userscript manager API is required. Add specific
  grants only when code actually calls that API, as
  `src/codex-quota-compass.user.js` does for `GM_registerMenuCommand`.

## Moving or Renaming Userscripts

This is currently a single-user repository, so a cleanup task may move
installed userscript files without maintaining a long bridge release. The task
must still treat migration as explicit work: update documentation links, tests,
`@downloadURL`, `@updateURL`, and any `@require` URLs together.

For multi-user or public installs, prefer a bridge release at the old path:

```javascript
// Old installed file: src/old-name.user.js
// @version      <new version when the user explicitly requested an update>
// @downloadURL  https://raw.githubusercontent.com/<repo>/master/src/new-name.user.js
// @updateURL    https://raw.githubusercontent.com/<repo>/master/src/new-name.user.js
```

Keep persisted storage keys stable unless the task explicitly includes a data
migration, because moving a file should not erase saved settings. Do not change
`@name` and `@namespace` in the same migration unless duplicate-script behavior
has been tested in the target userscript manager.

## Documentation Responsibilities

- `README.md`: project entrypoint, quick commands, install links, and
  navigation.
- `docs/`: human-facing script docs, runbooks, and conventions.
- `docs/agents/`: engineering-skill configuration only.
- `CONTEXT.md`: domain glossary only.
- `.trellis/spec/`: implementation rules and validation checklists.
- `.trellis/tasks/`: task planning and historical execution evidence.

---

## Examples

Use `src/example.user.js` as the current template until the layout migration
moves it. Use the Codex Quota Compass area as the current reference for a
complex userscript that injects UI, stores browser-local UI state, calls page
APIs, and avoids exposing tokens in normal output.
