# Type Safety

> Runtime safety patterns for plain JavaScript userscripts.

---

## Overview

This project currently uses plain JavaScript, not TypeScript. There is no
compile-time type checker, so userscripts must protect themselves with
runtime guards, conservative defaults, optional chaining, and bounded parsing.

The metadata block is also a type-like contract: userscript managers depend
on the declared fields, grants, match patterns, update URLs, and run timing.

---

## Type Organization

Keep data-shape assumptions close to the code that consumes them. For complex
logic, prefer named parsing and summarizing helpers over inline assumptions.
Current examples in the Codex Quota Compass userscript include:

- `parseWindow(label, w)` for rate-limit window rows.
- `parseDailyRows(json)` for daily usage rows.
- `summarizeRows(rangeName, rows, startDate, endExclusiveDate)` for table
  summary rows.
- `summarizeClients(json)` for client aggregation.

If a future userscript grows large enough that shapes become hard to follow,
add JSDoc typedefs near the relevant helpers before introducing a new build
tool.

---

## Validation

Use runtime validation for all untrusted or unstable inputs:

- `Number.isFinite(Number(value))` before numeric calculations.
- `Array.isArray(value)` before mapping, slicing, or reading `length`.
- Optional chaining for nested API fields.
- `try/catch` around `JSON.parse()` for persisted browser state.
- Explicit hostname/path checks before running page-specific logic.
- `res.ok` checks before parsing successful fetch responses.

Current helpers such as `n(v)`, `safeRows(rows, limit)`, `isDockSide(value)`,
and `looksLikeJwt(s)` are the project pattern.

---

## Common Patterns

- Convert nullable display values with `formatValue(value)`.
- Escape dynamic values before inserting them into HTML with
  `escapeHtml(value)`.
- Return fallback UI such as `'-'` or an empty table state instead of throwing
  for missing optional data.
- Strip internal fields before exposing public rows, as `publicWindowRow(w)`
  does for timing internals.
- Keep error messages specific enough to help users recover, but do not
  include secrets.

---

## Forbidden Patterns

- Do not use `eval`, `new Function`, or string-built executable code.
- Do not assume private API response shapes without guards.
- Do not write unchecked JSON from `localStorage` directly into layout or
  network parameters.
- Do not add TypeScript-only syntax to installable `.user.js` files;
  userscript managers need runnable JavaScript.
- Do not add npm imports to installable userscripts unless a bundling step is
  introduced and documented.
