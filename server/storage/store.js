import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSeed } from "../seed/seed.js";

/* Physical layer: a JSON file here, or Supabase (supabase.js) when .env names a project */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const SAVE_DELAY = 200;
const MAX_LOGS = 50000;

// Pending saves still reach the disk, or Supabase, when the process ends
const openStores = new Set();
const flushAll = () => Promise.all([...openStores].map(async (s) => {
  try { await s.flush(); } catch (e) { console.error(`SELAE: couldn't save ${s.file} on exit.`, e); }
}));
let exitHooked = false;
function hookExit() {
  if (exitHooked) return;
  exitHooked = true;
  process.on("exit", () => { flushAll(); });
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(signal, () => { flushAll().finally(() => process.exit(0)); });
}
export function trackStore(store) { openStores.add(store); hookExit(); return store; }
export function untrackStore(store) { openStores.delete(store); }

function parseData(file) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!data || !Array.isArray(data.events)) throw new Error("Not a SELAE data file.");
  return data;
}

// Falls back to the last good copy, and never replaces real data with the demo seed
function load(dataFile, backupFile) {
  const hasMain = fs.existsSync(dataFile), hasBackup = fs.existsSync(backupFile);
  if (!hasMain && !hasBackup) return { data: null, recovered: false };
  if (hasMain) {
    try {
      return { data: parseData(dataFile), recovered: false };
    } catch (e) {
      const kept = `${dataFile}.corrupt-${Date.now()}`;
      fs.copyFileSync(dataFile, kept);
      console.error(`SELAE: ${dataFile} can't be read (${e.message}). Kept a copy at ${kept}.`);
    }
  }
  try {
    const data = parseData(backupFile);
    console.error(`SELAE: restored the data from ${backupFile}.`);
    return { data, recovered: true };
  } catch (e) {
    throw new Error(`SELAE can't read ${dataFile} or its backup ${backupFile} (${e.message}). Fix or remove them, then start again.`);
  }
}

export function openStore(file) {
  const dataFile = path.resolve(file);
  const backupFile = `${dataFile}.bak`;
  let timer = null;
  let dirty = false;

  function write() {
    const tmp = `${dataFile}.tmp`;
    const fd = fs.openSync(tmp, "w");
    try {
      fs.writeSync(fd, JSON.stringify(data));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    if (fs.existsSync(dataFile)) fs.copyFileSync(dataFile, backupFile);
    fs.renameSync(tmp, dataFile);
  }

  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!dirty) return;
    write();
    dirty = false;
  }

  function schedule() {
    dirty = true;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      // A failed save stays pending for the next change or for exit
      try { flush(); } catch (e) { console.error("SELAE: couldn't save the data file.", e); }
    }, SAVE_DELAY);
    timer.unref();
  }

  const loaded = load(dataFile, backupFile);
  let data = loaded.data;
  if (!data) {
    data = buildSeed(new Date());
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    write();
  } else if (loaded.recovered) {
    write();
  }
  data.rev = data.rev || 1;

  // Uploads folder
  const uploadsDir = path.join(path.dirname(dataFile), "uploads");
  fs.mkdirSync(uploadsDir, { recursive: true });

  const store = {
    file: dataFile,
    uploadsDir,
    get data() { return data; },
    mutate(fn) {
      const out = fn(data);
      data.rev += 1;
      if (data.logs && data.logs.length > MAX_LOGS) data.logs.splice(0, data.logs.length - MAX_LOGS);
      schedule();
      return out;
    },
    flush,
    close() { flush(); untrackStore(store); },
    putUpload(name, buf) { fs.writeFileSync(path.join(uploadsDir, name), buf); return `/uploads/${name}`; },
    removeUpload(name) { fs.rm(path.join(uploadsDir, name), { force: true }, () => {}); },
    uploadUrl: (name) => `/uploads/${name}`,
  };
  return trackStore(store);
}

// Supabase when .env (or the environment) names a project, otherwise the local file
export async function connectStore(file = process.env.SELAE_DATA || path.join(ROOT, "data/selae.json")) {
  try { process.loadEnvFile(path.join(ROOT, ".env")); } catch { /* no .env: local file */ }
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  if (url && key) {
    const { openSupabaseStore } = await import("./supabase.js");
    return openSupabaseStore({ url, key });
  }
  console.log("SELAE: no SUPABASE_URL in .env, so the data stays in a local file (see .env.example).");
  return openStore(file);
}
