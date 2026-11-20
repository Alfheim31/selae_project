import { createClient } from "@supabase/supabase-js";
import { buildSeed } from "../seed/seed.js";
import { trackStore, untrackStore } from "./store.js";
import { assemble, rowsFor, TABLES, toRow } from "./columns.js";

/* Supabase store: same interface as the file store, one column per field in Postgres, photos in Storage.
   The server keeps everything in memory and writes back only the rows that changed. */

const SAVE_DELAY = 200;
const RETRY_DELAY = 5000;
const MAX_LOGS = 50000;
const PAGE = 1000;
const UPSERT_CHUNK = 500;
const DELETE_CHUNK = 200;
const BUCKET = "uploads";
// Before the columns, top-level values (rev, matcher, organizations, officers, notices) were kept here as JSON
const LEGACY_STATE = "state";

function missingTable(error) {
  const text = `${error.code || ""} ${error.message || ""}`;
  return /42P01|PGRST205|does not exist|Could not find the table/i.test(text);
}

function explain(error, what) {
  if (missingTable(error)) {
    return new Error(`SELAE can't find its tables in Supabase (${error.message}). Open the SQL editor of your project, run server/storage/supabase.sql `
      + "(a new project) or server/storage/migrate-to-columns.sql (a project made before the columns), then start again.");
  }
  if (/column .* does not exist|Could not find the .* column/i.test(error.message || "")) {
    return new Error(`SELAE's tables in Supabase don't have their columns yet (${error.message}). Run server/storage/migrate-to-columns.sql in the SQL editor, then start again.`);
  }
  return new Error(`SELAE couldn't ${what} in Supabase: ${error.message || error}`);
}

