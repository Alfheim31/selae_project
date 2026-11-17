import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Settings, Sparkles, Ticket, X } from "lucide-react";
import { api, myTickets } from "../lib/api.js";
import { categoryIcon, isLive, TicketPill } from "./EventPass.jsx";
import { Lightbox } from "./Lightbox.jsx";
import { Barcode, Cover, flightNo, fmtDate, fmtTime, go } from "./shared.jsx";
import { ErrorBox, Sk, usePolled } from "./ui.jsx";

/* ---------------- slide-over: event details ---------------- */
export function EventDrawer({ id, onClose }) {
  const [event, error] = usePolled(() => api.event(id), [id], 8000);
  const saved = myTickets.forEvent(id);
  const [ticket] = usePolled(() => (saved ? api.ticket(saved.code) : Promise.resolve(null)), [id, saved && saved.code], 0);
  const closeRef = useRef(null);
  const [lightbox, setLightbox] = useState(-1);

  useEffect(() => {
    closeRef.current && closeRef.current.focus();
    const esc = (e) => { if (e.key === "Escape" && lightbox < 0) onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose, lightbox]);

  const active = ticket && ticket.status !== "cancelled";
  const Icon = event ? categoryIcon(event.category) : Sparkles;

  return (
    <>
      <div className="drawer-bg" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={event ? event.title : "Event details"}>
        <div className="dhead">
          <div className="min-w-0">
            <div className="tag">Event details{event ? ` · ${flightNo(event.id)}` : ""}</div>
          </div>
          <button ref={closeRef} className="iconbtn" onClick={onClose} aria-label="Close details"><X size={19} /></button>
        </div>
        <div className="dbody">
          {error && !event && <ErrorBox message={error} />}
          {!event && !error && (
            <div className="flex flex-col gap-4" role="status" aria-busy="true" aria-label="Loading">
              <Sk h={200} r={14} /><Sk w={90} h={20} r={999} /><Sk w="85%" h={34} /><Sk w="60%" />
              <div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="flex flex-col gap-1.5"><Sk w={50} h={10} /><Sk w="75%" h={16} /></div>)}</div>
              <Sk h={46} r={10} />
            </div>
          )}
          {event && (
            <div className="flex flex-col gap-5">
              <Cover event={event} className="wide" showTitle={false} />
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-1.5">
                  <span className="pill host"><Icon size={12} /> {event.category}</span>
                  {event.isPast ? <span className="pill past">Ended</span> : isLive(event) ? <span className="pill lime">Boarding now</span> : null}
                  {event.canManage && <span className="pill host">Hosting</span>}
                  {active && <TicketPill ticket={ticket} />}
                </div>
                <h2 className="display" style={{ fontSize: "clamp(2rem,6vw,2.7rem)", textWrap: "balance" }}>{event.title}</h2>
                {event.hostName && <div className="muted">Hosted by <strong style={{ color: "var(--text)" }}>{event.hostName}</strong></div>}
              </div>

              <div className="pass-wrap">
                <div className="pass">
                  <div className="facts p-4">
                    <div className="fact"><div className="tag">Date</div><div className="v">{fmtDate(event.startsAt, { weekday: "short", month: "short", day: "numeric" })}</div></div>
                    <div className="fact"><div className="tag">Boards</div><div className="v">{fmtTime(event.startsAt)}</div><div className="s">until {fmtTime(event.endsAt)}</div></div>
                    <div className="fact" style={{ gridColumn: "1 / -1" }}><div className="tag">Gate</div><div className="v">{event.venue}</div></div>
                  </div>
                  <div className="tear" />
                  <div className="p-4 flex items-center justify-between gap-4">
                    <div className="fact">
                      <div className="tag">Seats</div>
                      <div className="v">{event.counts.going} going <span className="muted" style={{ fontWeight: 500 }}>/ {event.capacity}</span></div>
                      <div className="s">{event.isPast ? "Event has ended" : event.spotsLeft > 0 ? `${event.spotsLeft} left` : `Full${event.counts.waitlist ? `, ${event.counts.waitlist} on the waitlist` : ""}`}</div>
                    </div>
                    <div style={{ width: 120 }}><Barcode value={event.id} height={30} color="var(--text)" /></div>
                  </div>
                </div>
              </div>

              {event.description && (
                <section>
                  <div className="tag mb-1">About</div>
                  <p className="muted" style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{event.description}</p>
                </section>
              )}

              {event.photos.length > 0 && (
                <section className="flex flex-col gap-2">
                  <div className="tag">{event.photos.length} photos from the event</div>
                  <div className="gallery" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
                    {event.photos.slice(0, 6).map((p, i) => (
                      <button key={p.id} className="ph" onClick={() => setLightbox(i)} aria-label={`Photo ${i + 1}`}><img src={p.url} alt="" loading="lazy" /></button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
        {event && (
          <div className="dfoot">
            {active ? (
              <button className="btn" onClick={() => go(`t/${ticket.code}`)}><Ticket size={17} /> My ticket</button>
            ) : null}
            <button className={`btn ${event.canManage ? "" : "btn-primary"}`} onClick={() => go(`e/${event.id}`)}><ArrowUpRight size={17} /> Event page</button>
            {event.canManage && <button className="btn btn-primary" onClick={() => go(`m/${event.id}`)}><Settings size={17} /> Manage event</button>}
          </div>
        )}
      </aside>
      {event && lightbox >= 0 && <Lightbox photos={event.photos} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(-1)} />}
    </>
  );
}
