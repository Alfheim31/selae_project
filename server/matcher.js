/* OCR identity matcher */

export const DIGITS = 10;
const DEL = 10;

// Common OCR confusions
export const CONFUSABLE = [
  [0, 8], [0, 6], [0, 9], [1, 7], [1, 4], [2, 7], [3, 8], [3, 5],
  [4, 9], [5, 6], [5, 8], [6, 8], [8, 9], [2, 3],
];

export const PRIOR = {
  correct: 60,
  confusable: 3,
  other: 0.3,
  deletion: 0.6,
  insertions: 1,
  ops: 100,
};

// Decision thresholds
export const DEFAULT_THRESHOLDS = { autoAt: 0.95, confirmAt: 0.4 };

export const PRIOR_WEIGHT = {
  expected: 1,
  inside: 0.05,
  waitlist: 0.1,
  stranger: 0.01,
};
const UNKNOWN_SHARE = 0.05;

// Confidence limits
const CONF_FLOOR = 0.05, CONF_CEIL = 0.97;

/* ---------- model state ---------- */
export function emptyModel() {
  return {
    learned: Array.from({ length: DIGITS }, () => Array(DIGITS + 1).fill(0)),
    insertions: 0,
    ops: 0,
    corrections: 0,
    thresholds: { ...DEFAULT_THRESHOLDS },
    updatedAt: null,
  };
}

export function ensureModel(data) {
  if (!data.matcher) data.matcher = emptyModel();
  if (!data.ocrScans) data.ocrScans = [];
  return data.matcher;
}

function priorCount(t, r) {
  if (r === DEL) return PRIOR.deletion;
  if (t === r) return PRIOR.correct;
  return CONFUSABLE.some(([a, b]) => (a === t && b === r) || (a === r && b === t)) ? PRIOR.confusable : PRIOR.other;
}

export function channel(model) {
  const P = [];
  for (let t = 0; t < DIGITS; t++) {
    const row = [];
    let sum = 0;
    for (let r = 0; r <= DIGITS; r++) { row[r] = priorCount(t, r) + (model ? model.learned[t][r] : 0); sum += row[r]; }
    P.push(row.map((v) => v / sum));
  }
  const pIns = (PRIOR.insertions + (model ? model.insertions : 0)) / (PRIOR.ops + (model ? model.ops : 0));
  return { P, pIns };
}

/* ---------- helpers ---------- */
export const digitsOf = (s) => String(s || "").replace(/\D/g, "");

export const pretty = (d) => (d.length === 9 ? `${d.slice(0, 4)}-${d.slice(4)}` : d);

function logSumExp(a, b) {
  if (a === -Infinity) return b;
  if (b === -Infinity) return a;
  const m = Math.max(a, b);
  return m + Math.log(Math.exp(a - m) + Math.exp(b - m));
}

const clampConf = (c) => (typeof c === "number" && Number.isFinite(c) ? Math.min(CONF_CEIL, Math.max(CONF_FLOOR, c)) : null);

function emission(ch, t, r, c) {
  if (c == null) return ch.P[t][r];
  if (r === t) return c;
  const wrong = 1 - ch.P[t][t] - ch.P[t][DEL];
  return (1 - c) * (ch.P[t][r] / wrong);
}

/* likelihood */
function align(truth, read, conf, ch, best = false) {
  const n = truth.length, m = read.length;
  const comb = best ? Math.max : logSumExp;
  const lIns = Math.log(ch.pIns / DIGITS);
  const lGo = Math.log(1 - ch.pIns);
  const F = Array.from({ length: n + 1 }, () => Array(m + 1).fill(-Infinity));
  const back = best ? Array.from({ length: n + 1 }, () => Array(m + 1).fill(null)) : null;
  F[0][0] = 0;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      const here = F[i][j];
      if (here === -Infinity) continue;
      const step = (ni, nj, lp, op) => {
        const v = here + lp;
        const prev = F[ni][nj];
        const next = comb(prev, v);
        if (best && v > prev) back[ni][nj] = { i, j, op };
        F[ni][nj] = next;
      };
      if (j < m) step(i, j + 1, lIns, { kind: "ins", r: +read[j] });
      if (i < n) {
        const t = +truth[i];
        step(i + 1, j, lGo + Math.log(ch.P[t][DEL]), { kind: "del", t });
        if (j < m) {
          const r = +read[j];
          const e = emission(ch, t, r, conf ? clampConf(conf[j]) : null);
          step(i + 1, j + 1, lGo + Math.log(Math.max(e, 1e-12)), { kind: "sub", t, r });
        }
      }
    }
  }
  const logL = F[n][m] + lGo;
  if (!best) return logL;
  const ops = [];
  for (let i = n, j = m; i > 0 || j > 0;) {
    const b = back[i][j];
    if (!b) break;
    ops.push(b.op);
    i = b.i; j = b.j;
  }
  return { logL, ops: ops.reverse() };
}

