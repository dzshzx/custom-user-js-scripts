# Implementation Plan

1. Add `test/helpers/installable-block-loader.mjs`.
2. Update existing marker-based tests to use the helper.
3. Update new runtime tests from earlier child tasks where applicable.
4. Run `node --test test/web-page-assistant-*.test.mjs`.
5. Run `npm run lint`.
