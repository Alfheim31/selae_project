import fs from "node:fs";
import path from "node:path";
import { buildSeed } from "./seed.js";

/* Physical layer */

const SAVE_DELAY = 200;
const MAX_LOGS = 50000;

// Pending saves still reach the disk when the process ends
const openStores = new Set();
const flushAll = () => {
  for (const s of openStores) {
    try { s.flush(); } catch (e) { console.error(`SELAE: couldn't save ${s.file} on exit.`, e); }
  }
};
let exitHooked = false;
function hookExit() {
  if (exitHooked) return;
  exitHooked = true;
  process.on("exit", flushAll);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(signal, () => process.exit(0));
}

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
    close() { flush(); openStores.delete(store); },
  };
  openStores.add(store);
  hookExit();
  return store;
}
