/* The organization report as an A4 PDF, drawn in the browser (loaded only when someone downloads it) */
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { pctText, periodLabel, typeLabel } from "./report.js";

const INK = [20, 27, 58], MUTED = [94, 102, 132], LINE = [220, 226, 238], ACCENT = [53, 80, 212], SOFT = [199, 208, 242], RAISED = [244, 246, 251];
const PAGE_W = 210, PAGE_H = 297, M = 16, W = PAGE_W - 2 * M;
const CHART_MAX = 20;

export function buildReportPdf(report, summary) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const period = periodLabel(report.from, report.to);
  let y = M;
  const room = (h) => { if (y + h > PAGE_H - M - 8) { doc.addPage(); y = M; } };
  // keep: the height of what follows, so a heading never sits alone at the bottom of a page
  const heading = (text, keep = 0) => {
    room(14 + keep);
    doc.setFont("helvetica", "bold"); doc.setFontSize(12.5); doc.setTextColor(...INK);
    doc.text(text, M, y + 5);
    y += 10;
  };

  // Title
  doc.setFillColor(...ACCENT); doc.rect(0, 0, PAGE_W, 4, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...ACCENT);
  doc.text("SELAE  ·  ADMIN REPORT", M, y + 4);
  doc.setFontSize(20); doc.setTextColor(...INK);
  doc.text("Organization activity report", M, y + 13);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(...MUTED);
  doc.text(`${period}  ·  generated ${new Date(report.generatedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`, M, y + 20);
  const by = report.generatedBy;
  if (by) {
    const who = by.name ? `${by.name} (${by.email})` : by.email;
    doc.setFontSize(9.5);
    doc.text(fit(doc, `Downloaded by ${who}  ·  ${by.role || "Superadmin"}`, W), M, y + 25.5);
    y += 5;
  }
  y += 28;

  // Summary figures
  const t = summary.totals;
  const tiles = [
    ["Events conducted", String(t.conducted)],
    ["Students checked in", String(t.attended)],
    ["Turnout", pctText(t.rate)],
    ["Upcoming in period", String(t.upcoming)],
  ];
  const tw = (W - 3 * 4) / 4;
  tiles.forEach(([label, value], i) => {
    const x = M + i * (tw + 4);
    doc.setFillColor(...RAISED); doc.setDrawColor(...LINE); doc.roundedRect(x, y, tw, 20, 2.5, 2.5, "FD");
    doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...INK); doc.text(value, x + 4, y + 9.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED); doc.text(label.toUpperCase(), x + 4, y + 15.5);
  });
  y += 26;
  doc.setFontSize(8.5); doc.setTextColor(...MUTED);
  doc.text("Turnout: of the students going to events that have ended, the share who checked in at the gate.", M, y);
  y += 8;

  // What the numbers say
  heading("Key findings");
  doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(...INK);
  for (const line of summary.conclusions) {
    const wrapped = doc.splitTextToSize(line, W - 6);
    room(wrapped.length * 5 + 2);
    doc.setFillColor(...ACCENT); doc.circle(M + 1.2, y - 1.2, 0.9, "F");
    doc.text(wrapped, M + 5, y);
    y += wrapped.length * 5 + 2;
  }
  y += 4;

  const orgs = summary.orgs;
  const label = (o) => (o.disabled ? `${o.name} (deactivated)` : o.name);

  // The charts show organizations that had events, at most CHART_MAX of them (each fits on one page);
  // every organization is in the table after them
  const note = (shown, of) => {
    if (shown >= of) return;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...MUTED);
    doc.text(`The ${shown} most active of ${of} organizations with events; all are in the table below.`, M, y + 2);
    y += 5;
  };

  // Chart 1: events conducted, one bar per organization
  const held = orgs.filter((o) => o.conducted > 0);
  const chart1 = held.slice(0, CHART_MAX).map((o) => ({ label: label(o), values: [o.conducted] }));
  if (chart1.length) {
    heading("Events conducted per organization", barsHeight(chart1) + 5);
    note(chart1.length, held.length);
    y += bars(doc, M, y, W, chart1, [ACCENT]) + 6;
  }

  // Chart 2: going vs checked in, per organization (same unit, one axis)
  const came = orgs.filter((o) => o.going > 0);
  const chart2 = came.slice(0, CHART_MAX).map((o) => ({ label: label(o), values: [o.going, o.attended] }));
  if (chart2.length) {
    heading("Going vs. checked in, events that have ended", barsHeight(chart2) + 11);
    note(chart2.length, came.length);
    legend(doc, M, y, [["Going", SOFT], ["Checked in", ACCENT]]);
    y += 6;
    y += bars(doc, M, y, W, chart2, [SOFT, ACCENT]) + 6;
  }

  // Table per organization
  heading("By organization");
  autoTable(doc, {
    startY: y, margin: { left: M, right: M },
    head: [["Organization", "Kind", "Conducted", "Upcoming", "Going", "Checked in", "Turnout", "Avg. per event"]],
    body: orgs.map((o) => [label(o), typeLabel(o.type), o.conducted, o.upcoming, o.going, o.attended, pctText(o.rate),
      o.perEvent === null ? "—" : o.perEvent.toFixed(1)]),
    ...tableStyle,
    columnStyles: { 0: { cellWidth: 46 }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" } },
    didParseCell: (c) => { if (c.section === "body" && orgs[c.row.index]?.disabled) c.cell.styles.textColor = MUTED; },
  });
  y = doc.lastAutoTable.finalY + 10;

  // Every event in the period
  heading("Events in this period");
  const rows = [];
  for (const o of orgs) for (const e of o.events) {
    rows.push([o.name, e.title, new Date(e.startsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      e.isPast ? "Ended" : "Upcoming", e.going, e.isPast ? e.attended : "—", e.isPast ? pctText(e.going ? Math.min(1, e.attended / e.going) : null) : "—"]);
  }
  if (rows.length) {
    autoTable(doc, {
      startY: y, margin: { left: M, right: M },
      head: [["Organization", "Event", "Date", "Status", "Going", "Checked in", "Turnout"]],
      body: rows, ...tableStyle,
      columnStyles: { 0: { cellWidth: 38 }, 1: { cellWidth: 52 }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } },
    });
    y = doc.lastAutoTable.finalY + 6;
  } else {
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...MUTED);
    doc.text("No organization events in this period.", M, y + 2);
    y += 8;
  }
  if (summary.otherHosts) {
    room(8);
    doc.setFontSize(8.5); doc.setTextColor(...MUTED);
    doc.text(`Not counted above: ${summary.otherHosts} event${summary.otherHosts === 1 ? "" : "s"} by hosts without an organization account.`, M, y + 2);
  }

  // Page numbers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text(`SELAE organization activity report  ·  ${period}`, M, PAGE_H - 8);
    doc.text(`Page ${i} of ${pages}`, PAGE_W - M, PAGE_H - 8, { align: "right" });
  }
  return doc;
}

