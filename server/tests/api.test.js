import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { openStore } from "../storage/store.js";
import { createApi } from "../api.js";

/* Check-in rules, through the real routes */

const LAPTOP = "127.0.0.1";
const PHONE = "10.0.0.9";
const future = (h) => new Date(Date.now() + h * 3600e3).toISOString();

// Fake logins for the tests: "Bearer <email>" signs in with Google, "Bearer pw:<email>" with a password
const USERS = ["boss@gmail.com", "org@gmail.com", "ana@gmail.com", "ben@gmail.com", "host@gmail.com"];
const fakeVerify = async (token) => {
  // "s:<anything>" is a student who signed up with a password
  if (token.startsWith("s:")) return { id: token, email: `${token.slice(2)}@school.test`, name: "", avatar: null, viaGoogle: false };
  // "acct:<email>:<orgId>[:temp]" is the account the server made for an org, signed in with its password
  if (token.startsWith("acct:")) {
    const [, email, orgId, temp] = token.split(":");
    return { id: `acct-${email}`, email, name: "", avatar: null, viaGoogle: false, orgId, tempPassword: temp === "temp" };
  }
  const viaGoogle = !token.startsWith("pw:");
  const email = token.replace(/^pw:/, "");
  return USERS.includes(email) ? { id: email, email, name: "", avatar: null, viaGoogle } : null;
};

// The older tests run as the venue laptop; pass { venueLaptop: false } for the normal setup
function setup(t, { venueLaptop = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "selae-api-"));
  const store = openStore(path.join(dir, "data.json"));
  t.after(() => { store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  // Org accounts: remembers what would be created and emailed
  const sent = [];
  const orgAccounts = {
    async provision(x) { sent.push({ kind: "provision", ...x }); return x.email.includes("nomail") ? { emailed: false, password: "Temp1234abcd", reason: "no SMTP" } : { emailed: true }; },
    async release(x) { sent.push({ kind: "release", ...x }); },
    async setPassword(userId, password) { sent.push({ kind: "password", userId, password }); },
  };
  const handle = createApi(store, { verify: fakeVerify, superadmins: "Boss@gmail.com", venueLaptop, orgAccounts });
  // Events in the tests belong to this org, whose account is host@gmail.com
  store.mutate((d) => { d.orgs = [{ id: "test-org", name: "Test Org", email: "host@gmail.com" }]; });
  const call = async (method, url, body, { from = PHONE, headers = {} } = {}) => {
    const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
    Object.assign(req, { method, url, headers, socket: { remoteAddress: from } });
    const res = { statusCode: 200, setHeader() {}, end(s) { this.body = s; } };
    await handle(req, res, null);
    return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : null };
  };
  const event = async (capacity = 50) => {
    const { json } = await call("POST", "/api/events", { title: "T", venue: "V", capacity, startsAt: future(24), endsAt: future(26) },
      { headers: { authorization: "Bearer host@gmail.com" } });
    return { id: json.event.id, hostKey: json.hostKey };
  };
  // Signs in as a student whose profile has this number (opts.as picks another account), then registers
  const register = (id, studentId, over = {}, opts = {}) => {
    const uid = opts.as || `s:${studentId}`;
    store.mutate((d) => {
      d.profiles = d.profiles || {};
      d.profiles[uid] = { id: uid, userId: uid, email: `${uid.slice(2)}@school.test`, studentId, first: "Ana", last: "Reyes",
        middle: "", suffix: "", section: "A", faceDescriptor: Array(128).fill(0), ...over };
    });
    return call("POST", `/api/events/${id}/register`, {}, { ...opts, headers: { ...opts.headers, authorization: `Bearer ${uid}` } });
  };
  return { store, call, event, register, sent };
}

const regOf = (store, id, studentId) => store.data.registrations.find((r) => r.eventId === id && r.studentId === studentId);

test("registration goes to the waitlist at capacity, and a cancellation promotes the next guest", async (t) => {
  const { store, call, event, register } = setup(t);
  const { id } = await event(1);
  const first = await register(id, "2099-00001");
  const second = await register(id, "2099-00002");
  assert.equal(first.json.ticket.status, "going");
  assert.equal(second.json.ticket.status, "waitlist");
  await call("POST", `/api/tickets/${first.json.ticket.code}/cancel`);
  assert.equal(regOf(store, id, "2099-00002").status, "going");
  assert.equal(regOf(store, id, "2099-00002").promotedBy, "cancellation");
});

test("a cancellation after the event ends promotes nobody", async (t) => {
  const { store, call, event, register } = setup(t);
  const { id } = await event(1);
  const first = await register(id, "2099-00001");
  await register(id, "2099-00002");
  const e = store.data.events.find((x) => x.id === id);
  e.startsAt = future(-3); e.endsAt = future(-1);
  await call("POST", `/api/tickets/${first.json.ticket.code}/cancel`);
  assert.equal(regOf(store, id, "2099-00002").status, "waitlist");
});

