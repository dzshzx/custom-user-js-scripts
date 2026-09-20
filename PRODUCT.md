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

This section states each script's product boundary only. Per-script
behaviour, menu commands, cache/TTL details, and storage-key inventories are
owned by `docs/scripts/installable-userscripts.md`; vocabulary by `CONTEXT.md`.

### Web Page Assistant

Runs on `*://*/*`.

It provides a page-level assistant for automatic refresh and optional unlocking
of page restrictions. Users can configure refresh rules for the current page or
the whole site, view a countdown in a floating widget that stays on the page
(collapsed and dimmed when no rule is active), pause or resume refresh, and
selectively allow text selection, copy/cut, context menu, drag, and
beforeunload suppression.

Persistent settings prefer userscript manager storage and fall back to page
`localStorage` when manager storage is unavailable.

### Codex Quota Compass

Runs on `https://chatgpt.com/*`.

It shows Codex limit windows, daily usage, weekly estimates, model summaries,
available rate-limit reset credits, and local history. Each
successful run creates a sanitized `Quota Snapshot`. Settled daily costs are
stored in the `Cost Ledger` and drive the day, rolling-week, month, and
all-time statistics views. Snapshots are stored in a local `Snapshot Archive`,
which can be exported and imported as versioned JSON for backup or manual
cross-device transfer, or synchronized through a user-owned GitHub Gist.

The archive stores organized quota data, not cookies, tokens, authorization
headers, or raw private API responses.

### Feishu Preview Image Export

Runs on `https://mi.feishu.cn/file/*`.

It finds the largest visible image in a Feishu file preview page and downloads
it through the userscript menu. It is meant for pages where the preview image is
visible but the original image entry is awkward to access.

Local browser helpers support QR login-state capture and scripted Feishu image
export, but the installable userscript remains browser-side.

### JavDB Recommend Archive

Runs on `https://javdb.com/*` and the three mirror hosts listed in its
`@match` block (`www.javdb.com`, `javdb575.com`, `javdb.today`); other mirrors
are not matched.

It adds a quiet navbar entry on normal pages and renders a script-owned archive
page at `/recommend-archive` for browsing every historical period of the site's
"Recommend" section: one scrollable period stream (newest first, auto-loading
older periods), adjacent or distant period navigation, movie cards that link
directly to the site's `/v/<id>` detail pages, instant filtering of loaded
content, and a stoppable full-archive keyword search. Data comes from the
site's own same-origin recommend APIs with a built-in `jdsignature` header; the
script needs no login and declares `@grant none`. It persists in page
`localStorage` only: the last-viewed period, a versioned period catalog cache,
per-period navigation payload caches, and compact search indexes (TTLs and
sizes are listed in `docs/scripts/installable-userscripts.md`).

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
- Installed scripts stay free of runtime dependencies. The build step exists
  only to bundle multi-module scripts into single-file installables; it must
  not introduce runtime packages, remote services, or minified output that
  defeats auditability.
- Do not treat userscript manager sync, `localStorage`, or exported JSON as a
  cloud source of truth.
- Do not bypass service-side permissions, login boundaries, paywalls, or access
  controls.

## Data Principles

- Keep persisted storage keys stable unless a task explicitly includes a data
  migration.
- Prefer userscript manager storage for long-lived userscript data, then fall
  back to page `localStorage` when manager storage is unavailable.
- Codex Quota Compass mirrors its sanitized `Snapshot Archive` to page
  `localStorage` and merges that mirror back on read. Gist settings and tokens
  remain GM-storage-only and are never mirrored to page storage.
- Export only versioned, sanitized documents. Codex Quota Compass exports
  `Snapshot Export` JSON, not raw private payloads.
- Imports use validation, deduplication, and merge semantics. They should not
  blindly overwrite a complete local archive.
- Debug output must be opt-in and sanitized.

## Installability Principles

- Multi-module scripts install from `dist/<script-id>.user.js`, a committed
  esbuild bundle generated by `npm run build`. Their sources live under
  `src/userscripts/<script-id>/` as an ESM entry (`<script-id>.entry.js`,
  which owns the metadata block) plus `*.lib.js` ES modules.
- Single-file scripts without support modules stay directly installable from
  `src/userscripts/<script-id>/<script-id>.user.js`.
- The legacy `src/.../<script-id>.user.js` path of a bundled script holds a
  generated byte-identical copy of the dist bundle: script managers may
  install from whichever download URL they hold, so both paths must serve
  the full working script. Previously installed copies pick up updates from
  the legacy path and carry dist-pointing metadata forward.
- `@downloadURL` and `@updateURL` must stay aligned with repository paths;
  bundled entries must not declare `@require`.
- `@name`, `@namespace`, and persisted storage keys are part of the installed
  script contract.

## Version Policy

- Use the user's existing release decision for the task. An explicit request to
  release authorizes only the exact next patch `@version` bump and candidate
  preparation. Every minor or major bump, skipped patch number, or other
  non-patch transition needs explicit approval for that complete version plan.
  If the release decision is missing, prepare and validate the changes on the
  task branch, then ask before pushing the candidate. Script managers key update
  discovery and cache refresh on `@version`.
- Before changing versions, refresh the baseline with `git fetch origin master`,
  then run `node scripts/version-plan.mjs plan`, adding one quoted
  `--target '<install identity>=<version>'` for each proposed change. The
  override is read-only: it compares the proposal for every installable script
  with the refreshed versions on `origin/master`, includes unchanged scripts,
  and prints a canonical plan plus its SHA-256 summary without editing metadata.
  An unknown or duplicate override, a new script without a published baseline,
  a missing script, invalid metadata, a downgrade, an orphan dist installable,
  or mismatched entry/bridge/dist versions stops the release instead of
  accepting a confirmation.
- For an approved non-patch plan, record exactly one
  `Version-Approval: sha256:...` trailer on the candidate commit and pass the
  same summary to `scripts/candidate.sh --confirmed-version-plan sha256:...`.
  The summary is a consistency check for the approved repository, baselines,
  and complete target set; it is not an identity or authentication mechanism.
  After approval, change metadata and rebuild; the execution check reads only
  those actual committed files. Any baseline or target change requires a new
  plan and approval.
- A releasing version bump belongs on the task branch before it is pushed as a
  `candidate/**` branch (`scripts/candidate.sh`). CI runs on the candidate and
  `promote.yml` fast-forwards `master` to that exact green commit; because raw
  `@downloadURL` / `@updateURL` endpoints read `master`, that promotion is the
  external publication boundary. The `master` ruleset refuses any sha without a
  green `verify` check, so there is no push-first-then-see path. Immediately
  before the fast-forward, the trusted workflow from `master` fetches the current
  baseline and independently rechecks the candidate tree and approval trailer.
- A userscript change may keep its version only when the user explicitly chose
  not to release it yet; installed copies then remain on the prior version.
  Once a bumped version reaches `master`, treat it as immutable and publish any
  correction under the next patch version.
- The version lives in the entry metadata block; `npm run build` propagates it
  to the dist bundle and the byte-identical bridge file, and fails if an internal
  `SCRIPT_VERSION` constant disagrees with `@version`.
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
