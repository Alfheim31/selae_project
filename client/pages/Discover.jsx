import { useMemo, useState } from "react";
import { BellRing, Calendar, Search, UserPlus, X } from "lucide-react";
import { EventDrawer } from "../components/EventDrawer.jsx";
import { CATEGORIES, EventPass } from "../components/EventPass.jsx";
import { fmtDate, fmtTime, go, goBack, skyOf, Trails } from "../components/shared.jsx";
import { DiscoverSkeleton, ErrorBox, usePolled } from "../components/ui.jsx";
import { returnTo, useMe } from "../lib/account.js";
import { api, follows } from "../lib/api.js";
import { hostsEvent, useTickets } from "../lib/tickets.js";

/* ---------------- discover ---------------- */
function boardStatus(e, now = Date.now()) {
  const start = new Date(e.startsAt).getTime();
  // Board status colors
  if (now >= start && now <= new Date(e.endsAt).getTime()) return ["In progress", "#7EE2A8"];
  if (start - now < 3600000) return ["Boarding", "#D8F06A"];
  if (!e.registrationOpen) return ["Closed", "#8E9AD0"];
  if (e.spotsLeft <= 0) return ["Waitlist", "#F6B35C"];
  return ["Open", "#C9D3FF"];
}

export function Discover({ drawerId }) {
  const { me, session } = useMe();
  const uid = session ? session.user.id : null;
  // Following belongs to an account: signed out, the button takes you to sign in and back here
  const follow = (name) => {
    if (!uid) { returnTo.set(); go("profile"); return; }
    follows.toggle(uid, name); bump((x) => x + 1);
  };
  const [events, error] = usePolled(() => api.events(), [], 10000);
  const tickets = useTickets();
  const [cat, setCat] = useState(null);
  const [cal, setCal] = useState(null);
  const [q, setQ] = useState("");
  const [, bump] = useState(0);
  const all = events || [];
  const upcoming = all.filter((e) => !e.isPast).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const results = upcoming.filter((e) => (!cat || e.category === cat) && (!cal || e.hostName === cal)
    && (!q.trim() || `${e.title} ${e.hostName} ${e.venue} ${e.category}`.toLowerCase().includes(q.trim().toLowerCase())));
  const calendars = useMemo(() => {
    const m = new Map();
    for (const e of all) {
      if (!e.hostName) continue;
      const c = m.get(e.hostName) || { name: e.hostName, upcoming: 0, past: 0, next: null, color: e.color };
      if (e.isPast) c.past++; else { c.upcoming++; if (!c.next || e.startsAt < c.next.startsAt) c.next = e; }
      m.set(e.hostName, c);
    }
    return [...m.values()].sort((a, b) => b.upcoming - a.upcoming || b.past - a.past).slice(0, 6);
  }, [all]);
  const recentPhotos = all.filter((e) => e.isPast && (e.photos || []).length).sort((a, b) => b.endsAt.localeCompare(a.endsAt)).slice(0, 4);
  const open = (id) => go(`discover/${id}`);
  const filtered = cat || cal || q.trim();
  const mine = upcoming.filter((e) => tickets.has(e.id) && tickets.get(e.id).status !== "cancelled");

  return (
    <>
      <section className="sky" style={{ borderBottom: "1px solid var(--line)" }}>
        <Trails seed="discover-hero" opacity={0.55} />
        <div className="wrap relative py-10 grid gap-8 lg:grid-cols-[1fr_440px] items-end" style={{ maxWidth: 1240 }}>
          <div>
            <div className="tag" style={{ color: "rgba(255,255,255,.85)" }}>Departures · {upcoming.length} upcoming</div>
            <h1 className="page-title" style={{ color: "#fff", marginTop: ".4rem", textShadow: "0 2px 20px rgba(20,27,58,.25)" }}>Discover</h1>
            <p className="mt-3 text-lg" style={{ maxWidth: "40ch", color: "rgba(255,255,255,.92)" }}>
              Workshops, talks, hack nights and more on campus. Find one, register in seconds, and show your student ID at the entrance.
            </p>
            <label className="field mt-5" style={{ maxWidth: 520, display: "block" }}>
              <Search size={18} />
              <input className="input" placeholder="Search events, hosts or venues" value={q} onChange={(e) => setQ(e.target.value)} maxLength={80}
                style={{ border: 0, boxShadow: "0 12px 30px -12px rgba(20,27,58,.45)" }} />
            </label>
          </div>
          <DepartureBoard events={upcoming.slice(0, 5)} onOpen={open} />
        </div>
      </section>

      <div className="wrap py-8 flex flex-col gap-10" style={{ maxWidth: 1240 }}>
        {error && <ErrorBox message={error} />}
        {!events && !error && <DiscoverSkeleton />}

        {mine.length > 0 && (
          <section className="flex flex-col gap-3" aria-labelledby="mine-h">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="mine-h" className="panel-title" style={{ fontSize: "1.6rem" }}>Your tickets</h2>
              <span className="tag">{mine.length} upcoming</span>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {mine.map((e) => <EventPass key={e.id} e={e} ticket={tickets.get(e.id)} hosting={hostsEvent(me, e)} active={drawerId === e.id} onOpen={() => open(e.id)} />)}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-3" aria-labelledby="cat-h">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="cat-h" className="panel-title" style={{ fontSize: "1.6rem" }}>Browse by category</h2>
            {cat && <button className="btn btn-ghost btn-sm" onClick={() => setCat(null)}><X size={15} /> Clear</button>}
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(132px,1fr))" }}>
            {CATEGORIES.filter(([k]) => k !== "General" || upcoming.some((e) => e.category === "General")).map(([k, Icon]) => {
              const n = upcoming.filter((e) => e.category === k).length;
              return (
                <button key={k} className="cat" aria-pressed={cat === k} onClick={() => setCat(cat === k ? null : k)}>
                  <span className="ic"><Icon size={19} /></span>
                  <span>
                    <span className="block display" style={{ fontSize: "1.35rem" }}>{k}</span>
                    <span className="tag">{n} upcoming</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {calendars.length > 0 && (
          <section className="flex flex-col gap-3" aria-labelledby="cal-h">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="cal-h" className="panel-title" style={{ fontSize: "1.6rem" }}>Featured calendars</h2>
              {cal ? <button className="btn btn-ghost btn-sm" onClick={() => setCal(null)}><X size={15} /> Show all hosts</button>
                : <span className="tag">Follow one to hear about new events</span>}
            </div>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))" }}>
              {calendars.map((c) => {
                const following = follows.has(uid, c.name);
                return (
                  <div key={c.name} className="cal" aria-pressed={cal === c.name} style={{ "--c-bg": skyOf(c.color) }}>
                    <div className="flex items-start gap-3">
                      <div className="av">{c.name.split(/\s+/).filter((w) => /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join("") || c.name[0]}</div>
                      <div className="min-w-0 flex-1">
                        <div className="display truncate" style={{ fontSize: "1.35rem" }}>{c.name}</div>
                        <div className="tag">{c.upcoming} upcoming · {c.past} past</div>
                      </div>
                    </div>
                    {c.next && <div className="text-sm muted truncate">Next: <strong style={{ color: "var(--text)" }}>{c.next.title}</strong>, {fmtDate(c.next.startsAt, { month: "short", day: "numeric" })}</div>}
                    <div className="flex gap-2 mt-auto">
                      <button className="btn btn-sm flex-1" onClick={() => setCal(cal === c.name ? null : c.name)}>
                        <Calendar size={15} /> {cal === c.name ? "Showing" : "Events"}
                      </button>
                      <button className={`btn btn-sm ${following ? "btn-primary" : ""}`} aria-pressed={following}
                        title={uid ? undefined : "Sign in to follow"} onClick={() => follow(c.name)}>
                        {following ? <><BellRing size={15} /> Following</> : <><UserPlus size={15} /> Follow</>}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-3" aria-labelledby="res-h">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="res-h" className="panel-title" style={{ fontSize: "1.6rem" }}>
              {filtered ? [cal, cat, q.trim() && `“${q.trim()}”`].filter(Boolean).join(" · ") : "All upcoming"}
            </h2>
            <span className="tag">{results.length} event{results.length === 1 ? "" : "s"}</span>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {results.map((e) => <EventPass key={e.id} e={e} ticket={tickets.get(e.id)} hosting={hostsEvent(me, e)} active={drawerId === e.id} onOpen={() => open(e.id)} />)}
          </div>
          {events && !results.length && (
            <div className="panel p-6 text-center flex flex-col items-center gap-3">
              <p className="muted">No upcoming events match. Try another category or search.</p>
              <button className="btn" onClick={() => { setCat(null); setCal(null); setQ(""); }}>Clear filters</button>
            </div>
          )}
        </section>

        {recentPhotos.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="panel-title" style={{ fontSize: "1.6rem" }}>From recent events</h2>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))" }}>
              {recentPhotos.map((e) => (
                <button key={e.id} className="panel text-left" style={{ overflow: "hidden", padding: 0, color: "inherit" }} onClick={() => open(e.id)}>
                  <img src={e.photos[0].url} alt="" style={{ width: "100%", aspectRatio: "16/10", objectFit: "cover", display: "block" }} loading="lazy" />
                  <div className="p-3">
                    <div className="display" style={{ fontSize: "1.2rem" }}>{e.title}</div>
                    <div className="tag">{e.photos.length} photos · {fmtDate(e.startsAt, { month: "short", day: "numeric" })}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
      {drawerId && <EventDrawer id={drawerId} onClose={() => goBack("", { replace: true })} />}
    </>
  );
}

function DepartureBoard({ events, onOpen }) {
  return (
    <div className="board" aria-label="Next events">
      <div className="board-head"><span>Time</span><span>Event</span><span className="hidden sm:block">Gate</span><span>Status</span></div>
      {events.map((e) => {
        const [st, color] = boardStatus(e);
        return (
          <button key={e.id} className="board-row" onClick={() => onOpen(e.id)}>
            <span className="mono">{fmtDate(e.startsAt, { month: "short", day: "numeric" })}<br /><span style={{ opacity: .7 }}>{fmtTime(e.startsAt)}</span></span>
            <span className="truncate" style={{ fontWeight: 600 }}>{e.title}</span>
            <span className="truncate hidden sm:block" style={{ opacity: .75 }}>{e.venue}</span>
            <span className="mono" style={{ color }}>{st}</span>
          </button>
        );
      })}
      {!events.length && <div className="board-row" style={{ display: "block", opacity: .7 }}>No departures scheduled.</div>}
    </div>
  );
}
