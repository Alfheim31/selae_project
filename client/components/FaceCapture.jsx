import { useRef, useState } from "react";
import { Camera, CheckCircle2, ShieldCheck, Upload } from "lucide-react";
import { extractFaceDescriptor } from "../lib/face.js";
import { useCamera } from "./camera.jsx";

// A scan (the first one also downloads the 94 MB face model) gives up after a minute so the student can try again.
// The download keeps going in the background, so the next try usually finishes sooner.
const SCAN_TIMEOUT = 60000;
const TOO_LONG = "Scanning took more than a minute. On a slow connection the first scan takes longer while the face model downloads. Try again.";
function withTimeout(promise) {
  let t;
  const late = new Promise((_, reject) => { t = setTimeout(() => reject(Object.assign(new Error(TOO_LONG), { timeout: true })), SCAN_TIMEOUT); });
  return Promise.race([promise, late]).finally(() => clearTimeout(t));
}

// While a scan runs: a spinner over the camera (or on its own for an uploaded selfie) with what's happening
const SCAN_CSS = `
.facebusy{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.6rem;
  background:rgba(14,20,48,.55);color:#fff;font-weight:600;text-align:center;padding:1rem;backdrop-filter:blur(1px)}
.facebusy .spin{width:38px;height:38px;border-color:rgba(255,255,255,.3);border-top-color:#fff}
.facebusy small{font-weight:500;opacity:.85;max-width:30ch}
.facebar{display:flex;align-items:center;gap:.7rem;padding:.7rem .8rem;border-radius:10px;background:var(--accent-soft);color:var(--accent);font-weight:600}
`;
function ScanBusy({ overlay, text }) {
  const hint = "The first scan also downloads the face model, so it can take a while.";
  return overlay ? (
    <div className="facebusy" role="status" aria-live="polite"><div className="spin" /> {text}<small>{hint}</small></div>
  ) : (
    <div className="facebar text-sm" role="status" aria-live="polite"><div className="spin" style={{ width: 20, height: 20, borderWidth: 2.5 }} />
      <span>{text} <span className="muted" style={{ fontWeight: 400 }}>{hint}</span></span></div>
  );
}

// Shown before any face scan, under the Data Privacy Act of 2012 (RA 10173)
export function PrivacyNotice() {
  return (
    <div className="text-xs" style={{ display: "grid", gap: 6, lineHeight: 1.5 }}>
      <p><strong>What we collect.</strong> A face signature: 128 numbers worked out from your face. Your photo is processed on
        this device and is never uploaded or stored; only the numbers are saved with your profile.</p>
      <p><strong>Why.</strong> Only to confirm it's you at the entrance of events you register for. At the gate, the camera
        reads your face the same way to find your registration.</p>
      <p><strong>Who can see it.</strong> Event hosts and other users can't view or download it; SELAE's server only compares
        it at check-in. It's kept in SELAE's database, which only the SELAE administrators can open, and isn't shared outside SELAE.</p>
      <p><strong>How long.</strong> Until you replace it with a new scan or your account is removed.</p>
      <p><strong>Your rights.</strong> Under the Data Privacy Act of 2012 (RA 10173) you can ask to see, correct, or delete
        your data, or withdraw this consent, by contacting your organization or the SELAE administrators. Without a face scan
        you can't register through SELAE.</p>
    </div>
  );
}

