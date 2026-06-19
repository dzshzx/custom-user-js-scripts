# Browser Userscript Workspace

This repository contains standalone browser userscripts and small local tools that support them. The Codex Quota Compass area focuses on collecting, reviewing, and syncing long-lived quota history across browsers and devices through user-owned GitHub Gist storage.

## Language

**Quota Snapshot**:
A durable record captured from one successful Codex Quota Compass run. It stores the sanitized quota state and usage aggregates needed for later review, export, import, and sync.
_Avoid_: run result, report cache, monthly report

**Snapshot Archive**:
The long-lived local collection of quota snapshots stored by the userscript. It is the user's personal history for period review and data exchange.
_Avoid_: database, cloud ledger, backup folder

**Cost Ledger**:
The per-UTC-day settled cost rollup derived from snapshots: one immutable record per date (credits and converted USD) once that UTC day has closed. It powers the daily / cycle / month consumption view and lets the synced archive keep only the last few raw snapshots instead of full per-snapshot daily history. Distinct from the Snapshot Archive, which holds whole snapshots.
_Avoid_: usage cache, daily table, running total, cloud ledger

**Snapshot Export**:
A versioned JSON document produced from the snapshot archive for backup, transfer, or manual multi-device sync.
_Avoid_: dump, raw payload, script backup

**Snapshot Import**:
Reading a snapshot export back into the local archive with validation, deduplication, and merge reporting.
_Avoid_: restore overwrite, replay, blind append

**Gist Sync**:
The GitHub Gist based sync path where each user stores their own snapshot archive in their own GitHub account. The userscript finds or creates a secret gist, imports the remote snapshot export, and writes back the merged archive.
_Avoid_: author-hosted server, WebDAV script sync, public shared database

**Snapshot ID**:
The stable identifier attached to one quota snapshot and used as the primary deduplication key during import or sync.
_Avoid_: timestamp key, period key, row hash

**Sync Path**:
The supported way users move snapshot history between devices. For Codex Quota Compass, the primary public sync path is GitHub Gist sync; manual JSON export/import is a backup path.
_Avoid_: userscript-manager WebDAV sync, author-hosted server, script backup
