# Browser Userscript Workspace

This repository contains standalone browser userscripts and small local tools
that support them. This glossary is the shared language for all three
installable scripts and for the build/release machinery. Product boundaries
live in `PRODUCT.md`, UI rules in `DESIGN.md`, and per-script behaviour
in `docs/scripts/`.

## Language

### Workspace

**Entry**:
The `<script-id>.entry.ts` TypeScript ES module of a bundled script. It owns the
`// ==UserScript==` metadata block (the single source of `@name`, `@version`,
and the install URLs) and imports the script's lib modules.
_Avoid_: main file, loader, index

**Lib Module**:
A `<script-id>-*.lib.ts` (or `.lib.tsx` with JSX) TypeScript ES module with named exports. Dependencies are
expressed only through imports; the build fails on a lib that nothing imports.
_Avoid_: helper, global, plugin

**Dist Bundle**:
The committed single-file `dist/<script-id>.user.js` that esbuild produces from
an entry — the only thing a script manager installs for a bundled script and the
target of its `@downloadURL` / `@updateURL`.
_Avoid_: build artifact, output, minified bundle

**Single-file Script**:
A userscript with no lib modules, installed straight from its `src/` path; its
`@downloadURL` / `@updateURL` point at that same raw path so installed copies
can update.
_Avoid_: simple script, standalone script

**Version Plan**:
The repository-wide mapping from every published userscript identity and
version to its proposed version, including identities that do not change.
_Avoid_: partial bump list, selected scripts

**Release Gate**:
The complete Version Plan and green candidate evidence (the `ci-ok` check)
required before `master` is fast-forwarded to the candidate. Bump levels and
immutability are defined by `PRODUCT.md` "Version Policy".
_Avoid_: push-to-publish, pull-request merge, tag release, hotfix in place

**Companion UI**:
Floating controls, panels, and menu commands that live inside a host page: the
user opens one while working in the page, checks state or performs one action,
and returns.
_Avoid_: landing page, app shell, overlay app

**Script-owned Page**:
A standalone page fully rendered by a script at a route the host site does not
serve (for example `/recommend-archive`), mirroring the host's own look.
_Avoid_: overlay, modal, iframe app

**Widget Kit**:
The shared ES modules in `src/userscripts/shared/` (design tokens, Lucide
icons, toast, widget shell, the GM manager adapter and the GM-first JSON store
with its localStorage fallback) that bundled scripts import as
`../shared/*.lib.ts(x)`; the build skips the directory because it has no entry.
_Avoid_: common ui, design system package

### Web Page Assistant

**Refresh Rule**:
One configured auto-refresh interval bound to a scope. The floating widget
counts it down; it can be paused, resumed, or deleted.
_Avoid_: timer, job, schedule

**Page Scope / Site Scope**:
The two scopes a refresh rule or unlocker setting can bind to: page scope is
origin + pathname + search; site scope is the hostname.
_Avoid_: URL pattern, domain rule, tab

**Unlocker Capability**:
One of the page-restriction overrides a user can enable per scope: text
selection, copy/cut, context menu, drag, leave-page confirmation. It changes
browser page events only and never bypasses server-side limits.
_Avoid_: bypass, crack, anti-anti-copy

**Floating Widget**:
The resident companion control at the page corner: with an active refresh rule
it shows the countdown and pause/resume/delete, otherwise a dimmed idle dot that
opens the settings dialog.
_Avoid_: toolbar

### JavDB Recommend Archive

**Period**:
One issue of the site's recurring "Recommend" section, identified by its
number — the unit of browsing, caching, and search.
_Avoid_: issue, week, batch

**Period Stream**:
The archive page's single scrollable sequence of period sections, newest first,
that auto-loads older periods through a sentinel. Adjacent navigation appends the
next section; a distant jump rebuilds the stream at the target period.
_Avoid_: pagination, infinite list, tab

**Catalog**:
The cached list of all periods, refreshed prefix-incrementally from the newest
pages down to the first cached overlap and fully re-verified on a long interval.
_Avoid_: index, manifest

**Navigation Payload**:
The cached per-period detail response used to render one period section; kept
for a bounded number of periods with separate TTLs for the latest and for
history.
_Avoid_: search index, page cache

**Search Index**:
The separate compact per-period local index that full-archive search consults
first. Admitting an index never evicts navigation payloads.
_Avoid_: catalog, cache

**Consumer Lease**:
The per-period hold that keeps one in-flight detail request alive while any
consumer (the stream or a search) still needs it; stopping one consumer releases
only its own lease.
_Avoid_: lock, abort controller
