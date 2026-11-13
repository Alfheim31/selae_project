import { useEffect, useState } from "react";
import { Building2, Plus, Pencil, ArrowLeft } from "lucide-react";
import { api } from "../lib/api.js";
import { go } from "../components/shared.jsx";
import { useMe, ErrorBox } from "./public.jsx";

/* Superadmin: the organizations that host events */

export function AdminPage() {
  const { me } = useMe();
  const [orgs, setOrgs] = useState(null);
  const [error, setError] = useState("");
  const isAdmin = me && me.role === "superadmin";

  const load = async () => {
    try { setOrgs((await api.adminOrgs()).orgs); setError(""); } catch (e) { setError(e.message); }
  };
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  if (me === undefined) return <div className="narrow py-10 muted">Loading…</div>;
  if (!isAdmin) {
    return (
      <div className="narrow py-10">
        <div className="panel p-6 flex flex-col gap-2">
          <h1 className="panel-title">Superadmin only</h1>
          <p className="muted">Sign in with Google using a superadmin account to manage organizations.</p>
        </div>
      </div>
    );
  }

  const replace = (org) => setOrgs((list) => list.map((o) => (o.id === org.id ? org : o)));
  const active = orgs ? orgs.filter((o) => !o.disabled).length : 0;

  return (
    <div className="narrow py-10 flex flex-col gap-5">
      <div>
        <button className="btn btn-ghost btn-sm" onClick={() => go("profile")} style={{ marginBottom: 8 }}><ArrowLeft size={16} /> Account</button>
        <h1 className="panel-title" style={{ fontSize: "1.6rem" }}>Organizations</h1>
        <p className="muted text-sm">
          Each organization signs in with Google using its official Gmail. When officers change, update the email here
          and the organization keeps its events.
        </p>
      </div>

      <NewOrg onAdded={(org) => setOrgs((list) => [...(list || []), org].sort((a, b) => a.name.localeCompare(b.name)))} />

      {error && <ErrorBox message={error} />}
      {orgs && (
        <div className="flex flex-col gap-2">
          <div className="lbl">{orgs.length ? `${active} active · ${orgs.length - active} disabled` : "No organizations yet"}</div>
          {orgs.map((o) => <OrgRow key={o.id} org={o} onChange={replace} />)}
        </div>
      )}
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
    <form onSubmit={submit} className="panel p-5 flex flex-col gap-3" noValidate>
      <div style={{ fontWeight: 700 }}>Add an organization</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label><span className="lbl">Organization name</span>
          <input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="Computer Science Society" required />
        </label>
        <label><span className="lbl">Official Gmail</span>
          <input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="css.official@gmail.com" required />
        </label>
      </div>
      {error && <ErrorBox message={error} />}
      <div><button className="btn btn-primary" type="submit" disabled={busy}><Plus size={17} /> {busy ? "Adding…" : "Add organization"}</button></div>
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

  return (
    <div className="panel p-4 flex flex-col gap-3" style={{ opacity: org.disabled && !editing ? 0.65 : 1 }}>
      {editing ? (
        <form onSubmit={(e) => { e.preventDefault(); save({ name, email }); }} className="flex flex-col gap-3" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label><span className="lbl">Organization name</span><input className="inp" value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label><span className="lbl">Official Gmail</span><input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          </div>
          {error && <ErrorBox message={error} />}
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            <button className="btn btn-ghost btn-sm" type="button" onClick={cancel}>Cancel</button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <span style={{ width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
              background: "var(--accent-soft)", color: "var(--accent)", flexShrink: 0 }}><Building2 size={20} /></span>
            <div className="min-w-0 flex-1">
              <div style={{ fontWeight: 700 }}>{org.name}</div>
              <div className="muted text-sm" style={{ overflowWrap: "anywhere" }}>{org.email}</div>
            </div>
            <span className="pill" style={org.disabled ? { background: "var(--raised)", color: "var(--muted)" } : { background: "#E2F4EA", color: "#14794B" }}>
              {org.disabled ? "Disabled" : "Active"}
            </span>
          </div>
          {error && <ErrorBox message={error} />}
          <div className="flex gap-2">
            <button className="btn btn-sm" onClick={() => setEditing(true)} disabled={busy}><Pencil size={15} /> Edit</button>
            <button className="btn btn-ghost btn-sm" onClick={toggle} disabled={busy}>{org.disabled ? "Enable" : "Disable"}</button>
          </div>
        </>
      )}
    </div>
  );
}
