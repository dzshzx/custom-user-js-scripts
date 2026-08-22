# Cross-device sync goes through the user's own GitHub Gist, not an author server

- Status: accepted
- Date: 2026-06-13 (commits 50bafbc, 9da79f2, 7fd4561); recorded 2026-08-23
- Related: docs/scripts/codex-quota-gist-sync.md (setup and data format), CONTEXT.md (Gist Sync, Snapshot Export), PRODUCT.md "Non-Goals"

## Context

Users run Codex Quota Compass on several machines and wanted one history.
Options were an author-hosted sync service, the script manager's own cloud /
WebDAV sync, manual JSON export/import only, or a per-user store in an account
the user already owns.

## Decision

1. Sync uses a secret gist in the user's own GitHub account: the script finds
   or creates it by description and file name, imports the remote export, and
   writes the merged archive back; requests go through the manager's
   cross-origin request API with a user-supplied fine-grained token (Gists
   read/write only).
2. The gist holds only the versioned `Snapshot Export` (sanitized aggregates);
   imports merge with Snapshot-ID deduplication and a visible report.
3. Manual export/import stays as the backup path; the script never depends on a
   server the author operates.

## Consequences

- No hosting cost, no shared database, no author-side access to user data; the
  user can revoke the token or delete the gist at any time.
- A secret gist is unlisted, not private: the document must never contain
  cookies, tokens, or raw private API responses.
- Rejected: an author-hosted server (operational burden and a trust boundary the
  project does not want), manager WebDAV/cloud sync (manager-specific,
  undocumented formats), export/import only (no automatic convergence).