test("another account can't get someone else's ticket, but the owner gets theirs back on any device", async (t) => {
  const { event, register } = setup(t);
  const { id } = await event();
  const owner = await register(id, "2099-00001");
  const stranger = await register(id, "2099-00001", { first: "Fake" }, { from: "10.0.0.50", as: "s:stranger" });
  assert.equal(stranger.status, 409);
  assert.equal(stranger.json.ticket, undefined);
  assert.ok(!JSON.stringify(stranger.json).includes(owner.json.ticket.code));
  const again = await register(id, "2099-00001", {}, { from: "10.0.0.51" });
  assert.equal(again.json.existing, true);
  assert.equal(again.json.ticket.code, owner.json.ticket.code);
});

test("registering never overwrites a student's name, and tickets don't reveal it", async (t) => {
  const { store, call, event, register } = setup(t);
  const a = await event(), b = await event();
  const owner = await register(a.id, "2099-00001", { first: "Maria", last: "Santos" });
  const other = await register(b.id, "2099-00001", { first: "Hacker", last: "Fake" }, { from: "10.0.0.50", as: "s:hacker" });
  assert.equal(store.data.directory["2099-00001"].first, "Maria");
  assert.equal(other.json.ticket.student.first, "Hacker");
  assert.equal((await call("GET", `/api/tickets/${owner.json.ticket.code}`)).json.student.first, "Maria");
});

test("check-in outcomes: approved, duplicate, not registered, waitlist, venue full", async (t) => {
  const { store, call, event, register } = setup(t);
  const { id } = await event(1);
  await register(id, "2099-00001");
  await register(id, "2099-00002");
  const scan = async (studentId) => (await call("POST", `/api/events/${id}/checkin`, { studentId, method: "ocr" }, { from: LAPTOP })).json.outcome;
  assert.equal(await scan("2099-00002"), "waitlist");
  assert.equal(await scan("2099-99999"), "notreg");
  assert.equal(await scan("2099-00001"), "approved");
  assert.equal(await scan("2099-00001"), "dup");
  regOf(store, id, "2099-00002").status = "going";
  assert.equal(await scan("2099-00002"), "full");
});

test("capacity can't drop below the guests already going", async (t) => {
  const { call, event, register } = setup(t);
  const { id } = await event(5);
  await register(id, "2099-00001");
  await register(id, "2099-00002");
  const patch = (capacity) => call("PATCH", `/api/events/${id}`, { capacity }, { from: LAPTOP });
  assert.equal((await patch(1)).status, 409);
  assert.equal((await patch(2)).status, 200);
});

test("promoting past capacity needs confirmation", async (t) => {
  const { store, call, event, register } = setup(t);
  const { id } = await event(1);
  await register(id, "2099-00001");
  await register(id, "2099-00002");
  const url = `/api/events/${id}/registrations/${regOf(store, id, "2099-00002").id}/promote`;
  assert.equal((await call("POST", url, {}, { from: LAPTOP })).status, 409);
  assert.equal(regOf(store, id, "2099-00002").status, "waitlist");
  assert.equal((await call("POST", url, { force: true }, { from: LAPTOP })).status, 200);
  assert.equal(regOf(store, id, "2099-00002").status, "going");
});

test("registering needs a signed-in student with a profile, and uses that profile", async (t) => {
  const { store, call, event, register } = setup(t);
  const { id } = await event(500);
  const reg = (token) => call("POST", `/api/events/${id}/register`, { studentId: "2099-77777", first: "Typed" },
    token ? { headers: { authorization: `Bearer ${token}` } } : {});
  assert.equal((await reg(null)).status, 401);
  assert.equal((await reg("s:noprofile")).status, 409);
  assert.equal((await reg("host@gmail.com")).status, 403);
  assert.equal((await reg("boss@gmail.com")).status, 403);

  // What was typed in the request is ignored; the profile is used
  const ok = await register(id, "2099-00001", { first: "Maria" });
  assert.equal(ok.json.ticket.student.first, "Maria");
  assert.equal(regOf(store, id, "2099-00001").email, "2099-00001@school.test");
  assert.equal(regOf(store, id, "2099-77777"), undefined);

  // A whole class on one school Wi-Fi address isn't blocked
  for (let i = 2; i < 40; i++) assert.equal((await register(id, `2099-${String(i).padStart(5, "0")}`)).status, 200);
});

