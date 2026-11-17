import { LogIn } from "lucide-react";
import { EventForm } from "../components/EventForm.jsx";
import { go } from "../components/shared.jsx";
import { useMe } from "../lib/account.js";
import { api } from "../lib/api.js";
import { FormSkeleton } from "../components/ui.jsx";

export function CreateEvent() {
  const { me } = useMe();
  if (me === undefined) return <FormSkeleton />;
  const orgs = me ? me.hostsFor || [] : [];
  if (!orgs.length) {
    return (
      <div className="narrow py-10">
        <div className="panel p-6 flex flex-col gap-3">
          <h1 className="panel-title">Events are hosted by organizations</h1>
          <p className="muted">
            {!me ? "Sign in with your organization's account, or as an officer, to create an event."
              : "Only organization accounts and their officers can create events. Ask your organization to invite you as an officer."}
          </p>
          {!me && <div><button className="btn btn-primary" onClick={() => go("profile")}><LogIn size={17} /> Sign in</button></div>}
        </div>
      </div>
    );
  }
  return (
    <div className="wrap py-8 flex flex-col gap-6" style={{ maxWidth: 920 }}>
      <div>
        <div className="tag mb-2">New departure</div>
        <h1 className="page-title">Create event</h1>
        <p className="muted mt-3" style={{ maxWidth: "62ch" }}>You'll get a registration page to share and a scanner for check-in. Your organization's account and officers can manage it from any device.</p>
      </div>
      <div className="panel p-5 md:p-6">
        <EventForm orgs={orgs} submitLabel="Create event" onSubmit={async (fields, cover) => {
          const e = await api.create(fields);
          if (cover) { try { await api.uploadCover(e.id, cover); } catch {/* ignore */} }
          go(`m/${e.id}`);
        }} />
      </div>
    </div>
  );
}
