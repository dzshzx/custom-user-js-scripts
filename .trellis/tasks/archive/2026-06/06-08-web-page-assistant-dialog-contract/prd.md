# Web Page Assistant dialog contract

## Goal

Move dialog tabs, role selectors, form reading, and dialog view-model shaping behind a content contract.

## Requirements

- Introduce `createPageAssistantDialogContract`.
- The contract must own role names, tab normalization, selector construction, default focus role, dialog view-model shaping, and unlocker form reading.
- Rendering should consume the contract instead of repeating selector strings across rendering and action code.
- Add tests for view-model shaping and form-intent reading.

## Acceptance Criteria

- [ ] Dialog role and tab rules are centralized.
- [ ] Existing refresh and unlocker dialog behavior is preserved.
- [ ] `npm test -- test/web-page-assistant-dialog-contract.test.mjs` passes.
- [ ] `npm run lint` passes.

## Notes

- Report candidate: `#candidate-dialog-contract`.
