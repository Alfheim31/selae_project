import { useEffect, useState } from "react";
import {
  Ban, Building2, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Copy, KeyRound, MailCheck, Pencil, Plus, Power, Search,
  TriangleAlert, Users, X,
} from "lucide-react";
import { COLORS, skyOf } from "../../components/shared.jsx";
import { ErrorBox, Sk } from "../../components/ui.jsx";
import { api } from "../../lib/api.js";

/* Superadmin: add, filter, edit, and disable organizations */

const PAGE_SIZE = 9;

export const ORG_TYPES = [
  ["council", "Council"],
  ["academic", "Academic org"],
  ["nonacademic", "Non-academic org"],
  ["religious", "Religious org"],
];
const typeLabel = (t) => (ORG_TYPES.find(([k]) => k === t) || [null, "Uncategorized"])[1];
const FILTERS = [["all", "All"], ["council", "Council"], ["academic", "Academic"], ["nonacademic", "Non-academic"], ["religious", "Religious"]];

// Each org keeps one sky color, picked from its id
const skyFor = (id) => {
  const keys = Object.keys(COLORS);
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return skyOf(keys[h % keys.length]);
};

const initials = (name) => {
  const caps = name.split(/\s+/).filter((w) => /^[A-Z0-9]/.test(w)).map((w) => w[0]);
  return (caps.length >= 2 ? caps.slice(0, 2) : [name[0]]).join("").toUpperCase();
};

const ORGS_CSS = `
.orgstat{display:flex;align-items:center;gap:.8rem;padding:1rem 1.1rem}
.orgstat .ic{width:40px;height:40px;border-radius:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.orgstat .n{font-family:var(--f-display);font-weight:700;font-size:1.9rem;line-height:1}
.orggrid{display:grid;gap:1rem;grid-template-columns:repeat(auto-fill,minmax(270px,1fr))}
.orgcard{display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow:hidden;
  box-shadow:var(--shadow);transition:transform .15s ease,box-shadow .15s ease}
.orgcard:hover{transform:translateY(-2px);box-shadow:0 14px 30px -16px rgba(20,27,58,.35)}
.orgcard .band{height:70px;position:relative;background-size:cover;background-position:center}
.orgcard .band .tag{position:absolute;top:.7rem;left:.85rem;color:#fff;text-shadow:0 1px 6px rgba(20,27,58,.55)}
.orgav{position:relative;z-index:1;width:64px;height:64px;border-radius:16px;display:flex;align-items:center;justify-content:center;color:#fff;border:4px solid var(--surface);overflow:hidden;
  background-size:cover;background-position:center;
  font-family:var(--f-display);font-weight:700;font-size:1.5rem;text-shadow:0 1px 6px rgba(20,27,58,.35);box-shadow:0 6px 16px -8px rgba(20,27,58,.45)}
.orgmeta{display:flex;flex-wrap:wrap;justify-content:center;gap:.25rem .9rem}
.orgmeta span{display:inline-flex;align-items:center;gap:.3rem}
.orgchips{display:flex;flex-wrap:wrap;gap:.4rem;justify-content:center}
.orgchip{display:inline-flex;align-items:center;gap:.4rem;padding:.42rem .85rem;border-radius:999px;border:1px solid var(--line);background:var(--surface);
  font-weight:600;font-size:.88rem;color:var(--muted)}
.orgchip[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.orgchip .c{font-family:var(--f-mono);font-size:.72rem;opacity:.8}
`;

