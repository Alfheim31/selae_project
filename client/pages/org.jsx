import { useEffect, useState } from "react";
import { UserPlus, X, Mail, Building2 } from "lucide-react";
import { api } from "../lib/api.js";
import { ErrorBox } from "./public.jsx";

/* Org account: invite and remove officers */

export function OfficersPanel() {
  const [members, setMembers] = useState(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    try { setMembers((await api.orgMembers()).members); } catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, []);

  const invite = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try { await api.inviteOfficer(email); setEmail(""); await load(); } catch (err) { setError(err.message); }
    setBusy(false);
  };
  const remove = async (m) => {
    const who = m.name || m.email;
    if (!confirm(m.status === "active" ? `Remove ${who} as officer? They keep their student account.` : `Cancel the invitation to ${who}?`)) return;
    setError("");
    try { await api.removeOfficer(m.id); await load(); } catch (err) { setError(err.message); }
  };

  const active = (members || []).filter((m) => m.status === "active");
  const invited = (members || []).filter((m) => m.status === "invited");

  return (
    <div className="panel p-5 flex flex-col gap-4">
      <div>
        <h2 className="panel-title">Officers</h2>
        <p className="muted text-sm">Officers can create and manage this organization's events. Invite them with the email of their SELAE account.</p>
      </div>

      <form onSubmit={invite} className="flex gap-2 flex-wrap" noValidate>
        <input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="student@gmail.com"
          aria-label="Student's email" style={{ flex: "1 1 220px" }} required />
        <button className="btn btn-primary" type="submit" disabled={busy || !email.trim()}><UserPlus size={17} /> {busy ? "Inviting…" : "Invite"}</button>
      </form>
      {error && <ErrorBox message={error} />}

      {members === null ? <p className="muted text-sm">Loading…</p> : (
        <>
          <MemberList title={`Officers · ${active.length}`} empty="No officers yet." list={active} onRemove={remove} />
          {invited.length > 0 && <MemberList title={`Waiting for them to accept · ${invited.length}`} list={invited} onRemove={remove} pending />}
        </>
      )}
    </div>
  );
}

function MemberList({ title, empty, list, onRemove, pending }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="lbl">{title}</div>
      {list.length === 0 && <p className="muted text-sm">{empty}</p>}
      {list.map((m) => (
        <div key={m.id} className="flex items-center gap-3" style={{ padding: ".55rem .7rem", border: "1px solid var(--line)", borderRadius: 10 }}>
          {pending && <Mail size={17} className="faint" />}
          <div className="min-w-0 flex-1">
            <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{m.name || m.email}</div>
            <div className="muted text-xs" style={{ overflowWrap: "anywhere" }}>
              {m.name ? `${m.email}${m.section ? ` · ${m.section}` : ""}` : pending ? "Invited" : "No student profile yet"}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => onRemove(m)}>
            {pending ? "Cancel" : <><X size={15} /> Remove</>}
          </button>
        </div>
      ))}
    </div>
  );
}

// On a student's profile: invitations to answer, and where they're an officer
export function InvitesPanel({ me, onChange }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  if (!me.invites.length) return null;

  const answer = async (id, choice) => {
    setBusy(id); setError("");
    try { await api.answerInvite(id, choice); onChange(); } catch (err) { setError(err.message); }
    setBusy(null);
  };

  return (
    <div className="panel p-5 flex flex-col gap-3" style={{ borderColor: "var(--accent)" }}>
      <h2 className="panel-title">Officer invitations</h2>
      {me.invites.map((inv) => (
        <div key={inv.id} className="flex items-center gap-3 flex-wrap">
          <span style={{ width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
            background: "var(--accent-soft)", color: "var(--accent)", flexShrink: 0 }}><Building2 size={18} /></span>
          <div className="flex-1" style={{ minWidth: 160 }}>
            <strong>{inv.org.name}</strong> <span className="muted">invited you to be an officer.</span>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm" disabled={busy === inv.id} onClick={() => answer(inv.id, "accept")}>Accept</button>
            <button className="btn btn-ghost btn-sm" disabled={busy === inv.id} onClick={() => answer(inv.id, "decline")}>Decline</button>
          </div>
        </div>
      ))}
      {error && <ErrorBox message={error} />}
    </div>
  );
}
