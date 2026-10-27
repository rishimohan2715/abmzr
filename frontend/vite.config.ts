import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The API base is injected at build time via VITE_API_BASE (see docker-compose
// and README). In local dev we proxy /api to the FastAPI server on :8000.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 3000,
  },
});
