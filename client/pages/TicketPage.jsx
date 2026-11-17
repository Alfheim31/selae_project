import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { flightNo, fmtDate, fmtTime, go, skyOf, Trails } from "../components/shared.jsx";
import { ErrorBox, TicketSkeleton, usePolled } from "../components/ui.jsx";
import { api, myTickets } from "../lib/api.js";

/* ---------------- ticket: a boarding pass ---------------- */
const prettyCode = (c) => `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`;

export function TicketPage({ code }) {
  const [ticket, error, setTicket] = usePolled(() => api.ticket(code), [code], 4000);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => { if (ticket && ticket.event) myTickets.add(code, ticket.event.id); }, [ticket, code]);

  if (error && !ticket) return <div className="narrow py-8"><ErrorBox message={error} /></div>;
  if (!ticket) return <TicketSkeleton />;
  const { event, student } = ticket;
  const cancelled = ticket.status === "cancelled";
  const status = ticket.checkin ? "Checked in" : ticket.status === "going" ? "Confirmed" : ticket.status === "waitlist" ? "Waitlist" : "Cancelled";

  const cancel = async () => {
    setBusy(true); setActionError("");
    try { setTicket(await api.cancel(code)); setConfirming(false); } catch (e) { setActionError(e.message); }
    setBusy(false);
  };

  return (
    <div className="narrow py-6 flex flex-col gap-4" style={{ maxWidth: 480 }}>
      <div className="pass-wrap">
        <div className="pass" style={{ overflow: "hidden" }}>
          <div className="band" style={{ background: skyOf(event.color), color: "#fff", padding: "1.2rem 1.3rem 1.4rem", position: "relative", overflow: "hidden" }}>
            {event.coverImage && <img src={event.coverImage} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: .35, mixBlendMode: "luminosity" }} />}
            <Trails seed={event.id} opacity={0.6} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(20,27,58,.28), rgba(20,27,58,0) 45%, rgba(20,27,58,.18))" }} />
            <div className="relative flex justify-between items-start gap-3">
              <div className="tag" style={{ color: "rgba(255,255,255,.85)" }}>Boarding pass</div>
              <div className="tag" style={{ color: "rgba(255,255,255,.85)" }}>{flightNo(event.id)}</div>
            </div>
            <div className="relative display" style={{ fontSize: "2.3rem", marginTop: "1.6rem", textTransform: "uppercase", textShadow: "0 2px 14px rgba(20,27,58,.25)" }}>{event.title}</div>
            <div className="relative text-sm mt-1" style={{ opacity: .9 }}>{event.hostName || "SELAE event"}</div>
          </div>
          <div className="facts p-5" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="fact" style={{ gridColumn: "1 / -1" }}><div className="tag">Student number</div><div className="v mono">{student.id}</div></div>
            <div className="fact"><div className="tag">Date</div><div className="v">{fmtDate(event.startsAt, { month: "short", day: "numeric" })}</div></div>
            <div className="fact"><div className="tag">Boards</div><div className="v">{fmtTime(event.startsAt)}</div></div>
            <div className="fact"><div className="tag">Gate</div><div className="v" style={{ fontSize: "1.1rem" }}>{event.venue}</div></div>
            <div className="fact"><div className="tag">Status</div>
              <div className="v" style={{ color: cancelled ? "var(--bad)" : ticket.status === "waitlist" ? "var(--warn)" : "var(--ok)" }}>{status}</div>
              {ticket.checkin && <div className="s">at {fmtTime(ticket.checkin.time)}</div>}
            </div>
          </div>
          <div className="tear" />
          <div className="p-5 flex flex-col items-center gap-3 text-center">
            <p className="font-bold">
              {cancelled ? "This registration was cancelled."
                : ticket.checkin ? "You're in. Enjoy the event."
                : ticket.status === "waitlist" ? "You're on the waitlist. You can check in once you're moved to going."
                : "At the entrance, look at the camera or show your student ID."}
            </p>
          </div>
        </div>
      </div>

      <button className="btn btn-primary" onClick={() => go(`e/${event.id}`)}>
        <ArrowLeft size={17} /> Back to event page
      </button>

      {actionError && <ErrorBox message={actionError} />}
      {!cancelled && !ticket.checkin && !event.isPast && (
        confirming ? (
          <div className="panel p-4 flex flex-col gap-3">
            <p>Cancel your registration? {ticket.status === "going" ? "Your seat goes to the next person on the waitlist." : ""}</p>
            <div className="flex gap-2">
              <button className="btn" style={{ background: "var(--bad)", borderColor: "var(--bad)", color: "#fff" }} disabled={busy} onClick={cancel}>Yes, cancel</button>
              <button className="btn btn-ghost" onClick={() => setConfirming(false)}>Keep my seat</button>
            </div>
          </div>
        ) : (
          <button className="btn btn-ghost self-center" onClick={() => setConfirming(true)}>Cancel registration</button>
        )
      )}
      {cancelled && !event.isPast && event.registrationOpen && (
        <button className="btn btn-primary self-center" onClick={() => go(`e/${event.id}`)}>Register again</button>
      )}
    </div>
  );
}
