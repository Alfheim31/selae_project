import { useMe } from "../lib/account.js";
import { OrgsPanel } from "./account/OrgsPanel.jsx";
import { Loading } from "../components/ui.jsx";

export function AdminPage() {
  const { me } = useMe();
  if (me === undefined) return <Loading />;
  if (!me || me.role !== "superadmin") {
    return (
      <div className="narrow py-10">
        <div className="panel p-6 flex flex-col gap-2">
          <h1 className="panel-title">Superadmin only</h1>
          <p className="muted">Sign in with Google using a superadmin account to manage organizations.</p>
        </div>
      </div>
    );
  }
  return <div className="wrap py-10" style={{ maxWidth: 900 }}><OrgsPanel /></div>;
}
