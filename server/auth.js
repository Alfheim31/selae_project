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

// Asks Supabase whose token this is. Returns { id, email, name, avatar, viaGoogle } or null.
// viaGoogle: this session proved the email through Google, so it may carry the superadmin or org role.
export function supabaseVerifier({ url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY } = {}) {
  if (!url || !key) return null;
  return async (token) => {
    const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const u = await res.json();
    if (!u || !u.id || !u.email) return null;
    const meta = u.user_metadata || {};
    return { id: u.id, email: u.email.toLowerCase(), name: meta.full_name || meta.name || "", avatar: meta.avatar_url || null,
      viaGoogle: signInMethods(token).includes("oauth") };
  };
}

export const emailList = (raw) => String(raw || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

// verify(token) -> user or null. Results are cached briefly so each request doesn't call Supabase.
export function createAuth(verify) {
  const cache = new Map();
  return async function userFor(req) {
    if (!verify) return null;
    const m = String(req.headers.authorization || "").match(/^Bearer\s+(\S+)$/i);
    if (!m) return null;
    const token = m[1];
    const hit = cache.get(token);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.user;
    let user = null;
    try { user = await verify(token); } catch (e) { console.error("SELAE: couldn't check the login token.", e.message); return null; }
    if (cache.size > CACHE_MAX) cache.clear();
    cache.set(token, { user, at: Date.now() });
    return user;
  };
}
