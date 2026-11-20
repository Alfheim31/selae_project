import { useEffect, useRef, useState } from "react";
import { CircleQuestionMark, TriangleAlert } from "lucide-react";

/* The app's own "are you sure?" box, in place of the browser's confirm().
   const ok = await askConfirm({ title, message, confirm: "Send password", danger: true, icon: LogOut });
   Mounted once, in App, as <ConfirmHost />. Same look as the report's download pop-up: a centred card
   with a round icon on top and the buttons stacked under the text. */

export function askConfirm(options) {
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent("selae:confirm", { detail: { ...options, resolve } }));
  });
}

const CSS = `
.cf-card{max-width:360px;width:100%;display:flex;flex-direction:column;align-items:center;text-align:center;gap:.6rem;padding:2rem 1.6rem 1.6rem;border-radius:24px}
.cf-badge{width:68px;height:68px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;margin-bottom:.35rem}
.cf-title{font-weight:800;font-size:1.45rem;line-height:1.2}
.cf-text{max-width:290px;overflow-wrap:anywhere;line-height:1.5}
.cf-acts{display:flex;flex-direction:column;gap:.45rem;width:100%;max-width:220px;margin-top:.7rem}
.cf-acts .btn{width:100%;justify-content:center}
`;

export function ConfirmHost() {
  const [ask, setAsk] = useState(null);
  const yes = useRef(null), no = useRef(null);
  useEffect(() => {
    const show = (e) => setAsk(e.detail);
    window.addEventListener("selae:confirm", show);
    return () => window.removeEventListener("selae:confirm", show);
  }, []);
  useEffect(() => {
    if (!ask) return undefined;
    // A risky action starts on Cancel, so Enter alone never does it
    (ask.danger ? no : yes).current?.focus();
    const esc = (e) => { if (e.key === "Escape") answer(false); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [ask]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ask) return null;
  function answer(ok) { ask.resolve(ok); setAsk(null); }
  const Icon = ask.icon || (ask.danger ? TriangleAlert : CircleQuestionMark);
  const color = ask.danger ? "var(--bad)" : "var(--accent)";
  const glow = ask.danger ? "rgba(212,67,59,.5)" : "rgba(53,80,212,.5)";

  return (
    <div className="modal-bg" onPointerDown={(e) => { if (e.target === e.currentTarget) answer(false); }}>
      <style>{CSS}</style>
      <div className="modal cf-card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-h" aria-describedby="confirm-p">
        <span className="cf-badge" style={{ background: color, boxShadow: `0 10px 24px -8px ${glow}` }}>
          <Icon size={32} strokeWidth={2.4} />
        </span>
        <div id="confirm-h" className="cf-title" style={{ color }}>{ask.title}</div>
        <div id="confirm-p" className="muted text-sm cf-text">{ask.message}</div>
        <div className="cf-acts">
          <button ref={yes} className="btn" style={{ background: color, borderColor: color, color: "#fff" }} onClick={() => answer(true)}>
            {ask.confirm || "OK"}
          </button>
          <button ref={no} className="btn btn-ghost" onClick={() => answer(false)}>{ask.cancel || "Cancel"}</button>
        </div>
      </div>
    </div>
  );
}
