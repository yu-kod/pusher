/**
 * 更新の配信（docs/realtime.md §6）。
 *
 * 「誰に何を送るか」だけを持ち、「どうやって送るか」は `send` として引数で受け取る。
 * こうしておくと、ローカルの `ws` サーバーでも API Gateway WebSocket API でも
 * 同じものが使える。
 *
 * ## I/O を直接持たない
 *
 * ゲームエンジン（`src/game/`）と同じ方針。ソケットにも AWS SDK にも依存しない。
 *
 * ## 配信は接続ごとに別のペイロード
 *
 * マスク結果はプレイヤーごとに違う（自分の手札は見えるが他人のは見えない）。
 * 「同じ JSON を全員へブロードキャストする」口をここに作らない。作った瞬間に
 * そこが裏向き情報の漏洩口になる（docs/spec.md §8）。
 */
import { roomBody } from "../room/body.js";
import type { Room, RoomCode } from "../room/room.js";
import type { RoomStore } from "../room/store.js";
import { PROTOCOL_VERSION, parseClientMessage, type ServerMessage } from "./protocol.js";
import type { ConnectionRegistry } from "./registry.js";

/** 1つの接続へ送る手段。失敗したら reject する */
export type Send = (connectionId: string, message: ServerMessage) => Promise<void>;

export type RealtimeHubDeps = {
  store: RoomStore;
  registry: ConnectionRegistry;
  send: Send;
};

export type RealtimeHub = {
  /** クライアントから届いた生の文字列を処理する */
  handleMessage(connectionId: string, raw: string): Promise<void>;
  handleDisconnect(connectionId: string): Promise<void>;
  /** ルームの状態が変わったことを、そのルームの全接続へ知らせる */
  publish(room: Room): Promise<void>;
};

/**
 * 観戦者向けの viewerId。
 *
 * どのプレイヤーの id とも一致しない値を渡すと、`viewFor` はすべての手札を
 * 枚数だけのビューにする。
 */
const SPECTATOR = "";

export function createRealtimeHub(deps: RealtimeHubDeps): RealtimeHub {
  const fail = (connectionId: string, code: string, message: string) =>
    deps.send(connectionId, { t: "error", code, message });

  /** 状態を1つの接続へ送る。新しさの比較に使う rev は roomBody が持つ */
  const sendRoom = (connectionId: string, room: Room, playerId: string | null) =>
    deps.send(connectionId, { t: "room", room: roomBody(room, playerId ?? SPECTATOR) });

  const greet = async (connectionId: string, code: RoomCode, token: string | undefined) => {
    const room = await deps.store.get(code);
    if (room === null) {
      return fail(connectionId, "ROOM_NOT_FOUND", `そのルームはない: ${code}`);
    }

    // トークンを出さなければ観戦者。出したなら、このルームのものでなければ拒む
    let playerId: string | null = null;
    if (token !== undefined) {
      const player = room.players.find((p) => p.token === token);
      if (player === undefined) {
        return fail(connectionId, "FORBIDDEN", "このルームのトークンではない");
      }
      playerId = player.id;
    }

    // トークンは検証に使うだけで保存しない（docs/realtime.md §4）
    await deps.registry.add({ connectionId, code, playerId });
    await deps.send(connectionId, { t: "welcome", v: PROTOCOL_VERSION, code, playerId });
    await sendRoom(connectionId, room, playerId);
  };

  return {
    async handleMessage(connectionId, raw) {
      const message = parseClientMessage(raw);
      if (message === null) {
        return fail(connectionId, "BAD_MESSAGE", "読めないメッセージ");
      }
      if (message.t === "ping") {
        return deps.send(connectionId, { t: "pong" });
      }
      if (message.v !== PROTOCOL_VERSION) {
        return fail(
          connectionId,
          "UNSUPPORTED_VERSION",
          `対応していないバージョン: ${message.v}（このサーバーは ${PROTOCOL_VERSION}）`
        );
      }
      return greet(connectionId, message.code, message.token);
    },

    handleDisconnect(connectionId) {
      return deps.registry.remove(connectionId);
    },

    async publish(room) {
      const connections = await deps.registry.listByRoom(room.code);

      // 1つ送れなくても残りへは配信する。配信の失敗でアクションを巻き戻さない
      await Promise.all(
        connections.map(async (connection) => {
          try {
            await sendRoom(connection.connectionId, room, connection.playerId);
          } catch {
            // すでに閉じている接続（API Gateway なら 410 Gone）。切断の取りこぼしを here で回収する
            await deps.registry.remove(connection.connectionId);
          }
        })
      );
    },
  };
}
