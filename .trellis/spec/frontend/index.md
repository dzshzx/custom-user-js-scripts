# Frontend Development Guidelines

> Project conventions for browser userscripts in this repository.

---

## Overview

This is a small browser userscript workspace for Tampermonkey,
Violentmonkey, Greasemonkey, and similar managers. The "frontend" layer is
plain browser JavaScript, not a React or TypeScript application.

Installable entrypoints and same-script support modules live under
`src/userscripts/<script-id>/`. Reusable snippets live in `snippets/`, local
Node tooling lives in `scripts/`, and human-facing project notes live in
`docs/`.

---

## Pre-Development Checklist

Before editing userscript code:

1. Read [Directory Structure](./directory-structure.md).
2. Read [Quality Guidelines](./quality-guidelines.md).
3. Read [Type Safety](./type-safety.md).
4. If editing injected UI, read [Component Guidelines](./component-guidelines.md).
5. If editing event listeners, DOM readiness, route behavior, or fetch logic, read [Hook Guidelines](./hook-guidelines.md).
6. If editing persisted state, cached results, request deduplication, or debug globals, read [State Management](./state-management.md).

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Userscript file layout and naming | Filled |
| [Component Guidelines](./component-guidelines.md) | DOM UI, injected CSS, accessibility | Filled |
| [Hook Guidelines](./hook-guidelines.md) | DOM lifecycle, event listeners, fetch patterns | Filled |
| [State Management](./state-management.md) | Module state, localStorage, debug globals | Filled |
| [Quality Guidelines](./quality-guidelines.md) | Safety, linting, review checklist | Filled |
| [Type Safety](./type-safety.md) | JavaScript runtime guards and metadata contracts | Filled |

---

## Quality Check

Before finishing a code task that touches userscripts:

1. Run `npm run lint`.
2. Confirm every changed userscript still has a valid metadata block.
3. Confirm no secret, token, cookie, account id, or private API response is committed.
4. If UI changed, manually inspect the affected page in the browser when feasible.
5. If a new convention is discovered, update the relevant file under `.trellis/spec/frontend/`.

---

**Language**: All spec documentation should be written in **English**.
