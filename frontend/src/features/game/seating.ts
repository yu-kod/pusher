/**
 * 卓の席割り。
 *
 * 1台のプッシャー台を全員で囲むのがこのゲームの核（`docs/spec.md` 設計の核）なので、
 * 画面でも全員が1つの卓を囲んでいるように見せる。自分は必ず手前に座り、
 * 残りは手番順に並べる。手番は時計回り（§3）で、画面を真上から見ると
 * 手前（6時）から時計回りは左（9時）→ 上（12時）→ 右（3時）の順になる。
 */

export type SeatPosition = "bottom" | "left" | "top" | "right";

export type Seat<T> = {
  player: T;
  position: SeatPosition;
  /** 元の並び（手番順）での位置。手番の判定に使う */
  index: number;
};

/** 人数ごとの座り方。自分から時計回りに並べる */
const RINGS: Record<number, readonly SeatPosition[]> = {
  1: ["bottom"],
  2: ["bottom", "top"],
  3: ["bottom", "left", "right"],
  4: ["bottom", "left", "top", "right"],
};

/**
 * 席を割り当てる。戻り値は自分から時計回りの順。
 *
 * 想定は3〜4人（§1）。それ以上は余りを向かいに詰める。
 */
export function assignSeats<T>(players: readonly T[], myIndex: number): Seat<T>[] {
  const count = players.length;
  if (count === 0) return [];

  const ring = RINGS[count];

  return players.map((_, offset) => {
    const index = (myIndex + offset) % count;
    return {
      player: players[index] as T,
      position: ring?.[offset] ?? (offset === 0 ? "bottom" : "top"),
      index,
    };
  });
}
