'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { Transform } = require('stream');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const { startServer, makeCloud } = require('../test/helpers');

const CHANNEL = process.env.E2E_BROWSER_CHANNEL || 'chrome';
const CLOUD_POINTS = 300000;
const CHUNK_BYTES = 64 * 1024;
const CHUNK_DELAY_MS = 25;

function throttle() {
  return new Transform({
    transform(chunk, encoding, done) {
      const parts = [];
      for (let i = 0; i < chunk.length; i += CHUNK_BYTES) parts.push(chunk.subarray(i, i + CHUNK_BYTES));
      const next = () => {
        if (parts.length === 0) return done();
        this.push(parts.shift());
        setTimeout(next, CHUNK_DELAY_MS);
      };
      next();
    },
  });
}

function startSlowCloudProxy(target) {
  const stats = { cloudAborted: 0, cloudCompleted: 0 };
  const server = http.createServer((req, res) => {
    const isCloudRequest = req.url.split('?')[0].endsWith('/cloud');
    const headers = { ...req.headers };
    if (isCloudRequest) {
      delete headers['if-none-match'];
      delete headers['if-modified-since'];
    }
    const upstream = http.request(`${target}${req.url}`, { method: req.method, headers }, (up) => {
      const isCloud = isCloudRequest && up.statusCode < 300;
      const responseHeaders = { ...up.headers };
      if (isCloud) {
        delete responseHeaders['last-modified'];
        delete responseHeaders.etag;
      }
      res.writeHead(up.statusCode, responseHeaders);
      if (!isCloud) {
        up.pipe(res);
        return;
      }
      res.on('close', () => {
        if (res.writableFinished) stats.cloudCompleted++;
        else stats.cloudAborted++;
        up.destroy();
      });
      up.pipe(throttle()).pipe(res);
    });
    upstream.on('error', () => res.destroy());
    req.pipe(upstream);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({
      url: `http://127.0.0.1:${server.address().port}`,
      stats,
      close: () => new Promise((done) => {
        server.closeAllConnections();
        server.close(done);
      }),
    }));
  });
}

let api;
let proxy;
let browser;
let context;
let page;
let skipReason = null;
const problems = [];

before(async () => {
  api = await startServer();
  const clouds = path.join(api.dataDir, 'clouds');
  fs.writeFileSync(path.join(clouds, '1201-30001.pts'), makeCloud(CLOUD_POINTS));
  const truncated = makeCloud(20000);
  fs.writeFileSync(path.join(clouds, '1201-30002.pts'), truncated.subarray(0, 16 + 12000 * 16));
  proxy = await startSlowCloudProxy(api.base);

  try {
    browser = await chromium.launch({
      channel: CHANNEL,
      headless: true,
      args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
    });
  } catch (error) {
    skipReason = `Could not launch ${CHANNEL}: ${error.message.split('\n')[0]}`;
    return;
  }
  context = await browser.newContext({
    viewport: { width: 1180, height: 820 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  page = await context.newPage();
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().startsWith('Failed to load resource')) return;
    problems.push(`console: ${message.text()}`);
  });
  await page.goto(proxy.url);
});

after(async () => {
  if (browser) await browser.close();
  if (proxy) await proxy.close();
  if (api) await api.close();
});

function e2e(name, fn) {
  test(name, async (t) => {
    if (skipReason) {
      t.skip(skipReason);
      return;
    }
    await fn();
  });
}

const cloudNotice = (kind) => page.locator(`#cloud-status .notice-${kind}`);
const progressValue = () => page.locator('#cloud-progress-bar').evaluate((bar) => bar.value);

async function openProject(name) {
  await page.locator('.project-button', { hasText: name }).click();
  await page.locator('#project-name', { hasText: name }).waitFor();
}

async function waitForProgress(min) {
  await page.waitForFunction(
    (threshold) => document.querySelector('#cloud-progress-bar').value > threshold,
    min,
    { timeout: 10000 },
  );
}

e2e('a client only lists its own projects and empty dates say Not recorded', async () => {
  await page.selectOption('#user-select', 'acme-token');
  await page.locator('.project-button').first().waitFor();
  const names = await page.locator('.project-button strong').allTextContents();
  assert.deepEqual(names, ['410 Harbor Ave', '77 Mill St Warehouse']);
  await openProject('410 Harbor Ave');
  const dates = await page.locator('#project-dates').textContent();
  assert.match(dates, /Signed\s*Aug 4, 2026/);
  assert.match(dates, /Delivered\s*Not recorded/);
  const contacts = await page.locator('#project-contacts').textContent();
  assert.doesNotMatch(contacts, /@/);
});

e2e('tapping a room opens its details and toggles the area unit', async () => {
  const box = await page.locator('#stage canvas').boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.locator('#inspector').waitFor();
  const metres = await page.locator('#inspector-area').textContent();
  await page.locator('#unit-toggle').click();
  const feet = await page.locator('#inspector-area').textContent();
  assert.match(metres, /m²$/);
  assert.match(feet, /ft²$/);
  const name = await page.locator('#inspector-name').textContent();
  assert.match(await page.locator('#issue-space').textContent(), new RegExp(name));
});

