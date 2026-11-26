'use strict';

const express = require('express');
const { HttpError } = require('./errors');

function requireJson(req, res, next) {
  if (!req.is('application/json')) {
    return next(new HttpError(415, 'unsupported_media_type', 'Send the request body as application/json.'));
  }
  next();
}

function jsonBody(limit) {
  return [requireJson, express.json({ limit })];
}

module.exports = { jsonBody };