test("the matcher learns from the laptop's real reads only", async (t) => {
  const { store, call, event, register } = setup(t);
  const { id, hostKey } = await event();
  const corrections = () => store.data.matcher?.corrections ?? 0;
  const resolve = async (studentId, source, from, headers = {}) => {
    await register(id, studentId, {}, { from: LAPTOP });
    const read = studentId.replace("-", "").slice(0, -1) + "7";
    const m = await call("POST", `/api/events/${id}/match`, { read, source }, { from, headers });
    return call("POST", `/api/events/${id}/checkin`, { studentId, method: "confirmed", scanId: m.json.scanId }, { from, headers });
  };
  const demo = await resolve("2099-00001", "demo", LAPTOP);
  assert.equal(corrections(), 0);
  assert.equal(demo.json.learned, false);
  await resolve("2099-00002", "camera", PHONE, { "x-selae-host-key": hostKey });
  assert.equal(corrections(), 0);
  const real = await resolve("2099-00003", "camera", LAPTOP);
  assert.equal(corrections(), 1);
  assert.equal(real.json.learned, true);
  const stats = (await call("GET", `/api/events/${id}/manage`, null, { from: LAPTOP })).json.matcher.scans;
  assert.equal(stats.total, 2);
  assert.equal(stats.demo, 1);
});

test("requests through a tunnel or proxy aren't treated as the laptop", async (t) => {
  const { call, event } = setup(t);
  const { id } = await event();
  assert.equal((await call("GET", `/api/events/${id}/manage`, null, { from: LAPTOP })).status, 200);
  for (const header of ["x-forwarded-for", "forwarded", "x-real-ip"]) {
    const res = await call("GET", `/api/events/${id}/manage`, null, { from: LAPTOP, headers: { [header]: "203.0.113.5" } });
    assert.equal(res.status, 403, header);
  }
});

test("a host can add a student at the gate, even with registration closed", async (t) => {
  const { store, call, event } = setup(t);
  const { id } = await event();
  await call("PATCH", `/api/events/${id}`, { registrationOpen: false }, { from: LAPTOP });
  const body = { studentId: "2099-00001", first: "ana", last: "reyes", section: "bscs 3-4" };

  assert.equal((await call("POST", `/api/events/${id}/walkin`, body)).status, 403);
  assert.equal((await call("POST", `/api/events/${id}/walkin`, { ...body, section: "" }, { from: LAPTOP })).status, 400);
  assert.equal(regOf(store, id, "2099-00001"), undefined);

  const added = await call("POST", `/api/events/${id}/walkin`, body, { from: LAPTOP });
  assert.equal(added.json.outcome, "approved");
  assert.equal(added.json.added, true);
  assert.equal(added.json.student.section, "BSCS 3-4");
  assert.equal(store.data.directory["2099-00001"].first, "Ana");
  assert.equal(regOf(store, id, "2099-00001").walkIn, true);

  const again = await call("POST", `/api/events/${id}/walkin`, body, { from: LAPTOP });
  assert.equal(again.json.outcome, "dup");
  assert.equal(again.json.added, false);
  assert.equal(store.data.registrations.filter((r) => r.eventId === id && r.studentId === "2099-00001").length, 1);
});

test("adding at the gate keeps the file's name and goes to the waitlist when the event is full", async (t) => {
  const { store, call, event, register } = setup(t);
  const a = await event();
  await register(a.id, "2099-00001", { first: "Maria", last: "Santos" });
  const b = await event(1);
  await register(b.id, "2099-00002");

  const res = await call("POST", `/api/events/${b.id}/walkin`, { studentId: "2099-00001", first: "Fake", last: "Name", section: "X" }, { from: LAPTOP });
  assert.equal(res.json.outcome, "waitlist");
  assert.equal(res.json.student.first, "Maria");
  assert.equal(store.data.directory["2099-00001"].first, "Maria");
  assert.equal(regOf(store, b.id, "2099-00001").checkin, null);
});

test("adding a student resolves the scan that led to the form", async (t) => {
  const { store, call, event } = setup(t);
  const { id } = await event();
  const m = await call("POST", `/api/events/${id}/match`, { read: "209900001", source: "camera" }, { from: LAPTOP });
  await call("POST", `/api/events/${id}/walkin`, { studentId: "2099-00001", first: "Ana", last: "Reyes", section: "A", scanId: m.json.scanId }, { from: LAPTOP });
  const scan = store.data.ocrScans.find((s) => s.id === m.json.scanId);
  assert.equal(scan.resolution, "manual");
  assert.equal(scan.truth, "2099-00001");
});

test("a malformed upload URL is a 404, not a crash", async (t) => {
  const { call } = setup(t);
  assert.equal((await call("GET", "/uploads/%E0%A4%A")).status, 404);
});

/* Face recognition */

