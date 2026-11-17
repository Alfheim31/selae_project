import { useMemo } from "react";
import { Download } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TurnoutModelPanel } from "../../components/forecast.jsx";
import { fmtDateShort, fmtTime, formatName, METHOD_LABEL, pct } from "../../components/shared.jsx";
import { MatcherPanel } from "./MatcherPanel.jsx";
import { arrivalBuckets, chartTip, METHOD_COLOR } from "./bits.jsx";

export function Analytics({ data, now, onToast, refresh }) {
  const { students, registered, checkins, log, opens, ends, event } = data;
  const attended = checkins.size;
  const reg = registered.size;

  const stats = useMemo(() => {
    const times = [...checkins.values()].map((c) => c.time.getTime()).sort((a, b) => a - b);
    let best = { count: 0, start: opens.getTime() };
    for (let i = 0, j = 0; i < times.length; i++) {
      while (times[i] - times[j] >= 10 * 60000) j++;
      if (i - j + 1 > best.count) best = { count: i - j + 1, start: times[j] };
    }
    const methods = { qr: 0, barcode: 0, face: 0, ocr: 0, confirmed: 0, manual: 0 };
    for (const c of checkins.values()) methods[c.method] = (methods[c.method] || 0) + 1;
    let running = 0;
    const { buckets } = arrivalBuckets(checkins, now, opens, ends);
    const cumulative = buckets.map((b) => ({ label: b.label, total: (running += b.count) }));
    const sections = [...new Set(students.map((s) => s.section || "No section"))].sort();
    const bySection = sections.map((section) => {
      const inSec = students.filter((s) => (s.section || "No section") === section);
      return { section, registered: inSec.length, attended: inSec.filter((s) => checkins.has(s.id)).length };
    });
    const failed = {};
    for (const k of ["notreg", "dup", "unresolved", "full", "waitlist", "wrongevent"]) failed[k] = log.filter((l) => l.outcome === k).length;
    return { best, methods, cumulative, bySection, failed };
  }, [checkins, log, now, students, opens, ends]);

  const { best, methods, cumulative, bySection, failed } = stats;
  const rescued = methods.ocr + methods.confirmed;

  const exportCsv = () => {
    const rows = [["Name", "Student number", "Section", "Checked in at", "Identified by"]];
    [...checkins.keys()]
      .map((sid) => data.student(sid))
      .sort((a, b) => formatName(a).localeCompare(formatName(b)))
      .forEach((s) => {
        const c = checkins.get(s.id);
        rows.push([formatName(s), s.id, s.section, `${fmtDateShort(c.time)} ${fmtTime(c.time)}`, METHOD_LABEL[c.method]]);
      });
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    try {
      // CSV download
      const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `selae-${event.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "event"}-attendance.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      onToast(`Exported ${attended} attendees`);
    } catch (e) {
      onToast("Export isn't available in this preview");
    }
  };

  const methodKeys = Object.keys(methods).filter((k) => methods[k] > 0 || ["qr", "ocr", "manual"].includes(k));
  const failedText = [
    `${failed.notreg} unregistered`, `${failed.dup} repeat scans blocked`, `${failed.unresolved} unreadable`,
    failed.waitlist ? `${failed.waitlist} on the waitlist` : "", failed.wrongevent ? `${failed.wrongevent} tickets for other events` : "",
    failed.full ? `${failed.full} turned away at capacity` : "",
  ].filter(Boolean).join(", ");

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div style={{ maxWidth: 720 }}>
          <h2 className="font-bold" style={{ fontSize: "clamp(1.6rem,3.6vw,2.4rem)", lineHeight: 1.15 }}>
            {attended} of {reg} registered students checked in.
          </h2>
          <p className="text-lg muted mt-2">
            That's a {pct(attended / reg)} show-up rate.
            {best.count > 1 ? ` The busiest 10 minutes started at ${fmtTime(new Date(best.start))}, with ${best.count} arrivals.` : ""}
            {" "}Figures update live while check-in is open.
          </p>
        </div>
        <button className="btn btn-primary" onClick={exportCsv} disabled={!attended}><Download size={18} /> Export attendance (CSV)</button>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="panel p-4 md:p-5 min-w-0">
          <h3 className="font-bold text-lg">Check-ins over time</h3>
          <p className="text-sm faint mb-3">Running total against the {reg} registered students</p>
          <div style={{ height: 240 }}>
            {cumulative.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cumulative} margin={{ top: 10, right: 26, left: -14, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cum" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3550D4" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#3550D4" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#E3E8F1" strokeDasharray="3 4" />
                  <XAxis dataKey="label" tick={{ fill: "#4F5878", fontSize: 12 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={18} />
                  <YAxis domain={[0, Math.max(1, reg)]} tick={{ fill: "#7A83A3", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={chartTip} formatter={(v) => [v, "Checked in"]} />
                  <Area type="monotone" dataKey="total" stroke="#3550D4" strokeWidth={2.5} fill="url(#cum)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <div className="h-full flex items-center justify-center muted">No check-ins yet.</div>}
          </div>
        </section>

        <section className="panel p-4 md:p-5 min-w-0">
          <h3 className="font-bold text-lg">How attendees were identified</h3>
          <p className="mt-1 mb-4 muted">
            The OCR fallback identified <strong style={{ color: "var(--text)" }}>{rescued}</strong> attendees whose codes couldn't be read,
            {" "}{pct(rescued / Math.max(1, attended))} of all check-ins.
          </p>
          <div className="flex w-full overflow-hidden" style={{ height: 22, borderRadius: 999, background: "var(--bg)" }}
            role="img" aria-label={methodKeys.map((k) => `${METHOD_LABEL[k]} ${methods[k]}`).join(", ")}>
            {methodKeys.map((k) => (
              <div key={k} style={{ width: `${(methods[k] / Math.max(1, attended)) * 100}%`, background: METHOD_COLOR[k] }} />
            ))}
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 mt-5">
            {methodKeys.map((k) => (
              <div key={k} className="flex items-center gap-3">
                <span style={{ width: 12, height: 12, borderRadius: 3, background: METHOD_COLOR[k], flexShrink: 0 }} />
                <dt className="muted flex-1">{METHOD_LABEL[k]}</dt>
                <dd className="font-bold">{methods[k]}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-5 pt-4 text-sm" style={{ borderTop: "1px solid var(--line)" }}>
            <div className="font-bold mb-1">Scans that didn't check anyone in</div>
            <p className="muted">{failedText}.</p>
          </div>
        </section>

        {data.matcher && <MatcherPanel m={data.matcher} onToast={onToast} refresh={refresh} />}

        <TurnoutModelPanel forecast={data.forecast} />

        <section className="panel p-4 md:p-5 min-w-0 lg:col-span-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <h3 className="font-bold text-lg">Attendance by section</h3>
            <div className="flex gap-4 text-sm muted">
              <span className="flex items-center gap-2"><span style={{ width: 12, height: 12, borderRadius: 3, background: "#C7D0F2" }} /> Registered</span>
              <span className="flex items-center gap-2"><span style={{ width: 12, height: 12, borderRadius: 3, background: "#3550D4" }} /> Checked in</span>
            </div>
          </div>
          <div style={{ height: Math.max(120, bySection.length * 38) }}>
            {bySection.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bySection} layout="vertical" margin={{ top: 0, right: 16, left: 4, bottom: 0 }} barGap={-14} barCategoryGap="28%">
                  <CartesianGrid horizontal={false} stroke="#E3E8F1" strokeDasharray="3 4" />
                  <XAxis type="number" tick={{ fill: "#7A83A3", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="section" width={92} tick={{ fill: "#4F5878", fontSize: 13 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "rgba(53,80,212,.06)" }} contentStyle={chartTip}
                    formatter={(v, name) => [v, name === "attended" ? "Checked in" : "Registered"]} />
                  <Bar dataKey="registered" fill="#C7D0F2" barSize={14} radius={[0, 5, 5, 0]} />
                  <Bar dataKey="attended" fill="#3550D4" barSize={14} radius={[0, 5, 5, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-full flex items-center justify-center muted">No registrations yet.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
