import { Hono } from "hono";
import { createStoreAndPublish } from "./realtime/create-realtime.js";
import { ApiError } from "./routes/errors.js";
import { createRoomsRoute, type RoomsDeps } from "./routes/rooms.js";

/**
 * Hono アプリを組み立てる。
 *
 * Lambda / ローカルサーバーのどちらからも同じアプリを使えるよう、
 * listen は呼び出し側（src/index.ts）に任せる。
 *
 * 保存先と配信は環境変数で決まる。テーブル名があれば DynamoDB（#78）、
 * WebSocket のエンドポイントがあれば API Gateway へ配信する（#90）。
 * どちらも無ければインメモリで、配信もしない。テストは直接渡して差し替える。
 */
export function createApp(deps: Partial<RoomsDeps> = {}) {
  const fromEnv = createStoreAndPublish();
  const { store = fromEnv.store, publish = fromEnv.publish, ...rest } = deps;
  const app = new Hono();

  app.get("/api/health", (c) => c.json({ status: "ok" }));

  app.route("/api/rooms", createRoomsRoute({ ...rest, store, publish }));

  // エラーの形式を1箇所に集約する
  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return c.json({ error: { code: error.code, message: error.message } }, error.statusCode);
    }
    return c.json({ error: { code: "INTERNAL_ERROR", message: "想定外のエラー" } }, 500);
  });

  return app;
}
