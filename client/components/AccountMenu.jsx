import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogIn, LogOut, UserRound } from "lucide-react";
import { displayName, ROLE_LABEL } from "../lib/account.js";
import { signOut } from "../lib/auth.js";
import { go } from "./shared.jsx";

export function AccountMenu({ account }) {
  const { me, session } = account;
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  if (session === undefined) return null;
  if (!session) {
    return (
      <button className="btn btn-sm" onClick={() => go("profile")} style={{ height: 40 }}>
        <LogIn size={17} /><span className="hidden sm:inline">Sign in</span>
      </button>
    );
  }

  const meta = session.user.user_metadata || {};
  const name = displayName(me, session);
  const pick = (to) => { setOpen(false); go(to); };
  const out = async () => { setOpen(false); await signOut(); go(""); };

  return (
    <div className="relative" ref={box}>
      <button className="btn btn-sm" onClick={() => setOpen((x) => !x)} aria-expanded={open} aria-haspopup="menu"
        title={`Signed in as ${session.user.email}`} style={{ height: 40, gap: 8, paddingLeft: 6 }}>
        <Avatar meta={meta} name={name.first} size={28} />
        <span className="hidden sm:inline truncate" style={{ maxWidth: 140 }}>{name.first}</span>
        <ChevronDown size={15} className="faint" />
      </button>
      {open && (
        <div className="popover" role="menu" aria-label="Account" style={{ width: "min(280px, calc(100vw - 24px))" }}>
          <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--line)" }}>
            <Avatar meta={meta} name={name.first} size={40} />
            <div className="min-w-0">
              <div className="truncate" style={{ fontWeight: 700 }}>{name.full}</div>
              <div className="muted text-xs truncate">{session.user.email}</div>
              {me && <div className="tag" style={{ marginTop: 2 }}>{ROLE_LABEL[me.role]}</div>}
            </div>
          </div>
          <button className="notif" role="menuitem" onClick={() => pick("profile")} style={{ alignItems: "center" }}>
            <span className="ic"><UserRound size={17} /></span><span>Profile</span>
          </button>
          <button className="notif" role="menuitem" onClick={out} style={{ alignItems: "center" }}>
            <span className="ic" style={{ background: "var(--raised)", color: "var(--muted)" }}><LogOut size={17} /></span><span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
}

export function Avatar({ meta, name, size }) {
  if (meta.avatar_url) return <img src={meta.avatar_url} alt="" referrerPolicy="no-referrer" style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0 }} />;
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, display: "inline-flex", alignItems: "center",
      justifyContent: "center", background: "var(--accent)", color: "var(--accent-ink)", fontWeight: 700, fontSize: size * 0.45 }}>
      {String(name || "?")[0].toUpperCase()}
    </span>
  );
}