e2e('the level filter shows a single level', async () => {
  await page.locator('.level-chip', { hasText: 'Level 1' }).click();
  assert.equal(await page.locator('.level-chip', { hasText: 'Level 1' }).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.level-chip', { hasText: 'All levels' }).getAttribute('aria-pressed'), 'false');
  await page.locator('.level-chip', { hasText: 'All levels' }).click();
});

e2e('the point cloud loads with real progress', async () => {
  await page.locator('#cloud-load').click();
  await waitForProgress(0.1);
  const midway = await progressValue();
  assert.ok(midway > 0 && midway < 1, `progress ${midway}`);
  assert.match(await page.locator('#cloud-progress-text').textContent(), /MB of .* MB \(\d+%\)/);
  await cloudNotice('ok').waitFor({ timeout: 20000 });
  assert.match(await cloudNotice('ok').textContent(), /300,000 points/);
});

e2e('cancel stops the download', async () => {
  const abortedBefore = proxy.stats.cloudAborted;
  await page.locator('#cloud-toggle').click();
  await openProject('410 Harbor Ave');
  await page.locator('#cloud-load').click();
  await waitForProgress(0.1);
  await page.locator('#cloud-cancel').click();
  await cloudNotice('info').waitFor();
  await page.waitForTimeout(500);
  assert.equal(proxy.stats.cloudAborted, abortedBefore + 1);
  assert.ok(await page.locator('#cloud-load').isVisible());
});

e2e('opening another project mid-download cancels it and shows no points', async () => {
  const abortedBefore = proxy.stats.cloudAborted;
  await page.locator('#cloud-load').click();
  await waitForProgress(0.1);
  await openProject('77 Mill St Warehouse');
  await page.waitForTimeout(2500);
  assert.equal(proxy.stats.cloudAborted, abortedBefore + 1);
  assert.equal((await page.locator('#cloud-status').textContent()).trim(), '');
  assert.ok(await page.locator('#cloud-progress').isHidden());
  assert.ok(await page.locator('#cloud-toggle').isHidden());
});

e2e('a truncated file shows a clear error with Try again', async () => {
  await page.locator('#cloud-load').click();
  await cloudNotice('error').waitFor({ timeout: 10000 });
  assert.match(await cloudNotice('error').textContent(), /incomplete/);
  assert.ok(await cloudNotice('error').locator('button', { hasText: 'Try again' }).isVisible());
});

e2e('a network failure shows Try again and recovers', async () => {
  await openProject('410 Harbor Ave');
  await context.setOffline(true);
  await page.locator('#cloud-load').click();
  await cloudNotice('error').waitFor({ timeout: 10000 });
  await context.setOffline(false);
  await cloudNotice('error').locator('button', { hasText: 'Try again' }).click();
  await cloudNotice('ok').waitFor({ timeout: 20000 });
});

e2e('the issue form validates and reports the created id', async () => {
  await page.locator('#issue-submit').click();
  assert.match(await page.locator('#issue-title-error').textContent(), /1 to 120/);
  await page.locator('#issue-title').fill('Crack in the lobby wall');
  await page.selectOption('#issue-level', 'Level 1');
  await page.locator('#issue-submit').click();
  await page.locator('#issue-result .notice-ok').waitFor();
  assert.match(await page.locator('#issue-result').textContent(), /Issue reported\. ID: [0-9a-f-]{36}/);
});

e2e('a project without a point cloud shows the 404 with Try again', async () => {
  await page.selectOption('#user-select', 'brick-token');
  await openProject('Brickyard Lofts');
  await page.locator('#cloud-load').click();
  await cloudNotice('error').waitFor({ timeout: 10000 });
  assert.match(await cloudNotice('error').textContent(), /HTTP 404/);
});

e2e('switching to Spanish translates what is on screen and is remembered', async () => {
  await page.locator('.language-option[data-language="es"]').click();
  assert.equal(await page.locator('html').getAttribute('lang'), 'es');
  assert.equal(await page.locator('#projects-title').textContent(), 'Proyectos');
  assert.match(await page.locator('#project-dates').textContent(), /Firmado\s*20 de oct de 2026/);
  assert.match(await page.locator('#project-dates').textContent(), /Escaneado\s*Sin registro/);
  assert.match(await cloudNotice('error').textContent(), /Este proyecto no tiene nube de puntos disponible\. \(HTTP 404\)/);
  assert.ok(await cloudNotice('error').locator('button', { hasText: 'Reintentar' }).isVisible());
  assert.equal(await page.locator('#issue-submit').textContent(), 'Enviar reporte');

  await page.reload();
  assert.equal(await page.locator('html').getAttribute('lang'), 'es');
  assert.equal(await page.locator('#cloud-load').textContent(), 'Cargar nube de puntos');
  await page.selectOption('#user-select', 'brick-token');
  await openProject('Brickyard Lofts');
  await page.locator('#cloud-load').click();
  await cloudNotice('error').waitFor({ timeout: 10000 });
});

for (const lang of ['es', 'en']) {
  for (const viewport of [{ width: 1180, height: 820 }, { width: 820, height: 1180 }]) {
    e2e(`the layout fits an iPad at ${viewport.width}x${viewport.height} (${lang})`, async () => {
      await page.locator(`.language-option[data-language="${lang}"]`).click();
      await page.setViewportSize(viewport);
      await page.waitForTimeout(200);
    const report = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      small: [...document.querySelectorAll('button, select, input')]
        .filter((node) => node.offsetParent !== null)
        .map((node) => [node.id || node.textContent.trim(), node.getBoundingClientRect()])
        .filter(([, rect]) => rect.width < 44 || rect.height < 44)
        .map(([label]) => label),
      smallFonts: [...document.querySelectorAll('input, select')]
        .filter((node) => parseFloat(getComputedStyle(node).fontSize) < 16)
        .map((node) => node.id),
    }));
      assert.deepEqual(report, { overflow: 0, small: [], smallFonts: [] });
    });
  }
}

e2e('nothing was thrown or logged as an error along the way', async () => {
  assert.deepEqual(problems, []);
});
