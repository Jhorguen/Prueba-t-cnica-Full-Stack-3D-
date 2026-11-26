export class ApiError extends Error {
  constructor(status, code, message, details = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class NetworkError extends Error {
  constructor() {
    super('Could not reach the server. Check your connection.');
    this.name = 'NetworkError';
  }
}

export const isAbort = (error) => error && error.name === 'AbortError';

export function createApi(getToken) {
  async function request(path, { method = 'GET', body, signal } = {}) {
    const headers = { Authorization: `Bearer ${getToken()}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let response;
    let text;
    try {
      response = await fetch(path, {
        method,
        headers,
        signal,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      text = await response.text();
    } catch (error) {
      if (isAbort(error)) throw error;
      throw new NetworkError();
    }

    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      const error = payload && payload.error;
      throw new ApiError(
        response.status,
        error?.code || 'http_error',
        error?.message || `The server answered with status ${response.status}.`,
        Array.isArray(error?.details) ? error.details : [],
      );
    }
    return payload;
  }

  return {
    listProjects: (signal) => request('/api/projects', { signal }),
    getProject: (id, signal) => request(`/api/projects/${encodeURIComponent(id)}`, { signal }),
    getSpaces: (id, signal) => request(`/api/projects/${encodeURIComponent(id)}/spaces`, { signal }),
    createIssue: (id, issue, signal) => request(`/api/projects/${encodeURIComponent(id)}/issues`, {
      method: 'POST',
      body: issue,
      signal,
    }),
    cloudUrl: (id) => `/api/projects/${encodeURIComponent(id)}/cloud`,
    me: (signal) => request('/api/me', { signal }),
    listIssues: (signal) => request('/api/issues', { signal }),
    updateIssue: (id, status, signal) => request(`/api/issues/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { status },
      signal,
    }),
  };
}
