

export const EMPTY_STUDENT = { first: "", middle: "", last: "", suffix: "", studentId: "", section: "" };

export function StudentFields({ f, set }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label><span className="lbl">Given name</span><input className="inp" value={f.first} onChange={set("first")} autoComplete="given-name" required /></label>
      <label><span className="lbl">Middle name or initial <span className="faint">(optional)</span></span><input className="inp" value={f.middle} onChange={set("middle")} autoComplete="additional-name" /></label>
      <label><span className="lbl">Surname</span><input className="inp" value={f.last} onChange={set("last")} autoComplete="family-name" required /></label>
      <label><span className="lbl">Suffix <span className="faint">(optional)</span></span>
        <select className="inp" value={f.suffix} onChange={set("suffix")}>
          {SUFFIXES.map((s) => <option key={s} value={s}>{s || "None"}</option>)}
        </select>
      </label>
      <label><span className="lbl">Student number</span><input className="inp mono" value={f.studentId} onChange={set("studentId")} placeholder="2024-12345" inputMode="numeric" required /></label>
      <label><span className="lbl">Section</span><input className="inp" value={f.section} onChange={set("section")} placeholder="BSCS 3-4" required /></label>
    </div>
  );
}

export const SUFFIXES = ["", "Jr.", "Sr.", "II", "III", "IV"];
