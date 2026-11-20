import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { openStore } from "../storage/store.js";
import { openSupabaseStore } from "../storage/supabase.js";

/* Saving and recovery */

const tempFile = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "selae-store-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, "data.json");
};
const onDisk = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const quiet = (t) => t.mock.method(console, "error", () => {});

test("several quick changes are saved together, soon after", async (t) => {
  const file = tempFile(t);
  const store = openStore(file);
  t.after(() => store.close());
  const start = store.data.rev;
  store.mutate((d) => { d.a = 1; });
  store.mutate((d) => { d.b = 2; });
  assert.equal(onDisk(file).a, undefined);
  await wait(400);
  assert.equal(onDisk(file).a, 1);
  assert.equal(onDisk(file).b, 2);
  assert.equal(onDisk(file).rev, start + 2);
});

test("flush saves right away and keeps the previous version as a backup", (t) => {
  const file = tempFile(t);
  const store = openStore(file);
  t.after(() => store.close());
  store.mutate((d) => { d.marker = "first"; });
  store.flush();
  store.mutate((d) => { d.marker = "second"; });
  store.flush();
  assert.equal(onDisk(file).marker, "second");
  assert.equal(onDisk(`${file}.bak`).marker, "first");
});

test("a pending change is saved when the process exits", (t) => {
  const file = tempFile(t);
  const url = pathToFileURL(path.resolve("server/storage/store.js")).href;
  const script = `import { openStore } from ${JSON.stringify(url)};
    const s = openStore(${JSON.stringify(file)});
    s.mutate((d) => { d.marker = "saved on exit"; });
    process.exit(0);`;
  const run = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(onDisk(file).marker, "saved on exit");
});

test("a corrupt data file is kept aside and the backup is restored", (t) => {
  quiet(t);
  const file = tempFile(t);
  const first = openStore(file);
  first.mutate((d) => { d.marker = "good"; });
  first.flush();
  first.mutate((d) => { d.marker = "newer"; });
  first.close();
  fs.writeFileSync(file, '{"events": [broken');

  const store = openStore(file);
  t.after(() => store.close());
  assert.equal(store.data.marker, "good");
  assert.equal(onDisk(file).marker, "good");
  const kept = fs.readdirSync(path.dirname(file)).filter((f) => f.includes(".corrupt-"));
  assert.equal(kept.length, 1);
  assert.equal(fs.readFileSync(path.join(path.dirname(file), kept[0]), "utf8"), '{"events": [broken');
});

test("a missing data file with a backup restores it instead of the demo seed", (t) => {
  quiet(t);
  const file = tempFile(t);
  const first = openStore(file);
  first.mutate((d) => { d.marker = "good"; });
  first.flush();
  first.mutate((d) => { d.marker = "newer"; });
  first.close();
  fs.rmSync(file);
  const store = openStore(file);
  t.after(() => store.close());
  assert.equal(store.data.marker, "good");
});