// Stats, add form, filters, and the cards
export function OrgsPanel() {
  const [orgs, setOrgs] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [page, setPage] = useState(0);
  const [notice, setNotice] = useState(null); // { org, credentials } after a password goes out
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    api.adminOrgs().then((r) => setOrgs(r.orgs)).catch((e) => setError(e.message));
  }, []);

  const sortByName = (list) => [...list].sort((a, b) => a.name.localeCompare(b.name));
  // Edits come back without the counts, so keep the ones we have
  const replace = (org) => setOrgs((list) => sortByName(list.map((o) => (o.id === org.id ? { ...o, ...org } : o))));
  const added = ({ org, credentials }) => {
    setOrgs((list) => sortByName([...(list || []), { events: 0, upcoming: 0, officers: 0, ...org }]));
    setQ(""); setKind("all");
    setNotice({ org, credentials });
  };

  const all = orgs || [];
  const term = q.trim().toLowerCase();
  const countOf = (k) => (k === "all" ? all.length : all.filter((o) => o.type === k).length);
  const shown = all.filter((o) => (kind === "all" || o.type === kind) && (!term || `${o.name} ${o.email}`.toLowerCase().includes(term)));
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const at = Math.min(page, pages - 1);
  const slice = shown.slice(at * PAGE_SIZE, (at + 1) * PAGE_SIZE);
  const active = all.filter((o) => !o.disabled).length;
  const upcoming = all.reduce((n, o) => n + (o.upcoming || 0), 0);

  const stats = [
    ["Organizations", all.length, Building2, "var(--accent-soft)", "var(--accent)"],
    ["Active", active, CheckCircle2, "#E2F4EA", "#14794B"],
    ["Disabled", all.length - active, Ban, "var(--raised)", "var(--muted)"],
    ["Upcoming events", upcoming, CalendarDays, "#FDF0DE", "#9A5A0B"],
  ];

  return (
    <div className="flex flex-col gap-5">
      <style>{ORGS_CSS}</style>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="tag">Admin console</div>
          <h2 className="panel-title" style={{ fontSize: "1.9rem", marginTop: 2 }}>Organizations</h2>
          <p className="muted text-sm" style={{ maxWidth: "62ch", marginTop: 4 }}>
            Adding an organization emails a temporary password to its official email. The first time they sign in,
            SELAE asks them to choose their own.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={17} /> Add organization</button>
      </div>

      {/* Filter by kind and search, right under the heading */}
      <div className="flex flex-wrap items-center justify-between gap-3" style={{ marginTop: -6 }}>
        <div className="orgchips" role="group" aria-label="Kind of organization" style={{ justifyContent: "flex-start" }}>
          {FILTERS.map(([k, label]) => (
            <button key={k} className="orgchip" aria-pressed={kind === k} onClick={() => { setKind(k); setPage(0); }}>
              {label} <span className="c">{orgs ? countOf(k) : "·"}</span>
            </button>
          ))}
        </div>
        {all.length > 0 && (
          <label className="field" style={{ width: "min(320px, 100%)" }}>
            <Search size={16} />
            <input className="input" placeholder="Search name or email" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} maxLength={80} aria-label="Search organizations" />
          </label>
        )}
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {stats.map(([label, n, Icon, bg, fg]) => (
          <div key={label} className="panel orgstat">
            <span className="ic" style={{ background: bg, color: fg }}><Icon size={20} /></span>
            <div>
              <div className="n">{orgs ? n : <Sk w={36} h={28} />}</div>
              <div className="tag" style={{ marginTop: 3 }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {adding && <NewOrg onAdded={(r) => { setAdding(false); added(r); }} onClose={() => setAdding(false)} />}

      {notice && <CredentialsNotice {...notice} onClose={() => setNotice(null)} />}
      {error && <ErrorBox message={error} />}

      <section className="flex flex-col gap-4" aria-label="All organizations">

        {!orgs && !error && (
          <div className="orggrid" role="status" aria-busy="true" aria-label="Loading">
            {[0, 1, 2].map((i) => (
              <div key={i} className="orgcard">
                <Sk h={70} r={0} />
                <div className="flex flex-col items-center gap-2" style={{ padding: "0 1rem 1rem", marginTop: -32 }}>
                  <Sk w={64} h={64} r={16} style={{ border: "4px solid var(--surface)" }} /><Sk w="60%" h={16} /><Sk w="45%" h={11} /><Sk w="70%" h={30} r={10} />
                </div>
              </div>
            ))}
          </div>
        )}
        {orgs && !all.length && (
          <div className="panel flex flex-col items-center gap-2" style={{ padding: "2.5rem 1rem", textAlign: "center" }}>
            <span className="orgav" style={{ background: skyFor("empty") }}><Building2 size={24} /></span>
            <div style={{ fontWeight: 700 }}>No organizations yet</div>
            <p className="muted text-sm">Use Add organization to add the first one. Its sign-in details go to its official email.</p>
          </div>
        )}
        {orgs && all.length > 0 && !shown.length && (
          <p className="muted text-sm" style={{ textAlign: "center" }}>No {kind === "all" ? "" : `${FILTERS.find(([k]) => k === kind)[1].toLowerCase()} `}organization{term ? ` matches “${q.trim()}”` : " yet"}.</p>
        )}

        <div className="orggrid">
          {slice.map((o) => <OrgCard key={o.id} org={o} onChange={replace} onCredentials={(credentials) => setNotice({ org: o, credentials })} />)}
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button className="btn btn-sm" disabled={at === 0} onClick={() => setPage(at - 1)}><ChevronLeft size={16} /> Previous</button>
            <span className="tag">Page {at + 1} of {pages}</span>
            <button className="btn btn-sm" disabled={at >= pages - 1} onClick={() => setPage(at + 1)}>Next <ChevronRight size={16} /></button>
          </div>
        )}
      </section>
    </div>
  );
}

