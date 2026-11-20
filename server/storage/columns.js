/* How each SELAE record maps to the columns of its Supabase table: one column per field, no JSON.
   Nested parts are flattened (a ticket's check-in becomes checkin_time, checkin_method, ...),
   lists of numbers become Postgres arrays, and event photos get their own table. */

// Column types: how a value is written, how it's read back, and its Postgres type
const TYPES = {
  text: { sql: "text", put: (v) => (v === undefined || v === null ? null : String(v)), get: (v) => v },
  int: { sql: "integer", put: (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Math.round(Number(v))), get: (v) => v },
  num: { sql: "double precision", put: (v) => (typeof v === "number" && Number.isFinite(v) ? v : null), get: (v) => v },
  bool: { sql: "boolean", put: (v) => (v === undefined || v === null ? null : Boolean(v)), get: (v) => v },
  time: {
    sql: "timestamptz",
    put: (v) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null),
    get: (v) => (v ? new Date(v).toISOString() : v),
  },
  nums: {
    sql: "double precision[]",
    put: (v) => (Array.isArray(v) ? v.map((x) => (typeof x === "number" && Number.isFinite(x) ? x : null)) : null),
    get: (v) => (Array.isArray(v) ? v.map(Number) : v),
  },
  texts: { sql: "text[]", put: (v) => (Array.isArray(v) ? v.map((x) => (x === null || x === undefined ? null : String(x))) : null), get: (v) => v },
};

const getPath = (rec, path) => path.split(".").reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), rec);
function setPath(rec, path, value) {
  const keys = path.split(".");
  let o = rec;
  for (const k of keys.slice(0, -1)) o = o[k] && typeof o[k] === "object" ? o[k] : (o[k] = {});
  o[keys[keys.length - 1]] = value;
}

/* Each table:
   key      the primary key column (and the record's field of the same name, unless keyField says otherwise)
   field    where the records live in the server's data
   kind     "array" (a list), "map" (keyed by id), "child" (rows that belong to another table's records),
            or "settings" (a single row of top-level values)
   cols     [column, field path, type]
   nulls    fields the server expects to be present even when empty
   after    fills in parts that aren't a single column, after reading a row
   before   the reverse, before writing one */
