import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BarChart3, ExternalLink, Images, LayoutDashboard, QrCode as QrIcon, ScanLine, Settings, WifiOff, X } from "lucide-react";
import { TopBar } from "../../components/TopBar.jsx";
import { Barcode, flightNo, fmtDate, fmtTime, go, goBack, skyOf, Trails, useToast } from "../../components/shared.jsx";
import { api } from "../../lib/api.js";
import { Analytics } from "./Analytics.jsx";
import { Dashboard } from "./Dashboard.jsx";
import { PhotosPage } from "./PhotosPage.jsx";
import { Scanner } from "./Scanner.jsx";
import { SettingsPage } from "./SettingsPage.jsx";
import { TestTickets } from "./TestTickets.jsx";
import { ManageSkeleton } from "../../components/ui.jsx";

/* ---------------- server state for one event ---------------- */
function toData(s) {
  const byId = new Map(s.directory.map((x) => [x.id, x]));
  const student = (sid) => byId.get(sid) || { id: sid, first: "", last: "", middle: "", suffix: "", section: "" };
  const regs = s.registrations;
  const going = regs.filter((r) => r.status === "going");
  const waitlist = regs.filter((r) => r.status === "waitlist").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const checkins = new Map(regs.filter((r) => r.checkin).map((r) => [r.studentId, { ...r.checkin, time: new Date(r.checkin.time) }]));
  return {
    event: s.event,
    matcher: s.matcher || null,
    forecast: s.forecast || null,
    capacity: s.event.capacity,
    opens: new Date(s.event.startsAt),
    ends: new Date(s.event.endsAt),
    byId, student, regs, going, waitlist, checkins,
    registered: new Set(going.map((r) => r.studentId)),
    regByStudent: new Map(regs.filter((r) => r.status !== "cancelled").map((r) => [r.studentId, r])),
    students: going.map((r) => student(r.studentId)),
    log: s.logs.map((l) => ({ uid: l.uid, time: new Date(l.time), sid: l.studentId, outcome: l.outcome, method: l.method, confidence: l.confidence })),
  };
}