// 128 numbers; faces built from different bases are far apart
const face = (base) => Array.from({ length: 128 }, (_, i) => base + i * 0.001);
const hasFace = (json) => JSON.stringify(json).includes("faceDescriptor");

test("face data never leaves the server", async (t) => {
  const { store, call, event, register } = setup(t);
  const { id } = await event();
  const reg = await register(id, "2099-00001", { faceDescriptor: face(0) });
  assert.equal(reg.status, 200);
  assert.equal(regOf(store, id, "2099-00001").faceDescriptor.length, 128);

  const code = reg.json.ticket.code;
  const ticket = await call("GET", `/api/tickets/${code}`);
  const manage = await call("GET", `/api/events/${id}/manage`, null, { from: LAPTOP });
  const match = await call("POST", `/api/events/${id}/match-face`, { descriptor: face(0) }, { from: LAPTOP });
  const checkin = await call("POST", `/api/events/${id}/checkin`, { studentId: "2099-00001", method: "face", confidence: 0.9 }, { from: LAPTOP });
  for (const [name, res] of Object.entries({ reg, ticket, manage, match, checkin })) {
    assert.equal(res.status, 200, name);
    assert.ok(!hasFace(res.json), `${name} response leaks faceDescriptor`);
  }
});

test("registering again with someone else's face doesn't replace the first face", async (t) => {
  const { store, call, event, register } = setup(t);
  const a = await event(), b = await event();
  await register(a.id, "2099-00001", { faceDescriptor: face(0) });
  await register(b.id, "2099-00001", { faceDescriptor: face(0.5) }, { from: "10.0.0.50" });
  assert.equal(store.data.directory["2099-00001"].faceDescriptor, undefined);

  const owner = await call("POST", `/api/events/${a.id}/match-face`, { descriptor: face(0) }, { from: LAPTOP });
  assert.equal(owner.json.decision, "auto");
  assert.equal(owner.json.candidates[0].student.id, "2099-00001");
  const impostor = await call("POST", `/api/events/${a.id}/match-face`, { descriptor: face(0.5) }, { from: LAPTOP });
  assert.equal(impostor.json.decision, "reject");
});

test("face data is checked at registration and at the gate", async (t) => {
  const { call, event, register } = setup(t);
  const { id } = await event();
  const bad = [face(0).slice(0, 127), [...face(0).slice(0, 127), "x"], [...face(0).slice(0, 127), null], "nope"];
  const profile = { studentId: "2099-00009", first: "Ana", last: "Reyes", section: "A" };
  for (const descriptor of bad) {
    assert.equal((await call("PUT", "/api/me/profile", { ...profile, faceDescriptor: descriptor, faceConsent: true }, { headers: { authorization: "Bearer s:x" } })).status, 400);
    assert.equal((await call("POST", `/api/events/${id}/match-face`, { descriptor }, { from: LAPTOP })).status, 400);
  }
  // Only hosts can run face matching
  assert.equal((await call("POST", `/api/events/${id}/match-face`, { descriptor: face(0) })).status, 403);
});

test("/api/me says who is signed in and their role", async (t) => {
  const { store, call } = setup(t);
  const me = async (token) => (await call("GET", "/api/me", null, { headers: token ? { authorization: `Bearer ${token}` } : {} })).json.user;
  store.mutate((d) => { d.orgs = [{ id: "o1", name: "CS Society", email: "org@gmail.com" }]; });

  assert.equal(await me(null), null);
  assert.equal(await me("stranger@gmail.com"), null);
  assert.equal((await me("boss@gmail.com")).role, "superadmin");
  assert.deepEqual((await me("org@gmail.com")).org, { id: "o1", name: "CS Society", type: null });
  assert.equal((await me("ana@gmail.com")).role, "student");

  // A password sign-up with someone else's email gets no admin or org powers
  assert.equal((await me("pw:boss@gmail.com")).role, "student");
  assert.equal((await me("pw:org@gmail.com")).role, "student");

  store.mutate((d) => { d.orgs[0].disabled = true; });
  assert.equal((await me("org@gmail.com")).role, "student");
});

