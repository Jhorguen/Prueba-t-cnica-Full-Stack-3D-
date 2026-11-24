'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers');

const DETAIL = '/api/projects/1201-30001';

let api;
before(async () => { api = await startServer(); });
after(() => api.close());

test('the project detail has an ETag and is private to the user', async () => {
  const res = await api.request(DETAIL, { as: 'acme' });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('etag'), /^"[^"]+"$/);
  const cacheControl = res.headers.get('cache-control');
  assert.match(cacheControl, /private/);
  assert.match(cacheControl, /no-cache/);
  assert.doesNotMatch(cacheControl, /public/);
  assert.match(res.headers.get('vary'), /Authorization/);
});

test('If-None-Match with the current ETag answers 304 without a body', async () => {
  const first = await api.request(DETAIL, { as: 'acme' });
  const etag = first.headers.get('etag');
  for (const header of [etag, `W/${etag}`, `"other", ${etag}`, '*']) {
    const res = await api.request(DETAIL, { as: 'acme', headers: { 'If-None-Match': header } });
    assert.equal(res.status, 304, header);
    assert.equal(await res.text(), '');
    assert.equal(res.headers.get('etag'), etag);
  }
});

test('a stale ETag answers 200 with the body', async () => {
  const res = await api.request(DETAIL, { as: 'acme', headers: { 'If-None-Match': '"stale"' } });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).id, '1201-30001');
});

test('the ETag differs when the user sees a different body', async () => {
  const client = await api.request(DETAIL, { as: 'acme' });
  const staff = await api.request(DETAIL, { as: 'staff' });
  assert.notEqual(client.headers.get('etag'), staff.headers.get('etag'));
  const crossed = await api.request(DETAIL, {
    as: 'staff',
    headers: { 'If-None-Match': client.headers.get('etag') },
  });
  assert.equal(crossed.status, 200);
});

test('errors are never cached', async () => {
  const res = await api.request('/api/projects/9999-99999', { as: 'acme' });
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('etag'), null);
});
