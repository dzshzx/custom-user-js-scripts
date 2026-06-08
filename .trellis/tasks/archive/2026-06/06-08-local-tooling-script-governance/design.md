# Design

## Tool Categories

- Repository validators: should usually be exposed through `package.json`.
- Operational utilities: may remain direct `node scripts/*.mjs` commands when they are narrow, manual, and not part of routine validation.
- Tool families: can move into a subdirectory only when shared setup, outputs, or multiple related commands make the grouping useful.

## Current Candidates

- `scripts/check-userscripts.mjs`: keep as validator behind `npm run lint`.
- `scripts/feishu/login-qr.mjs`: operational utility.
- `scripts/feishu/export-image.mjs`: operational utility.

## Preferred Shape

The Feishu utilities are a coherent operational tool family and should live under `scripts/feishu/`. Keep `scripts/check-userscripts.mjs` at the root because it is a repository validator behind `npm run lint`.

## Compatibility

- Preserve `npm run lint`.
- Preserve direct help output for Feishu utilities.
- If paths move, update README, docs, and specs in lockstep.

## Rollback

If scripts move, rollback must restore both file paths and documentation references. If only docs/spec policy changes, rollback is documentation-only.