function useManage(id) {
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const rev = useRef(null);
  const refresh = useCallback(async () => {
    try {
      const d = await api.manage(id, rev.current);
      if (!d.unchanged) { rev.current = d.rev; setState(d); }
      setError("");
    } catch (e) { setError(e.message); }
  }, [id]);
  useEffect(() => {
    rev.current = null;
    setState(null);
    refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [refresh]);
  const data = useMemo(() => (state ? toData(state) : null), [state]);
  return { data, error, refresh };
}

/* ---------------- organizer shell ---------------- */
export function Manage({ id, tab, scan }) {
  const { data, error, refresh } = useManage(id);
  const [gateMode, setGateMode] = useState(false);
  const [now, setNow] = useState(new Date());
  const [toast, setToast] = useToast();
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);

  if (!data) {
    return (
      <>
        <TopBar route="" wide />
        {error ? (
          <div className="narrow py-10">
            <div className="panel p-6 flex flex-col gap-3">
              <h1 className="panel-title">{/hosts/.test(error) ? "You don't manage this event on this device" : "Couldn't load this event"}</h1>
              <p className="muted">{/hosts/.test(error)
                ? "Events are managed by the organization's account and its officers, or by opening a co-host link. Sign in with one of those accounts."
                : error}</p>
              <button className="btn self-start" onClick={() => go(`e/${id}`)}>View the event page</button>
            </div>
          </div>
        ) : <ManageSkeleton />}
      </>
    );
  }

  const { event } = data;
  // Tabs swap in place, so one Back leaves the event instead of walking through every tab
  const setTab = (t) => go(`m/${id}/${t}`, { replace: true });
  const openScanner = () => go(`m/${id}/scan`);
  const nav = [
    { id: "dashboard", label: "Live dashboard", icon: LayoutDashboard },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "photos", label: "Photos", icon: Images, badge: (event.photos || []).length || null },
    { id: "tickets", label: "Test tickets", icon: QrIcon },
    { id: "settings", label: "Invite & settings", icon: Settings },
  ];
  const live = now >= new Date(data.opens.getTime() - 3600000) && now <= data.ends;
  const status = now > data.ends ? "Ended" : live ? "Check-in open" : "Scheduled";

  return (
    <>
      <TopBar route="" wide />
      <div className="flex" style={{ minHeight: "calc(100vh - 65px)" }}>
        <aside className="rail hidden md:flex flex-col w-60 shrink-0 p-4 gap-5">
          <div className="flex items-center gap-3 px-1">
            <div className="vtext tag" style={{ fontSize: ".62rem" }}>Organizer</div>
            <div className="min-w-0">
              <div className="tag">{flightNo(event.id)}</div>
              <div className="display" style={{ fontSize: "1.35rem" }}>{event.title}</div>
            </div>
          </div>
          <button className="btn btn-lime" onClick={openScanner}><ScanLine size={18} /> Open scanner</button>
          <nav className="flex flex-col gap-1" aria-label="Manage event">
            {nav.map((n) => (
              <button key={n.id} className="navbtn" aria-current={tab === n.id && !scan ? "page" : undefined} onClick={() => setTab(n.id)}>
                <n.icon size={18} /> <span className="flex-1">{n.label}</span>
                {n.badge ? <span className="tag" style={{ color: "inherit", opacity: .8 }}>{n.badge}</span> : null}
              </button>
            ))}
          </nav>
          <div className="mt-auto flex flex-col gap-2">
            <Barcode value={event.id} height={28} color="rgba(255,255,255,.85)" />
            <button className="navbtn" style={{ padding: ".4rem .2rem" }} onClick={() => go(`e/${id}`)}><ExternalLink size={16} /> Event page</button>
            <button className="navbtn" style={{ padding: ".4rem .2rem" }} onClick={() => goBack("events")}><ArrowLeft size={16} /> Your events</button>
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          <div className="p-4 md:p-6 flex flex-col gap-5">
            <header className="boarding">
              <div className="band" style={{ background: event.coverImage ? undefined : skyOf(event.color) }}>
                {event.coverImage && <img src={event.coverImage} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
                {event.coverImage && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(20,27,58,.78), rgba(20,27,58,.25))" }} />}
                {!event.coverImage && <Trails seed={event.id} opacity={0.55} />}
                <div className="relative flex flex-wrap items-end justify-between gap-4">
                  <div className="min-w-0">
                    <div className="tag">{event.category || "General"} · {event.hostName || "SELAE event"}</div>
                    <h1 className="display" style={{ fontSize: "clamp(2rem,4.4vw,3.2rem)", textShadow: "0 2px 18px rgba(20,27,58,.3)" }}>{event.title}</h1>
                  </div>
                  <div className="flex items-center gap-2">
                    {error && <span className="pill cancelled"><WifiOff size={13} /> Reconnecting</span>}
                    <span className={`pill ${live ? "lime" : "past"}`}>{live && <span className="dot" style={{ background: "var(--ok)" }} />} {status}</span>
                    <button className="btn btn-sm md:hidden" style={{ background: "#fff" }} onClick={openScanner}><ScanLine size={16} /> Scanner</button>
                  </div>
                </div>
              </div>
              <div className="facts px-5 py-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))" }}>
                <div className="fact"><div className="tag">Date</div><div className="v" style={{ fontSize: "1.1rem" }}>{fmtDate(data.opens, { weekday: "short", month: "short", day: "numeric" })}</div></div>
                <div className="fact"><div className="tag">Boards</div><div className="v" style={{ fontSize: "1.1rem" }}>{fmtTime(data.opens)} to {fmtTime(data.ends)}</div></div>
                <div className="fact"><div className="tag">Gate</div><div className="v truncate" style={{ fontSize: "1.1rem" }}>{event.venue}</div></div>
                <div className="fact"><div className="tag">Seats</div><div className="v" style={{ fontSize: "1.1rem" }}>{data.going.length} going / {data.capacity}</div></div>
              </div>
            </header>

            <nav className="mnav flex md:hidden" aria-label="Manage event">
              {nav.map((n) => (
                <button key={n.id} className="navbtn" aria-current={tab === n.id && !scan ? "page" : undefined} onClick={() => setTab(n.id)}>
                  <n.icon size={16} /> {n.label}
                </button>
              ))}
            </nav>

            {tab === "dashboard" && <Dashboard data={data} now={now} refresh={refresh} onToast={setToast} onOpenScanner={openScanner} />}
            {tab === "analytics" && <Analytics data={data} now={now} onToast={setToast} refresh={refresh} />}
            {tab === "photos" && <PhotosPage data={data} now={now} refresh={refresh} onToast={setToast} />}
            {tab === "tickets" && <TestTickets data={data} eventId={id} onOpenScanner={openScanner} />}
            {tab === "settings" && <SettingsPage data={data} eventId={id} refresh={refresh} />}
          </div>
        </main>
      </div>

      {scan && (
        <ScannerModal event={event} locked={gateMode} onClose={() => {
          if (gateMode) return;
          // Opened from a tab of this event: step back to it; opened by a link: swap in the dashboard
          const st = window.history.state;
          if (st && st.selae && String(st.from).startsWith(`m/${id}`)) window.history.back();
          else setTab(tab);
        }}>
          <Scanner data={data} eventId={id} refresh={refresh} gateMode={gateMode} setGateMode={setGateMode} />
        </ScannerModal>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

function ScannerModal({ event, locked, onClose, children }) {
  useEffect(() => {
    const esc = (e) => {
      if (e.key !== "Escape" || locked) return;
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      onClose();
    };
    document.addEventListener("keydown", esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = prev; };
  }, [locked, onClose]);
  return (
    <div className="modal-bg" onPointerDown={(e) => { if (e.target === e.currentTarget && !locked) onClose(); }}>
      <div className="modal scan" role="dialog" aria-modal="true" aria-label="Gate scanner">
        <div className="mhead">
          <div className="min-w-0">
            <div className="tag">{locked ? "Gate mode · locked" : "Gate scanner"}</div>
            <div className="display truncate" style={{ fontSize: "1.5rem" }}>{event.title}</div>
          </div>
          {!locked && <button className="btn btn-sm" onClick={onClose} aria-label="Close scanner"><X size={16} /> Close</button>}
        </div>
        <div className="p-4 md:p-5">{children}</div>
      </div>
    </div>
  );
}
