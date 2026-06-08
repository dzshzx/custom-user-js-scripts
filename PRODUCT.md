# Product Context

## Register

This project is a product UI workspace. Design and engineering choices should
serve task completion inside browser pages, not marketing presentation.

## Product Purpose

`custom-user-js-scripts` is a personal browser userscript workspace. It stores
standalone scripts that can be installed directly into Tampermonkey,
Violentmonkey, Greasemonkey, or similar userscript managers, plus small local
tools that support those scripts.

The product value is practical browser-side automation: small tools that run in
the current page, keep user data local, and avoid custom backend dependencies
unless a task explicitly introduces one.

## Primary Users

- The repository maintainer, who installs and iterates these scripts in a local
  browser workflow.
- Technical users who are comfortable installing `.user.js` files and checking
  userscript manager `@match` / `@grant` prompts.
- Future agents working in the repository, who need stable product boundaries
  before changing scripts, UI, storage, or documentation.

## Current Product Surfaces

### Web Page Assistant

Runs on `*://*/*`.

It provides a page-level assistant for automatic refresh and optional unlocking
of page restrictions. Users can configure refresh rules for the current page or
the whole site, view a countdown in a floating widget, pause or resume refresh,
and selectively allow text selection, copy/cut, context menu, drag, and
beforeunload suppression.

Persistent settings prefer userscript manager storage and fall back to page
`localStorage` when manager storage is unavailable.

### Codex Quota Compass

Runs on `https://chatgpt.com/*`.

It shows Codex quota windows, daily usage, client summaries, weekly estimates,
and local history. Each successful run creates a sanitized `Quota Snapshot`.
Snapshots are stored in a local `Snapshot Archive`, which can be exported and
imported as versioned JSON for backup or manual cross-device transfer.

The archive stores organized quota data, not cookies, tokens, authorization
headers, or raw private API responses.

### Feishu Preview Image Export

Runs on `https://mi.feishu.cn/file/*`.

It finds the largest visible image in a Feishu file preview page and downloads
it through the userscript menu. It is meant for pages where the preview image is
visible but the original image entry is awkward to access.

Local Feishu Playwright helpers support login-state capture and scripted image
export, but the installable userscript remains browser-side.

## Core Jobs

- Let users complete small browser-page tasks without leaving the current page.
- Keep installed scripts self-contained and directly installable.
- Preserve local configuration and history across script updates.
- Make script paths, metadata, update URLs, and support modules easy to audit.
- Keep sensitive account data out of DOM, logs, storage exports, and repository
  files.

## Non-Goals

- This is not a browser extension project.
- This is not a SaaS app, hosted dashboard, or public web product.
- This is not a bundled frontend application; do not introduce a build step as
  a default assumption.
- Do not treat userscript manager sync, `localStorage`, or exported JSON as a
  cloud source of truth.
- Do not bypass service-side permissions, login boundaries, paywalls, or access
  controls.

## Data Principles

- Keep persisted storage keys stable unless a task explicitly includes a data
  migration.
- Prefer userscript manager storage for long-lived userscript data, then fall
  back to page `localStorage` when manager storage is unavailable.
- Export only versioned, sanitized documents. Codex Quota Compass exports
  `Snapshot Export` JSON, not raw private payloads.
- Imports use validation, deduplication, and merge semantics. They should not
  blindly overwrite a complete local archive.
- Debug output must be opt-in and sanitized.

## Installability Principles

- Installable entrypoints live under `src/userscripts/<script-id>/` and use the
  `.user.js` suffix.
- Same-script support modules live next to the entrypoint as `*.lib.js`.
- Entrypoints that depend on support modules declare raw GitHub `@require` URLs.
- `@downloadURL`, `@updateURL`, and `@require` must stay aligned with repository
  paths.
- `@name`, `@namespace`, and persisted storage keys are part of the installed
  script contract.

## Version Policy

- Do not bump userscript `@version` for ordinary feature, UI, or bug-fix
  changes unless the user explicitly asks for a version update.
- When the user explicitly requests a version bump, increment the relevant
  installable userscript version.
- If a script also exposes an internal `SCRIPT_VERSION`, keep it synchronized
  with the metadata `@version`.
- Do not use repository `package.json` version as a substitute for installable
  userscript versions.

## Maintenance Principles

- Keep script modules small enough to navigate. A single code file should
  ideally remain under 600 lines; complex scripts should deepen into
  script-scoped support modules instead of growing monolithic entrypoints.
- Preserve existing support-module boundaries when they already express real
  product responsibilities, such as settings, storage, runtime, presentation,
  shell, renderer, archive, and sync.
- Use `npm run lint` to verify installable userscript metadata.
- Use `npm test` when changes touch shared behavior, storage contracts,
  renderer output, archive logic, or runtime flow.
