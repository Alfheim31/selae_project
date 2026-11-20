import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import { useSession } from "./auth.js";

// One copy of /api/me for the whole page, so the top bar and the page don't each fetch it
let current = { uid: undefined, me: undefined };
const listeners = new Set();
const publish = (uid, me) => {
  if (current.uid !== uid) return;
  current = { uid, me };
  for (const l of listeners) l(me);
};
// A server that is waking up (Render's free tier sleeps) can take a minute to answer. Until it does, the
// account stays "loading" instead of looking signed out, which hid Events and showed the sign-in form.
async function fetchMe(uid) {
  for (let attempt = 1; attempt <= 12; attempt++) {
    try {
      const me = (await api.me()).user;
      publish(uid, me);
      return;
    } catch {
      if (current.uid !== uid) return;
      await new Promise((r) => setTimeout(r, Math.min(2000 * attempt, 8000)));
    }
  }
  publish(uid, null);
}

// The signed-in account as SELAE sees it (role, profile). undefined while loading, null when signed out.
export function useMe() {
  const session = useSession();
  const uid = session ? session.user.id : session;
  const [me, setMe] = useState(() => (current.uid === uid ? current.me : undefined));
  useEffect(() => {
    listeners.add(setMe);
    return () => { listeners.delete(setMe); };
  }, []);
  useEffect(() => {
    if (uid === undefined) return;
    if (current.uid === uid) { setMe(current.me); return; }
    current = { uid, me: uid === null ? null : undefined };
    for (const l of listeners) l(current.me);
    if (uid !== null) fetchMe(uid);
  }, [uid]);
  const reload = useCallback(() => (current.uid ? fetchMe(current.uid) : Promise.resolve()), []);
  return { me, reload, session };
}

// The name to show: the student's given name, the org's name, the Google name, or the start of the email
export function displayName(me, session) {
  if (me && me.role === "org" && me.org) return { first: me.org.name, full: me.org.name };
  if (me && me.profile) return { first: me.profile.first, full: `${me.profile.first} ${me.profile.last}` };
  const meta = (session && session.user.user_metadata) || {};
  const google = meta.full_name || meta.name || "";
  if (google) return { first: google.split(" ")[0], full: google };
  const email = (me && me.email) || (session && session.user.email) || "";
  return { first: email.split("@")[0], full: email.split("@")[0] };
}

export const ROLE_LABEL = { superadmin: "Superadmin", org: "Organization account", student: "Student" };

// Details typed at sign-up wait here until the email is confirmed and the profile is saved
const PENDING = "selae.pendingStudent";

export const pendingStudent = {
  get(email) {
    try {
      const x = JSON.parse(localStorage.getItem(PENDING));
      return x && x.email === String(email).toLowerCase() ? x.f : null;
    } catch { return null; }
  },
  set(email, f) { try { localStorage.setItem(PENDING, JSON.stringify({ email: String(email).toLowerCase(), f })); } catch { /* private mode */ } },
  clear() { try { localStorage.removeItem(PENDING); } catch { /* private mode */ } },
};

// Where to go back to after signing in or finishing the profile
const RETURN = "selae.returnTo";

export const returnTo = {
  set() { try { localStorage.setItem(RETURN, window.location.hash.replace(/^#\/?/, "")); } catch { /* private mode */ } },
  get() { try { return localStorage.getItem(RETURN); } catch { return null; } },
  clear() { try { localStorage.removeItem(RETURN); } catch { /* private mode */ } },
};
