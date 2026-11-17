import { useMemo } from "react";
import { usePolled } from "../components/ui.jsx";
import { api, myTickets } from "./api.js";

/* ---------------- your events ---------------- */
export function useTickets() {
  const saved = myTickets.all();
  const [tickets] = usePolled(
    () => Promise.all(saved.map((t) => api.ticket(t.code).catch(() => null))),
    [saved.map((t) => t.code).join()], 15000,
  );
  return useMemo(() => {
    const byEvent = new Map();
    for (const t of tickets || []) if (t && t.event && (!byEvent.has(t.event.id) || t.status !== "cancelled")) byEvent.set(t.event.id, t);
    return byEvent;
  }, [tickets]);
}

// Events hosted by one of the orgs this account runs or is an officer of
export const hostsEvent = (me, e) => Boolean(me && e.org && (me.hostsFor || []).some((o) => o.id === e.org.id));
