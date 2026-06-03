// public/js/api.js — cliente da API REST

const API_BASE = 'https://snipex-proatus.wwyweh.easypanel.host/api';

function getToken()  { return localStorage.getItem('cpd_token'); }
function getRole()   { return localStorage.getItem('cpd_role'); }
function setAuth(token, role, clientId) {
  localStorage.setItem('cpd_token',     token);
  localStorage.setItem('cpd_role',      role);
  localStorage.setItem('cpd_client_id', clientId ?? '');
}
function clearAuth() {
  localStorage.removeItem('cpd_token');
  localStorage.removeItem('cpd_role');
  localStorage.removeItem('cpd_client_id');
}
function isLoggedIn() { return !!getToken(); }
function isSuperadmin() { return getRole() === 'superadmin'; }
function isAdmin()      { return ['superadmin','admin'].includes(getRole()); }

async function apiFetch(path, opts = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(API_BASE + path, { ...opts, headers });

  if (res.status === 401) {
    clearAuth();
    window.location.href = '/login.html';
    return;
  }

  let data;
  try { data = await res.json(); } catch { data = {}; }

  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

const api = {
  // Auth
  login: (email, password) =>
    apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  // Clients
  getClients: ()           => apiFetch('/clients'),
  createClient: (data)     => apiFetch('/clients', { method: 'POST', body: JSON.stringify(data) }),
  updateClient: (id, data) => apiFetch(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteClient: (id)       => apiFetch(`/clients/${id}`, { method: 'DELETE' }),

  // CPDs (locais)
  getCpds: ()           => apiFetch('/cpds'),
  getCpd: (id)          => apiFetch(`/cpds/${id}`),
  createCpd: (data)     => apiFetch('/cpds', { method: 'POST', body: JSON.stringify(data) }),
  updateCpd: (id, data) => apiFetch(`/cpds/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCpd: (id)       => apiFetch(`/cpds/${id}`, { method: 'DELETE' }),

  // Devices (sensores)
  getDevices: ()                  => apiFetch('/devices'),
  getDevicesByCpd: (cpdId)        => apiFetch(`/cpds/${cpdId}/devices`),
  createDevice: (cpdId, data)     => apiFetch(`/cpds/${cpdId}/devices`, { method: 'POST', body: JSON.stringify(data) }),
  updateDevice: (id, data)        => apiFetch(`/devices/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDevice: (id)              => apiFetch(`/devices/${id}`, { method: 'DELETE' }),

  // Contacts
  getContacts: (clientId)      => apiFetch(`/contacts${clientId ? `?client_id=${clientId}` : ''}`),
  createContact: (data)        => apiFetch('/contacts', { method: 'POST', body: JSON.stringify(data) }),
  updateContact: (id, data)    => apiFetch(`/contacts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteContact: (id)          => apiFetch(`/contacts/${id}`, { method: 'DELETE' }),

  // Dashboard / telemetry
  getStats:     () => apiFetch('/stats'),
  getTelemetry: () => apiFetch('/telemetry'),
  getDashboard: () => apiFetch('/dashboard'),
};
