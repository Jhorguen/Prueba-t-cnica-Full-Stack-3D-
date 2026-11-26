import { ApiError, NetworkError } from '../api/client.js';

export function describeError(error, fallback) {
  if (error instanceof NetworkError) return error.message;
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Your access token was rejected (HTTP 401). Choose the user again.';
    return `${error.message} (HTTP ${error.status})`;
  }
  return fallback;
}

export function describeCloudError(error) {
  if (error && error.code === 'http') {
    return `${error.message || 'The server could not send the point cloud.'} (HTTP ${error.status})`;
  }
  return (error && error.message) || 'The point cloud could not be loaded.';
}
