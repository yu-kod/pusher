/**
 * ルームの保存先。
 *
 * ローカルと結合テストはインメモリ、本番は DynamoDB（#78）で動かせるよう、
 * 保存先をインターフェースで抽象化する。API はこの型だけに依存する。
 *
 * 非同期にしてあるのは DynamoDB を見据えてのこと。インメモリ実装でも
 * Promise を返す。
 *
 * 保存と復元は serialize.ts に集約している。調整値に関数が含まれるため、
 * 素朴な JSON 化では壊れる（詳細はそちらのコメントを参照）。
 *
 * ## 版（rev）を持つ理由
 *
 * API は「読む → エンジンで解決する → 書く」を素で行うので、2人が同時に叩くと
 * 後の書き込みが前の結果を踏み潰す（lost update）。読んだときの版を条件にして
 * 書き、食い違えば `RoomConflictError` で弾く。
 *
 * 版に `updatedAt` を使わないのは、同じミリ秒に2つの書き込みが重なると
 * 条件をすり抜けるため。1つずつ増える数を持たせる。
 */
import { DEFAULT_BALANCE, type Balance } from "../game/balance.js";
import type { Room, RoomCode } from "./room.js";
import { deserializeRoom, serializeRoom } from "./serialize.js";

/** 保存されているルームと、その版 */
export type StoredRoom = {
  room: Room;
  /** 更新のたびに1つ増える。更新時にこれを条件として渡す */
  rev: number;
};

/** 期待した版と保存先が食い違った（誰かが先に書いた） */
export class RoomConflictError extends Error {
  constructor(code: RoomCode) {
    super(`ルームの状態が更新されている: ${code}`);
    this.name = "RoomConflictError";
  }
}

export type RoomStore = {
  get(code: RoomCode): Promise<StoredRoom | null>;
  /** 新規作成。同じコードが既にあれば RoomConflictError */
  create(room: Room): Promise<void>;
  /** 読んだときの版のままなら書き込む。違えば RoomConflictError */
  update(room: Room, expectedRev: number): Promise<void>;
  delete(code: RoomCode): Promise<void>;
};

/** 保存された1件。中身は直列化済みの JSON */
type Entry = { json: string; rev: number };

/**
 * プロセス内に持つだけのストア。
 *
 * 保存のたびに直列化するので、呼び出し側がうっかり書き換えても保存済みの状態が
 * 壊れない（DynamoDB 実装では自然にそうなるので、挙動を揃える）。
 */
export function createInMemoryRoomStore(config: Balance = DEFAULT_BALANCE): RoomStore {
  const rooms = new Map<RoomCode, Entry>();

  return {
    get(code) {
      const stored = rooms.get(code);
      return Promise.resolve(
        stored === undefined
          ? null
          : { room: deserializeRoom(stored.json, config), rev: stored.rev }
      );
    },

    create(room) {
      if (rooms.has(room.code)) {
        return Promise.reject(new RoomConflictError(room.code));
      }
      rooms.set(room.code, { json: serializeRoom(room), rev: 1 });
      return Promise.resolve();
    },

    update(room, expectedRev) {
      const stored = rooms.get(room.code);
      if (stored === undefined || stored.rev !== expectedRev) {
        return Promise.reject(new RoomConflictError(room.code));
      }
      rooms.set(room.code, { json: serializeRoom(room), rev: expectedRev + 1 });
      return Promise.resolve();
    },

    delete(code) {
      rooms.delete(code);
      return Promise.resolve();
    },
  };
}
