import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { newCode, newId, hashKey } from "./seed.js";
import { ensureModel, rank, priorWeight, learn, pretty, digitsOf, topConfusions, digitAccuracy, emptyModel } from "./matcher.js";
import { trainTurnout, predictEvent, forecastNow, DEFAULT_RISK } from "./forecast.js";

/* Logical layer */

const COLORS = ["gold", "blue", "green", "rose", "violet", "teal"];
export const CATEGORIES = ["Workshop", "Talk", "Hackathon", "Study jam", "Career", "Social", "Assembly", "Competition", "General"];
const MAX_PHOTOS = 60;
const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const SUFFIXES = ["", "Jr.", "Sr.", "II", "III", "IV"];
const STUDENT_ID = /^(\d{4})\s*-?\s*(\d{5})$/;
const TICKET = /^SELAE1:([a-z0-9-]+):([A-Z2-9]{10})$/;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };

const FORWARDED_HEADERS = ["x-forwarded-for", "forwarded", "x-real-ip"];
// Requests through a tunnel or proxy reach us from loopback, but aren't local
const isLocal = (req) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress)
  && !FORWARDED_HEADERS.some((h) => req.headers[h]);

/* ---------- name standardization (Surname, Given M.) ---------- */
function tidyName(raw) {
  const s = String(raw || "").trim().replace(/\s+/g, " ");
  if (!s) return "";
  if (s !== s.toLowerCase() && s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());
}
function tidyInitial(raw) {
  const m = String(raw || "").trim().match(/\p{L}/u);
  return m ? m[0].toUpperCase() : "";
}

/* ---------- views ---------- */
function counts(data, eventId) {
  let going = 0, waitlist = 0, checkedIn = 0;
  for (const r of data.registrations) {
    if (r.eventId !== eventId) continue;
    if (r.status === "going") going++;
    else if (r.status === "waitlist") waitlist++;
    if (r.checkin) checkedIn++;
  }
  return { going, waitlist, checkedIn };
}
function canManage(req, event) {
  if (isLocal(req)) return true;
  const key = req.headers["x-selae-host-key"];
  if (!key) return false;
  const keys = String(key).split(",").map((k) => k.trim());
  return keys.some((k) => hashKey(k) === event.hostKeyHash);
}
function publicEvent(data, req, e) {
  const c = counts(data, e.id);
  const { hostKeyHash, ...rest } = e;
  const isPast = Date.now() > new Date(e.endsAt).getTime();
  return { ...rest, category: e.category || "General", coverImage: e.coverImage || null, photos: e.photos || [],
    counts: c, spotsLeft: Math.max(0, e.capacity - c.going), isPast,
    registrationOpen: e.registrationOpen && !isPast, canManage: canManage(req, e) };
}
function ticketView(data, req, reg) {
  const event = data.events.find((e) => e.id === reg.eventId);
  const student = reg.student || data.directory[reg.studentId];
  return {
    code: reg.code, status: reg.status, createdAt: reg.createdAt, checkin: reg.checkin,
    student, event: event ? publicEvent(data, req, event) : null,
  };
}

/* ---------- validation ---------- */
function str(v, field, { max, required = true } = {}) {
  const s = String(v ?? "").trim();
  if (required && !s) fail(400, `${field} is required.`);
  if (max && s.length > max) fail(400, `${field} must be ${max} characters or fewer.`);
  return s;
}
function eventFields(body, existing = {}) {
  const has = (k) => body[k] !== undefined;
  const out = {};
  if (has("title") || !existing.title) out.title = str(body.title, "Title", { max: 120 });
  if (has("venue") || !existing.venue) out.venue = str(body.venue, "Venue", { max: 120 });
  if (has("description")) out.description = str(body.description, "Description", { max: 2000, required: false });
  if (has("hostName")) out.hostName = str(body.hostName, "Host name", { max: 80, required: false });
  if (has("capacity") || !existing.capacity) {
    const n = Number(body.capacity);
    if (!Number.isInteger(n) || n < 1 || n > 100000) fail(400, "Capacity must be a whole number from 1 to 100,000.");
    out.capacity = n;
  }
  for (const k of ["startsAt", "endsAt"]) {
    if (has(k) || !existing[k]) {
      const d = new Date(body[k]);
      if (Number.isNaN(d.getTime())) fail(400, `${k === "startsAt" ? "Start" : "End"} time is missing or invalid.`);
      out[k] = d.toISOString();
    }
  }
  const starts = new Date(out.startsAt || existing.startsAt), ends = new Date(out.endsAt || existing.endsAt);
  if (ends <= starts) fail(400, "The event has to end after it starts.");
  if (has("color")) { if (!COLORS.includes(body.color)) fail(400, "Unknown cover color."); out.color = body.color; }
  if (has("visibility")) { if (!["public", "unlisted"].includes(body.visibility)) fail(400, "Unknown visibility."); out.visibility = body.visibility; }
  if (has("registrationOpen")) out.registrationOpen = Boolean(body.registrationOpen);
  if (has("category") || !existing.category) out.category = CATEGORIES.includes(body.category) ? body.category : "General";
  return out;
}

