# Userscript state lives in manager storage first, with page localStorage as fallback

- Status: accepted
- Date: 2026-05-30 (archive foundation 347e124) / 2026-06-08 (storage port f0e54a6)
- Related: PRODUCT.md "Data Principles", `src/userscripts/shared/shared-gm-json-store.lib.ts`

## Context

Script-manager storage (`GM_getValue` / `GM.*`) survives page data clearing and
is invisible to page scripts, but some managers or grant configurations do not
expose it. Page `localStorage` is always available but readable by the host
page and any other script on it.

## Decision

1. Long-lived userscript data prefers manager storage and falls back to page
   `localStorage` when manager storage is unavailable. Storage keys are part of
   the installed-script contract and change only with an explicit migration.
2. JavDB Recommend Archive is `@grant none` by design (no privileged API) and
   keeps its caches in page-origin storage only — the fallback rule applied from
   the start, not an exception to it. Catalog and search indexes stay in page
   `localStorage`; per-period detail entries live in page-origin IndexedDB,
   which is equally visible to the host page. The old `localStorage` details
   document is removed on startup.

## Consequences

- Tests pin the contract: prefer-GM and fallback read.

## Amendments

- 2026-08-05: the migration write refreshes the mirror, so both copies hold the merged archive (7f17395).
- 2026-09-29: JavDB per-period details moved from page `localStorage` to page-origin IndexedDB.
- 2026-11-05: Codex Quota Compass was retired (72420aa); its archive mirror and Gist-token rules went with it.
