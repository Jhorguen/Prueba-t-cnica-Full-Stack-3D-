'use strict';

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const unauthorized = () => new HttpError(401, 'unauthorized', 'A valid bearer token is required.');
const projectNotFound = () => new HttpError(404, 'not_found', 'Project not found.');

const BODY_PARSER_ERRORS = {
  'entity.parse.failed': [400, 'invalid_json', 'The request body is not valid JSON.'],
  'entity.too.large': [413, 'payload_too_large', 'The request body is too large.'],
  'encoding.unsupported': [415, 'unsupported_encoding', 'The request body encoding is not supported.'],
  'charset.unsupported': [415, 'unsupported_charset', 'The request body charset is not supported.'],
  'request.aborted': [400, 'request_aborted', 'The request was aborted.'],
  'request.size.invalid': [400, 'invalid_body', 'The request body size does not match its Content-Length.'],
};

function toHttpError(err) {
  if (err instanceof HttpError) return err;
  const known = err && BODY_PARSER_ERRORS[err.type];
  if (known) return new HttpError(...known);
  const status = err && (err.status || err.statusCode);
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return new HttpError(status, 'bad_request', 'The request could not be processed.');
  }
  return null;
}

function errorHandler(logger) {
  return (err, req, res, next) => {
    if (res.headersSent) return next(err);
    let httpError = toHttpError(err);
    if (!httpError) {
      logger.error(err);
      httpError = new HttpError(500, 'internal_error', 'Something went wrong on our side.');
    }
    if (httpError.status === 401) res.set('WWW-Authenticate', 'Bearer');
    res.removeHeader('ETag');
    res.removeHeader('Last-Modified');
    res.set('Cache-Control', 'no-store');
    const body = { error: { code: httpError.code, message: httpError.message } };
    if (httpError.details) body.error.details = httpError.details;
    res.status(httpError.status).type('application/json').send(JSON.stringify(body));
  };
}

module.exports = { HttpError, unauthorized, projectNotFound, errorHandler };
