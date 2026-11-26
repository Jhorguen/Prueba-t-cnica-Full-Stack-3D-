'use strict';

const path = require('path');
const express = require('express');
const { loadData } = require('./storage/data');
const { authenticate } = require('./middleware/auth');
const { HttpError, errorHandler } = require('./middleware/errors');
const { createIssueStore } = require('./storage/issues');
const { projectsRouter } = require('./routes/projects');

const ROOT = path.join(__dirname, '..');
const THREE_DIR = path.join(path.dirname(require.resolve('three')), '..');
const FONT_PACKAGES = ['inter-tight', 'michroma'];
const fontDir = (name) => path.dirname(require.resolve(`@fontsource/${name}/package.json`));

function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
  });
  next();
}

function createApp({ dataDir = path.join(ROOT, 'data'), logger = console } = {}) {
  const data = loadData(dataDir);
  const issues = createIssueStore({ file: path.join(dataDir, 'issues.jsonl') });
  const app = express();

  app.disable('x-powered-by');
  app.set('etag', false);
  app.use(securityHeaders);

  const api = express.Router();
  api.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  api.use(authenticate(data));
  api.use('/projects', projectsRouter(data, issues));
  api.use((req, res, next) => next(new HttpError(404, 'route_not_found', 'Endpoint not found.')));
  app.use('/api', api);

  app.use('/vendor/three/build', express.static(path.join(THREE_DIR, 'build')));
  app.use('/vendor/three/addons', express.static(path.join(THREE_DIR, 'examples', 'jsm')));
  for (const name of FONT_PACKAGES) app.use(`/vendor/fonts/${name}`, express.static(fontDir(name)));
  app.use(express.static(path.join(ROOT, 'public')));

  app.use(errorHandler(logger));
  return app;
}

module.exports = { createApp };