/* ---------- check-in rules ---------- */
function checkIn(data, event, body, canLearn) {
  const now = new Date().toISOString();
  const method = ["qr", "barcode", "ocr", "face", "confirmed", "manual"].includes(body.method) ? body.method : "manual";
  const confidence = typeof body.confidence === "number" ? Math.max(0, Math.min(1, body.confidence)) : null;
  const log = (outcome, studentId, extra = {}) =>
    data.logs.push({ uid: newId(), eventId: event.id, time: now, studentId: studentId || null, outcome, method, ...extra });

  let reg = null;
  let studentId = null;
  if (body.ticket) {
    const m = String(body.ticket).trim().match(TICKET);
    const found = m && data.registrations.find((r) => r.code === m[2]);
    if (!found) { log("unresolved", null); return { outcome: "unresolved", time: now }; }
    if (found.eventId !== event.id) {
      const other = data.events.find((e) => e.id === found.eventId);
      log("wrongevent", found.studentId);
      return { outcome: "wrongevent", time: now, student: data.directory[found.studentId], otherEvent: other ? { id: other.id, title: other.title, startsAt: other.startsAt } : null };
    }
    reg = found;
    studentId = found.studentId;
  } else {
    const m = String(body.studentId || "").match(STUDENT_ID);
    if (!m) fail(400, "Send a ticket or a student number.");
    studentId = `${m[1]}-${m[2]}`;
    reg = data.registrations.find((r) => r.eventId === event.id && r.studentId === studentId && r.status !== "cancelled") || null;
  }

  const learned = resolveScan(data, event, body, method, studentId, canLearn);

  const student = data.directory[studentId] || { id: studentId, last: "", first: "", middle: "", suffix: "", section: "" };
  if (!reg || reg.status === "cancelled") { log("notreg", studentId); return { outcome: "notreg", time: now, student }; }
  if (reg.status === "waitlist") { log("waitlist", studentId); return { outcome: "waitlist", time: now, student }; }
  if (reg.checkin) { log("dup", studentId); return { outcome: "dup", time: now, student, previous: reg.checkin }; }
  if (body.forceFull || counts(data, event.id).checkedIn >= event.capacity) { log("full", studentId); return { outcome: "full", time: now, student }; }
  reg.checkin = { time: now, method, confidence };
  log("approved", studentId, { confidence });
  return { outcome: "approved", time: now, student, checkin: reg.checkin, learned: Boolean(learned) };
}

/* ---------- OCR matching (see matcher.js) ---------- */
const MAX_SCANS = 3000;
const REGISTER_LIMIT = 20;
const REGISTER_WINDOW = 60000;

function peopleFor(data, event) {
  const regs = new Map();
  for (const r of data.registrations) if (r.eventId === event.id && r.status !== "cancelled") regs.set(r.studentId, r);
  return Object.values(data.directory).map((s) => ({ id: s.id, weight: priorWeight(regs.get(s.id)), reg: regs.get(s.id) || null }));
}

function statusOf(reg) {
  if (!reg) return "notreg";
  if (reg.status === "waitlist") return "waitlist";
  return reg.checkin ? "inside" : "going";
}

