import { useState } from "react";
import { Building2 } from "lucide-react";
import { ErrorBox } from "../../components/ui.jsx";
import { api } from "../../lib/api.js";

// On a student's profile: invitations to answer, as an officer or a member
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
      <h2 className="panel-title">Organization invitations</h2>
      {me.invites.map((inv) => (
        <div key={inv.id} className="flex items-center gap-3 flex-wrap">
          <span style={{ width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
            background: "var(--accent-soft)", color: "var(--accent)", flexShrink: 0 }}><Building2 size={18} /></span>
          <div className="flex-1" style={{ minWidth: 160 }}>
            <strong>{inv.org.name}</strong> <span className="muted">{inv.role === "member" ? "invited you to be a member." : `invited you to be an officer${inv.position ? ` (${inv.position})` : ""}.`}</span>
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