// Face scan by webcam or selfie. `saved` means the profile already has a face.
// consent: null until the student answers the privacy notice, then true (agree) or false (decline).
// The camera and upload stay locked until they agree; `saved` faces were consented to before.
export function FaceCapture({ value, onChange, onError, saved = false, consent = null, onConsent = () => {}, onSignOut }) {
  const agreed = consent === true || saved;
  const [faceStatus, setFaceStatus] = useState(saved ? "Face saved. Retake only if it stopped working at the gate." : "Required: scan your face for fast gate entry.");
  const [camOpen, setCamOpen] = useState(false);
  const [scanningFace, setScanningFace] = useState(false);
  const [camId, setCamId] = useState(null);
  const cam = useCamera(camOpen, camId);
  const fileInputRef = useRef(null);

  // Each try gets a number; a scan that finishes after it timed out (or after a newer try) is ignored
  const attempt = useRef(0);

  const captureFromVideo = async () => {
    if (!cam.videoRef.current) return;
    const mine = ++attempt.current;
    setScanningFace(true);
    onError("");
    setFaceStatus("Scanning… the first scan can take a while.");
    try {
      const res = await withTimeout(extractFaceDescriptor(cam.videoRef.current));
      if (mine !== attempt.current) return;
      if (!res) {
        setFaceStatus("No face detected. Center your face in good lighting and try again.");
      } else {
        onChange(res.descriptor);
        setFaceStatus(`Face registered (${Math.round(res.score * 100)}% quality).`);
        setCamOpen(false);
      }
    } catch (err) {
      if (mine !== attempt.current) return;
      if (err.timeout) setFaceStatus(TOO_LONG);
      else onError("Failed to process face: " + err.message);
    }
    setScanningFace(false);
  };

  const captureFromFile = async (file) => {
    if (!file) return;
    const mine = ++attempt.current;
    setScanningFace(true);
    onError("");
    setFaceStatus("Analyzing photo…");
    try {
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("Could not read image."));
        el.src = URL.createObjectURL(file);
      });
      const res = await withTimeout(extractFaceDescriptor(img)).finally(() => URL.revokeObjectURL(img.src));
      if (mine !== attempt.current) return;
      if (!res) {
        setFaceStatus("Couldn't detect a clear face in that photo. Try another selfie.");
      } else {
        onChange(res.descriptor);
        setFaceStatus(`Face registered (${Math.round(res.score * 100)}% quality).`);
      }
    } catch (err) {
      if (mine !== attempt.current) return;
      if (err.timeout) setFaceStatus(TOO_LONG);
      else onError("Failed to process photo: " + err.message);
    }
    setScanningFace(false);
  };

  return (
    <div className="panel p-4 flex flex-col gap-3" style={{ background: "var(--raised)" }}>
      <style>{SCAN_CSS}</style>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="lbl" style={{ marginBottom: 2 }}>Facial registration (Required)</div>
          <div className="text-sm" style={{ color: value || saved ? "var(--ok)" : "var(--muted)", fontWeight: value || saved ? 600 : 400 }}>
            {faceStatus}
          </div>
        </div>

        {(value || saved) && <CheckCircle2 size={22} color="var(--ok)" />}
      </div>

      {saved ? (
        <details className="text-xs">
          <summary style={{ cursor: "pointer", fontWeight: 600 }}><ShieldCheck size={13} style={{ display: "inline", verticalAlign: "-2px" }} /> Data privacy notice</summary>
          <div style={{ marginTop: 8 }}><PrivacyNotice /></div>
        </details>
      ) : consent === false ? (
        <div className="alert err flex flex-col gap-2" role="status">
          <strong>You declined the data privacy notice.</strong>
          <span className="text-sm">
            Nothing about your face was collected. Without a face scan you can't finish your profile or register for events
            through SELAE. If an event allows it, ask its organizer to check you in at the entrance instead.
          </span>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-sm" onClick={() => onConsent(null)}>Read the notice again</button>
            {onSignOut && <button type="button" className="btn btn-sm" onClick={onSignOut}>Sign out</button>}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2" style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: ".8rem" }}>
          <div className="flex items-center gap-2 text-sm" style={{ fontWeight: 700 }}><ShieldCheck size={16} /> Data privacy notice</div>
          <PrivacyNotice />
          {consent === true ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm" style={{ marginTop: 4 }}>
              <span style={{ color: "var(--ok)", fontWeight: 600 }}><CheckCircle2 size={14} style={{ display: "inline", verticalAlign: "-2px" }} /> You agreed. You can scan your face now.</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { onChange(null); onConsent(false); }}>Withdraw</button>
            </div>
          ) : (
            <>
              <p className="text-sm" style={{ marginTop: 4 }}>Do you agree that SELAE may collect and use your face signature as described above?</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary btn-sm" style={{ flex: "1 1 140px" }} onClick={() => onConsent(true)}>I agree</button>
                <button type="button" className="btn btn-sm" style={{ flex: "1 1 140px" }} onClick={() => { onChange(null); onConsent(false); }}>I don't agree</button>
              </div>
            </>
          )}
        </div>
      )}

      {camOpen && (
        <div className="flex flex-col gap-2">
          <div className="viewfinder" style={{ maxHeight: 280 }}>
            <video ref={cam.videoRef} autoPlay playsInline muted />
            {scanningFace && <ScanBusy overlay text="Scanning your face…" />}
          </div>
          {cam.devices.length > 1 && (
            <select className="camselect" aria-label="Camera" value={camId || ""}
              onChange={(e) => setCamId(e.target.value || null)} style={{ maxWidth: "100%" }}>
              <option value="">Default camera</option>
              {cam.devices.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>
              ))}
            </select>
          )}

          {cam.state === "live" ? (
            <div className="flex gap-2">
              <button type="button" className="btn btn-primary btn-sm flex-1" disabled={scanningFace} onClick={captureFromVideo}>
                <Camera size={15} /> {scanningFace ? "Scanning…" : "Capture face"}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCamOpen(false)}>Cancel</button>
            </div>
          ) : (
            <p className="text-xs muted">
              {cam.state === "insecure"
                ? "Live camera requires localhost or HTTPS. Use the 'Take Selfie' button below instead."
                : "Waiting for camera permission…"}
            </p>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="user"
        hidden
        onChange={(e) => captureFromFile(e.target.files[0])}
      />

      {scanningFace && !camOpen && <ScanBusy text="Analyzing your photo…" />}

      {!camOpen && agreed && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm" disabled={scanningFace || !agreed} onClick={() => setCamOpen(true)}>
            <Camera size={15} /> {value || saved ? "Retake via Webcam" : "Open Webcam"}
          </button>
          <button type="button" className="btn btn-sm" disabled={scanningFace || !agreed} onClick={() => fileInputRef.current && fileInputRef.current.click()}>
            <Upload size={15} /> {scanningFace ? "Analyzing…" : value || saved ? "Retake Selfie (Phone)" : "Take Selfie (Phone / Upload)"}
          </button>
        </div>
      )}
    </div>
  );
}
