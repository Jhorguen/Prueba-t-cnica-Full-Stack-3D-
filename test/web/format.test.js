'use strict';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let format;
before(async () => {
  process.env.TZ = 'America/Bogota';
  format = await import('../../public/js/ui/format.js');
});

test('missing dates read "Not recorded"', () => {
  for (const value of [null, undefined, '', '   ', 42]) {
    assert.equal(format.formatDate(value), 'Not recorded');
  }
});

test('calendar dates do not shift a day in timezones west of UTC', () => {
  assert.equal(format.formatDate('2026-08-04'), 'Aug 4, 2026');
  assert.equal(format.formatDate('2026-01-01'), 'Jan 1, 2026');
});

test('unparseable dates are shown as they came', () => {
  assert.equal(format.formatDate('sometime in spring'), 'sometime in spring');
});

test('floor area converts between square metres and square feet', () => {
  const area = format.floorArea({ w: 5, d: 6, h: 3.2 });
  assert.equal(area, 30);
  assert.equal(format.formatArea(area, 'm2'), '30 m²');
  assert.equal(format.formatArea(area, 'ft2'), '322.9 ft²');
  assert.equal(format.formatArea(12.345, 'm2'), '12.3 m²');
});

test('characters are counted like the API counts them', () => {
  assert.equal(format.characterCount('abc'), 3);
  assert.equal(format.characterCount('é'), 1);
  assert.equal(format.characterCount('🏗'), 1);
});
