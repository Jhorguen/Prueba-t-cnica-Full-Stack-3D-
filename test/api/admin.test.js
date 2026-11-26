'use strict';

const fs = require('fs');
const path = require('path');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, isClientError } = require('../helpers');
const { createIssueStore } = require('../../src/storage/issues');

let api;
let acmeIssue;
let brickIssue;

before(async () => {
  api = await startServer();
  acmeIssue = await (await api.postJson('/api/projects/1201-30001/issues', 'acme', {
    title: 'Water leak',
    level: 'Level 1',
    spaceId: 's3',
  })).json();
  brickIssue = await (await api.postJson('/api/projects/0980-41007/issues', 'brick', {
    title: 'Roof membrane torn',
    level: 'Roof',
  })).json();
});
after(() => api.close());

const patch = (id, as, body, headers = { 'Content-Type': 'application/json' }) => api.request(`/api/issues/${id}`, {
  as,
  method: 'PATCH',
  headers,
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

test('/api/me tells who is signed in and nothing else', async () => {
  const me = await (await api.request('/api/me', { as: 'acme' })).json();
  assert.deepEqual(me, { name: 'Sam Lee', role: 'client' });
  const staff = await (await api.request('/api/me', { as: 'staff' })).json();
  assert.deepEqual(staff, { name: 'Dana Ortiz', role: 'staff' });
  assert.equal((await api.request('/api/me')).status, 401);
});

test('clients cannot list or change issue reports', async () => {
  for (const as of ['acme', 'brick']) {
    const list = await api.request('/api/issues', { as });
    assert.equal(list.status, 403);
    assert.equal((await list.json()).error.code, 'forbidden');
    const change = await patch(acmeIssue.id, as, { status: 'resolved' });
    assert.equal(change.status, 403);
  }
  assert.equal((await api.request('/api/issues')).status, 401);
  assert.equal((await patch(acmeIssue.id, undefined, { status: 'resolved' })).status, 401);
});

test('staff sees every report, newest first, with project and space names', async () => {
  const res = await api.request('/api/issues', { as: 'staff' });
  assert.equal(res.status, 200);
  const issues = await res.json();
  assert.deepEqual(issues.map((issue) => issue.id), [brickIssue.id, acmeIssue.id]);
  assert.deepEqual(issues[1], {
    id: acmeIssue.id,
    projectId: '1201-30001',
    projectName: '410 Harbor Ave',
    title: 'Water leak',
    level: 'Level 1',
    spaceId: 's3',
    spaceName: 'Kitchen',
    reportedBy: 'Sam Lee',
    status: 'open',
    createdAt: acmeIssue.createdAt,
    updatedAt: acmeIssue.createdAt,
    updatedBy: null,
  });
  assert.equal(issues[0].spaceName, null);
});

test('the issue list can be revalidated cheaply and changes when a report arrives', async () => {
  const first = await api.request('/api/issues', { as: 'staff' });
  const etag = first.headers.get('etag');
  assert.match(first.headers.get('cache-control'), /private/);
  const again = await api.request('/api/issues', { as: 'staff', headers: { 'If-None-Match': etag } });
  assert.equal(again.status, 304);
  await api.postJson('/api/projects/1201-30002/issues', 'acme', { title: 'Dock door jammed', level: 'Ground' });
  const changed = await api.request('/api/issues', { as: 'staff', headers: { 'If-None-Match': etag } });
  assert.equal(changed.status, 200);
  assert.equal((await changed.json()).length, 3);
});

test('staff can move a report through its statuses and the change is kept', async () => {
  const res = await patch(acmeIssue.id, 'staff', { status: 'in_progress' });
  assert.equal(res.status, 200);
  const updated = await res.json();
  assert.equal(updated.status, 'in_progress');
  assert.equal(updated.updatedBy, 'Dana Ortiz');
  assert.notEqual(updated.updatedAt, acmeIssue.createdAt);

  await patch(acmeIssue.id, 'staff', { status: 'resolved' });
  const reloaded = createIssueStore({ file: path.join(api.dataDir, 'issues.jsonl'), logger: { error() {} } });
  assert.equal(reloaded.find(acmeIssue.id).status, 'resolved');
  assert.equal(reloaded.find(acmeIssue.id).title, 'Water leak');
  assert.equal(reloaded.list().length, 3);
});

test('bad status changes answer 4xx, never 500', async () => {
  const cases = [
    [patch('not-a-uuid', 'staff', { status: 'resolved' }), 400],
    [patch('00000000-0000-4000-8000-000000000000', 'staff', { status: 'resolved' }), 404],
    [patch(acmeIssue.id, 'staff', '{broken'), 400],
    [patch(acmeIssue.id, 'staff', { status: 'done' }), 400],
    [patch(acmeIssue.id, 'staff', { status: ['open'] }), 400],
    [patch(acmeIssue.id, 'staff', []), 400],
    [patch(acmeIssue.id, 'staff', 'status=open', { 'Content-Type': 'text/plain' }), 415],
  ];
  for (const [pending, expected] of cases) {
    const res = await pending;
    assert.equal(res.status, expected);
    assert.ok(isClientError(res.status));
  }
  assert.equal(api.loggedErrors.length, 0);
});

test('an unreadable line in the log is skipped, not fatal', () => {
  const file = path.join(api.dataDir, 'broken.jsonl');
  fs.writeFileSync(file, '{"id":"a","createdAt":"2026-01-01T00:00:00.000Z","title":"Kept"}\n{oops\n');
  const errors = [];
  const store = createIssueStore({ file, logger: { error: (err) => errors.push(err) } });
  assert.equal(store.list().length, 1);
  assert.equal(store.find('a').status, 'open');
  assert.equal(errors.length, 1);
});
