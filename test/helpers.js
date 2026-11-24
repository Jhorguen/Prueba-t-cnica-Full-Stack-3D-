'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../src/app');

const KIT_DATA = path.join(__dirname, '..', 'data');

const TOKENS = { staff: 'staff-token', acme: 'acme-token', brick: 'brick-token' };

const PROJECTS = JSON.parse(fs.readFileSync(path.join(KIT_DATA, 'projects.json'), 'utf8'));

function makeCloud(points) {
  const buf = Buffer.alloc(16 + points * 16);
  buf.write('PTS1', 0, 'ascii');
  buf.writeUInt32LE(points, 4);
  buf.writeFloatLE(0.02, 8);
  for (let i = 0; i < points; i++) {
    const o = 16 + i * 16;
    buf.writeFloatLE(i, o);
    buf.writeFloatLE(i * 2, o + 4);
    buf.writeFloatLE(i * 3, o + 8);
    buf[o + 12] = 10;
    buf[o + 13] = 20;
    buf[o + 14] = 30;
    buf[o + 15] = 40;
  }
  return buf;
}

function makeDataDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-viewer-'));
  fs.mkdirSync(path.join(dir, 'spaces'));
  fs.mkdirSync(path.join(dir, 'clouds'));
  for (const file of ['users.json', 'projects.json']) {
    fs.copyFileSync(path.join(KIT_DATA, file), path.join(dir, file));
  }
  for (const file of fs.readdirSync(path.join(KIT_DATA, 'spaces'))) {
    fs.copyFileSync(path.join(KIT_DATA, 'spaces', file), path.join(dir, 'spaces', file));
  }
  fs.writeFileSync(path.join(dir, 'clouds', '1201-30001.pts'), makeCloud(4));
  return dir;
}

async function startServer() {
  const dataDir = makeDataDir();
  const loggedErrors = [];
  const app = createApp({ dataDir, logger: { error: (err) => loggedErrors.push(err) } });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  function request(pathname, { as, headers = {}, ...init } = {}) {
    const auth = as ? { Authorization: `Bearer ${TOKENS[as] || as}` } : {};
    return fetch(base + pathname, { ...init, headers: { ...auth, ...headers } });
  }

  function postJson(pathname, as, body) {
    return request(pathname, {
      as,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  async function close() {
    if (server.closeAllConnections) server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }

  return { request, postJson, close, loggedErrors };
}

function isClientError(status) {
  return status >= 400 && status < 500;
}

module.exports = { startServer, makeCloud, TOKENS, PROJECTS, isClientError };
