# Extract Codex Quota runtime port

## Goal

Move ChatGPT runtime concerns out of the main userscript and behind a small runtime interface.

## Requirements

- Preserve the existing behavior of `runCompass()`: host check, session token discovery, authenticated usage requests, 401 guidance, daily usage query construction, and quota calculation.
- Add a runtime module that can be tested with injected fetch and location adapters.
- Keep token and raw private response handling sanitized: no token logging, no raw usage response logging in normal mode.
- Keep the main userscript responsible only for invoking the runtime and rendering/saving results.

## Acceptance Criteria

- [x] Runtime module exposes a small interface for running one quota calculation.
- [x] Main userscript no longer embeds token discovery and authenticated request implementation directly in `runCompass()`.
- [x] Tests cover successful runtime calculation and 401 error behavior through injected adapters.
- [x] `npm test` passes for the child.

## Notes

- Candidate source: "把运行端口从主 userscript 抽出".
- Validation: `npm test` passed with 20 tests; `npm run lint` passed.
