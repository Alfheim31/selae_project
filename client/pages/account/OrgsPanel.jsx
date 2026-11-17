import { useEffect, useState } from "react";
import { Ban, Building2, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Pencil, Plus, Power, Search, Users } from "lucide-react";
import { COLORS, skyOf } from "../../components/shared.jsx";
import { ErrorBox } from "../../components/ui.jsx";
import { api } from "../../lib/api.js";

const PAGE_SIZE = 8;

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
.orgrow{display:grid;grid-template-columns:48px 1fr auto;gap:.9rem;align-items:center;padding:.95rem 1.1rem;border-top:1px solid var(--line)}
.orgrow:hover{background:var(--raised)}
.orgav{width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#fff;
  font-family:var(--f-display);font-weight:700;font-size:1.25rem;text-shadow:0 1px 6px rgba(20,27,58,.35)}
.orgmeta{display:flex;flex-wrap:wrap;gap:.25rem .9rem;margin-top:.3rem}
.orgmeta span{display:inline-flex;align-items:center;gap:.3rem}
@media (max-width:640px){.orgrow{grid-template-columns:44px 1fr}.orgrow .acts{grid-column:1 / -1;justify-content:flex-start}}
`;

// Stats, add form, search, and the paged list of organizations
export function OrgsPanel() {
  const [orgs, setOrgs] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    api.adminOrgs().then((r) => setOrgs(r.orgs)).catch((e) => setError(e.message));
  }, []);

  const sortByName = (list) => [...list].sort((a, b) => a.name.localeCompare(b.name));
  // Edits come back without the counts, so keep the ones we have
  const replace = (org) => setOrgs((list) => sortByName(list.map((o) => (o.id === org.id ? { ...o, ...org } : o))));
  const added = (org) => { setOrgs((list) => sortByName([...(list || []), { events: 0, upcoming: 0, officers: 0, ...org }])); setQ(""); };

  const all = orgs || [];
  const term = q.trim().toLowerCase();
  const shown = term ? all.filter((o) => `${o.name} ${o.email}`.toLowerCase().includes(term)) : all;
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
      <div>
        <div className="tag mb-2">Admin console</div>
        <h1 className="display" style={{ fontSize: "2.6rem", textTransform: "uppercase" }}>Organizations</h1>
        <p className="muted text-sm mt-2" style={{ maxWidth: "70ch" }}>
          Each organization signs in with Google using its official Gmail. When officers change, update the email here
          and the organization keeps its events.
        </p>
      </div>

      <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
        {stats.map(([label, n, Icon, bg, fg]) => (
          <div key={label} className="panel orgstat">
            <span className="ic" style={{ background: bg, color: fg }}><Icon size={20} /></span>
            <div>
              <div className="n">{orgs ? n : "–"}</div>
              <div className="tag" style={{ marginTop: 3 }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      <NewOrg onAdded={added} />

      {error && <ErrorBox message={error} />}

      <div className="panel" style={{ overflow: "hidden", padding: 0 }}>
        <div className="flex items-center justify-between gap-3 flex-wrap" style={{ padding: "1rem 1.1rem" }}>
          <div>
            <div className="panel-title">All organizations</div>
            <div className="tag" style={{ marginTop: 2 }}>{orgs ? `${shown.length} ${term ? "found" : "total"}` : "Loading…"}</div>
          </div>
          {all.length > 0 && (
            <label className="field" style={{ flex: "0 1 280px" }}>
              <Search size={16} />
              <input className="input" placeholder="Search name or email" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
            </label>
          )}
        </div>

        {orgs && !all.length && (
          <div className="flex flex-col items-center gap-2" style={{ padding: "2.5rem 1rem", borderTop: "1px solid var(--line)", textAlign: "center" }}>
            <span className="orgav" style={{ background: skyFor("empty") }}><Building2 size={22} /></span>
            <div style={{ fontWeight: 700 }}>No organizations yet</div>
            <p className="muted text-sm">Add the first one above. It can sign in as soon as you save it.</p>
          </div>
        )}
        {orgs && all.length > 0 && !shown.length && (
          <p className="muted text-sm" style={{ padding: "1.2rem 1.1rem", borderTop: "1px solid var(--line)" }}>No organization matches “{q.trim()}”.</p>
        )}
        {slice.map((o) => <OrgRow key={o.id} org={o} onChange={replace} />)}

        {pages > 1 && (
          <div className="flex items-center justify-between gap-2" style={{ padding: ".8rem 1.1rem", borderTop: "1px solid var(--line)", background: "var(--raised)" }}>
            <button className="btn btn-sm" disabled={at === 0} onClick={() => setPage(at - 1)}><ChevronLeft size={16} /> Previous</button>
            <span className="tag">Page {at + 1} of {pages}</span>
            <button className="btn btn-sm" disabled={at >= pages - 1} onClick={() => setPage(at + 1)}>Next <ChevronRight size={16} /></button>
          </div>
        )}
      </div>
    </div>
  );
}

function NewOrg({ onAdded }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const { org } = await api.createOrg({ name, email });
      onAdded(org);
      setName(""); setEmail("");
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="panel flex flex-col gap-3" noValidate style={{ overflow: "hidden", padding: 0 }}>
      <div className="sky flex items-center gap-3" style={{ padding: "1rem 1.2rem" }}>
        <span style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(255,255,255,.22)", display: "flex", alignItems: "center",
          justifyContent: "center", flexShrink: 0 }}><Plus size={20} /></span>
        <div>
          <div style={{ fontWeight: 700, fontSize: "1.05rem" }}>Add an organization</div>
          <div className="text-sm" style={{ color: "rgba(255,255,255,.85)" }}>They sign in with Continue with Google using this Gmail.</div>
        </div>
      </div>
      <div className="flex flex-col gap-3" style={{ padding: "0 1.2rem 1.2rem" }}>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <label><span className="lbl">Organization name</span>
            <input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="Computer Science Society" required />
          </label>
          <label><span className="lbl">Official Gmail</span>
            <input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="css.official@gmail.com" required />
          </label>
          <button className="btn btn-primary" type="submit" disabled={busy || !name.trim() || !email.trim()} style={{ height: 44 }}>
            <Plus size={17} /> {busy ? "Adding…" : "Add"}
          </button>
        </div>
        {error && <ErrorBox message={error} />}
      </div>
    </form>
  );
}

function OrgRow({ org, onChange }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(org.name);
  const [email, setEmail] = useState(org.email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async (body) => {
    setBusy(true); setError("");
    try {
      const { org: next } = await api.updateOrg(org.id, body);
      onChange(next);
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
  const cancel = () => { setEditing(false); setName(org.name); setEmail(org.email); setError(""); };

  if (editing) {
    return (
      <form onSubmit={(e) => { e.preventDefault(); save({ name, email }); }} className="flex flex-col gap-3" noValidate
        style={{ padding: "1rem 1.1rem", borderTop: "1px solid var(--line)", background: "var(--raised)" }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label><span className="lbl">Organization name</span><input className="inp" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
          <label><span className="lbl">Official Gmail</span><input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        </div>
        {error && <ErrorBox message={error} />}
        <div className="flex gap-2">
          <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={cancel}>Cancel</button>
        </div>
      </form>
    );
  }

  return (
    <div>
      <div className="orgrow">
        <span className="orgav" style={{ background: skyFor(org.id), filter: org.disabled ? "grayscale(1)" : "none", opacity: org.disabled ? 0.6 : 1 }}>
          {initials(org.name)}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ fontWeight: 700, color: org.disabled ? "var(--muted)" : "var(--text)" }}>{org.name}</span>
            <span className="pill" style={org.disabled ? { background: "var(--raised)", color: "var(--muted)" } : { background: "#E2F4EA", color: "#14794B" }}>
              {org.disabled ? "Disabled" : "Active"}
            </span>
          </div>
          <div className="muted text-sm" style={{ overflowWrap: "anywhere" }}>{org.email}</div>
          <div className="orgmeta tag">
            <span><CalendarDays size={12} /> {org.events || 0} event{org.events === 1 ? "" : "s"}{org.upcoming ? ` · ${org.upcoming} upcoming` : ""}</span>
            <span><Users size={12} /> {org.officers || 0} officer{org.officers === 1 ? "" : "s"}</span>
          </div>
        </div>
        <div className="acts flex gap-1">
          <button className="btn btn-sm" onClick={() => setEditing(true)} disabled={busy}><Pencil size={15} /> Edit</button>
          <button className="btn btn-ghost btn-sm" onClick={toggle} disabled={busy} title={org.disabled ? "Enable" : "Disable"}
            style={{ color: org.disabled ? "var(--ok)" : "var(--bad)" }}>
            <Power size={15} /> {org.disabled ? "Enable" : "Disable"}
          </button>
        </div>
      </div>
      {error && <div style={{ padding: "0 1.1rem 1rem" }}><ErrorBox message={error} /></div>}
    </div>
  );
}
