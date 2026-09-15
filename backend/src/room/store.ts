/**
 * ルームの保存先。
 *
 * ローカルと結合テストはインメモリ、本番は DynamoDB（#20）で動かせるよう、
 * 保存先をインターフェースで抽象化する。API はこの型だけに依存する。
 *
 * 非同期にしてあるのは DynamoDB を見据えてのこと。インメモリ実装でも
 * Promise を返す。
 *
 * 保存と復元は serialize.ts に集約している。調整値に関数が含まれるため、
 * 素朴な JSON 化では壊れる（詳細はそちらのコメントを参照）。
 */
import { DEFAULT_BALANCE, type Balance } from "../game/balance.js";
import type { Room, RoomCode } from "./room.js";
import { deserializeRoom, serializeRoom } from "./serialize.js";

export type RoomStore = {
  get(code: RoomCode): Promise<Room | null>;
  /** 新規・更新のどちらも同じ口で扱う */
  save(room: Room): Promise<void>;
  delete(code: RoomCode): Promise<void>;
};

/**
 * プロセス内に持つだけのストア。
 *
 * 保存のたびに直列化するので、呼び出し側がうっかり書き換えても保存済みの状態が
 * 壊れない（DynamoDB 実装では自然にそうなるので、挙動を揃える）。
 */
export function createInMemoryRoomStore(config: Balance = DEFAULT_BALANCE): RoomStore {
  const rooms = new Map<RoomCode, string>();

  return {
    get(code) {
      const stored = rooms.get(code);
      return Promise.resolve(stored === undefined ? null : deserializeRoom(stored, config));
    },

    save(room) {
      rooms.set(room.code, serializeRoom(room));
      return Promise.resolve();
    },

    delete(code) {
      rooms.delete(code);
      return Promise.resolve();
    },
  };
}
