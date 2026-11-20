import { useMemo } from "react";
import { usePolled } from "../components/ui.jsx";
import { useMe } from "./account.js";
import { api } from "./api.js";

/* ---------------- your events ---------------- */
// The signed-in account's tickets (from /api/me), never ones another account left in this browser
const savedOf = (me) => (me && me.tickets) || [];

// This account's ticket for one event ({ code, eventId }), or null
export function useSavedTicket(eventId) {
  const { me } = useMe();
  return savedOf(me).find((t) => t.eventId === eventId) || null;
}

export function useTickets() {
  const { me } = useMe();
  const saved = savedOf(me);
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
