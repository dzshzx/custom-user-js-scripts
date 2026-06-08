# Implement

1. Remove `src/page-auto-refresh-timer.user.js`.
2. Update `scripts/check-userscripts.mjs` to parse userscript metadata blocks and enforce unique install identity/update URLs.
3. Search for stale references to `page-auto-refresh-timer.user.js` outside Codex quota files.
4. Run `npm run lint`.
5. Inspect diff and commit the child batch.
