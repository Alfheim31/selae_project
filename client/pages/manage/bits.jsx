import { Ban, CalendarX, CheckCircle2, Clock, HelpCircle, History, XCircle } from "lucide-react";
import { fmtDateShort, fmtTime, METHOD_LABEL, METHOD_SHORT, OUTCOME_LABEL, pct } from "../../components/shared.jsx";

/* ---------------- dashboard ---------------- */
export function arrivalBuckets(checkins, now, opens, ends) {
  const times = [...checkins.values()].map((c) => c.time.getTime());
  let start = times.length ? Math.min(opens.getTime(), ...times) : opens.getTime();
  let end = Math.min(now.getTime(), ends.getTime());
  if (times.length) end = Math.max(end, Math.max(...times) + 1);
  if (end <= start) return { size: 5, buckets: [] };
  const span = (end - start) / 60000;
  const size = [5, 10, 15, 30, 60, 120, 240, 1440].find((s) => span / s <= 30) || 1440;
  start = Math.floor(start / (size * 60000)) * size * 60000;
  const n = Math.max(1, Math.ceil((end - start) / (size * 60000)));
  const buckets = Array.from({ length: n }, (_, i) => {
    const t = new Date(start + i * size * 60000);
    return { label: size >= 1440 ? fmtDateShort(t) : fmtTime(t), count: 0 };
  });
  for (const t of times) {
    const i = Math.floor((t - start) / (size * 60000));
    if (i >= 0 && i < n) buckets[i].count++;
  }
  return { size, buckets };
}

export const everyLabel = (size) => (size >= 1440 ? "per day" : size >= 60 ? `every ${size / 60} hour${size > 60 ? "s" : ""}` : `every ${size} minutes`);

export const chartTip = { background: "#FFFFFF", border: "1px solid #DCE2EE", borderRadius: 10, color: "#141B3A", boxShadow: "0 12px 28px -12px rgba(20,27,58,.3)" };

export function MethodChip({ method, confidence }) {
  if (!method) return null;
  const conf = (method === "ocr" || method === "face" || method === "confirmed") && confidence != null ? ` ${pct(confidence)}` : "";
  return <span className={`chip ${method}`} title={METHOD_LABEL[method]}>{METHOD_SHORT[method]}{conf}</span>;
}

export function OutcomeIcon({ outcome }) {
  const map = {
    approved: [CheckCircle2, "var(--ok)"], notreg: [XCircle, "#D4433B"], dup: [History, "#3550D4"],
    full: [Ban, "#D4433B"], unresolved: [HelpCircle, "var(--warn)"], waitlist: [Clock, "var(--warn)"], wrongevent: [CalendarX, "#D4433B"],
  };
  const [Icon, color] = map[outcome] || map.unresolved;
  return <Icon size={20} color={color} aria-label={OUTCOME_LABEL[outcome]} />;
}

/* ---------------- analytics ---------------- */
export const METHOD_COLOR = { qr: "#3550D4", barcode: "#8C9BF2", face: "#1E9A61", ocr: "#C5DE45", confirmed: "#E0861B", manual: "#B5BCD0" };
