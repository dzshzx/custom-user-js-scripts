import test from 'node:test';
import assert from 'node:assert/strict';

await import('../src/codex-quota-compass-i18n.lib.js');

const {
  DEFAULT_LOCALE,
  messages,
  createQuotaCompassTranslator,
  resolveLocale,
} = globalThis.CodexQuotaCompassI18nLib;

test('createQuotaCompassTranslator uses zh-CN as the default locale', () => {
  const translator = createQuotaCompassTranslator({
    navigator: { language: 'zh-Hans-CN' },
  });

  assert.equal(DEFAULT_LOCALE, 'zh-CN');
  assert.equal(translator.locale, 'zh-CN');
  assert.equal(translator.t('panelTitle'), messages['zh-CN'].panelTitle);
});

test('createQuotaCompassTranslator selects English for English navigator languages', () => {
  const translator = createQuotaCompassTranslator({
    navigator: { language: 'en-US' },
  });

  assert.equal(translator.locale, 'en');
  assert.equal(translator.t('panelTitle'), messages.en.panelTitle);
});

test('translator interpolates variables and falls back to key names', () => {
  const translator = createQuotaCompassTranslator({
    locale: 'en',
  });

  assert.equal(
    translator.t('archiveLatestImport', { added: 2, skipped: 1, invalid: 0 }),
    'Latest import: 2 added, 1 skipped, 0 invalid.',
  );
  assert.equal(translator.t('missingKey'), 'missingKey');
});

test('resolveLocale preserves the current English-prefix rule', () => {
  assert.equal(resolveLocale({ locale: 'en-GB' }), 'en');
  assert.equal(resolveLocale({ locale: 'fr-FR' }), 'zh-CN');
});
