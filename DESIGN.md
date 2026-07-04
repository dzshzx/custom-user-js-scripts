# Design Context

## Register

The repository uses a product UI register. Interfaces are browser-side tools
injected into existing pages. Design should be quiet, reliable, task-oriented,
and familiar.

The user opens a floating control or menu command while already working in a
host page, checks state or performs one action, then returns to the original
page. The interface should not feel like a landing page, a marketing card grid,
or an app trying to take over the host site.

## Design Principles

- Structure first, decoration second.
- Familiar controls are a feature: use normal buttons, inputs, radios,
  checkboxes, tabs, tables, and status messages.
- Keep the visual system restrained. State, selection, and primary actions earn
  accent color; inactive decoration does not.
- Injected UI should stay visually distinct from the host page while keeping
  its CSS scoped to the script root.
- Avoid layout surprises. Hover, focus, data refresh, and state changes should
  not cause large jumps.

## Typography

- Use a system UI font stack such as `system-ui, -apple-system, "Segoe UI",
  sans-serif`.
- Keep product UI type scales tight. Data labels, buttons, and table text need
  clarity more than dramatic hierarchy.
- Reserve large type for key values only when it helps scanning. Do not turn
  metrics into marketing hero blocks.
- Keep data text readable under narrow floating panel widths. Long values such
  as timestamps, Snapshot IDs, URLs, and hostnames need wrapping, truncation, or
  compact representation.

## Color

- Default to a restrained product palette: tinted neutral surfaces plus one
  primary accent.
- Avoid pure `#000` / `#fff`. Tint neutral surfaces slightly toward the primary
  hue so they do not read as harsh.
- Use the primary accent for selected tabs, focus rings, status dots, and
  primary actions.
- Use a separate low-saturation danger color for destructive actions.
- New UI color values should prefer `oklch()` when practical.
- Existing Codex Quota Compass styles currently use `--cqc-primary: #10a37f`
  and related CSS variables; treat those as the current token surface until a
  dedicated color-token migration is planned.
- Web Page Assistant already uses OKLCH-based `--part-*` tokens. Extend those
  tokens instead of creating unrelated one-off colors.

## Layout

- Floating controls and panels must stay inside the viewport at every saved or
  dragged position.
- Panels should use stable dimensions and measured natural height where
  possible. Avoid filling the viewport with empty content when the panel only
  has a small amount of data.
- Use stronger spacing between sections and tighter spacing inside related
  controls.
- Avoid nested cards. A bordered section, status box, option block, or table is
  acceptable; wrapping every element in another card is not.
- Modal-like dialogs are not the default answer. Prefer the existing floating
  widget, panel, or settings surface when it already fits the task.

## Responsive Behavior

- Responsive rules for floating panels should respond to the panel content
  width, not only the browser viewport.
- For Codex Quota Compass data views, compact list rendering is required when
  the panel is narrow, including desktop browsers where the viewport is wide
  but the floating panel is about 560px wide.
- Keep the viewport media query as a mobile fallback, but do not rely on it as
  the only narrow-layout trigger.
- Mobile and narrow-panel layouts must avoid horizontal table dependency for
  common data views.
- Buttons and form controls may wrap when needed, but labels must not collide
  with adjacent content.

## Codex Quota Compass UI

### Shell

- The floating button is draggable and can dock near the screen edge.
- The shell owns the floating button, panel header, refresh action, close
  action, status text, and content container.
- The content container is a CSS query container; renderer layout may use
  container queries to adapt to actual panel width.
- Panel open/close motion should communicate state and respect
  `prefers-reduced-motion`.

### Renderer

- The renderer owns metrics, tabs, section bodies, data views, loading state,
  error state, sync banners, archive actions, and compact rows.
- `createQuotaPanelRenderer` is the stable external renderer interface.
- `installStyles(document, rootId)` should remain the caller-facing style
  installer even if styles live in deeper support modules.
- Dynamic values rendered into HTML strings must be escaped.

### Data Views

- The default desktop table is acceptable only when the panel has enough width
  for its headers and values.
- When `data-compact="true"` and the content container is narrow, hide the
  table and show compact rows.
- Long columns should opt into truncation or wrapping through view-model column
  metadata.
- Empty states should explain absence of data without creating a large blank
  reading area.

## Web Page Assistant UI

- The floating widget shows countdown status and lightweight actions without
  forcing the user into settings.
- The settings dialog owns scope selection, refresh settings, unlocker
  capability toggles, status boxes, and destructive delete actions.
- Presentation responsibilities belong in presentation support modules:
  scoped styles, icons, dialog contract, widget markup, and dialog markup.
- Runtime state, storage, refresh timers, widget positioning, and unlocker
  behavior should stay outside presentation modules.
- Page and site scope labels must remain clear; users need to know whether a
  rule applies to the current URL or the whole hostname.

## Feishu Preview Image Export UI

- The installable surface is primarily a userscript menu command and browser
  alert/log feedback.
- Keep feedback direct and operational. This script should not introduce a
  persistent floating UI unless a future task proves it is needed.
- File names should be sanitized from the Feishu document title and remain
  understandable to the user.

## Components

- Use real `button type="button"` controls for clickable actions.
- Icon-only buttons must have `aria-label`.
- Decorative icons should be hidden from assistive technology with
  `aria-hidden="true"`.
- Tabs should preserve stable action IDs and selected state.
- Inputs, radios, checkboxes, and selects should keep native affordances.
- Express selected state through both the control and its container (for
  example `accent-color` plus a border or background change), not the control
  alone.
- Focus-visible state is required for keyboard access.
- Disabled state should be visually distinct and functionally disabled.

## Motion

- Most transitions should stay between 150ms and 250ms.
- Motion should express state changes: panel open/close, hover affordance,
  focus, loading, or reveal.
- Do not add decorative motion that delays the user.
- Respect `prefers-reduced-motion`.

## Banned Patterns

- No gradient text.
- No thick side-stripe card decoration.
- No glassmorphism as the default visual language.
- No repeated icon-plus-heading card grids to fill space.
- No standard action hidden behind custom non-button controls.
- No wide table forced into a narrow floating panel when compact rendering is
  available.
- No global CSS selectors that can style the host page unintentionally.
