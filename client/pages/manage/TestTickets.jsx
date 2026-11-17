import { useMemo } from "react";
import { Printer, ScanLine } from "lucide-react";
import { formatName } from "../../components/shared.jsx";

/* ---------------- test tickets ---------------- */
export function TestTickets({ data, eventId, onOpenScanner }) {
  const groups = useMemo(() => {
    const ticket = (r) => ({ key: r.id, student: data.student(r.studentId) });
    const notReg = [...data.byId.values()].filter((s) => !data.regByStudent.has(s.id)).slice(0, 3);
    return [
      { key: "ok", title: "Going, not yet checked in", expect: "Checks in (green)", list: data.going.filter((r) => !r.checkin).slice(0, 6).map(ticket) },
      { key: "dup", title: "Already checked in", expect: "Already checked in (blue)", list: data.going.filter((r) => r.checkin).slice(0, 3).map(ticket) },
      { key: "wait", title: "On the waitlist", expect: "On the waitlist (red)", list: data.waitlist.slice(0, 3).map(ticket) },
      { key: "notreg", title: "On file, not registered", expect: "Not on the list yet, with Add student (amber)",
        list: notReg.map((s) => ({ key: s.id, student: s })) },
    ].filter((g) => g.list.length);
  }, [data]);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-wrap items-end justify-between gap-4 noprint">
        <div style={{ maxWidth: 720 }}>
          <h2 className="font-bold text-2xl">Test tickets</h2>
          <p className="muted mt-1">
            Student numbers for guests of this event. Print this page, or open it on a phone and hold the screen up to the webcam on
            the scanner. Each group shows the result you should get. The groups update as people check in.
          </p>
          <p className="faint text-sm mt-2">The best test is a real one: register with your student number, then show your student ID to the scanner.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={() => window.print()}><Printer size={17} /> Print</button>
          <button className="btn btn-primary" onClick={onOpenScanner}><ScanLine size={17} /> Open gate scanner</button>
        </div>
      </section>

      {!groups.length && <p className="muted">Nobody is registered yet. Share the event page from Invite &amp; settings.</p>}
      {groups.map((g) => (
        <section key={g.key} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-bold text-lg">{g.title}</h3>
            <span className="text-sm faint">Expected: {g.expect}</span>
          </div>
          {g.note && <p className="text-sm faint" style={{ marginTop: "-.4rem" }}>{g.note}</p>}
          <div className="testgrid">
            {g.list.map((t) => (
              <div key={t.key} className="testcard">
                <div className="font-bold">{formatName(t.student)}</div>
                <div className="text-sm" style={{ color: "#5A6386" }}>{t.student.section}</div>
                <div className="font-bold text-2xl">Student No: {t.student.id.replace("-", "")}</div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
