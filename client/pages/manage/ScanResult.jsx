import { useState } from "react";
import {
  AlertTriangle, Ban, Brain, CalendarX, CheckCircle2, ChevronRight, Clock, HelpCircle, History, Keyboard, LogOut, ScanLine, UserPlus, WifiOff,
} from "lucide-react";
import { SUFFIXES } from "../../components/StudentFields.jsx";
import { fmtDateShort, fmtTime, formatName, METHOD_LABEL, pct } from "../../components/shared.jsx";

export const sure = (p) => (p >= 0.995 ? "over 99%" : pct(p));

// "Scan again after 30 minutes to check them out." (the wait comes from the server)
const afterText = (min) => {
  if (!min) return "Scan again later to check them out.";
  const h = Math.floor(min / 60), m = min % 60;
  const t = [h ? `${h} hour${h === 1 ? "" : "s"}` : "", m ? `${m} minute${m === 1 ? "" : "s"}` : ""].filter(Boolean).join(" ");
  return `Scan again after ${t} to check them out.`;
};

const STATUS_NOTE = { inside: "Already checked in", out: "Already checked out", waitlist: "On the waitlist", notreg: "Not registered for this event" };

function DigitDiff({ id, read }) {
  const a = id.replace(/\D/g, ""), b = String(read).replace(/\D/g, "");
  if (a.length !== b.length) return <span>{id}</span>;
  let k = 0;
  return (
    <span>
      {id.split("").map((ch, i) => {
        if (!/\d/.test(ch)) return <span key={i}>{ch}</span>;
        const differs = ch !== b[k++];
        return differs ? <u key={i} style={{ textDecorationThickness: 2, fontWeight: 800 }} title={`Read as ${b[k - 1]}`}>{ch}</u> : <span key={i}>{ch}</span>;
      })}
    </span>
  );
}

function AddStudentForm({ result, data, onAdd, onManual, onReset }) {
  const [f, setF] = useState({ studentId: "", first: "", middle: "", last: "", suffix: "", section: "", ...result.initial });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  // A number already on file keeps its name and section
  const m = f.studentId.trim().match(/^(\d{4})\s*-?\s*(\d{5})$/);
  const sid = m ? `${m[1]}-${m[2]}` : "";
  const onFile = data.byId.get(sid) || null;
  const v = onFile ? { ...f, first: onFile.first, middle: onFile.middle, last: onFile.last, suffix: onFile.suffix, section: onFile.section } : f;
  const reg = data.regByStudent.get(sid);
  const full = !reg && data.going.length >= data.capacity;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await onAdd(v);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="result warn" onSubmit={submit} noValidate>
      <div className="state"><UserPlus size={28} /> {result.title}</div>
      <p>{result.message}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="sm:col-span-2"><span className="lbl">Student number</span>
          <input className="inp mono" value={f.studentId} onChange={set("studentId")} maxLength={11} placeholder="2024-12345" inputMode="numeric" autoComplete="off" required /></label>
        <label><span className="lbl">Given name</span>
          <input className="inp" value={v.first} onChange={set("first")} maxLength={60} readOnly={Boolean(onFile)} autoFocus={!onFile} autoComplete="off" required /></label>
        <label><span className="lbl">Surname</span>
          <input className="inp" value={v.last} onChange={set("last")} maxLength={60} readOnly={Boolean(onFile)} autoComplete="off" required /></label>
        <label><span className="lbl">Middle initial (optional)</span>
          <input className="inp" value={v.middle} onChange={set("middle")} maxLength={60} readOnly={Boolean(onFile)} autoComplete="off" /></label>
        <label><span className="lbl">Suffix (optional)</span>
          <select className="inp" value={v.suffix} onChange={set("suffix")} disabled={Boolean(onFile)}>
            {SUFFIXES.map((s) => <option key={s} value={s}>{s || "None"}</option>)}
          </select></label>
        <label className="sm:col-span-2"><span className="lbl">Section</span>
          <input className="inp" value={v.section} onChange={set("section")} maxLength={30} readOnly={Boolean(onFile)} placeholder="BSCS 3-4" autoComplete="off" required /></label>
      </div>
      {onFile && <p className="text-sm font-bold">{reg ? "Already on the guest list." : "Already on file, so the name and section stay as they are."}</p>}
      {full && <p className="text-sm font-bold">This event is full, so they'll go on the waitlist instead of checking in.</p>}
      {error && <p className="font-bold" role="alert">{error}</p>}
      <div className="flex flex-col gap-2 mt-auto">
        <button className="btn btn-on" type="submit" disabled={busy} autoFocus={Boolean(onFile)}>
          <UserPlus size={16} /> {busy ? "Saving…" : reg ? "Check in" : full ? "Add to waitlist" : "Add and check in"}
        </button>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-on flex-1" type="button" onClick={onManual}><Keyboard size={16} /> Manual entry</button>
          <button className="btn btn-on flex-1" type="button" onClick={onReset}>Next attendee</button>
        </div>
      </div>
    </form>
  );
}

