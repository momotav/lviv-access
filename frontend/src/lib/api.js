const API_BASE = import.meta.env.VITE_API_URL || '';

async function request(path, options = {}) {
  const url = `${API_BASE}/api${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  if (!res.ok) {
    let msg = `Request failed: ${res.status}`;
    try {
      const data = await res.json();
      if (data.error) msg = data.error;
    } catch (_) {}
    throw new Error(msg);
  }

  if (res.status === 204) return null;
  return res.json();
}

export const api = {
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
  // NEW: compute route
  computeRoute: ({ from, to, waypointType }) =>
    request('/route', {
      method: 'POST',
      body: JSON.stringify({ from, to, waypointType }),
    }),
};
