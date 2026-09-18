/**
 * ローカル開発用のサーバー。
 *
 * HTTP（手番のアクション）と WebSocket（更新の通知）を同じポートで受ける。
 * フロントの dev サーバーは /api と /ws の両方をここへプロキシする。
 */
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createNodeRealtime } from "./realtime/node-server.js";
import { createInMemoryRoomStore } from "./room/store.js";

const port = Number(process.env.PORT ?? 3001);

// ルーム API と配信で同じストアを見る必要があるため、ここで1つ作って両方へ渡す
const store = createInMemoryRoomStore();
const realtime = createNodeRealtime(store);
const app = createApp({ store, publish: realtime.publish });

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`backend listening on http://localhost:${info.port}`);
});

realtime.attach(server);
