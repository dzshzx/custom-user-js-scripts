# Implementation Plan

1. Load `trellis-before-dev` and read frontend directory, quality, state, hook, component, and type-safety specs.
2. Locate the post-migration Web Page Assistant entrypoint and read all Web Page Assistant tests.
3. Identify 1-3 extraction candidates with the highest line-count and testability payoff.
4. Extract one module at a time, preserving behavior.
5. Add or adjust tests around the extracted module interface.
6. Run targeted Web Page Assistant tests after each extraction.
7. Run:
   - `npm run lint`
   - `npm test`
   - `git diff --check`
8. Review metadata and install identity:
   - `@name`
   - `@namespace`
   - `@version`
   - `@match`
   - `@grant`
   - `@downloadURL`
   - `@updateURL`

## Risk Notes

- Do not reduce line count by hiding behavior behind untested globals.
- Do not silently change persisted settings.
- Do not create a second installable Web Page Assistant userscript.
