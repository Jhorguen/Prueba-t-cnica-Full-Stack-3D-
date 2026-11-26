'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers');

const MISSING_ID = '9999-99999';
const COMPARED_HEADERS = ['content-type', 'content-length', 'cache-control', 'etag', 'www-authenticate'];

let api;
before(async () => { api = await startServer(); });
after(() => api.close());

async function snapshot(res) {
  const headers = Object.fromEntries(COMPARED_HEADERS.map((name) => [name, res.headers.get(name)]));
  return { status: res.status, headers, body: await res.text() };
}

const ENDPOINTS = [
  (api, as, id) => api.request(`/api/projects/${id}`, { as }),
  (api, as, id) => api.request(`/api/projects/${id}/spaces`, { as }),
  (api, as, id) => api.request(`/api/projects/${id}/cloud`, { as }),
  (api, as, id) => api.request(`/api/projects/${id}/cloud`, { as, headers: { Range: 'bytes=0-15' } }),
  (api, as, id) => api.postJson(`/api/projects/${id}/issues`, as, { title: 'Leak', level: 'Level 1' }),
  (api, as, id) => api.postJson(`/api/projects/${id}/issues`, as, '{broken'),
];

const FOREIGN = [
  ['acme', '0980-41007'],
  ['brick', '1201-30001'],
  ['brick', '1201-30002'],
];

test('each client lists only the projects of its account', async () => {
  const ids = async (as) => (await (await api.request('/api/projects', { as })).json()).map((p) => p.id).sort();
  assert.deepEqual(await ids('acme'), ['1201-30001', '1201-30002']);
  assert.deepEqual(await ids('brick'), ['0980-41007']);
  assert.deepEqual(await ids('staff'), ['0980-41007', '1201-30001', '1201-30002']);
});

for (const [as, foreignId] of FOREIGN) {
  test(`a foreign project answers exactly like a missing one (${as} -> ${foreignId})`, async () => {
    for (const call of ENDPOINTS) {
      const foreign = await snapshot(await call(api, as, foreignId));
      const missing = await snapshot(await call(api, as, MISSING_ID));
      assert.equal(foreign.status, 404);
      assert.deepEqual(foreign, missing);
    }
  });
}

test('the 404 body does not reveal anything about the project', async () => {
  const res = await api.request('/api/projects/0980-41007', { as: 'acme' });
  const text = await res.text();
  assert.ok(!text.includes('Brick'));
  assert.ok(!text.includes('0980-41007'));
});

test('staff can open every project', async () => {
  for (const id of ['0980-41007', '1201-30001', '1201-30002']) {
    const res = await api.request(`/api/projects/${id}`, { as: 'staff' });
    assert.equal(res.status, 200, id);
  }
});