test("a student fills in their profile once, and the face stays on the server", async (t) => {
  const { store, call } = setup(t);
  const as = (email) => ({ headers: { authorization: `Bearer ${email}` } });
  const details = { studentId: "2024-12345", first: "ana", last: "reyes", section: "bscs 3-4" };
  const face = Array.from({ length: 128 }, (_, i) => i / 128);

  assert.equal((await call("PUT", "/api/me/profile", details)).status, 401);

  // A face scan needs the data privacy consent, and when it was given is kept
  assert.equal((await call("PUT", "/api/me/profile", { ...details, faceDescriptor: face }, as("ana@gmail.com"))).status, 400);
  const saved = await call("PUT", "/api/me/profile", { ...details, faceDescriptor: face, faceConsent: true }, as("ana@gmail.com"));
  assert.equal(saved.status, 200);
  assert.ok(Date.parse(saved.json.profile.faceConsentAt) > 0);
  assert.equal(saved.json.profile.first, "Ana");
  assert.equal(saved.json.profile.section, "BSCS 3-4");
  assert.equal(saved.json.profile.hasFace, true);
  assert.ok(!("faceDescriptor" in saved.json.profile));

  // Editing the name without a new scan keeps the face
  await call("PUT", "/api/me/profile", { ...details, first: "Anna" }, as("ana@gmail.com"));
  const me = (await call("GET", "/api/me", null, as("ana@gmail.com"))).json.user;
  assert.equal(me.profile.first, "Anna");
  assert.equal(me.profile.hasFace, true);
  assert.equal(me.profile.faceConsentAt, saved.json.profile.faceConsentAt);
  assert.ok(!JSON.stringify(me).includes("faceDescriptor"));

  // Create account asks first: taken for anyone else, free for its owner, and only a yes or no comes back
  const free = async (id, opts) => (await call("GET", `/api/student-numbers/${encodeURIComponent(id)}`, undefined, opts)).json;
  assert.deepEqual(await free("2024-12345"), { available: false });
  assert.deepEqual(await free("2024 12345"), { available: false });
  assert.deepEqual(await free("2024-12345", as("ana@gmail.com")), { available: true });
  assert.deepEqual(await free("2024-54321"), { available: true });
  assert.equal((await call("GET", "/api/student-numbers/abc")).status, 400);

  // One account per student number, and the school admin and org accounts aren't students
  assert.equal((await call("PUT", "/api/me/profile", details, as("ben@gmail.com"))).status, 409);
  assert.equal((await call("PUT", "/api/me/profile", { ...details, studentId: "2024-99999" }, as("boss@gmail.com"))).status, 403);
  store.mutate((d) => { d.orgs = [{ id: "o1", name: "CS Society", email: "org@gmail.com" }]; });
  assert.equal((await call("PUT", "/api/me/profile", { ...details, studentId: "2024-99999" }, as("org@gmail.com"))).status, 403);
});

test("only the superadmin adds, edits, and disables organizations", async (t) => {
  const { call } = setup(t);
  const as = (token) => ({ headers: { authorization: `Bearer ${token}` } });
  const me = async (token) => (await call("GET", "/api/me", null, as(token))).json.user;

  // Students, and the superadmin's email through a password sign-in, can't
  assert.equal((await call("POST", "/api/admin/orgs", { name: "X", email: "x@gmail.com", type: "academic" }, as("ana@gmail.com"))).status, 403);
  assert.equal((await call("POST", "/api/admin/orgs", { name: "X", email: "x@gmail.com", type: "academic" }, as("pw:boss@gmail.com"))).status, 403);
  assert.equal((await call("GET", "/api/admin/orgs")).status, 401);

  const made = await call("POST", "/api/admin/orgs", { name: "CS  Society", email: "Org@Gmail.com", type: "academic" }, as("boss@gmail.com"));
  assert.equal(made.status, 200);
  assert.equal(made.json.org.name, "CS Society");
  assert.equal(made.json.org.email, "org@gmail.com");
  assert.equal((await me("org@gmail.com")).role, "org");

  // No duplicates, and the superadmin's own email can't be an org
  assert.equal((await call("POST", "/api/admin/orgs", { name: "Other", email: "org@gmail.com", type: "academic" }, as("boss@gmail.com"))).status, 409);
  assert.equal((await call("POST", "/api/admin/orgs", { name: "cs society", email: "y@gmail.com", type: "academic" }, as("boss@gmail.com"))).status, 409);
  assert.equal((await call("POST", "/api/admin/orgs", { name: "Boss Org", email: "boss@gmail.com", type: "academic" }, as("boss@gmail.com"))).status, 400);

  const id = made.json.org.id;
  const off = await call("PATCH", `/api/admin/orgs/${id}`, { disabled: true }, as("boss@gmail.com"));
  assert.equal(off.json.org.disabled, true);
  assert.equal((await me("org@gmail.com")).role, "student");

  // New officers: the org moves to a new Gmail
  await call("PATCH", `/api/admin/orgs/${id}`, { disabled: false, email: "ben@gmail.com" }, as("boss@gmail.com"));
  assert.equal((await me("ben@gmail.com")).role, "org");
  assert.equal((await me("org@gmail.com")).role, "student");
  assert.ok((await call("GET", "/api/admin/orgs", null, as("boss@gmail.com"))).json.orgs.some((o) => o.id === id && o.email === "ben@gmail.com"));
});

