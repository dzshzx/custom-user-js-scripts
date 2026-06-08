# Implementation Plan

1. Read current widget position, panel positioning, expansion, and drag code.
2. Add a marked runtime factory block.
3. Move layout and drag implementation into the runtime.
4. Update `renderWidget` and resize listener to call the runtime.
5. Add `test/web-page-assistant-widget-layout-runtime.test.mjs`.
6. Run widget layout target test plus existing Web Page Assistant tests.
7. Run `npm run lint`.
