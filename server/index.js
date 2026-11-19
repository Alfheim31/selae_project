import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { connectStore } from "./storage/store.js";
import { createApi } from "./api.js";

/* Venue server */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const PORT = Number(process.env.PORT) || 8080;
const store = await connectStore();
const api = createApi(store);

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".woff2": "font/woff2", ".woff": "font/woff", ".jpg": "image/jpeg", ".webp": "image/webp" };

// Face and OCR models (the face model alone is 94 MB) keep their names when retrained, so they can't be
// cached forever like /assets. Phones keep them for a day, then ask again; the ETag is a hash of the
// content, so an unchanged model costs a 304 instead of a download, even after a redeploy.
const MODEL_DIRS = [`${path.sep}models${path.sep}`, `${path.sep}tesseract${path.sep}`];
const etags = new Map();
function etagOf(file, stat) {
  const key = `${file}:${stat.size}:${stat.mtimeMs}`;
  if (!etags.has(key)) {
    etags.set(key, new Promise((resolve, reject) => {
      const hash = crypto.createHash("sha256");
      fs.createReadStream(file).on("data", (c) => hash.update(c)).on("error", reject)
        .on("end", () => resolve(`"${hash.digest("base64url").slice(0, 27)}"`));
    }).catch((e) => { etags.delete(key); throw e; }));
  }
  return etags.get(key);
}

if (!fs.existsSync(path.join(dist, "index.html"))) {
  console.error("No build found. Run `npm start` (it builds first) or `npm run build`.");
  process.exit(1);
}

http.createServer(async (req, res) => {
  try {
    if ((await api(req, res, null)) || res.writableEnded || res.headersSent) return;
    const url = new URL(req.url, "http://x");
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); }
    catch { res.statusCode = 400; res.end("Bad request"); return; }
    let file = path.normalize(path.join(dist, pathname));
    if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, "index.html");
    res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
    if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    else if (MODEL_DIRS.some((d) => file.includes(d))) {
      const etag = await etagOf(file, fs.statSync(file));
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.setHeader("ETag", etag);
      if (String(req.headers["if-none-match"] || "").split(/\s*,\s*/).includes(etag)) { res.statusCode = 304; res.end(); return; }
    }
    fs.createReadStream(file).on("error", () => { if (!res.headersSent) res.statusCode = 500; res.end(); }).pipe(res);
  } catch (e) {
    // Request errors
    console.error(e);
    if (!res.headersSent) { res.statusCode = 500; res.end(); }
  }
}).listen(PORT, "0.0.0.0", () => {
  console.log(`\nSELAE is running.\n`);
  console.log(`  Organizer (this laptop, camera works here):  http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces()))
    for (const a of list || []) if (a.family === "IPv4" && !a.internal) console.log(`  Phones on the same Wi-Fi:                     http://${a.address}:${PORT}`);
  console.log(`\n  Data: ${store.file}\n`);
});