function matchRead(data, event, body) {
  const read = digitsOf(body.read);
  if (!read.length || read.length > 20) fail(400, "Send the digits OCR read.");
  const conf = Array.isArray(body.conf) && body.conf.length === read.length && body.conf.every((c) => typeof c === "number")
    ? body.conf.map((c) => Math.max(0, Math.min(1, c))) : null;
  const model = ensureModel(data);
  const out = rank(peopleFor(data, event), read, conf, model);
  const scan = {
    id: newId(), eventId: event.id, time: new Date().toISOString(), read, conf, source: body.source === "demo" ? "demo" : "camera",
    decision: out.decision, pUnknown: out.pUnknown,
    candidates: out.candidates.map((c) => ({ id: c.id, p: c.p })),
    resolution: null, truth: null, rank: null, learned: null,
  };
  data.ocrScans.push(scan);
  if (data.ocrScans.length > MAX_SCANS) data.ocrScans.splice(0, data.ocrScans.length - MAX_SCANS);
  return {
    scanId: scan.id, read: pretty(read), decision: out.decision, pUnknown: out.pUnknown, thresholds: out.thresholds,
    candidates: out.candidates.map((c) => ({ p: c.p, status: statusOf(c.reg),
      student: data.directory[c.id] || { id: c.id, last: "", first: "", middle: "", suffix: "", section: "" } })),
  };
}

// Euclidean distance matching helper
function euclideanDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== 128 || b.length !== 128) return Infinity;
  let sum = 0;
  for (let i = 0; i < 128; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

const FACE_AUTO_THRESHOLD = 0.48;
const FACE_CONFIRM_THRESHOLD = 0.58;

function matchFace(data, event, body) {
  const desc = body.descriptor;
  if (!Array.isArray(desc) || desc.length !== 128 || !desc.every((n) => typeof n === "number" && Number.isFinite(n))) {
    fail(400, "Send a valid 128-float face descriptor.");
  }

  const regs = new Map();
  for (const r of data.registrations) {
    if (r.eventId === event.id && r.status !== "cancelled") regs.set(r.studentId, r);
  }

  const scored = [];
  for (const s of Object.values(data.directory)) {
    const reg = regs.get(s.id) || null;
    const targetDesc = (reg && reg.faceDescriptor) || s.faceDescriptor;
    if (!targetDesc) continue;

    const dist = euclideanDistance(desc, targetDesc);
    // Convert distance [0, 1.0+] into a confidence score [0, 1]
    const p = Math.max(0, Math.min(1, 1 - dist / 1.0));
    scored.push({
      id: s.id,
      dist,
      p,
      status: statusOf(reg),
      student: s,
    });
  }

  scored.sort((a, b) => a.dist - b.dist);
  const candidates = scored.slice(0, 3);
  const top = candidates[0] || null;

  let decision = "reject";
  if (top) {
    if (top.dist <= FACE_AUTO_THRESHOLD) decision = "auto";
    else if (top.dist <= FACE_CONFIRM_THRESHOLD) decision = "confirm";
  }

  return {
    decision,
    candidates: candidates.map((c) => ({
      p: c.p,
      dist: Math.round(c.dist * 1000) / 1000,
      status: c.status,
      student: c.student,
    })),
  };
}

function resolveScan(data, event, body, method, studentId, canLearn) {
  if (!body.scanId) return null;
  const scan = (data.ocrScans || []).find((s) => s.id === body.scanId && s.eventId === event.id);
  if (!scan || (scan.resolution && scan.resolution !== "none")) return null;
  scan.resolution = method === "ocr" ? "auto" : method === "confirmed" ? "confirmed" : "manual";
  scan.truth = studentId;
  scan.rank = scan.candidates.findIndex((c) => c.id === studentId);
  // Demo reads are simulated, and the model is shared by every event, so only the venue laptop teaches it
  if (canLearn && scan.source !== "demo" && (method === "confirmed" || method === "manual")) scan.learned = learn(ensureModel(data), scan.read, studentId);
  return scan.learned;
}

function matcherSummary(data, eventId) {
  const model = ensureModel(data);
  const allScans = data.ocrScans.filter((s) => s.eventId === eventId);
  // Stats cover real reads only
  const scans = allScans.filter((s) => s.source !== "demo");
  const by = (k, v) => scans.filter((s) => s[k] === v).length;
  const labelled = scans.filter((s) => s.resolution === "confirmed" || s.resolution === "manual");
  return {
    corrections: model.corrections,
    updatedAt: model.updatedAt,
    thresholds: model.thresholds,
    digitAccuracy: { prior: digitAccuracy(null), now: digitAccuracy(model) },
    topConfusions: topConfusions(model),
    scans: {
      total: scans.length,
      auto: by("decision", "auto"), confirm: by("decision", "confirm"), reject: by("decision", "reject"),
      // Labelled reads
      labelled: labelled.length,
      top1: labelled.filter((s) => s.rank === 0).length,
      top3: labelled.filter((s) => s.rank >= 0).length,
      none: by("resolution", "none"),
      demo: allScans.length - scans.length,
    },
    recent: allScans.slice(-8).reverse().map((s) => ({ time: s.time, read: pretty(s.read), decision: s.decision, top: s.candidates[0] || null,
      resolution: s.resolution, truth: s.truth, learned: s.learned, demo: s.source === "demo" })),
  };
}

/* ---------- routing ---------- */
async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 64 * 1024) fail(413, "Request too large.");
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { fail(400, "Invalid JSON."); }
}

