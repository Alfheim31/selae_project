import { useEffect, useMemo, useState } from "react";
import { FaceCapture } from "../../components/FaceCapture.jsx";
import { EMPTY_STUDENT, StudentFields } from "../../components/StudentFields.jsx";
import { formatName, go, tidyInitial, tidyName, toast } from "../../components/shared.jsx";
import { ErrorBox } from "../../components/ui.jsx";
import { pendingStudent } from "../../lib/account.js";
import { api } from "../../lib/api.js";
import { signOut } from "../../lib/auth.js";

const STUDENT_ID = /^(\d{4})\s*-?\s*(\d{5})$/;

export function ProfileForm({ me, onSaved, required = false }) {
  const p = me.profile;
  const [f, setF] = useState(() => {
    if (p) return { first: p.first, middle: p.middle, last: p.last, suffix: p.suffix, studentId: p.studentId, section: p.section };
    return pendingStudent.get(me.email) || { ...EMPTY_STUDENT, ...nameFromGoogle(me.name) };
  });
  const fromSignUp = !p && Boolean(pendingStudent.get(me.email));
  const [faceDescriptor, setFaceDescriptor] = useState(null);
  // Data privacy consent for the face scan; a saved face was consented to when it was first scanned
  const [consent, setConsent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const hasFace = Boolean(faceDescriptor || (p && p.hasFace));

  // Is the typed student number already another account's? Asked as soon as it's complete,
  // so nobody does the face scan only to be turned away at Save
  const [taken, setTaken] = useState(false);
  useEffect(() => {
    const m = f.studentId.trim().match(STUDENT_ID);
    const id = m ? `${m[1]}-${m[2]}` : "";
    if (!id || (p && p.studentId === id)) { setTaken(false); return; }
    let stale = false;
    const t = setTimeout(() => {
      api.studentNumberFree(id).then(({ available }) => { if (!stale) setTaken(!available); }, () => { /* offline: Save still checks */ });
    }, 400);
    return () => { stale = true; clearTimeout(t); };
  }, [f.studentId]); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = useMemo(() => {
    const s = { first: tidyName(f.first), last: tidyName(f.last), middle: tidyInitial(f.middle), suffix: f.suffix };
    return s.first && s.last ? formatName(s) : "";
  }, [f]);

  const submit = async (e) => {
    e.preventDefault();
    if (!hasFace) { setError("Please complete the facial scan before saving."); return; }
    setBusy(true); setError("");
    try {
      await api.saveProfile({ ...f, faceDescriptor, faceConsent: Boolean(faceDescriptor) && (consent === true || Boolean(p && p.hasFace)) });
      pendingStudent.clear();
      setFaceDescriptor(null);
      // The first save unlocks the app and this page goes away, so the pop-up lives at the app level
      toast(p && p.hasFace ? "Profile saved." : "Profile saved. You're all set for events.");
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

      {taken ? (
        <div className="alert err" role="alert">
          <strong>This student number already has an account.</strong> If it's yours, sign out and sign in to that account.
          If it isn't, check the number, or ask an organizer for help.
          <div style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-sm" onClick={async () => { await signOut(); go(""); }}>Sign out</button>
          </div>
        </div>
      ) : (
        <FaceCapture value={faceDescriptor} onChange={setFaceDescriptor} onError={setError} saved={Boolean(p && p.hasFace)}
          consent={consent} onConsent={setConsent} onSignOut={async () => { await signOut(); go(""); }} />
      )}

      {preview && <p className="text-sm muted">Guest lists will show you as <strong style={{ color: "var(--text)" }}>{preview}</strong></p>}
      {error && <ErrorBox message={error} />}
      <button className="btn btn-primary" type="submit" disabled={busy || !hasFace || taken} style={{ padding: ".75rem 1rem", fontSize: "1.1rem" }}>
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
