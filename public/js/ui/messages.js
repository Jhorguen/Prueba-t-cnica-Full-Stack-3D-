import { ApiError, NetworkError } from '../api/client.js';
import { hasKey, language, t } from '../i18n/index.js';
import { formatCount, formatMegabytes } from './format.js';

function describeServerFailure({ status, serverCode, message }, fallbackKey) {
  if (status === 401) return t('error.unauthorized');
  const key = `api.${serverCode}`;
  let text;
  if (serverCode && hasKey(key)) text = t(key);
  else if (message && language() === 'en') text = message;
  else text = t(fallbackKey);
  return t('error.withStatus', { message: text, status });
}

export function describeError(error, fallbackKey) {
  if (error instanceof NetworkError) return t('error.network');
  if (error instanceof ApiError) {
    return describeServerFailure({ status: error.status, serverCode: error.code, message: error.message }, 'api.generic');
  }
  return t(fallbackKey);
}

export function describeFieldError({ field }, params = {}) {
  return hasKey(`field.${field}`) ? t(`field.${field}`, params) : t('field.body');
}

const CLOUD_DESCRIBERS = {
  http: (error) => describeServerFailure(error, 'cloud.error.http'),
  truncated: ({ params = {} }) => {
    if (params.reason === 'bytes') {
      return t('cloud.error.truncatedBytes', {
        server: formatMegabytes(params.serverBytes),
        expected: formatMegabytes(params.expectedBytes),
      });
    }
    if (params.reason === 'points') {
      return t('cloud.error.truncatedPoints', {
        received: formatCount(params.received),
        total: formatCount(params.total),
      });
    }
    return t('cloud.error.truncatedHeader');
  },
  invalid_format: ({ params = {} }) => t(params.reason === 'extra' ? 'cloud.error.extraPoints' : 'cloud.error.notPts'),
  network: () => t('cloud.error.network'),
  unsupported: () => t('cloud.error.unsupported'),
  worker: ({ params = {} }) => {
    if (params.reason === 'offline') return t('cloud.error.offline');
    if (params.reason === 'unsupported') return t('cloud.error.workerUnsupported');
    return t('cloud.error.workerStart');
  },
};

export function describeCloudError(error) {
  const describe = error && CLOUD_DESCRIBERS[error.code];
  return describe ? describe(error) : t('cloud.error.unknown');
}
