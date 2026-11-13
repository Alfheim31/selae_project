import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar, MapPin, Users, Ticket, Plus, Settings, ScanLine, CheckCircle2, Clock, ArrowLeft, Bell, X, Compass, Search,
  Hammer, Mic, CodeXml, BookOpen, Briefcase, PartyPopper, Trophy, Sparkles, ImagePlus, Trash2, ChevronLeft, ChevronRight,
  ArrowUpRight, Images, Megaphone, PlaneTakeoff, BellRing, UserPlus, Upload,
} from "lucide-react";
import { api, myTickets, follows, seen } from "../lib/api.js";
import {
  Cover, Mark, QrCode, Barcode, Trails, go, fmtTime, fmtDate, fmtRange, formatName, tidyName, tidyInitial, COLORS, COLOR_NAMES,
  skyOf, flightNo, prepareImage,
} from "../components/shared.jsx";
import { Camera, LogIn, Mail, Eye, EyeOff } from "lucide-react";
import { signIn, signOut, useSession, passwordSignIn, passwordSignUp, verifyEmailCode, resendEmailCode } from "../lib/auth.js";
import { useCamera } from "../components/camera.jsx";
import { extractFaceDescriptor } from "../lib/face.js";
import { OfficersPanel, InvitesPanel } from "./org.jsx";

/* Public pages */

export const CATEGORIES = [
  ["Workshop", Hammer], ["Talk", Mic], ["Hackathon", CodeXml], ["Study jam", BookOpen], ["Career", Briefcase],
  ["Social", PartyPopper], ["Assembly", Users], ["Competition", Trophy], ["General", Sparkles],
];
const categoryIcon = (c) => (CATEGORIES.find(([k]) => k === c) || CATEGORIES[CATEGORIES.length - 1])[1];

/* ---------------- top bar ---------------- */
export function TopBar({ route }) {
  const at = (p) => (route === p ? "page" : undefined);
  return (
    <header className="topbar">
      <div className="wrap flex items-center justify-between gap-2" style={{ height: 64, maxWidth: 1240 }}>
        <div className="flex items-center gap-2 sm:gap-6 min-w-0">
          <button className="brand" onClick={() => go("")} aria-label="SELAE home">
            <Mark /><span className="word hidden sm:inline">SELAE</span>
          </button>
          <nav className="flex items-center gap-1" aria-label="Main">
            <button className="toplink" aria-current={at("events")} onClick={() => go("")}><Ticket size={17} className="hidden sm:block" /> <span>Events</span></button>
            <button className="toplink" aria-current={at("discover")} onClick={() => go("discover")}><Compass size={17} className="hidden sm:block" /> <span>Discover</span></button>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <LiveClock />
          <NotificationBell />
          <AccountButton />
          <button className="btn btn-primary btn-sm" onClick={() => go("create")} style={{ height: 40 }}>
            <Plus size={17} /><span className="hidden sm:inline">Create event</span>
          </button>
        </div>
      </div>
    </header>
  );
}

// The signed-in account as SELAE sees it (role, profile). undefined while loading, null when signed out.
export function useMe() {
  const session = useSession();
  const uid = session ? session.user.id : session;
  const [me, setMe] = useState(undefined);
  const reload = useCallback(async () => {
    try { setMe((await api.me()).user); } catch { setMe(null); }
  }, []);
  useEffect(() => {
    if (uid === undefined) return;
    if (uid === null) { setMe(null); return; }
    setMe(undefined);
    reload();
  }, [uid, reload]);
  return { me, reload, session };
}

function AccountButton() {
  const session = useSession();
  if (session === undefined) return null;
  if (!session) {
    return (
      <button className="btn btn-sm" onClick={() => go("profile")} style={{ height: 40 }}>
        <LogIn size={17} /><span className="hidden sm:inline">Sign in</span>
      </button>
    );
  }
  const meta = session.user.user_metadata || {};
  const first = String(meta.full_name || meta.name || session.user.email).split(" ")[0];
  return (
    <button className="btn btn-sm" onClick={() => go("profile")} title={`Signed in as ${session.user.email}`} style={{ height: 40, gap: 8 }}>
      <Avatar meta={meta} name={first} size={26} />
      <span className="hidden sm:inline">{first}</span>
    </button>
  );
}

function Avatar({ meta, name, size }) {
  if (meta.avatar_url) return <img src={meta.avatar_url} alt="" referrerPolicy="no-referrer" style={{ width: size, height: size, borderRadius: "50%" }} />;
  return <span aria-hidden="true">{String(name || "?")[0]}</span>;
}

const ROLE_LABEL = { superadmin: "Superadmin", org: "Organization account", student: "Student" };

