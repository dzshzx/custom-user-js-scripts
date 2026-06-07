# Directory Structure

> How browser userscript code is organized in this project.

---

## Overview

This repository is not a bundled web app. It stores standalone `.user.js`
files that can be pasted or installed into a browser userscript manager.
Each userscript should remain understandable as a single file unless a future
build step is introduced.

---

## Directory Layout

```text
.
|-- docs/                 # Script notes, rewrite records, target page rules
|-- scripts/              # Local Node.js helper scripts
|-- snippets/             # Reusable plain browser JavaScript snippets
`-- src/                  # Standalone .user.js userscript source files
```

Current examples:

- `src/example.user.js` is the minimal metadata and IIFE template.
- `src/codex-quota-compass.user.js` is a full standalone userscript with UI,
  styles, browser state, API calls, and reporting.
- `snippets/dom-ready.js` contains a small reusable DOM readiness helper.
- `scripts/check-userscripts.mjs` is the local lint script run by
  `npm run lint`.

---

## Module Organization

Put installable userscripts in `src/` and give each script a `.user.js`
suffix. A userscript file should target one site, page family, or feature
area. Keep the userscript metadata block at the top of the file and keep the
runtime code inside an IIFE with `'use strict'`.

Reusable snippets belong in `snippets/`. Because there is no bundler today,
snippets are reference material to copy or adapt into userscripts, not imports
from `src/*.user.js`.

Local development tools belong in `scripts/`. Tooling files use Node ESM, as
shown by `scripts/check-userscripts.mjs` and `"type": "module"` in
`package.json`.

Project notes and script template guidance belong in `docs/`. When rewriting
an existing script, record the source URL, original author, license, changed
behavior, and target site assumptions in the script header or under `docs/`.

---

## Naming Conventions

- Userscripts: `kebab-case.user.js`, for example
  `src/codex-quota-compass.user.js`.
- Snippets: `kebab-case.js`, for example `snippets/dom-ready.js`.
- Node tools: `kebab-case.mjs`, for example `scripts/check-userscripts.mjs`.
- Metadata fields are part of the install contract. At minimum, keep
  `@name`, `@namespace`, `@version`, `@description`, and `@match`.
- Use `@grant none` when no userscript manager API is required. Add specific
  grants only when code actually calls that API, as
  `src/codex-quota-compass.user.js` does for `GM_registerMenuCommand`.

## Renaming Userscripts

When renaming an installed userscript file, keep a bridge release at the old
path instead of deleting or moving it directly. Existing installations may only
know the old raw URL from their current `@updateURL`, so the old file must stay
valid long enough for the userscript manager to discover the new metadata.

Use this pattern:

```javascript
// Old installed file: src/old-name.user.js
// @version      <new version when the user explicitly requested an update>
// @downloadURL  https://raw.githubusercontent.com/<repo>/master/src/new-name.user.js
// @updateURL    https://raw.githubusercontent.com/<repo>/master/src/new-name.user.js
```

Add the new `src/new-name.user.js` with the full implementation. Keep persisted
storage keys stable unless the task explicitly includes a migration, because
renaming a file or UI title should not erase saved settings. Do not change
`@name` and `@namespace` in the same migration unless duplicate-script behavior
has been tested in the target userscript manager.

---

## Examples

Use `src/example.user.js` when creating a new script from scratch. Use
`src/codex-quota-compass.user.js` as the current reference for a complex
userscript that injects UI, stores browser-local UI state, calls page APIs,
and avoids exposing tokens in normal output.
