/* Google sign-in through Supabase Auth */
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// PKCE puts the login result in ?code=, so it doesn't clash with the #/ routes
export const supabase = url && key
  ? createClient(url, key, { auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true } })
  : null;

export function signIn() {
  if (!supabase) return alert("Sign-in isn't set up on this server.");
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
}

// Email and password accounts. Supabase's error text is shown to the person as is.
export async function passwordSignIn(email, password) {
  if (!supabase) throw new Error("Sign-in isn't set up on this server.");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "email_not_confirmed" || /not confirmed/i.test(error.message)) {
      const e = new Error("Confirm your email first. We sent you a code.");
      e.unconfirmed = true;
      throw e;
    }
    throw new Error(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
  }
}

// The code from the "Confirm signup" email. Signs the person in when it matches.
export async function verifyEmailCode(email, code) {
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) throw new Error(/expired|invalid/i.test(error.message) ? "That code is wrong or has expired. Check the latest email, or send a new code." : error.message);
}

export async function resendEmailCode(email) {
  const { error } = await supabase.auth.resend({ type: "signup", email });
  if (error) throw new Error(error.message);
}

// Returns true when the account still needs its email confirmed before signing in
export async function passwordSignUp(email, password) {
  if (!supabase) throw new Error("Sign-in isn't set up on this server.");
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  return !data.session;
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut();
}

export async function accessToken() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

// undefined while loading, null when signed out
export function useSession() {
  const [session, setSession] = useState(supabase ? undefined : null);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      // Drop ?code= from the address bar after login
      if (window.location.search) window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}
