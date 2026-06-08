# Implementation Plan

1. Read docs/spec outputs from `06-08-docs-spec-boundaries`.
2. Search all references to `scripts/check-userscripts.mjs`, the old Feishu paths, and the new `scripts/feishu/` paths.
3. Move Feishu utilities under `scripts/feishu/`.
4. Update README/docs/spec references and each tool's help text.
5. Verify no stale old path remains except task/archive history.
6. Run:
   - `npm run lint`
   - `npm test`
   - `node scripts/feishu/login-qr.mjs --help`
   - `node scripts/feishu/export-image.mjs --help`
   - `git diff --check`

## Risk Notes

- Do not change Playwright runtime behavior while moving or documenting tools.
- Do not hard-code local npx cache paths into new public docs unless already required by the script.
