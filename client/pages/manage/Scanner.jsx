import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CameraOff, CheckCircle2, Keyboard, Lock, Search, UserPlus, Volume2, VolumeX } from "lucide-react";
import { CameraStage, HoldToExit, useBeep, useCamera } from "../../components/camera.jsx";
import { formatName, norm } from "../../components/shared.jsx";
import { api } from "../../lib/api.js";
import { euclideanDistance, extractFaceDescriptor, modelPercent, modelText, useFaceModel } from "../../lib/face.js";
import { digitsApart, readStudentNumber } from "../../lib/ocr.js";
import { ResultPanel } from "./ScanResult.jsx";

// Scanning stops after this long without finding a face or ID, so the camera isn't left reading an empty gate
const SCAN_TIMEOUT = 60000;

/* ---------------- gate scanner ---------------- */
function makeActions(data) {
  return {
    isRegistered: (sid) => data.registered.has(sid),
    search(q) {
      const n = norm(q);
      if (n.length < 2) return [];
      return [...data.byId.values()]
        .filter((s) => norm(s.id).includes(n) || norm(s.last + s.first).includes(n) || norm(s.first + s.last).includes(n))
        .sort((a, b) => Number(data.registered.has(b.id)) - Number(data.registered.has(a.id)))
        .slice(0, 6);
    },
  };
}

