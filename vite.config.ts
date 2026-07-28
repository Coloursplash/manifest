import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri drives Vite; keep a fixed port and don't clear the terminal so
// Rust build output stays visible. See https://tauri.app/start/frontend/vite/
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: {
      // src-tauri is watched by the Rust side, not Vite.
      ignored: ["**/src-tauri/**"],
    },
  },
}));
