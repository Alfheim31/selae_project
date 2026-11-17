import { useEffect, useMemo, useRef, useState } from "react";
import { Trash2, Upload } from "lucide-react";
import { api } from "../lib/api.js";
import { CATEGORIES } from "./EventPass.jsx";
import { COLOR_NAMES, COLORS, Cover, prepareImage, skyOf } from "./shared.jsx";
import { ErrorBox } from "./ui.jsx";

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