// After a password goes out: sent, or shown once when the email couldn't be sent
function CredentialsNotice({ org, credentials, onClose }) {
  const [copied, setCopied] = useState(false);
  if (!credentials) return null;
  const copy = async () => { try { await navigator.clipboard.writeText(credentials.password); setCopied(true); } catch { /* select it by hand */ } };
  const sent = credentials.emailed;
  return (
    <div className="panel flex items-start gap-3" role="status"
      style={{ padding: "1rem 1.1rem", borderColor: sent ? "#A7DCC2" : "#F0C48A", background: sent ? "#F1FAF5" : "#FFF8EE" }}>
      <span style={{ color: sent ? "var(--ok)" : "#9A5A0B", marginTop: 2 }}>{sent ? <MailCheck size={20} /> : <TriangleAlert size={20} />}</span>
      <div className="flex-1 min-w-0 text-sm">
        {sent ? (
          <>Sent <strong>{org.name}</strong>'s sign-in details to <strong style={{ overflowWrap: "anywhere" }}>{org.email}</strong>. They'll choose their own password after signing in.</>
        ) : (
          <div className="flex flex-col gap-2">
            <div><strong>{org.name}</strong> was saved, but the email wasn't sent. {credentials.reason}</div>
            {credentials.password && (
              <>
                <div>Give them this temporary password yourself. It won't be shown again:</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="mono" style={{ fontSize: "1.15rem", letterSpacing: ".12em", padding: ".3rem .6rem", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8 }}>
                    {credentials.password}
                  </code>
                  <button className="btn btn-sm" onClick={copy}><Copy size={14} /> {copied ? "Copied" : "Copy"}</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Dismiss"><X size={16} /></button>
    </div>
  );
}

// Opened from the Add organization button
function NewOrg({ onAdded, onClose }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState("");
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
    try {
      onAdded(await api.createOrg({ name, email, type }));
      return;
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  return (
    <div className="modal-bg" onPointerDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <form onSubmit={submit} className="modal flex flex-col gap-3" role="dialog" aria-modal="true" aria-labelledby="neworg-h" noValidate
        style={{ maxWidth: 480, padding: 0 }}>
        <div className="sky flex items-center gap-3" style={{ padding: "1rem 1.2rem" }}>
          <span style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(255,255,255,.22)", display: "flex", alignItems: "center",
            justifyContent: "center", flexShrink: 0 }}><Building2 size={20} /></span>
          <div className="flex-1 min-w-0">
            <div id="neworg-h" style={{ fontWeight: 700, fontSize: "1.05rem" }}>Add an organization</div>
            <div className="text-sm" style={{ color: "rgba(255,255,255,.85)" }}>We'll email a temporary password to the official email.</div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy} aria-label="Close" style={{ color: "#fff" }}><X size={18} /></button>
        </div>
        <div className="flex flex-col gap-3" style={{ padding: "0 1.2rem 1.2rem" }}>
          <label><span className="lbl">Organization name</span>
            <input className="inp" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Computer Science Society" required autoFocus />
          </label>
          <label><span className="lbl">Official email</span>
            <input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} placeholder="css.official@gmail.com" required />
          </label>
          <label><span className="lbl">Kind</span>
            <select className="inp" value={type} onChange={(e) => setType(e.target.value)} required>
              <option value="">Choose…</option>
              {ORG_TYPES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </label>
          {error && <ErrorBox message={error} />}
          <div className="flex justify-end gap-2" style={{ marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn btn-primary" type="submit" disabled={busy || !name.trim() || !email.trim() || !type}>
              <Plus size={17} /> {busy ? "Adding…" : "Add organization"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function OrgCard({ org, onChange, onCredentials }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(org.name);
  const [email, setEmail] = useState(org.email);
  const [type, setType] = useState(org.type || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async (body) => {
    setBusy(true); setError("");
    try {
      const { org: next, credentials } = await api.updateOrg(org.id, body);
      onChange(next);
      if (credentials) onCredentials(credentials);
      setEditing(false);
    } catch (err) { setError(err.message); }
    setBusy(false);
  };
  const toggle = () => {
    const msg = org.disabled
      ? `Enable ${org.name}? Its account can sign in and manage events again.`
      : `Disable ${org.name}? Its account and officers lose access until you enable it again. Its events stay.`;
    if (confirm(msg)) save({ disabled: !org.disabled });
  };
  const resend = async () => {
    if (!confirm(`Send ${org.name} a new temporary password? Their current password stops working.`)) return;
    setBusy(true); setError("");
    try { onCredentials((await api.resendOrgPassword(org.id)).credentials); } catch (err) { setError(err.message); }
    setBusy(false);
  };
  const submitEdit = (e) => {
    e.preventDefault();
    if (email.trim().toLowerCase() !== org.email && !confirm(`Move ${org.name} to ${email.trim()}? That email gets a new temporary password, and ${org.email} can't sign in as the organization anymore.`)) return;
    save({ name, email, ...(type ? { type } : {}) });
  };
  const cancel = () => { setEditing(false); setName(org.name); setEmail(org.email); setType(org.type || ""); setError(""); };

  return (
    <article className="orgcard" style={{ opacity: org.disabled && !editing ? 0.75 : 1 }}>
      <div className="band" style={{ background: org.cover ? `center / cover no-repeat url("${org.cover}")` : skyFor(org.id), filter: org.disabled ? "grayscale(1)" : "none" }}>
        <span className="tag">{typeLabel(org.type)}</span>
      </div>
      {editing ? (
        <form onSubmit={submitEdit} className="flex flex-col gap-3" noValidate style={{ padding: "1rem" }}>
          <label><span className="lbl">Organization name</span><input className="inp" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus /></label>
          <label><span className="lbl">Official email</span><input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} /></label>
          <label><span className="lbl">Kind</span>
            <select className="inp" value={type} onChange={(e) => setType(e.target.value)}>
              {!org.type && <option value="">Uncategorized</option>}
              {ORG_TYPES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </label>
          {error && <ErrorBox message={error} />}
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm flex-1" type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            <button className="btn btn-ghost btn-sm" type="button" onClick={cancel}>Cancel</button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex flex-col items-center gap-1.5 flex-1" style={{ padding: "0 1rem 1rem", marginTop: -32, textAlign: "center" }}>
            <span className="orgav" style={{ background: org.logo ? `center / cover no-repeat url("${org.logo}")` : skyFor(org.id), filter: org.disabled ? "grayscale(1)" : "none" }}>
              {org.logo ? "" : initials(org.name)}
            </span>
            <div style={{ fontWeight: 700, fontSize: "1.08rem", marginTop: 4, color: org.disabled ? "var(--muted)" : "var(--text)" }}>{org.name}</div>
            <div className="muted text-sm" style={{ overflowWrap: "anywhere" }}>{org.email}</div>
            <span className="pill" style={org.disabled ? { background: "var(--raised)", color: "var(--muted)" } : { background: "#E2F4EA", color: "#14794B" }}>
              {org.disabled ? "Disabled" : "Active"}
            </span>
            <div className="orgmeta tag" style={{ marginTop: 4 }}>
              <span><CalendarDays size={12} /> {org.events || 0} event{org.events === 1 ? "" : "s"}{org.upcoming ? ` · ${org.upcoming} upcoming` : ""}</span>
              <span><Users size={12} /> {org.officers || 0} officer{org.officers === 1 ? "" : "s"}</span>
            </div>
            {error && <div style={{ width: "100%", textAlign: "left" }}><ErrorBox message={error} /></div>}
          </div>
          <div className="grid grid-cols-3" style={{ borderTop: "1px solid var(--line)" }}>
            <button className="btn btn-ghost btn-sm" style={{ borderRadius: 0 }} onClick={() => setEditing(true)} disabled={busy}><Pencil size={14} /> Edit</button>
            <button className="btn btn-ghost btn-sm" style={{ borderRadius: 0, borderLeft: "1px solid var(--line)", borderRight: "1px solid var(--line)" }}
              onClick={resend} disabled={busy || org.disabled} title="Email a new temporary password"><KeyRound size={14} /> Password</button>
            <button className="btn btn-ghost btn-sm" style={{ borderRadius: 0, color: org.disabled ? "var(--ok)" : "var(--bad)" }} onClick={toggle} disabled={busy}>
              <Power size={14} /> {org.disabled ? "Enable" : "Disable"}
            </button>
          </div>
        </>
      )}
    </article>
  );
}
