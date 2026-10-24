import { useEffect, useRef, useState } from "react";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

/* Live barcode decoding for the gate scanner */

prepareZXingModule({
  overrides: {
    locateFile: (path, prefix) => (path.endsWith(".wasm") ? wasmUrl : prefix + path),
  },
});

const FORMATS = ["Code128", "Code39", "Code93", "Codabar", "ITF", "EAN13", "EAN8", "UPCA", "QRCode", "PDF417", "DataMatrix"];
const READ_OPTIONS = { formats: FORMATS, tryHarder: true, maxNumberOfSymbols: 1 };

function makeReader() {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return async (video) => {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;
    // Frame capture
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.drawImage(video, 0, 0, w, h);
    const found = await readBarcodes(ctx.getImageData(0, 0, canvas.width, canvas.height), READ_OPTIONS);
    return found.length ? found[0].text : null;
  };
}

export function parseStudentId(raw) {
  const m = String(raw).match(/(\d{4})\s*-?\s*(\d{5})/);
  return m ? `${m[1]}-${m[2]}` : null;
}

export function useBarcodeScanner({ videoRef, running, ready, onDetect, absentMs = 1500 }) {
  const [status, setStatus] = useState(null);
  const onDetectRef = useRef(onDetect);
  const readyRef = useRef(ready);
  onDetectRef.current = onDetect;
  readyRef.current = ready;
  const last = useRef({ code: null, seen: 0 });

  useEffect(() => {
    if (!running) return undefined;
    let stopped = false;
    let timer = 0;
    let failures = 0;
    const read = makeReader();
    setStatus("loading");

    const tick = async () => {
      if (stopped) return;
      const now = performance.now();
      const video = videoRef.current;
      if (!readyRef.current || !video || video.paused) {
        // Pause while showing a result
        if (last.current.code) last.current.seen = now;
      } else if (video.readyState >= 2) {
        let code = null;
        try {
          code = await read(video);
          failures = 0;
          if (!stopped) setStatus("ready");
        } catch {
          // Decoder error
          failures += 1;
          if (!stopped && failures >= 3) setStatus("error");
        }
        if (stopped) return;
        if (code) {
          const prev = last.current;
          const isNew = code !== prev.code || now - prev.seen > absentMs;
          last.current = { code, seen: now };
          if (isNew && readyRef.current) onDetectRef.current(code);
        }
      }
      timer = setTimeout(tick, failures ? 1000 : 150);
    };
    tick();

    return () => { stopped = true; clearTimeout(timer); };
  }, [running, videoRef, absentMs]);

  return running ? status : null;
}
