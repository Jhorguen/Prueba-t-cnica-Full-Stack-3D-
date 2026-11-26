'use strict';

const { test, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');

let client;
const realFetch = global.fetch;
const calls = [];

before(async () => { client = await import('../../public/js/api/client.js'); });
afterEach(() => {
  global.fetch = realFetch;
  calls.length = 0;
});

function stubFetch(handler) {
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
}

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

test('sends the current token and returns the parsed body', async () => {
  let token = 'acme-token';
  const api = client.createApi(() => token);
  stubFetch(() => json(200, [{ id: '1201-30001' }]));
  assert.deepEqual(await api.listProjects(), [{ id: '1201-30001' }]);
  token = 'brick-token';
  await api.listProjects();
  assert.equal(calls[0].init.headers.Authorization, 'Bearer acme-token');
  assert.equal(calls[1].init.headers.Authorization, 'Bearer brick-token');
});

test('API errors keep status, code, message and field details', async () => {
  const api = client.createApi(() => 'acme-token');
  stubFetch(() => json(400, {
    error: { code: 'validation_failed', message: 'The issue is not valid.', details: [{ field: 'title', message: 'Too long' }] },
  }));
  await assert.rejects(api.createIssue('1201-30001', { title: 'x' }), (error) => {
    assert.ok(error instanceof client.ApiError);
    assert.equal(error.status, 400);
    assert.equal(error.code, 'validation_failed');
    assert.deepEqual(error.details, [{ field: 'title', message: 'Too long' }]);
    return true;
  });
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
});

test('an error page that is not JSON still becomes a readable ApiError', async () => {
  const api = client.createApi(() => 'acme-token');
  stubFetch(() => new Response('<html>Bad gateway</html>', { status: 502 }));
  await assert.rejects(api.getProject('1201-30001'), (error) => {
    assert.ok(error instanceof client.ApiError);
    assert.equal(error.status, 502);
    assert.match(error.message, /502/);
    return true;
  });
});

test('a failed connection becomes a NetworkError', async () => {
  const api = client.createApi(() => 'acme-token');
  stubFetch(() => { throw new TypeError('fetch failed'); });
  await assert.rejects(api.getSpaces('1201-30001'), client.NetworkError);
});

test('an aborted request stays an AbortError so the UI can ignore it', async () => {
  const api = client.createApi(() => 'acme-token');
  stubFetch(() => { throw new DOMException('aborted', 'AbortError'); });
  await assert.rejects(api.getProject('1201-30001'), (error) => client.isAbort(error));
});

test('project ids are encoded into the URL', () => {
  const api = client.createApi(() => 'acme-token');
  assert.equal(api.cloudUrl('../x'), '/api/projects/..%2Fx/cloud');
});