/* ---------------- profile: filled in once, used for every event ---------------- */
export function ProfilePage() {
  const { me, reload, session } = useMe();
  const signOutHere = async () => { await signOut(); go(""); };

  if (me === undefined) return <div className="narrow py-10 muted">Loading your account…</div>;
  if (!me) return <div className="narrow py-10"><AuthForm /></div>;

  const meta = (session && session.user.user_metadata) || {};
  const back = returnTo.get();
  const ready = me.role !== "student" || (me.profile && me.profile.hasFace);
  return (
    <div className="narrow py-10 flex flex-col gap-4">
      {back && ready && (
        <div className="panel p-4 flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: "var(--accent)" }}>
          <span className="text-sm">{me.role === "student" ? "You're all set. Go back to the event to register." : "Go back to where you were."}</span>
          <button className="btn btn-primary btn-sm" onClick={() => { returnTo.clear(); go(back); }}>Back to the event</button>
        </div>
      )}
      <div className="panel p-5 flex items-center gap-4">
        <Avatar meta={meta} name={me.name || me.email} size={52} />
        <div className="min-w-0 flex-1">
          <div style={{ fontWeight: 700, fontSize: "1.15rem" }}>{me.name || me.email}</div>
          <div className="muted text-sm" style={{ overflowWrap: "anywhere" }}>{me.email}</div>
          <div className="text-sm" style={{ marginTop: 2 }}>
            {ROLE_LABEL[me.role]}{me.org ? ` · ${me.org.name}` : ""}
            {(me.officerOf || []).map((o) => <span key={o.id} className="pill host" style={{ marginLeft: 8 }}>Officer · {o.name}</span>)}
          </div>
        </div>
        <button className="btn btn-sm" onClick={signOutHere}>Sign out</button>
      </div>
      {me.role === "student" ? <><InvitesPanel me={me} onChange={reload} /><ProfileForm me={me} onSaved={reload} /></>
        : me.role === "org" ? <OfficersPanel />
        : (
          <button className="panel p-5 flex items-center justify-between gap-3" onClick={() => go("admin")} style={{ textAlign: "left", cursor: "pointer" }}>
            <span>
              <span style={{ display: "block", fontWeight: 700 }}>Organizations</span>
              <span className="muted text-sm">Add, edit, and disable the organizations that host events.</span>
            </span>
            <ChevronRight size={20} />
          </button>
        )}
    </div>
  );
}

const EMPTY_STUDENT = { first: "", middle: "", last: "", suffix: "", studentId: "", section: "" };

// Details typed at sign-up wait here until the email is confirmed and the profile is saved
const PENDING = "selae.pendingStudent";
const pendingStudent = {
  get(email) {
    try {
      const x = JSON.parse(localStorage.getItem(PENDING));
      return x && x.email === String(email).toLowerCase() ? x.f : null;
    } catch { return null; }
  },
  set(email, f) { try { localStorage.setItem(PENDING, JSON.stringify({ email: String(email).toLowerCase(), f })); } catch { /* private mode */ } },
  clear() { try { localStorage.removeItem(PENDING); } catch { /* private mode */ } },
};

function StudentFields({ f, set }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label><span className="lbl">Given name</span><input className="inp" value={f.first} onChange={set("first")} autoComplete="given-name" required /></label>
      <label><span className="lbl">Middle name or initial <span className="faint">(optional)</span></span><input className="inp" value={f.middle} onChange={set("middle")} autoComplete="additional-name" /></label>
      <label><span className="lbl">Surname</span><input className="inp" value={f.last} onChange={set("last")} autoComplete="family-name" required /></label>
      <label><span className="lbl">Suffix <span className="faint">(optional)</span></span>
        <select className="inp" value={f.suffix} onChange={set("suffix")}>
          {SUFFIXES.map((s) => <option key={s} value={s}>{s || "None"}</option>)}
        </select>
      </label>
      <label><span className="lbl">Student number</span><input className="inp mono" value={f.studentId} onChange={set("studentId")} placeholder="2024-12345" inputMode="numeric" required /></label>
      <label><span className="lbl">Section</span><input className="inp" value={f.section} onChange={set("section")} placeholder="BSCS 3-4" required /></label>
    </div>
  );
}

