/**
 * API Gateway WebSocket API のイベントを hub に渡す（docs/realtime.md §7）。
 *
 * ローカル開発の `node-server.ts` と同じ位置にある本番版。ソケットの代わりに
 * Lambda のイベントが届き、送信は `PostToConnection`（`apigw-send.ts`）になる。
 * hub は 3 つのルートを知らないままでいられる。
 *
 * ## ルートは3つだけ
 *
 * | ルート | すること |
 * |---|---|
 * | `$connect` | 受け入れるだけ。まだどのルームのものか分からない |
 * | `$default` | 届いたメッセージを hub へ（`hello` / `ping`） |
 * | `$disconnect` | レジストリから消す |
 *
 * 繋いだ時点ではルームコードもトークンも分からないので、紐づけは `hello`
 * （`$default`）で行う。`$connect` のクエリ文字列にトークンを載せる形にしない。
 * URL はプロキシやログに残るのに対し、本文は残らない。
 *
 * ## 何があっても 200 を返す
 *
 * `$connect` 以外で 2xx 以外を返すと API Gateway は接続を切る。
 * 読めないメッセージ1つや、すでに切れた相手への送信の失敗で、
 * 繋がっている接続まで落とさない。エラーは hub が `error` メッセージで返す。
 */
import type { RoomStore } from "../room/store.js";
import { createRealtimeHub, type Send } from "./hub.js";
import type { ConnectionRegistry } from "./registry.js";

/** 使うところだけを型にする（`aws-lambda` の型を依存に足さない） */
export type WebSocketEvent = {
  requestContext: {
    routeKey: string;
    connectionId: string;
    domainName?: string;
    stage?: string;
  };
  body?: string | null;
};

export type WsHandlerDeps = {
  store: RoomStore;
  registry: ConnectionRegistry;
  /** 管理 API のエンドポイントから「1つの接続へ送る」を作る */
  sendFor: (endpoint: string) => Send;
};

export type WsHandler = (event: WebSocketEvent) => Promise<{ statusCode: number }>;

const OK = { statusCode: 200 };

export function createWsHandler(deps: WsHandlerDeps): WsHandler {
  return async (event) => {
    const { routeKey, connectionId, domainName, stage } = event.requestContext;

    if (routeKey === "$connect") {
      return OK;
    }

    // 送り先は接続を受けたドメインから組み立てる。カスタムドメインでも同じ形で通る
    const send = deps.sendFor(`https://${domainName}/${stage}`);
    const hub = createRealtimeHub({ store: deps.store, registry: deps.registry, send });

    try {
      if (routeKey === "$disconnect") {
        await hub.handleDisconnect(connectionId);
      } else {
        await hub.handleMessage(connectionId, event.body ?? "");
      }
    } catch {
      // 送信も掃除も、失敗したところで接続を切る理由にはならない
    }

    return OK;
  };
}
