/**
 * Lambda のエントリポイント（WebSocket API）。
 *
 * HTTP 側（`lambda.ts`）と対になる入口。組み立ては `ws-handler.ts` に閉じてあるので、
 * ここは環境から実体を選んで渡すだけにする。
 *
 * 送り先のエンドポイントは接続ごとのイベントから分かるので、`sendFor` を渡して
 * ハンドラ側で組み立てさせる。
 */
import { createApiGatewaySend } from "./realtime/apigw-send.js";
import { createConnectionRegistry } from "./realtime/create-realtime.js";
import { createWsHandler } from "./realtime/ws-handler.js";
import { createRoomStore } from "./room/create-store.js";

export const handler = createWsHandler({
  store: createRoomStore(),
  registry: createConnectionRegistry(),
  sendFor: (endpoint) => createApiGatewaySend({ endpoint }),
});
