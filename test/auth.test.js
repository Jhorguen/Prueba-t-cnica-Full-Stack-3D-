'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers');

const ROUTES = [
  ['GET', '/api/projects'],
  ['GET', '/api/projects/1201-30001'],
  ['GET', '/api/projects/1201-30001/spaces'],
  ['GET', '/api/projects/1201-30001/cloud'],
  ['POST', '/api/projects/1201-30001/issues'],
  ['GET', '/api/does-not-exist'],
];

let api;
before(async () => { api = await startServer(); });
after(() => api.close());

test('requests without a token get 401 on every route', async () => {
  for (const [method, route] of ROUTES) {
    const res = await api.request(route, { method });
    assert.equal(res.status, 401, `${method} ${route}`);
    assert.equal(res.headers.get('www-authenticate'), 'Bearer');
    const body = await res.json();
    assert.equal(body.error.code, 'unauthorized');
  }
});

test('invalid or malformed Authorization headers get 401', async () => {
  const headers = [
    'Bearer nope',
    'Bearer ',
    'Bearer',
    'Basic c3RhZmYtdG9rZW4=',
    'staff-token',
    'Bearer staff-token extra',
    'Bearer STAFF-TOKEN',
  ];
  for (const value of headers) {
    const res = await api.request('/api/projects', { headers: { Authorization: value } });
    assert.equal(res.status, 401, value);
  }
});

test('authentication runs before body parsing', async () => {
  const res = await api.request('/api/projects/1201-30001/issues', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{broken',
  });
  assert.equal(res.status, 401);
});

test('a valid token is accepted', async () => {
  const res = await api.request('/api/projects', { as: 'staff' });
  assert.equal(res.status, 200);
});
