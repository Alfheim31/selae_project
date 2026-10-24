import fs from "node:fs";
import path from "node:path";
import { buildSeed } from "./seed.js";

/* Physical layer */

export function openStore(file) {
  const dataFile = path.resolve(file);
  let data;

  if (fs.existsSync(dataFile)) {
    data = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  } else {
    data = buildSeed(new Date());
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    write();
  }
  data.rev = data.rev || 1;

  function write() {
    const tmp = `${dataFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, dataFile);
  }

  // Uploads folder
  const uploadsDir = path.join(path.dirname(dataFile), "uploads");
  fs.mkdirSync(uploadsDir, { recursive: true });

  return {
    file: dataFile,
    uploadsDir,
    get data() { return data; },
    mutate(fn) {
      const out = fn(data);
      data.rev += 1;
      write();
      return out;
    },
  };
}
