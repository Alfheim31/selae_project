import { useRef, useState } from "react";
import { Camera, CheckCircle2, Upload } from "lucide-react";
import { extractFaceDescriptor } from "../lib/face.js";
import { useCamera } from "./camera.jsx";

// Face scan by webcam or selfie. `saved` means the profile already has a face.
export function FaceCapture({ value, onChange, onError, saved = false }) {
  const [faceStatus, setFaceStatus] = useState(saved ? "Face saved. Retake only if it stopped working at the gate." : "Required: scan your face for fast gate entry.");
  const [camOpen, setCamOpen] = useState(false);
  const [scanningFace, setScanningFace] = useState(false);
  const [camId, setCamId] = useState(null);
  const cam = useCamera(camOpen, camId);
  const fileInputRef = useRef(null);

  const captureFromVideo = async () => {
    if (!cam.videoRef.current) return;
    setScanningFace(true);
    onError("");
    try {
      const res = await extractFaceDescriptor(cam.videoRef.current);
      if (!res) {
        setFaceStatus("No face detected. Center your face in good lighting and try again.");
      } else {
        onChange(res.descriptor);
        setFaceStatus(`Face registered (${Math.round(res.score * 100)}% quality).`);
        setCamOpen(false);
      }
    } catch (err) {
      onError("Failed to process face: " + err.message);
    }
    setScanningFace(false);
  };

  const captureFromFile = async (file) => {
    if (!file) return;
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
      const res = await extractFaceDescriptor(img);
      URL.revokeObjectURL(img.src);
      if (!res) {
        setFaceStatus("Couldn't detect a clear face in that photo. Try another selfie.");
      } else {
        onChange(res.descriptor);
        setFaceStatus(`Face registered (${Math.round(res.score * 100)}% quality).`);
      }
    } catch (err) {
      onError("Failed to process photo: " + err.message);
    }
    setScanningFace(false);
  };

  return (
    <div className="panel p-4 flex flex-col gap-3" style={{ background: "var(--raised)" }}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="lbl" style={{ marginBottom: 2 }}>Facial registration (Required)</div>
          <div className="text-sm" style={{ color: value || saved ? "var(--ok)" : "var(--muted)", fontWeight: value || saved ? 600 : 400 }}>
            {faceStatus}
          </div>
          <p className="text-xs muted" style={{ marginTop: 6 }}>
            By scanning, you agree that SELAE saves a face signature (a set of numbers made from your photo, not the photo itself)
            so this event's hosts can recognize you at the entrance. Your photo never leaves your device.
          </p>
        </div>

        {(value || saved) && <CheckCircle2 size={22} color="var(--ok)" />}
      </div>

      {camOpen && (
        <div className="flex flex-col gap-2">
          <div className="viewfinder" style={{ maxHeight: 280 }}>
            <video ref={cam.videoRef} autoPlay playsInline muted />
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

      {!camOpen && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm" disabled={scanningFace} onClick={() => setCamOpen(true)}>
            <Camera size={15} /> {value || saved ? "Retake via Webcam" : "Open Webcam"}
          </button>
          <button type="button" className="btn btn-sm" disabled={scanningFace} onClick={() => fileInputRef.current && fileInputRef.current.click()}>
            <Upload size={15} /> {scanningFace ? "Analyzing…" : value || saved ? "Retake Selfie (Phone)" : "Take Selfie (Phone / Upload)"}
          </button>
        </div>
      )}
    </div>
  );
}
