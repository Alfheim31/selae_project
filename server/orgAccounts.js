/* Organization sign-in: a Supabase account per official email, with a temporary password sent by email */
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

// 12 characters without look-alikes (no 0/O, 1/l/I), always with a digit
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
export function tempPassword(length = 12) {
  for (;;) {
    const bytes = crypto.randomBytes(length);
    const pw = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
    if (/\d/.test(pw) && /[a-z]/.test(pw) && /[A-Z]/.test(pw)) return pw;
  }
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function credentialsEmail({ orgName, email, password, appUrl }) {
  const subject = `Your SELAE account for ${orgName}`;
  const text = [
    `Hi ${orgName},`,
    "",
    "The SELAE superadmin added your organization. Sign in with:",
    "",
    `  Email: ${email}`,
    `  Temporary password: ${password}`,
    "",
    `Open ${appUrl}, choose Sign in, and enter these. SELAE will ask you to choose your own password right away.`,
    "",
    "If you weren't expecting this, you can ignore this email.",
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#141B3A">
  <div style="background:linear-gradient(180deg,#E4F68A,#9CC9E6 45%,#4F64D6);border-radius:14px 14px 0 0;padding:22px 24px;color:#fff">
    <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:.85">SELAE</div>
    <div style="font-size:22px;font-weight:bold;margin-top:4px">Your organization account</div>
  </div>
  <div style="border:1px solid #DCE2EE;border-top:0;border-radius:0 0 14px 14px;padding:22px 24px">
    <p>Hi ${esc(orgName)},</p>
    <p>The SELAE superadmin added your organization. Sign in with:</p>
    <table style="border-collapse:collapse;margin:12px 0">
      <tr><td style="padding:4px 12px 4px 0;color:#5B6584">Email</td><td style="padding:4px 0"><b>${esc(email)}</b></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#5B6584">Temporary password</td>
        <td style="padding:4px 0"><b style="font-family:monospace;font-size:18px;letter-spacing:2px">${esc(password)}</b></td></tr>
    </table>
    <p><a href="${esc(appUrl)}" style="display:inline-block;background:#3550D4;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px">Open SELAE</a></p>
    <p style="color:#5B6584;font-size:13px">Choose <b>Sign in</b> and enter these. SELAE will ask you to choose your own password right away.
      If you weren't expecting this, you can ignore this email.</p>
  </div>
</div>`;
  return { subject, text, html };
}

/**
 * provision({ email, orgId, orgName, appUrl }) gives the org's email a fresh temporary password and sends it.
 *   Returns { emailed: true } or, when email isn't set up or failed, { emailed: false, password, reason }.
 * release({ email, orgId }) takes the org away from that account (the org moved to a new email).
 * setPassword(userId, password) sets the person's own password and ends the temporary one.
 */
export function supabaseOrgAccounts({
  url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY,
  smtp = {
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT) || 465,
    user: process.env.SMTP_USER, pass: process.env.SMTP_PASS, from: process.env.SMTP_FROM || process.env.SMTP_USER,
  },
} = {}) {
  if (!url || !key) return null;
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).auth.admin;
  const mailer = smtp.host && smtp.user && smtp.pass
    ? nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.port === 465, auth: { user: smtp.user, pass: smtp.pass } })
    : null;

  async function findUser(email) {
    for (let page = 1; ; page++) {
      const { data, error } = await admin.listUsers({ page, perPage: 1000 });
      if (error) throw new Error(`Couldn't look up accounts (${error.message}).`);
      const hit = data.users.find((u) => (u.email || "").toLowerCase() === email);
      if (hit) return hit;
      if (data.users.length < 1000) return null;
    }
  }

  return {
    async provision({ email, orgId, orgName, appUrl }) {
      const password = tempPassword();
      const app = { selae_org: orgId, selae_temp_password: true };
      const existing = await findUser(email);
      if (existing && existing.app_metadata && existing.app_metadata.selae_org === orgId) {
        const { error } = await admin.updateUserById(existing.id, { password, app_metadata: app });
        if (error) throw new Error(`Couldn't reset the organization's password (${error.message}).`);
      } else {
        // Anyone who signed up with this email before doesn't keep a way in: start a clean account
        if (existing) {
          const { error } = await admin.deleteUser(existing.id);
          if (error) throw new Error(`Couldn't replace the old account for that email (${error.message}).`);
        }
        const { error } = await admin.createUser({ email, password, email_confirm: true, app_metadata: app, user_metadata: { full_name: orgName } });
        if (error) throw new Error(`Couldn't create the organization's account (${error.message}).`);
      }
      if (!mailer) return { emailed: false, password, reason: "Email sending isn't set up (SMTP in .env)." };
      try {
        await mailer.sendMail({ from: `SELAE <${smtp.from}>`, to: email, ...credentialsEmail({ orgName, email, password, appUrl }) });
        return { emailed: true };
      } catch (e) {
        return { emailed: false, password, reason: `The email couldn't be sent (${e.message}).` };
      }
    },

    async release({ email, orgId }) {
      const user = await findUser(email);
      if (!user || !user.app_metadata || user.app_metadata.selae_org !== orgId) return;
      await admin.updateUserById(user.id, { app_metadata: { selae_org: null, selae_temp_password: null } });
    },

    async setPassword(userId, password) {
      const { error } = await admin.updateUserById(userId, { password, app_metadata: { selae_temp_password: null } });
      if (error) throw new Error(error.message);
    },
  };
}