test("startup stops with a clear error when both files are unreadable", (t) => {
  quiet(t);
  const file = tempFile(t);
  fs.writeFileSync(file, "not json");
  fs.writeFileSync(`${file}.bak`, "not json either");
  assert.throws(() => openStore(file), /can't read/);
  assert.equal(fs.readFileSync(file, "utf8"), "not json");
});

test("logs are capped, dropping the oldest", (t) => {
  const file = tempFile(t);
  const store = openStore(file);
  store.mutate((d) => { d.logs = Array.from({ length: 50005 }, (_, i) => ({ uid: String(i) })); });
  store.close();
  assert.equal(store.data.logs.length, 50000);
  assert.equal(store.data.logs[0].uid, "5");
  assert.equal(onDisk(file).logs.length, 50000);
});

/* Supabase store, against an in-memory stand-in for the client */

// missing: tables that haven't been created in the project
function fakeSupabase({ tables = {}, failWrites = false, missing = [] } = {}) {
  const db = new Map(Object.entries(tables).map(([t, rows]) => [t, new Map(rows.map((r) => [r.id ?? r.uid ?? r.key, r]))]));
  const ops = [];
  const files = new Map();
  const tableOf = (name) => { if (!db.has(name)) db.set(name, new Map()); return db.get(name); };
  const client = {
    from(name) {
      if (missing.includes(name)) {
        const error = { code: "42P01", message: `relation "public.${name}" does not exist` };
        return { select: () => ({ order: () => ({ range: async () => ({ data: null, error }) }) }), upsert: async () => ({ error }), delete: () => ({ in: async () => ({ error }) }) };
      }
      const rows = tableOf(name);
      return {
        select: () => ({ order: () => ({ range: async (from, to) => ({ data: [...rows.values()].slice(from, to + 1), error: null }) }) }),
        upsert: async (list, { onConflict }) => {
          if (failWrites) return { error: { message: "network down" } };
          ops.push(["upsert", name, list.length]);
          for (const row of list) rows.set(row[onConflict], { ...(rows.get(row[onConflict]) || {}), ...JSON.parse(JSON.stringify(row)) });
          return { error: null };
        },
        delete: () => ({ in: async (col, keys) => {
          if (failWrites) return { error: { message: "network down" } };
          ops.push(["delete", name, keys.length]);
          for (const k of keys) rows.delete(k);
          return { error: null };
        } }),
      };
    },
    storage: {
      getBucket: async () => ({ error: null }),
      createBucket: async () => ({ error: null }),
      from: () => ({
        upload: async (name, buf) => { files.set(name, buf); return { error: null }; },
        remove: async (names) => { for (const n of names) files.delete(n); return { error: null }; },
        getPublicUrl: (name) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/uploads/${name}` } }),
      }),
    },
  };
  return { client, db, ops, files, setFailWrites: (v) => { failWrites = v; } };
}

const supa = (opts) => openSupabaseStore({ url: "https://x.supabase.co", key: "k", client: fakeSupabase(opts).client });

test("an empty Supabase project is seeded, one row per record, one column per field", async (t) => {
  const fake = fakeSupabase();
  t.mock.method(console, "log", () => {});
  const store = await openSupabaseStore({ url: "https://x.supabase.co", key: "k", client: fake.client });
  t.after(() => store.close());
  assert.equal(fake.db.get("events").size, store.data.events.length);
  assert.equal(fake.db.get("registrations").size, store.data.registrations.length);
  assert.equal(fake.db.get("directory").size, Object.keys(store.data.directory).length);
  assert.equal(fake.db.get("settings").get("main").rev, store.data.rev);
  const reg = fake.db.get("registrations").get(store.data.registrations[0].id);
  assert.equal(reg.event_id, store.data.registrations[0].eventId);
  assert.equal(reg.code, store.data.registrations[0].code);
  assert.equal("data" in reg, false);
  const ev = fake.db.get("events").get(store.data.events[0].id);
  assert.equal(ev.title, store.data.events[0].title);
  assert.equal(ev.capacity, store.data.events[0].capacity);
});

test("only changed rows are written, and removed records are deleted", async (t) => {
  const fake = fakeSupabase();
  t.mock.method(console, "log", () => {});
  const store = await openSupabaseStore({ url: "https://x.supabase.co", key: "k", client: fake.client });
  t.after(() => store.close());
  fake.ops.length = 0;
  const first = store.data.registrations[0];
  const dropped = store.data.logs[0].uid;
  store.mutate((d) => { d.registrations[0].status = "cancelled"; d.logs.shift(); d.events.push({ id: "new-1", title: "New" }); });
  await store.flush();
  assert.deepEqual(fake.ops.sort(), [["delete", "logs", 1], ["upsert", "events", 1], ["upsert", "registrations", 1], ["upsert", "settings", 1]].sort());
  assert.equal(fake.db.get("registrations").get(first.id).status, "cancelled");
  assert.equal(fake.db.get("logs").has(dropped), false);
  assert.equal(fake.db.get("events").get("new-1").title, "New");
  assert.equal(fake.db.get("settings").get("main").rev, store.data.rev);
});

test("existing rows load back the same, in order, and nothing is rewritten", async (t) => {
  const seeded = fakeSupabase();
  t.mock.method(console, "log", () => {});
  const first = await openSupabaseStore({ url: "https://x.supabase.co", key: "k", client: seeded.client });
  // Every kind of record, including the parts that become several columns or their own table
  first.mutate((d) => {
    d.events[0].photos = [{ id: "p1", url: "https://x/1.jpg", uploadedAt: "2026-11-01T00:00:00.000Z" }, { id: "p2", url: "https://x/2.jpg", uploadedAt: "2026-11-02T00:00:00.000Z" }];
    d.registrations[0].student = { id: d.registrations[0].studentId, first: "Ana", middle: "", last: "Cruz", suffix: "", section: "BSCS 3-4" };
    d.registrations[0].faceDescriptor = Array.from({ length: 128 }, (_, i) => i / 1000);
    d.ocrScans.push({ id: "s1", eventId: d.events[0].id, time: "2026-11-01T00:00:00.000Z", read: "202412345", conf: [0.9, 0.8], source: "camera",
      decision: "confirm", pUnknown: 0.1, candidates: [{ id: "2024-12345", p: 0.7 }], resolution: null, truth: null, rank: null, learned: null });
    d.profiles = { u1: { id: "u1", userId: "u1", email: "ana@x.com", signInWith: "google", studentId: "2024-12345", first: "Ana", last: "Cruz",
      middle: "", suffix: "", section: "BSCS 3-4", faceDescriptor: [0.5, -0.25], faceConsentAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z" } };
    d.orgs = [{ id: "o1", name: "SC", email: "sc@x.com", type: "council", disabled: false, createdAt: "2026-11-01T00:00:00.000Z", createdBy: "boss@x.com" }];
    d.orgMembers = [{ id: "m1", orgId: "o1", email: "ana@x.com", status: "active", userId: "u1", invitedAt: "2026-11-01T00:00:00.000Z", acceptedAt: "2026-11-02T00:00:00.000Z" }];
    d.notices = [{ id: "n1", to: "sc@x.com", time: "2026-11-03T00:00:00.000Z", kind: "declined", orgId: "o1", text: "Ben declined." }];
    d.matcher = { learned: [[0, 1, 2], [3, 4, 5]], insertions: 1, ops: 2, corrections: 3, thresholds: { autoAt: 0.95, confirmAt: 0.4 }, updatedAt: "2026-11-01T00:00:00.000Z" };
  });
  await first.close();
  const tables = Object.fromEntries([...seeded.db].map(([name, rows]) => [name, [...rows.values()]]));
  const again = fakeSupabase({ tables });
  const store = await openSupabaseStore({ url: "https://x.supabase.co", key: "k", client: again.client });
  t.after(() => store.close());
  for (const k of ["events", "registrations", "logs", "ocrScans", "directory", "profiles", "orgs", "orgMembers", "notices", "matcher", "rev"]) {
    // An empty value and a missing one read back the same way, as they do in the server's checks
    const plain = (v) => JSON.parse(JSON.stringify(v ?? null, (_, x) => (x === null ? undefined : x)) ?? "null");
    assert.deepEqual(plain(store.data[k]), plain(first.data[k]), k);
  }
  assert.equal(again.ops.length, 0);
});

test("a project saved as JSON before the columns moves into them on the next start", async (t) => {
  t.mock.method(console, "log", () => {});
  const event = { id: "e1", title: "Talk", capacity: 50, startsAt: "2026-12-01T00:00:00.000Z", endsAt: "2026-12-01T02:00:00.000Z",
    photos: [{ id: "p1", url: "https://x/1.jpg", uploadedAt: "2026-11-01T00:00:00.000Z" }] };
  const reg = { id: "r1", eventId: "e1", code: "ABCDEFGHJK", studentId: "2024-12345", email: "", status: "going", createdAt: "2026-11-01T00:00:00.000Z", checkin: null };
  const orgs = [{ id: "o1", name: "Student Council", email: "sc@x.com", type: "council" }];
  const members = [{ id: "m1", orgId: "o1", email: "ana@x.com", status: "active" }];
  // The old layout: each row keeps the record in `data`, top-level values in `state`
  const old = fakeSupabase({ tables: {
    events: [{ id: "e1", data: event, seq: 1 }],
    registrations: [{ id: "r1", event_id: "e1", data: reg, seq: 1 }],
    directory: [{ id: "2024-12345", data: { id: "2024-12345", first: "Ana", last: "Cruz", middle: "", suffix: "", section: "BSCS 3-4" }, seq: 1 }],
    state: [{ key: "rev", data: 7 }, { key: "orgs", data: orgs }, { key: "orgMembers", data: members }],
  } });
  const store = await openSupabaseStore({ url: "https://x.supabase.co", key: "k", client: old.client });
  assert.deepEqual(store.data.events, [event]);
  assert.deepEqual(store.data.registrations, [reg]);
  assert.deepEqual(store.data.orgs, orgs);
  assert.deepEqual(store.data.orgMembers, members);
  assert.equal(store.data.rev, 7);
  // Now in columns, with the JSON cleared and the old state rows gone
  const ev = old.db.get("events").get("e1");
  assert.equal(ev.title, "Talk");
  assert.equal(ev.data, null);
  assert.equal(old.db.get("event_photos").get("p1").event_id, "e1");
  assert.equal(old.db.get("registrations").get("r1").code, "ABCDEFGHJK");
  assert.equal(old.db.get("registrations").get("r1").data, null);
  assert.equal(old.db.get("orgs").get("o1").name, "Student Council");
  assert.equal(old.db.get("org_members").get("m1").email, "ana@x.com");
  assert.equal(old.db.get("settings").get("main").rev, 7);
  assert.equal(old.db.get("state").size, 0);
  await store.close();

  // The next start reads the columns and writes nothing
  const again = fakeSupabase({ tables: Object.fromEntries([...old.db].map(([name, rows]) => [name, [...rows.values()]])) });
  const next = await openSupabaseStore({ url: "https://x.supabase.co", key: "k", client: again.client });
  t.after(() => next.close());
  assert.deepEqual(next.data.events, [event]);
  assert.deepEqual(next.data.orgs, orgs);
  assert.equal(again.ops.length, 0);
});

test("a missing table stops the start with what to run", async (t) => {
  t.mock.method(console, "log", () => {});
  await assert.rejects(supa({ missing: ["settings"] }), /migrate-to-columns\.sql/);
});

test("a failed write stays pending and goes through on the next flush", async (t) => {
  quiet(t);
  const fake = fakeSupabase();
  t.mock.method(console, "log", () => {});
  const store = await openSupabaseStore({ url: "https://x.supabase.co", key: "k", client: fake.client });
  t.after(() => store.close());
  fake.setFailWrites(true);
  store.mutate((d) => { d.events[0].title = "Renamed"; });
  await store.flush();
  assert.notEqual(fake.db.get("events").get(store.data.events[0].id).title, "Renamed");
  fake.setFailWrites(false);
  await store.flush();
  assert.equal(fake.db.get("events").get(store.data.events[0].id).title, "Renamed");
});

test("photos go to the storage bucket and come back as public URLs", async (t) => {
  const fake = fakeSupabase();
  t.mock.method(console, "log", () => {});
  const store = await openSupabaseStore({ url: "https://x.supabase.co", key: "k", client: fake.client });
  t.after(() => store.close());
  const url = await store.putUpload("ev-photo-1.jpg", Buffer.from("jpg"), "image/jpeg");
  assert.match(url, /^https:\/\/x\.supabase\.co\/.*\/uploads\/ev-photo-1\.jpg$/);
  assert.equal(fake.files.has("ev-photo-1.jpg"), true);
  store.removeUpload("ev-photo-1.jpg");
  await wait(10);
  assert.equal(fake.files.has("ev-photo-1.jpg"), false);
  assert.equal(store.uploadsDir, null);
});
