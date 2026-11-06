import { openStore } from "./store.js";
import { createApi } from "./api.js";

/* Vite API plugin */
export function selaeApi({ dataFile = process.env.SELAE_DATA || "data/selae.json" } = {}) {
  let handle;
  const mount = (server) => {
    handle = handle || createApi(openStore(dataFile));
    server.middlewares.use((req, res, next) => { handle(req, res, next).catch(next); });
  };
  return { name: "selae-api", configureServer: mount, configurePreviewServer: mount };
}
