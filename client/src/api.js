// The only file that talks to the server. Pages never call fetch() directly.
export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn);

async function request(path, { method = "GET", body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // Session expired or logged out elsewhere: send the user to the login page.
    if (res.status === 401 && !path.startsWith("/auth/login")) onUnauthorized();
    throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status, data?.code);
  }
  return data;
}

const qs = (params = {}) => {
  const p = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "" && v != null));
  const s = p.toString();
  return s ? `?${s}` : "";
};
const crud = (base) => ({
  list: (params) => request(`${base}${qs(params)}`),
  get: (id) => request(`${base}/${id}`),
  create: (body) => request(base, { method: "POST", body }),
  update: (id, body) => request(`${base}/${id}`, { method: "PUT", body }),
  remove: (id) => request(`${base}/${id}`, { method: "DELETE" }),
});

export const api = {
  login: (email, password) => request("/auth/login", { method: "POST", body: { email, password } }),
  logout: () => request("/auth/logout", { method: "POST" }),
  me: () => request("/auth/me"),
  changePassword: (current_password, new_password) =>
    request("/auth/change-password", { method: "POST", body: { current_password, new_password } }),

  dashboard: () => request("/dashboard"),
  settlement: () => request("/settlement"),
  settings: () => request("/settings"),
  saveSettings: (values) => request("/settings", { method: "PUT", body: { values } }),

  students: crud("/students"),
  lessons: crud("/lessons"),
  finance: crud("/finance"),
  tutors: {
    ...crud("/tutors"),
    saveScores: (id, scores) => request(`/tutors/${id}/scores`, { method: "PUT", body: scores }),
  },
  users: {
    ...crud("/users"),
    resetPassword: (id, password) => request(`/users/${id}/reset-password`, { method: "POST", body: { password } }),
  },
};
