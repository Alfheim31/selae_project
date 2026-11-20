import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, CalendarCheck2, CalendarClock, Check, ChevronDown, ChevronUp, Download, ExternalLink, Lightbulb, RotateCw, UserCheck, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ErrorBox, Sk } from "../../components/ui.jsx";
import { api } from "../../lib/api.js";
import { dayRange, monthLabel, monthRange, pctText, periodLabel, summarize, typeLabel } from "../../lib/report.js";

/* Superadmin, on Discover: how many events each organization held and how many came, for a month or
   a range of days, with a PDF of the same. */

const ACCENT = "#3550D4", SOFT = "#C7D0F2";
const tip = { background: "#FFFFFF", border: "1px solid #DCE2EE", borderRadius: 10, color: "#141B3A", boxShadow: "0 12px 28px -12px rgba(20,27,58,.3)" };
const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const TOP = 10;
const short = (name, n = 22) => (name.length > n ? `${name.slice(0, n - 1)}…` : name);

const CSS = `
.rep-find{border:1px solid var(--line);border-radius:16px;background:var(--surface);overflow:hidden}
.rep-find-h{display:flex;align-items:center;gap:.7rem;padding:.8rem 1rem;background:linear-gradient(90deg,var(--accent-soft),transparent);border-bottom:1px solid var(--line)}
.rep-find-h .ic{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:var(--accent);color:#fff}
.rep-find ol{list-style:none;margin:0;padding:.35rem 1rem}
.rep-find li{display:flex;align-items:flex-start;gap:.7rem;padding:.55rem 0;font-size:.92rem;line-height:1.45}
.rep-find li + li{border-top:1px dashed var(--line)}
.rep-find .no{width:22px;height:22px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:var(--accent-soft);color:var(--accent);font-weight:700;font-size:.78rem;margin-top:1px}
.rep-more{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:.25rem .75rem;text-align:center}
.rep-all{display:flex;margin:.5rem auto 0}
.dl-card{max-width:360px;width:100%;display:flex;flex-direction:column;align-items:center;text-align:center;gap:.6rem;padding:2rem 1.6rem 1.6rem;border-radius:24px}
.dl-badge{width:68px;height:68px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;margin-bottom:.35rem}
.dl-title{font-weight:800;font-size:1.45rem;line-height:1.2}
.dl-text{max-width:290px;overflow-wrap:anywhere;line-height:1.5}
.dl-acts{display:flex;flex-direction:column;gap:.45rem;width:100%;max-width:220px;margin-top:.7rem}
.dl-acts .btn{width:100%;justify-content:center}
.rep-tools{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem}
.rep-seg{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:3px;background:var(--surface)}
.rep-seg button{border:0;background:none;padding:.35rem .8rem;border-radius:999px;font-weight:600;font-size:.86rem;color:var(--muted)}
.rep-seg button[aria-pressed="true"]{background:var(--accent);color:var(--accent-ink)}
.rep-tiles{display:grid;gap:.75rem;grid-template-columns:repeat(2,minmax(0,1fr))}
@media (min-width:1024px){.rep-tiles{grid-template-columns:repeat(4,minmax(0,1fr))}}
.rep-tile{display:flex;align-items:center;gap:.75rem;padding:.9rem 1rem;border:1px solid var(--line);border-radius:14px;background:var(--surface)}
.rep-tile .ic{width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:var(--accent-soft);color:var(--accent)}
.rep-tile .n{font-family:var(--f-display);font-weight:700;font-size:1.7rem;line-height:1}
.rep-tile > div{min-width:0}
.rep-table{width:100%;border-collapse:collapse;font-size:.9rem}
.rep-table th{text-align:left;font-weight:600;color:var(--muted);font-size:.78rem;padding:.5rem .6rem;border-bottom:1px solid var(--line);white-space:nowrap}
.rep-table td{padding:.55rem .6rem;border-bottom:1px solid var(--line)}
.rep-table td.num,.rep-table th.num{text-align:right;font-variant-numeric:tabular-nums}
.rep-table tr.off td{color:var(--muted)}
`;

function NameTick({ x, y, payload, max }) {
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fill="#4F5878" fontSize={12.5}>
      <title>{payload.value}</title>
      {short(payload.value, max)}
    </text>
  );
}

