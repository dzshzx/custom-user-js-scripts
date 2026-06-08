# Design

## Install entrypoint

`src/web-page-assistant.user.js` remains the canonical userscript. The old `src/page-auto-refresh-timer.user.js` path is removed instead of kept as a bridge.

## Lint rule

Extend `scripts/check-userscripts.mjs` from metadata-field presence checks into a small metadata contract checker:

- parse the metadata block;
- require all existing mandatory fields;
- compare `@name`, `@namespace`, `@downloadURL`, and `@updateURL`;
- fail when two files expose the same install identity or same update/download URL.

This keeps the install-entrypoint invariant executable without adding a build step.
