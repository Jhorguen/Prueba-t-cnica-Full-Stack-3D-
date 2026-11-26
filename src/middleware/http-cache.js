'use strict';

const crypto = require('crypto');

const PRIVATE_REVALIDATE = 'private, no-cache';

function etagFor(body) {
  return `"${crypto.createHash('sha256').update(body).digest('base64url').slice(0, 32)}"`;
}

function matchesIfNoneMatch(header, etag) {
  if (!header) return false;
  if (header.trim() === '*') return true;
  return header
    .split(',')
    .map((tag) => tag.trim().replace(/^W\//, ''))
    .includes(etag);
}

function sendRevalidatableJson(req, res, payload) {
  const body = JSON.stringify(payload);
  const etag = etagFor(body);
  res.set({
    ETag: etag,
    'Cache-Control': PRIVATE_REVALIDATE,
    Vary: 'Authorization',
  });
  if (matchesIfNoneMatch(req.get('If-None-Match'), etag)) {
    return res.status(304).end();
  }
  res.type('application/json').send(body);
}

module.exports = { sendRevalidatableJson, PRIVATE_REVALIDATE };
