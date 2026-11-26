'use strict';

const fs = require('fs');
const path = require('path');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers');

let api;
before(async () => { api = await startServer(); });
after(() => api.close());

const readLog = () => fs.readFileSync(path.join(api.dataDir, 'issues.jsonl'), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line));

test('created issues are appended to the log with who reported them', async () => {
  const first = await (await api.postJson('/api/projects/1201-30001/issues', 'acme', {
    title: 'Water leak',
    level: 'Level 1',
    spaceId: 's3',
  })).json();
  const second = await (await api.postJson('/api/projects/0980-41007/issues', 'staff', {
    title: 'Roof membrane torn',
    level: 'Roof',
  })).json();

  const log = readLog();
  assert.equal(log.length, 2);
  assert.deepEqual(Object.keys(log[0]).sort(), ['createdAt', 'id', 'level', 'projectId', 'reportedBy', 'spaceId', 'status', 'title', 'updatedAt']);
  assert.equal(log[0].status, 'open');
  assert.equal(log[0].id, first.id);
  assert.equal(log[0].reportedBy, 'Sam Lee');
  assert.equal(log[1].id, second.id);
  assert.equal(log[1].spaceId, null);
});

test('rejected issues are not stored', async () => {
  const before = readLog().length;
  await api.postJson('/api/projects/1201-30001/issues', 'acme', { title: '', level: 'Level 1' });
  await api.postJson('/api/projects/0980-41007/issues', 'acme', { title: 'Sneaky', level: 'Roof' });
  assert.equal(readLog().length, before);
});