test("an org invites a student as officer, the student accepts, and the org can remove them", async (t) => {
  const { call } = setup(t);
  const as = (token) => ({ headers: { authorization: `Bearer ${token}` } });
  const me = async (token) => (await call("GET", "/api/me", null, as(token))).json.user;
  await call("POST", "/api/admin/orgs", { name: "JPCS", email: "org@gmail.com", type: "academic" }, as("boss@gmail.com"));

  // Students can't manage officers, and orgs can't invite admin or org accounts
  assert.equal((await call("POST", "/api/org/members", { email: "ben@gmail.com" }, as("ana@gmail.com"))).status, 403);
  assert.equal((await call("POST", "/api/org/members", { email: "boss@gmail.com" }, as("org@gmail.com"))).status, 400);
  assert.equal((await call("POST", "/api/org/members", { email: "org@gmail.com" }, as("org@gmail.com"))).status, 400);

  const inv = await call("POST", "/api/org/members", { email: "Ana@Gmail.com" }, as("org@gmail.com"));
  assert.equal(inv.json.member.status, "invited");
  assert.equal((await call("POST", "/api/org/members", { email: "ana@gmail.com" }, as("org@gmail.com"))).status, 409);

  // Only the invited student can answer
  const invite = (await me("ana@gmail.com")).invites[0];
  assert.equal(invite.org.name, "JPCS");
  assert.equal((await call("POST", `/api/me/invites/${invite.id}/accept`, null, as("ben@gmail.com"))).status, 404);
  await call("POST", `/api/me/invites/${invite.id}/accept`, null, as("ana@gmail.com"));
  const ana = await me("ana@gmail.com");
  assert.deepEqual(ana.officerOf.map((o) => o.name), ["JPCS"]);
  assert.equal(ana.invites.length, 0);

  const { members } = (await call("GET", "/api/org/members", null, as("org@gmail.com"))).json;
  assert.equal(members[0].status, "active");
  await call("DELETE", `/api/org/members/${members[0].id}`, null, as("org@gmail.com"));
  assert.equal((await me("ana@gmail.com")).officerOf.length, 0);

  // A declined invitation is gone
  const again = await call("POST", "/api/org/members", { email: "ben@gmail.com" }, as("org@gmail.com"));
  await call("POST", `/api/me/invites/${again.json.member.id}/decline`, null, as("ben@gmail.com"));
  assert.equal((await call("GET", "/api/org/members", null, as("org@gmail.com"))).json.members.length, 0);
});

test("only an org and its officers create and manage the org's events", async (t) => {
  const { call, store } = setup(t);
  const as = (token) => ({ headers: { authorization: `Bearer ${token}` } });
  const fields = { title: "Hack", venue: "Lab", capacity: 30, startsAt: future(24), endsAt: future(26), hostName: "Fake Host" };

  // Signed out, students, and the superadmin can't create events
  assert.equal((await call("POST", "/api/events", fields)).status, 401);
  assert.equal((await call("POST", "/api/events", fields, as("ana@gmail.com"))).status, 403);
  assert.equal((await call("POST", "/api/events", fields, as("boss@gmail.com"))).status, 403);

  // The org account creates one; the host is the org, whatever name was typed
  const made = await call("POST", "/api/events", fields, as("host@gmail.com"));
  assert.equal(made.status, 200);
  const id = made.json.event.id;
  assert.equal(made.json.event.hostName, "Test Org");
  assert.equal(made.json.event.org.id, "test-org");

  // A student can't manage it until the org makes them an officer
  const edit = (who) => call("PATCH", `/api/events/${id}`, { venue: "Hall" }, as(who));
  assert.equal((await edit("ana@gmail.com")).status, 403);
  const inv = await call("POST", "/api/org/members", { email: "ana@gmail.com" }, as("host@gmail.com"));
  await call("POST", `/api/me/invites/${inv.json.member.id}/accept`, null, as("ana@gmail.com"));
  assert.equal((await edit("ana@gmail.com")).status, 200);
  assert.deepEqual((await call("GET", "/api/me", null, as("ana@gmail.com"))).json.user.hostsFor, [{ id: "test-org", name: "Test Org" }]);

  // The officer creates events for the org too, and can't rename the host
  const byOfficer = await call("POST", "/api/events", { ...fields, title: "Jam" }, as("ana@gmail.com"));
  assert.equal(byOfficer.json.event.hostName, "Test Org");
  await call("PATCH", `/api/events/${id}`, { hostName: "Someone else" }, as("ana@gmail.com"));
  assert.equal((await call("GET", `/api/events/${id}`)).json.hostName, "Test Org");

  // Renaming the org renames the host; disabling it ends the officer's access
  store.mutate((d) => { d.orgs[0].name = "Test Org 2"; });
  assert.equal((await call("GET", `/api/events/${id}`)).json.hostName, "Test Org 2");
  store.mutate((d) => { d.orgs[0].disabled = true; });
  assert.equal((await edit("ana@gmail.com")).status, 403);
  assert.equal((await edit("host@gmail.com")).status, 403);
});

