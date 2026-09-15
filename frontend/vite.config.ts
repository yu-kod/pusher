import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:3001",
      // ローカルの更新通知用 WebSocket（#15 で backend 側に実装する）
      "/ws": { target: "ws://localhost:3001", ws: true },
    },
  },
});
