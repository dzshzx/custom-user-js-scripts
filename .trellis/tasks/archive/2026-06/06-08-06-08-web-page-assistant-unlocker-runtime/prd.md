# Create Web Page Assistant unlocker runtime

## Goal

Represent unlocker capabilities as a runtime with adapters and cleanup locality.

## Requirements

- Represent unlocker behavior as capability runtime logic rather than scattered event/style installers.
- Preserve current capability defaults and behavior: selection, copy/cut, context menu, dragstart, and beforeunload.
- Keep cleanup locality so reinstalling settings removes prior listeners and styles.
- Add tests for capability selection and adapter cleanup where feasible.
- Do not bump userscript `@version` as part of this child task.

## Acceptance Criteria

- [x] Unlocker install/uninstall flows go through one runtime-shaped interface.
- [x] Event and style cleanup remains centralized.
- [x] `npm test` and `npm run lint` pass.
- [x] No `codex-quota-compass` files are modified.

## Notes

- Report candidate: "把限制解除做成能力运行时".
- Validation: `npm test` passed 45 tests; `npm run lint` checked 4 userscript files; `node --check` passed for the userscript.
- The runtime remains internal to the standalone userscript, so no separate runtime test seam was exposed in this child task.
