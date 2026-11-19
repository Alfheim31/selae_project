import { useEffect, useState } from "react";
import { Mail, UserPlus, X } from "lucide-react";
import { ErrorBox, RowsSkeleton } from "../../components/ui.jsx";
import { api } from "../../lib/api.js";

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
        <input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} placeholder="student@gmail.com"
          aria-label="Student's email" style={{ flex: "1 1 220px" }} required />
        <button className="btn btn-primary" type="submit" disabled={busy || !email.trim()}><UserPlus size={17} /> {busy ? "Inviting…" : "Invite"}</button>
      </form>
      {error && <ErrorBox message={error} />}

      {members === null ? <RowsSkeleton rows={3} /> : (
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