export const TABLES = [
  {
    table: "events", key: "id", field: "events", kind: "array",
    cols: [
      ["title", "title", "text"], ["host_name", "hostName", "text"], ["org_id", "orgId", "text"], ["venue", "venue", "text"],
      ["description", "description", "text"], ["category", "category", "text"], ["color", "color", "text"],
      ["capacity", "capacity", "int"], ["starts_at", "startsAt", "time"], ["ends_at", "endsAt", "time"],
      ["visibility", "visibility", "text"], ["registration_open", "registrationOpen", "bool"], ["cover_image", "coverImage", "text"],
      ["created_at", "createdAt", "time"], ["created_by", "createdBy", "text"], ["host_key_hash", "hostKeyHash", "text"],
      ["simulated", "simulated", "bool"],
    ],
  },
  {
    // An event's photos, in the order they were added
    table: "event_photos", key: "id", field: "photos", kind: "child", parent: "events", parentCol: "event_id",
    cols: [["url", "url", "text"], ["uploaded_at", "uploadedAt", "time"], ["position", "_position", "int"]],
  },
  {
    table: "registrations", key: "id", field: "registrations", kind: "array",
    cols: [
      ["event_id", "eventId", "text"], ["code", "code", "text"], ["student_id", "studentId", "text"], ["user_id", "userId", "text"],
      ["email", "email", "text"], ["status", "status", "text"], ["walk_in", "walkIn", "bool"],
      ["created_at", "createdAt", "time"], ["promoted_at", "promotedAt", "time"], ["promoted_by", "promotedBy", "text"],
      ["student_first", "student.first", "text"], ["student_middle", "student.middle", "text"], ["student_last", "student.last", "text"],
      ["student_suffix", "student.suffix", "text"], ["student_section", "student.section", "text"],
      ["face_descriptor", "faceDescriptor", "nums"],
      ["checkin_time", "checkin.time", "time"], ["checkin_method", "checkin.method", "text"], ["checkin_confidence", "checkin.confidence", "num"],
      ["checkout_time", "checkout.time", "time"], ["checkout_method", "checkout.method", "text"],
    ],
    nulls: ["checkin"],
    after(rec) {
      // The copy of the student's details on the ticket carries the student number too
      if (rec.student) rec.student = { id: rec.studentId, ...rec.student };
      if (rec.checkin && rec.checkin.confidence === undefined) rec.checkin.confidence = null;
    },
  },
  {
    table: "logs", key: "uid", field: "logs", kind: "array",
    cols: [
      ["event_id", "eventId", "text"], ["time", "time", "time"], ["student_id", "studentId", "text"],
      ["outcome", "outcome", "text"], ["method", "method", "text"], ["confidence", "confidence", "num"],
    ],
    nulls: ["studentId", "confidence"],
  },
  {
    table: "ocr_scans", key: "id", field: "ocrScans", kind: "array",
    cols: [
      ["event_id", "eventId", "text"], ["time", "time", "time"], ["read", "read", "text"], ["conf", "conf", "nums"],
      ["source", "source", "text"], ["decision", "decision", "text"], ["p_unknown", "pUnknown", "num"],
      ["candidate_ids", "_candidateIds", "texts"], ["candidate_ps", "_candidatePs", "nums"],
      ["resolution", "resolution", "text"], ["truth", "truth", "text"], ["rank", "rank", "int"], ["learned", "learned", "texts"],
    ],
    nulls: ["conf", "resolution", "truth", "rank", "learned"],
    before(rec) {
      const c = Array.isArray(rec.candidates) ? rec.candidates : [];
      return { ...rec, _candidateIds: c.map((x) => x.id), _candidatePs: c.map((x) => x.p) };
    },
    after(rec) {
      const ids = rec._candidateIds || [], ps = rec._candidatePs || [];
      rec.candidates = ids.map((id, i) => ({ id, p: ps[i] ?? null }));
      delete rec._candidateIds; delete rec._candidatePs;
    },
  },
  {
    table: "directory", key: "id", field: "directory", kind: "map",
    cols: [
      ["first", "first", "text"], ["middle", "middle", "text"], ["last", "last", "text"], ["suffix", "suffix", "text"],
      ["section", "section", "text"], ["face_descriptor", "faceDescriptor", "nums"],
    ],
  },
  {
    table: "profiles", key: "id", field: "profiles", kind: "map",
    cols: [
      ["user_id", "userId", "text"], ["email", "email", "text"], ["sign_in", "signInWith", "text"], ["student_id", "studentId", "text"],
      ["first", "first", "text"], ["middle", "middle", "text"], ["last", "last", "text"], ["suffix", "suffix", "text"],
      ["section", "section", "text"], ["face_descriptor", "faceDescriptor", "nums"], ["face_consent_at", "faceConsentAt", "time"],
      ["saved_at", "updatedAt", "time"],
    ],
    nulls: ["faceDescriptor", "faceConsentAt"],
  },
  {
    table: "orgs", key: "id", field: "orgs", kind: "array",
    cols: [
      ["name", "name", "text"], ["email", "email", "text"], ["type", "type", "text"], ["disabled", "disabled", "bool"],
      ["logo", "logo", "text"], ["cover", "cover", "text"], ["created_at", "createdAt", "time"], ["created_by", "createdBy", "text"],
      ["edited_at", "updatedAt", "time"], ["disabled_at", "disabledAt", "time"],
    ],
  },
  {
    table: "org_members", key: "id", field: "orgMembers", kind: "array",
    cols: [
      ["org_id", "orgId", "text"], ["email", "email", "text"], ["status", "status", "text"], ["user_id", "userId", "text"],
      ["invited_at", "invitedAt", "time"], ["accepted_at", "acceptedAt", "time"],
    ],
  },
  {
    table: "notices", key: "id", field: "notices", kind: "array",
    cols: [["to_email", "to", "text"], ["time", "time", "time"], ["kind", "kind", "text"], ["text", "text", "text"], ["org_id", "orgId", "text"]],
  },
  {
    // One row: the data version, and the OCR matcher's learned corrections (a table of counts, stored flat)
    table: "settings", key: "id", field: null, kind: "settings",
    cols: [
      ["rev", "rev", "int"],
      ["matcher_learned", "_learned", "nums"], ["matcher_columns", "_learnedColumns", "int"],
      ["matcher_insertions", "matcher.insertions", "num"], ["matcher_ops", "matcher.ops", "num"], ["matcher_corrections", "matcher.corrections", "num"],
      ["matcher_auto_at", "matcher.thresholds.autoAt", "num"], ["matcher_confirm_at", "matcher.thresholds.confirmAt", "num"],
      ["matcher_updated_at", "matcher.updatedAt", "time"],
    ],
    before(rec) {
      const m = rec.matcher;
      if (!m || !Array.isArray(m.learned)) return rec;
      return { ...rec, _learned: m.learned.flat(), _learnedColumns: (m.learned[0] || []).length };
    },
    after(rec) {
      if (rec.matcher || rec._learned) {
        const flat = rec._learned || [], width = rec._learnedColumns || 1;
        const learned = [];
        for (let i = 0; i < flat.length; i += width) learned.push(flat.slice(i, i + width));
        rec.matcher = { learned, insertions: 0, ops: 0, corrections: 0, updatedAt: null, ...(rec.matcher || {}) };
        rec.matcher.learned = learned;
      }
      delete rec._learned; delete rec._learnedColumns;
    },
  },
];

const SETTINGS_ID = "main";
// Top-level values that live in the settings row
const SETTINGS_FIELDS = new Set(["rev", "matcher"]);

