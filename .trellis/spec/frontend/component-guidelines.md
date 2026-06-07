# Component Guidelines

> DOM UI patterns for standalone browser userscripts.

---

## Overview

There is no framework component layer in this repository. Userscript UI is
plain DOM plus injected CSS. Treat "components" as small rendering and setup
functions inside a `.user.js` file.

The current reference is `src/codex-quota-compass.user.js`, which builds a
floating button, panel, metric cards, tables, loading state, and error state
without React or a build step.

---

## DOM UI Structure

Use one stable root element per injected UI. The current pattern is:

- `ROOT_ID` constant for the root DOM id.
- `createUi()` returns early if the root already exists.
- `installStyles()` injects one `<style>` element and returns early if it
  already exists.
- DOM references such as `root`, `panel`, `button`, `statusNode`, and
  `contentNode` are kept in module scope inside the IIFE.

When rendering dynamic HTML strings, escape dynamic values. The current helper
is `escapeHtml(value)` in `src/codex-quota-compass.user.js`. Prefer
`textContent` for simple text updates, as `setStatus(text, tone)` does.

---

## Composition Patterns

Keep rendering helpers small and named after the UI they produce. Current
examples include:

- `metricHtml(label, value, hint)` for summary cards.
- `tableHtml(rows, options)` for detail tables.
- `sectionHtml(title, body)` for grouped detail sections.
- `renderLoading()`, `renderError(error)`, and `renderResult(result)` for
  major UI states.

Avoid coupling UI helpers to network calls. Fetch and calculation code should
return plain data; rendering functions should consume that data.

---

## Styling Patterns

Styles are injected from JavaScript because userscripts need to be
self-contained. Follow the current pattern:

- Prefix classes for the script, for example `cqc-*`.
- Scope selectors to the root id when possible.
- Use `box-sizing: border-box` within the root.
- Include responsive rules for small viewports when layout can overflow.
- Include dark mode only when the UI is visible enough to need it.
- Keep dimensions stable for fixed UI controls like floating buttons and
  panels.
- Floating controls and their attached panels must stay inside the viewport at
  every position. For draggable controls, clamp the saved button position on
  load, drag end, and resize. If an attached panel is wider or taller than its
  trigger, calculate the panel anchor dynamically so it shifts away from the
  nearest edge instead of clipping off-screen.

Do not add global CSS selectors that can alter the host page.

---

## Accessibility

Use real buttons for clickable controls and always set `type="button"`.
Add `aria-label` when a button is icon-only or the visible text is not
sufficient. Mark decorative elements with `aria-hidden="true"`.

UI controls must not use visible text characters as icons or visual component
parts. Icon-only buttons, status glyphs, tool icons, close icons, refresh
icons, arrows, and settings icons must be rendered with SVG, CSS
pseudo-elements, images, or an established icon library. Text content is only
appropriate when it is actual user-facing label or copy. Keep decorative icon
markup hidden from assistive technology and keep the accessible name on the
control via `aria-label` when needed.

For standalone userscripts without a build step, prefer vendoring only the
individual SVG paths needed from an established open-source icon library
instead of importing npm packages or loading a full icon runtime for one or two
icons. Keep a source and license comment near the icon constants.

The current reference has:

- A floating button with `aria-label="Open Codex quota compass"`.
- A close icon button with `aria-label="Close"`.
- Decorative dot and close icon spans marked `aria-hidden="true"`.
- A hidden panel using the native `hidden` attribute.

---

## Common Mistakes

- Injecting UI more than once on SPA pages. Always check for the root id.
- Writing raw API values into `innerHTML` without escaping.
- Adding CSS class names that can collide with the host page.
- Using anchor tags or generic divs for button behavior.
- Storing sensitive data in DOM attributes, localStorage, or visible debug
  output.
