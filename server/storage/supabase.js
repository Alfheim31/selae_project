import { createClient } from "@supabase/supabase-js";
import { buildSeed } from "../seed/seed.js";
import { trackStore, untrackStore } from "./store.js";

/* Supabase store: same interface as the file store, rows in Postgres, photos in Storage */

const SAVE_DELAY = 200;
const RETRY_DELAY = 5000;
const MAX_LOGS = 50000;
const PAGE = 1000;
const UPSERT_CHUNK = 500;
const DELETE_CHUNK = 200;
const BUCKET = "uploads";

// One table per collection; everything else at the top level (rev, matcher) goes in `state`
const TABLES = [
  { table: "events", key: "id", field: "events", kind: "array" },
  { table: "registrations", key: "id", field: "registrations", kind: "array", eventId: true },
  { table: "logs", key: "uid", field: "logs", kind: "array", eventId: true },
  { table: "ocr_scans", key: "id", field: "ocrScans", kind: "array", eventId: true },
  { table: "directory", key: "id", field: "directory", kind: "map" },
  { table: "profiles", key: "id", field: "profiles", kind: "map" },
  { table: "state", key: "key", field: null, kind: "state" },
];
const COLLECTIONS = new Set(TABLES.map((t) => t.field).filter(Boolean));

function missingTable(error) {
  const text = `${error.code || ""} ${error.message || ""}`;
  return /42P01|PGRST205|does not exist|Could not find the table/i.test(text);
}

function explain(error, what) {
  if (missingTable(error)) {
    return new Error(`SELAE can't find its tables in Supabase (${error.message}). Open the SQL editor of your project, paste server/storage/supabase.sql and run it, then start again.`);
  }
  return new Error(`SELAE couldn't ${what} in Supabase: ${error.message || error}`);
}

// Rows for one table, as key -> { row, json }; json is what we compare between flushes
function rowsOf(spec, data) {
  const out = new Map();
  const now = new Date().toISOString();
  const add = (key, value, eventId) => {
    if (key === undefined || key === null || key === "") return;
    const row = { [spec.key]: String(key), data: value, updated_at: now };
    if (spec.eventId) row.event_id = eventId ?? null;
    out.set(String(key), { row, json: JSON.stringify(value) });
  };
  if (spec.kind === "array") for (const item of data[spec.field] || []) add(item[spec.key], item, item.eventId);
  else if (spec.kind === "map") for (const [k, v] of Object.entries(data[spec.field] || {})) add(k, v);
  else for (const [k, v] of Object.entries(data)) if (!COLLECTIONS.has(k)) add(k, v);
  return out;
}

async function readAll(client, spec) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client.from(spec.table).select("*").order("seq", { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw explain(error, `read ${spec.table}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

function assemble(byTable) {
  const data = {};
  for (const spec of TABLES) {
    const rows = byTable.get(spec.table) || [];
    if (spec.kind === "array") data[spec.field] = rows.map((r) => r.data);
    else if (spec.kind === "map") data[spec.field] = Object.fromEntries(rows.map((r) => [r.id, r.data]));
    else for (const r of rows) data[r.key] = r.data;
  }
  return data;
}

export async function openSupabaseStore({ url, key, client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) }) {
  // Load everything, or seed an empty project
  const byTable = new Map();
  for (const spec of TABLES) byTable.set(spec.table, await readAll(client, spec));
  const empty = [...byTable.values()].every((rows) => rows.length === 0);
  const data = empty ? buildSeed(new Date()) : assemble(byTable);
  if (!Array.isArray(data.events)) throw new Error("The Supabase tables don't hold SELAE data.");
  data.rev = data.rev || 1;

  const previous = new Map();
  if (!empty) for (const spec of TABLES) previous.set(spec.table, new Map([...rowsOf(spec, data)].map(([k, v]) => [k, v.json])));

  let timer = null, retry = null, dirty = empty, flushing = null;

  // Writes only the rows that changed since the last successful flush
  async function sync() {
    const plan = TABLES.map((spec) => {
      const current = rowsOf(spec, data);
      const before = previous.get(spec.table) || new Map();
      const upserts = [], deletes = [];
      for (const [k, { row, json }] of current) if (before.get(k) !== json) upserts.push(row);
      for (const k of before.keys()) if (!current.has(k)) deletes.push(k);
      return { spec, current, upserts, deletes };
    });
    for (const { spec, upserts, deletes } of plan) {
      for (let i = 0; i < upserts.length; i += UPSERT_CHUNK) {
        const { error } = await client.from(spec.table).upsert(upserts.slice(i, i + UPSERT_CHUNK), { onConflict: spec.key });
        if (error) throw explain(error, `save ${spec.table}`);
      }
      for (let i = 0; i < deletes.length; i += DELETE_CHUNK) {
        const { error } = await client.from(spec.table).delete().in(spec.key, deletes.slice(i, i + DELETE_CHUNK));
        if (error) throw explain(error, `delete from ${spec.table}`);
      }
    }
    for (const { spec, current } of plan) previous.set(spec.table, new Map([...current].map(([k, v]) => [k, v.json])));
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
  if (empty) {
    await flush();
    console.log("SELAE: the Supabase project was empty, so the demo data was written there.");
  }
  return store;
}