test("notifications belong to the signed-in account", async (t) => {
  const { call, event, register } = setup(t);
  const as = (token) => ({ headers: { authorization: `Bearer ${token}` } });
  const notes = async (token, body = {}) => (await call("POST", "/api/notifications", body, token ? as(token) : {})).json.items;
  const { id } = await event();
  const mine = await register(id, "2099-00001");
  await register(id, "2099-00002");

  // Signed out: nothing, even with a ticket code from this device
  assert.deepEqual(await notes(null, { tickets: [mine.json.ticket.code] }), []);

  // Each student only hears about their own tickets
  const ana = await notes("s:2099-00001");
  assert.ok(ana.some((n) => n.kind === "registered" && n.code === mine.json.ticket.code));
  assert.ok(!ana.some((n) => n.code && n.code !== mine.json.ticket.code));
  assert.ok(!ana.some((n) => n.host));

  // The org hears about its event; a student who isn't an officer doesn't
  assert.ok((await notes("host@gmail.com")).some((n) => n.kind === "registrations" && n.eventId === id));
  assert.ok(!(await notes("ana@gmail.com")).some((n) => n.host));
});

test("invitations, answers, removals, and new org events all reach the bell", async (t) => {
  const { call } = setup(t);
  const as = (token) => ({ headers: { authorization: `Bearer ${token}` } });
  const kinds = async (token) => (await call("POST", "/api/notifications", {}, as(token))).json.items.map((n) => n.kind);
  const fields = { title: "Jam", venue: "Lab", capacity: 30, startsAt: future(24), endsAt: future(26) };

  // The student sees the invitation
  const inv = await call("POST", "/api/org/members", { email: "ana@gmail.com" }, as("host@gmail.com"));
  assert.ok((await kinds("ana@gmail.com")).includes("invite"));
  assert.ok(!(await kinds("ben@gmail.com")).includes("invite"));

  // Accepting: the student is told they're an officer, and the org is told who accepted
  await call("POST", `/api/me/invites/${inv.json.member.id}/accept`, null, as("ana@gmail.com"));
  const ana = await kinds("ana@gmail.com");
  assert.ok(ana.includes("officer") && !ana.includes("invite"));
  assert.ok((await kinds("host@gmail.com")).includes("accepted"));

  // An event the officer creates reaches the org account, not the officer who made it
  await call("POST", "/api/events", fields, as("ana@gmail.com"));
  assert.ok((await kinds("host@gmail.com")).includes("orgEvent"));
  assert.ok(!(await kinds("ana@gmail.com")).includes("orgEvent"));

  // Declining reaches the org; removing reaches the student
  const inv2 = await call("POST", "/api/org/members", { email: "ben@gmail.com" }, as("host@gmail.com"));
  await call("POST", `/api/me/invites/${inv2.json.member.id}/decline`, null, as("ben@gmail.com"));
  assert.ok((await kinds("host@gmail.com")).includes("declined"));
  const officer = (await call("GET", "/api/org/members", null, as("host@gmail.com"))).json.members.find((m) => m.email === "ana@gmail.com");
  await call("DELETE", `/api/org/members/${officer.id}`, null, as("host@gmail.com"));
  const after = await kinds("ana@gmail.com");
  assert.ok(after.includes("removed") && !after.includes("officer"));
});

test("localhost is no one special unless venue mode is on", async (t) => {
  const { call, event } = setup(t, { venueLaptop: false });
  const as = (token) => ({ from: LAPTOP, headers: { authorization: `Bearer ${token}` } });
  const { id, hostKey } = await event();

  // Signed out or a student on the laptop: no access
  assert.equal((await call("GET", `/api/events/${id}/manage`, null, { from: LAPTOP })).status, 403);
  assert.equal((await call("GET", `/api/events/${id}/manage`, null, as("ana@gmail.com"))).status, 403);
  assert.equal((await call("GET", `/api/events/${id}`, null, as("ana@gmail.com"))).json.canManage, false);
  assert.equal((await call("POST", "/api/matcher/reset", null, { from: LAPTOP })).status, 403);

  // The org, a co-host link, and the superadmin's matcher reset still work
  assert.equal((await call("GET", `/api/events/${id}/manage`, null, as("host@gmail.com"))).status, 200);
  assert.equal((await call("GET", `/api/events/${id}/manage`, null, { from: LAPTOP, headers: { "x-selae-host-key": hostKey } })).status, 200);
  assert.equal((await call("POST", "/api/matcher/reset", null, as("boss@gmail.com"))).status, 200);

  // A host key left in a shared browser doesn't give a signed-in student the event
  const withKey = { from: LAPTOP, headers: { authorization: "Bearer ana@gmail.com", "x-selae-host-key": hostKey } };
  assert.equal((await call("GET", `/api/events/${id}/manage`, null, withKey)).status, 403);
  assert.equal((await call("GET", `/api/events/${id}`, null, withKey)).json.canManage, false);
  // ...while the organization's own account still manages it with or without one
  assert.equal((await call("GET", `/api/events/${id}/manage`, null, { from: LAPTOP, headers: { authorization: "Bearer host@gmail.com", "x-selae-host-key": hostKey } })).status, 200);
});

