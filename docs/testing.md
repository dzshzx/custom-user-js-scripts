# Automated verification

`npm run test:prepare` installs the Chromium revision matching the pinned
Playwright CLI plus its OS libraries; on Linux the OS dependencies may require
sudo. Playwright's standard `PLAYWRIGHT_BROWSERS_PATH` can select an isolated
cache; it must contain this package's matching browser revision.

These tests do not establish userscript-manager installation, human interaction
or live-site compatibility. Real JavDB/Feishu pages,
third-party userscripts and manual browser acceptance remain separate pending
checks.
