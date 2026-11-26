import { createPtsParser, PtsError } from './pts.js';

const PROGRESS_INTERVAL_MS = 50;

const megabytes = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'load') load(event.data);
});

function post(type, payload = {}, transfer = []) {
  self.postMessage({ type, ...payload }, transfer);
}

async function readServerError(response) {
  try {
    const body = await response.json();
    return { serverCode: body?.error?.code || null, message: body?.error?.message || null };
  } catch {
    return { serverCode: null, message: null };
  }
}

function declaredLength(response) {
  if (response.headers.get('Content-Encoding')) return null;
  const length = Number(response.headers.get('Content-Length'));
  return Number.isFinite(length) && length > 0 ? length : null;
}

async function load({ url, token, maxPoints }) {
  const controller = new AbortController();
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      const { serverCode, message } = await readServerError(response);
      post('error', { code: 'http', status: response.status, serverCode, message });
      return;
    }
    if (!response.body) {
      throw new PtsError('unsupported', 'This browser cannot stream the point cloud download.', { reason: 'stream' });
    }

    const serverLength = declaredLength(response);
    const parser = createPtsParser({ maxPoints });
    const reader = response.body.getReader();
    let lastReport = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const hadHeader = parser.header !== null;
      parser.push(value);
      const header = parser.header;

      if (!hadHeader && header && serverLength !== null && serverLength < header.byteLength) {
        controller.abort();
        throw new PtsError(
          'truncated',
          `The point cloud file is incomplete: the server has ${megabytes(serverLength)} but the file announces ${megabytes(header.byteLength)}.`,
          { reason: 'bytes', serverBytes: serverLength, expectedBytes: header.byteLength },
        );
      }

      const now = performance.now();
      if (now - lastReport >= PROGRESS_INTERVAL_MS) {
        lastReport = now;
        post('progress', { loaded: parser.received, total: header ? header.byteLength : serverLength });
      }
    }

    const cloud = parser.finish();
    post('progress', { loaded: parser.received, total: parser.header.byteLength });
    post('done', cloud, [cloud.positions.buffer, cloud.colors.buffer]);
  } catch (error) {
    if (error instanceof PtsError) {
      post('error', { code: error.code, message: error.message, params: error.params });
    } else if (controller.signal.aborted) {
      post('cancelled');
    } else if (error instanceof TypeError) {
      post('error', { code: 'network', message: 'The download was interrupted. Check your connection.' });
    } else {
      post('error', { code: 'unknown', message: 'The point cloud could not be read.' });
    }
  }
}
