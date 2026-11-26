# Product Context

## Register

This project is a product UI workspace. Design and engineering choices should
serve task completion inside browser pages, not marketing presentation.

## Product Purpose

`custom-user-js-scripts` is a personal browser userscript workspace. It stores
standalone scripts that can be installed directly into Tampermonkey,
Violentmonkey, Greasemonkey, or similar userscript managers.

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
- Installed scripts do not load code at runtime. Runtime npm dependencies are
  bundled into the `dist/` installable by esbuild, never pulled in through
  `@require`; the bundle stays unminified so it remains auditable, and scripts
  do not depend on remote services.
- Do not treat userscript manager sync, `localStorage`, or exported JSON as a
  cloud source of truth.
- Do not bypass service-side permissions, login boundaries, paywalls, or access
  controls.

## Data Principles

- Keep persisted storage keys stable unless a task explicitly includes a data
  migration.
- Prefer userscript manager storage for long-lived userscript data, then fall
  back to page `localStorage` when manager storage is unavailable.
- Debug output must be opt-in and sanitized.

## Installability Principles

- A multi-module script is installed only from its generated
  `dist/<script-id>.user.js` bundle; its `@downloadURL` and `@updateURL` both
  point at that raw `master` path.
- `@name`, `@namespace`, and persisted storage keys are part of the installed
  script contract.

## Version Policy

- Use the maintainer's existing release decision for the task. If the release
  decision is missing, prepare and validate the changes on the task branch,
  then ask before landing on `master`. Script managers key update discovery
  and cache refresh on `@version`.
- Dependency updates from the weekly batch have a standing release decision;
  its rules are in fleet-state
  `docs/runbooks/versioning/dependency-weekly-upgrade.md`.
- Default each target `@version` to the next patch. A minor (the release adds
  a capability the user can notice) and a major (including `0.x` -> `1.0.0`)
  need the maintainer's confirmation first. Internal refactors, directory
  moves, and internal storage-format migrations that keep compatible reads are
  not breaking changes.
- Retiring a script takes two releases. First publish a final patch whose
  dist only tells installed users the script is no longer maintained. Then
  delete the entry and dist together and add `{namespace, name, lastVersion}`
  to `retired-userscripts.json`, where `lastVersion` is that published final
  version.
- Release steps (version plan, the gate, fast-forward of `master`)
  are in README.md "开发与验证". Fast-forwarding `master` is the external
  publication boundary, because raw `@downloadURL` / `@updateURL` endpoints
  read `master`.
- A userscript change may keep its version only when the user explicitly chose
  not to release it yet; installed copies then remain on the prior version.
  Once a bumped version reaches `master`, treat it as immutable and publish any
  correction under the next patch version.
- Do not use repository `package.json` version as a substitute for installable
  userscript versions.

## Maintenance Principles

- Keep script modules small enough to navigate. A single code file should
  ideally remain under 600 lines; complex scripts should deepen into
  script-scoped support modules instead of growing monolithic entrypoints.
- Preserve existing support-module boundaries when they already express real
  product responsibilities, such as settings, storage, runtime, presentation,
  shell, renderer, archive, and sync.
