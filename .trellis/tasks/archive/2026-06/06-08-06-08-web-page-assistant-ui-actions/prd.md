# Separate Web Page Assistant UI shell and actions

## Goal

Move dialog and widget state shaping into a view-model style interface so UI rendering and action dispatch stop sharing DOM details.

## Requirements

- Separate UI state shaping from direct DOM rendering and root action dispatch.
- Preserve current visible behavior, labels, tab defaults, focus behavior, and actions.
- Keep the userscript standalone and browser-compatible.
- Add tests for the view-model seam if it is exposed in a library.
- Do not bump userscript `@version` as part of this child task.

## Acceptance Criteria

- [x] Dialog/widget render functions consume shaped state instead of duplicating settings reads and status formatting inline.
- [x] Root action dispatch uses a small action handler map or equivalent seam instead of a long linear conditional chain.
- [x] `npm test` and `npm run lint` pass.
- [x] No `codex-quota-compass` files are modified.

## Notes

- Report candidate: "把 UI 壳和动作分发切出接口".
- Validation: `npm test` passed 45 tests; `npm run lint` checked 4 userscript files; `node --check` passed for the userscript.
