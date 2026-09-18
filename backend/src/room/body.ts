/**
 * クライアントへ返すルームの姿。
 *
 * HTTP のレスポンスと WebSocket の push で**同じ形**を使う（docs/realtime.md §3）。
 * 受け取り口が2つあってもクライアントが扱う型は1つで済み、
 * 「片方だけマスクを忘れる」も起きない。
 *
 * トークンは含めない。ゲームの状態は必ず `viewFor` を通したものだけを載せる。
 */
import { viewFor, type GameView } from "../game/view.js";
import type { Room, RoomPhase } from "./room.js";

export type RoomBody = {
  code: string;
  /**
   * 状態を更新した時刻。スナップショットの新しさを比べるために添える。
   *
   * クライアントは HTTP のレスポンスと WebSocket の push の2経路から同じ形を受け取る。
   * 経路が違えば追い越しが起きるので、手元より古いものを捨てる判断に使う
   * （docs/realtime.md §3）。
   */
  rev: number;
  phase: RoomPhase;
  players: { id: string; name: string; isCpu: boolean }[];
  game: GameView | null;
};

/**
 * `viewerId` に当たるプレイヤーがいなければ観戦者として扱う。
 * 観戦者向けのビューでは、どの手札も枚数しか見えない。
 */
export function roomBody(room: Room, viewerId: string): RoomBody {
  return {
    code: room.code,
    rev: room.updatedAt,
    phase: room.phase,
    players: room.players.map((p) => ({ id: p.id, name: p.name, isCpu: p.isCpu })),
    game: room.game === null ? null : viewFor(room.game, viewerId),
  };
}
