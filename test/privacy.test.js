'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, PROJECTS } = require('./helpers');

const FORBIDDEN_KEYS = ['internal', 'price', 'invoice', 'margin', 'notes'];

const INTERNAL_STRINGS = PROJECTS.flatMap((project) => Object.values(project.internal || {}))
  .filter((value) => typeof value === 'string' && value.length > 0);

const CONTACT_SECRETS = PROJECTS.flatMap((project) => project.client.contacts)
  .flatMap((contact) => [contact.email, contact.phone]);

function collectKeys(value, keys = new Set()) {
  if (Array.isArray(value)) value.forEach((item) => collectKeys(item, keys));
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key.toLowerCase());
      collectKeys(child, keys);
    }
  }
  return keys;
}

let api;
before(async () => { api = await startServer(); });
after(() => api.close());

async function fetchEverything(as) {
  const responses = [];
  const list = await api.request('/api/projects', { as });
  responses.push(list);
  const projects = await list.clone().json();
  const ids = [...projects.map((p) => p.id), ...PROJECTS.map((p) => p.id)];
  for (const id of ids) {
    responses.push(await api.request(`/api/projects/${id}`, { as }));
    responses.push(await api.request(`/api/projects/${id}/spaces`, { as }));
    responses.push(await api.postJson(`/api/projects/${id}/issues`, as, { title: 'Leak', level: 'Level 1' }));
  }
  return Promise.all(responses.map(async (res) => ({ url: res.url, text: await res.text() })));
}

for (const as of ['staff', 'acme', 'brick']) {
  test(`the internal block never leaves the server (${as})`, async () => {
    for (const { url, text } of await fetchEverything(as)) {
      const keys = collectKeys(JSON.parse(text));
      for (const key of FORBIDDEN_KEYS) assert.ok(!keys.has(key), `${url} exposes "${key}"`);
      for (const secret of INTERNAL_STRINGS) assert.ok(!text.includes(secret), `${url} leaks "${secret}"`);
    }
  });
}

test('clients do not see contact email or phone', async () => {
  for (const as of ['acme', 'brick']) {
    for (const { url, text } of await fetchEverything(as)) {
      const keys = collectKeys(JSON.parse(text));
      assert.ok(!keys.has('email') && !keys.has('phone'), `${url} exposes contact fields`);
      for (const secret of CONTACT_SECRETS) assert.ok(!text.includes(secret), `${url} leaks "${secret}"`);
    }
  }
});

test('staff sees contact email and phone', async () => {
  const res = await api.request('/api/projects/1201-30001', { as: 'staff' });
  const project = await res.json();
  assert.deepEqual(project.client.contacts[0], {
    role: 'primary',
    name: 'Sam Lee',
    email: 'sam@acme.example',
    phone: '+1 510 555 0101',
  });
});

test('the project list only carries summary fields', async () => {
  const res = await api.request('/api/projects', { as: 'staff' });
  const projects = await res.json();
  for (const project of projects) {
    assert.deepEqual(Object.keys(project).sort(), ['address', 'client', 'id', 'name', 'status']);
    assert.deepEqual(Object.keys(project.client), ['name']);
  }
});
