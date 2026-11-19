import { LayoutGrid, LogOut, ShieldCheck } from "lucide-react";
import { Avatar } from "../../components/AccountMenu.jsx";
import { fmtDate, go, goBack, Trails } from "../../components/shared.jsx";
import { displayName, returnTo, ROLE_LABEL, useMe } from "../../lib/account.js";
import { signOut } from "../../lib/auth.js";
import { AuthForm } from "./AuthForm.jsx";
import { InvitesPanel } from "./InvitesPanel.jsx";
import { OfficersPanel } from "./OfficersPanel.jsx";
import { OrgsPanel } from "./OrgsPanel.jsx";
import { ProfileForm } from "./ProfileForm.jsx";
import { ProfileSkeleton } from "../../components/ui.jsx";

/* ---------------- profile: filled in once, used for every event ---------------- */
export function ProfilePage({ required = false }) {
  const { me, reload, session } = useMe();
  const signOutHere = async () => { await signOut(); go(""); };

  if (me === undefined) return <ProfileSkeleton />;
  if (!me) return <div className="narrow py-10"><AuthForm /></div>;

  const meta = (session && session.user.user_metadata) || {};
  const back = returnTo.get();
  const ready = me.role !== "student" || (me.profile && me.profile.hasFace);
  const name = displayName(me, session);
  const joined = session && session.user.created_at ? fmtDate(session.user.created_at, { month: "long", year: "numeric" }) : null;

  // Superadmin: a wide cover with the account in the middle, and the admin console under it
  if (me.role === "superadmin") {
    return (
      <div className="wrap py-6 flex flex-col gap-6" style={{ maxWidth: 1100 }}>
        <section className="panel" style={{ overflow: "hidden", padding: 0 }}>
          <div className="sky" style={{ height: "clamp(150px, 24vw, 250px)" }}>
            <Trails seed={me.email} opacity={0.6} />
          </div>
          <div className="flex flex-col items-center gap-2" style={{ textAlign: "center", padding: "0 1.5rem 1.4rem", marginTop: "clamp(-84px, -9vw, -60px)" }}>
            <span style={{ borderRadius: "50%", border: "5px solid var(--surface)", boxShadow: "0 10px 28px -10px rgba(20,27,58,.45)", lineHeight: 0, position: "relative" }}>
              <Avatar meta={meta} name={name.first} size={152} />
            </span>
            <h1 className="display" style={{ fontSize: "clamp(2rem, 4.2vw, 2.9rem)", marginTop: 6 }}>{name.full}</h1>
            <div className="muted" style={{ overflowWrap: "anywhere" }}>{me.email}</div>
            <div className="flex flex-wrap justify-center items-center gap-2 mt-1">
              <span className="pill host"><ShieldCheck size={12} /> Superadmin</span>
              <span className="tag">Signs in with {me.viaGoogle ? "Google" : "email"}</span>
              {joined && <><span className="faint">·</span><span className="tag">Joined {joined}</span></>}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap" style={{ borderTop: "1px solid var(--line)", padding: ".6rem 1.2rem" }}>
            <nav className="flex gap-1" aria-label="Profile sections">
              <span className="toplink" aria-current="page" style={{ cursor: "default" }}><LayoutGrid size={16} /> Admin console</span>
            </nav>
            <button className="btn btn-sm" onClick={signOutHere}><LogOut size={15} /> Sign out</button>
          </div>
        </section>
        <OrgsPanel />
      </div>
    );
  }

  return (
    <div className="wrap py-10 flex flex-col gap-4" style={{ maxWidth: 1180 }}>
      {back && ready && (
        <div className="panel p-4 flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: "var(--accent)" }}>
          <span className="text-sm">{me.role === "student" ? "You're all set. Go back to the event to register." : "Go back to where you were."}</span>
          <button className="btn btn-primary btn-sm" onClick={() => { returnTo.clear(); goBack(back); }}>Back to the event</button>
        </div>
      )}
      <div className="grid gap-5 items-start lg:grid-cols-[320px_1fr]">
        <aside className="flex flex-col gap-4 lg:sticky" style={{ top: 84 }}>
          <div className="panel" style={{ overflow: "hidden", padding: 0 }}>
            <div className="sky" style={{ height: 104 }}>
              <Trails seed={me.email} opacity={0.6} />
              <div className="tag relative" style={{ color: "rgba(255,255,255,.85)", padding: "1rem 1.1rem" }}>{ROLE_LABEL[me.role]}</div>
            </div>
            <div className="flex flex-col items-center gap-3" style={{ textAlign: "center", padding: "0 1.4rem 1.4rem", marginTop: -46 }}>
              <span style={{ borderRadius: "50%", border: "4px solid var(--surface)", boxShadow: "0 6px 18px -6px rgba(20,27,58,.35)", lineHeight: 0, position: "relative" }}>
                <Avatar meta={meta} name={name.first} size={84} />
              </span>
              <div className="min-w-0" style={{ width: "100%" }}>
                <div className="display" style={{ fontSize: "1.6rem" }}>{name.full}</div>
                <div className="muted text-sm" style={{ overflowWrap: "anywhere", marginTop: 4 }}>{me.email}</div>
              </div>
              {(me.org || (me.officerOf || []).length > 0) && (
                <div className="flex flex-wrap justify-center gap-1.5">
                  {me.org && <span className="pill host">{me.org.name}</span>}
                  {(me.officerOf || []).map((o) => <span key={o.id} className="pill host">Officer · {o.name}</span>)}
                </div>
              )}
              <dl className="text-sm" style={{ width: "100%", borderTop: "1px solid var(--line)", paddingTop: 12, display: "grid",
                gridTemplateColumns: "auto 1fr", gap: ".45rem .8rem", textAlign: "left" }}>
                {me.profile && <><dt className="tag" style={{ alignSelf: "center" }}>Student no.</dt><dd className="mono" style={{ textAlign: "right" }}>{me.profile.studentId}</dd></>}
                {me.profile && <><dt className="tag" style={{ alignSelf: "center" }}>Section</dt><dd style={{ textAlign: "right" }}>{me.profile.section}</dd></>}
                <dt className="tag" style={{ alignSelf: "center" }}>Sign-in</dt>
                <dd style={{ textAlign: "right" }}>{me.viaGoogle ? "Google" : "Email and password"}</dd>
                {session && session.user.created_at && <>
                  <dt className="tag" style={{ alignSelf: "center" }}>Joined</dt>
                  <dd style={{ textAlign: "right" }}>{fmtDate(session.user.created_at, { month: "short", day: "numeric", year: "numeric" })}</dd>
                </>}
              </dl>
              <button className="btn btn-sm" onClick={signOutHere} style={{ width: "100%" }}><LogOut size={15} /> Sign out</button>
            </div>
          </div>
          {me.role === "student" && <InvitesPanel me={me} onChange={reload} />}
        </aside>
        <div className="min-w-0">
          {me.role === "student" ? <ProfileForm me={me} onSaved={reload} required={required}/>
            : me.role === "org" ? <OfficersPanel />
            : <OrgsPanel />}
        </div>
      </div>
    </div>
  );
}
