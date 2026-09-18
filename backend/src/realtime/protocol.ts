/**
 * WebSocket でやり取りするメッセージの形（docs/realtime.md §3）。
 *
 * WebSocket が担うのは「あなた向けのルーム状態が更新された」を push することだけ。
 * 手番のアクションは HTTP のまま送る。だからここに現れる語彙は小さい。
 *
 * ## 型は `t` でタグ付けする
 *
 * 判別可能なユニオンにして、受け取り側が取りこぼしを型で検出できるようにする。
 *
 * ## ゲームのルールを知らない
 *
 * このファイルはレーンの本数も目標値も知らない。運ぶのは `RoomBody` という
 * 1つの塊だけなので、ルールが変わってもこの層は変えなくてよい。
 */
import type { RoomBody } from "../room/body.js";

/** 互換性のない変更を入れるときに上げる */
export const PROTOCOL_VERSION = 1;

export type ClientMessage =
  /** この接続をルームに紐づける。最初に必ず送る。token を省くと観戦者 */
  { t: "hello"; v: number; code: string; token?: string } | { t: "ping" };

export type ServerMessage =
  /** hello を受理した。観戦者なら playerId は null */
  | { t: "welcome"; v: number; code: string; playerId: string | null }
  /** この接続向けにマスク済みのスナップショット。新しさは room.rev で比べる */
  | { t: "room"; room: RoomBody }
  | { t: "error"; code: string; message: string }
  | { t: "pong" };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/**
 * クライアントから届いた文字列を検証する。
 *
 * 誰でも繋げる口なので、読めないものは黙って捨てられるよう `null` を返す。
 * 例外にすると、壊れたメッセージ1つで接続の処理が落ちる。
 */
export function parseClientMessage(raw: string): ClientMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const body = asRecord(parsed);
  if (body === null) {
    return null;
  }

  if (body.t === "ping") {
    return { t: "ping" };
  }

  if (body.t === "hello" && typeof body.code === "string") {
    const version = typeof body.v === "number" ? body.v : 0;
    return typeof body.token === "string"
      ? { t: "hello", v: version, code: body.code, token: body.token }
      : { t: "hello", v: version, code: body.code };
  }

  return null;
}
