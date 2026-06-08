# Web Page Assistant unlocker capability runtime

## Goal

Deepen the unlocker runtime so capability specs, event capture, selection style insertion, root exclusion, and uninstall cleanup are verified through one interface.

## Requirements

- Keep current behavior for selection, copy/cut, context menu, drag start, and beforeunload suppression.
- The runtime must own capability specs and status labels so callers do not duplicate ability knowledge.
- Use adapters for `document`, `window`, root containment, style insertion/removal, and event handling.
- Add Node tests using fake targets and fake style registry.

## Acceptance Criteria

- [ ] Unlocker runtime tests cover capability listener registration, root-contained event exclusion, beforeunload suppression, style insertion/removal, and uninstall cleanup.
- [ ] Existing Web Page Assistant tests pass.
- [ ] `npm run lint` passes.

## Notes

- Source report candidate: `candidate-unlocker-capability-runtime`.
