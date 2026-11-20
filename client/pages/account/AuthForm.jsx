import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Eye, EyeOff, KeyRound, Mail } from "lucide-react";
import { EMPTY_STUDENT, StudentFields } from "../../components/StudentFields.jsx";
import { go, Mark } from "../../components/shared.jsx";
import { ErrorBox } from "../../components/ui.jsx";
import { pendingStudent, returnTo } from "../../lib/account.js";
import { api } from "../../lib/api.js";
import {
  passwordSignIn, passwordSignUp, resendEmailCode, sendPasswordResetCode, signIn, verifyEmailCode, verifyResetCode,
} from "../../lib/auth.js";

// Digits in the email code: Supabase → Authentication → Email → Email OTP Length (6 by default)
const CODE_LENGTH = Number(import.meta.env.VITE_OTP_LENGTH) || 6;
const EMPTY_CODE = () => Array(CODE_LENGTH).fill("");
// Seconds before another code can be sent, so Supabase's email rate limit isn't hit
const RESEND_WAIT = 60;

export function AuthForm() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [code, setCode] = useState(EMPTY_CODE);
  const [wait, setWait] = useState(0);
  const checking = useRef(false);
  const [showPw, setShowPw] = useState(false);
  const [f, setF] = useState(EMPTY_STUDENT);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const creating = mode === "signup";
  // A code was just sent whenever this switches to "verify" or "reset"
  const switchTo = (m) => {
    setMode(m); setError(""); setNotice(""); setCode(EMPTY_CODE());
    setWait(m === "verify" || m === "reset" ? RESEND_WAIT : 0);
  };

  // Signed in: back to the event they were registering for, or Discover. A student with an unfinished
  // profile still sees the profile form first (App.jsx), then lands on that page once it's saved.
  const afterSignIn = () => {
    const back = returnTo.get();
    returnTo.clear();
    go(back || "", { replace: true });
  };

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setNotice("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("Enter a valid email address."); return; }
    if (password.length < 8) { setError("Password should be at least 8 characters."); return; }
    if (creating) {
      if (!f.first.trim() || !f.last.trim()) { setError("Enter your given name and surname."); return; }
      if (!/^\d{4}\s*-?\s*\d{5}$/.test(f.studentId.trim())) { setError("Student number should look like 2024-12345."); return; }
      if (!f.section.trim()) { setError("Enter your section."); return; }
    }
    setBusy(true);
    try {
      // A student number belongs to one account; say so now, not after the email code and face scan
      if (creating) {
        const { available } = await api.studentNumberFree(f.studentId.trim());
        if (!available) {
          setError("This student number already has an account. Sign in to that account instead. If it isn't yours, ask an organizer for help.");
          setBusy(false);
          return;
        }
        pendingStudent.set(email.trim(), f);
      }
      // On success the session changes and this page shows the profile
      if (!creating) { await passwordSignIn(email.trim(), password); afterSignIn(); }
      else if (await passwordSignUp(email.trim(), password)) switchTo("verify");
    } catch (err) {
      if (err.unconfirmed) {
        switchTo("verify");
        try { await resendEmailCode(email.trim()); } catch { /* the earlier code may still work */ }
      } else if (err.exists) {
        // Keep the email, move to Sign in, and drop the details typed for a new account
        pendingStudent.clear();
        switchTo("signin");
        setError(err.message);
      } else setError(err.message);
    }
    setBusy(false);
  };

  // Runs on the button, and by itself once the last digit is in
  const verify = async (e, digits = code) => {
    if (e) e.preventDefault();
    if (checking.current) return;
    setError(""); setNotice("");
    const value = digits.join("");
    if (value.length !== CODE_LENGTH) { setError(`Enter the ${CODE_LENGTH}-digit code from the email.`); return; }
    checking.current = true;
    setBusy(true);
    // On success the session changes and this page shows the profile
    try { await verifyEmailCode(email.trim(), value); afterSignIn(); }
    catch (err) { setError(err.message); setCode(EMPTY_CODE()); }
    checking.current = false;
    setBusy(false);
  };

  const resend = async () => {
    if (wait > 0) return;
    setError(""); setNotice("");
    try {
      await resendEmailCode(email.trim());
      setNotice("New code sent.");
      setCode(EMPTY_CODE());
      setWait(RESEND_WAIT);
    } catch (err) { setError(err.message); }
  };

  // Forgot password, step 1: send a code to the email
  const sendReset = async (e) => {
    if (e) e.preventDefault();
    setError(""); setNotice("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("Enter a valid email address."); return; }
    setBusy(true);
    try { await sendPasswordResetCode(email.trim()); switchTo("reset"); }
    catch (err) { setError(err.message); }
    setBusy(false);
  };

  // Step 2: the code. A correct one signs them in, and the app then asks for the new password (ChangePassword.jsx).
  const checkReset = async (e, digits = code) => {
    if (e) e.preventDefault();
    if (checking.current) return;
    setError(""); setNotice("");
    const value = digits.join("");
    if (value.length !== CODE_LENGTH) { setError(`Enter the ${CODE_LENGTH}-digit code from the email.`); return; }
    checking.current = true;
    setBusy(true);
    try { await verifyResetCode(email.trim(), value); }
    catch (err) { setError(err.message); setCode(EMPTY_CODE()); }
    checking.current = false;
    setBusy(false);
  };

  const resendReset = async () => {
    if (wait > 0) return;
    setError(""); setNotice("");
    try {
      await sendPasswordResetCode(email.trim());
      setNotice("New code sent.");
      setCode(EMPTY_CODE());
      setWait(RESEND_WAIT);
    } catch (err) { setError(err.message); }
  };

  if (mode === "forgot") {
    return (
      <AuthCard>
        <form onSubmit={sendReset} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col items-center gap-2" style={{ textAlign: "center" }}>
            <span className="authicon"><KeyRound size={24} /></span>
            <h1 className="panel-title">Forgot your password?</h1>
            <p className="muted text-sm">Enter your account's email and we'll send you a code to set a new password.</p>
          </div>
          <label><span className="lbl">Email</span>
            <input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} autoComplete="email"
              placeholder="you@gmail.com" autoFocus required />
          </label>
          {error && <ErrorBox message={error} />}
          <button className="btn btn-primary" type="submit" disabled={busy} style={{ padding: ".75rem 1rem" }}>
            {busy ? "Sending…" : "Send code"}
          </button>
          <button type="button" className="linkbtn self-center text-sm" onClick={() => switchTo("signin")}><ArrowLeft size={15} /> Back to sign in</button>
        </form>
      </AuthCard>
    );
  }

  if (mode === "reset") {
    return (
      <AuthCard>
        <form onSubmit={checkReset} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col items-center gap-2" style={{ textAlign: "center" }}>
            <span className="authicon"><Mail size={24} /></span>
            <h1 className="panel-title">Check your email</h1>
            <p className="muted text-sm">
              If <strong style={{ color: "var(--text)", overflowWrap: "anywhere" }}>{email.trim()}</strong> has an account, we sent it a code.
              Enter it below, then you'll choose a new password. If you don't see the email, check your spam folder.
            </p>
          </div>
          <CodeBoxes value={code} onChange={setCode} onComplete={(digits) => checkReset(null, digits)} disabled={busy} invalid={Boolean(error)} />
          {error && <ErrorBox message={error} />}
          {notice && <p className="text-sm" style={{ color: "var(--ok)", fontWeight: 600, textAlign: "center" }}>{notice}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy || code.some((d) => !d)} style={{ padding: ".75rem 1rem" }}>
            {busy ? "Checking…" : "Continue"}
          </button>
          <CodeLinks wait={wait} onResend={resendReset} backLabel="Back to sign in" onBack={() => switchTo("signin")} />
        </form>
      </AuthCard>
    );
  }

  if (mode === "verify") {
    return (
      <AuthCard>
        <form onSubmit={verify} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col items-center gap-2" style={{ textAlign: "center" }}>
            <span className="authicon"><Mail size={24} /></span>
            <h1 className="panel-title">Check your email</h1>
            <p className="muted text-sm">
              We sent a code to <strong style={{ color: "var(--text)", overflowWrap: "anywhere" }}>{email.trim()}</strong>.
              Enter it below to confirm it's yours. If you don't see it, check your spam folder.
            </p>
          </div>
          <CodeBoxes value={code} onChange={setCode} onComplete={(digits) => verify(null, digits)} disabled={busy} invalid={Boolean(error)} />
          {error && <ErrorBox message={error} />}
          {notice && <p className="text-sm" style={{ color: "var(--ok)", fontWeight: 600, textAlign: "center" }}>{notice}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy || code.some((d) => !d)} style={{ padding: ".75rem 1rem" }}>
            {busy ? "Checking…" : "Confirm email"}
          </button>
          <CodeLinks wait={wait} onResend={resend} backLabel="Use a different email" onBack={() => switchTo("signup")} />
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard wide={creating}>
      <div className="flex flex-col items-center gap-2" style={{ textAlign: "center" }}>
        <span className="authicon"><Mark /></span>
        <h1 className="panel-title">{creating ? "Create your account" : "Welcome back"}</h1>
        <p className="muted text-sm" style={{ maxWidth: 400 }}>{creating
          ? "Enter your student details once. After you confirm your email, scan your face and you're set for every event."
          : "Sign in to register for events in one tap."}</p>
      </div>

      <div className="seg" role="group" aria-label="Account" style={{ display: "flex" }}>
        <button type="button" aria-pressed={!creating} style={{ flex: 1, padding: ".5rem" }} onClick={() => switchTo("signin")}>Sign in</button>
        <button type="button" aria-pressed={creating} style={{ flex: 1, padding: ".5rem" }} onClick={() => switchTo("signup")}>Create account</button>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {creating && (
          <>
            <div className="authsec">Student details</div>
            <StudentFields f={f} set={set} />
            <div className="authsec">Account</div>
          </>
        )}
        <label><span className="lbl">Email</span>
          <input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} autoComplete="email"
            placeholder="you@gmail.com" required />
        </label>
        <label><span className="lbl">Password {creating && <span className="faint">(at least 8 characters)</span>}</span>
          <span style={{ position: "relative", display: "block" }}>
            <input className="inp" type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} maxLength={72}
              autoComplete={creating ? "new-password" : "current-password"} required style={{ paddingRight: "2.8rem" }} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowPw((x) => !x)}
              aria-label={showPw ? "Hide password" : "Show password"}
              style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", padding: ".3rem .45rem" }}>
              {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </span>
          {!creating && (
            <span style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
              <button type="button" className="linkbtn text-sm" onClick={() => switchTo("forgot")}>Forgot password?</button>
            </span>
          )}
        </label>
        {error && <ErrorBox message={error} />}
        {notice && <p className="text-sm" style={{ color: "var(--ok)", fontWeight: 600 }}>{notice}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy} style={{ padding: ".75rem 1rem" }}>
          {busy ? "Please wait…" : creating ? "Create account" : "Sign in"}
        </button>
      </form>

      <div className="flex items-center gap-3 faint text-sm">
        <span style={{ flex: 1, height: 1, background: "var(--line)" }} />or<span style={{ flex: 1, height: 1, background: "var(--line)" }} />
      </div>
      <button type="button" className="btn" onClick={signIn} style={{ padding: ".7rem 1rem" }}>
        <GoogleG /> Continue with Google
      </button>
    </AuthCard>
  );
}

