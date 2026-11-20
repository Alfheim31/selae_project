import { CalendarCheck2, GraduationCap, LayoutGrid, ShieldCheck, UserRound } from "lucide-react";
import { Avatar } from "../../components/AccountMenu.jsx";
import { fmtDate, go, goBack, Trails } from "../../components/shared.jsx";
import { displayName, returnTo, ROLE_LABEL, useMe } from "../../lib/account.js";
import { AttendedPanel } from "./AttendedPanel.jsx";
import { AuthForm } from "./AuthForm.jsx";
import { InvitesPanel } from "./InvitesPanel.jsx";
import { OfficersPanel } from "./OfficersPanel.jsx";
import { OrgProfile } from "./OrgProfile.jsx";
import { OrgsPanel } from "./OrgsPanel.jsx";
import { ProfileForm } from "./ProfileForm.jsx";
import { ProfileSkeleton } from "../../components/ui.jsx";

/* ---------------- profile: filled in once, used for every event ---------------- */
export function ProfilePage({ required = false, tab }) {
  const { me, reload, session } = useMe();

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
              <span className="pill soft">Signs in with {me.viaGoogle ? "Google" : "email"}</span>
              {joined && <span className="pill soft">Joined {joined}</span>}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap" style={{ borderTop: "1px solid var(--line)", padding: ".6rem 1.2rem" }}>
            <nav className="flex gap-1" aria-label="Profile sections">
              <span className="toplink" aria-current="page" style={{ cursor: "default" }}><LayoutGrid size={16} /> Admin console</span>
            </nav>
          </div>
        </section>
        <OrgsPanel />
      </div>
    );
  }

  // Organization: the same wide layout, with a cover and photo the organization uploads, and its officers under it
  if (me.role === "org" && me.org) {
    return <OrgProfile me={me} joined={joined} onChange={reload} />;
  }

  // Student (and anyone else): the same wide cover as the superadmin and organization pages, with the
  // student's details as tags under the name, and the profile form under it
  const p = me.profile;
  // Student tabs: the profile form, or the events they were checked in at (#/profile/attended)
  const showAttended = tab === "attended" && me.role === "student" && !required;
  return (
    <div className="wrap py-6 flex flex-col gap-6" style={{ maxWidth: 1100 }}>
      {back && ready && (
        <div className="panel p-4 flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: "var(--accent)" }}>
          <span className="text-sm">{me.role === "student" ? "You're all set. Go back to the event to register." : "Go back to where you were."}</span>
          <button className="btn btn-primary btn-sm" onClick={() => { returnTo.clear(); goBack(back); }}>Back to the event</button>
        </div>
      )}
      <section className="panel" style={{ overflow: "hidden", padding: 0 }}>
        <div className="sky" style={{ height: "clamp(150px, 24vw, 250px)" }}>
          <Trails seed={me.email} opacity={0.6} />
        </div>
        <div className="flex flex-col items-center gap-2" style={{ textAlign: "center", padding: "0 1.5rem 1.4rem", marginTop: "clamp(-84px, -9vw, -60px)" }}>
          <span style={{ borderRadius: "50%", border: "5px solid var(--surface)", boxShadow: "0 10px 28px -10px rgba(20,27,58,.45)", lineHeight: 0, position: "relative" }}>
            <Avatar meta={meta} name={name.first} size={152} />
          </span>
          <h1 className="display" style={{ fontSize: "clamp(2rem, 4.2vw, 2.9rem)", marginTop: 6, overflowWrap: "anywhere" }}>{name.full}</h1>
          <div className="muted" style={{ overflowWrap: "anywhere" }}>{me.email}</div>
          <div className="flex flex-wrap justify-center items-center gap-2 mt-1">
            <span className="pill host"><GraduationCap size={12} /> {ROLE_LABEL[me.role]}</span>
            {(me.officerOf || []).map((o) => <span key={o.id} className="pill host">Officer · {o.name}</span>)}
            {p && <span className="pill soft">Student no. {p.studentId}</span>}
            {p && p.section && <span className="pill soft">{p.section}</span>}
            <span className="pill soft">Signs in with {me.viaGoogle ? "Google" : "email"}</span>
            {joined && <span className="pill soft">Joined {joined}</span>}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap" style={{ borderTop: "1px solid var(--line)", padding: ".6rem 1.2rem" }}>
          <nav className="flex gap-1" aria-label="Profile sections">
            <button className="toplink" aria-current={showAttended ? undefined : "page"} onClick={() => go("profile", { replace: true })}>
              <UserRound size={16} /> <span style={{ whiteSpace: "nowrap" }}><span className="hidden sm:inline">Student </span>profile</span>
            </button>
            {me.role === "student" && !required && (
              <button className="toplink" aria-current={showAttended ? "page" : undefined} onClick={() => go("profile/attended", { replace: true })}>
                <CalendarCheck2 size={16} /> <span style={{ whiteSpace: "nowrap" }}><span className="hidden sm:inline">Events </span>attended</span>
                <span className="pill host" style={{ padding: ".1rem .45rem", marginLeft: 2 }}>{me.eventsAttended || 0}</span>
              </button>
            )}
          </nav>
        </div>
      </section>
      {showAttended ? <AttendedPanel /> : (
        <>
          {me.role === "student" && <InvitesPanel me={me} onChange={reload} />}
          {me.role === "student" ? <ProfileForm me={me} onSaved={reload} required={required} />
            : me.role === "org" ? <OfficersPanel />
            : <OrgsPanel />}
        </>
      )}
    </div>
  );
}
