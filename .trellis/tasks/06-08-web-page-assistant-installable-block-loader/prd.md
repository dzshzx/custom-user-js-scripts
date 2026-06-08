# Web Page Assistant installable block loader

## Goal

Create a shared test helper for extracting marked factory blocks from the installable userscript so marker lookup, VM wrapping, and missing-marker failures stop being duplicated across Web Page Assistant tests.

## Requirements

- Add a test helper module under `test/`.
- Replace repeated marker extraction logic in current Web Page Assistant tests.
- Preserve the tests' ability to execute installable blocks directly from `src/web-page-assistant.user.js`.
- Keep error messages explicit when marker start/end are missing or out of order.

## Acceptance Criteria

- [ ] Existing marker-based Web Page Assistant tests use the shared loader.
- [ ] No behavior-only test coverage is removed.
- [ ] Web Page Assistant tests pass.
- [ ] `npm run lint` passes.

## Notes

- Source report candidate: `candidate-installable-loader`.
