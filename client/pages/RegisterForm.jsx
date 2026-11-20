import { useState } from "react";
import { CheckCircle2, LogIn, UserPlus } from "lucide-react";
import { formatName, go } from "../components/shared.jsx";
import { ErrorBox, Sk } from "../components/ui.jsx";
import { returnTo, useMe } from "../lib/account.js";
import { api } from "../lib/api.js";

export function RegisterForm({ event }) {
  const { me, reload } = useMe();
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

  if (me === undefined) {
    return (
      <div className="flex flex-col gap-4" role="status" aria-busy="true" aria-label="Loading">
        {heading}
        <div className="flex flex-col gap-2 p-4" style={{ background: "var(--raised)", borderRadius: 14 }}><Sk w={90} h={10} /><Sk w="60%" h={20} /><Sk w="45%" h={12} /></div>
        <Sk h={50} r={10} />
      </div>
    );
  }

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
      // The account now has this ticket, so Discover and the event page show it
      await reload();
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
