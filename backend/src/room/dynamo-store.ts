/**
 * ルームの保存先の DynamoDB 実装（#78）。
 *
 * これが無いと、Lambda はリクエストごとに別の実行環境へ振られうるので、
 * ルームを作った直後の参加で「ルームが無い」になったり、2人が別々の状態を
 * 見たりする。本番でオンライン対戦が成立する土台。
 *
 * ## テーブル設計（単一テーブル）
 *
 * 汎用キー名にプレフィックス付きの値を入れる。ルームだけなら単一 PK で足りるが、
 * WebSocket の接続レジストリ（#15 の本番化）が同じ形でこのテーブルに乗る。
 *
 * | 項目 | PK | SK | GSI1PK | GSI1SK | 備考 |
 * |---|---|---|---|---|---|
 * | ルーム | `ROOM#<code>` | `ROOM` | — | — | `body` に直列化した状態、`rev` に版 |
 * | 接続（#15） | `CONN#<connectionId>` | `CONN` | `ROOM#<code>` | `CONN#<id>` | GSI1 でルーム→接続を引く |
 *
 * どちらも `expiresAt`（epoch 秒）で TTL に載せる。アカウントの無いサービスなので
 * 放置されたものを溜め込まない。
 *
 * ## 直列化
 *
 * 保存と復元は serialize.ts を必ず通す。`Balance.pushCount` が関数なので、
 * 素朴な JSON 化では黙って消え、復元した状態で押し出しを解決できなくなる。
 * 属性に分解せず、直列化済みの文字列を `body` に1つ持たせる。
 *
 * ## 同時更新
 *
 * 書き込みは条件付き。作成は「同じコードが無いこと」、更新は「読んだときの版の
 * ままであること」を条件にする。条件が外れたら `RoomConflictError` を投げ、
 * API はそれを 409 に変換する。
 */
import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { DEFAULT_BALANCE, type Balance } from "../game/balance.js";
import type { Room, RoomCode } from "./room.js";
import { deserializeRoom, serializeRoom } from "./serialize.js";
import { RoomConflictError, type RoomStore } from "./store.js";

/** ルームを保持する時間。放置された卓はここで消える */
export const ROOM_TTL_SECONDS = 24 * 60 * 60;

/** ルーム項目のキー。接続項目（#15）は `CONN#<connectionId>` を使う */
export function roomKey(code: RoomCode) {
  return { PK: `ROOM#${code}`, SK: "ROOM" };
}

/** 送るのは3種類だけ。テストから差し替えられるよう関数で受け取る */
export type DynamoSend = (
  command: GetCommand | PutCommand | DeleteCommand
) => Promise<{ Item?: Record<string, unknown> }>;

export type DynamoRoomStoreOptions = {
  tableName: string;
  /** 省略すると既定のクライアントを1つ作って使い回す（warm start で再利用される） */
  send?: DynamoSend;
  config?: Balance;
  now?: () => number;
};

/** 保存する項目の形 */
type RoomItem = {
  PK: string;
  SK: string;
  body: string;
  rev: number;
  updatedAt: number;
  expiresAt: number;
};

function defaultSend(): DynamoSend {
  // モジュールを跨いで1つだけ作る。Lambda の warm start で接続を再利用するため
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  // send はコマンドごとにオーバーロードされていて合併型を受け取れない。
  // 実体は同じ1つのメソッドなので、ここで型だけ合わせる
  return (command) => client.send(command as GetCommand);
}

/** 条件付き書き込みの失敗だけを「誰かが先に書いた」に変換する */
async function conditional(code: RoomCode, action: Promise<unknown>): Promise<void> {
  try {
    await action;
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      throw new RoomConflictError(code);
    }
    throw error;
  }
}

export function createDynamoRoomStore(options: DynamoRoomStoreOptions): RoomStore {
  const { tableName } = options;
  const config = options.config ?? DEFAULT_BALANCE;
  const now = options.now ?? (() => Date.now());
  const send = options.send ?? defaultSend();

  const itemFor = (room: Room, rev: number): RoomItem => ({
    ...roomKey(room.code),
    body: serializeRoom(room),
    rev,
    updatedAt: room.updatedAt,
    // TTL は epoch 秒。ミリ秒のまま渡すと遥か未来になり、いつまでも消えない
    expiresAt: Math.floor(now() / 1000) + ROOM_TTL_SECONDS,
  });

  return {
    async get(code) {
      const { Item } = await send(
        new GetCommand({
          TableName: tableName,
          Key: roomKey(code),
          // 作成直後の参加で「ルームが無い」にならないよう、結果整合では読まない
          ConsistentRead: true,
        })
      );
      if (Item === undefined) {
        return null;
      }

      const item = Item as RoomItem;
      return { room: deserializeRoom(item.body, config), rev: item.rev };
    },

    create(room) {
      return conditional(
        room.code,
        send(
          new PutCommand({
            TableName: tableName,
            Item: itemFor(room, 1),
            ConditionExpression: "attribute_not_exists(PK)",
          })
        )
      );
    },

    update(room, expectedRev) {
      return conditional(
        room.code,
        send(
          new PutCommand({
            TableName: tableName,
            Item: itemFor(room, expectedRev + 1),
            ConditionExpression: "rev = :expectedRev",
            ExpressionAttributeValues: { ":expectedRev": expectedRev },
          })
        )
      );
    },

    async delete(code) {
      await send(new DeleteCommand({ TableName: tableName, Key: roomKey(code) }));
    },
  };
}
