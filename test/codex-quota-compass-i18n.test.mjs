import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_LOCALE,
  messages,
  createQuotaCompassTranslator,
  resolveLocale,
} from '../src/userscripts/codex-quota-compass/codex-quota-compass-i18n.lib.js';

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

test('zh-CN and en message tables carry identical key sets', () => {
  const zhKeys = Object.keys(messages['zh-CN']).sort();
  const enKeys = Object.keys(messages.en).sort();
  assert.deepEqual(enKeys, zhKeys);
});

test('new UI strings are translated in both locales', () => {
  const zh = createQuotaCompassTranslator({ locale: 'zh-CN' });
  const en = createQuotaCompassTranslator({ locale: 'en' });

  assert.equal(zh.t('closeAria'), '关闭');
  assert.equal(en.t('closeAria'), 'Close');
  assert.equal(zh.t('durationDaysHours', { days: 2, hours: 3 }), '2 天 3 小时');
  assert.equal(en.t('durationDaysHours', { days: 2, hours: 3 }), '2d 3h');
  assert.equal(zh.t('tableShowAll', { total: 30 }), '显示全部 30 条');
  assert.equal(en.t('tableShowAll', { total: 30 }), 'Show all 30 rows');
  assert.equal(zh.t('statsColumnDate'), '日期');
  assert.equal(en.t('statsColumnDate'), 'Date');
  assert.match(zh.t('statsEmpty'), /自动累计/);
  assert.match(en.t('statsEmpty'), /after each run/);
  assert.match(zh.t('tableNoData'), /刷新/);
});
