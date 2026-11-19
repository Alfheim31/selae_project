# Custom Face Recognition Training & ONNX Inference (`selae_custom_face`)

This document details the end-to-end biometric pipeline used in SELAE, covering dataset preprocessing, metric-learning model fine-tuning, ONNX export, and client-side WebAssembly inference in `client/lib/face.js`.

## 1. System Architecture

Rather than relying solely on generic pre-trained recognition weights, SELAE splits face verification into a **two-stage browser inference pipeline**:

1. **Face Detection (`TinyFaceDetector` via `@vladmandic/face-api`):** Locates a face bounding box (`{ x, y, width, height }`) from a live `<video>` stream or uploaded `<img>` element.

2. **Custom 128-D Feature Extraction (`selae_custom_face.onnx` via `onnxruntime-web`):** Crops the detected region to $160 \times 160$, normalizes RGB channels to $[-1, 1]$, and executes WebAssembly (WASM) inference locally in the browser to produce an $L_2$-normalized 128-dimensional embedding vector.

Because the output conforms to SELAE's existing **128-float Euclidean embedding** contract, backend matching routes (`POST /api/events/:id/match-face`), database JSONB schemas (`profiles` and `registrations`), and distance thresholds require no structural changes.

## 2. Repository Layout

```
selae_project/
├── training/
│   ├── requirements.txt                  # Python dependencies for preprocessing & training
│   ├── preprocess_faces.py               # EXIF orientation fix, HEIC decoding, MTCNN alignment & cropping
│   └── train_face.py                     # Triplet Margin Loss fine-tuning & ONNX export
├── client/
│   ├── lib/
│   │   └── face.js                       # Hybrid face-api detector + onnxruntime-web embedder
│   └── public/
│       └── models/
│           ├── tiny_face_detector_model-* # Face bounding box detector weights
│           └── selae_custom_face.onnx    # Custom trained 128-D embedding model
├── dataset/                              # [Git-ignored] Raw student folders (6 images per student)
└── dataset_cropped/                      # [Git-ignored] Aligned 160x160 face crops for training

```

## 3. Environment Setup (For re-training & other contributors)

1. **Create and activate a virtual environment** from the repository root (`selae_project/`):

   ```
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   
   ```

   *(On macOS/Linux, run `source .venv/bin/activate`.)*

2. **Install dependencies from `training/requirements.txt`:**

   ```
   python -m pip install --upgrade pip
   pip install -r training/requirements.txt --no-deps
   
   ```

   *(Installing with `--no-deps` prevents `facenet-pytorch==2.6.0` from forcing legacy `Pillow<10.3` and `NumPy<2.0` source builds on modern Python runtimes. If you have an NVIDIA GPU, install the CUDA-enabled `torch` and `torchvision` wheels from [pytorch.org](https://pytorch.org/get-started/locally/) prior to running the command above.)*

## 4. Training Pipeline (`training/`)

### A. Dataset Organization

Each student is represented by a directory named after their student ID inside `dataset/`, containing **6 raw images** spanning two facial expressions and three head poses:

* **Expressions:** Smiling and neutral ("poker") expression

* **Angles:** Frontal, left profile, and right profile

### B. Preprocessing (`training/preprocess_faces.py`)

Raw mobile submissions frequently include `.heic` containers and sideways EXIF rotation tags. `preprocess_faces.py` standardizes all inputs prior to training:

* **Format & Orientation Normalization:** Registers `pillow-heif` (`register_heif_opener()`) to decode `.heic` files and applies `ImageOps.exif_transpose()` so portrait images are oriented upright.

* **Facial Alignment & Cropping:** Uses Multi-task Cascaded Convolutional Networks (`MTCNN`, `image_size=160, margin=20`) to detect facial landmarks, align the face, and save uniform $160 \times 160$ JPEG crops to `dataset_cropped/<student_id>/`.

### C. Metric Learning & ONNX Export (`training/train_face.py`)

* **Network Architecture (`SelaeFaceEmbedder`):** Initializes `InceptionResnetV1(pretrained="vggface2")`, freezes early convolutional blocks while unfreezing the final 20 backbone parameters for domain adaptation, and projects the 512-D representation through a `Linear(512, 128)` layer followed by $L_2$ normalization:
  

  $$
  \hat{\mathbf{z}} = \frac{\mathbf{z}}{\Vert{}\mathbf{z}\Vert{}_2}
  $$

* **Triplet Margin Objective:** `MultiAngleTripletDataset` constructs triplets $(\mathbf{x}_a, \mathbf{x}_p, \mathbf{x}_n)$ where anchor $\mathbf{x}_a$ and positive $\mathbf{x}_p$ are distinct images of the **same student** (pairing smiling/neutral expressions across front/left/right angles) and negative $\mathbf{x}_n$ belongs to a different identity. Training minimizes the Triplet Margin Loss ($\alpha = 0.4$):
  

  $$
  \mathcal{L} = \max\left(0,\; \Vert{}\hat{\mathbf{z}}_a - \hat{\mathbf{z}}_p\Vert{}_2^2 - \Vert{}\hat{\mathbf{z}}_a - \hat{\mathbf{z}}_n\Vert{}_2^2 + \alpha\right)
  $$

  
  This encourages pose- and expression-invariant clustering in 128-D Euclidean space.

* **ONNX Serialization:** Exports the trained weights as a single self-contained graph (`opset_version=17`, `dynamo=False`) accepting tensor `"input"` of shape `[batch, 3, 160, 160]` and emitting `"embedding"` of shape `[batch, 128]`.

### Re-training Workflow

Whenever new student photos are added to `dataset/`:

```
.\.venv\Scripts\Activate.ps1
py .\training\preprocess_faces.py
py .\training\train_face.py

```

Move or copy the generated `selae_custom_face.onnx` file into `client/public/models/selae_custom_face.onnx`.

## 5. Client-Side Inference (`client/lib/face.js`)

`client/lib/face.js` orchestrates detection and embedding extraction in the browser while maintaining the exact interface consumed by `FaceCapture.jsx` and `Scanner.jsx`:

| Function | Responsibility | 
| ----- | ----- | 
| `ensureFaceModels()` | Lazily loads `tinyFaceDetector` from `/models` and initializes a single-threaded WebAssembly (`numThreads = 1`) `ort.InferenceSession` from `/models/selae_custom_face.onnx`. Single-threaded WASM avoids `SharedArrayBuffer` cross-origin isolation header requirements. | 
| `preprocessCrop(mediaElement, box)` | Draws the detected face bounding box onto an offscreen $160 \times 160$ `<canvas>` and converts RGBA pixel data into a planar `CHW` (`[1, 3, 160, 160]`) `Float32Array` normalized via $(x / 255 - 0.5) / 0.5$ to match PyTorch's preprocessing. | 
| `extractFaceDescriptor(mediaElement)` | Runs `faceapi.detectSingleFace` (returning `null` if no face is detected), executes `session.run({ input: inputTensor })`, and returns `{ descriptor, score }`. | 
| `euclideanDistance(a, b)` | Computes the $L_2$ distance $d(\mathbf{a}, \mathbf{b}) = \sqrt{\sum_{i=1}^{128} (a_i - b_i)^2}$ between two 128-D descriptors. | 

## 6. Version Control & Deployment Guidelines

* **Static Asset Path:** Vite serves static files from `client/public/`. Ensure `selae_custom_face.onnx` resides strictly inside `client/public/models/` (not a root-level `public/` directory) and avoid keeping duplicate copies outside `models/`.