function AuthForm() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [code, setCode] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [f, setF] = useState(EMPTY_STUDENT);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const creating = mode === "signup";
  const switchTo = (m) => { setMode(m); setError(""); setNotice(""); setCode(""); };

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setNotice("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("Enter a valid email address."); return; }
    if (password.length < 8) { setError("Password should be at least 8 characters."); return; }
    if (creating) {
      if (!f.first.trim() || !f.last.trim()) { setError("Enter your given name and surname."); return; }
      if (!/^\d{4}\s*-?\s*\d{5}$/.test(f.studentId.trim())) { setError("Student number should look like 2024-12345."); return; }
      if (!f.section.trim()) { setError("Enter your section."); return; }
      pendingStudent.set(email.trim(), f);
    }
    setBusy(true);
    try {
      // On success the session changes and this page shows the profile
      if (!creating) await passwordSignIn(email.trim(), password);
      else if (await passwordSignUp(email.trim(), password)) switchTo("verify");
    } catch (err) {
      if (err.unconfirmed) {
        switchTo("verify");
        try { await resendEmailCode(email.trim()); } catch { /* the earlier code may still work */ }
      } else setError(err.message);
    }
    setBusy(false);
  };

  const verify = async (e) => {
    e.preventDefault();
    setError(""); setNotice("");
    if (!/^\d{6,10}$/.test(code.trim())) { setError("Enter the code from the email."); return; }
    setBusy(true);
    try { await verifyEmailCode(email.trim(), code.trim()); } catch (err) { setError(err.message); }
    setBusy(false);
  };

  const resend = async () => {
    setError(""); setNotice("");
    try { await resendEmailCode(email.trim()); setNotice("New code sent."); } catch (err) { setError(err.message); }
  };

  if (mode === "verify") {
    return (
      <AuthCard>
        <form onSubmit={verify} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col items-center gap-2" style={{ textAlign: "center" }}>
            <span className="authicon"><Mail size={24} /></span>
            <h1 className="panel-title">Check your email</h1>
            <p className="muted text-sm">
              We sent a code to <strong style={{ color: "var(--text)", overflowWrap: "anywhere" }}>{email.trim()}</strong>.
              Enter it below to confirm it's yours. If you don't see it, check your spam folder.
            </p>
          </div>
          <input className="inp mono" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} inputMode="numeric"
            aria-label="Code from the email" autoComplete="one-time-code" maxLength={10} placeholder="••••••" autoFocus required
            style={{ fontSize: "1.6rem", letterSpacing: ".4em", textAlign: "center", padding: ".7rem" }} />
          {error && <ErrorBox message={error} />}
          {notice && <p className="text-sm" style={{ color: "var(--ok)", fontWeight: 600, textAlign: "center" }}>{notice}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy} style={{ padding: ".75rem 1rem" }}>
            {busy ? "Checking…" : "Confirm email"}
          </button>
          <div className="flex justify-center gap-2 flex-wrap">
            <button type="button" className="btn btn-ghost btn-sm" onClick={resend}>Send a new code</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => switchTo("signup")}>Use a different email</button>
          </div>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard wide={creating}>
      <div className="flex flex-col items-center gap-2" style={{ textAlign: "center" }}>
        <span className="authicon"><Mark /></span>
        <h1 className="panel-title">{creating ? "Create your account" : "Welcome back"}</h1>
        <p className="muted text-sm" style={{ maxWidth: 400 }}>{creating
          ? "Enter your student details once. After you confirm your email, scan your face and you're set for every event."
          : "Sign in to register for events in one tap."}</p>
      </div>

      <div className="seg" role="group" aria-label="Account" style={{ display: "flex" }}>
        <button type="button" aria-pressed={!creating} style={{ flex: 1, padding: ".5rem" }} onClick={() => switchTo("signin")}>Sign in</button>
        <button type="button" aria-pressed={creating} style={{ flex: 1, padding: ".5rem" }} onClick={() => switchTo("signup")}>Create account</button>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {creating && (
          <>
            <div className="authsec">Student details</div>
            <StudentFields f={f} set={set} />
            <div className="authsec">Account</div>
          </>
        )}
        <label><span className="lbl">Email</span>
          <input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
            placeholder="you@gmail.com" required />
        </label>
        <label><span className="lbl">Password {creating && <span className="faint">(at least 8 characters)</span>}</span>
          <span style={{ position: "relative", display: "block" }}>
            <input className="inp" type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete={creating ? "new-password" : "current-password"} required style={{ paddingRight: "2.8rem" }} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowPw((x) => !x)}
              aria-label={showPw ? "Hide password" : "Show password"}
              style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", padding: ".3rem .45rem" }}>
              {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </span>
        </label>
        {error && <ErrorBox message={error} />}
        {notice && <p className="text-sm" style={{ color: "var(--ok)", fontWeight: 600 }}>{notice}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy} style={{ padding: ".75rem 1rem" }}>
          {busy ? "Please wait…" : creating ? "Create account" : "Sign in"}
        </button>
      </form>

      <div className="flex items-center gap-3 faint text-sm">
        <span style={{ flex: 1, height: 1, background: "var(--line)" }} />or<span style={{ flex: 1, height: 1, background: "var(--line)" }} />
      </div>
      <button type="button" className="btn" onClick={signIn} style={{ padding: ".7rem 1rem" }}>
        <GoogleG /> Continue with Google
      </button>
      <p className="text-xs faint" style={{ textAlign: "center" }}>Organization and admin accounts sign in with Google.</p>
    </AuthCard>
  );
}