// Every row of a table, oldest first; null when the table doesn't exist
async function readAll(client, table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client.from(table).select("*").order("seq", { ascending: true }).range(from, from + PAGE - 1);
    if (error) {
      if (missingTable(error)) return null;
      throw explain(error, `read ${table}`);
    }
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export async function openSupabaseStore({ url, key, client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) }) {
  // Load everything, or seed an empty project
  const byTable = new Map();
  for (const spec of TABLES) {
    const rows = await readAll(client, spec.table);
    if (rows === null) throw explain({ code: "42P01", message: `relation "public.${spec.table}" does not exist` }, `read ${spec.table}`);
    byTable.set(spec.table, rows);
    // Every column the server writes has to be there, or each save would fail while the app kept running
    const cols = [spec.key, ...spec.cols.map(([c]) => c), ...(spec.kind === "child" ? [spec.parentCol] : [])];
    const probe = await client.from(spec.table).select(cols.join(",")).limit(1);
    if (probe.error) {
      throw new Error(`SELAE's "${spec.table}" table in Supabase is missing a column (${probe.error.message}). `
        + "Run server/storage/add-columns.sql in the SQL editor, then start again.");
    }
  }
  const stateRows = (await readAll(client, LEGACY_STATE)) || [];

  /* Rows saved before the columns keep the whole record in a `data` JSON column. They're read from there,
     written back as columns (with `data` cleared), and the old `state` rows are deleted once moved. */
  const legacy = new Map(TABLES.map((t) => [t.table, new Set()]));
  const fromDb = new Map(TABLES.map((t) => [t.table, new Set()]));
  const spec = (name) => TABLES.find((t) => t.table === name);
  const canonical = new Map(TABLES.map((t) => [t.table, []]));
  for (const t of TABLES) {
    if (t.kind === "child") continue;
    for (const row of byTable.get(t.table)) {
      const k = String(row[t.key]);
      if (row.data !== null && row.data !== undefined && t.kind !== "settings") {
        legacy.get(t.table).add(k);
        canonical.get(t.table).push(toRow(t, row.data, { key: k }));
        // Photos were part of the event
        if (t.table === "events") {
          (row.data.photos || []).forEach((p, i) => canonical.get("event_photos").push(toRow(spec("event_photos"), { ...p, _position: i }, { parentId: k })));
        }
      } else {
        fromDb.get(t.table).add(k);
        canonical.get(t.table).push(row);
      }
    }
  }
  for (const row of byTable.get("event_photos")) { fromDb.get("event_photos").add(String(row.id)); canonical.get("event_photos").push(row); }

  // The old `state` rows: used for whatever the new tables don't have yet, then deleted
  const movedState = [];
  const state = Object.fromEntries(stateRows.map((r) => [r.key, r.data]));
  if (stateRows.length) {
    const settings = spec("settings");
    if (!canonical.get("settings").length && ("rev" in state || "matcher" in state)) {
      canonical.get("settings").push(toRow(settings, { id: "main", rev: state.rev, matcher: state.matcher }));
    }
    for (const [field, table] of [["orgs", "orgs"], ["orgMembers", "org_members"], ["notices", "notices"]]) {
      if (canonical.get(table).length || !Array.isArray(state[field])) continue;
      for (const rec of state[field]) canonical.get(table).push(toRow(spec(table), rec));
    }
    for (const k of Object.keys(state)) {
      if (["rev", "matcher", "orgs", "orgMembers", "notices"].includes(k)) movedState.push(k);
      else console.error(`SELAE: the old state table has "${k}", which has no column; it was left there.`);
    }
  }

  const empty = TABLES.every((t) => canonical.get(t.table).length === 0);
  const data = empty ? buildSeed(new Date()) : assemble(canonical);
  if (!Array.isArray(data.events)) data.events = [];
  for (const t of TABLES) if (t.kind === "array" && !Array.isArray(data[t.field])) data[t.field] = [];
  for (const t of TABLES) if (t.kind === "map" && !data[t.field]) data[t.field] = {};
  data.rev = data.rev || 1;

  // What each table holds now, as the server would write it; rows that came from `data` aren't in here,
  // so they get written as columns on the first flush
  const previous = new Map();
  for (const t of TABLES) {
    const have = fromDb.get(t.table);
    const m = new Map();
    for (const [k, row] of rowsFor(t, data)) if (have.has(k)) m.set(k, JSON.stringify(row));
    // In the table but not in the data (a photo of a deleted event): removed on the next flush
    for (const k of have) if (!m.has(k)) m.set(k, "");
    previous.set(t.table, m);
  }

  let timer = null, retry = null, dirty = true, flushing = null;

  // Writes only the rows that changed since the last successful flush
  async function sync() {
    const now = new Date().toISOString();
    const plan = TABLES.map((t) => {
      const current = rowsFor(t, data);
      const before = previous.get(t.table);
      const old = legacy.get(t.table);
      const upserts = [], deletes = [], json = new Map();
      for (const [k, row] of current) {
        const j = JSON.stringify(row);
        json.set(k, j);
        if (before.get(k) !== j) upserts.push({ ...row, ...(old.has(k) ? { data: null } : {}), updated_at: now });
      }
      for (const k of before.keys()) if (!current.has(k)) deletes.push(k);
      for (const k of old) if (!current.has(k)) deletes.push(k);
      return { t, json, upserts, deletes };
    });
    for (const { t, upserts, deletes } of plan) {
      for (let i = 0; i < upserts.length; i += UPSERT_CHUNK) {
        const { error } = await client.from(t.table).upsert(upserts.slice(i, i + UPSERT_CHUNK), { onConflict: t.key });
        if (error) throw explain(error, `save ${t.table}`);
      }
      for (let i = 0; i < deletes.length; i += DELETE_CHUNK) {
        const { error } = await client.from(t.table).delete().in(t.key, deletes.slice(i, i + DELETE_CHUNK));
        if (error) throw explain(error, `delete from ${t.table}`);
      }
    }
    for (const { t, json } of plan) { previous.set(t.table, json); legacy.get(t.table).clear(); }
    if (movedState.length) {
      const { error } = await client.from(LEGACY_STATE).delete().in("key", movedState);
      if (error) throw explain(error, "clear the old state table");
      movedState.length = 0;
    }
  }

  async function flush() {
    if (flushing) await flushing;
    if (timer) { clearTimeout(timer); timer = null; }
    if (!dirty) return;
    dirty = false;
    flushing = sync().catch((e) => {
      dirty = true;
      console.error(`SELAE: ${e.message} Will retry.`);
      if (!retry) { retry = setTimeout(() => { retry = null; flush().catch(() => {}); }, RETRY_DELAY); retry.unref(); }
    }).finally(() => { flushing = null; });
    await flushing;
  }

  function schedule() {
    dirty = true;
    if (timer) return;
    timer = setTimeout(() => { timer = null; flush().catch(() => {}); }, SAVE_DELAY);
    timer.unref();
  }

  // Photos and covers
  const bucket = client.storage.from(BUCKET);
  try {
    const { error } = await client.storage.getBucket(BUCKET);
    if (error) {
      const made = await client.storage.createBucket(BUCKET, { public: true });
      if (made.error) throw made.error;
    }
  } catch (e) {
    console.error(`SELAE: couldn't prepare the "${BUCKET}" storage bucket (${e.message}). Photo uploads will fail until it exists and is public.`);
  }
  const uploadUrl = (name) => bucket.getPublicUrl(name).data.publicUrl;

  const store = {
    file: `Supabase ${url}`,
    uploadsDir: null,
    get data() { return data; },
    mutate(fn) {
      const out = fn(data);
      data.rev += 1;
      if (data.logs && data.logs.length > MAX_LOGS) data.logs.splice(0, data.logs.length - MAX_LOGS);
      schedule();
      return out;
    },
    flush,
    async close() { await flush(); untrackStore(store); },
    async putUpload(name, buf, contentType) {
      const { error } = await bucket.upload(name, buf, { contentType, upsert: true });
      if (error) throw new Error(`The photo couldn't be stored in Supabase: ${error.message}`);
      return uploadUrl(name);
    },
    removeUpload(name) {
      bucket.remove([name]).then(({ error }) => { if (error) console.error(`SELAE: couldn't delete ${name} from Supabase storage.`, error.message); }, () => {});
    },
    uploadUrl,
  };
  trackStore(store);
  // Writes the demo data into an empty project, or moves records into a table created since the last
  // start; when the tables already match what was read, nothing is written
  await flush();
  if (empty) console.log("SELAE: the Supabase project was empty, so the demo data was written there.");
  return store;
}
