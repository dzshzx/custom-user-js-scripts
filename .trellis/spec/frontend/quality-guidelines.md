# Quality Guidelines

> Code quality standards for browser userscripts in this project.

---

## Overview

Quality in this repository is mostly about installability, browser safety,
host-page isolation, and not leaking private user data. The current automated
check is `npm run lint`, which runs `scripts/check-userscripts.mjs` and
verifies that installable `.user.js` files under `src/` have a userscript
metadata block and required metadata fields.

---

## Forbidden Patterns

- Do not commit secrets, cookies, access tokens, Authorization headers, or
  account-specific private data.
- Do not log raw auth/session responses or raw private API payloads in normal
  mode.
- Do not add global CSS that can unintentionally style the host page.
- Do not inject unescaped API data into `innerHTML`.
- Do not add npm imports to installable `.user.js` files without adding and
  documenting a build step.
- Do not weaken userscript metadata so `npm run lint` no longer validates the
  script.

---

## Required Patterns

- Every installable script must live under `src/` and use the `.user.js`
  suffix. The target layout is `src/userscripts/<script-id>/<script-id>.user.js`.
- Every userscript must start with a `// ==UserScript==` metadata block.
- Required metadata fields are `@name`, `@namespace`, `@version`,
  `@description`, and `@match`.
- Do not update `@version` as part of ordinary feature, UI, or bug-fix
  changes. Bump userscript versions only when the user explicitly asks for a
  version update.
- When moving installable userscript files, update `@downloadURL`,
  `@updateURL`, and `@require` paths intentionally in the same task.
- Keep `@grant none` unless the script actually uses a userscript manager API.
- Wrap runtime code in an IIFE with `'use strict'`.
- Scope injected UI with a stable root id and script-specific class prefix.
- Use `type="button"` for injected buttons.
- Escape dynamic values before writing them into HTML strings.

---

## Testing Requirements

For any change under `src/`, run:

```bash
npm run lint
```

For UI or target-page behavior changes, also manually test the changed
userscript in a browser userscript manager when feasible. Check at least:

- The script installs or updates without metadata errors.
- The script does not run on unintended hosts.
- Injected UI appears only once.
- Buttons and menu commands still work.
- Error states do not reveal secrets.

For changes under `scripts/`, run the script through the npm command or a
direct Node command that exercises the changed path.
For operational tool families under `scripts/<family>/`, also run each moved
tool with `--help` to catch stale usage text.

---

## Code Review Checklist

- Metadata matches the actual target site and grants.
- `@version` changes only when the user explicitly requested a version bump.
- New code follows the single-file userscript model or documents why it does
  not.
- Dynamic HTML output is escaped or built with DOM APIs.
- Local persistence is namespaced and non-sensitive.
- Fetch code checks `res.ok` and handles 401 or auth failures clearly.
- Debug output is opt-in and sanitized.
- Host-page CSS and DOM impact are scoped to the script root.
- `npm run lint` passes.
