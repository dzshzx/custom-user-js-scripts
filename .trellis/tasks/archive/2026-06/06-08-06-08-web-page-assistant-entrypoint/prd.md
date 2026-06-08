# Hard cut Web Page Assistant install entrypoint

## Goal

Delete the wrong page-auto-refresh install source and enforce web-page-assistant as the only install entrypoint.

## Requirements

- Delete `src/page-auto-refresh-timer.user.js`; it is the wrong install source after the Web Page Assistant migration.
- Keep `src/web-page-assistant.user.js` as the only installable source for Web Page Assistant.
- Update repository docs that still imply `src/page-auto-refresh-timer.user.js` is a valid install source if any are found.
- Make `scripts/check-userscripts.mjs` fail if a future `.user.js` file duplicates another script's install identity or update/download target in a way that recreates the false entrypoint.
- Do not bump userscript `@version` as part of this child task.

## Acceptance Criteria

- [x] `src/page-auto-refresh-timer.user.js` is removed.
- [x] `npm run lint` rejects duplicate install aliases.
- [x] `npm run lint` passes on the resulting repository.
- [x] No `codex-quota-compass` files are modified.

## Notes

- Report candidate: "硬切换网页助手唯一安装入口".
- Validation: `npm test` passed 41 tests; `npm run lint` checked 4 userscript files.
