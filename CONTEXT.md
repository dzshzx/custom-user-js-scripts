# Browser Userscript Workspace

This repository contains standalone browser userscripts and small local tools that support them. The Codex Quota Compass area focuses on collecting, reviewing, and moving long-lived quota history across browsers and devices without depending on a custom backend.

## Language

**Quota Snapshot**:
A durable record captured from one successful Codex Quota Compass run. It stores the sanitized quota state and usage aggregates needed for later review, export, import, and sync.
_Avoid_: run result, report cache, monthly report

**Snapshot Archive**:
The long-lived local collection of quota snapshots stored by the userscript. It is the user's personal history for period review and data exchange.
_Avoid_: database, cloud ledger, backup folder

**Snapshot Export**:
A versioned JSON document produced from the snapshot archive for backup, transfer, or manual multi-device sync.
_Avoid_: dump, raw payload, script backup

**Snapshot Import**:
Reading a snapshot export back into the local archive with validation, deduplication, and merge reporting.
_Avoid_: restore overwrite, replay, blind append

**Snapshot ID**:
The stable identifier attached to one quota snapshot and used as the primary deduplication key during import or sync.
_Avoid_: timestamp key, period key, row hash

**Sync Path**:
The supported way users move snapshot history between devices. For Codex Quota Compass, the primary sync path is manual JSON export/import over a local archive, with userscript-manager sync only as an optional enhancement.
_Avoid_: cloud source of truth, account sync
