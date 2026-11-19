import { lazy, Suspense, useEffect } from "react";
import { TopBar } from "./components/TopBar.jsx";
import { CSS, go, Toaster, useHashRoute } from "./components/shared.jsx";
import { Loading } from "./components/ui.jsx";
import { useMe } from "./lib/account.js";
import { hostKeys } from "./lib/api.js";
import { Discover } from "./pages/Discover.jsx";
import { EventPage } from "./pages/EventPage.jsx";
import { EventsHome } from "./pages/EventsHome.jsx";
import { TicketPage } from "./pages/TicketPage.jsx";

/* SELAE: Smart Event Logistics and Analytics Engine */

// Loaded on first visit: the organizer tools (charts, scanner, OCR, face models), the profile (face models), admin, and the event form
const named = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })));
const Manage = named(() => import("./pages/manage/Manage.jsx"), "Manage");
const ProfilePage = named(() => import("./pages/account/ProfilePage.jsx"), "ProfilePage");
const AdminPage = named(() => import("./pages/AdminPage.jsx"), "AdminPage");
const CreateEvent = named(() => import("./pages/CreateEvent.jsx"), "CreateEvent");
const ChangePasswordPage = named(() => import("./pages/account/ChangePassword.jsx"), "ChangePasswordPage");

const TABS = ["dashboard", "analytics", "photos", "tickets", "settings"];

const LEGACY = { dashboard: "dashboard", scanner: "scan", analytics: "analytics", testids: "tickets" };

export default function App() {
  const route = useHashRoute();
  const { me, reload } = useMe();
  const parts = route.split("/").filter(Boolean);

  // Legacy links
  useEffect(() => {
    // Redirects replace the entry, so Back doesn't land on them and bounce forward again
    if (parts.length === 1 && LEGACY[parts[0]]) go(`m/demo-ga/${LEGACY[parts[0]]}`, { replace: true });
    if (parts[0] === "host" && parts[1] && parts[2]) { hostKeys.add(parts[1], parts[2]); go(`m/${parts[1]}`, { replace: true }); }
  }, [route]); // eslint-disable-line react-hooks/exhaustive-deps

  // Signed out: only Discover; the Events page is for signed-in accounts
  useEffect(() => {
    if (me === null && (parts[0] === "events" || parts[0] === "tickets")) go("", { replace: true });
  }, [me, route]); // eslint-disable-line react-hooks/exhaustive-deps

  let page;
  // A temporary password has to be replaced before anything else
  if (me && me.mustChangePassword) {
    page = <ChangePasswordPage me={me} onDone={reload} />;
  } else if (me && me.role === "student" && !(me.profile && me.profile.hasFace)) {
    // A student finishes their profile before anything else; once saved, the page they opened shows
    page = <><TopBar route="profile" /><ProfilePage required /></>;
  } else if (parts[0] === "m" && parts[1]) {

    const scan = parts[2] === "scan" || parts[2] === "scanner";
    page = <Manage id={parts[1]} tab={scan ? "dashboard" : TABS.includes(parts[2]) ? parts[2] : "dashboard"} scan={scan} />;
  } else {
    const at = !parts[0] || parts[0] === "discover" ? "discover" : parts[0] === "events" || parts[0] === "tickets" ? "events" : parts[0];
    const inner =
      parts[0] === "e" && parts[1] ? <EventPage id={parts[1]} /> :
      parts[0] === "t" && parts[1] ? <TicketPage code={parts[1]} /> :
      parts[0] === "create" ? <CreateEvent /> :
      parts[0] === "profile" ? <ProfilePage /> :
      parts[0] === "admin" ? <AdminPage /> :
      parts[0] === "events" || parts[0] === "tickets" ? <EventsHome drawerId={parts[0] === "events" ? parts[1] || null : null} /> :
      <Discover drawerId={parts[0] === "discover" ? parts[1] || null : null} />;
    page = <><TopBar route={at} />{inner}</>;
  }

  return (
    <div className="selae">
      <style>{CSS}</style>
      <Suspense fallback={<Loading />}>{page}</Suspense>
      <Toaster />
    </div>
  );
}
