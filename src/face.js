import * as faceapi from "@vladmandic/face-api";

let modelsLoaded = null;

export function ensureFaceModels() {
	if (!modelsLoaded) {
		modelsLoaded = Promise.all([
			faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
			faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
			faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
		]).catch((err) => {
			modelsLoaded = null;
			throw err;
		});
	}
	return modelsLoaded;
}

const detectorOptions = new faceapi.TinyFaceDetectorOptions({
	inputSize: 320,
	scoreThreshold: 0.5,
});


 // Extracts a 128-dimensional float array from a <video>, <img>, or <canvas> element.
 // Returns null if no face is clearly visible.
export async function extractFaceDescriptor(mediaElement) {
	await ensureFaceModels();
	const detection = await faceapi
		.detectSingleFace(mediaElement, detectorOptions)
		.withFaceLandmarks()
		.withFaceDescriptor();

	if (!detection) return null;
	return {
		descriptor: Array.from(detection.descriptor),
		score: detection.detection.score,
	};
}

// Euclidean distance between two 128-D descriptors.
export function euclideanDistance(a, b) {
	if (!a || !b || a.length !== b.length) return Infinity;
	let sum = 0;
	for (let i = 0; i < a.length; i++) {
		const diff = a[i] - b[i];
		sum += diff * diff;
	}
	return Math.sqrt(sum);
}