test("a new org gets an emailed temporary password, and must choose its own before doing anything", async (t) => {
  const { call, sent, event } = setup(t);
  const as = (token) => ({ headers: { authorization: `Bearer ${token}` } });
  const admin = as("boss@gmail.com");

  // The kind is required and checked
  assert.equal((await call("POST", "/api/admin/orgs", { name: "Choir", email: "choir@gmail.com" }, admin)).status, 400);
  assert.equal((await call("POST", "/api/admin/orgs", { name: "Choir", email: "choir@gmail.com", type: "band" }, admin)).status, 400);

  const made = await call("POST", "/api/admin/orgs", { name: "Choir", email: "Choir@gmail.com", type: "religious" }, admin);
  assert.equal(made.status, 200);
  assert.equal(made.json.org.type, "religious");
  assert.deepEqual(made.json.credentials, { emailed: true });
  const p = sent.find((x) => x.kind === "provision");
  assert.equal(p.email, "choir@gmail.com");
  assert.equal(p.orgId, made.json.org.id);

  // Signed in with the temporary password: the org only sees itself until it changes it
  const id = made.json.org.id;
  const temp = as(`acct:choir@gmail.com:${id}:temp`);
  const me = (await call("GET", "/api/me", null, temp)).json.user;
  assert.equal(me.role, "org");
  assert.equal(me.mustChangePassword, true);
  assert.equal((await call("GET", "/api/org/members", null, temp)).status, 401);
  assert.equal((await call("POST", "/api/me/password", { password: "short1" }, temp)).status, 400);
  assert.equal((await call("POST", "/api/me/password", { password: "onlyletters" }, temp)).status, 400);
  assert.equal((await call("POST", "/api/me/password", { password: "NewPass2026" }, temp)).status, 200);
  assert.deepEqual(sent.at(-1), { kind: "password", userId: "acct-choir@gmail.com", password: "NewPass2026" });

  // With its own password it's a full org account; a password account for another org's email isn't
  const ok = as(`acct:choir@gmail.com:${id}`);
  assert.equal((await call("GET", "/api/org/members", null, ok)).status, 200);
  assert.equal((await call("GET", "/api/me", null, as("acct:choir@gmail.com:other-org"))).json.user.role, "student");

  // Without email set up, the superadmin sees the password once to pass on
  const manual = await call("POST", "/api/admin/orgs", { name: "Nomail Club", email: "nomail@gmail.com", type: "nonacademic" }, admin);
  assert.equal(manual.json.credentials.emailed, false);
  assert.equal(manual.json.credentials.password, "Temp1234abcd");

  // A new email gets a new account, and the old one lets go of the org
  const moved = await call("PATCH", `/api/admin/orgs/${id}`, { email: "choir2@gmail.com" }, admin);
  assert.deepEqual(moved.json.credentials, { emailed: true });
  assert.ok(sent.some((x) => x.kind === "release" && x.email === "choir@gmail.com" && x.orgId === id));
  // A rename alone sends nothing
  const before = sent.length;
  assert.equal((await call("PATCH", `/api/admin/orgs/${id}`, { name: "Campus Choir", type: "council" }, admin)).json.org.type, "council");
  assert.equal(sent.length, before);
  // A fresh password on request
  assert.deepEqual((await call("POST", `/api/admin/orgs/${id}/password`, null, admin)).json.credentials, { emailed: true });
  assert.equal((await call("POST", `/api/admin/orgs/${id}/password`, null, as("ana@gmail.com"))).status, 403);

  // A student's email can't become an org
  const { id: ev } = await event();
  await call("PUT", "/api/me/profile", { studentId: "2024-55555", first: "Ana", last: "Reyes", section: "A" }, as("ana@gmail.com"));
  assert.equal((await call("POST", "/api/admin/orgs", { name: "Ana Org", email: "ana@gmail.com", type: "academic" }, admin)).status, 409);
  assert.ok(ev);
});
