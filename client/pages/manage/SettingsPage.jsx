import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { EventForm } from "../../components/EventForm.jsx";
import { QrCode } from "../../components/shared.jsx";
import { api } from "../../lib/api.js";

/* ---------------- share / invite ---------------- */
function useShareBase() {
  const [base, setBase] = useState(window.location.origin);
  const [lan, setLan] = useState(null);
  useEffect(() => {
    api.info().then((i) => {
      // Share link base
      if (i.isLocal && i.lanUrls.length) { setBase(i.lanUrls[0]); setLan(true); } else setLan(!i.isLocal);
    }).catch(() => setLan(false));
  }, []);
  return { base, lan };
}

function CopyRow({ value }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); } catch {
      const t = document.createElement("textarea"); t.value = value; document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); } catch { /* ignore */ } t.remove();
    }
    setDone(true); setTimeout(() => setDone(false), 1800);
  };
  return (
    <div className="copyrow">
      <input className="inp" readOnly value={value} onFocus={(e) => e.target.select()} aria-label="Link" />
      <button className="btn" onClick={copy}><Copy size={16} /> {done ? "Copied" : "Copy"}</button>
    </div>
  );
}

export function ShareCard({ eventId }) {
  const { base, lan } = useShareBase();
  const url = `${base}/#/e/${eventId}`;
  return (
    <section className="panel p-5 flex flex-col sm:flex-row gap-5 items-center">
      <QrCode value={url} size={170} label="QR code for the registration page" />
      <div className="flex flex-col gap-3 min-w-0 flex-1 w-full">
        <div>
          <h2 className="font-bold text-lg">Invite people to register</h2>
          <p className="muted text-sm">Put this QR code on a poster or slide, or send the link in your group chat. It opens the registration page on their phone.</p>
        </div>
        <CopyRow value={url} />
        {lan === false && base.includes("localhost") && (
          <p className="text-sm" style={{ color: "var(--warn)" }}>This laptop isn't on a network, so phones can't open this link yet. Connect to Wi-Fi and reload.</p>
        )}
        {lan && <p className="text-sm faint">Phones need to be on the same Wi-Fi as the laptop running SELAE.</p>}
      </div>
    </section>
  );
}

export function SettingsPage({ data, eventId, refresh }) {
  // No co-host link: managing an event comes from the account (the organization or its officers),
  // so organizers who need the dashboard or scanner are invited as officers instead
  return (
    <div className="flex flex-col gap-6" style={{ maxWidth: 860 }}>
      <ShareCard eventId={eventId} />
      <section className="panel p-5 flex flex-col gap-4">
        <h2 className="font-bold text-lg">Event details</h2>
        <EventForm key={data.event.id} initial={data.event} submitLabel="Save changes" showRegistrationToggle eventId={eventId} onCoverChange={refresh}
          onSubmit={async (fields) => { await api.update(eventId, fields); await refresh(); }} />
      </section>
    </div>
  );
}
