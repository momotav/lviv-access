const API_BASE = import.meta.env.VITE_API_URL || '';
const TOKEN_KEY = 'lviv_access_token';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); }
  catch { return null; }
}

export function setToken(t) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

async function request(path, options = {}) {
  const url = `${API_BASE}/api${path}`;
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    let msg = `Request failed: ${res.status}`;
    try {
      const data = await res.json();
      if (data.error) msg = data.error;
    } catch {}
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  register: (data) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request('/auth/me'),

  listPoints: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.category) params.set('category', filters.category);
    if (filters.bbox) params.set('bbox', filters.bbox);
    const q = params.toString();
    return request(`/points${q ? `?${q}` : ''}`);
  },
  createPoint: (data) =>
    request('/points', { method: 'POST', body: JSON.stringify(data) }),
  deletePoint: (id) =>
    request(`/points/${id}`, { method: 'DELETE' }),

  computeRoute: ({ from, to, waypointType, travelMode }) =>
    request('/route', {
      method: 'POST',
      body: JSON.stringify({ from, to, waypointType, travelMode }),
    }),

  listReviews: (pointId) => request(`/points/${pointId}/reviews`),
  createOrUpdateReview: (pointId, data) =>
    request(`/points/${pointId}/reviews`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteReview: (pointId, reviewId) =>
    request(`/points/${pointId}/reviews/${reviewId}`, { method: 'DELETE' }),

  getUploadSignature: () =>
    request('/photos/sign', { method: 'POST', body: JSON.stringify({}) }),
};

export async function uploadImageToCloudinary(file) {
  const sig = await api.getUploadSignature();
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', sig.api_key);
  form.append('timestamp', String(sig.timestamp));
  form.append('signature', sig.signature);
  form.append('folder', sig.folder);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${sig.cloud_name}/image/upload`,
    { method: 'POST', body: form }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cloudinary upload failed: ${text.substring(0, 200)}`);
  }
  const data = await res.json();
  return data.secure_url;
}
