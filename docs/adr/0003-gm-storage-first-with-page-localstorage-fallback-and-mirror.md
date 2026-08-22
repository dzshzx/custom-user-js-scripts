# Userscript state lives in manager storage first, with page localStorage as fallback and (for the quota archive) as a mirror

- Status: accepted
- Date: 2026-05-30 (archive foundation 347e124) / 2026-06-08 (storage port f0e54a6); mirror semantics clarified 2026-08-05 (7f17395); recorded 2026-08-23
- Related: PRODUCT.md "Data Principles", README.md (Codex Quota Compass 注意事项), docs/scripts/codex-quota-gist-sync.md, CONTEXT.md (Snapshot Archive, Gist Sync)

## Context

Script-manager storage (`GM_getValue` / `GM.*`) survives page data clearing and
is invisible to page scripts, but some managers or grant configurations do not
expose it. Page `localStorage` is always available but readable by the host
page and any other script on it. The Codex Quota Compass archive is valuable
user history; its GitHub token is a credential.

## Decision

1. Long-lived userscript data prefers manager storage and falls back to page
   `localStorage` when manager storage is unavailable. Storage keys are part of
   the installed-script contract and change only with an explicit migration.
2. The Codex Quota Compass `Snapshot Archive` is written to manager storage and
   mirrored to page `localStorage`; reads merge both and migrate the mirror
   into manager storage. The mirror keeps history reachable when the manager
   API is missing or changes, and lets the export/import path work everywhere.
3. Gist Sync settings and the GitHub token are stored in manager storage only —
   never mirrored, never written to page storage. Without manager storage the
   sync feature fails closed with a visible error.
4. JavDB Recommend Archive is `@grant none` by design (no privileged API) and
   keeps its caches in page `localStorage` only — the fallback rule applied from
   the start, not an exception to it.

## Consequences

- Two copies of the archive exist on disk; the mirror is non-sensitive by
  construction (sanitized aggregates, no cookies/tokens/raw responses).
- Tests pin the contract: prefer-GM, fallback read, merge, mirror write, and
  the token never appearing in page storage or in public status objects.
