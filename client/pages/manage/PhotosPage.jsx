import { useRef, useState } from "react";
import { Clock, ImagePlus, Images, Trash2 } from "lucide-react";
import { Lightbox } from "../../components/Lightbox.jsx";
import { fmtDate, fmtTime, go, prepareImage, skyOf } from "../../components/shared.jsx";
import { api } from "../../lib/api.js";

/* ---------------- photos ---------------- */
export function PhotosPage({ data, now, refresh, onToast }) {
  const { event } = data;
  const photos = event.photos || [];
  const ended = now > data.ends;
  const [queue, setQueue] = useState({ done: 0, total: 0, errors: [] });
  const [over, setOver] = useState(false);
  const [lightbox, setLightbox] = useState(-1);
  const input = useRef(null);
  const busy = queue.total > 0 && queue.done < queue.total;

  const add = async (files) => {
    const list = [...files].filter((f) => /^image\//.test(f.type));
    if (!list.length) { onToast("Choose image files: JPEG, PNG or WebP."); return; }
    setQueue({ done: 0, total: list.length, errors: [] });
    const errors = [];
    for (let i = 0; i < list.length; i++) {
      try { await api.uploadPhoto(event.id, await prepareImage(list[i])); } catch (e) { errors.push(`${list[i].name}: ${e.message}`); }
      setQueue({ done: i + 1, total: list.length, errors: [...errors] });
    }
    await refresh();
    onToast(errors.length ? `${list.length - errors.length} of ${list.length} photos added` : `${list.length} photo${list.length === 1 ? "" : "s"} added`);
    if (input.current) input.current.value = "";
  };
  const remove = async (p) => {
    if (!window.confirm("Remove this photo from the event?")) return;
    try { await api.removePhoto(event.id, p.id); await refresh(); onToast("Photo removed"); } catch (e) { onToast(e.message); }
  };

  return (
    <div className="flex flex-col gap-6" style={{ maxWidth: 1100 }}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div style={{ maxWidth: 680 }}>
          <h2 className="panel-title" style={{ fontSize: "1.9rem" }}>Photos from the event</h2>
          <p className="muted mt-1">
            Share what happened. Photos show on the event page and in its details on Discover, and everyone who checked in gets a notification.
          </p>
        </div>
        {ended && photos.length > 0 && <button className="btn btn-primary" disabled={busy} onClick={() => input.current && input.current.click()}><ImagePlus size={17} /> Add photos</button>}
      </div>

      {!ended ? (
        <div className="pass-wrap">
          <div className="pass p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <div className="cal-av" style={{ "--c-bg": skyOf(event.color), width: 64, height: 64 }}><Clock size={28} /></div>
            <div>
              <div className="tag">Opens after landing</div>
              <div className="display" style={{ fontSize: "1.6rem" }}>Photos open when the event ends</div>
              <p className="muted mt-1">Come back after {fmtTime(data.ends)} on {fmtDate(data.ends, { weekday: "long", month: "long", day: "numeric" })} to upload photos from the day.
                To change the cover photo now, go to <button className="underline" style={{ background: "none", border: 0, color: "var(--accent)", padding: 0 }} onClick={() => go(`m/${event.id}/settings`)}>Invite &amp; settings</button>.</p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple hidden onChange={(e) => add(e.target.files)} />
          <div className={`dropzone ${over ? "over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); if (!busy) add(e.dataTransfer.files); }}>
            {busy ? (
              <div className="flex flex-col items-center gap-3">
                <div className="spin" />
                <div className="font-semibold">Uploading {queue.done + 1 > queue.total ? queue.total : queue.done + 1} of {queue.total}</div>
                <div className="capbar" style={{ width: "min(360px,80%)" }}><div className="capfill" style={{ width: `${(queue.done / queue.total) * 100}%`, background: "var(--accent)" }} /></div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Images size={30} color="var(--accent)" />
                <div className="display" style={{ fontSize: "1.4rem" }}>Drop photos here</div>
                <p className="muted text-sm">or <button className="underline" style={{ background: "none", border: 0, color: "var(--accent)", padding: 0 }} onClick={() => input.current && input.current.click()}>choose from this device</button>. Large photos are resized before upload. Up to 60 per event.</p>
              </div>
            )}
          </div>
          {queue.errors.length > 0 && <div className="alert err">{queue.errors.join(" ")}</div>}
          {photos.length ? (
            <div className="gallery">
              {photos.map((p, i) => (
                <div key={p.id} className="ph">
                  <button style={{ border: 0, padding: 0, width: "100%", height: "100%", background: "none" }} onClick={() => setLightbox(i)} aria-label={`Open photo ${i + 1}`}>
                    <img src={p.url} alt="" loading="lazy" />
                  </button>
                  <button className="del" onClick={() => remove(p)} aria-label={`Remove photo ${i + 1}`}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          ) : <p className="muted">No photos yet.</p>}
        </>
      )}
      {lightbox >= 0 && <Lightbox photos={photos} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(-1)} />}
    </div>
  );
}
