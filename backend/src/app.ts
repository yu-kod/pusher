import { Hono } from "hono";

/**
 * Hono アプリを組み立てる。
 *
 * Lambda / ローカルサーバーのどちらからも同じアプリを使えるよう、
 * listen は呼び出し側（src/index.ts）に任せる。
 */
export function createApp() {
  const app = new Hono();

  app.get("/api/health", (c) => c.json({ status: "ok" }));

  return app;
}
