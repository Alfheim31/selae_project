import { useState } from "react";
import { Check, Eye, EyeOff, KeyRound, LogOut } from "lucide-react";
import { go, Mark, toast } from "../../components/shared.jsx";
import { ErrorBox } from "../../components/ui.jsx";
import { api } from "../../lib/api.js";
import { passwordReset, signOut } from "../../lib/auth.js";

const RULES = [
  ["At least 8 characters", (p) => p.length >= 8],
  ["Letters and numbers", (p) => /[A-Za-z]/.test(p) && /\d/.test(p)],
];

// Shown instead of every page while the account still has the temporary password that was emailed to it,
// or right after a forgot-password code signed the person in (`reset`)
export function ChangePasswordPage({ me, onDone, reset = false }) {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ok = RULES.every(([, test]) => test(password)) && password === again;

  const submit = async (e) => {
    e.preventDefault();
    if (password !== again) { setError("The two passwords don't match."); return; }
    setBusy(true); setError("");
    try {
      await api.changePassword(password);
      passwordReset.clear();
      await onDone();
      toast("Password changed.");
      go("profile");
    } catch (err) { setError(err.message); setBusy(false); }
  };
  const leave = async () => { await signOut(); go(""); };

  return (
    <div className="wrap py-12" style={{ maxWidth: 480 }}>
      <form onSubmit={submit} className="panel flex flex-col gap-4" noValidate style={{ padding: "2rem 1.5rem" }}>
        <div className="flex flex-col items-center gap-2" style={{ textAlign: "center" }}>
          <span style={{ width: 56, height: 56, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center",
            background: "var(--accent-soft)", color: "var(--accent)" }}><KeyRound size={26} /></span>
          <h1 className="panel-title" style={{ fontSize: "1.5rem" }}>{reset ? "Set a new password" : "Choose your own password"}</h1>
          <p className="muted text-sm">
            {reset ? (
              <>The code checked out. Choose a new password for <strong style={{ color: "var(--text)", overflowWrap: "anywhere" }}>{me.org ? me.org.name : me.email}</strong>.</>
            ) : (
              <>You signed in to <strong style={{ color: "var(--text)" }}>{me.org ? me.org.name : me.email}</strong> with the
                temporary password from your email. Set a new one to keep the account safe. Only you will know it.</>
            )}
          </p>
        </div>
        <label><span className="lbl">New password</span>
          <span style={{ position: "relative", display: "block" }}>
            <input className="inp" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} maxLength={72}
              autoComplete="new-password" autoFocus required style={{ paddingRight: "2.8rem" }} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShow((x) => !x)} aria-label={show ? "Hide password" : "Show password"}
              style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", padding: ".3rem .45rem" }}>
              {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </span>
        </label>
        <label><span className="lbl">Type it again</span>
          <input className="inp" type={show ? "text" : "password"} value={again} onChange={(e) => setAgain(e.target.value)} maxLength={72} autoComplete="new-password" required />
        </label>
        <ul className="text-sm flex flex-col gap-1">
          {[...RULES, ["Both match", () => password && password === again]].map(([label, test]) => {
            const met = test(password);
            return (
              <li key={label} className="flex items-center gap-2" style={{ color: met ? "var(--ok)" : "var(--muted)" }}>
                <Check size={15} style={{ opacity: met ? 1 : 0.35 }} /> {label}
              </li>
            );
          })}
        </ul>
        {error && <ErrorBox message={error} />}
        <button className="btn btn-primary" type="submit" disabled={busy || !ok} style={{ padding: ".75rem 1rem" }}>
          {busy ? "Saving…" : "Save new password"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={leave}><LogOut size={15} /> Sign out instead</button>
      </form>
      <div className="flex justify-center mt-4" style={{ opacity: 0.6 }}><Mark /></div>
    </div>
  );
}
