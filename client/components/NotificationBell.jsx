import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellRing, CheckCircle2, Clock, ImagePlus, Images, Megaphone, PlaneTakeoff, Ticket, UserPlus, Users, X } from "lucide-react";
import { api, seen } from "../lib/api.js";
import { go } from "./shared.jsx";

const NOTIF_ICON = {
  promoted: CheckCircle2, registered: Ticket, waitlist: Clock, soon: PlaneTakeoff, checkin: CheckCircle2, photos: Images,
  registrations: Users, photosPrompt: ImagePlus, newEvent: Megaphone,
  invite: UserPlus, officer: CheckCircle2, removed: X, accepted: UserPlus, declined: X, orgEvent: Megaphone,
};

const notifTarget = (n) => {
  if (["invite", "accepted", "declined", "removed"].includes(n.kind)) return "profile";
  if (n.kind === "officer") return "events";
  if (n.kind === "orgEvent") return `events/${n.eventId}`;
  if (["promoted", "registered", "waitlist", "soon", "checkin"].includes(n.kind)) return `t/${n.code}`;
  if (n.kind === "photos") return `e/${n.eventId}`;
  if (n.kind === "registrations") return `m/${n.eventId}`;
  if (n.kind === "photosPrompt") return `m/${n.eventId}/photos`;
  return `discover/${n.eventId}`;
};

const ago = (t) => {
  const s = (Date.now() - new Date(t)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "yesterday" : `${d} days ago`;
};

export function NotificationBell({ uid }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [lastSeen, setLastSeen] = useState(seen.get(uid));
  const box = useRef(null);
  const load = useCallback(() => api.notifications(uid).then(setData).catch(() => {}), [uid]);
  useEffect(() => {
    setData(null);
    setLastSeen(seen.get(uid));
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load, uid]);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const items = data ? data.items : [];
  const unread = items.filter((n) => !lastSeen || n.time > lastSeen).length;
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) { load(); if (data) { seen.mark(uid, data.now); } }
    else if (data) setLastSeen(data.now);
  };
  return (
    <div className="relative" ref={box}>
      <button className="iconbtn" onClick={toggle} aria-expanded={open} aria-label={unread ? `Notifications, ${unread} new` : "Notifications"}>
        {unread ? <BellRing size={19} /> : <Bell size={19} />}
        {unread > 0 && <span className="badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Notifications">
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--line)" }}>
            <div className="panel-title">Notifications</div>
            <span className="tag">{unread ? `${unread} new` : "All caught up"}</span>
          </div>
          <div style={{ maxHeight: 420, overflow: "auto" }}>
            {items.length ? items.map((n, i) => {
              const Icon = NOTIF_ICON[n.kind] || Bell;
              const isNew = !lastSeen || n.time > lastSeen;
              return (
                <button key={i} className={`notif ${isNew ? "unread" : ""}`} onClick={() => { setOpen(false); setLastSeen(data.now); go(notifTarget(n)); }}>
                  <span className="ic"><Icon size={17} /></span>
                  <span className="min-w-0">
                    <span className="block text-sm" style={{ fontWeight: isNew ? 600 : 400 }}>{n.text}</span>
                    <span className="tag">{ago(n.time)}{n.host ? " · hosting" : ""}</span>
                  </span>
                </button>
              );
            }) : (
              <div className="p-5 text-center muted text-sm">
                Nothing yet. Register for an event, host one, or follow a calendar on Discover, and updates show up here.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
