import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The built SPA is served by the Worker's [assets] binding (../worker with
// directory = ../web/dist). In dev, proxy API + ingest calls to `wrangler dev`.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": "http://localhost:8787",
      "/ingest": "http://localhost:8787",
      "/health": "http://localhost:8787",
    },
  },
});