async function readImage(req, limit = 8 * 1024 * 1024) {
  const type = String(req.headers["content-type"] || "").split(";")[0].trim();
  if (!IMAGE_TYPES[type]) fail(415, "Upload a JPEG, PNG or WebP image.");
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) fail(413, "That image is too large. Try one under 8 MB.");
    chunks.push(c);
  }
  const buf = Buffer.concat(chunks);
  const magic = buf.subarray(0, 12);
  const ok = (type === "image/jpeg" && magic[0] === 0xff && magic[1] === 0xd8)
    || (type === "image/png" && magic.toString("hex", 0, 8) === "89504e470d0a1a0a")
    || (type === "image/webp" && magic.toString("ascii", 0, 4) === "RIFF" && magic.toString("ascii", 8, 12) === "WEBP");
  if (!buf.length || !ok) fail(400, "That file isn't a readable image.");
  return { buf, ext: IMAGE_TYPES[type] };
}
const UPLOAD_NAME = /^[a-z0-9-]+\.(jpg|png|webp)$/;
const UPLOAD_TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

function lanUrls(req) {
  const port = (req.headers.host || "").split(":")[1] || "";
  const urls = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === "IPv4" && !a.internal) urls.push(`http://${a.address}${port ? ":" + port : ""}`);
  }
  return urls;
}

/* ---------- notifications ---------- */
function notificationsFor(data, req, body) {
  const now = Date.now();
  const DAY = 86400000;
  const items = [];
  const add = (time, item) => { const t = new Date(time).getTime(); if (t <= now && t > now - 30 * DAY) items.push({ time: new Date(t).toISOString(), ...item }); };
  const eventById = new Map(data.events.map((e) => [e.id, e]));
  const brief = (e) => ({ eventId: e.id, title: e.title });

  // Tickets registered on this device
  const codes = new Set((Array.isArray(body.tickets) ? body.tickets : []).slice(0, 200).map(String));
  for (const r of data.registrations) {
    if (!codes.has(r.code)) continue;
    const e = eventById.get(r.eventId);
    if (!e) continue;
    const start = new Date(e.startsAt).getTime(), end = new Date(e.endsAt).getTime();
    if (r.status === "going" && r.promotedAt) add(r.promotedAt, { kind: "promoted", ...brief(e), code: r.code, text: `You're in! You moved off the waitlist for ${e.title}.` });
    else if (r.status === "going") add(r.createdAt, { kind: "registered", ...brief(e), code: r.code, text: `You're going to ${e.title}. Show your student ID at the entrance.` });
    else if (r.status === "waitlist") add(r.createdAt, { kind: "waitlist", ...brief(e), code: r.code, text: `You're on the waitlist for ${e.title}.` });
    if (r.status === "going" && !r.checkin && start > now && start - now < DAY) add(start - DAY, { kind: "soon", ...brief(e), code: r.code, text: `${e.title} starts within a day. Keep your student ID handy.` });
    if (r.checkin) add(r.checkin.time, { kind: "checkin", ...brief(e), code: r.code, text: `Checked in at ${e.title}. Enjoy!` });
    const photos = e.photos || [];
    if (r.checkin && photos.length && end < now) add(photos[photos.length - 1].uploadedAt, { kind: "photos", ...brief(e), text: photos.length === 1 ? `A photo from ${e.title} is up.` : `${photos.length} photos from ${e.title} are up.` });
  }

  // Events this device hosts
  for (const e of data.events) {
    if (!canManage(req, e) || e.simulated) continue;
    // Host notices
    const ownKey = String(req.headers["x-selae-host-key"] || "").split(",").some((k) => k.trim() && hashKey(k.trim()) === e.hostKeyHash);
    const soon = new Date(e.startsAt).getTime() - now < 3 * DAY;
    if (!ownKey && !soon && new Date(e.endsAt).getTime() > now) continue;
    const regs = data.registrations.filter((r) => r.eventId === e.id && r.status !== "cancelled");
    const end = new Date(e.endsAt).getTime();
    if (regs.length && end > now) {
      const latest = regs.reduce((a, r) => (r.createdAt > a ? r.createdAt : a), regs[0].createdAt);
      const going = regs.filter((r) => r.status === "going").length, wait = regs.length - going;
      add(latest, { kind: "registrations", ...brief(e), host: true,
        text: `${e.title}: ${going} going${wait ? `, ${wait} on the waitlist` : ""}.` });
    }
    if (end < now && end > now - 7 * DAY && !(e.photos || []).length) add(end, { kind: "photosPrompt", ...brief(e), host: true, text: `${e.title} has ended. Add photos from the event for your guests.` });
  }

  // Calendars (hosts) this device follows
  const follows = new Set((Array.isArray(body.follow) ? body.follow : []).slice(0, 50).map((x) => String(x).toLowerCase()));
  for (const e of data.events) {
    if (e.visibility !== "public" || !e.hostName || !follows.has(e.hostName.toLowerCase())) continue;
    if (new Date(e.endsAt).getTime() < now) continue;
    add(e.createdAt, { kind: "newEvent", ...brief(e), text: `${e.hostName} posted ${e.title}.` });
  }

  return items.sort((a, b) => b.time.localeCompare(a.time)).slice(0, 40);
}

