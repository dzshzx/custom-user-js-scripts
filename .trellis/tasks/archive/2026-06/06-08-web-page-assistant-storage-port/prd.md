# Web Page Assistant storage port

## Goal

Move Web Page Assistant settings storage, widget position storage, and menu registration behind one storage port interface.

## Requirements

- Introduce `createWebPageAssistantStoragePort` in the installable userscript.
- The port must handle legacy GM APIs, promise GM APIs, and `localStorage` fallback.
- The port must normalize settings and widget positions before returning them.
- The port must expose menu registration without leaking GM implementation checks to the entrypoint.
- Add fake-adapter tests for read, write, fallback, and menu registration behavior.

## Acceptance Criteria

- [ ] Entrypoint code calls the storage port instead of open-coded GM/localStorage read/write functions.
- [ ] Tests cover primary GM path and fallback path.
- [ ] `npm test -- test/web-page-assistant-storage-port.test.mjs` passes.
- [ ] `npm run lint` passes.

## Notes

- Report candidate: `#candidate-storage-port`.
