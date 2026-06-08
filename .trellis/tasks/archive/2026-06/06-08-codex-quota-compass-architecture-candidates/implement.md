# Implement

1. Complete `06-08-quota-runtime-port`.
2. Complete `06-08-quota-floating-panel-shell`.
3. Complete `06-08-quota-snapshot-contract`.
4. Complete `06-08-quota-sync-status-source`.
5. Run final integration checks:
   - `npm run lint`
   - `npm test`
   - `git status --short`
   - inspect final `git diff`
6. Bump patch version once if the userscript version fields are shaped like `x.y.z`.
7. Commit all intended changes.
8. Push to the configured remote. If work is not on `master`, merge to `master` first.

Risk points:

- `@require` ordering must match runtime dependencies.
- The main userscript is currently oversized; new code should move behavior out rather than increasing it.
- Avoid hidden fallbacks for missing libraries. Fail with clear errors if dependency order is wrong.
