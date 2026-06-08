# Implement

1. Complete child task `06-08-web-page-assistant-settings-contract-sync`, validate, archive, and commit.
2. Complete child task `06-08-web-page-assistant-storage-port`, validate, archive, and commit.
3. Complete child task `06-08-web-page-assistant-dialog-contract`, validate, archive, and commit.
4. Complete child task `06-08-web-page-assistant-refresh-runtime`, validate, archive, and commit.
5. Run final `npm test` and `npm run lint`.
6. Increment `package.json` patch version if it matches `x.y.z`.
7. Archive the parent task.
8. Commit the version bump and parent archive.
9. Confirm branch and remote state, then push to `origin/master`.

## Validation

- Per child: run the targeted Node test for the new interface plus `npm run lint`.
- Final: run `npm test` and `npm run lint`.

## Rollback points

- Each child commit should be independently revertible.
- Do not stage `.codex/config.toml`, `.trellis/.template-hashes.json`, `.trellis/agents/check.md`, `.trellis/agents/implement.md`, or `.trellis/config.yaml` unless explicitly part of this task.
