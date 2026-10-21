// All communication with the backend goes through this file.
const BASE = 'https://cspm-platform.onrender.com/api';
const TOKEN_KEY = 'cspm_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiClientError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function send(path, { method = 'GET', body } = {}) {
  const headers = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiClientError('Cannot reach the server. Check that the backend is running.', 0);
  }
  return { res, hadToken: Boolean(token) };
}

async function fail(res, hadToken) {
  const json = await res.json().catch(() => null);
  if (res.status === 401 && hadToken) {
    tokenStore.clear();
    window.dispatchEvent(new Event('cspm:unauthorized')); // AuthContext listens and logs the user out
  }
  throw new ApiClientError(json?.error?.message || `Request failed (${res.status})`, res.status, json?.error?.details);
}

async function request(path, options) {
  const { res, hadToken } = await send(path, options);
  if (!res.ok) await fail(res, hadToken);
  const json = await res.json().catch(() => null);
  if (!json?.success) throw new ApiClientError('The server sent an unexpected response.', res.status);
  return json.data;
}

// Downloads a CSV/PDF. A normal <a href> cannot send the login token, so we fetch the file and save it ourselves.
async function download(path, filename) {
  const { res, hadToken } = await send(path);
  if (!res.ok) await fail(res, hadToken);
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const qs = (params) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v && q.set(k, v));
  const text = q.toString();
  return text ? `?${text}` : '';
};

export const api = {
  register: (body) => request('/auth/register', { method: 'POST', body }),
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  me: () => request('/auth/me'),
  sample: (id) => request(`/samples/${id}`),
  dashboard: () => request('/dashboard'),
  scans: () => request('/scans'),
  scan: (id) => request(`/scans/${id}`),
  createScan: (body) => request('/scans', { method: 'POST', body }),
  validateScan: (config) => request('/scans/validate', { method: 'POST', body: { config } }),
  deleteScan: (id) => request(`/scans/${id}`, { method: 'DELETE' }),
  findings: (id, filters) => request(`/scans/${id}/findings${qs(filters)}`),
  finding: (id, findingId) => request(`/scans/${id}/findings/${findingId}`),
  resources: (id, filters) => request(`/scans/${id}/resources${qs(filters)}`),
  downloadReport: (id, format) => download(`/scans/${id}/report.${format}`, `cspm-report-${id}.${format}`),
};