const tableStyle = {
  theme: "plain",
  styles: { font: "helvetica", fontSize: 8.5, textColor: INK, cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 }, lineColor: LINE, lineWidth: { bottom: 0.2 } },
  headStyles: { fontStyle: "bold", textColor: MUTED, fillColor: RAISED, fontSize: 7.5 },
};

// Horizontal bars, one row per item; several values per row sit side by side on one shared scale.
// Kept on one page: the caller makes room for barsHeight() first. Returns the height used.
const BAR_H = 3.6, BAR_GAP = 0.8, ROW_PAD = 3.5;
const rowHeight = (item) => item.values.length * (BAR_H + BAR_GAP) + ROW_PAD;
function barsHeight(items) { return items.reduce((h, i) => h + rowHeight(i), 0) + 6; }
function bars(doc, x, y, w, items, colors) {
  if (!items.length) return 0;
  const labelW = 58, valueW = 10, plotW = w - labelW - valueW;
  const max = Math.max(1, ...items.flatMap((i) => i.values));
  const step = niceStep(max);
  const height = items.reduce((h, i) => h + rowHeight(i), 0);
  // Recessive gridlines and their values under the plot
  doc.setDrawColor(...LINE); doc.setLineWidth(0.2);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...MUTED);
  for (let v = 0; v <= max; v += step) {
    const gx = x + labelW + (v / max) * plotW;
    doc.line(gx, y - 1, gx, y + height - ROW_PAD + 1);
    doc.text(String(v), gx, y + height + 1.5, { align: "center" });
  }
  let top = y;
  for (const item of items) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...INK);
    const lines = doc.splitTextToSize(item.label, labelW - 6);
    doc.text(lines.length > 1 ? `${lines[0].replace(/\s+$/, "")}…` : lines[0], x, top + (item.values.length * (BAR_H + BAR_GAP)) / 2 + 1);
    item.values.forEach((v, k) => {
      const by = top + k * (BAR_H + BAR_GAP);
      const bw = (v / max) * plotW;
      doc.setFillColor(...colors[k]);
      if (bw > 0) doc.roundedRect(x + labelW, by, Math.max(bw, 0.8), BAR_H, 0.8, 0.8, "F");
      doc.setFontSize(7.5); doc.setTextColor(...MUTED);
      doc.text(String(v), x + labelW + bw + 1.5, by + BAR_H - 0.6);
    });
    top += rowHeight(item);
  }
  return height + 4;
}

function legend(doc, x, y, entries) {
  let cx = x;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...INK);
  for (const [name, color] of entries) {
    doc.setFillColor(...color); doc.roundedRect(cx, y - 2.6, 3, 3, 0.6, 0.6, "F");
    doc.text(name, cx + 4.5, y);
    cx += 6 + doc.getTextWidth(name) + 6;
  }
}

function niceStep(max) {
  const raw = max / 5;
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) || pow * 10;
}

// One line of text cut to a width, with "…"
function fit(doc, text, w) {
  if (doc.getTextWidth(text) <= w) return text;
  let s = text;
  while (s.length > 1 && doc.getTextWidth(`${s}…`) > w) s = s.slice(0, -1);
  return `${s.replace(/\s+$/, "")}…`;
}

/* Saves the PDF and hands back { url, name } so the page can open the same file in a new tab.
   The caller frees the url (URL.revokeObjectURL) when it's done with it. */
export async function downloadReportPdf(report, summary) {
  const doc = buildReportPdf(report, summary);
  const a = new Date(report.from), slug = periodLabel(report.from, report.to).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const name = `selae-organizations-${slug || a.toISOString().slice(0, 10)}.pdf`;
  const url = URL.createObjectURL(doc.output("blob"));
  const link = document.createElement("a");
  link.href = url; link.download = name;
  document.body.appendChild(link); link.click(); link.remove();
  return { url, name };
}
