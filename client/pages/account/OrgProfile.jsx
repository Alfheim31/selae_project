import { useRef, useState } from "react";
import { Building2, Camera, ImagePlus, Trash2, Users } from "lucide-react";
import { Avatar } from "../../components/AccountMenu.jsx";
import { prepareImage, toast, Trails } from "../../components/shared.jsx";
import { ErrorBox } from "../../components/ui.jsx";
import { api } from "../../lib/api.js";
import { OfficersPanel } from "./OfficersPanel.jsx";
import { ORG_TYPES } from "./OrgsPanel.jsx";

const TYPE_LABEL = Object.fromEntries(ORG_TYPES);

/* Organization account: a wide cover and photo of its own, like the superadmin's page, with its officers under it */
export function OrgProfile({ me, joined, onChange }) {
  const org = me.org;
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const files = { cover: useRef(null), logo: useRef(null) };
  const label = { cover: "Cover", logo: "Profile photo" };

  const upload = async (kind, file) => {
    if (!file) return;
    setBusy(kind); setError("");
    try {
      // The photo shows at most about 150px wide, so 400px is sharp even on a phone screen
      const blob = await prepareImage(file, { max: kind === "cover" ? 1600 : 400 });
      await api.uploadOrgImage(kind, blob);
      await onChange();
      toast(`${label[kind]} updated.`);
    } catch (err) { setError(err.message); }
    setBusy("");
  };
  const remove = async (kind) => {
    setBusy(kind); setError("");
    try { await api.removeOrgImage(kind); await onChange(); toast(`${label[kind]} removed.`); }
    catch (err) { setError(err.message); }
    setBusy("");
  };
  const picker = (kind) => (
    <input ref={files[kind]} type="file" accept="image/jpeg,image/png,image/webp,image/heic" hidden
      onChange={(e) => { const f = e.target.files[0]; e.target.value = ""; upload(kind, f); }} />
  );
  const onPhoto = { background: "rgba(20,27,58,.62)", color: "#fff", borderColor: "rgba(255,255,255,.35)", backdropFilter: "blur(6px)" };

  return (
    <div className="wrap py-6 flex flex-col gap-6" style={{ maxWidth: 1100 }}>
      <section className="panel" style={{ overflow: "hidden", padding: 0 }}>
        <div className="sky" style={{ height: "clamp(150px, 24vw, 250px)", position: "relative" }}>
          {org.cover
            ? <img src={org.cover} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            : <Trails seed={me.email} opacity={0.6} />}
          <div className="flex gap-2" style={{ position: "absolute", right: 12, top: 12 }}>
            <button className="btn btn-sm" style={onPhoto} disabled={Boolean(busy)} onClick={() => files.cover.current.click()}>
              <ImagePlus size={15} /> {busy === "cover" ? "Uploading…" : org.cover ? "Change cover" : "Add cover"}
            </button>
            {org.cover && (
              <button className="btn btn-sm" style={onPhoto} disabled={Boolean(busy)} onClick={() => remove("cover")} aria-label="Remove cover">
                <Trash2 size={15} />
              </button>
            )}
          </div>
          {picker("cover")}
        </div>

        <div className="flex flex-col items-center gap-2" style={{ textAlign: "center", padding: "0 1.5rem 1.4rem", marginTop: "clamp(-84px, -9vw, -60px)" }}>
          <span style={{ borderRadius: "50%", border: "5px solid var(--surface)", boxShadow: "0 10px 28px -10px rgba(20,27,58,.45)", lineHeight: 0, position: "relative" }}>
            <Avatar meta={{}} src={org.logo} name={org.name} size={152} />
            <button className="btn btn-sm" disabled={Boolean(busy)} onClick={() => files.logo.current.click()}
              aria-label={org.logo ? "Change profile photo" : "Add profile photo"} title={org.logo ? "Change profile photo" : "Add profile photo"}
              style={{ position: "absolute", right: 4, bottom: 4, width: 40, height: 40, padding: 0, borderRadius: "50%", justifyContent: "center",
                background: "var(--accent)", color: "#fff", borderColor: "var(--surface)", borderWidth: 3 }}>
              <Camera size={17} />
            </button>
            {picker("logo")}
          </span>
          {busy === "logo" && <span className="text-sm muted">Uploading photo…</span>}
          {org.logo && busy !== "logo" && (
            <button className="btn btn-ghost btn-sm" disabled={Boolean(busy)} onClick={() => remove("logo")}><Trash2 size={14} /> Remove photo</button>
          )}
          <h1 className="display" style={{ fontSize: "clamp(2rem, 4.2vw, 2.9rem)", marginTop: 2 }}>{org.name}</h1>
          <div className="muted" style={{ overflowWrap: "anywhere" }}>{me.email}</div>
          <div className="flex flex-wrap justify-center items-center gap-2 mt-1">
            <span className="pill host"><Building2 size={12} /> Organization account</span>
            {org.type && TYPE_LABEL[org.type] && <span className="tag">{TYPE_LABEL[org.type]}</span>}
            <span className="tag">Signs in with {me.viaGoogle ? "Google" : "email"}</span>
            {joined && <span className="tag">Joined {joined}</span>}
          </div>
          {error && <div style={{ width: "100%", maxWidth: 520 }}><ErrorBox message={error} /></div>}
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap" style={{ borderTop: "1px solid var(--line)", padding: ".6rem 1.2rem" }}>
          <nav className="flex gap-1" aria-label="Profile sections">
            <span className="toplink" aria-current="page" style={{ cursor: "default" }}><Users size={16} /> Officers</span>
          </nav>
        </div>
      </section>
      <OfficersPanel />
    </div>
  );
}