/* Fast forward pass */
function logEmissions(read, conf, ch) {
  return Array.from(read, (r, j) => {
    const c = conf ? clampConf(conf[j]) : null;
    return Float64Array.from({ length: DIGITS }, (_, t) => Math.log(Math.max(emission(ch, t, +r, c), 1e-12)));
  });
}
function forwardFast(truth, E, ch, lDel) {
  const n = truth.length, m = E.length, W = m + 1;
  const lIns = Math.log(ch.pIns / DIGITS), lGo = Math.log(1 - ch.pIns);
  const F = new Float64Array((n + 1) * W).fill(-Infinity);
  F[0] = 0;
  for (let i = 0; i <= n; i++) {
    const t = i < n ? truth.charCodeAt(i) - 48 : -1;
    for (let j = 0; j <= m; j++) {
      const here = F[i * W + j];
      if (here === -Infinity) continue;
      if (j < m) F[i * W + j + 1] = logSumExp(F[i * W + j + 1], here + lIns);
      if (t >= 0) {
        F[(i + 1) * W + j] = logSumExp(F[(i + 1) * W + j], here + lGo + lDel[t]);
        if (j < m) F[(i + 1) * W + j + 1] = logSumExp(F[(i + 1) * W + j + 1], here + lGo + E[j][t]);
      }
    }
  }
  return F[n * W + m] + lGo;
}

export const logLikelihood = (truth, read, conf, ch) => align(digitsOf(truth), digitsOf(read), conf, ch, false);
export const bestAlignment = (truth, read, ch) => align(digitsOf(truth), digitsOf(read), null, ch, true);

function unknownLogL(read, conf, ch, people) {
  const m = read.length;
  const ids = people.map((x) => digitsOf(x.id)).filter((d) => d.length === m);
  let logL = Math.log(1 - ch.pIns) * (m + 1);
  for (let j = 0; j < m; j++) {
    const q = Array(DIGITS).fill(1);
    for (const d of ids) q[+d[j]] += 1;
    const total = DIGITS + ids.length;
    const c = conf ? clampConf(conf[j]) : null;
    let s = 0;
    for (let t = 0; t < DIGITS; t++) s += (q[t] / total) * emission(ch, t, +read[j], c) * (1 - ch.P[t][DEL]);
    logL += Math.log(Math.max(s, 1e-12));
  }
  return logL;
}

/* ---------- reasoning: posterior over everyone it could be ---------- */
export function rank(people, read, conf, model, { limit = 3 } = {}) {
  const ch = channel(model);
  const r = digitsOf(read);
  const confDigits = conf && conf.length === r.length ? conf : null;
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(model && model.thresholds) };

  const totalWeight = people.reduce((s, x) => s + x.weight, 0);
  const unknownWeight = UNKNOWN_SHARE * Math.max(totalWeight, 1) / (1 - UNKNOWN_SHARE);

  const E = logEmissions(r, confDigits, ch);
  const lDel = ch.P.map((row) => Math.log(row[DEL]));
  const scored = people.map((x) => ({ ...x, logL: forwardFast(digitsOf(x.id), E, ch, lDel) }));
  const uLogL = unknownLogL(r, confDigits, ch, people);

  // Normalize
  const logPost = scored.map((x) => x.logL + Math.log(x.weight));
  const uLogPost = uLogL + Math.log(unknownWeight);
  let Z = uLogPost;
  for (const v of logPost) Z = logSumExp(Z, v);
  scored.forEach((x, i) => { x.p = Math.exp(logPost[i] - Z); });
  const pUnknown = Math.exp(uLogPost - Z);

  scored.sort((a, b) => b.p - a.p);
  const candidates = scored.slice(0, limit);
  const top = candidates[0] || null;

  let decision;
  if (!r.length || !top || pUnknown >= top.p) decision = "reject";
  else if (top.p >= thresholds.autoAt) decision = "auto";
  else if (top.p >= thresholds.confirmAt) decision = "confirm";
  else decision = "reject";

  return { read: r, candidates, pUnknown, decision, top, thresholds };
}

export function priorWeight(reg) {
  if (!reg || reg.status === "cancelled") return PRIOR_WEIGHT.stranger;
  if (reg.status === "waitlist") return PRIOR_WEIGHT.waitlist;
  return reg.checkin ? PRIOR_WEIGHT.inside : PRIOR_WEIGHT.expected;
}

/* ---------- learning from operator corrections ---------- */
const MAX_EDITS_TO_LEARN = 3;

export function learn(model, read, trueId) {
  const r = digitsOf(read), t = digitsOf(trueId);
  if (!r.length || !t.length) return null;
  const { ops } = bestAlignment(t, r, channel(model));
  const edits = ops.filter((o) => o.kind !== "sub" || o.t !== o.r);
  if (edits.length > MAX_EDITS_TO_LEARN) return null;
  for (const o of ops) {
    if (o.kind === "sub") model.learned[o.t][o.r] += 1;
    else if (o.kind === "del") model.learned[o.t][DEL] += 1;
    else model.insertions += 1;
  }
  model.ops += r.length;
  model.corrections += 1;
  model.updatedAt = new Date().toISOString();
  return edits.map((o) => (o.kind === "sub" ? `${o.t}→${o.r}` : o.kind === "del" ? `${o.t}→∅` : `∅→${o.r}`));
}

export function topConfusions(model, n = 6) {
  const out = [];
  for (let t = 0; t < DIGITS; t++)
    for (let r = 0; r <= DIGITS; r++)
      if (r !== t && model.learned[t][r] > 0) out.push({ true: t, read: r === DEL ? null : r, count: model.learned[t][r] });
  return out.sort((a, b) => b.count - a.count).slice(0, n);
}

export function digitAccuracy(model) {
  const { P } = channel(model);
  return P.reduce((s, row, t) => s + row[t], 0) / DIGITS;
}
