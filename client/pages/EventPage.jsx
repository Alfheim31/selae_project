import { useState } from "react";
import { ArrowLeft, CheckCircle2, Clock, ScanLine, Settings, Ticket } from "lucide-react";
import { categoryIcon, isLive } from "../components/EventPass.jsx";
import { Lightbox } from "../components/Lightbox.jsx";
import { Cover, fmtDate, fmtTime, formatName, go, skyOf } from "../components/shared.jsx";
import { ErrorBox, EventPageSkeleton, usePolled } from "../components/ui.jsx";
import { api, myTickets } from "../lib/api.js";
import { RegisterForm } from "./RegisterForm.jsx";

/* ---------------- event page ---------------- */
export function EventPage({ id }) {
  const [event, error] = usePolled(() => api.event(id), [id], 8000);
  const saved = myTickets.forEvent(id);
  const [ticket] = usePolled(() => (saved ? api.ticket(saved.code) : Promise.resolve(null)), [id, saved && saved.code], 0);
  const [lightbox, setLightbox] = useState(-1);
  const active = ticket && ticket.status !== "cancelled";

  if (error && !event) return <div className="narrow py-8"><ErrorBox message={error} /></div>;
  if (!event) return <EventPageSkeleton />;
  const Icon = categoryIcon(event.category);

  return (
    <div className="wrap py-6 md:py-8" style={{ maxWidth: 1080 }}>
      <button className="btn btn-ghost btn-sm mb-4" onClick={() => (window.history.length > 1 ? window.history.back() : go("discover"))}><ArrowLeft size={16} /> Back</button>
      <div className="grid grid-cols-1 md:grid-cols-[340px_1fr] gap-8">
        <div className="flex flex-col gap-4">
          <Cover event={event} />
          {event.hostName && (
            <div className="flex items-center gap-3">
              <div className="cal-av" style={{ "--c-bg": skyOf(event.color) }}>{event.hostName[0]}</div>
              <div><div className="tag">Hosted by</div><div className="display" style={{ fontSize: "1.25rem" }}>{event.hostName}</div></div>
            </div>
          )}
          {event.canManage && (
            <div className="panel p-4 flex flex-col gap-2">
              <span className="pill host self-start">You're hosting</span>
              <button className="btn btn-primary" onClick={() => go(`m/${id}`)}><Settings size={16} /> Manage event</button>
              <button className="btn" onClick={() => go(`m/${id}/scan`)}><ScanLine size={16} /> Open scanner</button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6 min-w-0">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5">
              <span className="pill host"><Icon size={12} /> {event.category}</span>
              {event.isPast && <span className="pill past">Ended</span>}
              {!event.isPast && isLive(event) && <span className="pill lime">Boarding now</span>}
            </div>
            <h1 className="display" style={{ fontSize: "clamp(2.4rem,6vw,3.8rem)", textWrap: "balance" }}>{event.title}</h1>
          </div>

          <div className="pass-wrap">
            <div className="pass">
              <div className="facts p-5">
                <div className="fact"><div className="tag">Date</div><div className="v">{fmtDate(event.startsAt, { weekday: "short", month: "short", day: "numeric" })}</div></div>
                <div className="fact"><div className="tag">Boards</div><div className="v">{fmtTime(event.startsAt)}</div><div className="s">until {fmtTime(event.endsAt)}{new Date(event.startsAt).toDateString() !== new Date(event.endsAt).toDateString() ? ` (${fmtDate(event.endsAt, { month: "short", day: "numeric" })})` : ""}</div></div>
                <div className="fact"><div className="tag">Gate</div><div className="v">{event.venue}</div></div>
                <div className="fact"><div className="tag">Seats</div><div className="v">{event.counts.going} going</div><div className="s">of {event.capacity}{event.counts.waitlist ? `, ${event.counts.waitlist} waitlisted` : ""}</div></div>
              </div>
              <div className="tear" />
              <section className="p-5" aria-labelledby="reg-h">
                {active ? (
                  <div className="flex flex-col gap-3">
                    <h2 id="reg-h" className="panel-title flex items-center gap-2">
                      {ticket.checkin ? <><CheckCircle2 size={22} color="var(--ok)" /> You're checked in</>
                        : ticket.status === "going" ? <><CheckCircle2 size={22} color="var(--ok)" /> You're going</>
                        : <><Clock size={22} color="var(--warn)" /> You're on the waitlist</>}
                    </h2>
                    <p className="muted">
                      {ticket.status === "waitlist"
                        ? "You'll be moved to going if a spot opens up, in waitlist order. Your ticket page will update."
                        : `Registered as ${formatName(ticket.student)}. Show your pass at the entrance.`}
                    </p>
                    <button className="btn btn-primary self-start" onClick={() => go(`t/${ticket.code}`)}><Ticket size={17} /> View my pass</button>
                  </div>
                ) : event.isPast ? (
                  <p id="reg-h" className="muted">This event has ended.{event.photos.length ? " Photos from the day are below." : ""}</p>
                ) : !event.registrationOpen ? (
                  <p id="reg-h" className="muted">Registration is closed. Contact the host if you need a spot.</p>
                ) : (
                  <RegisterForm event={event} />
                )}
              </section>
            </div>
          </div>

          {event.description && (
            <section>
              <div className="tag mb-2">About this event</div>
              <p className="muted" style={{ whiteSpace: "pre-wrap", lineHeight: 1.65, fontSize: "1.05rem" }}>{event.description}</p>
            </section>
          )}

          {event.photos.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="panel-title">Photos from the event <span className="tag" style={{ marginLeft: ".4rem" }}>{event.photos.length}</span></h2>
              <div className="gallery">
                {event.photos.map((p, i) => (
                  <button key={p.id} className="ph" onClick={() => setLightbox(i)} aria-label={`Open photo ${i + 1}`}><img src={p.url} alt="" loading="lazy" /></button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
      {lightbox >= 0 && <Lightbox photos={event.photos} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(-1)} />}
    </div>
  );
}
