import { Brain } from "lucide-react";
import { fmtTime, pct } from "../../components/shared.jsx";
import { api } from "../../lib/api.js";
import { askConfirm } from "../../components/ConfirmDialog.jsx";
import { sure } from "./ScanResult.jsx";

/* ---------------- intelligent matcher ---------------- */
/* OCR matcher panel */
const DECISION_LABEL = { auto: "Identified automatically", confirm: "Asked the operator", reject: "No confident match" };

const RESOLUTION_LABEL = { auto: "auto", confirmed: "operator picked", manual: "typed by operator", none: "none of these" };

export function MatcherPanel({ m, onToast, refresh }) {
  const { scans } = m;
  const resetModel = async () => {
    const ok = await askConfirm({ title: "Reset the matcher?", confirm: "Reset", danger: true,
      message: "SELAE forgets everything it has learned about how this camera misreads digits, and starts again from its built-in guesses." });
    if (!ok) return;
    try { await api.resetMatcher(); onToast("Matcher reset to its starting beliefs"); refresh(); }
    catch (e) { onToast(e.message); }
  };
  const digitLabel = (d) => (d == null ? "nothing" : String(d));
  return (
    <section className="panel p-4 md:p-5 min-w-0 lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div style={{ maxWidth: 760 }}>
          <h3 className="font-bold text-lg flex items-center gap-2"><Brain size={19} /> OCR matcher</h3>
          <p className="muted mt-1">
            When a code won't scan, SELAE reads the printed student number and works out who it most likely belongs to, using how
            OCR tends to misread digits and who is expected at this event. It decides alone above {pct(m.thresholds.autoAt)} certainty,
            asks the operator from {pct(m.thresholds.confirmAt)}, and learns from every correction.
          </p>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={resetModel}>Reset learning</button>
      </div>

      <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
        <div><dt className="text-sm muted">OCR reads</dt><dd className="text-2xl font-bold">{scans.total}</dd>
          <dd className="text-sm faint">{scans.auto} automatic, {scans.confirm} asked, {scans.reject} no match{scans.demo ? `; ${scans.demo} demo reads not counted` : ""}</dd></div>
        <div><dt className="text-sm muted">Right student ranked first</dt>
          <dd className="text-2xl font-bold">{scans.labelled ? pct(scans.top1 / scans.labelled) : "No data"}</dd>
          <dd className="text-sm faint">{scans.labelled ? `${scans.top1} of ${scans.labelled} reads an operator resolved; top 3: ${scans.top3}` : "Appears once an operator resolves a read"}</dd></div>
        <div><dt className="text-sm muted">Corrections learned</dt><dd className="text-2xl font-bold">{m.corrections}</dd>
          <dd className="text-sm faint">{m.updatedAt ? `Last at ${fmtTime(new Date(m.updatedAt))}` : "None yet, across all events"}</dd></div>
        <div><dt className="text-sm muted">Chance a digit reads correctly</dt>
          <dd className="text-2xl font-bold">{pct(m.digitAccuracy.now)}</dd>
          <dd className="text-sm faint">Started at {pct(m.digitAccuracy.prior)}; changes as corrections come in</dd></div>
      </dl>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <div>
          <div className="font-bold mb-2">Misreads learned at this venue</div>
          {m.topConfusions.length ? (
            <ul className="flex flex-col gap-1">
              {m.topConfusions.map((c) => (
                <li key={`${c.true}-${c.read}`} className="flex justify-between gap-3">
                  <span><strong>{c.true}</strong> read as <strong>{digitLabel(c.read)}</strong></span>
                  <span className="muted">{c.count} {c.count === 1 ? "time" : "times"}</span>
                </li>
              ))}
            </ul>
          ) : <p className="muted text-sm">Nothing yet. When an operator picks or types the right student after an unsure read, the digits that were misread show up here.</p>}
        </div>
        <div>
          <div className="font-bold mb-2">Recent reads</div>
          {m.recent.length ? (
            <ul className="flex flex-col gap-1 text-sm">
              {m.recent.map((r, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-x-3">
                  <span><span className="font-bold">{r.read}</span> <span className="muted">{DECISION_LABEL[r.decision]}{r.top ? `, ${sure(r.top.p)}` : ""}</span></span>
                  <span className="faint">{r.demo ? "Demo, " : ""}{r.resolution ? RESOLUTION_LABEL[r.resolution] : "open"}{r.learned && r.learned.length ? `, learned ${r.learned.join(", ")}` : ""}</span>
                </li>
              ))}
            </ul>
          ) : <p className="muted text-sm">No OCR reads at this event yet.</p>}
        </div>
      </div>
    </section>
  );
}
