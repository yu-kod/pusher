/**
 * 本番で「1つの接続へ送る」を埋めるアダプタ（docs/realtime.md §6, §7）。
 *
 * `hub.ts` はソケットも AWS も知らない。ここがその接点で、
 * API Gateway WebSocket API の `PostToConnection` に置き換える。
 * ローカル開発の `node-server.ts` と同じ位置にあるものの、本番版。
 *
 * ## 失敗はそのまま投げる
 *
 * すでに閉じた接続へ送ると API Gateway は `410 Gone` を返す。ここでは握り潰さず、
 * 呼び出し側（`hub.ts` の `publish`）に失敗として渡す。hub はそれを受けて
 * レジストリから消すので、`$disconnect` を取りこぼしていてもここで回収できる。
 *
 * 配信の失敗でプレイヤーの手番を巻き戻さないことは hub 側が保証している。
 */
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import type { Send } from "./hub.js";

/** テストから差し替えられるよう関数で受け取る */
export type ApiGatewaySend = (command: PostToConnectionCommand) => Promise<unknown>;

export type ApiGatewaySendOptions = {
  /** 管理 API のエンドポイント（`https://<api-id>.execute-api.<region>.amazonaws.com/<stage>`） */
  endpoint: string;
  send?: ApiGatewaySend;
};

function defaultSend(endpoint: string): ApiGatewaySend {
  // クライアントは1つだけ作って使い回す（Lambda の warm start で接続を再利用するため）
  const client = new ApiGatewayManagementApiClient({ endpoint });
  return (command) => client.send(command);
}

export function createApiGatewaySend(options: ApiGatewaySendOptions): Send {
  const send = options.send ?? defaultSend(options.endpoint);

  return async (connectionId, message) => {
    await send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: JSON.stringify(message),
      })
    );
  };
}
