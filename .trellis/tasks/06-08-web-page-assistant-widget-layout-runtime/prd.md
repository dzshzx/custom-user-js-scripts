# Web Page Assistant widget layout runtime

## Goal

Introduce a Widget Layout Runtime module so widget clamping, panel placement, drag lifecycle, expansion suppression, and position persistence are testable through one interface.

## Requirements

- Add a factory-shaped runtime in `src/web-page-assistant.user.js`.
- The runtime must own default position, clamping, panel CSS variable placement, drag lifecycle, expansion state, and persistence callback.
- Rendering should mount widget DOM and delegate layout/drag behavior to the runtime.
- Add Node tests using fake viewport, fake DOM rects, fake timer, fake storage callback, and fake pointer capture methods.

## Acceptance Criteria

- [ ] Widget layout runtime tests cover clamping, panel placement above/below, drag movement, persistence after drag, and expansion suppression reset.
- [ ] Existing Web Page Assistant tests pass.
- [ ] `npm run lint` passes.

## Notes

- Source report candidate: `candidate-widget-layout-runtime`.