function AuthCard({ wide, children }) {
  return (
    <div className="panel flex flex-col gap-5" style={{ maxWidth: wide ? 640 : 440, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <style>{`
        .authicon{width:52px;height:52px;border-radius:14px;display:flex;align-items:center;justify-content:center;
          background:var(--accent-soft);color:var(--accent)}
        .authsec{font-weight:700;font-size:.95rem;padding-bottom:.35rem;border-bottom:1px solid var(--line)}
      `}</style>
      {children}
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function ProfileForm({ me, onSaved }) {
  const p = me.profile;
  const [f, setF] = useState(() => {
    if (p) return { first: p.first, middle: p.middle, last: p.last, suffix: p.suffix, studentId: p.studentId, section: p.section };
    return pendingStudent.get(me.email) || EMPTY_STUDENT;
  });
  const fromSignUp = !p && Boolean(pendingStudent.get(me.email));
  const [faceDescriptor, setFaceDescriptor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const set = (k) => (e) => { setDone(false); setF((x) => ({ ...x, [k]: e.target.value })); };
  const hasFace = Boolean(faceDescriptor || (p && p.hasFace));
  const preview = useMemo(() => {
    const s = { first: tidyName(f.first), last: tidyName(f.last), middle: tidyInitial(f.middle), suffix: f.suffix };
    return s.first && s.last ? formatName(s) : "";
  }, [f]);

  const submit = async (e) => {
    e.preventDefault();
    if (!hasFace) { setError("Please complete the facial scan before saving."); return; }
    setBusy(true); setError(""); setDone(false);
    try {
      await api.saveProfile({ ...f, faceDescriptor });
      pendingStudent.clear();
      setFaceDescriptor(null);
      setDone(true);
      onSaved();
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="panel p-5 flex flex-col gap-4" noValidate>
      <div>
        <h1 className="panel-title">{p ? "Your student profile" : fromSignUp ? "Almost done: scan your face" : "Set up your student profile"}</h1>
        <p className="muted text-sm">{fromSignUp
          ? "Your email is confirmed. Check your details, scan your face, and save."
          : "Fill this in once. SELAE uses it every time you register for an event."}</p>
      </div>
      <StudentFields f={f} set={set} />

      <FaceCapture value={faceDescriptor} onChange={(d) => { setDone(false); setFaceDescriptor(d); }} onError={setError} saved={Boolean(p && p.hasFace)} />

      {preview && <p className="text-sm muted">Guest lists will show you as <strong style={{ color: "var(--text)" }}>{preview}</strong></p>}
      {error && <ErrorBox message={error} />}
      {done && <p className="text-sm" style={{ color: "var(--ok)", fontWeight: 600 }}>Saved.</p>}
      <button className="btn btn-primary" type="submit" disabled={busy || !hasFace} style={{ padding: ".75rem 1rem", fontSize: "1.1rem" }}>
        {busy ? "Saving…" : "Save profile"}
      </button>
    </form>
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

const NOTIF_ICON = {
  promoted: CheckCircle2, registered: Ticket, waitlist: Clock, soon: PlaneTakeoff, checkin: CheckCircle2, photos: Images,
  registrations: Users, photosPrompt: ImagePlus, newEvent: Megaphone,
};
const notifTarget = (n) => {
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

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [lastSeen, setLastSeen] = useState(seen.get());
  const box = useRef(null);
  const load = useCallback(() => api.notifications().then(setData).catch(() => {}), []);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);
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
    if (next) { load(); if (data) { seen.mark(data.now); } }
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

/* ---------------- shared bits ---------------- */
function usePolled(load, deps, ms) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const run = () => load().then((d) => { if (alive) { setData(d); setError(""); } }).catch((e) => { if (alive) setError(e.message); });
    run();
    const t = ms ? setInterval(run, ms) : 0;
    return () => { alive = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return [data, error, setData];
}

function Loading() {
  return <div className="flex justify-center py-16"><div className="spin" aria-label="Loading" /></div>;
}
export function ErrorBox({ message }) {
  return <div className="alert err" role="alert">{message}</div>;
}

const isLive = (e, now = Date.now()) => now >= new Date(e.startsAt).getTime() - 3600000 && now <= new Date(e.endsAt).getTime();
const seatsText = (e) => (e.isPast ? `${e.counts.going} went` : e.spotsLeft > 0 ? `${e.spotsLeft} seats left` : "Full · waitlist open");

function TicketPill({ ticket }) {
  if (!ticket) return null;
  if (ticket.checkin) return <span className="pill going"><CheckCircle2 size={12} /> Checked in</span>;
  if (ticket.status === "going") return <span className="pill going">Going</span>;
  if (ticket.status === "waitlist") return <span className="pill waitlist">Waitlist</span>;
  return <span className="pill cancelled">Cancelled</span>;
}

export function EventPass({ e, ticket, onOpen, active }) {
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
              {e.canManage && <span className="pill host">Hosting</span>}
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

/* ---------------- your events ---------------- */
function useTickets() {
  const saved = myTickets.all();
  const [tickets] = usePolled(
    () => Promise.all(saved.map((t) => api.ticket(t.code).catch(() => null))),
    [saved.map((t) => t.code).join()], 15000,
  );
  return useMemo(() => {
    const byEvent = new Map();
    for (const t of tickets || []) if (t && t.event && (!byEvent.has(t.event.id) || t.status !== "cancelled")) byEvent.set(t.event.id, t);
    return byEvent;
  }, [tickets]);
}

export function EventsHome({ drawerId }) {
  const [events, error] = usePolled(() => api.events(), [], 10000);
  const tickets = useTickets();
  const [tab, setTab] = useState("upcoming");
  const mine = (events || []).filter((e) => e.canManage || tickets.has(e.id));
  const list = mine.filter((e) => (tab === "upcoming" ? !e.isPast : e.isPast));
  const going = list.filter((e) => tickets.has(e.id) && tickets.get(e.id).status !== "cancelled");
  const hosting = list.filter((e) => e.canManage && !going.includes(e));
  const open = (id) => go(`events/${id}`);

  const Section = ({ title, note, items }) => items.length > 0 && (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="panel-title" style={{ fontSize: "1.6rem" }}>{title}</h2>
        <span className="tag">{note}</span>
      </div>
      <div className="flex flex-col gap-3">
        {items.map((e) => <EventPass key={e.id} e={e} ticket={tickets.get(e.id)} active={drawerId === e.id} onOpen={() => open(e.id)} />)}
      </div>
    </section>
  );

  return (
    <>
      <div className="wrap py-8 flex flex-col gap-8" style={{ maxWidth: 880 }}>
        <div className="page-head">
          <div>
            <div className="tag mb-2">Your itinerary</div>
            <h1 className="page-title">Events</h1>
          </div>
          <div className="seg" role="group" aria-label="Show">
            {[["upcoming", "Upcoming"], ["past", "Past"]].map(([k, l]) => (
              <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
        </div>
        {error && <ErrorBox message={error} />}
        {!events && !error && <Loading />}
        {events && (
          <>
            <Section title="Your tickets" note={`${going.length} ${tab === "upcoming" ? "upcoming" : "past"}`} items={going} />
            <Section title="Hosting" note="Managed from this device" items={hosting} />
            {!going.length && !hosting.length && <EmptyItinerary past={tab === "past"} />}
          </>
        )}
      </div>
      {drawerId && <EventDrawer id={drawerId} onClose={() => go("")} />}
    </>
  );
}

function EmptyItinerary({ past }) {
  return (
    <div className="pass-wrap">
      <div className="pass" style={{ overflow: "hidden" }}>
        <div className="sky" style={{ padding: "2rem 1.5rem", minHeight: 170 }}>
          <Trails seed="empty" />
          <div className="relative">
            <div className="tag" style={{ color: "rgba(255,255,255,.8)" }}>{past ? "No past trips" : "No boarding passes yet"}</div>
            <div className="display" style={{ fontSize: "2.4rem", marginTop: ".35rem", textTransform: "uppercase" }}>
              {past ? "Nothing here yet" : "Where to next?"}
            </div>
          </div>
        </div>
        <div className="tear" />
        <div className="p-5 flex flex-wrap items-center justify-between gap-3">
          <p className="muted" style={{ maxWidth: "46ch" }}>
            {past ? "Events you registered for or hosted on this device appear here once they end."
              : "Events you register for on this device, and events you host, show up here."}
          </p>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={() => go("discover")}><Compass size={17} /> Discover events</button>
            <button className="btn" onClick={() => go("create")}><Plus size={17} /> Host one</button>
          </div>
        </div>
      </div>
    </div>
  );
}

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
              <input className="input" placeholder="Search events, hosts or venues" value={q} onChange={(e) => setQ(e.target.value)}
                style={{ border: 0, boxShadow: "0 12px 30px -12px rgba(20,27,58,.45)" }} />
            </label>
          </div>
          <DepartureBoard events={upcoming.slice(0, 5)} onOpen={open} />
        </div>
      </section>

      <div className="wrap py-8 flex flex-col gap-10" style={{ maxWidth: 1240 }}>
        {error && <ErrorBox message={error} />}
        {!events && !error && <Loading />}

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
                const following = follows.has(c.name);
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
                        onClick={() => { follows.toggle(c.name); bump((x) => x + 1); }}>
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
            {results.map((e) => <EventPass key={e.id} e={e} ticket={tickets.get(e.id)} active={drawerId === e.id} onOpen={() => open(e.id)} />)}
          </div>
          {events && !results.length && (
            <div className="panel p-6 text-center flex flex-col items-center gap-3">
              <p className="muted">No upcoming events match. Try another category, or host one yourself.</p>
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
      {drawerId && <EventDrawer id={drawerId} onClose={() => go("discover")} />}
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
          {!event && !error && <Loading />}
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

/* ---------------- photos ---------------- */
export function Lightbox({ photos, index, onIndex, onClose }) {
  useEffect(() => {
    const key = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndex((index + 1) % photos.length);
      if (e.key === "ArrowLeft") onIndex((index - 1 + photos.length) % photos.length);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [index, photos.length, onIndex, onClose]);
  const p = photos[index];
  if (!p) return null;
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={`Photo ${index + 1} of ${photos.length}`} onClick={onClose}>
      <img src={p.url} alt="" onClick={(e) => e.stopPropagation()} />
      <button className="iconbtn" style={{ top: 16, right: 16 }} onClick={onClose} aria-label="Close"><X size={20} /></button>
      {photos.length > 1 && <>
        <button className="iconbtn" style={{ left: 16, top: "50%" }} onClick={(e) => { e.stopPropagation(); onIndex((index - 1 + photos.length) % photos.length); }} aria-label="Previous photo"><ChevronLeft size={22} /></button>
        <button className="iconbtn" style={{ right: 16, top: "50%" }} onClick={(e) => { e.stopPropagation(); onIndex((index + 1) % photos.length); }} aria-label="Next photo"><ChevronRight size={22} /></button>
      </>}
      <div className="tag" style={{ position: "absolute", bottom: 18, left: 0, right: 0, textAlign: "center", color: "rgba(255,255,255,.75)" }}>{index + 1} / {photos.length}</div>
    </div>
  );
}

/* ---------------- event page ---------------- */
export function EventPage({ id }) {
  const [event, error] = usePolled(() => api.event(id), [id], 8000);
  const saved = myTickets.forEvent(id);
  const [ticket] = usePolled(() => (saved ? api.ticket(saved.code) : Promise.resolve(null)), [id, saved && saved.code], 0);
  const [lightbox, setLightbox] = useState(-1);
  const active = ticket && ticket.status !== "cancelled";

  if (error && !event) return <div className="narrow py-8"><ErrorBox message={error} /></div>;
  if (!event) return <Loading />;
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

export const SUFFIXES = ["", "Jr.", "Sr.", "II", "III", "IV"];

// Face scan by webcam or selfie. `saved` means the profile already has a face.
export function FaceCapture({ value, onChange, onError, saved = false }) {
  const [faceStatus, setFaceStatus] = useState(saved ? "Face saved. Retake only if it stopped working at the gate." : "Required: scan your face for fast gate entry.");
  const [camOpen, setCamOpen] = useState(false);
  const [scanningFace, setScanningFace] = useState(false);
  const [camId, setCamId] = useState(null);
  const cam = useCamera(camOpen, camId);
  const fileInputRef = useRef(null);

  const captureFromVideo = async () => {
    if (!cam.videoRef.current) return;
    setScanningFace(true);
    onError("");
    try {
      const res = await extractFaceDescriptor(cam.videoRef.current);
      if (!res) {
        setFaceStatus("No face detected. Center your face in good lighting and try again.");
      } else {
        onChange(res.descriptor);
        setFaceStatus(`Face registered (${Math.round(res.score * 100)}% quality).`);
        setCamOpen(false);
      }
    } catch (err) {
      onError("Failed to process face: " + err.message);
    }
    setScanningFace(false);
  };

  const captureFromFile = async (file) => {
    if (!file) return;
    setScanningFace(true);
    onError("");
    setFaceStatus("Analyzing photo…");
    try {
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("Could not read image."));
        el.src = URL.createObjectURL(file);
      });
      const res = await extractFaceDescriptor(img);
      URL.revokeObjectURL(img.src);
      if (!res) {
        setFaceStatus("Couldn't detect a clear face in that photo. Try another selfie.");
      } else {
        onChange(res.descriptor);
        setFaceStatus(`Face registered (${Math.round(res.score * 100)}% quality).`);
      }
    } catch (err) {
      onError("Failed to process photo: " + err.message);
    }
    setScanningFace(false);
  };

  return (
    <div className="panel p-4 flex flex-col gap-3" style={{ background: "var(--raised)" }}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="lbl" style={{ marginBottom: 2 }}>Facial registration (Required)</div>
          <div className="text-sm" style={{ color: value || saved ? "var(--ok)" : "var(--muted)", fontWeight: value || saved ? 600 : 400 }}>
            {faceStatus}
          </div>
          <p className="text-xs muted" style={{ marginTop: 6 }}>
            By scanning, you agree that SELAE saves a face signature (a set of numbers made from your photo, not the photo itself)
            so this event's hosts can recognize you at the entrance. Your photo never leaves your device.
          </p>
        </div>

        {(value || saved) && <CheckCircle2 size={22} color="var(--ok)" />}
      </div>

      {camOpen && (
        <div className="flex flex-col gap-2">
          <div className="viewfinder" style={{ maxHeight: 280 }}>
            <video ref={cam.videoRef} autoPlay playsInline muted />
          </div>
          {cam.devices.length > 1 && (
            <select className="camselect" aria-label="Camera" value={camId || ""}
              onChange={(e) => setCamId(e.target.value || null)} style={{ maxWidth: "100%" }}>
              <option value="">Default camera</option>
              {cam.devices.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>
              ))}
            </select>
          )}

          {cam.state === "live" ? (
            <div className="flex gap-2">
              <button type="button" className="btn btn-primary btn-sm flex-1" disabled={scanningFace} onClick={captureFromVideo}>
                <Camera size={15} /> {scanningFace ? "Scanning…" : "Capture face"}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCamOpen(false)}>Cancel</button>
            </div>
          ) : (
            <p className="text-xs muted">
              {cam.state === "insecure"
                ? "Live camera requires localhost or HTTPS. Use the 'Take Selfie' button below instead."
                : "Waiting for camera permission…"}
            </p>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="user"
        hidden
        onChange={(e) => captureFromFile(e.target.files[0])}
      />

      {!camOpen && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm" disabled={scanningFace} onClick={() => setCamOpen(true)}>
            <Camera size={15} /> {value || saved ? "Retake via Webcam" : "Open Webcam"}
          </button>
          <button type="button" className="btn btn-sm" disabled={scanningFace} onClick={() => fileInputRef.current && fileInputRef.current.click()}>
            <Upload size={15} /> {scanningFace ? "Analyzing…" : value || saved ? "Retake Selfie (Phone)" : "Take Selfie (Phone / Upload)"}
          </button>
        </div>
      )}
    </div>
  );
}

// Where to go back to after signing in or finishing the profile
const RETURN = "selae.returnTo";
export const returnTo = {
  set() { try { localStorage.setItem(RETURN, window.location.hash.replace(/^#\/?/, "")); } catch { /* private mode */ } },
  get() { try { return localStorage.getItem(RETURN); } catch { return null; } },
  clear() { try { localStorage.removeItem(RETURN); } catch { /* private mode */ } },
};

function RegisterForm({ event }) {
  const { me } = useMe();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const full = event.spotsLeft <= 0;
  const toProfile = () => { returnTo.set(); go("profile"); };

  const heading = (
    <div>
      <h2 id="reg-h" className="panel-title">{full ? "Join the waitlist" : "Get your pass"}</h2>
      <p className="muted text-sm">
        {full ? "This event is full. When spots open up, people move to going in waitlist order."
          : `${event.spotsLeft} of ${event.capacity} seats left.`}
      </p>
    </div>
  );

  if (me === undefined) return <div className="flex flex-col gap-4">{heading}<p className="muted text-sm">Loading…</p></div>;

  let blocker = null;
  if (!me) {
    blocker = { text: "Sign in to register. Your student details and face are saved once, so it takes one tap.", action: "Sign in", icon: LogIn };
  } else if (me.role !== "student") {
    blocker = { text: "Organization and admin accounts can't register for events. Sign in with a student account." };
  } else if (!me.profile || !me.profile.hasFace) {
    blocker = { text: me.profile ? "Scan your face in your profile to finish setting it up, then come back here."
      : "Set up your student profile first: your student number, name, section, and face.", action: "Finish my profile", icon: UserPlus };
  }
  if (blocker) {
    return (
      <div className="flex flex-col gap-4">
        {heading}
        <p className="text-sm">{blocker.text}</p>
        {blocker.action && <button className="btn btn-primary" onClick={toProfile}><blocker.icon size={17} /> {blocker.action}</button>}
      </div>
    );
  }

  const p = me.profile;
  const submit = async () => {
    setBusy(true); setError("");
    try {
      const out = await api.register(event.id);
      go(`t/${out.ticket.code}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {heading}
      <div className="panel p-4 flex flex-col gap-1" style={{ background: "var(--raised)" }}>
        <div className="lbl" style={{ marginBottom: 2 }}>Registering as</div>
        <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>{formatName(p)}</div>
        <div className="muted text-sm mono">{p.studentId} · {p.section}</div>
        <div className="text-sm flex items-center gap-1" style={{ color: "var(--ok)", fontWeight: 600, marginTop: 4 }}>
          <CheckCircle2 size={15} /> Face saved for fast entry
        </div>
      </div>
      {error && <ErrorBox message={error} />}
      <button className="btn btn-primary" onClick={submit} disabled={busy} style={{ padding: ".75rem 1rem", fontSize: "1.15rem" }}>
        {busy ? "Registering…" : full ? "Join the waitlist" : "Register"}
      </button>
      <p className="text-xs faint">
        Not right? <button type="button" className="toplink" style={{ display: "inline", padding: 0, height: "auto", fontSize: "inherit" }} onClick={toProfile}>Edit your profile</button>
      </p>
    </div>
  );
}

/* ---------------- ticket: a boarding pass ---------------- */
const prettyCode = (c) => `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`;

export function TicketPage({ code }) {
  const [ticket, error, setTicket] = usePolled(() => api.ticket(code), [code], 4000);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => { if (ticket && ticket.event) myTickets.add(code, ticket.event.id); }, [ticket, code]);

  if (error && !ticket) return <div className="narrow py-8"><ErrorBox message={error} /></div>;
  if (!ticket) return <Loading />;
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

/* ---------------- create / edit ---------------- */
const pad = (n) => String(n).padStart(2, "0");
const toLocalInput = (d) => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export function CoverPicker({ event, eventId, onChange, preview, onPick }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef(null);
  const shown = preview !== undefined ? { ...event, coverImage: preview } : event;
  const choose = async (file) => {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const blob = await prepareImage(file, { max: 1600 });
      if (eventId) { await api.uploadCover(eventId, blob); onChange && (await onChange()); } else onPick(blob);
    } catch (e) { setError(e.message); }
    setBusy(false);
    if (input.current) input.current.value = "";
  };
  const remove = async () => {
    setBusy(true); setError("");
    try { if (eventId) { await api.removeCover(eventId); onChange && (await onChange()); } else onPick(null); } catch (e) { setError(e.message); }
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-2">
      <div style={{ position: "relative" }}>
        <Cover event={shown} />
        {busy && <div className="flex items-center justify-center" style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,.6)", borderRadius: 14 }}><div className="spin" /></div>}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic" hidden onChange={(e) => choose(e.target.files[0])} />
      <div className="flex gap-2">
        <button type="button" className="btn btn-sm flex-1" disabled={busy} onClick={() => input.current && input.current.click()}>
          <Upload size={15} /> {shown.coverImage ? "Replace photo" : "Upload photo"}
        </button>
        {shown.coverImage && <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={remove} aria-label="Remove cover photo"><Trash2 size={15} /></button>}
      </div>
      {error && <p className="text-sm" style={{ color: "var(--bad)" }}>{error}</p>}
      {!shown.coverImage && <p className="text-xs faint">No photo? The sky color below is used as the cover.</p>}
    </div>
  );
}

export function EventForm({ initial, submitLabel, onSubmit, showRegistrationToggle = false, eventId, onCoverChange, orgs }) {
  const defaults = useMemo(() => {
    const s = new Date(); s.setDate(s.getDate() + 1); s.setHours(13, 0, 0, 0);
    const e = new Date(s.getTime() + 2 * 3600000);
    return { title: "", hostName: "", orgId: orgs && orgs.length === 1 ? orgs[0].id : "", venue: "", capacity: 100, description: "", color: "gold", visibility: "public", category: "Workshop",
      registrationOpen: true, startsAt: toLocalInput(s), endsAt: toLocalInput(e) };
  }, []);
  const [f, setF] = useState(() => (initial
    ? { ...defaults, ...initial, startsAt: toLocalInput(initial.startsAt), endsAt: toLocalInput(initial.endsAt) }
    : defaults));
  const [cover, setCover] = useState(null);
  const coverUrl = useMemo(() => (cover ? URL.createObjectURL(cover) : null), [cover]);
  useEffect(() => () => coverUrl && URL.revokeObjectURL(coverUrl), [coverUrl]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const set = (k) => (e) => { setSaved(false); setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value })); };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(""); setSaved(false);
    const starts = new Date(f.startsAt), ends = new Date(f.endsAt);
    if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) { setError("Pick a start and end time."); setBusy(false); return; }
    try {
      await onSubmit({
        title: f.title, ...(orgs ? { orgId: f.orgId } : initial && initial.org ? {} : { hostName: f.hostName }), venue: f.venue, description: f.description, color: f.color, visibility: f.visibility,
        category: f.category, capacity: Number(f.capacity), startsAt: starts.toISOString(), endsAt: ends.toISOString(),
        ...(showRegistrationToggle ? { registrationOpen: f.registrationOpen } : {}),
      }, cover);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  const previewEvent = { id: (initial && initial.id) || "new", title: f.title || "Event name", color: f.color, coverImage: initial && initial.coverImage };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-6 items-start">
        <div className="flex flex-col gap-3">
          <div className="lbl" style={{ marginBottom: 0 }}>Cover photo</div>
          {eventId
            ? <CoverPicker event={previewEvent} eventId={eventId} onChange={onCoverChange} />
            : <CoverPicker event={previewEvent} preview={coverUrl} onPick={setCover} />}
          <div className="lbl" style={{ marginBottom: 0, marginTop: ".4rem" }}>Sky color</div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Cover color">
            {Object.keys(COLORS).map((k) => (
              <button key={k} type="button" className="swatch" aria-label={COLOR_NAMES[k]} title={COLOR_NAMES[k]} aria-pressed={f.color === k}
                style={{ background: skyOf(k) }} onClick={() => { setSaved(false); setF((x) => ({ ...x, color: k })); }} />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <label><span className="lbl">Event name</span>
            <input className="inp" style={{ fontSize: "1.35rem", fontFamily: "var(--f-display)", fontWeight: 700 }} value={f.title} onChange={set("title")} placeholder="GDG Study Jam: Intro to Flutter" required /></label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label><span className="lbl">Hosted by</span>
              {orgs ? (
                <select className="inp" value={f.orgId} onChange={set("orgId")} required>
                  {orgs.length > 1 && <option value="">Choose an organization</option>}
                  {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              ) : initial && initial.org ? (
                <input className="inp" value={initial.org.name} disabled title="Events stay with the organization that hosts them" />
              ) : (
                <input className="inp" value={f.hostName} onChange={set("hostName")} placeholder="Your org's name" />
              )}
            </label>
            <label><span className="lbl">Category</span>
              <select className="inp" value={f.category} onChange={set("category")}>
                {CATEGORIES.map(([k]) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label><span className="lbl">Starts</span><input className="inp" type="datetime-local" value={f.startsAt} onChange={set("startsAt")} required /></label>
            <label><span className="lbl">Ends</span><input className="inp" type="datetime-local" value={f.endsAt} onChange={set("endsAt")} required /></label>
          </div>
          <label><span className="lbl">Venue</span><input className="inp" value={f.venue} onChange={set("venue")} placeholder="GV Room 301" required /></label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label><span className="lbl">Capacity</span><input className="inp" type="number" min="1" max="100000" value={f.capacity} onChange={set("capacity")} required /></label>
            <label><span className="lbl">Visibility</span>
              <select className="inp" value={f.visibility} onChange={set("visibility")}>
                <option value="public">Public: listed on Discover</option>
                <option value="unlisted">Unlisted: only people with the link</option>
              </select>
            </label>
          </div>
          <label><span className="lbl">Description <span className="faint">(optional)</span></span>
            <textarea className="inp" value={f.description} onChange={set("description")} placeholder="What should attendees know or bring?" /></label>
          {showRegistrationToggle && (
            <label className="flex items-center gap-3 font-semibold">
              <input type="checkbox" checked={f.registrationOpen} onChange={set("registrationOpen")} style={{ width: 20, height: 20, accentColor: "var(--accent)" }} />
              Registration open
            </label>
          )}
        </div>
      </div>
      {error && <ErrorBox message={error} />}
      {saved && showRegistrationToggle && <div className="alert ok" role="status">Saved.</div>}
      <button className="btn btn-primary self-start" type="submit" disabled={busy}>{busy ? "Saving…" : submitLabel}</button>
    </form>
  );
}

export function CreateEvent() {
  const { me } = useMe();
  if (me === undefined) return <div className="narrow py-10 muted">Loading…</div>;
  const orgs = me ? me.hostsFor || [] : [];
  if (!orgs.length) {
    return (
      <div className="narrow py-10">
        <div className="panel p-6 flex flex-col gap-3">
          <h1 className="panel-title">Events are hosted by organizations</h1>
          <p className="muted">
            {!me ? "Sign in with your organization's account, or as an officer, to create an event."
              : "Only organization accounts and their officers can create events. Ask your organization to invite you as an officer."}
          </p>
          {!me && <div><button className="btn btn-primary" onClick={() => go("profile")}><LogIn size={17} /> Sign in</button></div>}
        </div>
      </div>
    );
  }
  return (
    <div className="wrap py-8 flex flex-col gap-6" style={{ maxWidth: 920 }}>
      <div>
        <div className="tag mb-2">New departure</div>
        <h1 className="page-title">Create event</h1>
        <p className="muted mt-3" style={{ maxWidth: "62ch" }}>You'll get a registration page to share and a scanner for check-in. Your organization's account and officers can manage it from any device.</p>
      </div>
      <div className="panel p-5 md:p-6">
        <EventForm orgs={orgs} submitLabel="Create event" onSubmit={async (fields, cover) => {
          const e = await api.create(fields);
          if (cover) { try { await api.uploadCover(e.id, cover); } catch {/* ignore */} }
          go(`m/${e.id}`);
        }} />
      </div>
    </div>
  );
}
