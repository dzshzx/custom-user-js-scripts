# Implement

1. Add settings contract markers and factory shape to the library file.
2. Add matching markers to the installable userscript settings block.
3. Expose `defaultUnlockerSetting` through the contract and delegate any local caller through the contract.
4. Update `test/web-page-assistant-settings.test.mjs` to run the same cases against the library and the installable block.
5. Run `npm test -- test/web-page-assistant-settings.test.mjs`.
6. Run `npm run lint`.
