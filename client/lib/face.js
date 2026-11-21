import * as faceapi from "@vladmandic/face-api";
import * as ort from "onnxruntime-web/wasm";

ort.env.wasm.numThreads = 1;

let detectorLoaded = null;
let ortSession = null;

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
    ortSession = ort.InferenceSession.create("/models/selae_custom_face.onnx", {
      executionProviders: ["wasm"],
    }).catch((err) => {
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