import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:6229",
      "/ws": { target: "ws://localhost:6229", ws: true },
    },
  },
});
