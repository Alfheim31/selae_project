/* Who is signed in: checks the Supabase login token sent as "Authorization: Bearer ..." */

const CACHE_MS = 60_000;
const CACHE_MAX = 2000;

// How this session signed in, from the token's "amr" claim ("oauth" = Google, "password" = email and password)
function signInMethods(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return (payload.amr || []).map((a) => a.method);
  } catch { return []; }
}

// Asks Supabase whose token this is. Returns { id, email, name, avatar, viaGoogle, orgId, tempPassword } or null.
// viaGoogle: this session proved the email through Google, so it may carry the superadmin or org role.
// orgId: the server made this account for an organization (app_metadata, which only the server can set).
// tempPassword: it still has the temporary password that was emailed to it.
export function supabaseVerifier({ url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY } = {}) {
  if (!url || !key) return null;
  return async (token) => {
    const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    // 401/403: the token is bad or expired, so nobody is signed in. Anything else (Supabase busy or down)
    // says nothing about the token, so it's an error, not "signed out".
    if (res.status === 401 || res.status === 403) return null;
    if (!res.ok) throw new Error(`Supabase answered ${res.status}`);
    const u = await res.json();
    if (!u || !u.id || !u.email) return null;
    const meta = u.user_metadata || {};
    const app = u.app_metadata || {};
    return { id: u.id, email: u.email.toLowerCase(), name: meta.full_name || meta.name || "", avatar: meta.avatar_url || null,
      viaGoogle: signInMethods(token).includes("oauth"), orgId: app.selae_org || null, tempPassword: Boolean(app.selae_temp_password) };
  };
}

// Thrown when Supabase can't say whose token this is right now
export class SignInUnavailable extends Error {
  constructor() { super("Signing in can't be checked right now. Try again in a moment."); }
}

export const emailList = (raw) => String(raw || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

// verify(token) -> user or null. Results are cached briefly so each request doesn't call Supabase.
export function createAuth(verify) {
  const cache = new Map();
  const tokenOf = (req) => (String(req.headers.authorization || "").match(/^Bearer\s+(\S+)$/i) || [])[1];
  // After the account changes (a new password), the next request asks Supabase again
  userFor.forget = (req) => { cache.delete(tokenOf(req)); };
  return userFor;
  async function userFor(req) {
    if (!verify) return null;
    const m = String(req.headers.authorization || "").match(/^Bearer\s+(\S+)$/i);
    if (!m) return null;
    const token = m[1];
    const hit = cache.get(token);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.user;
    let user = null;
    try { user = await verify(token); } catch (e) {
      // Not cached, and not treated as signed out: the request fails with 503 and the app asks again
      console.error("SELAE: couldn't check the login token.", e.message);
      throw new SignInUnavailable();
    }
    if (cache.size > CACHE_MAX) cache.clear();
    cache.set(token, { user, at: Date.now() });
    return user;
  }
}
