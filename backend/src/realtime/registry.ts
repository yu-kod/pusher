/**
 * 接続レジストリ（docs/realtime.md §4, §6）。
 *
 * 「どの接続が、どのルームの、誰向けか」だけを持つ。
 *
 * ## トークンは持たない
 *
 * 持っているのは `playerId` まで。トークンは `hello` の検証に使うだけで保存しない。
 * 保存してしまうと、接続の一覧を読めることが「なりすませること」と同じ意味になる。
 *
 * ## 接続単位で管理する
 *
 * プレイヤー単位ではなく接続単位。同じ人が複数のタブから繋いでも、
 * 観戦者が何人いても、同じ扱いで済む。
 *
 * 非同期にしてあるのは本番の DynamoDB 実装（§7）を見据えてのこと。
 */
import type { RoomCode } from "../room/room.js";

export type Connection = {
  connectionId: string;
  code: RoomCode;
  /** 観戦者は null。裏向き情報を一切含まないビューを送る */
  playerId: string | null;
};

export type ConnectionRegistry = {
  /** 同じ接続 ID を渡したら上書きする（繋ぎ直しをそのまま扱えるように） */
  add(connection: Connection): Promise<void>;
  remove(connectionId: string): Promise<void>;
  listByRoom(code: RoomCode): Promise<Connection[]>;
};

/**
 * プロセス内に持つだけのレジストリ。
 *
 * ローカル開発と結合テスト用。本番（Lambda）は接続が別プロセスに散るので、
 * 同じインターフェースで DynamoDB 実装に差し替える。
 */
export function createInMemoryConnectionRegistry(): ConnectionRegistry {
  const connections = new Map<string, Connection>();

  return {
    add(connection) {
      connections.set(connection.connectionId, connection);
      return Promise.resolve();
    },

    remove(connectionId) {
      connections.delete(connectionId);
      return Promise.resolve();
    },

    listByRoom(code) {
      return Promise.resolve([...connections.values()].filter((c) => c.code === code));
    },
  };
}