function useNarrow() {
  const query = "(max-width: 640px)";
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setNarrow(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return narrow;
}

// The pop-up after "Download report": saved (with Open PDF), or what went wrong (with Try again)
function DownloadDone({ done, onClose, onRetry }) {
  const main = useRef(null);
  useEffect(() => {
    main.current?.focus();
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const color = done.ok ? "var(--ok)" : "var(--bad)";
  const filled = { background: color, borderColor: color, color: "#fff" };
  return (
    <div className="modal-bg" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal dl-card" role="alertdialog" aria-modal="true" aria-labelledby="dl-h" aria-describedby="dl-p">
        <span className="dl-badge" style={{ background: color, boxShadow: `0 10px 24px -8px ${done.ok ? "rgba(30,154,97,.55)" : "rgba(212,67,59,.55)"}` }}>
          {done.ok ? <Check size={34} strokeWidth={3.2} /> : <X size={34} strokeWidth={3.2} />}
        </span>
        <div id="dl-h" className="dl-title" style={{ color }}>{done.ok ? "Success" : "Error"}</div>
        <div id="dl-p" className="muted text-sm dl-text">
          {done.ok
            ? <>The report was downloaded as <b style={{ color: "var(--text)" }}>{done.name}</b>. You'll find it in your Downloads folder.</>
            : <>The report couldn't be downloaded. {done.message} Check your connection and try again.</>}
        </div>
        <div className="dl-acts">
          {done.ok
            ? <button ref={main} className="btn" style={filled} onClick={() => window.open(done.url, "_blank")}>
                <ExternalLink size={16} /> Open PDF
              </button>
            : <button ref={main} className="btn" style={filled} onClick={onRetry}><RotateCw size={16} /> Try again</button>}
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export function OrgReport() {
  const today = new Date();
  const thisMonth = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;
  const [mode, setMode] = useState("month");
  const [month, setMonth] = useState(thisMonth);
  const [fromDay, setFromDay] = useState(dayKey(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [toDay, setToDay] = useState(dayKey(today));
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // The last 18 months to pick from, newest first
  const months = useMemo(() => Array.from({ length: 18 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  }), [thisMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  const badRange = mode === "range" && (!fromDay || !toDay || fromDay > toDay);
  const range = mode === "month" ? monthRange(month) : badRange ? null : dayRange(fromDay, toDay);
  const rangeKey = range ? `${range.from.getTime()}-${range.to.getTime()}` : "";

  useEffect(() => {
    if (!range) return undefined;
    let live = true;
    setError("");
    api.adminReport(range.from, range.to)
      .then((r) => { if (live) setReport(r); })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [rangeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = useMemo(() => (report ? summarize(report) : null), [report]);
  const loading = !report && !error;
  const stale = report && range && (Date.parse(report.from) !== range.from.getTime() || Date.parse(report.to) !== range.to.getTime());

  // After a download: { ok: true, url, name } or { ok: false, message }, shown in a pop-up
  const [done, setDone] = useState(null);
  const closeDone = () => setDone(null);
  // The PDF's url is freed once the pop-up closes (or the page goes away)
  useEffect(() => () => { if (done && done.url) URL.revokeObjectURL(done.url); }, [done]);

  const download = async () => {
    setBusy(true);
    try {
      const { downloadReportPdf } = await import("../../lib/reportPdf.js");
      const file = await downloadReportPdf(report, summary);
      setDone({ ok: true, ...file });
    } catch (e) {
      setDone({ ok: false, message: (e && e.message) || "Something went wrong." });
    }
    setBusy(false);
  };

  // Organization names on one line, shorter on a phone; the tooltip and the table show them in full
  const narrow = useNarrow();
  const axisW = narrow ? 112 : 170, nameMax = narrow ? 15 : 24;
  const rows = summary ? summary.orgs.map((o) => ({ ...o, label: o.disabled ? `${o.name} (deactivated)` : o.name })) : [];
  // With many organizations: the charts leave out the ones with no events and start with the most active
  // ten, the table starts with ten rows; "Show all" opens the rest
  const [allCharts, setAllCharts] = useState(false);
  const [allRows, setAllRows] = useState(false);
  const active = rows.filter((o) => o.conducted + o.upcoming > 0);
  const chartRows = allCharts ? active : active.slice(0, TOP);
  const tableRows = allRows ? rows : rows.slice(0, TOP);
  const idle = rows.length - active.length;
  const chartH = Math.max(140, chartRows.length * (chartRows.length > 8 ? 36 : 46) + 40);
  const t = summary && summary.totals;

  return (
    <section className="panel flex flex-col gap-5" style={{ padding: "1.25rem" }} aria-labelledby="rep-h">
      <style>{CSS}</style>
      {done && <DownloadDone done={done} onClose={closeDone} onRetry={() => { closeDone(); download(); }} />}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="tag">Admin · organizations</div>
          <h2 id="rep-h" className="panel-title" style={{ fontSize: "1.6rem", marginTop: 2 }}>Organizations overview</h2>
          <p className="muted text-sm" style={{ marginTop: 2 }}>
            Events held and students who came{report ? `, ${periodLabel(report.from, report.to)}` : ""}. Simulated history isn't counted.
          </p>
        </div>
        <button className="btn btn-primary" onClick={download} disabled={!summary || busy || stale}>
          <Download size={17} /> {busy ? "Making the PDF…" : "Download report"}
        </button>
      </div>

      <div className="rep-tools" role="group" aria-label="Period">
        <div className="rep-seg">
          <button aria-pressed={mode === "month"} onClick={() => setMode("month")}>Month</button>
          <button aria-pressed={mode === "range"} onClick={() => setMode("range")}>Date range</button>
        </div>
        {mode === "month" ? (
          <select className="inp" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month" style={{ width: "auto", minWidth: 180 }}>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        ) : (
          <>
            <input className="inp" type="date" value={fromDay} max={toDay || undefined} onChange={(e) => setFromDay(e.target.value)} aria-label="From" style={{ width: "auto" }} />
            <span className="muted text-sm">to</span>
            <input className="inp" type="date" value={toDay} min={fromDay || undefined} onChange={(e) => setToDay(e.target.value)} aria-label="To" style={{ width: "auto" }} />
          </>
        )}
      </div>
      {badRange && <p className="text-sm" style={{ color: "var(--bad)" }}>The end date has to be on or after the start date.</p>}
      {error && <ErrorBox message={error} />}

      <div className="rep-tiles">
        {[
          ["Events conducted", t && t.conducted, CalendarCheck2],
          ["Students checked in", t && t.attended, UserCheck],
          ["Turnout", t && pctText(t.rate), Building2],
          ["Upcoming in period", t && t.upcoming, CalendarClock],
        ].map(([label, value, Icon]) => (
          <div key={label} className="rep-tile">
            <span className="ic"><Icon size={19} /></span>
            <div>
              <div className="n">{loading ? <Sk w={40} h={26} /> : value}</div>
              <div className="tag" style={{ marginTop: 3 }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {summary && summary.conclusions.length > 0 && (
        <section className="rep-find" aria-labelledby="rep-find-h">
          <div className="rep-find-h">
            <span className="ic"><Lightbulb size={18} /></span>
            <div className="min-w-0">
              <div id="rep-find-h" style={{ fontWeight: 700, lineHeight: 1.2 }}>Key findings</div>
              <div className="muted text-xs">{periodLabel(report.from, report.to)}</div>
            </div>
          </div>
          <ol>
            {summary.conclusions.map((c, i) => (
              <li key={c}>{summary.conclusions.length > 1 && <span className="no">{i + 1}</span>}<span>{c}</span></li>
            ))}
          </ol>
        </section>
      )}

      {summary && active.length > 0 && (
        <div className="flex flex-col gap-2">
        <div className="grid gap-5 lg:grid-cols-2">
          <figure className="flex flex-col gap-2" style={{ margin: 0 }}>
            <figcaption style={{ fontWeight: 700 }}>Events per organization</figcaption>
            <div style={{ height: chartH }}>
              <ResponsiveContainer>
                <BarChart data={chartRows} layout="vertical" margin={{ top: 0, right: 16, left: 4, bottom: 0 }} barCategoryGap="30%">
                  <CartesianGrid horizontal={false} stroke="#E3E8F1" strokeDasharray="3 4" />
                  <XAxis type="number" tick={{ fill: "#7A83A3", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" width={axisW} tick={<NameTick max={nameMax} />} axisLine={false} tickLine={false} interval={0} />
                  <Tooltip cursor={{ fill: "rgba(53,80,212,.06)" }} contentStyle={tip} formatter={(v, name) => [v, name === "conducted" ? "Conducted" : "Upcoming"]} />
                  <Legend iconType="circle" iconSize={9} formatter={(v) => <span style={{ color: "#4F5878", fontSize: 13 }}>{v === "conducted" ? "Conducted" : "Upcoming"}</span>} />
                  <Bar isAnimationActive={false} dataKey="conducted" stackId="e" fill={ACCENT} barSize={16} stroke="#FFFFFF" strokeWidth={1} />
                  <Bar isAnimationActive={false} dataKey="upcoming" stackId="e" fill={SOFT} barSize={16} radius={[0, 4, 4, 0]} stroke="#FFFFFF" strokeWidth={1} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </figure>
          <figure className="flex flex-col gap-2" style={{ margin: 0 }}>
            <figcaption style={{ fontWeight: 700 }}>Going vs. checked in <span className="muted text-sm" style={{ fontWeight: 400 }}>· events that have ended</span></figcaption>
            <div style={{ height: chartH }}>
              <ResponsiveContainer>
                <BarChart data={chartRows} layout="vertical" margin={{ top: 0, right: 16, left: 4, bottom: 0 }} barGap={-16} barCategoryGap="30%">
                  <CartesianGrid horizontal={false} stroke="#E3E8F1" strokeDasharray="3 4" />
                  <XAxis type="number" tick={{ fill: "#7A83A3", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" width={axisW} tick={<NameTick max={nameMax} />} axisLine={false} tickLine={false} interval={0} />
                  <Tooltip cursor={{ fill: "rgba(53,80,212,.06)" }} contentStyle={tip} formatter={(v, name) => [v, name === "attended" ? "Checked in" : "Going"]} />
                  <Legend iconType="circle" iconSize={9} formatter={(v) => <span style={{ color: "#4F5878", fontSize: 13 }}>{v === "attended" ? "Checked in" : "Going"}</span>} />
                  <Bar isAnimationActive={false} dataKey="going" fill={SOFT} barSize={16} radius={[0, 4, 4, 0]} />
                  <Bar isAnimationActive={false} dataKey="attended" fill={ACCENT} barSize={16} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </figure>
        </div>
          {(active.length > TOP || idle > 0) && (
            <div className="rep-more">
              <span className="muted text-sm">
                {active.length > TOP && (allCharts
                  ? `All ${active.length} organizations with events.`
                  : `The ${TOP} most active of ${active.length} organizations with events.`)}
                {idle > 0 && ` ${idle} with no events ${idle === 1 ? "isn't" : "aren't"} charted.`}
              </span>
              {active.length > TOP && (
                <button className="btn btn-ghost btn-sm" onClick={() => setAllCharts((v) => !v)} aria-expanded={allCharts}>
                  {allCharts ? <><ChevronUp size={15} /> Show top {TOP}</> : <><ChevronDown size={15} /> Show all {active.length}</>}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {summary && (
        <div style={{ overflowX: "auto" }}>
          <table className="rep-table">
            <thead>
              <tr>
                <th>Organization</th><th>Kind</th><th className="num">Conducted</th><th className="num">Upcoming</th>
                <th className="num">Going</th><th className="num">Checked in</th><th className="num">Turnout</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((o) => (
                <tr key={o.id} className={o.disabled ? "off" : ""}>
                  <td style={{ fontWeight: 600, minWidth: 180 }}>
                    {o.name}{o.disabled && <span className="pill" style={{ marginLeft: 6, background: "var(--raised)", color: "var(--muted)" }}>Deactivated</span>}
                  </td>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>{typeLabel(o.type)}</td>
                  <td className="num">{o.conducted}</td><td className="num">{o.upcoming}</td>
                  <td className="num">{o.going}</td><td className="num">{o.attended}</td><td className="num">{pctText(o.rate)}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7} className="muted">No organizations yet.</td></tr>}
            </tbody>
          </table>
          {rows.length > TOP && (
            <button className="btn btn-ghost btn-sm rep-all" onClick={() => setAllRows((v) => !v)} aria-expanded={allRows}>
              {allRows ? <><ChevronUp size={15} /> Show fewer</> : <><ChevronDown size={15} /> Show all {rows.length} organizations</>}
            </button>
          )}
          {summary.otherHosts > 0 && (
            <p className="muted text-xs" style={{ marginTop: 8 }}>
              Not counted: {summary.otherHosts} event{summary.otherHosts === 1 ? "" : "s"} in this period by hosts without an organization account.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
