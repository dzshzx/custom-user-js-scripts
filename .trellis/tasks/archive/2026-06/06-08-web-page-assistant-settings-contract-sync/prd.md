# Web Page Assistant settings contract sync

## Goal

Make the settings contract in the installable Web Page Assistant userscript verifiably equivalent to the testable settings library.

## Requirements

- Preserve standalone install behavior for `src/web-page-assistant.user.js`.
- Keep `src/web-page-assistant-settings.lib.js` as the Node-testable contract surface.
- Add a deterministic equivalence test that exercises the installable contract block and the library contract through the same behavior cases.
- Keep settings normalization, page-before-site resolution, refresh mutations, unlocker mutations, and default unlocker options covered.
- Avoid creating another unchecked source of truth.

## Acceptance Criteria

- [ ] Tests fail if the installable settings contract drifts from the library contract.
- [ ] Existing `test/web-page-assistant-settings.test.mjs` behavior remains covered.
- [ ] `npm test -- test/web-page-assistant-settings.test.mjs` passes.
- [ ] `npm run lint` passes.

## Notes

- Report candidate: `#candidate-settings-sync`.
