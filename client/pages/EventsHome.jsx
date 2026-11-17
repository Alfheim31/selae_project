import { useState } from "react";
import { Compass, Plus } from "lucide-react";
import { EventDrawer } from "../components/EventDrawer.jsx";
import { EventPass } from "../components/EventPass.jsx";
import { go, Trails } from "../components/shared.jsx";
import { ErrorBox, Loading, usePolled } from "../components/ui.jsx";
import { useMe } from "../lib/account.js";
import { api } from "../lib/api.js";
import { hostsEvent } from "../lib/tickets.js";

export function EventsHome({ drawerId }) {
  const { me } = useMe();
  const [events, error] = usePolled(() => api.events(), [], 10000);
  const [tab, setTab] = useState("upcoming");
  const orgs = (me && me.hostsFor) || [];
  const hosted = (events || []).filter((e) => hostsEvent(me, e) && (tab === "upcoming" ? !e.isPast : e.isPast));
  const open = (id) => go(`events/${id}`);

  return (
    <>
      <div className="wrap py-8 flex flex-col gap-8" style={{ maxWidth: 880 }}>
        <div className="page-head">
          <div>
            <div className="tag mb-2">{orgs.length ? `Hosted by ${orgs.map((o) => o.name).join(", ")}` : "Your organizations"}</div>
            <h1 className="page-title">Events</h1>
          </div>
          <div className="seg" role="group" aria-label="Show">
            {[["upcoming", "Upcoming"], ["past", "Past"]].map(([k, l]) => (
              <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
        </div>
        {error && <ErrorBox message={error} />}
        {(!events || me === undefined) && !error && <Loading />}
        {events && me !== undefined && (hosted.length ? (
          <div className="flex flex-col gap-3">
            {hosted.map((e) => <EventPass key={e.id} e={e} hosting active={drawerId === e.id} onOpen={() => open(e.id)} />)}
          </div>
        ) : <EmptyItinerary past={tab === "past"} canHost={orgs.length > 0} />)}
      </div>
      {drawerId && <EventDrawer id={drawerId} onClose={() => go("events")} />}
    </>
  );
}

function EmptyItinerary({ past, canHost }) {
  return (
    <div className="pass-wrap">
      <div className="pass" style={{ overflow: "hidden" }}>
        <div className="sky" style={{ padding: "2rem 1.5rem", minHeight: 170 }}>
          <Trails seed="empty" />
          <div className="relative">
            <div className="tag" style={{ color: "rgba(255,255,255,.8)" }}>{past ? "No past events" : "Your organization's events"}</div>
            <div className="display" style={{ fontSize: "2.4rem", marginTop: ".35rem", textTransform: "uppercase" }}>
              No events hosted yet
            </div>
          </div>
        </div>
        <div className="tear" />
        <div className="p-5 flex flex-wrap items-center justify-between gap-3">
          <p className="muted" style={{ maxWidth: "46ch" }}>
            {canHost ? (past ? "Your organization's events show up here once they end." : "Events your organization hosts show up here.")
              : "Events from the organizations you're an officer of show up here. To join an event, find one on Discover."}
          </p>
          <div className="flex gap-2">
            {canHost && !past && <button className="btn btn-primary" onClick={() => go("create")}><Plus size={17} /> Create event</button>}
            <button className={`btn ${canHost && !past ? "" : "btn-primary"}`} onClick={() => go("")}><Compass size={17} /> Discover events</button>
          </div>
        </div>
      </div>
    </div>
  );
}