// A record as the columns of its row (without the table's own seq / updated_at)
export function toRow(spec, rec, extra = {}) {
  const src = spec.before ? spec.before(rec) : rec;
  const row = { [spec.key]: String(extra.key ?? src[spec.keyField || spec.key]) };
  for (const [col, path, type] of spec.cols) row[col] = TYPES[type].put(getPath(src, path));
  if (spec.kind === "child") row[spec.parentCol] = extra.parentId;
  return row;
}

// A row back into a record; empty columns are left out, except the fields the server expects
export function fromRow(spec, row) {
  const rec = spec.kind === "settings" ? {} : { [spec.keyField || spec.key]: row[spec.key] };
  for (const [col, path, type] of spec.cols) {
    const v = row[col];
    if (v === null || v === undefined) continue;
    setPath(rec, path, TYPES[type].get(v));
  }
  for (const f of spec.nulls || []) if (rec[f] === undefined) rec[f] = null;
  if (spec.after) spec.after(rec);
  return rec;
}

// Every row of one table, as key -> row, from the server's data
export function rowsFor(spec, data) {
  const out = new Map();
  const put = (rec, extra) => {
    const row = toRow(spec, rec, extra);
    if (row[spec.key] && row[spec.key] !== "undefined" && row[spec.key] !== "null") out.set(row[spec.key], row);
  };
  if (spec.kind === "array") for (const rec of data[spec.field] || []) put(rec);
  else if (spec.kind === "map") for (const [k, rec] of Object.entries(data[spec.field] || {})) put(rec, { key: k });
  else if (spec.kind === "child") {
    for (const parent of data[spec.parent] || []) {
      (parent[spec.field] || []).forEach((rec, i) => put({ ...rec, _position: i }, { parentId: parent.id }));
    }
  } else put({ ...Object.fromEntries([...SETTINGS_FIELDS].map((f) => [f, data[f]])), id: SETTINGS_ID });
  return out;
}

// The server's data from every table's rows
export function assemble(byTable) {
  const data = {};
  for (const t of TABLES) {
    const rows = byTable.get(t.table) || [];
    if (t.kind === "array") data[t.field] = rows.map((r) => fromRow(t, r));
    else if (t.kind === "map") data[t.field] = Object.fromEntries(rows.map((r) => [r[t.key], fromRow(t, r)]));
    else if (t.kind === "settings") {
      const row = rows.find((r) => r[t.key] === SETTINGS_ID);
      if (row) Object.assign(data, fromRow(t, row));
    }
  }
  for (const t of TABLES.filter((x) => x.kind === "child")) {
    const byParent = new Map();
    for (const r of byTable.get(t.table) || []) {
      const list = byParent.get(r[t.parentCol]) || [];
      list.push(r);
      byParent.set(r[t.parentCol], list);
    }
    for (const parent of data[t.parent] || []) {
      const list = byParent.get(parent.id);
      if (!list) continue;
      parent[t.field] = list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((r) => {
        const rec = fromRow(t, r);
        delete rec._position;
        return rec;
      });
    }
  }
  return data;
}

// The columns of every table, for the SQL files
export function columnsSql(spec) {
  return spec.cols.map(([col, , type]) => [col, TYPES[type].sql]);
}

/* Anything in the data that wouldn't survive a trip through the tables: a field with no column,
   or a value its column can't hold. Empty values (null, missing, an empty photo list) count as equal. */
export function unmappedFields(data) {
  const problems = [];
  const known = new Set([...TABLES.map((t) => t.field).filter(Boolean), ...SETTINGS_FIELDS]);
  for (const k of Object.keys(data)) if (!known.has(k)) problems.push(`top-level "${k}" has no table`);
  const back = assemble(new Map(TABLES.map((t) => [t.table, [...rowsFor(t, data).values()]])));
  const clean = (v) => {
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === "object") {
      const out = {};
      for (const [k, x] of Object.entries(v)) {
        if (x === null || x === undefined || (k === "photos" && Array.isArray(x) && !x.length)) continue;
        out[k] = clean(x);
      }
      return out;
    }
    return v;
  };
  const diff = (a, b, at) => {
    const ca = clean(a), cb = clean(b);
    if (JSON.stringify(sortKeys(ca)) === JSON.stringify(sortKeys(cb))) return;
    if (ca && cb && typeof ca === "object" && typeof cb === "object" && !Array.isArray(ca)) {
      for (const k of new Set([...Object.keys(ca), ...Object.keys(cb)])) diff(ca[k], cb[k], `${at}.${k}`);
    } else problems.push(`${at}: ${JSON.stringify(ca)?.slice(0, 80)} comes back as ${JSON.stringify(cb)?.slice(0, 80)}`);
  };
  for (const t of TABLES) {
    if (t.kind === "array") (data[t.field] || []).forEach((rec, i) => diff(rec, (back[t.field] || [])[i], `${t.field}[${i}]`));
    else if (t.kind === "map") for (const [k, rec] of Object.entries(data[t.field] || {})) diff(rec, (back[t.field] || {})[k], `${t.field}.${k}`);
  }
  for (const f of SETTINGS_FIELDS) diff(data[f], back[f], f);
  return problems;
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}
