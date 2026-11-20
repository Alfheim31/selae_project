import { useEffect, useState } from "react";
import { Clock3, Search, ShieldCheck, UserPlus, UserRound, Users, X } from "lucide-react";
import { ErrorBox, Sk } from "../../components/ui.jsx";
import { toast } from "../../components/shared.jsx";
import { api } from "../../lib/api.js";
import { askConfirm } from "../../components/ConfirmDialog.jsx";
import { ORGS_CSS, skyFor } from "./OrgsPanel.jsx";

/* Organization account: its officers, laid out like the superadmin's Organizations
   (heading with the main button, filters and search, stats, then a card for each person) */

const FILTERS = [["all", "All"], ["active", "Officers"], ["invited", "Invited"]];
const OFFICERS_CSS = `
.offacts{display:grid;grid-template-columns:minmax(0,1fr);border-top:1px solid var(--line)}
.offacts .btn{border-radius:0;padding:.65rem .5rem;font-size:.82rem;letter-spacing:.02em;justify-content:center}
`;

const dateText = (iso) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

export function OfficersPanel() {
  const [members, setMembers] = useState(null);
  const [error, setError] = useState("");
  const [kind, setKind] = useState("all");
  const [q, setQ] = useState("");
  const [inviting, setInviting] = useState(false);

  const load = async () => {
    try { setMembers((await api.orgMembers()).members); } catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, []);

  const remove = async (m) => {
    const who = m.name || m.email;
    const ok = await askConfirm(m.status === "active"
      ? { title: "Remove this officer?", confirm: "Yes, remove", cancel: "Keep officer", danger: true,
          message: `Are you sure you want to remove ${who} as an officer? They can't create or manage this organization's events anymore. They keep their student account, and you can invite them again later.` }
      : { title: "Cancel this invitation?", confirm: "Yes, cancel it", cancel: "Keep invitation", danger: true,
          message: `Are you sure you want to cancel the invitation to ${who}? It disappears from their profile. You can invite them again later.` });
    if (!ok) return;
    setError("");
    try {
      await api.removeOfficer(m.id);
      await load();
      toast(m.status === "active" ? `${who} is no longer an officer.` : "Invitation cancelled.");
    } catch (err) { setError(err.message); }
  };

  const all = members || [];
  const active = all.filter((m) => m.status === "active");
  const invited = all.filter((m) => m.status === "invited");
  const term = q.trim().toLowerCase();
  // Officers first, then invitations; each by name (or email)
  const shown = all
    .filter((m) => (kind === "all" || m.status === kind) && (!term || `${m.name || ""} ${m.email} ${m.section || ""}`.toLowerCase().includes(term)))
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "active" ? -1 : 1) || (a.name || a.email).localeCompare(b.name || b.email));
  const countOf = (k) => (k === "all" ? all.length : all.filter((m) => m.status === k).length);

  const stats = [
    ["Officers", active.length, ShieldCheck, "#E2F4EA", "#14794B"],
    ["Waiting to accept", invited.length, Clock3, "#FDF0DE", "#9A5A0B"],
    ["Everyone", all.length, Users, "var(--accent-soft)", "var(--accent)"],
  ];

  return (
    <div className="flex flex-col gap-5">
      <style>{ORGS_CSS + OFFICERS_CSS}</style>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="tag">Organization</div>
          <h2 className="panel-title" style={{ fontSize: "1.9rem", marginTop: 2 }}>Officers</h2>
          <p className="muted text-sm" style={{ maxWidth: "62ch", marginTop: 4 }}>
            Officers can create and manage this organization's events. Invite them with the email of their SELAE account;
            they accept from their profile.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setInviting(true)}><UserPlus size={17} /> Invite officer</button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3" style={{ marginTop: -6 }}>
        <div className="orgchips" role="group" aria-label="Show" style={{ justifyContent: "flex-start" }}>
          {FILTERS.map(([k, label]) => (
            <button key={k} className="orgchip" aria-pressed={kind === k} onClick={() => setKind(k)}>
              {label} <span className="c">{members ? countOf(k) : "·"}</span>
            </button>
          ))}
        </div>
        {all.length > 0 && (
          <label className="field" style={{ width: "min(320px, 100%)" }}>
            <Search size={16} />
            <input className="input" placeholder="Search name, email or section" value={q} onChange={(e) => setQ(e.target.value)} maxLength={80} aria-label="Search officers" />
          </label>
        )}
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
        {stats.map(([label, n, Icon, bg, fg], i) => (
          // On a phone the third one takes the whole row instead of sitting alone in a half
          <div key={label} className={`panel orgstat${i === 2 ? " col-span-2 lg:col-span-1" : ""}`}>
            <span className="ic" style={{ background: bg, color: fg }}><Icon size={20} /></span>
            <div>
              <div className="n">{members ? n : <Sk w={36} h={28} />}</div>
              <div className="tag" style={{ marginTop: 3 }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {inviting && <InviteOfficer onClose={() => setInviting(false)} onInvited={async (email) => { setInviting(false); await load(); toast(`Invitation sent to ${email}.`); }} />}
      {error && <ErrorBox message={error} />}

      <section className="flex flex-col gap-4" aria-label="Officers">
        {!members && !error && (
          <div className="orggrid" role="status" aria-busy="true" aria-label="Loading">
            {[0, 1, 2].map((i) => (
              <div key={i} className="orgcard">
                <Sk h={70} r={0} />
                <div className="flex flex-col items-center gap-2" style={{ padding: "0 1rem 1rem", marginTop: -32 }}>
                  <Sk w={64} h={64} r={16} style={{ border: "4px solid var(--surface)" }} /><Sk w="60%" h={16} /><Sk w="45%" h={11} />
                </div>
              </div>
            ))}
          </div>
        )}
        {members && !all.length && (
          <div className="panel flex flex-col items-center gap-2" style={{ padding: "2.5rem 1rem", textAlign: "center" }}>
            <span className="orgav" style={{ background: skyFor("officers") }}><Users size={24} /></span>
            <div style={{ fontWeight: 700 }}>No officers yet</div>
            <p className="muted text-sm">Use Invite officer to add the first one. They need a SELAE student account.</p>
          </div>
        )}
        {members && all.length > 0 && !shown.length && (
          <p className="muted text-sm" style={{ textAlign: "center" }}>
            {term ? `No one matches “${q.trim()}”.` : kind === "invited" ? "No invitations waiting." : "No officers yet."}
          </p>
        )}
        <div className="orggrid">
          {shown.map((m) => <OfficerCard key={m.id} m={m} onRemove={() => remove(m)} />)}
        </div>
      </section>
    </div>
  );
}

function OfficerCard({ m, onRemove }) {
  const pending = m.status === "invited";
  return (
    <article className="orgcard" style={{ opacity: pending ? 0.92 : 1 }}>
      <div className="band" style={{ background: skyFor(m.email), filter: pending ? "saturate(.55)" : "none" }}>
        <span className="tag">{pending ? "Invited" : "Officer"}</span>
      </div>
      <div className="flex flex-col items-center gap-1.5 flex-1" style={{ padding: "0 1rem 1rem", marginTop: -32, textAlign: "center" }}>
        {/* The same plain picture for everyone: officers don't upload one here */}
        <span className="orgav" aria-hidden="true" style={{ borderRadius: "50%", background: "#E4E9F7", color: "#8A97C4", textShadow: "none" }}>
          <UserRound size={34} strokeWidth={1.8} />
        </span>
        <div style={{ fontWeight: 700, fontSize: "1.08rem", marginTop: 4, overflowWrap: "anywhere" }}>{m.name || m.email}</div>
        {m.name && <div className="muted text-sm" style={{ overflowWrap: "anywhere" }}>{m.email}</div>}
        <span className="pill" style={pending ? { background: "#FDF0DE", color: "#9A5A0B" } : { background: "#E2F4EA", color: "#14794B" }}>
          {pending ? "Waiting to accept" : "Officer"}
        </span>
        <div className="orgmeta tag" style={{ marginTop: 4 }}>
          {m.section && <span><Users size={12} /> {m.section}</span>}
          {pending
            ? <span><Clock3 size={12} /> Invited {dateText(m.invitedAt)}</span>
            : (m.acceptedAt && <span><ShieldCheck size={12} /> Since {dateText(m.acceptedAt)}</span>)}
          {!m.name && !pending && <span>No student profile yet</span>}
        </div>
      </div>
      <div className="offacts">
        <button className="btn btn-ghost btn-sm" style={{ color: "var(--bad)" }} onClick={onRemove}>
          <X size={14} /> {pending ? "Cancel invitation" : "Remove officer"}
        </button>
      </div>
    </article>
  );
}

// Opened from the Invite officer button
function InviteOfficer({ onClose, onInvited }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [busy, onClose]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try { await api.inviteOfficer(email); onInvited(email.trim()); return; } catch (err) { setError(err.message); }
    setBusy(false);
  };

  return (
    <div className="modal-bg" onPointerDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <form onSubmit={submit} className="modal flex flex-col gap-3" role="dialog" aria-modal="true" aria-labelledby="invite-h" noValidate
        style={{ maxWidth: 480, padding: 0 }}>
        <div className="sky flex items-center gap-3" style={{ padding: "1rem 1.2rem" }}>
          <span style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(255,255,255,.22)", display: "flex", alignItems: "center",
            justifyContent: "center", flexShrink: 0 }}><UserPlus size={20} /></span>
          <div className="flex-1 min-w-0">
            <div id="invite-h" style={{ fontWeight: 700, fontSize: "1.05rem" }}>Invite an officer</div>
            <div className="text-sm" style={{ color: "rgba(255,255,255,.85)" }}>They'll see the invitation on their profile.</div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy} aria-label="Close" style={{ color: "#fff" }}><X size={18} /></button>
        </div>
        <div className="flex flex-col gap-3" style={{ padding: "0 1.2rem 1.2rem" }}>
          <label><span className="lbl">Student's email</span>
            <input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} placeholder="student@gmail.com" required autoFocus />
          </label>
          <p className="muted text-xs" style={{ marginTop: -4 }}>Use the email they sign in to SELAE with.</p>
          {error && <ErrorBox message={error} />}
          <div className="flex flex-wrap justify-end gap-2" style={{ marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn btn-primary" type="submit" disabled={busy || !email.trim()}>
              <UserPlus size={17} /> {busy ? "Inviting…" : "Send invitation"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
