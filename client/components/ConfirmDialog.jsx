import { useEffect, useRef, useState } from "react";
import { CircleQuestionMark, TriangleAlert } from "lucide-react";

/* The app's own "are you sure?" box, in place of the browser's confirm().
   const ok = await askConfirm({ title, message, confirm: "Send password", danger: true });
   Mounted once, in App, as <ConfirmHost />. */

export function askConfirm(options) {
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent("selae:confirm", { detail: { ...options, resolve } }));
  });
}

export function ConfirmHost() {
  const [ask, setAsk] = useState(null);
  const yes = useRef(null);
  useEffect(() => {
    const show = (e) => setAsk(e.detail);
    window.addEventListener("selae:confirm", show);
    return () => window.removeEventListener("selae:confirm", show);
  }, []);
  useEffect(() => {
    if (!ask) return undefined;
    yes.current?.focus();
    const esc = (e) => { if (e.key === "Escape") answer(false); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [ask]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ask) return null;
  function answer(ok) { ask.resolve(ok); setAsk(null); }
  const Icon = ask.danger ? TriangleAlert : CircleQuestionMark;

  return (
    <div className="modal-bg" onPointerDown={(e) => { if (e.target === e.currentTarget) answer(false); }}>
      <div className="modal flex flex-col gap-3" role="alertdialog" aria-modal="true" aria-labelledby="confirm-h" aria-describedby="confirm-p" style={{ maxWidth: 420 }}>
        <div className="flex items-start gap-3">
          <span style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
            background: ask.danger ? "#FDECEC" : "var(--accent-soft)", color: ask.danger ? "var(--bad)" : "var(--accent)" }}>
            <Icon size={20} />
          </span>
          <div className="min-w-0">
            <div id="confirm-h" style={{ fontWeight: 700, fontSize: "1.1rem", lineHeight: 1.3 }}>{ask.title}</div>
            <div id="confirm-p" className="muted text-sm" style={{ marginTop: 6, overflowWrap: "anywhere" }}>{ask.message}</div>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2" style={{ marginTop: 6 }}>
          <button className="btn btn-ghost" onClick={() => answer(false)}>{ask.cancel || "Cancel"}</button>
          <button ref={yes} className="btn btn-primary" onClick={() => answer(true)}
            style={ask.danger ? { background: "var(--bad)", borderColor: "var(--bad)" } : undefined}>
            {ask.confirm || "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
