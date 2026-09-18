import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * 試作の画面だけを単体で書き出す設定（#77）。
 *
 * 本体のビルド（`vite.config.ts`）はそのまま。こちらは相対パスで出すので、
 * どこに置いても開ける。
 */
export default defineConfig({
  root: path.resolve(__dirname, "demo"),
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  build: { outDir: path.resolve(__dirname, "demo-dist"), emptyOutDir: true },
});
