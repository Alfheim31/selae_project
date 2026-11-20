/* The superadmin's organization report: totals per organization for a period, and what they say.
   The server sends every event in the period with its counts; this adds them up, so the page and
   the PDF always show the same numbers. */

const TYPE_LABEL = { council: "Council", academic: "Academic org", nonacademic: "Non-academic org", religious: "Religious org" };
export const typeLabel = (t) => TYPE_LABEL[t] || "Uncategorized";

const monthKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
export const monthLabel = (key, style = "long") => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: style, year: "numeric" });
};
export const pctText = (x) => (x === null || x === undefined ? "—" : `${Math.round(x * 100)}%`);

// The period as words: "November 2026", or "Oct 1 – Dec 15, 2026"
export function periodLabel(from, to) {
  const a = new Date(from), b = new Date(to);
  // Whole months: "November 2026", "September – November 2026", "November 2026 – January 2027"
  const wholeMonths = a.getDate() === 1 && a.getHours() === 0 && new Date(b.getTime() + 1000).getDate() === 1;
  if (wholeMonths) {
    const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
    if (sameMonth) return a.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const left = a.getFullYear() === b.getFullYear() ? a.toLocaleDateString("en-US", { month: "long" }) : a.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    return `${left} – ${b.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`;
  }
  const sameYear = a.getFullYear() === b.getFullYear();
  const left = a.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
  return `${left} – ${b.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

// Start and end of a month, or of a range of days, in the viewer's time
export function monthRange(key) {
  const [y, m] = key.split("-").map(Number);
  return { from: new Date(y, m - 1, 1), to: new Date(new Date(y, m, 1).getTime() - 1) };
}
export function dayRange(fromDay, toDay) {
  const [ay, am, ad] = fromDay.split("-").map(Number), [by, bm, bd] = toDay.split("-").map(Number);
  return { from: new Date(ay, am - 1, ad), to: new Date(new Date(by, bm - 1, bd + 1).getTime() - 1) };
}

export function summarize(report) {
  const rows = new Map(report.orgs.map((o) => [o.id, {
    ...o, conducted: 0, upcoming: 0, registered: 0, attended: 0, going: 0, walkIns: 0, months: {}, events: [], top: null,
  }]));
  const months = new Set();
  let otherHosts = 0;
  for (const e of report.events) {
    const row = e.orgId && rows.get(e.orgId);
    if (!row) { otherHosts++; continue; }
    const key = monthKey(e.startsAt);
    months.add(key);
    row.events.push(e);
    if (e.isPast) {
      row.conducted++;
      row.registered += e.registered;
      row.going += e.going;
      row.attended += e.attended;
      row.walkIns += e.walkIns;
      row.months[key] = (row.months[key] || 0) + 1;
      if (!row.top || e.attended > row.top.attended) row.top = e;
    } else row.upcoming++;
  }
  const orgs = [...rows.values()].map((r) => ({
    ...r,
    // Of the people going to its past events, how many came
    rate: r.going ? Math.min(1, r.attended / r.going) : null,
    noShows: Math.max(0, r.going - r.attended),
    perEvent: r.conducted ? r.attended / r.conducted : null,
  }));
  // Active organizations first, most events first; deactivated ones at the end
  orgs.sort((a, b) => (a.disabled - b.disabled) || (b.conducted - a.conducted) || (b.attended - a.attended) || a.name.localeCompare(b.name));

  const sum = (k) => orgs.reduce((n, o) => n + o[k], 0);
  const totals = {
    conducted: sum("conducted"), upcoming: sum("upcoming"), registered: sum("registered"), attended: sum("attended"),
    going: sum("going"), active: orgs.filter((o) => !o.disabled).length, deactivated: orgs.filter((o) => o.disabled).length,
  };
  totals.rate = totals.going ? Math.min(1, totals.attended / totals.going) : null;
  const monthList = [...months].sort();
  return { orgs, totals, months: monthList, otherHosts, conclusions: conclude(orgs, monthList, report) };
}

const names = (list) => (list.length <= 1 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
// The organizations sharing the highest value of something (ties named together)
function leaders(orgs, value) {
  const best = Math.max(0, ...orgs.map(value));
  return best > 0 ? { best, who: orgs.filter((o) => value(o) === best).map((o) => o.name) } : null;
}

// Plain sentences for the "what this shows" part of the page and the report
function conclude(orgs, months, report) {
  const out = [];
  const period = periodLabel(report.from, report.to);
  const held = orgs.filter((o) => o.conducted > 0);
  if (!held.length) {
    out.push(`No organization held an event in ${period}.`);
    return out;
  }
  const most = leaders(orgs, (o) => o.conducted);
  out.push(most.who.length === 1
    ? `${most.who[0]} conducted the most events in ${period}, with ${plural(most.best, "event")}.`
    : `${names(most.who)} conducted the most events in ${period}, with ${plural(most.best, "event")} each.`);
  const crowd = leaders(orgs, (o) => o.attended);
  if (crowd) {
    out.push(crowd.who.length === 1
      ? `${crowd.who[0]} drew the most attendees: ${plural(crowd.best, "student")} checked in.`
      : `${names(crowd.who)} drew the most attendees, ${plural(crowd.best, "student")} each.`);
  }
  // Attendance rate only means something with a few people expected
  const rated = held.filter((o) => o.going >= 5 && o.rate !== null);
  if (rated.length >= 2) {
    const top = leaders(rated, (o) => Math.round(o.rate * 1000));
    out.push(`${names(top.who)} had the best turnout: ${pctText(top.best / 1000)} of the students going to ${top.who.length === 1 ? "its" : "their"} events checked in.`);
  }
  if (months.length >= 2) {
    const perMonth = months.map((m) => ({ m, n: orgs.reduce((k, o) => k + (o.months[m] || 0), 0) }));
    const top = Math.max(...perMonth.map((x) => x.n));
    const busiest = perMonth.filter((x) => x.n === top).map((x) => x.m);
    if (top > 0 && busiest.length < perMonth.length) {
      if (busiest.length === 1) {
        // Name who carried that month only when one organization clearly did
        const lead = leaders(orgs, (o) => o.months[busiest[0]] || 0);
        const by = lead.who.length === 1 && lead.best > 1 ? `, ${lead.best} of them by ${lead.who[0]}` : "";
        out.push(`${monthLabel(busiest[0])} was the busiest month, with ${plural(top, "event")}${by}.`);
      } else {
        out.push(`${names(busiest.map((m) => monthLabel(m, "long").replace(/ \d{4}$/, "")))} were the busiest months, with ${plural(top, "event")} each.`);
      }
    }
  }
  const quiet = orgs.filter((o) => !o.disabled && o.conducted === 0).map((o) => o.name);
  if (quiet.length) out.push(`${names(quiet)} ${quiet.length === 1 ? "has" : "have"} not held an event in this period.`);
  const off = orgs.filter((o) => o.disabled).map((o) => o.name);
  if (off.length) out.push(`${names(off)} ${off.length === 1 ? "is" : "are"} deactivated.`);
  return out;
}