function AuthCard({ wide, children }) {
  return (
    <div className="panel flex flex-col gap-5" style={{ maxWidth: wide ? 640 : 440, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <style>{`
        .authicon{width:52px;height:52px;border-radius:14px;display:flex;align-items:center;justify-content:center;
          background:var(--accent-soft);color:var(--accent)}
        .authsec{font-weight:700;font-size:.95rem;padding-bottom:.35rem;border-bottom:1px solid var(--line)}
        .linkbtn{display:inline-flex;align-items:center;gap:.3rem;background:none;border:0;padding:0;color:var(--accent);
          font-weight:600;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
        .linkbtn:hover{color:var(--accent-deep)}
        .otp{display:flex;justify-content:center;gap:.5rem}
        .otp input{flex:1;min-width:0;max-width:3.2rem;height:3.6rem;padding:0;text-align:center;font-size:1.6rem;font-weight:600;caret-color:var(--accent)}
        .otp input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
        .otp.bad input{border-color:var(--bad, #c62f3a)}
      `}</style>
      {children}
    </div>
  );
}

// Under a code: send another (after a countdown) and a way back, styled as links so they don't read as plain text
function CodeLinks({ wait, onResend, backLabel, onBack }) {
  const left = `${Math.floor(wait / 60)}:${String(wait % 60).padStart(2, "0")}`;
  return (
    <div className="flex flex-col items-center gap-3 text-sm" style={{ borderTop: "1px solid var(--line)", paddingTop: 14, textAlign: "center" }}>
      <p className="muted">
        Didn't get the code?{" "}
        {wait > 0
          ? <>You can send a new one in <strong className="mono" style={{ color: "var(--text)" }}>{left}</strong>.</>
          : <button type="button" className="linkbtn" onClick={onResend}>Send a new code</button>}
      </p>
      <button type="button" className="linkbtn" onClick={onBack}><ArrowLeft size={15} /> {backLabel}</button>
    </div>
  );
}

// One box per digit. Typing moves to the next box, Backspace goes back, and a pasted
// or autofilled code fills every box; the last digit hands the code to onComplete.
function CodeBoxes({ value, onChange, onComplete, disabled, invalid }) {
  const boxes = useRef([]);
  const focus = (i) => {
    const el = boxes.current[Math.max(0, Math.min(CODE_LENGTH - 1, i))];
    if (el) { el.focus(); el.select(); }
  };
  // A fresh or cleared code starts at the first box
  useEffect(() => { if (value.every((d) => !d)) focus(0); }, [value]);

  const fill = (start, digits) => {
    const next = value.slice();
    let i = start;
    for (const d of digits) { if (i >= CODE_LENGTH) break; next[i++] = d; }
    onChange(next);
    focus(i);
    if (next.every(Boolean)) onComplete(next);
  };

  return (
    <div className={`otp${invalid ? " bad" : ""}`} role="group" aria-label={`${CODE_LENGTH}-digit code from the email`}>
      {value.map((d, i) => (
        <input key={i} ref={(el) => { boxes.current[i] = el; }} className="inp mono" value={d} disabled={disabled}
          inputMode="numeric" pattern="[0-9]*" autoComplete={i === 0 ? "one-time-code" : "off"} aria-label={`Digit ${i + 1}`}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "");
            if (!digits) { const next = value.slice(); next[i] = ""; onChange(next); return; }
            // Typing over a filled box keeps only the new digit; a phone's autofill brings the whole code
            let typed = digits;
            if (digits.length === 2 && d) typed = digits.startsWith(d) ? digits.slice(1) : digits.slice(0, 1);
            fill(typed.length >= CODE_LENGTH ? 0 : i, typed);
          }}
          onPaste={(e) => {
            e.preventDefault();
            const digits = e.clipboardData.getData("text").replace(/\D/g, "");
            if (digits) fill(digits.length >= CODE_LENGTH ? 0 : i, digits);
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !d && i > 0) {
              e.preventDefault();
              const next = value.slice(); next[i - 1] = ""; onChange(next); focus(i - 1);
            } else if (e.key === "ArrowLeft") { e.preventDefault(); focus(i - 1); }
            else if (e.key === "ArrowRight") { e.preventDefault(); focus(i + 1); }
          }} />
      ))}
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
