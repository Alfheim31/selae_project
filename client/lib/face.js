import { useSyncExternalStore } from "react";
import * as faceapi from "@vladmandic/face-api";
import * as ort from "onnxruntime-web/wasm";

ort.env.wasm.numThreads = 1;

let detectorLoaded = null;
let ortSession = null;

/* The face model is the big download (about 23 MB, around 10 MB compressed), so its progress is shared with the screens that wait for it:
   useFaceModel() gives { loaded, total, ready } in bytes. Later visits load it from the browser's cache. */
const MODEL_URL = "/models/selae_custom_face.onnx";
let progress = { loaded: 0, total: 0, downloaded: false, ready: false };
const listeners = new Set();
function setProgress(next) { progress = next; listeners.forEach((f) => f()); }
const subscribe = (f) => { listeners.add(f); return () => listeners.delete(f); };
export const useFaceModel = () => useSyncExternalStore(subscribe, () => progress);
// Percent done, or null when the size isn't known (a compressed download counts more bytes than it announced)
export function modelPercent(p) {
  if (p.downloaded) return null;
  if (!p.total || p.loaded > p.total) return null;
  return Math.min(99, Math.floor((p.loaded / p.total) * 100));
}
// "Downloading the face model: 45% (4.6 of 10.3 MB)"
export function modelText(p) {
  const mb = (n) => (n / 1048576).toFixed(1);
  const pc = modelPercent(p);
  if (p.downloaded) return "Face model downloaded. Starting the face reader…";
  if (!p.loaded) return "Downloading the face model…";
  return pc === null ? `Downloading the face model: ${mb(p.loaded)} MB` : `Downloading the face model: ${pc}% (${mb(p.loaded)} of ${mb(p.total)} MB)`;
}

async function downloadModel() {
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`Couldn't download the face model (${res.status}).`);
  // The size known at build time; a compressed download's content-length is the smaller, compressed size
  const built = typeof __FACE_MODEL_BYTES__ === "number" ? __FACE_MODEL_BYTES__ : 0; // eslint-disable-line no-undef
  const sent = res.headers.get("content-encoding") ? 0 : Number(res.headers.get("content-length")) || 0;
  const total = sent || built;
  if (!res.body) { const buf = new Uint8Array(await res.arrayBuffer()); setProgress({ loaded: buf.length, total: buf.length, downloaded: true, ready: false }); return buf; }
  const reader = res.body.getReader();
  const parts = [];
  let loaded = 0, lastShown = 0;
  setProgress({ loaded: 0, total, ready: false });
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    loaded += value.length;
    // A few updates a second is plenty for a progress bar
    if (loaded - lastShown > 200000) { lastShown = loaded; setProgress({ loaded, total, ready: false }); }
  }
  const bytes = new Uint8Array(loaded);
  let at = 0;
  for (const part of parts) { bytes.set(part, at); at += part.length; }
  // Downloaded; the face reader itself still has to start
  setProgress({ loaded, total: total || loaded, downloaded: true, ready: false });
  return bytes;
}

const detectorOptions = new faceapi.TinyFaceDetectorOptions({
  inputSize: 320,
  scoreThreshold: 0.5,
});

// face-api's TensorFlow bundle ranks its WebAssembly backend first, but that backend needs its own .wasm files
// and isn't ready when detection starts ("backend 'wasm' has not yet been initialized"). Pick a backend
// ourselves, the graphics card first and plain JavaScript if that fails, and wait until it's ready.
let backendReady = null;
function ensureBackend() {
  if (!backendReady) {
    backendReady = (async () => {
      const tf = faceapi.tf;
      for (const name of ["webgl", "cpu"]) {
        try { if (await tf.setBackend(name)) { await tf.ready(); return name; } } catch { /* try the next one */ }
      }
      throw new Error("This browser can't run the face detector.");
    })().catch((err) => { backendReady = null; throw err; });
  }
  return backendReady;
}

export async function ensureFaceModels() {
  await ensureBackend();
  if (!detectorLoaded) {
    detectorLoaded = faceapi.nets.tinyFaceDetector.loadFromUri("/models").catch((err) => {
      detectorLoaded = null;
      throw err;
    });
  }

  if (!ortSession) {
    ortSession = downloadModel().then((bytes) => ort.InferenceSession.create(bytes, {
      executionProviders: ["wasm"],
    })).then((session) => {
      setProgress({ ...progress, ready: true });
      return session;
    }).catch((err) => {
      setProgress({ loaded: 0, total: 0, downloaded: false, ready: false });
      ortSession = null;
      throw err;
    });
  }

  await Promise.all([detectorLoaded, ortSession]);
  return ortSession;
}

function preprocessCrop(mediaElement, box) {
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 160;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(mediaElement, box.x, box.y, box.width, box.height, 0, 0, 160, 160);

  const { data } = ctx.getImageData(0, 0, 160, 160);
  const float32 = new Float32Array(3 * 160 * 160);
  const stride = 160 * 160;

  for (let i = 0; i < stride; i++) {
    float32[i] = (data[i * 4] / 255 - 0.5) / 0.5;
    float32[stride + i] = (data[i * 4 + 1] / 255 - 0.5) / 0.5;
    float32[2 * stride + i] = (data[i * 4 + 2] / 255 - 0.5) / 0.5;
  }

  return new ort.Tensor("float32", float32, [1, 3, 160, 160]);
}

export async function extractFaceDescriptor(mediaElement) {
  const session = await ensureFaceModels();
  const detection = await faceapi.detectSingleFace(mediaElement, detectorOptions);

  if (!detection) return null;

  const inputTensor = preprocessCrop(mediaElement, detection.box);
  const results = await session.run({ input: inputTensor });
  const outputKey = session.outputNames?.[0] || "embedding";
  const descriptor = Array.from(results[outputKey].data);

  return {
    descriptor,
    score: detection.score,
  };
}

export function euclideanDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}