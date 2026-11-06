import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { openStore } from "./store.js";

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
  const url = pathToFileURL(path.resolve("server/store.js")).href;
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
