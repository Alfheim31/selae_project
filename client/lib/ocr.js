import { createWorker, PSM } from "tesseract.js";

/* Student number OCR */

let workerPromise = null;

function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const w = await createWorker("eng", 1, {
        workerPath: "/tesseract/worker.min.js",
        corePath: "/tesseract/core",
        langPath: "/tesseract/lang",
        workerBlobURL: false,
      });
      // All characters, so labels stay letters instead of turning into stray digits
      await w.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      return w;
    })().catch((e) => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

// Student numbers only: everything else on the card is ignored
export const isFullNumber = (read) => /^(19|20)\d{7}$/.test(read);

// How many digits differ between two reads of the same length
export function digitsApart(a, b) {
  if (a.length !== b.length) return Infinity;
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
  return diff;
}

// Each read tries one combination: color channel, tilt correction in degrees, and a band of
// the frame. Bands together cover the whole frame, so the ID can be anywhere; small bands read
// much faster and more often than the whole frame. Blue separates pale text from red best.
const BANDS = [0.4, 0.6, 0.2, 0.8, 0];
const BAND_HEIGHT = 0.3;
const combine = (channel, angles) => angles.flatMap((degrees) => BANDS.map((top) => [channel, degrees, top]));
export const ATTEMPTS = [
  ...combine("blue", [3, -3, 6, -6, -9, 9, 0]),
  ...combine("luma", [0, 3, -3]),
];
const TARGET_WIDTH = 1920;
const READ_TIMEOUT = 30000;

// The part of the video visible in the preview, which uses object-fit: cover
export function visibleRect(vw, vh, boxW, boxH) {
  if (!boxW || !boxH) return { sx: 0, sy: 0, sw: vw, sh: vh };
  const scale = Math.max(boxW / vw, boxH / vh);
  const sw = Math.round(boxW / scale), sh = Math.round(boxH / scale);
  return { sx: Math.round((vw - sw) / 2), sy: Math.round((vh - sh) / 2), sw, sh };
}

function capture(video, top) {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return null;
  const { sx, sy: visY, sw, sh: visH } = visibleRect(vw, vh, video.clientWidth, video.clientHeight);
  const sy = visY + Math.round(visH * top);
  const sh = Math.round(visH * Math.min(BAND_HEIGHT, 1 - top));
  const scale = Math.max(1, TARGET_WIDTH / sw);
  const c = document.createElement("canvas");
  c.width = Math.round(sw * scale);
  c.height = Math.round(sh * scale);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

/* Preprocessing */
function boxBlur(gray, w, h, r) {
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) { row += gray[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const s = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
      out[y * w + x] = s / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}

// One channel, stretched and sharpened. Blue separates pale text from red backgrounds best.
function prepare(canvas, channel, degrees) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;
  const n = w * h;
  const gray = new Uint8ClampedArray(n);
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    gray[i] = channel === "blue" ? px[i * 4 + 2] : (px[i * 4] * 299 + px[i * 4 + 1] * 587 + px[i * 4 + 2] * 114) / 1000;
    hist[gray[i]]++;
  }
  const pctl = (p) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * p) return v; } return 255; };
  const lo = pctl(0.01), hi = Math.max(lo + 1, pctl(0.99));
  const stretched = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) stretched[i] = ((gray[i] - lo) * 255) / (hi - lo);
  const blur = boxBlur(stretched, w, h, Math.round(w / 110));
  for (let i = 0; i < n; i++) {
    const v = Math.max(0, Math.min(255, stretched[i] + 1.8 * (stretched[i] - blur[i])));
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  if (!degrees) return canvas;

  const rad = (degrees * Math.PI) / 180;
  const out = document.createElement("canvas");
  out.width = Math.ceil(Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad)));
  out.height = Math.ceil(Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad)));
  const octx = out.getContext("2d");
  octx.fillStyle = "#000";
  octx.fillRect(0, 0, out.width, out.height);
  octx.translate(out.width / 2, out.height / 2);
  octx.rotate(rad);
  octx.imageSmoothingQuality = "high";
  octx.drawImage(canvas, -w / 2, -h / 2);
  return out;
}

/* Pick best reading */
function pickNumber(blocks) {
  const lines = [];
  for (const b of blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) lines.push(l.words || []);

  let best = null;
  const consider = (words) => {
    const syms = words.flatMap((w) => w.symbols || []);
    const digits = syms.filter((s) => /^\d$/.test(s.text));
    const read = digits.map((s) => s.text).join("");
    if (!isFullNumber(read)) return;
    const conf = digits.map((s) => Math.max(0, Math.min(1, s.confidence / 100)));
    const mean = conf.reduce((a, c) => a + c, 0) / conf.length;
    if (!best || mean > best.mean) best = { read, conf, mean };
  };
  for (const words of lines) {
    for (let i = 0; i < words.length; i++) {
      consider([words[i]]);
      if (i + 1 < words.length) consider([words[i], words[i + 1]]);
    }
  }
  return best;
}

// One attempt on the current frame; null when no student number is visible
export async function readStudentNumber(video, attempt = 0) {
  const [channel, degrees, top] = ATTEMPTS[attempt % ATTEMPTS.length];
  const frame = capture(video, top);
  if (!frame) return null;
  let timer = 0;
  // A stuck engine has to surface as an error instead of scanning forever
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("OCR timed out")), READ_TIMEOUT); });
  try {
    const worker = await Promise.race([getWorker(), timeout]);
    const { data } = await Promise.race([worker.recognize(prepare(frame, channel, degrees), {}, { text: true, blocks: true }), timeout]);
    const found = pickNumber(data.blocks);
    return found ? { read: found.read, conf: found.conf, meanConf: found.mean, channel, degrees, top } : null;
  } finally {
    clearTimeout(timer);
  }
}
