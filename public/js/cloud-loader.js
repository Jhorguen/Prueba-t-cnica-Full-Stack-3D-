export class CloudLoadError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'CloudLoadError';
    this.code = code;
    this.status = status;
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
      worker = new Worker(new URL('./cloud-worker.js', import.meta.url), { type: 'module' });
    } catch {
      reject(new CloudLoadError('worker', 'This browser could not start the point cloud reader.'));
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
        reject(new CloudLoadError(data.code, data.message, data.status));
      } else if (data.type === 'cancelled') {
        settle();
        reject(abortError());
      }
    });

    const onWorkerFailure = (event) => {
      event.preventDefault();
      if (settled) return;
      settle();
      reject(new CloudLoadError('worker', 'The point cloud reader stopped unexpectedly.'));
    };
    worker.addEventListener('error', onWorkerFailure);
    worker.addEventListener('messageerror', onWorkerFailure);

    worker.postMessage({ type: 'load', url, token, maxPoints });
  });
}
