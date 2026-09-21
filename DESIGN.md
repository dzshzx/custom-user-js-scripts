# Design Context

## Register

The repository uses a product UI register. Interfaces are browser-side tools
that live on top of existing sites. Design should be quiet, reliable,
task-oriented, and familiar.

There are two surface categories:

- **Companion UI**: floating controls, panels, and menu commands that live
  inside a host page. The user opens one while already working in the host
  page, checks state or performs one action, then returns to the original
  page. It should not feel like a landing page, a marketing card grid, or an
  app trying to take over the host site.
- **Script-owned pages**: standalone pages fully rendered by the script (for
  example the JavDB archive page at `/recommend-archive`). There is no host
  layout to protect, so familiarity means mirroring the host site's own look
  rather than inventing a separate product theme.

Most rules in this document target companion UI; the per-script sections call
out where script-owned pages differ.

## Design Principles

- Structure first, decoration second.
- Familiar controls are a feature: use normal buttons, inputs, radios,
  checkboxes, tabs, tables, and status messages.
- Keep the visual system restrained. State, selection, and primary actions earn
  accent color; inactive decoration does not.
- Companion UI should stay visually distinct from the host page while keeping
  its CSS scoped to the script root. Script-owned pages may instead adopt the
  host site's native styling; script-owned structural CSS is still scoped
  under the script root.
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
- Codex Quota Compass bridges its `--cqc-*` variables onto the shared widget
  kit tokens (`--wk-*` from `src/userscripts/shared/`, themed via
  `[data-wk-theme]`); extend the kit tokens or the per-theme overrides in its
  shell styles instead of adding new one-off colors.
- Web Page Assistant bridges its `--part-*` variables onto the shared widget
  kit tokens (`--wk-*`, themed via `[data-wk-theme]` resolved from
  `prefers-color-scheme`); extend the kit tokens instead of adding new one-off
  colors.

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

## Shared Widget Kit

- Floating companion UI is built on the shared kit in `src/userscripts/shared/`
  instead of per-script shell code: `shared-widget-shell.lib.js` owns the
  draggable/dockable floating button, panel positioning, position persistence,
  Esc close, focus hand-off, and outside-click close.
- Color, type scale, radius, shadow, and focus-ring tokens come from
  `shared-tokens.lib.js` (`--wk-*`); each script passes only its accent color.
  Dark mode resolves through `resolveTheme`/`applyTheme` (host detection first,
  `prefers-color-scheme` fallback) and applies via `[data-wk-theme]` on the
  script root, not per-script media queries.
- Icons come from `shared-icons.lib.js` (vendored Lucide SVG paths).
- In-page feedback goes through `shared-toast.lib.js`.
- Extend the kit when a script needs a capability it lacks; keep per-script
  styles limited to domain presentation.

## Codex Quota Compass UI

### Shell

- The floating button is draggable and can dock near the screen edge.
- The shell is a thin adapter over the shared widget kit
  (`src/userscripts/shared/`); drag/dock, position persistence, Esc close, and
  focus hand-off come from the kit.
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
- The widget is always rendered: with no active refresh rule it stays as a
  dimmed idle dot whose panel explains the idle state and offers the settings
  entry; its collapsed button opens the dialog directly.
- The per-second countdown is `aria-hidden`; a visually-hidden status node
  announces only lifecycle changes (enabled/paused/resumed/disabled) as full
  sentences.
- Hover expansion carries a short intent delay; coarse pointers toggle
  expansion by clicking the widget button instead.
- The settings dialog owns scope selection, refresh settings, unlocker
  capability toggles, status boxes, and destructive delete actions.
- The dialog behaves as a true modal: focus trap, Esc close, inert page
  background while open, and focus returned to the trigger on close. Full
  rebuilds (tab/scope/save) preserve the panel scroll offset and the focused
  control.
- Write actions disable their button with a pending label while storage is in
  flight; failures restore the button and surface the error reason in the
  dialog message line.
- Presentation responsibilities belong in presentation support modules:
  scoped styles, icons, dialog contract, widget markup, and dialog markup.
  Icons come from the shared `shared-icons` module (vendored Lucide).
- Runtime state, storage, refresh timers, widget positioning, and unlocker
  behavior should stay outside presentation modules.
