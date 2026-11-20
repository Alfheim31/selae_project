import { useEffect, useState } from "react";
import { Building2, CalendarCheck2, CalendarDays, ChevronRight, MapPin, ScanLine } from "lucide-react";
import { fmtTime, go, METHOD_LABEL } from "../../components/shared.jsx";
import { ErrorBox, Sk } from "../../components/ui.jsx";
import { api } from "../../lib/api.js";
import { ORGS_CSS } from "./OrgsPanel.jsx";

/* Student profile, second tab: every event they were checked in at, newest first, with the totals */

const ATT_CSS = `
.attlist{display:flex;flex-direction:column;gap:.7rem}
.attrow{display:flex;align-items:center;gap:1rem;width:100%;text-align:left;padding:.85rem 1rem;background:var(--surface);border:1px solid var(--line);
  border-radius:14px;box-shadow:var(--shadow);transition:transform .15s ease,box-shadow .15s ease;cursor:pointer;color:inherit;font:inherit}
.attrow:hover{transform:translateY(-1px);box-shadow:0 12px 26px -16px rgba(20,27,58,.35)}
.attdate{width:58px;flex-shrink:0;border-radius:12px;background:var(--accent-soft);color:var(--accent);text-align:center;padding:.45rem 0;line-height:1}
.attdate .m{font-family:var(--f-mono);font-size:.68rem;letter-spacing:.12em;text-transform:uppercase}
.attdate .d{font-family:var(--f-display);font-weight:700;font-size:1.6rem;margin-top:.15rem}
.attdate .y{font-family:var(--f-mono);font-size:.62rem;opacity:.75;margin-top:.15rem}
.attmeta{display:flex;flex-wrap:wrap;gap:.2rem .85rem}
.attmeta span{display:inline-flex;align-items:center;gap:.3rem;min-width:0}
`;

const dayParts = (iso) => {
  const d = new Date(iso);
  return { m: d.toLocaleDateString("en-US", { month: "short" }), d: d.getDate(), y: d.getFullYear() };
};

export function AttendedPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { api.myAttended().then(setData).catch((e) => setError(e.message)); }, []);

  const list = (data && data.events) || [];
  const year = new Date().getFullYear();
  const thisYear = list.filter((e) => new Date(e.startsAt).getFullYear() === year).length;
  const hosts = new Set(list.map((e) => e.hostName).filter(Boolean)).size;
  const stats = [
    ["Events attended", data && data.total, CalendarCheck2, "#E2F4EA", "#14794B"],
    [`In ${year}`, thisYear, CalendarDays, "var(--accent-soft)", "var(--accent)"],
    ["Organizations", hosts, Building2, "#FDF0DE", "#9A5A0B"],
  ];

  return (
    <div className="flex flex-col gap-5">
      <style>{ORGS_CSS + ATT_CSS}</style>
      <div className="min-w-0">
        <div className="tag">Student</div>
        <h2 className="panel-title" style={{ fontSize: "1.9rem", marginTop: 2 }}>Events attended</h2>
        <p className="muted text-sm" style={{ maxWidth: "62ch", marginTop: 4 }}>
          Every event you were checked in at, newest first. Registering alone doesn't count; checking in at the gate does.
        </p>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
        {stats.map(([label, n, Icon, bg, fg], i) => (
          <div key={label} className={`panel orgstat${i === 2 ? " col-span-2 lg:col-span-1" : ""}`}>
            <span className="ic" style={{ background: bg, color: fg }}><Icon size={20} /></span>
            <div>
              <div className="n">{data ? n : <Sk w={36} h={28} />}</div>
              <div className="tag" style={{ marginTop: 3 }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {error && <ErrorBox message={error} />}

      {!data && !error && (
        <div className="attlist" role="status" aria-busy="true" aria-label="Loading">
          {[0, 1, 2].map((i) => <Sk key={i} h={78} r={14} />)}
        </div>
      )}

      {data && !list.length && (
        <div className="panel flex flex-col items-center gap-2" style={{ padding: "2.5rem 1rem", textAlign: "center" }}>
          <span className="ic" style={{ width: 52, height: 52, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center",
            background: "var(--accent-soft)", color: "var(--accent)" }}><CalendarCheck2 size={24} /></span>
          <div style={{ fontWeight: 700 }}>No events attended yet</div>
          <p className="muted text-sm">Once you're checked in at an event's gate, it shows up here.</p>
          <button className="btn btn-primary btn-sm" style={{ marginTop: 6 }} onClick={() => go("")}>Find an event</button>
        </div>
      )}

      {list.length > 0 && (
        <ol className="attlist" style={{ listStyle: "none", margin: 0, padding: 0 }} aria-label="Events attended">
          {list.map((e) => {
            const day = dayParts(e.startsAt);
            return (
              <li key={e.code}>
                <button className="attrow" onClick={() => go(`e/${e.eventId}`)}>
                  <span className="attdate" aria-hidden="true">
                    <div className="m">{day.m}</div><div className="d">{day.d}</div><div className="y">{day.y}</div>
                  </span>
                  <span className="min-w-0 flex-1 flex flex-col gap-1">
                    <span style={{ fontWeight: 700, fontSize: "1.05rem", overflowWrap: "anywhere" }}>{e.title}</span>
                    <span className="attmeta muted text-sm">
                      {e.hostName && <span><Building2 size={13} /> {e.hostName}</span>}
                      {e.venue && <span><MapPin size={13} /> {e.venue}</span>}
                    </span>
                    <span className="attmeta tag">
                      <span><ScanLine size={12} /> Checked in {fmtTime(e.checkedInAt)} · {METHOD_LABEL[e.method] || "Check-in"}</span>
                      {e.walkIn && <span>Walk-in</span>}
                    </span>
                  </span>
                  <ChevronRight size={18} className="faint" style={{ flexShrink: 0 }} />
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