/* ---------- turnout forecast (see forecast.js) ---------- */
function historyKey(data, now) {
  const past = new Set(data.events.filter((e) => new Date(e.endsAt) < now).map((e) => e.id));
  let regs = 0, came = 0;
  for (const r of data.registrations) if (past.has(r.eventId)) { regs += r.status === "going"; came += Boolean(r.checkin); }
  return `${[...past].sort().join(",")}|${regs}|${came}`;
}

export function createApi(store) {
  let turnout = null, turnoutKey = "";
  const turnoutModel = () => {
    const now = new Date();
    const key = historyKey(store.data, now);
    if (!turnout || key !== turnoutKey) { turnout = trainTurnout(store.data, now); turnoutKey = key; }
    return turnout;
  };
  const forecastFor = (event, risk = DEFAULT_RISK) => {
    const model = turnoutModel();
    const regs = store.data.registrations.filter((r) => r.eventId === event.id);
    return forecastNow({ capacity: event.capacity, startsAt: event.startsAt, endsAt: event.endsAt, regs,
      preds: predictEvent(model, store.data, event), arrival: model.arrival, spread: model.spread, now: new Date(), risk });
  };
  const forecastSummary = (event) => {
    const m = turnoutModel();
    return {
      model: { ready: m.ready, trainedAt: m.trainedAt, events: m.events, examples: m.examples, simulated: m.simulated,
        baseRate: m.baseRate, holdout: m.holdout, weights: m.weights, spread: m.spread },
      arrival: m.arrival,
      spread: m.spread,
      preds: predictEvent(m, store.data, event),
      defaultRisk: DEFAULT_RISK,
    };
  };
  const findEvent = (id) => store.data.events.find((e) => e.id === id) || fail(404, "Event not found.");
  const saveUpload = (prefix, { buf, ext }) => {
    const name = `${prefix}-${newId()}.${ext}`.toLowerCase().replace(/[^a-z0-9.-]/g, "-");
    fs.writeFileSync(path.join(store.uploadsDir, name), buf);
    return `/uploads/${name}`;
  };
  const removeUpload = (url) => {
    const name = String(url || "").replace(/^\/uploads\//, "");
    if (UPLOAD_NAME.test(name)) fs.rm(path.join(store.uploadsDir, name), { force: true }, () => {});
  };
  const registerHits = new Map();
  const limitRegistrations = (req) => {
    const now = Date.now();
    if (registerHits.size > 5000) registerHits.clear();
    const ip = req.socket.remoteAddress;
    const hits = (registerHits.get(ip) || []).filter((t) => now - t < REGISTER_WINDOW);
    if (hits.length >= REGISTER_LIMIT) fail(429, "Too many registrations from this device. Wait a minute and try again.");
    hits.push(now);
    registerHits.set(ip, hits);
  };
  const requireManage = (req, event) => { if (!canManage(req, event)) fail(403, "Only this event's hosts can do that."); };

  const routes = [
    ["GET", /^\/api\/info$/, (req) => ({ isLocal: isLocal(req), lanUrls: lanUrls(req) })],

    ["GET", /^\/api\/events$/, (req) => {
      const d = store.data;
      return d.events
        .filter((e) => e.visibility === "public" || canManage(req, e))
        .map((e) => publicEvent(d, req, e))
        .sort((a, b) => (a.isPast - b.isPast) || (a.isPast ? b.startsAt.localeCompare(a.startsAt) : a.startsAt.localeCompare(b.startsAt)));
    }],

    ["POST", /^\/api\/events$/, async (req) => {
      const body = await readBody(req);
      const fields = eventFields(body);
      const hostKey = newCode(16);
      const event = store.mutate((d) => {
        const e = { id: newId(), description: "", hostName: "", color: "gold", visibility: "public", registrationOpen: true,
          ...fields, hostKeyHash: hashKey(hostKey), createdAt: new Date().toISOString() };
        d.events.push(e);
        return e;
      });
      return { event: { ...publicEvent(store.data, req, event), canManage: true }, hostKey };
    }],

    ["GET", /^\/api\/events\/([\w-]+)$/, (req, [id]) => publicEvent(store.data, req, findEvent(id))],

    ["PATCH", /^\/api\/events\/([\w-]+)$/, async (req, [id]) => {
      const event = findEvent(id);
      requireManage(req, event);
      const fields = eventFields(await readBody(req), event);
      const going = counts(store.data, id).going;
      if (fields.capacity !== undefined && fields.capacity < going) fail(409, `${going} people are already going, so capacity can't be lower than that.`);
      store.mutate(() => Object.assign(event, fields));
      return publicEvent(store.data, req, event);
    }],

    // Cover photo
    ["POST", /^\/api\/events\/([\w-]+)\/cover$/, async (req, [id]) => {
      const event = findEvent(id);
      requireManage(req, event);
      const url = saveUpload(`${id}-cover`, await readImage(req));
      const old = event.coverImage;
      store.mutate(() => { event.coverImage = url; });
      removeUpload(old);
      return publicEvent(store.data, req, event);
    }],
    ["DELETE", /^\/api\/events\/([\w-]+)\/cover$/, (req, [id]) => {
      const event = findEvent(id);
      requireManage(req, event);
      const old = event.coverImage;
      store.mutate(() => { delete event.coverImage; });
      removeUpload(old);
      return publicEvent(store.data, req, event);
    }],

    // Event photos
    ["POST", /^\/api\/events\/([\w-]+)\/photos$/, async (req, [id]) => {
      const event = findEvent(id);
      requireManage(req, event);
      if (Date.now() < new Date(event.endsAt).getTime()) fail(409, "Photos open once the event has ended.");
      if ((event.photos || []).length >= MAX_PHOTOS) fail(409, `An event can have up to ${MAX_PHOTOS} photos.`);
      const url = saveUpload(`${id}-photo`, await readImage(req));
      const photo = { id: newId(), url, uploadedAt: new Date().toISOString() };
      store.mutate(() => { event.photos = [...(event.photos || []), photo]; });
      return photo;
    }],
    ["DELETE", /^\/api\/events\/([\w-]+)\/photos\/([\w-]+)$/, (req, [id, photoId]) => {
      const event = findEvent(id);
      requireManage(req, event);
      const photo = (event.photos || []).find((p) => p.id === photoId) || fail(404, "Photo not found.");
      store.mutate(() => { event.photos = event.photos.filter((p) => p.id !== photoId); });
      removeUpload(photo.url);
      return { ok: true };
    }],

    // Notifications
    ["POST", /^\/api\/notifications$/, async (req) => {
      const b = await readBody(req);
      return { now: new Date().toISOString(), items: notificationsFor(store.data, req, b) };
    }],

    ["POST", /^\/api\/events\/([\w-]+)\/register$/, async (req, [id]) => {
      const event = findEvent(id);
      const pub = publicEvent(store.data, req, event);
      if (!pub.registrationOpen) fail(409, pub.isPast ? "This event has already ended." : "Registration is closed for this event.");
      if (!pub.canManage) limitRegistrations(req);
      const b = await readBody(req);
      const m = String(b.studentId || "").trim().match(STUDENT_ID);
      if (!m) fail(400, "Student number should look like 2024-12345.");
      const studentId = `${m[1]}-${m[2]}`;
      const first = tidyName(str(b.first, "Given name", { max: 60 }));
      const last = tidyName(str(b.last, "Surname", { max: 60 }));
      const middle = tidyInitial(b.middle);
      const suffix = SUFFIXES.includes(b.suffix) ? b.suffix : "";
      const section = str(b.section, "Section", { max: 30 }).toUpperCase().replace(/\s+/g, " ");
      const email = str(b.email, "Email", { max: 120, required: false });
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "That email address doesn't look right.");
      // Validates faceDescriptor if provided, but allows null for OCR-only use.
      let faceDescriptor = null;
      if (b.faceDescriptor !== undefined && b.faceDescriptor !== null) {
        if (!Array.isArray(b.faceDescriptor) || b.faceDescriptor.length !== 128 || !b.faceDescriptor.every((x) => typeof x === "number" && Number.isFinite(x))) {
          fail(400, "Invalid facial scan data.");
        }
        faceDescriptor = b.faceDescriptor;
      }
      
      const existing = store.data.registrations.find((r) => r.eventId === id && r.studentId === studentId && r.status !== "cancelled");
      if (existing) {
        // Only hosts, who can already see this ticket, get it back
        if (!pub.canManage) fail(409, "This student number is already registered for this event. Open the ticket on the device you registered with, or ask the organizer at the gate.");
        return { existing: true, ticket: ticketView(store.data, req, existing) };
      }

      return store.mutate((d) => {
        // The first entry stays; the name typed here only goes on this ticket
        const student = { id: studentId, last, first, middle, suffix, section, ...(faceDescriptor ? { faceDescriptor } : {}) };
        if (!d.directory[studentId]) {
          d.directory[studentId] = student;
        } else {
          d.directory[studentId].faceDescriptor = faceDescriptor;
        }
        const going = counts(d, id).going;
        const reg = { id: newId(), eventId: id, code: newCode(), studentId, student, faceDescriptor, email, status: going < event.capacity ? "going" : "waitlist",
          createdAt: new Date().toISOString(), checkin: null };
        d.registrations.push(reg);
        return { existing: false, ticket: ticketView(d, req, reg) };
      });
    }],

    ["GET", /^\/api\/tickets\/([A-Z2-9]{10})$/, (req, [code]) => {
      const reg = store.data.registrations.find((r) => r.code === code) || fail(404, "Ticket not found.");
      return ticketView(store.data, req, reg);
    }],

    ["POST", /^\/api\/tickets\/([A-Z2-9]{10})\/cancel$/, (req, [code]) => {
      const reg = store.data.registrations.find((r) => r.code === code) || fail(404, "Ticket not found.");
      if (reg.status === "cancelled") return ticketView(store.data, req, reg);
      if (reg.checkin) fail(409, "You've already checked in, so this registration can't be cancelled.");
      return store.mutate((d) => {
        const wasGoing = reg.status === "going";
        reg.status = "cancelled";
        const event = d.events.find((e) => e.id === reg.eventId);
        // Promote from waitlist
        if (wasGoing && event && Date.now() <= new Date(event.endsAt).getTime() && counts(d, reg.eventId).going < event.capacity) {
          const next = d.registrations
            .filter((r) => r.eventId === reg.eventId && r.status === "waitlist")
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
          if (next) { next.status = "going"; next.promotedAt = new Date().toISOString(); next.promotedBy = "cancellation"; }
        }
        return ticketView(d, req, reg);
      });
    }],

    ["GET", /^\/api\/events\/([\w-]+)\/manage$/, (req, [id], url) => {
      const event = findEvent(id);
      requireManage(req, event);
      const d = store.data;
      if (url.searchParams.get("rev") === String(d.rev)) return { unchanged: true, rev: d.rev, now: new Date().toISOString() };
      const regs = d.registrations.filter((r) => r.eventId === id);
      return {
        rev: d.rev,
        now: new Date().toISOString(),
        event: publicEvent(d, req, event),
        registrations: regs,
        logs: d.logs.filter((l) => l.eventId === id).sort((a, b) => b.time.localeCompare(a.time)),
        directory: Object.values(d.directory),
        matcher: matcherSummary(d, id),
        forecast: forecastSummary(event),
      };
    }],

    ["POST", /^\/api\/events\/([\w-]+)\/checkin$/, async (req, [id]) => {
      const event = findEvent(id);
      requireManage(req, event);
      const body = await readBody(req);
      return store.mutate((d) => checkIn(d, event, body, isLocal(req)));
    }],

    ["POST", /^\/api\/events\/([\w-]+)\/log$/, async (req, [id]) => {
      const event = findEvent(id);
      requireManage(req, event);
      const b = await readBody(req);
      if (b.outcome !== "unresolved") fail(400, "Only unreadable scans can be logged directly.");
      store.mutate((d) => {
        d.logs.push({ uid: newId(), eventId: id, time: new Date().toISOString(), studentId: null, outcome: "unresolved",
          method: ["qr", "barcode", "ocr"].includes(b.method) ? b.method : "ocr" });
        const scan = b.scanId && (d.ocrScans || []).find((s) => s.id === b.scanId && s.eventId === id);
        if (scan && !scan.resolution) scan.resolution = "none";
      });
      return { ok: true };
    }],

    // OCR match
    ["POST", /^\/api\/events\/([\w-]+)\/match$/, async (req, [id]) => {
      const event = findEvent(id);
      requireManage(req, event);
      const body = await readBody(req);
      return store.mutate((d) => matchRead(d, event, body));
    }],

    // Face match
    ["POST", /^\/api\/events\/([\w-]+)\/match-face$/, async (req, [id]) => {
      const event = findEvent(id);
      requireManage(req, event);
      const body = await readBody(req);
      return matchFace(store.data, event, body);
    }],

    // Reset matcher
    ["POST", /^\/api\/matcher\/reset$/, (req) => {
      if (!isLocal(req)) fail(403, "Only the laptop running SELAE can reset the matcher.");
      store.mutate((d) => { const t = d.matcher ? d.matcher.thresholds : undefined; d.matcher = emptyModel(); if (t) d.matcher.thresholds = t; });
      return { ok: true };
    }],

    ["POST", /^\/api\/events\/([\w-]+)\/registrations\/([\w-]+)\/promote$/, async (req, [id, regId]) => {
      const event = findEvent(id);
      requireManage(req, event);
      const reg = store.data.registrations.find((r) => r.id === regId && r.eventId === id) || fail(404, "Registration not found.");
      if (reg.status !== "waitlist") fail(409, "Only waitlisted guests can be moved to going.");
      const b = await readBody(req);
      if (!b.force && counts(store.data, id).going >= event.capacity) fail(409, "This event is full. Confirm to go over capacity.");
      store.mutate(() => { reg.status = "going"; reg.promotedAt = new Date().toISOString(); reg.promotedBy = "organizer"; });
      return { ok: true };
    }],

    // Waitlist release
    ["POST", /^\/api\/events\/([\w-]+)\/release$/, async (req, [id]) => {
      const event = findEvent(id);
      requireManage(req, event);
      const b = await readBody(req);
      const risk = typeof b.risk === "number" && b.risk > 0 && b.risk < 0.5 ? b.risk : DEFAULT_RISK;
      const f = forecastFor(event, risk);
      const k = Number.isInteger(b.count) ? Math.min(b.count, f.release) : f.release;
      if (k < 1) fail(409, f.ended ? "This event has already ended." : "The forecast doesn't leave room for anyone else at that risk.");
      const ids = new Set(f.waitlistOrder.slice(0, k));
      const now = new Date().toISOString();
      store.mutate((d) => {
        for (const r of d.registrations) if (ids.has(r.id) && r.status === "waitlist") {
          r.status = "going"; r.promotedAt = now; r.promotedBy = "forecast";
        }
      });
      return { released: ids.size, overflow: f.steps[k].overflow, empty: f.steps[k].empty };
    }],
  ];

  return async function handle(req, res, next) {
    const url = new URL(req.url, "http://x");
    const upload = url.pathname.match(/^\/uploads\/([^/]+)$/);
    if (upload && req.method === "GET") {
      let name = "";
      try { name = decodeURIComponent(upload[1]); } catch { /* bad encoding: 404 below */ }
      const file = path.join(store.uploadsDir, name);
      if (!UPLOAD_NAME.test(name) || !fs.existsSync(file)) { res.statusCode = 404; res.end(); return true; }
      res.setHeader("Content-Type", UPLOAD_TYPES[name.split(".").pop()]);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      fs.createReadStream(file).on("error", () => { if (!res.headersSent) res.statusCode = 500; res.end(); }).pipe(res);
      return true;
    }
    if (!url.pathname.startsWith("/api/")) return next ? next() : false;
    const send = (status, payload) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify(payload));
    };
    try {
      for (const [method, re, fn] of routes) {
        const m = url.pathname.match(re);
        if (!m) continue;
        if (req.method !== method) continue;
        send(200, await fn(req, m.slice(1), url));
        return true;
      }
      send(404, { error: "Not found." });
    } catch (e) {
      if (e instanceof HttpError) send(e.status, { error: e.message });
      else { console.error(e); send(500, { error: "Something went wrong on the server." }); }
    }
    return true;
  };
}
