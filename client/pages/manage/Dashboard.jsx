import { useMemo, useState } from "react";
import { ScanLine, Search } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Likely, TurnoutPanel, useForecast } from "../../components/forecast.jsx";
import { fmtDateShort, fmtTime, formatName, norm, OUTCOME_LABEL, pct } from "../../components/shared.jsx";
import { api } from "../../lib/api.js";
import { ShareCard } from "./SettingsPage.jsx";
import { arrivalBuckets, chartTip, everyLabel, MethodChip, OutcomeIcon } from "./bits.jsx";

export function Dashboard({ data, now, refresh, onToast, onOpenScanner }) {
  const { students, registered, checkins, log, student, capacity, opens, ends, waitlist, event } = data;
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const count = checkins.size;
  const fill = count / capacity;
  const fillColor = fill >= 1 ? "var(--bad)" : fill >= 0.9 ? "var(--warn)" : "var(--ok)";
  const last10 = [...checkins.values()].filter((c) => now - c.time <= 10 * 60000).length;
  const attention = log.filter((l) => l.outcome !== "approved");
  const { size, buckets } = useMemo(() => arrivalBuckets(checkins, now, opens, ends), [checkins, now, opens, ends]);
  const notYet = Math.max(0, registered.size - [...registered].filter((sid) => checkins.has(sid)).length);
  const [risk, setRisk] = useState(data.forecast ? data.forecast.defaultRisk : 0.05);
  const f = useForecast(data, now, risk);
  const likely = (reg) => (f && reg && f.live[reg.id] != null
    ? <Likely compact p={f.live[reg.id]} why={data.forecast.preds[reg.id] && data.forecast.preds[reg.id].why} /> : null);

  const rows = useMemo(() => {
    const n = norm(q);
    const base = filter === "waitlist" ? waitlist.map((r) => ({ ...student(r.studentId), reg: r })) : students.map((s) => ({ ...s }));
    return base
      .filter((s) => (filter === "in" ? checkins.has(s.id) : filter === "out" ? !checkins.has(s.id) : true))
      .filter((s) => !n || norm(s.id).includes(n) || norm(s.last + s.first).includes(n) || norm(s.first + s.last).includes(n))
      .sort((a, b) => (filter === "waitlist" ? 0 : formatName(a).localeCompare(formatName(b))));
  }, [students, waitlist, student, checkins, filter, q]);

  const promote = async (reg) => {
    const full = data.going.length >= data.capacity;
    if (full && !window.confirm(`This event is full (${data.going.length} of ${data.capacity} going). Move ${formatName(student(reg.studentId))} to going anyway?`)) return;
    try { await api.promote(event.id, reg.id, full); await refresh(); onToast(`${formatName(student(reg.studentId))} moved to going`); }
    catch (e) { onToast(e.message); }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Capacity band */}
      <section aria-labelledby="cap-h" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="cap-h" className="sr-only">Venue capacity</h2>
            <div className="flex items-baseline gap-3">
              <span className="font-bold" style={{ fontSize: "clamp(2.6rem,6vw,3.6rem)", lineHeight: 1 }}>{count}</span>
              <span className="text-lg muted">checked in of {capacity} venue capacity</span>
            </div>
          </div>
          <button className="btn btn-primary" onClick={onOpenScanner}><ScanLine size={18} /> Open scanner</button>
        </div>
        <div className="capbar" role="progressbar" aria-valuenow={count} aria-valuemin={0} aria-valuemax={capacity} aria-label="Checked in versus capacity">
          <div className="capfill" style={{ width: `${Math.min(100, fill * 100)}%`, background: fillColor }} />
          <div className="captick" style={{ left: `${Math.min(100, (registered.size / capacity) * 100)}%` }} title="Registered attendees" />
        </div>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-1">
          {[
            ["Registered", registered.size, waitlist.length ? `${notYet} not yet arrived, ${waitlist.length} on waitlist` : `${notYet} not yet arrived`],
            ["Show-up so far", pct(count / registered.size), "of registered students"],
            ["Last 10 minutes", `+${last10}`, "new check-ins"],
            ["Needs attention", attention.length, "unregistered, repeat, or unreadable scans"],
          ].map(([k, v, s]) => (
            <div key={k} style={{ borderLeft: "2px solid var(--line)", paddingLeft: ".8rem" }}>
              <dt className="text-sm muted">{k}</dt>
              <dd className="text-2xl font-bold">{v}</dd>
              <dd className="text-xs faint">{s}</dd>
            </div>
          ))}
        </dl>
      </section>

      {registered.size === 0 && waitlist.length === 0 && <ShareCard eventId={event.id} />}

      {(registered.size > 0 || waitlist.length > 0) && <TurnoutPanel data={data} f={f} risk={risk} setRisk={setRisk} refresh={refresh} onToast={onToast} />}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 flex flex-col gap-6 min-w-0">
          <section className="panel p-4 md:p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-lg">Arrivals {everyLabel(size)}</h2>
              <span className="text-sm faint">{buckets.length ? `From ${buckets[0].label}` : `Opens ${fmtTime(opens)}`}</span>
            </div>
            <div style={{ height: 210 }}>
              {buckets.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={buckets} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#E3E8F1" strokeDasharray="3 4" />
                    <XAxis dataKey="label" tick={{ fill: "#4F5878", fontSize: 12 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={18} />
                    <YAxis tick={{ fill: "#7A83A3", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip cursor={{ fill: "rgba(53,80,212,.07)" }} contentStyle={chartTip} formatter={(v) => [v, "Arrivals"]} />
                    <Bar dataKey="count" fill="#3550D4" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center muted text-center">No arrivals yet. The chart fills in as people check in.</div>
              )}
            </div>
          </section>

          <section className="panel flex flex-col min-w-0">
            <div className="p-4 md:p-5 flex flex-wrap gap-3 items-center justify-between">
              <h2 className="font-bold text-lg">Guest list</h2>
              <div className="seg" role="group" aria-label="Filter guests">
                {[["all", `Going ${registered.size}`], ["in", `Checked in ${count}`], ["out", `Not yet ${notYet}`],
                  ...(waitlist.length ? [["waitlist", `Waitlist ${waitlist.length}`]] : [])].map(([k, l]) => (
                  <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
                ))}
              </div>
              <label className="field w-full">
                <Search size={17} />
                <input className="input" placeholder="Search by name or student number, e.g. pena or 2024-" value={q} onChange={(e) => setQ(e.target.value)} maxLength={80} />
              </label>
            </div>
            <div style={{ maxHeight: 420, overflow: "auto", borderTop: "1px solid var(--line)" }}>
              <table className="tbl">
                <thead>
                  <tr><th>Name</th><th>Student number</th><th>Section</th><th title="For people not in yet: their chance of coming, from the turnout forecast">Status</th><th>{filter === "waitlist" ? "" : "Identified by"}</th></tr>
                </thead>
                <tbody>
                  {rows.map((s) => {
                    const c = checkins.get(s.id);
                    return (
                      <tr key={s.id}>
                        <td className="font-bold">{formatName(s)}</td>
                        <td className="muted">{s.id}</td>
                        <td className="muted">{s.section}</td>
                        <td>{s.reg ? <div className="flex items-center gap-3"><span className="chip confirmed">Waitlist since {fmtDateShort(s.reg.createdAt)}</span>{likely(s.reg)}</div>
                          : c ? <span className="chip in">In at {fmtTime(c.time)}</span>
                          : <div className="flex items-center gap-3"><span className="faint">Not yet</span>{likely(data.regByStudent.get(s.id))}</div>}</td>
                        <td>{s.reg ? <button className="btn btn-sm" onClick={() => promote(s.reg)}>Move to going</button>
                          : c ? <MethodChip method={c.method} confidence={c.confidence} /> : null}</td>
                      </tr>
                    );
                  })}
                  {!rows.length && (
                    <tr><td colSpan={5} className="muted" style={{ padding: "1.5rem" }}>
                      {q ? `No guest matches “${q}”. Check the spelling or try the student number.` : "Nobody here yet."}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <section className="panel p-4 md:p-5 min-w-0" aria-labelledby="feed-h">
          <h2 id="feed-h" className="font-bold text-lg">Recent scans</h2>
          <p className="text-sm faint mb-2">Newest first, including scans that didn't check anyone in.</p>
          <ul className="feed" style={{ maxHeight: 760, overflow: "auto" }}>
            {log.slice(0, 18).map((l) => {
              const s = l.sid ? student(l.sid) : null;
              return (
                <li key={l.uid}>
                  <OutcomeIcon outcome={l.outcome} />
                  <div className="min-w-0">
                    <div className="font-bold truncate">{s ? formatName(s) : "Unidentified ID"}</div>
                    <div className="text-sm muted">{OUTCOME_LABEL[l.outcome]}{s && s.section ? `, ${s.section}` : ""}</div>
                    {l.outcome === "approved" && <div className="mt-1"><MethodChip method={l.method} confidence={l.confidence} /></div>}
                  </div>
                  <time className="text-sm faint">{fmtTime(l.time)}</time>
                </li>
              );
            })}
            {!log.length && <li style={{ display: "block" }} className="muted">No scans yet.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
