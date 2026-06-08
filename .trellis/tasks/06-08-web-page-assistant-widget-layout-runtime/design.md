# Design

## Runtime interface

Add `createWidgetLayoutRuntime(adapters)` with methods such as:

- `attach(widgetNode, buttonNode, initialPosition)`
- `applyPosition(position)`
- `positionPanel()`
- `setExpanded(isExpanded)`
- `getPosition()`
- `detach()`

The runtime may also return event handlers internally installed by `attach`.

## Adapters

Production supplies viewport dimensions, storage write callback, `setTimeout`, layout constants, logger, and position normalizer.

Tests supply fake widget/button/panel nodes and fake viewport dimensions.

## Compatibility

No saved position schema changes. Existing `normalizeWidgetPosition` semantics stay intact.
