'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, isClientError } = require('./helpers');

const ISSUES = '/api/projects/1201-30001/issues';

let api;
before(async () => { api = await startServer(); });
after(() => api.close());

const errorFields = async (res) => (await res.json()).error.details.map((d) => d.field).sort();

test('malformed project ids answer 4xx on every route', async () => {
  const ids = [
    'abc',
    '1201-3000',
    '1201-300011',
    '1201_30001',
    "1201-30001'",
    '%00',
    '%E0%A4%A',
    '..%2F..%2Fdata%2Fusers.json',
    '%20%201201-30001',
    'x'.repeat(4000),
  ];
  for (const id of ids) {
    for (const suffix of ['', '/spaces', '/cloud']) {
      const res = await api.request(`/api/projects/${id}${suffix}`, { as: 'staff' });
      assert.ok(isClientError(res.status), `${id}${suffix} -> ${res.status}`);
      assert.match(res.headers.get('content-type'), /application\/json/);
    }
    const res = await api.postJson(`/api/projects/${id}/issues`, 'staff', { title: 'A', level: 'Level 1' });
    assert.ok(isClientError(res.status), `POST ${id} -> ${res.status}`);
  }
  assert.equal(api.loggedErrors.length, 0);
});

test('broken or non-object JSON answers 400', async () => {
  const bodies = ['{broken', '{"title":', '', 'null', '[]', '"title"', '42', 'true', '{"title":"a",}'];
  for (const body of bodies) {
    const res = await api.postJson(ISSUES, 'acme', body);
    assert.equal(res.status, 400, JSON.stringify(body));
    const { error } = await res.json();
    assert.ok(['invalid_json', 'validation_failed'].includes(error.code));
  }
});

test('a body that is not JSON answers 415', async () => {
  const res = await api.request(ISSUES, {
    as: 'acme',
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: 'title=Leak&level=Level 1',
  });
  assert.equal(res.status, 415);
});

test('a huge body answers 413', async () => {
  const res = await api.postJson(ISSUES, 'acme', { title: 'Leak', level: 'Level 1', pad: 'x'.repeat(20000) });
  assert.equal(res.status, 413);
});

test('title must be text between 1 and 120 characters', async () => {
  const titles = [undefined, null, '', '   ', 'x'.repeat(121), 42, ['Leak'], { text: 'Leak' }];
  for (const title of titles) {
    const res = await api.postJson(ISSUES, 'acme', { title, level: 'Level 1' });
    assert.equal(res.status, 400, JSON.stringify(title));
    assert.deepEqual(await errorFields(res), ['title']);
  }
});

test('title limits are inclusive and count characters, not bytes', async () => {
  for (const title of ['x', 'x'.repeat(120), '🏗️'.repeat(40), `  ${'y'.repeat(120)}  `]) {
    const res = await api.postJson(ISSUES, 'acme', { title, level: 'Level 1' });
    assert.equal(res.status, 201, `length ${title.length}`);
  }
});

test('level must exist in the project', async () => {
  for (const level of [undefined, null, '', 'Roof', 'level 1', 1, ['Level 1']]) {
    const res = await api.postJson(ISSUES, 'acme', { title: 'Leak', level });
    assert.equal(res.status, 400, JSON.stringify(level));
    assert.deepEqual(await errorFields(res), ['level']);
  }
});

test('spaceId, when sent, must be a space on that level of the project', async () => {
  const cases = [
    { spaceId: 'nope' },
    { spaceId: 'b1' },
    { spaceId: 5 },
    { spaceId: ['s1'] },
    { spaceId: 's5' },
  ];
  for (const extra of cases) {
    const res = await api.postJson(ISSUES, 'acme', { title: 'Leak', level: 'Level 1', ...extra });
    assert.equal(res.status, 400, JSON.stringify(extra));
    assert.deepEqual(await errorFields(res), ['spaceId']);
  }
});

test('a valid issue answers 201 with its id', async () => {
  const res = await api.postJson(ISSUES, 'acme', { title: '  Water leak  ', level: 'Level 1', spaceId: 's3' });
  assert.equal(res.status, 201);
  const issue = await res.json();
  assert.equal(typeof issue.id, 'string');
  assert.ok(issue.id.length > 0);
  assert.equal(issue.title, 'Water leak');
  assert.equal(issue.level, 'Level 1');
  assert.equal(issue.spaceId, 's3');
});

test('spaceId is optional', async () => {
  for (const extra of [{}, { spaceId: null }]) {
    const res = await api.postJson(ISSUES, 'acme', { title: 'Leak', level: 'Level 2', ...extra });
    assert.equal(res.status, 201);
    assert.equal((await res.json()).spaceId, null);
  }
});

test('unknown API routes answer 404 JSON', async () => {
  const res = await api.request('/api/nothing/here', { as: 'staff' });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error.code, 'route_not_found');
});
