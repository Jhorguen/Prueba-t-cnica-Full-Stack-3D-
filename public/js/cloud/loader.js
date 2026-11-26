export class CloudLoadError extends Error {
  constructor(code, message, { status, serverCode, params } = {}) {
    super(message);
    this.name = 'CloudLoadError';
    this.code = code;
    this.status = status;
    this.serverCode = serverCode;
    this.params = params || {};
  }
}

const abortError = () => new DOMException('The point cloud download was cancelled.', 'AbortError');

export function loadPointCloud({ url, token, maxPoints, signal, onProgress }) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }

    let worker;
    try {
      worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    } catch {
      reject(new CloudLoadError('worker', 'This browser could not start the point cloud reader.', { params: { reason: 'unsupported' } }));
      return;
    }

    let settled = false;
    const settle = () => {
      settled = true;
      worker.terminate();
      signal.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      if (settled) return;
      settle();
      reject(abortError());
    };
    signal.addEventListener('abort', onAbort);

    worker.addEventListener('message', ({ data }) => {
      if (settled) return;
      if (data.type === 'progress') {
        if (onProgress) onProgress(data.loaded, data.total);
      } else if (data.type === 'done') {
        settle();
        resolve(data);
      } else if (data.type === 'error') {
        settle();
        reject(new CloudLoadError(data.code, data.message, data));
      } else if (data.type === 'cancelled') {
        settle();
        reject(abortError());
      }
    });

    const onWorkerFailure = (event) => {
      event.preventDefault();
      if (settled) return;
      settle();
      const offline = navigator.onLine === false;
      const message = offline
        ? 'You appear to be offline. Check your connection.'
        : 'The point cloud reader could not start. Check your connection.';
      reject(new CloudLoadError('worker', message, { params: { reason: offline ? 'offline' : 'start' } }));
    };
    worker.addEventListener('error', onWorkerFailure);
    worker.addEventListener('messageerror', onWorkerFailure);

    worker.postMessage({ type: 'load', url, token, maxPoints });
  });
}
