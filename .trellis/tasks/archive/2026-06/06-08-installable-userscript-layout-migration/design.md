# Design

## Migration Boundary

This child owns repository path migration for installable userscripts. It does not own deep behavior refactors; those remain in later source-module children.

Because the repository is currently single-user, migration can prefer a clean final structure over bridge-release complexity. The migration must still be explicit: paths, metadata URLs, docs, tests, and lint discovery move together.

## Candidate Layout

The final layout must be confirmed after `06-08-docs-spec-boundaries`, but likely candidates are:

- `src/userscripts/<script-id>/<script-id>.user.js`
- `src/userscripts/<script-id>/*.lib.js`
- `src/snippets/` or existing `snippets/` for reusable copy/adapt snippets

The chosen layout should avoid scattering one script's installable file, support modules, docs, and tests across unrelated names when a script-scoped folder would be clearer.

## Stable Versus Migrating Fields

Stable by default:

- `@name`
- `@namespace`
- target hosts and `@match`
- `@grant`
- storage keys
- domain language

Allowed to migrate intentionally:

- repository file path
- README/docs links
- `@downloadURL`
- `@updateURL`
- lint/test discovery globs

## Rollback

Rollback must restore moved paths, metadata URLs, docs references, lint discovery, and test imports together. If the migration is too broad, split by script family.
