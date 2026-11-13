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

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "selae-api-"));
  const store = openStore(path.join(dir, "data.json"));
  t.after(() => { store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const handle = createApi(store);
  const call = async (method, url, body, { from = PHONE, headers = {} } = {}) => {
    const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
    Object.assign(req, { method, url, headers, socket: { remoteAddress: from } });
    const res = { statusCode: 200, setHeader() {}, end(s) { this.body = s; } };
    await handle(req, res, null);
    return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : null };
  };
  const event = async (capacity = 50) => {
    const { json } = await call("POST", "/api/events", { title: "T", venue: "V", capacity, startsAt: future(24), endsAt: future(26) });
    return { id: json.event.id, hostKey: json.hostKey };
  };
  const register = (id, studentId, over = {}, opts) =>
    call("POST", `/api/events/${id}/register`, { studentId, first: "Ana", last: "Reyes", section: "A", ...over }, opts);
  return { store, call, event, register };
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

test("a stranger can't get someone else's ticket, but a host can", async (t) => {
  const { event, register } = setup(t);
  const { id, hostKey } = await event();
  const owner = await register(id, "2099-00001");
  const stranger = await register(id, "2099-00001", { first: "Fake" }, { from: "10.0.0.50" });
  assert.equal(stranger.status, 409);
  assert.equal(stranger.json.ticket, undefined);
  assert.ok(!JSON.stringify(stranger.json).includes(owner.json.ticket.code));
  const host = await register(id, "2099-00001", {}, { from: "10.0.0.51", headers: { "x-selae-host-key": hostKey } });
  assert.equal(host.json.ticket.code, owner.json.ticket.code);
});

test("registering never overwrites a student's name, and tickets don't reveal it", async (t) => {
  const { store, call, event, register } = setup(t);
  const a = await event(), b = await event();
  const owner = await register(a.id, "2099-00001", { first: "Maria", last: "Santos" });
  const other = await register(b.id, "2099-00001", { first: "Hacker", last: "Fake" }, { from: "10.0.0.50" });
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

test("registrations are limited per address, except for hosts", async (t) => {
  const { event, register } = setup(t);
  const { id } = await event(500);
  const num = (i) => `2099-${String(i).padStart(5, "0")}`;
  for (let i = 0; i < 20; i++) assert.equal((await register(id, num(i))).status, 200);
  assert.equal((await register(id, num(20))).status, 429);
  assert.equal((await register(id, num(21), {}, { from: "10.0.0.50" })).status, 200);
  assert.equal((await register(id, num(22), {}, { from: LAPTOP })).status, 200);
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
  for (const descriptor of bad) {
    assert.equal((await register(id, "2099-00009", { faceDescriptor: descriptor })).status, 400);
    assert.equal((await call("POST", `/api/events/${id}/match-face`, { descriptor }, { from: LAPTOP })).status, 400);
  }
  // Only hosts can run face matching
  assert.equal((await call("POST", `/api/events/${id}/match-face`, { descriptor: face(0) })).status, 403);
});
