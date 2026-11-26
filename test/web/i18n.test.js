'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

let i18n;
let format;
let messages;
let cloudPanel;

before(async () => {
  i18n = await import('../../public/js/i18n/index.js');
  format = await import('../../public/js/ui/format.js');
  messages = await import('../../public/js/ui/messages.js');
  cloudPanel = await import('../../public/js/ui/cloud-panel.js');
});

after(() => i18n.setLanguage('en'));

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const isDataTranslation = (key) => key.startsWith('status.');

test('English is the default language', () => {
  assert.equal(i18n.language(), 'en');
  assert.equal(i18n.t('cloud.load'), 'Load point cloud');
});

test('both dictionaries have the same keys', () => {
  const en = i18n.dictionaryKeys('en');
  const es = i18n.dictionaryKeys('es').filter((key) => !isDataTranslation(key));
  assert.deepEqual([...es].sort(), [...en].sort());
});

test('translations keep the same placeholders', () => {
  for (const key of i18n.dictionaryKeys('en')) {
    i18n.setLanguage('en');
    const english = placeholders(i18n.t(key));
    i18n.setLanguage('es');
    const spanish = placeholders(i18n.t(key));
    assert.deepEqual(spanish, english, key);
  }
  i18n.setLanguage('en');
});

test('switching to Spanish translates texts, dates and numbers', () => {
  const heard = [];
  const stop = i18n.onLanguageChange((lang) => heard.push(lang));
  i18n.setLanguage('es');
  assert.deepEqual(heard, ['es']);
  assert.equal(i18n.t('cloud.load'), 'Cargar nube de puntos');
  assert.equal(format.formatDate('2026-08-04'), '4 de ago de 2026');
  assert.equal(format.formatDate(null), 'Sin registro');
  assert.equal(format.formatArea(30, 'ft2'), '322,9 ft²');
  assert.equal(format.formatCount(2000000), '2.000.000');
  assert.equal(cloudPanel.describeProgress(1048576 * 3, 1048576 * 12), '3,0 MB de 12,0 MB (25 %)');
  assert.equal(
    messages.describeCloudError({ code: 'truncated', params: { reason: 'points', received: 1200000, total: 2000000 } }),
    'El archivo de la nube está incompleto: solo llegaron 1.200.000 de 2.000.000 puntos.',
  );
  assert.equal(
    messages.describeCloudError({ code: 'http', status: 404, serverCode: 'cloud_not_found', message: 'This project has no point cloud available.' }),
    'Este proyecto no tiene nube de puntos disponible. (HTTP 404)',
  );
  assert.equal(i18n.translateValue('status', 'In production'), 'En producción');
  assert.equal(i18n.translateValue('status', 'Something new'), 'Something new');
  stop();
  i18n.setLanguage('en');
  assert.equal(i18n.translateValue('status', 'In production'), 'In production');
});

test('an unknown language is ignored', () => {
  i18n.setLanguage('fr');
  assert.equal(i18n.language(), 'en');
});