export function Scanner({ data, eventId, refresh, gateMode, setGateMode }) {
  const { checkins, capacity, event } = data;
  const faceModel = useFaceModel();
  const actions = useMemo(() => makeActions(data), [data]);
  const [scanMode, setScanMode] = useState("face"); // "face" | "ocr" | "both"
  const [phase, setPhase] = useState("idle");
  const [result, setResult] = useState(null);
  const [cameraOn, setCameraOn] = useState(true);
  const [deviceId, setDeviceId] = useState(null);
  const cam = useCamera(cameraOn, deviceId);
  const live = cam.state === "live";
  const cameraUsable = cameraOn && cam.state !== "off";
  const [sound, setSound] = useState(true);
  const [path, setPath] = useState([]);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const timers = useRef([]);
  const scanToken = useRef(0);
  const pendingScan = useRef(null);
  const lastCard = useRef(null);
  const lastFace = useRef(null);
  const beep = useBeep(sound);

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));
  useEffect(() => clearTimers, []);
  const focusManual = () => setTimeout(() => inputRef.current && inputRef.current.focus(), 50);

  const show = (r) => { setResult(r); setPath((p) => [...p, "result"]); setPhase("result"); cam.freeze(); };

  // Check-in decision
  const decide = async (target, method, confidence, opts = {}) => {
    const token = ++scanToken.current;
    if (target.studentId) lastCard.current = { read: target.studentId.replace(/\D/g, ""), seen: Date.now() };
    setPhase("checking");
    let res;
    try {
      res = await api.checkin(eventId, { ...target, method, confidence, scanId: opts.scanId || undefined });
    } catch (e) {
      if (token !== scanToken.current) return;
      show({ type: "error", message: e.message });
      beep("error");
      return;
    }
    if (token !== scanToken.current) return;
    report(res, target, method, confidence);
  };

  const report = (res, target, method, confidence) => {
    refresh();
    const student = res.student;
    if (res.outcome === "approved") {
      show({ type: "approved", student, method, confidence, time: new Date(res.time), learned: Boolean(res.learned), added: Boolean(res.added) });
      beep("ok");
      later(() => reset(false), 3500);
    } else if (res.outcome === "checkout") {
      show({ type: "checkout", student, method, time: new Date(res.time), checkin: { ...res.checkin, time: new Date(res.checkin.time) } });
      beep("ok");
      later(() => reset(false), 3500);
    } else if (res.outcome === "unresolved") {
      show({ type: "unknown", read: target.ticket || target.studentId });
      beep("error");
    } else if (res.outcome === "notreg") {
      show({ type: "notlisted", number: student.id });
      beep("attention");
    } else {
      show({ type: res.outcome, student, method, otherEvent: res.otherEvent,
        previous: res.previous ? { ...res.previous, time: new Date(res.previous.time) } : null,
        checkout: res.checkout ? { ...res.checkout, time: new Date(res.checkout.time) } : null, checkoutAfterMinutes: res.checkoutAfterMinutes });
      const repeat = res.outcome === "dup" || res.outcome === "dupout";
      beep(repeat ? "attention" : "error");
      if (repeat) later(() => reset(false), 5000);
    }
  };

  // OCR match
  const matchRead = async (read, conf, source) => {
    const token = scanToken.current;
    setPath((p) => [...p.filter((x) => x !== "match"), "match"]);
    let m;
    try {
      m = await api.match(eventId, { read, conf, source });
    } catch (e) {
      if (token !== scanToken.current) return;
      show({ type: "error", message: e.message });
      beep("error");
      return;
    }
    if (token !== scanToken.current) return;
    const top = m.candidates[0];
    if (m.decision === "auto") {
      decide({ studentId: top.student.id }, "ocr", top.p, { scanId: m.scanId });
    } else if (m.decision === "confirm") {
      pendingScan.current = m.scanId;
      setResult({ type: "confirm", read: m.read, candidates: m.candidates, pUnknown: m.pUnknown, scanId: m.scanId, thresholds: m.thresholds });
      setPhase("result");
      beep("attention");
    } else {
      pendingScan.current = m.scanId;
      setResult({ type: "notlisted", number: m.read });
      setPhase("result");
      beep("attention");
    }
  };
  


  // Face Match handler
  const matchFaceRead = async (descriptor) => {
    const token = scanToken.current;
    setPath((p) => [...p.filter((x) => x !== "match"), "match"]);
    let m;
    try {
      m = await api.matchFace(eventId, { descriptor });
    } catch (e) {
      if (token !== scanToken.current) return;
      show({ type: "error", message: e.message });
      beep("error");
      return;
    }
    if (token !== scanToken.current) return;
    const top = m.candidates[0];
    if (m.decision === "auto" && top) {
      setPendingFaceMatch({ studentId: top.student.id, p: top.p, scanId: m.scanId, student: top.student });
      setPhase("confirm-face");
      cam.freeze();
      beep("attention");
    } else if (m.decision === "confirm" && top) {
      show({ type: "confirm", face: true, read: "Face scan", candidates: m.candidates, pUnknown: 0 });
      beep("attention");
    } else {
      show({ type: "lowmatch", face: true, read: "Face scan", best: top || null, pUnknown: 1 });
      api.logUnresolved(eventId, "face").then(refresh).catch(() => {});
      beep("error");
    }
  };

  // Student missing from the list
  const addStudent = async (fields) => {
    const token = ++scanToken.current;
    const res = await api.addStudent(eventId, { ...fields, scanId: pendingScan.current || undefined });
    if (token !== scanToken.current) return;
    pendingScan.current = null;
    lastCard.current = { read: res.student.id.replace(/\D/g, ""), seen: Date.now() };
    report(res, { studentId: res.student.id }, "manual", null);
  };

  const addFromSearch = (text) => {
    const typed = text.trim();
    reset();
    setQ("");
    setPath(["manual"]);
    show({ type: "add", title: "Add a student", message: "No one on file matches that search. Add them to the guest list and check them in.",
      initial: /\d/.test(typed) ? { studentId: typed } : { last: typed } });
  };

  const matchReadRef = useRef(matchRead);
  matchReadRef.current = matchRead;
  const matchFaceRef = useRef(matchFaceRead);
  matchFaceRef.current = matchFaceRead;
  const idleRef = useRef(false);
  idleRef.current = phase === "idle" && !result;
  const [pendingFaceMatch, setPendingFaceMatch] = useState(null);
  const [scan, setScan] = useState({ kind: "loading", reads: 0 });
  const [loopKey, setLoopKey] = useState(0);
  // After a minute with no face or ID found, scanning stops until staff press "Scan again"
  const [paused, setPaused] = useState(false);

  const reset = (clearCooldown = true) => {
    clearTimers();
    setPaused(false);
    scanToken.current++;
    setPhase("idle");
    setResult(null);
    setPath([]);
    setPendingFaceMatch(null);
    setScan((s) => ({ kind: "scanning", reads: s.reads || 0 }));
    if (clearCooldown) {
      lastFace.current = null;
      lastCard.current = null;
    }
    cam.resume();
    setLoopKey((k) => k + 1);
  };

  // Unified continuous scan loop (supports "face", "ocr", or "both")
  useEffect(() => {
    if (!live) return undefined;
    let stopped = false;
    let timer = 0;
    let attempt = 0;
    let retries = 0;
    let reads = 0;
    let lastFound = Date.now();
    let recentOcr = [];
    let recentFace = null;
    setScan({ kind: "loading", reads: 0 });
    // A new loop (another mode, or the camera coming back) starts unpaused
    setPaused(false);
    if (idleRef.current) cam.resume();

    const tick = async () => {
      if (stopped) return;
      const video = cam.videoRef.current;
      let wait = scanMode === "face" ? 180 : 60;

      if (!idleRef.current) {
        recentOcr = [];
        recentFace = null;
        lastFound = Date.now();
        if (lastCard.current) lastCard.current.seen = Date.now();
        if (lastFace.current) lastFace.current.seen = Date.now();
      } else if (video && video.readyState >= 2 && !video.paused) {
        const token = scanToken.current;
        const now = Date.now();
        let matchedThisTick = false;

        // Step A: Try Face Detection if mode is "face" or "both"
        if (scanMode === "face" || scanMode === "both") {
          try {
            const face = await extractFaceDescriptor(video);
            reads++;
            if (stopped) return;
            if (face) {
              lastFound = now;
              const handled = lastFace.current;
              const globalCooldown = handled && now - handled.seen < 800;
              const samePerson =
                handled &&
                handled.descriptor &&
                euclideanDistance(face.descriptor, handled.descriptor) < 0.45 &&
                now - handled.seen < 3000;

              if (globalCooldown || samePerson) {
                if (samePerson) handled.seen = now;
                setScan({ kind: "same", reads });
                matchedThisTick = true;
              } else if (
                recentFace &&
                euclideanDistance(face.descriptor, recentFace) < 0.48 &&
                idleRef.current &&
                token === scanToken.current
              ) {
                recentFace = null;
                lastFace.current = { descriptor: face.descriptor, seen: now };
                setPath(["face"]);
                setPhase("face");
                cam.freeze();
                matchFaceRef.current(face.descriptor);
                timer = setTimeout(tick, wait);
                return;
              } else {
                recentFace = face.descriptor;
                setScan({ kind: "found", reads, number: "Face detected" });
                matchedThisTick = true;
              }
            } else {
              recentFace = null;
            }
          } catch (e) {
            console.error("Face reader:", e);
            if (scanMode === "face") {
              if (!stopped) setScan({ kind: "error", reads });
              timer = setTimeout(tick, 3000);
              return;
            }
          }
        }

        // Step B: Try Student Number OCR if mode is "ocr" or ("both" and no face found)
        if (!matchedThisTick && (scanMode === "ocr" || scanMode === "both")) {
          let ocr = null;
          try {
            ocr = await readStudentNumber(video, attempt);
            reads++;
          } catch (e) {
            console.error("Student number reader:", e);
            if (!stopped) setScan({ kind: "error", reads });
            timer = setTimeout(tick, 5000);
            return;
          }
          if (stopped) return;
          const read = ocr ? ocr.read : null;
          if (read) { retries = 4; lastFound = now; }
          else if (retries > 0) retries--;
          else attempt++;

          recentOcr = recentOcr.filter((r) => now - r.at < 30000);
          const handled = lastCard.current;
          const sameCardInView = read && handled && (handled.read === read ? now - handled.seen < 60000 : digitsApart(read, handled.read) <= 2 && now - handled.seen < 20000);

          if (sameCardInView) {
            if (handled.read === read) handled.seen = now;
            setScan({ kind: "same", reads });
          } else if (read && recentOcr.some((r) => r.read === read) && idleRef.current && token === scanToken.current) {
            recentOcr = [];
            lastCard.current = { read, seen: now };
            pendingScan.current = null;
            setPath(["ocr"]);
            setPhase("ocr");
            cam.freeze();
            matchReadRef.current(ocr.read, ocr.conf, "camera");
            timer = setTimeout(tick, wait);
            return;
          } else if (read) {
            recentOcr.push({ read, at: now });
            setScan({ kind: "found", reads, number: `${read.slice(0, 4)}-${read.slice(4)}` });
          }
        }

        // A minute with nothing found (or a reader that took that long to start): stop and wait for staff
        if (!matchedThisTick && Date.now() - lastFound > SCAN_TIMEOUT && idleRef.current) {
          setPaused(true);
          cam.freeze();
          return;
        }
        if (!matchedThisTick && now - lastFound > 2000) {
          setScan({ kind: now - lastFound > 15000 ? "struggling" : "scanning", reads });
        } else if (!matchedThisTick) {
          setScan({ kind: "scanning", reads });
        }
      }
      timer = setTimeout(tick, wait);
    };
    const START_DELAY = loopKey > 0 ? 1500 : 0;
    timer = setTimeout(tick, START_DELAY);
    return () => { stopped = true; clearTimeout(timer); };
  }, [live, scanMode, loopKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const suggestions = actions.search(q);
  const chooseManual = (s) => {
    reset();
    setQ("");
    setPath(["manual"]);
    const scanId = pendingScan.current;
    pendingScan.current = null;
    decide({ studentId: s.id }, "manual", null, { scanId });
  };

  const count = checkins.size;

  const stepState = (id) => {
    if (!path.length) return "";
    if (id === "result") return phase === "result" ? "active" : "";
    if (path.includes(id)) return path[path.length - 1] === id && phase !== "result" ? "active" : "done";
    return phase === "result" ? "skipped" : "";
  };

  const firstStep = scanMode === "face"
    ? ["face", "Face detection"]
    : scanMode === "ocr"
    ? ["ocr", "Student number (OCR)"]
    : [path[0] === "ocr" ? "ocr" : "face", "Face / ID (OCR)"];

  return (
    <div className="flex flex-col gap-4">
      {/* Gate header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div>
            <div className="tag">Checked in</div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">{count}</span>
              <span className="muted">of {capacity} checked in</span>
            </div>
          </div>
          {/* Scanner Mode Toggle */}
          <div className="seg" role="group" aria-label="Scanner mode">
            {[
              ["face", "Face"],
              ["ocr", "ID (OCR)"],
              ["both", "Both"],
            ].map(([m, label]) => (
              <button
                key={m}
                type="button"
                aria-pressed={scanMode === m}
                onClick={() => { reset(); setScanMode(m); }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-sm btn-ghost" onClick={() => setSound((s) => !s)} aria-pressed={sound}>
            {sound ? <Volume2 size={16} /> : <VolumeX size={16} />} {sound ? "Sound on" : "Sound off"}
          </button>
          {cam.devices.length > 1 && live && (
            <select className="camselect" aria-label="Camera" value={deviceId || cam.devices[0].deviceId}
              onChange={(e) => { reset(); setDeviceId(e.target.value); }}>
              {cam.devices.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>
              ))}
            </select>
          )}
          <button className="btn btn-sm btn-ghost" onClick={() => { reset(); setCameraOn((c) => !c); }}>
            {cameraOn ? <CameraOff size={16} /> : <Camera size={16} />} {cameraOn ? "Turn camera off" : "Turn camera on"}
          </button>
          {gateMode ? <HoldToExit onExit={() => setGateMode(false)} /> : (
            <button className="btn btn-sm btn-primary" onClick={() => setGateMode(true)} title="Keeps volunteers from closing the scanner by accident"><Lock size={15} /> Lock for volunteers</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Camera */}
        <div className="lg:col-span-3 min-w-0">
          <div className="viewfinder">
            <video ref={cam.videoRef} className={phase === "result" ? "frozen" : ""} autoPlay playsInline muted />

            {live ? (
              <>
                <div className="vf-status">
                  <span className={`dot ${scan.kind === "error" ? "" : "dot-live"}`} style={{ background: scan.kind === "error" ? "var(--warn)" : "var(--ok)" }} />
                  {phase !== "idle" ? "Paused while showing the result"
                    : scan.kind === "loading" ? `Starting ${scanMode === "face" ? "face" : scanMode === "ocr" ? "ID" : "face & ID"} reader`
                    : scan.kind === "error" ? "Reader error, retrying. Use manual entry for now"
                    : `Scanning (${scanMode.toUpperCase()}), ${scan.reads} ${scan.reads === 1 ? "read" : "reads"} so far`}
                </div>
                {/* The first time on this device the face model still has to download: show how far along it is */}
                {scanMode !== "ocr" && !faceModel.ready && phase === "idle" && (
                  <div className="vf-load" role="status" aria-live="polite">
                    <span>{faceModel.total || faceModel.loaded ? modelText(faceModel) : "Getting the face reader ready…"}</span>
                    <div className={`vf-bar${modelPercent(faceModel) === null ? " unknown" : ""}`}>
                      <div style={modelPercent(faceModel) === null ? undefined : { width: `${modelPercent(faceModel)}%` }} />
                    </div>
                    <small>Only the first time on this device. Use manual entry below in the meantime.</small>
                  </div>
                )}
                {(phase === "ocr" || phase === "face") && (
                  <div className="ocr-tag">
                    {phase === "face" ? "Matching facial features" : "Reading the printed student number"}
                  </div>
                )}
                {phase === "idle" && (scanMode === "ocr" || faceModel.ready) && (
                  <div className="vf-note">
                    {scan.kind === "found" ? `Found ${scan.number}. Hold still, confirming`
                      : scan.kind === "same" ? "Already scanned. Step aside to scan the next person"
                      : scan.kind === "struggling" ? (scanMode === "face" ? "No face detected. Look directly at the camera" : "Move the ID or face closer and avoid glare")
                      : scan.kind === "error" ? "The reader isn't working right now"
                      : scanMode === "face" ? "Look at the camera to check in"
                      : scanMode === "ocr" ? "Show the student ID to the camera"
                      : "Look at the camera or hold up your student ID"}
                  </div>
                )}
                {phase === "result" && <div className="vf-note">Frame held</div>}
                {paused && phase === "idle" && (
                  <div role="status" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center",
                    justifyContent: "center", gap: 12, padding: 16, textAlign: "center", background: "rgba(20,27,58,.72)", color: "#fff", zIndex: 3 }}>
                    <strong style={{ fontSize: "1.1rem" }}>Scanning paused</strong>
                    <span className="text-sm" style={{ maxWidth: 320 }}>
                      No {scanMode === "face" ? "face" : scanMode === "ocr" ? "ID" : "face or ID"} was found for a minute. Press Scan again when the next attendee is ready.
                    </span>
                    <button type="button" className="btn btn-primary" onClick={() => reset()} autoFocus>Scan again</button>
                  </div>
                )}
              </>
            ) : cameraOn && cam.state !== "starting" ? (
              <>
              {/* No feed */}
                {phase === "idle" && (
                  <CameraStage cam={cam} onRetry={() => { setDeviceId(null); setCameraOn(false); setTimeout(() => setCameraOn(true), 60); }}
                    onUseIllustration={() => setCameraOn(false)} />
                )}
                {(phase === "ocr" || phase === "face") && <div className="ocr-tag">Matching attendee</div>}
              </>
            ) : (
              <CameraStage cam={cam} onRetry={() => { setCameraOn(true); }} onUseIllustration={() => setCameraOn(false)} />
            )}
          </div>
        </div>

        {/* Result panel */}
        <div className="lg:col-span-2 lg:row-span-2 min-w-0" aria-live="assertive">
          {phase === "confirm-face" && pendingFaceMatch ? (
             <div className="result warn">
               <div className="state"><CheckCircle2 size={28} /> Confirm Attendee</div>
               <p className="text-lg">Face matched: <strong>{formatName(pendingFaceMatch.student)}</strong></p>
               <p className="muted">Is this the correct student?</p>
               <div className="flex flex-col gap-2 mt-auto">
                 <button className="btn btn-primary" onClick={() => decide({ studentId: pendingFaceMatch.studentId }, "face", pendingFaceMatch.p, { scanId: pendingFaceMatch.scanId })} autoFocus>
                   Confirm Check-in
                 </button>
                 <button className="btn btn-on" onClick={() => { api.logUnresolved(eventId, "face").then(refresh).catch(() => {}); reset(true); }}>
                   Not them, retry
                 </button>
               </div>
             </div>
          ) : (
            <ResultPanel phase={phase} result={result} camera={cameraUsable} live={live} capacity={capacity} data={data} onAdd={addStudent} scanMode={scanMode}
              onReset={() => { pendingScan.current = null; reset(true); }}
              onConfirm={(c) => decide({ studentId: c.student.id }, "confirmed", c.p, { scanId: result && result.scanId })}
              onNone={() => {
                if (result && result.face) {
                  api.logUnresolved(eventId, "face").then(refresh).catch(() => {});
                  reset();
                  focusManual();
                  return;
                }
                api.logUnresolved(eventId, "ocr", result && result.scanId).then(refresh).catch(() => {});
                setResult({ type: "add", title: "Student not on the list", initial: { studentId: result.read },
                  message: `None of the matches were right for ${result.read}. Check the number against the ID, then add the student.` });
              }}
              onOpenAdd={() => setResult({ type: "add", title: "Add student", initial: { studentId: result.number },
                message: "Check the number against the ID, then fill in the rest." })}
              onManual={() => { reset(); focusManual(); }} />
          )}
        </div>

        {/* Pipeline + manual entry */}
        <div className="lg:col-span-3 flex flex-col gap-4 min-w-0">
          <ol className="steps" aria-label="Identification steps">
            {[firstStep, ["match", scanMode === "ocr" ? "Bayesian match" : "Identity match"], ["result", "Result"]].map(([id, label]) => (
              <li key={id} className={`step ${stepState(id)}`}>{label}</li>
            ))}
          </ol>

          <div className="panel p-4">
            <label htmlFor="manual" className="flex items-center gap-2 font-bold mb-2"><Keyboard size={17} /> Manual entry</label>
            <div className="field" style={{ position: "relative" }}>
              <Search size={17} />
              <input id="manual" ref={inputRef} className="input" autoComplete="off" value={q} maxLength={60}
                placeholder="Type a student number or name, e.g. 2024- or dela cruz"
                onChange={(e) => { setQ(e.target.value); setActive(0); }}
                onKeyDown={(e) => {
                  if (!suggestions.length) {
                    if (e.key === "Enter" && q.trim().length >= 2) { e.preventDefault(); addFromSearch(q); }
                    return;
                  }
                  if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, suggestions.length - 1)); }
                  if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                  if (e.key === "Enter") { e.preventDefault(); chooseManual(suggestions[active]); }
                  if (e.key === "Escape") setQ("");
                }} />
              {q.length >= 2 && (
                <div className="suggest" role="listbox">
                  {suggestions.length ? suggestions.map((s, i) => (
                    <button key={s.id} role="option" aria-selected={i === active} data-active={i === active} onClick={() => chooseManual(s)}>
                      <span><span className="font-bold">{formatName(s)}</span> <span className="muted text-sm">{s.section}</span></span>
                      <span className="text-sm faint">{s.id}{actions.isRegistered(s.id) ? "" : ", not registered"}</span>
                    </button>
                  )) : (
                    <button onClick={() => addFromSearch(q)}>
                      <span className="muted">No student matches “{q}”.</span>
                      <span className="font-bold flex items-center gap-1"><UserPlus size={15} /> Add student</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
