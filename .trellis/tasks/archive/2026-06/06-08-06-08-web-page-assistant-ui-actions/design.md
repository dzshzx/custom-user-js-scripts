# Design

## View model seam

Introduce internal functions that produce dialog and widget state from:

- active refresh match;
- active unlocker match;
- selected scope;
- active tab;
- current page and site keys.

Rendering stays DOM-based, but it consumes the shaped state.

## Action dispatch seam

Replace the long `if (action === ...)` chain with a local action handler map. Each handler receives the action node and can call settings/timer/rendering interfaces.

This is still in-process; it does not introduce a framework or build step.
