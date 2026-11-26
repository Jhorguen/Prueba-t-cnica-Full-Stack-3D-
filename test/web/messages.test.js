'use strict';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let client;
let messages;
let issueForm;
let cloudPanel;

before(async () => {
  client = await import('../../public/js/api/client.js');
  messages = await import('../../public/js/ui/messages.js');
  issueForm = await import('../../public/js/ui/issue-form.js');
  cloudPanel = await import('../../public/js/ui/cloud-panel.js');
});

test('API errors are described with their HTTP status', () => {
  const notFound = new client.ApiError(404, 'not_found', 'Project not found.');
  assert.equal(messages.describeError(notFound, 'fallback'), 'Project not found. (HTTP 404)');
  const unauthorized = new client.ApiError(401, 'unauthorized', 'A valid bearer token is required.');
  assert.match(messages.describeError(unauthorized, 'fallback'), /Choose the user again/);
  assert.match(messages.describeError(new client.NetworkError(), 'fallback'), /connection/);
  assert.equal(messages.describeError(new Error('boom'), 'fallback'), 'fallback');
});

test('point cloud errors say what happened', () => {
  assert.equal(
    messages.describeCloudError({ code: 'http', status: 404, message: 'This project has no point cloud available.' }),
    'This project has no point cloud available. (HTTP 404)',
  );
  assert.match(messages.describeCloudError({ code: 'truncated', message: 'The point cloud file is incomplete.' }), /incomplete/);
  assert.equal(messages.describeCloudError(undefined), 'The point cloud could not be loaded.');
});

test('the issue form checks the draft before calling the API', () => {
  const fields = (draft) => issueForm.validateIssueDraft(draft).map((e) => e.field);
  assert.deepEqual(fields({ title: '', level: '' }), ['title', 'level']);
  assert.deepEqual(fields({ title: 'x'.repeat(121), level: 'Level 1' }), ['title']);
  assert.deepEqual(fields({ title: 'x'.repeat(120), level: 'Level 1' }), []);
});

test('progress and results are described honestly', () => {
  assert.equal(cloudPanel.describeProgress(1048576 * 3, 1048576 * 12), '3.0 MB of 12.0 MB (25%)');
  assert.equal(cloudPanel.describeProgress(1048576, null), '1.0 MB');
  assert.equal(
    cloudPanel.describeLoadedCloud({ count: 2000000, totalCount: 2000000, stride: 1 }),
    'Point cloud loaded: 2,000,000 points.',
  );
  assert.match(
    cloudPanel.describeLoadedCloud({ count: 1000000, totalCount: 3000000, stride: 3 }),
    /1 of every 3 of 3,000,000 points/,
  );
});
