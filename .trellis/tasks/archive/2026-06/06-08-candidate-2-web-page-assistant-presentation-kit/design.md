# Design

The presentation kit deepens Web Page Assistant UI code. The entrypoint should not own long CSS strings, full dialog markup, or role selector knowledge.

## Module Shape

Create a script-scoped presentation module such as `web-page-assistant-presentation.lib.js`. It should attach a global library with factories/helpers for:

- Dialog contract creation.
- Scoped style installation.
- Widget rendering.
- Dialog rendering.

The exact split may be one cohesive module or small companion modules if that keeps interfaces smaller. Avoid introducing a build step.

## Entry Interface

The entrypoint passes current state and adapters into the presentation interface. It keeps ownership of runtime state, action dispatch, and storage.

## Compatibility

The markup and class names remain stable unless tests prove the behavior is preserved. Existing role names and action ids should stay stable so child 1 session dispatch remains compatible.
