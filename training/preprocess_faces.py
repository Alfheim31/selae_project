import os
import torch
from PIL import Image, ImageOps
from pillow_heif import register_heif_opener
from facenet_pytorch import MTCNN

register_heif_opener()

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
mtcnn = MTCNN(image_size=160, margin=20, keep_all=False, device=device)

SRC_DIR = "dataset"
OUT_DIR = "dataset_cropped"
VALID_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".heic")

os.makedirs(OUT_DIR, exist_ok=True)
total_saved = 0
skipped = []

for student_id in sorted(os.listdir(SRC_DIR)):
    src_sub = os.path.join(SRC_DIR, student_id)
    if not os.path.isdir(src_sub):
        continue

    out_sub = os.path.join(OUT_DIR, student_id)
    os.makedirs(out_sub, exist_ok=True)

    files = [f for f in sorted(os.listdir(src_sub)) if f.lower().endswith(VALID_EXTS)]
    saved_idx = 1

    for fname in files:
        fpath = os.path.join(src_sub, fname)
        try:
            img = Image.open(fpath)
            img = ImageOps.exif_transpose(img).convert("RGB")
            out_path = os.path.join(out_sub, f"face_{saved_idx}.jpg")
            result = mtcnn(img, save_path=out_path)
            if result is not None:
                saved_idx += 1
                total_saved += 1
            else:
                skipped.append(f"{student_id}/{fname} (no face detected)")
        except Exception as e:
            skipped.append(f"{student_id}/{fname} ({e})")

print(f"Done! Cropped and saved {total_saved} faces into '{OUT_DIR}/'.")
if skipped:
    print(f"\nSkipped {len(skipped)} images:")
    for item in skipped:
        print(" -", item)