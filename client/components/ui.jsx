import { useEffect, useState } from "react";

/* ---------------- shared bits ---------------- */
export function usePolled(load, deps, ms) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const run = () => load().then((d) => { if (alive) { setData(d); setError(""); } }).catch((e) => { if (alive) setError(e.message); });
    run();
    const t = ms ? setInterval(run, ms) : 0;
    return () => { alive = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return [data, error, setData];
}

export function Loading() {
  return <div className="flex justify-center py-16"><div className="spin" aria-label="Loading" /></div>;
}

export function ErrorBox({ message }) {
  return <div className="alert err" role="alert">{message}</div>;
}
