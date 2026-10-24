/* Talks to the SELAE server (server/api.js).

   This browser remembers a few things in localStorage:
   - host keys for events created here (they unlock managing the event)
   - ticket codes registered from here (shown under Events)
   - calendars it follows, and when it last read its notifications
   Clearing site data forgets them; the server still has the records. */

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

export const myTickets = {
  all: () => load(TICKETS, []),
  add(code, eventId) {
    const list = myTickets.all().filter((t) => t.code !== code);
    save(TICKETS, [{ code, eventId, savedAt: new Date().toISOString() }, ...list]);
  },
  forEvent: (eventId) => myTickets.all().find((t) => t.eventId === eventId) || null,
  remove(code) { save(TICKETS, myTickets.all().filter((t) => t.code !== code)); },
};

/** Calendars (hosts) this device follows, by name: their new events show up in notifications. */
export const follows = {
  all: () => load(FOLLOWS, []),
  has: (name) => follows.all().some((n) => n.toLowerCase() === String(name).toLowerCase()),
  toggle(name) {
    const list = follows.all();
    save(FOLLOWS, follows.has(name) ? list.filter((n) => n.toLowerCase() !== name.toLowerCase()) : [...list, name]);
    return follows.has(name);
  },
};

/** When this device last opened the notification list. */
export const seen = {
  get: () => load(SEEN, null),
  mark(time) { save(SEEN, time); },
};

/** Send an image as raw bytes (it has already been resized in the browser). */
async function upload(path, blob) {
  const keys = Object.values(hostKeys.all());
  const headers = { "Content-Type": blob.type || "image/jpeg" };
  if (keys.length) headers["X-Selae-Host-Key"] = keys.join(",");
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
  if (keys.length) headers["X-Selae-Host-Key"] = keys.join(",");
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
  events: () => request("GET", "/api/events"),
  event: (id) => request("GET", `/api/events/${id}`),
  async create(fields) {
    const out = await request("POST", "/api/events", fields);
    hostKeys.add(out.event.id, out.hostKey);
    return out.event;
  },
  update: (id, fields) => request("PATCH", `/api/events/${id}`, fields),
  async register(id, fields) {
    const out = await request("POST", `/api/events/${id}/register`, fields);
    myTickets.add(out.ticket.code, id);
    return out;
  },
  ticket: (code) => request("GET", `/api/tickets/${code}`),
  cancel: (code) => request("POST", `/api/tickets/${code}/cancel`),
  manage: (id, rev) => request("GET", `/api/events/${id}/manage${rev ? `?rev=${rev}` : ""}`),
  checkin: (id, body) => request("POST", `/api/events/${id}/checkin`, body),
  logUnresolved: (id, method, scanId) => request("POST", `/api/events/${id}/log`, { outcome: "unresolved", method, scanId }),
  match: (id, body) => request("POST", `/api/events/${id}/match`, body),
  resetMatcher: () => request("POST", "/api/matcher/reset"),
  promote: (id, regId) => request("POST", `/api/events/${id}/registrations/${regId}/promote`),
  release: (id, risk) => request("POST", `/api/events/${id}/release`, { risk }),
  uploadCover: (id, blob) => upload(`/api/events/${id}/cover`, blob),
  removeCover: (id) => request("DELETE", `/api/events/${id}/cover`),
  uploadPhoto: (id, blob) => upload(`/api/events/${id}/photos`, blob),
  removePhoto: (id, photoId) => request("DELETE", `/api/events/${id}/photos/${photoId}`),
  notifications: () => request("POST", "/api/notifications", { tickets: myTickets.all().map((t) => t.code), follow: follows.all() }),
};
