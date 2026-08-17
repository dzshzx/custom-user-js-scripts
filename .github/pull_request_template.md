## Verification

- [ ] `npm run lint` passes.
- [ ] `npm test` passes.
- [ ] Generated `dist/` bundles and byte-identical `src` bridge files are committed.

## Userscript release boundary

- [ ] No installable userscript changed; or the `@version` decision was explicitly confirmed.
- [ ] If this PR releases an update, its patch `@version` was bumped on this branch before CI.
- [ ] If this PR intentionally does not release, the unchanged version and delayed installed-script update are understood.

Merging a bumped userscript into `master` publishes it through its raw
`@downloadURL` / `@updateURL`. A published version is immutable; later fixes use
the next patch rather than rewriting the same version.
