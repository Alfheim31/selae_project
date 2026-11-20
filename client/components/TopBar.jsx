import { useEffect, useState } from "react";
import { Compass, Plus, Ticket } from "lucide-react";
import { useMe } from "../lib/account.js";
import { AccountMenu } from "./AccountMenu.jsx";
import { NotificationBell } from "./NotificationBell.jsx";
import { fmtTime, go, Mark } from "./shared.jsx";

/* ---------------- top bar ---------------- */
export function TopBar({ route }) {
  const at = (p) => (route === p ? "page" : undefined);
  const account = useMe();
  const { me } = account;
  const canHost = Boolean(me && me.hostsFor && me.hostsFor.length);
  return (
    <header className="topbar">
      <div className="wrap flex items-center justify-between gap-2" style={{ height: 64, maxWidth: 1240 }}>
        <div className="flex items-center gap-2 sm:gap-6 min-w-0">
          <button className="brand" onClick={() => go("")} aria-label="SELAE home">
            <Mark /><span className="word hidden sm:inline">SELAE</span>
          </button>
          <nav className="flex items-center gap-1" aria-label="Main">
            <button className="toplink" aria-current={at("discover")} onClick={() => go("")}><Compass size={17} className="hidden sm:block" /> <span>Discover</span></button>
            {/* Students and organizations have their own events; the superadmin only browses */}
            {me && me.role !== "superadmin" && <button className="toplink" aria-current={at("events")} onClick={() => go("events")}><Ticket size={17} className="hidden sm:block" /> <span>Events</span></button>}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <LiveClock />
          {account.session && <NotificationBell uid={account.session.user.id} />}
          <AccountMenu account={account} />
          {canHost && (
            <button className="btn btn-primary btn-sm" onClick={() => go("create")} style={{ height: 40 }}>
              <Plus size={17} /><span className="hidden sm:inline">Create event</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 5000); return () => clearInterval(t); }, []);
  let h = now.getHours();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return (
    <div className="clock hidden md:flex" role="timer" aria-label={`Current time ${fmtTime(now)}`}>
      <span className="t">{h}<span className="colon">:</span>{String(now.getMinutes()).padStart(2, "0")} <span style={{ fontSize: ".8em" }}>{ap}</span></span>
      <span className="d">{now.toLocaleDateString("en-US", { weekday: "short" })} · {now.getDate()} {now.toLocaleDateString("en-US", { month: "short" })}</span>
    </div>
  );
}
