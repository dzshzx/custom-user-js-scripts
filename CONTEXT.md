# Browser Userscript Workspace

This repository contains standalone browser userscripts and small local tools
that support them. This glossary is the shared language for all four
installable scripts and for the build/release machinery. Product boundaries
live in `PRODUCT.md`, UI rules in `DESIGN.md`, per-script behaviour in
`docs/scripts/`, and decisions with their rationale in `docs/adr/`.

## Language

### Workspace

**Entry**:
The `<script-id>.entry.js` ES module of a bundled script. It owns the
`// ==UserScript==` metadata block (the single source of `@name`, `@version`,
and the install URLs) and imports the script's lib modules.
_Avoid_: main file, loader, index

**Lib Module**:
A `<script-id>-*.lib.js` ES module with named exports. Dependencies are
expressed only through imports; the build fails on a lib that nothing imports.
_Avoid_: helper, global, plugin

**Dist Bundle**:
The committed single-file `dist/<script-id>.user.js` that esbuild produces from
an entry — the only thing a script manager installs for a bundled script and the
target of its `@downloadURL` / `@updateURL`.
_Avoid_: build artifact, output, minified bundle

**Bridge File**:
The generated `src/userscripts/<script-id>/<script-id>.user.js`, a byte-identical
copy of the dist bundle kept because a script manager may install from whichever
URL it already holds. It is always the full script, never a stub.
_Avoid_: shim, stub, legacy copy

**Single-file Script**:
A userscript with no lib modules, installed straight from its `src/` path; its
`@downloadURL` / `@updateURL` point at that same raw path so installed copies
can update.
_Avoid_: simple script, standalone script

**Release Gate**:
A `@version` bump on a candidate branch whose pull-request CI is green; merging
that exact commit to `master` is the publication, because every raw install URL
reads `master`. A version that reached `master` is immutable.
_Avoid_: push-to-publish, tag release, hotfix in place

**Companion UI**:
Floating controls, panels, and menu commands that live inside a host page: the
user opens one while working in the page, checks state or performs one action,
and returns.
_Avoid_: landing page, app shell, overlay app

**Script-owned Page**:
A standalone page fully rendered by a script at a route the host site does not
serve (for example `/recommend-archive`), mirroring the host's own look.
_Avoid_: overlay, modal, iframe app

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
The companion control at the page corner, created only while a refresh rule
matches the current page or site. It shows the countdown, pause/resume and
delete actions, and opens the settings dialog.
_Avoid_: always-on badge, toolbar

### Codex Quota Compass

**Limit Window**:
One Codex rate-limit window, identified by its duration, shown in the panel as
限制窗口 with its usage and reset time.
_Avoid_: quota bucket, plan tier, quota window

**Reset Credit**:
A credit the service grants for resetting a limit window early; the panel lists
the ones currently available.
_Avoid_: coupon, refund, voucher

**Quota Snapshot**:
A durable record captured from one successful Codex Quota Compass run. It stores the sanitized quota state and usage aggregates needed for later review, export, import, and sync.
_Avoid_: run result, report cache, monthly report

**Snapshot Archive**:
The long-lived local collection of quota snapshots stored by the userscript. It is the user's personal history for period review and data exchange.
_Avoid_: database, cloud ledger, backup folder

**Cost Ledger**:
The per-UTC-day settled cost rollup derived from snapshots: one immutable record per date (credits and converted USD) once that UTC day has closed. It powers the Statistics tab's day / week (rolling 7-day blocks) / month / all-time views and drill-downs.
_Avoid_: usage cache, daily table, running total, cloud ledger

**Snapshot Export**:
A versioned JSON document produced from the snapshot archive for backup, transfer, or manual multi-device sync. Reading one back is a merge: entries are validated, deduplicated by Snapshot ID, and reported as added / skipped / invalid — never a blind overwrite of the local archive.
_Avoid_: dump, raw payload, script backup, restore overwrite

**Gist Sync**:
The GitHub Gist based sync path where each user stores their own snapshot archive in their own GitHub account. The userscript finds or creates a secret gist, imports the remote snapshot export, and writes the merged archive back. Manual export/import is the fallback path.
_Avoid_: author-hosted server, WebDAV script sync, public shared database, userscript-manager sync

**Snapshot ID**:
The stable identifier attached to one quota snapshot and used as the primary deduplication key during import or sync.
_Avoid_: timestamp key, period key, row hash

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