- Page and site scope labels must remain clear; users need to know whether a
  rule applies to the current URL or the whole hostname.

## Feishu Preview Image Export UI

- The installable surface is a userscript menu command plus transient in-page
  toast feedback (shared-kit toaster on a script-owned root); no alert() and no
  persistent floating UI.
- Keep feedback direct and operational: progress while fetching, the exported
  file name on success, and a concrete Chinese failure reason on error (raw
  internal errors stay in the console).
- File names should be sanitized from the Feishu document title and remain
  understandable to the user.

## JavDB Recommend Archive UI

- The surface is a quiet navbar entry on JavDB pages plus a script-owned archive page rendered at `/recommend-archive`; no floating panel.
- The archive page mirrors the site's native look through the Site Chrome module: deploy-fingerprinted stylesheet URLs and navigation come from the live homepage, resolve against its response/base URL, and stay inactive until every screen-applicable stylesheet loads within one 12-second deadline. Native mode requires computed navigation, button, and box styles; any missing, failed, timed-out, or ineffective resource is removed before the complete readable fallback remains active. The style probe lives outside the archive root, is non-interactive, and never uses `.movie-list`.
- Script-owned styles stay scoped under `.jdb-ra` and own only what the site CSS does not cover: toolbar, period section headers, grid column count, and uncropped covers. Once a card or list carries an external enhancement marker, its observable cover mode and inline layout win over the archive defaults.
- When another userscript decorates a native-style movie grid, the archive treats that grid's effective column count, gaps, and cover mode as the compatibility seam and applies them only to undecorated later period grids. Copied inline values are individually owned and released if that grid is later decorated, without changing values the other script wrote. Compatibility is verified against Tampermonkey and `JAV老司机-新` 2.8.4.8 DOM markers; the archive does not call that script's private functions.
- Browsing is one scrollable stream of period sections (newest first) that auto-loads older periods via a sentinel. Navigation appends the adjacent next section when it matches the stream cursor; distant or reverse navigation re-anchors the stream at the target period so intermediate periods are neither fetched nor rendered.
- Catalog refresh is prefix-incremental: scan newest pages until the first cached overlap, prefer remote metadata for the scanned prefix, and retain the cached immutable tail. A periodic full refresh bounds drift.
- Navigation payloads and the full-search index are separate caches. Search index admission must not evict browsing payloads; detail transport remains single-flight per period and uses consumer leases so cancellation only aborts a request after its last consumer releases it.
- Full-archive search renders each matching Period exactly once as it arrives. Browse and search share the Period Section module: metadata is inserted as text, filtering uses archive-owned markers, and a loading section keeps the same `section` and `.movie-list` nodes after data arrives. Identical payloads keep externally attached card controls and listeners. Off-screen Period sections may use browser-native rendering containment, but DOM order and externally decorated movie grids remain stable for multi-userscript compatibility.
- Movie cards reuse the site's native `movie-list` markup and link directly to the site's `/v/<id>` detail pages. Covers are landscape and must render uncropped (`contain`); release dates share the restrained metadata row with scores instead of adding another card section.
- All glyphs are inline Lucide SVGs (vendored from `src/userscripts/shared/shared-icons.lib.js` into the presentation module and bundled into the installation file); never emoji. Buttons keep icon plus text.
- The search box is disambiguated by a segmented control (loaded stream vs. all periods): the loaded segment filters instantly on input, the all-periods segment runs the stoppable full-archive search from an explicit submit (Enter or the search button).
- Period sections render gray skeleton cards at the native card aspect ratio (`padding-top: 67%`) while loading, swapped wholesale when data arrives; a failed cover image yields a labelled placeholder box instead of a hidden hole.
- On narrow viewports (<769px) the sticky toolbar becomes two fixed rows (period navigation, then search and actions), with anchor scroll margins recalculated to match.
- Site Chrome startup is idempotent and independent from Catalog loading. It reuses existing navigation, owns its hamburger listeners and injected resources, preserves an existing or late-selected theme, and cannot re-enable native mode after archive disposal.

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
- No native `alert()` / `confirm()` for in-page feedback; use the kit toast.
- No emoji, icon fonts, or CSS-drawn icons in script UI; use the kit's
  vendored Lucide set.
