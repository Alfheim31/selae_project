import { useMemo, useState } from "react";
import { FaceCapture } from "../../components/FaceCapture.jsx";
import { EMPTY_STUDENT, StudentFields } from "../../components/StudentFields.jsx";
import { formatName, tidyInitial, tidyName } from "../../components/shared.jsx";
import { ErrorBox } from "../../components/ui.jsx";
import { pendingStudent } from "../../lib/account.js";
import { api } from "../../lib/api.js";

export function ProfileForm({ me, onSaved, required = false }) {
  const p = me.profile;
  const [f, setF] = useState(() => {
    if (p) return { first: p.first, middle: p.middle, last: p.last, suffix: p.suffix, studentId: p.studentId, section: p.section };
    return pendingStudent.get(me.email) || { ...EMPTY_STUDENT, ...nameFromGoogle(me.name) };
  });
  const fromSignUp = !p && Boolean(pendingStudent.get(me.email));
  const [faceDescriptor, setFaceDescriptor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const set = (k) => (e) => { setDone(false); setF((x) => ({ ...x, [k]: e.target.value })); };
  const hasFace = Boolean(faceDescriptor || (p && p.hasFace));
  const preview = useMemo(() => {
    const s = { first: tidyName(f.first), last: tidyName(f.last), middle: tidyInitial(f.middle), suffix: f.suffix };
    return s.first && s.last ? formatName(s) : "";
  }, [f]);

  const submit = async (e) => {
    e.preventDefault();
    if (!hasFace) { setError("Please complete the facial scan before saving."); return; }
    setBusy(true); setError(""); setDone(false);
    try {
      await api.saveProfile({ ...f, faceDescriptor });
      pendingStudent.clear();
      setFaceDescriptor(null);
      setDone(true);
      onSaved();
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="panel p-5 flex flex-col gap-4" noValidate>
      <div>
        <h1 className="panel-title">{p ? "Your student profile" : fromSignUp ? "Almost done: scan your face" : "Set up your student profile"}</h1>
        <p className="muted text-sm">{fromSignUp
          ? "Your email is confirmed. Check your details, scan your face, and save."
          : "Fill this in once. SELAE uses it every time you register for an event."}</p>
        {required && <p className="text-sm" style={{ color: "var(--accent)", fontWeight: 600, marginTop: 6 }}>Finish your profile to continue using SELAE.</p>}
      </div>

      <StudentFields f={f} set={set} />

      <FaceCapture value={faceDescriptor} onChange={(d) => { setDone(false); setFaceDescriptor(d); }} onError={setError} saved={Boolean(p && p.hasFace)} />

      {preview && <p className="text-sm muted">Guest lists will show you as <strong style={{ color: "var(--text)" }}>{preview}</strong></p>}
      {error && <ErrorBox message={error} />}
      {done && <p className="text-sm" style={{ color: "var(--ok)", fontWeight: 600 }}>Saved.</p>}
      <button className="btn btn-primary" type="submit" disabled={busy || !hasFace} style={{ padding: ".75rem 1rem", fontSize: "1.1rem" }}>
        {busy ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}

// "Juan Miguel Dela Cruz" -> first "Juan Miguel", last "Dela Cruz"; the student fixes it if it's wrong
const PARTICLES = new Set(["de", "del", "dela", "delos", "la", "los", "san", "sta", "sta.", "santa", "van", "von"]);
function nameFromGoogle(full) {
  const words = String(full || "").trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return { first: words[0] || "" };
  let i = words.length - 1;
  while (i > 1 && PARTICLES.has(words[i - 1].toLowerCase())) i--;
  return { first: words.slice(0, i).join(" "), last: words.slice(i).join(" ") };
}
