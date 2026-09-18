/**
 * 接続レジストリの DynamoDB 実装（docs/realtime.md §7 / docs/storage.md）。
 *
 * 本番の Lambda は接続ごとに別の実行環境で動くので、プロセス内の `Map`
 * （`registry.ts`）では「このルームに繋いでいる接続」を引けない。
 * ルームの保存（#78）と同じテーブルに載せて、実行環境をまたいで共有する。
 *
 * | 項目 | PK | SK | GSI1PK | GSI1SK |
 * |---|---|---|---|---|
 * | 接続 | `CONN#<connectionId>` | `CONN` | `ROOM#<code>` | `CONN#<id>` |
 *
 * 引き方は2つだけ。接続 ID で消す（`$disconnect`）と、ルームから逆引きする（配信）。
 *
 * ## トークンは保存しない
 *
 * 持つのは `playerId` まで（docs/realtime.md §4）。保存すると、接続の一覧を
 * 読めることが「なりすませること」と同じ意味になってしまう。
 *
 * ## TTL
 *
 * `$disconnect` は取りこぼしうる（API Gateway が送れなかった場合など）ので、
 * 消し残しが永久に積もらないよう TTL を置く。配信時に 410 を受けて消す経路
 * （`hub.ts`）と合わせて二重の掃除になる。
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import type { RoomCode } from "../room/room.js";
import type { Connection, ConnectionRegistry } from "./registry.js";

/**
 * 接続を保持する時間。
 *
 * API Gateway WebSocket の接続そのものが最長2時間で切れるため、
 * それより長く持っていても意味がない。
 */
export const CONNECTION_TTL_SECONDS = 2 * 60 * 60;

/** ルームからの逆引きに使う索引（infra/dynamodb.tf） */
const INDEX_NAME = "GSI1";

const CONNECTION_PREFIX = "CONN#";

/** GSI1 から引ける属性（infra/dynamodb.tf の projection と合わせる） */
type ConnectionItem = { GSI1SK: string; playerId?: string | null };

/** 接続項目のキー */
export function connectionKey(connectionId: string) {
  return { PK: `${CONNECTION_PREFIX}${connectionId}`, SK: "CONN" };
}

/** 送るのは3種類だけ。テストから差し替えられるよう関数で受け取る */
export type DynamoRegistrySend = (
  command: PutCommand | DeleteCommand | QueryCommand
) => Promise<{ Items?: Record<string, unknown>[] }>;

export type DynamoConnectionRegistryOptions = {
  tableName: string;
  /** 省略すると既定のクライアントを1つ作って使い回す（warm start で再利用される） */
  send?: DynamoRegistrySend;
  now?: () => number;
};

function defaultSend(): DynamoRegistrySend {
  // モジュールを跨いで1つだけ作る。Lambda の warm start で接続を再利用するため
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  // send はコマンドごとにオーバーロードされていて合併型を受け取れない。
  // 実体は同じ1つのメソッドなので、ここで型だけ合わせる
  return (command) => client.send(command as QueryCommand);
}

export function createDynamoConnectionRegistry(
  options: DynamoConnectionRegistryOptions
): ConnectionRegistry {
  const { tableName } = options;
  const now = options.now ?? (() => Date.now());
  const send = options.send ?? defaultSend();

  return {
    async add(connection) {
      await send(
        new PutCommand({
          TableName: tableName,
          Item: {
            ...connectionKey(connection.connectionId),
            GSI1PK: `ROOM#${connection.code}`,
            GSI1SK: `${CONNECTION_PREFIX}${connection.connectionId}`,
            playerId: connection.playerId,
            // TTL は epoch 秒。ミリ秒のまま渡すと遥か未来になり、いつまでも消えない
            expiresAt: Math.floor(now() / 1000) + CONNECTION_TTL_SECONDS,
          },
        })
      );
    },

    async remove(connectionId) {
      await send(new DeleteCommand({ TableName: tableName, Key: connectionKey(connectionId) }));
    },

    async listByRoom(code: RoomCode) {
      const { Items } = await send(
        new QueryCommand({
          TableName: tableName,
          IndexName: INDEX_NAME,
          KeyConditionExpression: "GSI1PK = :room",
          ExpressionAttributeValues: { ":room": `ROOM#${code}` },
        })
      );

      // 1つの卓に繋ぐのは数接続なので、ページを跨ぐことは起きない
      const items = (Items ?? []) as ConnectionItem[];
      return items.map((item): Connection => ({
        connectionId: item.GSI1SK.slice(CONNECTION_PREFIX.length),
        code,
        // 観戦者は playerId を持たない
        playerId: item.playerId ?? null,
      }));
    },
  };
}