export function ResultPanel({ phase, result, camera, live, capacity, data, onAdd, onOpenAdd, onReset, onConfirm, onNone, onManual, scanMode }) {
  if (phase === "ocr" || phase === "face" || phase === "checking") {
    const title = phase === "checking" ? "Checking the guest list" : phase === "face" ? "Matching face" : "Reading student number";
    const text = phase === "checking" ? "One moment." : phase === "face" ? "Keep still." : "Keep the ID still.";
    return (
      <div className="result idle">
        <div className="state"><ScanLine size={24} color="var(--accent)" /> {title}</div>
        <p className="muted text-lg">{text}</p>
      </div>
    );
  }
  
  if (!result) {
    const liveText = scanMode === "face"
      ? "Camera is live. Ask the attendee to look directly at the camera. When a face is recognized, check the name shown and confirm. If nothing happens, use manual entry."
      : scanMode === "ocr"
      ? "Camera is live. Ask the attendee to hold their student ID up to the camera, close and steady. It checks in by itself as soon as it reads the student number. If nothing happens, use manual entry."
      : "Camera is live. Ask the attendee to look at the camera or hold up their student ID. ID reads check in by themselves; face matches ask you to confirm the name. If nothing happens, use manual entry.";

    const pausedText = scanMode === "face" 
      ? "Ask the attendee to look at the camera." 
      : scanMode === "ocr" 
      ? "Ask the attendee to hold their student ID up to the camera." 
      : "Ask the attendee to look at the camera or hold up their ID.";

    return (
      <div className="result idle">
        <div className="state">{camera ? <ScanLine size={24} color="var(--accent)" /> : <AlertTriangle size={24} color="var(--warn)" />} {camera ? "Ready for the next attendee" : "Scanning paused"}</div>
        <p className="muted text-lg">{camera
          ? (live ? liveText : pausedText)
          : "The camera is off. Use manual entry to keep checking attendees in."}</p>
      </div>
    );
  }

  const Meta = ({ s }) => (
    <dl className="meta">
      <dt>Student number</dt><dd className="font-bold">{s.id}</dd>
      <dt>Section</dt><dd className="font-bold">{s.section || "Not on file"}</dd>
    </dl>
  );

  switch (result.type) {
    case "approved":
      return (
        <div className="result ok">
          <div className="state"><CheckCircle2 size={28} /> Checked in</div>
          <div className="who">{formatName(result.student)}</div>
          <Meta s={result.student} />
          <p className="font-bold">
            {result.method === "qr" && "Identified by QR ticket"}
            {result.method === "barcode" && "Identified by ID barcode"}
            {result.method === "face" && `Identified by Face Scan, ${sure(result.confidence)} match`}
            {result.method === "ocr" && `Identified by OCR, ${sure(result.confidence)} sure`}
            {result.method === "confirmed" && `Confirmed by operator (SELAE gave ${pct(result.confidence)})`}
            {result.method === "manual" && "Entered manually"}
            {` at ${fmtTime(result.time)}`}
          </p>
          {result.added && <p className="font-bold">Added to the guest list.</p>}
          {result.learned && <p className="text-sm flex items-center gap-2"><Brain size={15} /> SELAE learned from this correction.</p>}
          <div className="countdown" aria-hidden="true"><div style={{ animationDuration: "3.5s" }} /></div>
        </div>
      );
    case "checkout":
      return (
        <div className="result dup">
          <div className="state"><LogOut size={28} /> Checked out</div>
          <div className="who">{formatName(result.student)}</div>
          <Meta s={result.student} />
          <p className="font-bold">Out at {fmtTime(result.time)}. Checked in at {fmtTime(result.checkin.time)}.</p>
          <div className="countdown" aria-hidden="true"><div style={{ animationDuration: "3.5s" }} /></div>
        </div>
      );
    case "dupout":
      return (
        <div className="result dup">
          <div className="state"><History size={28} /> Already checked out</div>
          <div className="who">{formatName(result.student)}</div>
          <Meta s={result.student} />
          <p className="font-bold">Checked in at {fmtTime(result.previous.time)} and out at {fmtTime(result.checkout.time)}. Nothing new was recorded.</p>
          <div className="countdown" aria-hidden="true"><div style={{ animationDuration: "5s" }} /></div>
        </div>
      );
    case "dup":
      return (
        <div className="result dup">
          <div className="state"><History size={28} /> Already checked in</div>
          <div className="who">{formatName(result.student)}</div>
          <Meta s={result.student} />
          <p className="font-bold">Checked in at {fmtTime(result.previous.time)} ({METHOD_LABEL[result.previous.method]}). {afterText(result.checkoutAfterMinutes)}</p>
          <div className="countdown" aria-hidden="true"><div style={{ animationDuration: "5s" }} /></div>
        </div>
      );
    case "notlisted":
      return (
        <div className="result warn">
          <div className="state"><HelpCircle size={28} /> Student not on the list yet</div>
          <div className="who">{result.number}</div>
          <div className="flex flex-col gap-2 mt-auto">
            <button className="btn btn-on" onClick={onOpenAdd} autoFocus><UserPlus size={16} /> Add student</button>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-on flex-1" onClick={onManual}><Keyboard size={16} /> Manual entry</button>
              <button className="btn btn-on flex-1" onClick={onReset}>Next attendee</button>
            </div>
          </div>
        </div>
      );
    case "add":
      return <AddStudentForm key={`${result.title}|${result.initial.studentId || result.initial.last}`} result={result} data={data} onAdd={onAdd} onManual={onManual} onReset={onReset} />;
    case "waitlist":
      return (
        <div className="result bad">
          <div className="state"><Clock size={28} /> On the waitlist</div>
          <div className="who">{formatName(result.student)}</div>
          <Meta s={result.student} />
          <p className="font-bold">This guest registered after the event filled up and hasn't been given a spot. An organizer can move them to going from the dashboard.</p>
          <button className="btn btn-on mt-auto" onClick={onReset} autoFocus>Next attendee</button>
        </div>
      );
    case "wrongevent":
      return (
        <div className="result bad">
          <div className="state"><CalendarX size={28} /> Ticket for a different event</div>
          <div className="who">{result.student ? formatName(result.student) : "Unknown guest"}</div>
          <p className="font-bold">
            This QR ticket is for {result.otherEvent ? `“${result.otherEvent.title}” on ${fmtDateShort(result.otherEvent.startsAt)}` : "another event"}, not this one.
          </p>
          <button className="btn btn-on mt-auto" onClick={onReset} autoFocus>Next attendee</button>
        </div>
      );
    case "full":
      return (
        <div className="result bad">
          <div className="state"><Ban size={28} /> Venue at capacity</div>
          <div className="who">{formatName(result.student)}</div>
          <Meta s={result.student} />
          <p className="font-bold">The venue has reached its {capacity}-person limit. Hold entry and notify an organizer before admitting anyone else.</p>
          <button className="btn btn-on mt-auto" onClick={onReset} autoFocus>Next attendee</button>
        </div>
      );
    case "confirm":
      return (
        <div className="result warn">
          <div className="state"><AlertTriangle size={28} /> Confirm this attendee</div>
          <p className="text-lg">{result.face
            ? "This face looks like someone on file, but not closely enough to decide alone. Compare the face with the names below, or check their student ID."
            : <>SELAE read <strong>{result.read}</strong> but isn't sure enough to decide alone. Check the ID and choose the matching student.</>}</p>
          <p className="text-sm font-bold" style={{ marginBottom: -4 }}>Is it this student? Tap the right one to check them in.</p>
          <div className="flex flex-col gap-2">
            {result.candidates.filter((c) => c.p >= 0.01).map((c, i) => (
              <button key={c.student.id} className="cand" onClick={() => onConfirm(c)} autoFocus={i === 0}
                aria-label={`Check in ${formatName(c.student)}, ${pct(c.p)} match`}>
                <span className="min-w-0">
                  <span className="font-bold text-lg block">{formatName(c.student)}</span>
                  <span>{result.face ? <span className="mono">{c.student.id}</span> : <DigitDiff id={c.student.id} read={result.read} />}{c.student.section ? `, ${c.student.section}` : ""}</span>
                  {c.status !== "going" && <span className="block text-sm font-bold">{STATUS_NOTE[c.status]}</span>}
                  <span className="block text-sm" style={{ opacity: .8 }}>{pct(c.p)} match</span>
                </span>
                <span className="cand-go">Check in <ChevronRight size={16} /></span>
              </button>
            ))}
          </div>
          {result.pUnknown >= 0.01 && <p className="text-sm">{pct(result.pUnknown)} chance it's someone not on file. Underlined digits differ from what was read.</p>}
          <button className="btn btn-on mt-auto" onClick={onNone}>{result.face ? "None of these, type it instead" : "None of these, add student"}</button>
        </div>
      );
    case "lowmatch":
      return (
        <div className="result warn">
          <div className="state"><HelpCircle size={28} /> No confident match</div>
          <p className="text-lg">
            {result.face ? (
              <>
                This face doesn't closely match anyone on file.
                They may not have registered, or the lighting or angle is off. Check their student ID and type the number or name.
              </>
            ) : (
              <>
                SELAE read <strong>{result.read}</strong> but couldn't match it to anyone with confidence
                {result.best ? <> (closest: {formatName(result.best.student)}, {pct(result.best.p)})</> : null}.
                Check the ID and type the student number or name. Your answer teaches SELAE how this camera misreads digits.
              </>
            )}

          </p>
          <div className="flex flex-col gap-2 mt-auto">
            <button className="btn btn-on" onClick={onManual} autoFocus><Keyboard size={16} /> Go to manual entry</button>
            <button className="btn btn-on" onClick={onReset}>Next attendee</button>
          </div>
        </div>
      );
    case "unknown":
      return (
        <div className="result warn">
          <div className="state"><HelpCircle size={28} /> Not a ticket for this system</div>
          <p className="text-lg">The code read <strong style={{ wordBreak: "break-all" }}>{result.read}</strong>, but it isn't a SELAE ticket or a student number on file. Check the ticket, then type the student number or name in manual entry.</p>
          <div className="flex flex-col gap-2 mt-auto">
            <button className="btn btn-on" onClick={onManual} autoFocus><Keyboard size={16} /> Go to manual entry</button>
            <button className="btn btn-on" onClick={onReset}>Next attendee</button>
          </div>
        </div>
      );
    case "error":
      return (
        <div className="result warn">
          <div className="state"><WifiOff size={28} /> Couldn't check in</div>
          <p className="text-lg">{result.message}</p>
          <button className="btn btn-on mt-auto" onClick={onReset} autoFocus>OK</button>
        </div>
      );
    default:
      return (
        <div className="result warn">
          <div className="state"><HelpCircle size={28} /> Couldn't read this ID</div>
          <p className="text-lg">{"The student number could not be read. Type the student number or name in manual entry."}</p>
          <button className="btn btn-on mt-auto" onClick={onManual}><Keyboard size={16} /> Go to manual entry</button>
        </div>
      );
  }
}
