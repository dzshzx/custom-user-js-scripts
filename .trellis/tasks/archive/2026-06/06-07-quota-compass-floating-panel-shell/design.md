# Design: Floating Panel Shell

## Module Shape

Create a named shell factory inside the standalone userscript. This keeps the script installable while concentrating panel mechanics in one module.

## Interface

`createFloatingPanelShell(options)` owns:

- DOM references for root, panel, button, status, and content.
- button position load/persist/apply.
- docking and viewport clamping.
- open/close/resize behavior.
- drag handling and outside-click close.
- root click dispatch to caller-provided action handlers.

The caller supplies initial markup, action handlers, status text, and render callbacks.

## Scope Control

This task should move mechanics, not redesign panel HTML or rewrite sync behavior.
