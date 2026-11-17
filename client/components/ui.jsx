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

/* ---------------- skeletons: grey shapes where the content will appear ---------------- */
export function Sk({ w = "100%", h = 14, r, style }) {
  return <span className="sk" aria-hidden="true" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

// Wraps a skeleton so screen readers hear "Loading" once
function Busy({ children, className = "", style }) {
  return <div className={className} style={style} role="status" aria-busy="true" aria-label="Loading">{children}</div>;
}

// Generic page: title, a few lines, and two blocks
export function Loading() {
  return (
    <Busy className="wrap py-8 flex flex-col gap-5" style={{ maxWidth: 1080 }}>
      <Sk w={120} h={12} />
      <Sk w="45%" h={44} />
      <Sk w="70%" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="sk-card p-5 flex flex-col gap-3"><Sk w="60%" h={18} /><Sk /><Sk w="85%" /></div>
        <div className="sk-card p-5 flex flex-col gap-3"><Sk w="50%" h={18} /><Sk /><Sk w="75%" /></div>
      </div>
    </Busy>
  );
}

// An event card: date block, lines, and the stub with a thumbnail
export function PassSkeleton() {
  return (
    <div className="sk-card flex items-stretch" style={{ overflow: "hidden", minHeight: 132 }}>
      <div className="flex items-center gap-4 p-4 flex-1 min-w-0">
        <div className="flex flex-col items-center gap-1.5" style={{ width: 56 }}><Sk w={34} h={10} /><Sk w={44} h={34} /><Sk w={30} h={10} /></div>
        <div className="flex flex-col gap-2 flex-1 min-w-0"><Sk w="40%" h={10} /><Sk w="80%" h={20} /><Sk w="60%" h={12} /><Sk w={90} h={20} r={999} /></div>
      </div>
      <div className="flex flex-col items-center justify-center gap-2 p-3" style={{ width: 120, borderLeft: "2px dashed var(--line)" }}>
        <Sk w={80} h={60} r={10} /><Sk w={70} h={10} />
      </div>
    </div>
  );
}

export function PassListSkeleton({ count = 4, grid = false }) {
  return (
    <Busy className={grid ? "grid gap-3 lg:grid-cols-2" : "flex flex-col gap-3"}>
      {Array.from({ length: count }, (_, i) => <PassSkeleton key={i} />)}
    </Busy>
  );
}

// Discover below the hero: categories, then the event cards
export function DiscoverSkeleton() {
  return (
    <Busy className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <Sk w={220} h={26} />
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(132px,1fr))" }}>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="sk-card p-3 flex items-center gap-3"><Sk w={38} h={38} r={10} /><div className="flex-1 flex flex-col gap-1.5"><Sk w="70%" h={14} /><Sk w="50%" h={9} /></div></div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Sk w={180} h={26} />
        <div className="grid gap-3 lg:grid-cols-2">{Array.from({ length: 6 }, (_, i) => <PassSkeleton key={i} />)}</div>
      </div>
    </Busy>
  );
}

// One event: cover and host on the left, title and the facts on the right
export function EventPageSkeleton() {
  return (
    <Busy className="wrap py-6 md:py-8" style={{ maxWidth: 1080 }}>
      <Sk w={70} h={30} r={10} style={{ marginBottom: 16 }} />
      <div className="grid grid-cols-1 md:grid-cols-[340px_1fr] gap-8">
        <div className="flex flex-col gap-4">
          <Sk h={340} r={14} />
          <div className="flex items-center gap-3"><Sk w={44} h={44} r={12} /><div className="flex-1 flex flex-col gap-1.5"><Sk w={70} h={10} /><Sk w="60%" h={18} /></div></div>
        </div>
        <div className="flex flex-col gap-5 min-w-0">
          <Sk w={100} h={22} r={999} />
          <Sk w="85%" h={48} /><Sk w="55%" h={48} />
          <div className="sk-card p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 4 }, (_, i) => <div key={i} className="flex flex-col gap-2"><Sk w={50} h={10} /><Sk w="80%" h={18} /></div>)}
          </div>
          <div className="flex flex-col gap-2"><Sk /><Sk /><Sk w="65%" /></div>
          <div className="sk-card p-5 flex flex-col gap-3"><Sk w="40%" h={20} /><Sk w="70%" /><Sk h={46} r={10} /></div>
        </div>
      </div>
    </Busy>
  );
}

