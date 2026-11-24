'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, makeCloud } = require('./helpers');

const CLOUD = '/api/projects/1201-30001/cloud';
const FIXTURE = makeCloud(4);

let api;
before(async () => { api = await startServer(); });
after(() => api.close());

test('Range bytes=0-15 answers 206 with the 16-byte header', async () => {
  const res = await api.request(CLOUD, { as: 'acme', headers: { Range: 'bytes=0-15' } });
  assert.equal(res.status, 206);
  assert.equal(res.headers.get('content-range'), `bytes 0-15/${FIXTURE.length}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  assert.equal(bytes.length, 16);
  assert.equal(bytes.toString('ascii', 0, 4), 'PTS1');
  assert.equal(bytes.readUInt32LE(4), 4);
});

test('the full cloud downloads as binary with range support', async () => {
  const res = await api.request(CLOUD, { as: 'staff' });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('accept-ranges'), 'bytes');
  assert.equal(res.headers.get('content-type'), 'application/octet-stream');
  assert.match(res.headers.get('cache-control'), /private/);
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), FIXTURE);
});

test('a project without a cloud answers 404', async () => {
  const res = await api.request('/api/projects/0980-41007/cloud', { as: 'brick' });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error.code, 'cloud_not_found');
});

test('a cloud file that was never generated answers 404', async () => {
  const res = await api.request('/api/projects/1201-30002/cloud', { as: 'acme' });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error.code, 'cloud_not_found');
});

test('an unsatisfiable range answers 416 as JSON', async () => {
  const res = await api.request(CLOUD, { as: 'acme', headers: { Range: 'bytes=999999-' } });
  assert.equal(res.status, 416);
  assert.equal(res.headers.get('content-range'), `bytes */${FIXTURE.length}`);
  assert.match(res.headers.get('content-type'), /application\/json/);
});
