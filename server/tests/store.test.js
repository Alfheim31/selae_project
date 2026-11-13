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

function fakeSupabase({ tables = {}, failWrites = false } = {}) {
  const db = new Map(Object.entries(tables).map(([t, rows]) => [t, new Map(rows.map((r) => [r.id ?? r.uid ?? r.key, r]))]));
  const ops = [];
  const files = new Map();
  const tableOf = (name) => { if (!db.has(name)) db.set(name, new Map()); return db.get(name); };
  const client = {
    from(name) {
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

test("an empty Supabase project is seeded, one row per record", async (t) => {
  const fake = fakeSupabase();
  t.mock.method(console, "log", () => {});
  const store = await openSupabaseStore({ url: "https://x.supabase.co", key: "k", client: fake.client });
  t.after(() => store.close());
  assert.equal(fake.db.get("events").size, store.data.events.length);
  assert.equal(fake.db.get("registrations").size, store.data.registrations.length);
  assert.equal(fake.db.get("directory").size, Object.keys(store.data.directory).length);
  assert.equal(fake.db.get("state").get("rev").data, store.data.rev);
  assert.equal(fake.db.get("registrations").values().next().value.event_id, store.data.registrations[0].eventId);
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
  assert.deepEqual(fake.ops.sort(), [["delete", "logs", 1], ["upsert", "events", 1], ["upsert", "registrations", 1], ["upsert", "state", 1]].sort());
  assert.equal(fake.db.get("registrations").get(first.id).data.status, "cancelled");
  assert.equal(fake.db.get("logs").has(dropped), false);
  assert.equal(fake.db.get("events").get("new-1").data.title, "New");
  assert.equal(fake.db.get("state").get("rev").data, store.data.rev);
});

test("existing rows load back in order and nothing is rewritten", async (t) => {
  const seeded = fakeSupabase();
  t.mock.method(console, "log", () => {});
  const first = await openSupabaseStore({ url: "https://x.supabase.co", key: "k", client: seeded.client });
  await first.close();
  const tables = Object.fromEntries([...seeded.db].map(([name, rows]) => [name, [...rows.values()]]));
  const again = fakeSupabase({ tables });
  const store = await openSupabaseStore({ url: "https://x.supabase.co", key: "k", client: again.client });
  t.after(() => store.close());
  assert.deepEqual(store.data.events.map((e) => e.id), first.data.events.map((e) => e.id));
  assert.deepEqual(store.data.registrations.map((r) => r.id), first.data.registrations.map((r) => r.id));
  assert.deepEqual(store.data.directory, first.data.directory);
  assert.equal(store.data.rev, first.data.rev);
  assert.equal(again.ops.length, 0);
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
  assert.notEqual(fake.db.get("events").get(store.data.events[0].id).data.title, "Renamed");
  fake.setFailWrites(false);
  await store.flush();
  assert.equal(fake.db.get("events").get(store.data.events[0].id).data.title, "Renamed");
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
