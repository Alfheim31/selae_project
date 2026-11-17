import { useEffect } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

/* ---------------- photos ---------------- */
export function Lightbox({ photos, index, onIndex, onClose }) {
  useEffect(() => {
    const key = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndex((index + 1) % photos.length);
      if (e.key === "ArrowLeft") onIndex((index - 1 + photos.length) % photos.length);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [index, photos.length, onIndex, onClose]);
  const p = photos[index];
  if (!p) return null;
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={`Photo ${index + 1} of ${photos.length}`} onClick={onClose}>
      <img src={p.url} alt="" onClick={(e) => e.stopPropagation()} />
      <button className="iconbtn" style={{ top: 16, right: 16 }} onClick={onClose} aria-label="Close"><X size={20} /></button>
      {photos.length > 1 && <>
        <button className="iconbtn" style={{ left: 16, top: "50%" }} onClick={(e) => { e.stopPropagation(); onIndex((index - 1 + photos.length) % photos.length); }} aria-label="Previous photo"><ChevronLeft size={22} /></button>
        <button className="iconbtn" style={{ right: 16, top: "50%" }} onClick={(e) => { e.stopPropagation(); onIndex((index + 1) % photos.length); }} aria-label="Next photo"><ChevronRight size={22} /></button>
      </>}
      <div className="tag" style={{ position: "absolute", bottom: 18, left: 0, right: 0, textAlign: "center", color: "rgba(255,255,255,.75)" }}>{index + 1} / {photos.length}</div>
    </div>
  );
}
