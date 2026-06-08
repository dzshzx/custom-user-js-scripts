# Deepen Web Page Assistant settings contract

## Goal

Consolidate settings normalization, scope resolution, storage, and mutations behind one internal settings interface.

## Requirements

- Consolidate Web Page Assistant settings handling behind one internal settings interface.
- Preserve the existing stored shape and legacy migration from top-level `pages` / `sites` into `refresh`.
- Preserve GM storage first, localStorage fallback second.
- Preserve current page-over-site priority for both refresh and unlocker settings.
- Add testable pure seams for normalization, scope resolution, and mutation behavior.
- Do not bump userscript `@version` as part of this child task.

## Acceptance Criteria

- [x] `src/web-page-assistant.user.js` uses a single settings module/interface for read/write/resolve/mutate paths.
- [x] Unit tests cover legacy normalization, page-over-site priority, invalid interval rejection, and unlocker action resolution.
- [x] `npm test` and `npm run lint` pass.
- [x] No `codex-quota-compass` files are modified.

## Notes

- Report candidate: "深化设置契约模块".
- Validation: `npm test` passed 45 tests; `npm run lint` checked 4 userscript files; `node --check` passed for the userscript and settings lib.
