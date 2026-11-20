/* Talks to the SELAE server */
import { accessToken } from "./auth.js";

const KEYS = "selae.hostKeys";
const TICKETS = "selae.tickets";
const FOLLOWS = "selae.follows";
const SEEN = "selae.notificationsSeen";

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: still works for this visit */ }
}

export const hostKeys = {
  all: () => load(KEYS, {}),
  add(eventId, key) { save(KEYS, { ...hostKeys.all(), [eventId]: key }); },
};

// Tickets used to be remembered by the browser, so whoever signed in next on a shared device saw them.
// They now come from the account (/api/me → tickets); the old browser copy is cleared.
try { localStorage.removeItem(TICKETS); } catch { /* private mode */ }

// Calendars each account follows, kept per account so whoever signs in next on the same browser
// doesn't inherit them. Signed out (no uid) there is nothing to follow.
const followMap = () => { const all = load(FOLLOWS, {}); return all && typeof all === "object" && !Array.isArray(all) ? all : {}; };
export const follows = {
  all: (uid) => (uid ? followMap()[uid] || [] : []),
  has: (uid, name) => follows.all(uid).some((n) => n.toLowerCase() === String(name).toLowerCase()),
  toggle(uid, name) {
    if (!uid) return false;
    const list = follows.all(uid);
    const next = follows.has(uid, name) ? list.filter((n) => n.toLowerCase() !== name.toLowerCase()) : [...list, name];
    save(FOLLOWS, { ...followMap(), [uid]: next });
    return follows.has(uid, name);
  },
};

// Last time each account opened its notifications
export const seen = {
  get: (uid) => (load(SEEN, {}) || {})[uid] || null,
  mark(uid, time) { const all = load(SEEN, {}); save(SEEN, { ...(typeof all === "object" && all ? all : {}), [uid]: time }); },
};

async function upload(path, blob) {
  const keys = Object.values(hostKeys.all());
  const headers = { "Content-Type": blob.type || "image/jpeg" };
  const token = await accessToken();
  // Signed in, the account decides what can be managed; host keys only count when nobody is signed in
  if (token) headers.Authorization = `Bearer ${token}`;
  else if (keys.length) headers["X-Selae-Host-Key"] = keys.join(",");
  let res;
  try { res = await fetch(path, { method: "POST", headers, body: blob }); } catch {
    throw new Error("Can't reach the SELAE server to upload. Check the Wi-Fi and try again.");
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new Error((data && data.error) || `Upload failed (${res.status}).`);
  return data;
}

async function request(method, path, body) {
  const keys = Object.values(hostKeys.all());
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = await accessToken();
  // Signed in, the account decides what can be managed; host keys only count when nobody is signed in
  if (token) headers.Authorization = `Bearer ${token}`;
  else if (keys.length) headers["X-Selae-Host-Key"] = keys.join(",");
  let res;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new Error("Can't reach the SELAE server. Check that the laptop running it is on and you're on the same Wi-Fi.");
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status}).`);
  return data;
}

export const api = {
  info: () => request("GET", "/api/info"),
  studentNumberFree: (studentId) => request("GET", `/api/student-numbers/${encodeURIComponent(studentId)}`),
  me: () => request("GET", "/api/me"),
  saveProfile: (body) => request("PUT", "/api/me/profile", body),
  orgMembers: () => request("GET", "/api/org/members"),
  inviteOfficer: (email) => request("POST", "/api/org/members", { email }),
  removeOfficer: (id) => request("DELETE", `/api/org/members/${id}`),
  answerInvite: (id, choice) => request("POST", `/api/me/invites/${id}/${choice}`),
  adminOrgs: () => request("GET", "/api/admin/orgs"),
  adminReport: (from, to) => request("GET", `/api/admin/report?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`),
  createOrg: (body) => request("POST", "/api/admin/orgs", body),
  updateOrg: (id, body) => request("PATCH", `/api/admin/orgs/${id}`, body),
  resendOrgPassword: (id) => request("POST", `/api/admin/orgs/${id}/password`),
  changePassword: (password) => request("POST", "/api/me/password", { password }),
  events: () => request("GET", "/api/events"),
  event: (id) => request("GET", `/api/events/${id}`),
  async create(fields) {
    // Events are made by an organization or its officers, who manage them through their accounts,
    // so the event's host key isn't kept in this browser for whoever signs in next
    const out = await request("POST", "/api/events", fields);
    return out.event;
  },
  update: (id, fields) => request("PATCH", `/api/events/${id}`, fields),
  // Uses the signed-in student's profile
  async register(id) {
    return request("POST", `/api/events/${id}/register`, {});
  },
  ticket: (code) => request("GET", `/api/tickets/${code}`),
  cancel: (code) => request("POST", `/api/tickets/${code}/cancel`),
  manage: (id, rev) => request("GET", `/api/events/${id}/manage${rev ? `?rev=${rev}` : ""}`),
  checkin: (id, body) => request("POST", `/api/events/${id}/checkin`, body),
  addStudent: (id, body) => request("POST", `/api/events/${id}/walkin`, body),
  logUnresolved: (id, method, scanId) => request("POST", `/api/events/${id}/log`, { outcome: "unresolved", method, scanId }),
  match: (id, body) => request("POST", `/api/events/${id}/match`, body),
  matchFace: (id, body) => request("POST", `/api/events/${id}/match-face`, body),
  resetMatcher: () => request("POST", "/api/matcher/reset"),
  promote: (id, regId, force) => request("POST", `/api/events/${id}/registrations/${regId}/promote`, { force: Boolean(force) }),
  release: (id, risk) => request("POST", `/api/events/${id}/release`, { risk }),
  uploadCover: (id, blob) => upload(`/api/events/${id}/cover`, blob),
  // The organization's own profile photo ("logo") and cover
  uploadOrgImage: (kind, blob) => upload(`/api/org/image/${kind}`, blob),
  removeOrgImage: (kind) => request("DELETE", `/api/org/image/${kind}`),
  removeCover: (id) => request("DELETE", `/api/events/${id}/cover`),
  uploadPhoto: (id, blob) => upload(`/api/events/${id}/photos`, blob),
  removePhoto: (id, photoId) => request("DELETE", `/api/events/${id}/photos/${photoId}`),
  notifications: (uid) => request("POST", "/api/notifications", { follow: follows.all(uid) }),
};