// The boarding pass
export function TicketSkeleton() {
  return (
    <Busy className="narrow py-8 flex flex-col gap-4">
      <div className="sk-card" style={{ overflow: "hidden" }}>
        <Sk h={150} r={0} />
        <div className="p-5 grid grid-cols-2 gap-4">
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="flex flex-col gap-2"><Sk w={60} h={10} /><Sk w="75%" h={20} /></div>)}
        </div>
        <div className="p-5 flex justify-center" style={{ borderTop: "2px dashed var(--line)" }}><Sk w={180} h={180} r={12} /></div>
      </div>
      <Sk h={46} r={10} />
    </Busy>
  );
}

// Profile: the account card on the left, the role's panel on the right
export function ProfileSkeleton() {
  return (
    <Busy className="wrap py-10 grid gap-5 items-start lg:grid-cols-[320px_1fr]" style={{ maxWidth: 1180 }}>
      <div className="sk-card" style={{ overflow: "hidden" }}>
        <Sk h={104} r={0} />
        <div className="flex flex-col items-center gap-3" style={{ padding: "0 1.4rem 1.4rem", marginTop: -46 }}>
          <Sk w={92} h={92} r={999} style={{ border: "4px solid var(--surface)" }} />
          <Sk w="70%" h={24} /><Sk w="60%" h={12} />
          <div className="flex flex-col gap-2" style={{ width: "100%", marginTop: 6 }}><Sk h={12} /><Sk h={12} /><Sk h={12} w="80%" /></div>
          <Sk h={36} r={10} />
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <Sk w={120} h={12} /><Sk w="40%" h={36} />
        <div className="sk-card p-5 flex flex-col gap-3">
          <Sk w="35%" h={18} />
          <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <div key={i} className="flex flex-col gap-1.5"><Sk w={90} h={10} /><Sk h={42} r={10} /></div>)}</div>
        </div>
        <RowsSkeleton rows={3} />
      </div>
    </Busy>
  );
}

// A list of people or organizations
export function RowsSkeleton({ rows = 4 }) {
  return (
    <Busy className="sk-card" style={{ overflow: "hidden" }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3" style={{ padding: "1rem 1.1rem", borderTop: i ? "1px solid var(--line)" : 0 }}>
          <Sk w={44} h={44} r={12} />
          <div className="flex-1 flex flex-col gap-1.5"><Sk w="45%" h={15} /><Sk w="35%" h={11} /></div>
          <Sk w={70} h={30} r={10} />
        </div>
      ))}
    </Busy>
  );
}

// Organizer console: header, tabs, stat cards, and a chart
export function ManageSkeleton() {
  return (
    <Busy className="wrap py-6 flex flex-col gap-5" style={{ maxWidth: 1240 }}>
      <div className="flex flex-col gap-2"><Sk w={90} h={12} /><Sk w="50%" h={40} /><Sk w="35%" h={12} /></div>
      <div className="flex gap-2 flex-wrap">{Array.from({ length: 5 }, (_, i) => <Sk key={i} w={100} h={34} r={10} />)}</div>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="sk-card p-4 flex flex-col gap-2"><Sk w="50%" h={10} /><Sk w="40%" h={30} /><Sk w="70%" h={10} /></div>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="sk-card p-5 flex flex-col gap-3"><Sk w="30%" h={18} /><Sk h={220} r={10} /></div>
        <div className="sk-card p-5 flex flex-col gap-3"><Sk w="50%" h={18} />{Array.from({ length: 5 }, (_, i) => <Sk key={i} h={14} />)}</div>
      </div>
    </Busy>
  );
}

// A form panel
export function FormSkeleton() {
  return (
    <Busy className="wrap py-8 flex flex-col gap-5" style={{ maxWidth: 920 }}>
      <Sk w={110} h={12} /><Sk w="40%" h={48} /><Sk w="60%" />
      <div className="sk-card p-6 grid gap-6 sm:grid-cols-[220px_1fr]">
        <Sk h={220} r={14} />
        <div className="flex flex-col gap-4">
          {Array.from({ length: 5 }, (_, i) => <div key={i} className="flex flex-col gap-1.5"><Sk w={90} h={10} /><Sk h={42} r={10} /></div>)}
        </div>
      </div>
    </Busy>
  );
}

export function ErrorBox({ message }) {
  return <div className="alert err" role="alert">{message}</div>;
}
