/**
 * 環境に応じて配信の実体を選ぶ（docs/realtime.md §6, §7）。
 *
 * `create-store.ts` と同じ考え方。環境変数があれば本番の実体（DynamoDB の
 * レジストリと `PostToConnection`）、無ければ何もしない。
 *
 * ## 配信できなくても遊べる
 *
 * WebSocket のエンドポイントが無い環境では `createPublish` が `undefined` を返し、
 * ルーム API は配信しない。クライアントはポーリングで追えるので、
 * 「WebSocket が無い＝遊べない」にはならない（docs/realtime.md §5）。
 *
 * ローカル開発は `index.ts` が `node-server.ts` の publish を直接渡すので、
 * ここは通らない。
 */
import { createRoomStore, TABLE_NAME_ENV } from "../room/create-store.js";
import type { Room } from "../room/room.js";
import type { RoomStore } from "../room/store.js";
import { createApiGatewaySend } from "./apigw-send.js";
import { createRealtimeHub } from "./hub.js";
import { createDynamoConnectionRegistry } from "./dynamo-registry.js";
import { createInMemoryConnectionRegistry, type ConnectionRegistry } from "./registry.js";

/** Terraform が Lambda へ渡す（infra/websocket.tf）。管理 API のエンドポイント */
export const WS_ENDPOINT_ENV = "WS_ENDPOINT";

type Env = Record<string, string | undefined>;

/**
 * 接続レジストリを選ぶ。
 *
 * 本番の Lambda は接続ごとに別の実行環境で動くので、プロセス内の `Map` では
 * 「このルームに繋いでいる接続」を引けない。ルームと同じテーブルに載せる。
 */
export function createConnectionRegistry(env: Env = process.env): ConnectionRegistry {
  const tableName = env[TABLE_NAME_ENV];
  if (tableName === undefined || tableName === "") {
    return createInMemoryConnectionRegistry();
  }
  return createDynamoConnectionRegistry({ tableName });
}

/**
 * ルーム API に渡す配信関数を作る。エンドポイントが無ければ配信しない。
 *
 * ストアは API と同じものを渡す。配信は「保存した状態をそのまま配る」ことなので、
 * 別の保存先を見ると配信の中身だけが古くなる。
 */
export function createPublish(
  store: RoomStore,
  env: Env = process.env
): ((room: Room) => Promise<void>) | undefined {
  const endpoint = env[WS_ENDPOINT_ENV];
  if (endpoint === undefined || endpoint === "") {
    return undefined;
  }

  const hub = createRealtimeHub({
    store,
    registry: createConnectionRegistry(env),
    send: createApiGatewaySend({ endpoint }),
  });

  return hub.publish;
}

/**
 * ルーム API と配信で同じストアを見るための組み立て（本番の入口から使う）。
 *
 * 別々に作ると、配信だけが別の保存先を読むことになる。
 */
export function createStoreAndPublish(env: Env = process.env) {
  const store = createRoomStore(env);
  return { store, publish: createPublish(store, env) };
}
