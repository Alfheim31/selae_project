/* Image resize before upload */
export async function prepareImage(file, { max = 1800, quality = 0.84 } = {}) {
  if (!file || !/^image\//.test(file.type)) throw new Error("Choose an image file (JPEG, PNG or WebP).");
  let source;
  try {
    source = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    source = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("This image couldn't be opened. Try a JPEG or PNG."));
      img.src = URL.createObjectURL(file);
    });
  }
  const w = source.width, h = source.height;
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if (source.close) source.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("This image couldn't be prepared for upload.");
  return blob;
}
