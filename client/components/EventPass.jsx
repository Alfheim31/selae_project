import {
  BookOpen, Briefcase, CheckCircle2, Clock, CodeXml, Hammer, Images, MapPin, Mic, PartyPopper, Sparkles, Trophy, Users,
} from "lucide-react";
import { Barcode, Cover, flightNo, fmtDate, fmtTime, skyOf } from "./shared.jsx";

export const CATEGORIES = [
  ["Workshop", Hammer], ["Talk", Mic], ["Hackathon", CodeXml], ["Study jam", BookOpen], ["Career", Briefcase],
  ["Social", PartyPopper], ["Assembly", Users], ["Competition", Trophy], ["General", Sparkles],
];

export const categoryIcon = (c) => (CATEGORIES.find(([k]) => k === c) || CATEGORIES[CATEGORIES.length - 1])[1];

export const isLive = (e, now = Date.now()) => now >= new Date(e.startsAt).getTime() - 3600000 && now <= new Date(e.endsAt).getTime();

const seatsText = (e) => (e.isPast ? `${e.counts.going} went` : e.spotsLeft > 0 ? `${e.spotsLeft} seats left` : "Full · waitlist open");

export function TicketPill({ ticket }) {
  if (!ticket) return null;
  if (ticket.checkin) return <span className="pill going"><CheckCircle2 size={12} /> Checked in</span>;
  if (ticket.status === "going") return <span className="pill going">Going</span>;
  if (ticket.status === "waitlist") return <span className="pill waitlist">Waitlist</span>;
  return <span className="pill cancelled">Cancelled</span>;
}

export function EventPass({ e, ticket, onOpen, active, hosting = false }) {
  const d = new Date(e.startsAt);
  const Icon = categoryIcon(e.category);
  return (
    <button className="evpass" onClick={onOpen} aria-current={active ? "true" : undefined} aria-label={`${e.title}, ${fmtDate(e.startsAt)}`}>
      <div className="pass evp" style={{ "--c-bg": skyOf(e.color) }}>
        <div className="side-band" />
        <div className="main">
          <div className="datebig">
            <div className="mo">{d.toLocaleDateString("en-US", { month: "short" })}</div>
            <div className="dy">{d.getDate()}</div>
            <div className="wd">{d.toLocaleDateString("en-US", { weekday: "short" })}</div>
          </div>
          <div className="min-w-0 flex flex-col gap-1">
            <div className="tag flex items-center gap-2"><Icon size={12} /> {e.category} <span>·</span> {flightNo(e.id)}</div>
            <div className="ttl truncate">{e.title}</div>
            <div className="text-sm muted flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span className="flex items-center gap-1"><Clock size={13} /> {fmtTime(e.startsAt)}</span>
              <span className="flex items-center gap-1 min-w-0"><MapPin size={13} style={{ flexShrink: 0 }} /> <span className="truncate">{e.venue}</span></span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {isLive(e) && !e.isPast && <span className="pill lime">Boarding now</span>}
              {hosting && <span className="pill host">Hosting</span>}
              <TicketPill ticket={ticket} />
              {e.isPast && (e.photos || []).length > 0 && <span className="pill past"><Images size={12} /> {e.photos.length} photos</span>}
            </div>
          </div>
        </div>
        <div className="stubx tear-v">
          <Cover event={e} thumb />
          <div className="tag text-center" style={{ color: e.isPast ? "var(--faint)" : e.spotsLeft > 0 ? "var(--accent)" : "var(--warn)" }}>{seatsText(e)}</div>
          <Barcode value={e.id} height={18} color="var(--text)" />
        </div>
      </div>
    </button>
  );
}
