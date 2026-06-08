# Design

The parent task coordinates a sequence of independently verifiable architecture changes. It owns ordering, final integration checks, version bump, push, and archive. The child tasks own code changes.

## Task Map

1. `06-08-candidate-1-web-page-assistant-startup-module`: promote existing Web Page Assistant marker seams into script-scoped support modules.
2. `06-08-candidate-2-web-page-assistant-presentation-kit`: extract Web Page Assistant presentation responsibilities behind a deeper interface.
3. `06-08-candidate-3-codex-quota-compass-renderer-depth`: narrow Codex Quota Compass panel renderer by moving style/view responsibilities behind deeper modules.

## Integration Shape

All userscripts remain installable through metadata `@require` dependencies. New support modules stay beside their entrypoint under `src/userscripts/<script-id>/`. Tests should consume formal support modules where possible, not marker-sliced code blocks.

The final version bump is deliberately deferred until all child tasks are finished so each child commit stays focused on architecture work. The final integration commit may contain only version changes and Trellis parent archival metadata.

## Compatibility

No storage key migration is planned. Existing `@downloadURL`, `@updateURL`, and `@require` URLs must stay aligned with repository paths. The final `@version` bump handles user-visible update delivery after the implementation sequence.
