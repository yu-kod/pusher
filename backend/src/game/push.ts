/**
 * 押し出しの解決（docs/spec.md §4）。
 *
 * 押し出しに成功したら 4-1 押し込み → 4-2 落下 → 4-3 補充 の順に処理する。
 *
 * 落ちたカードの行き先はここでは決めない。通常の成功なら押し出したプレイヤーの手札へ、
 * 横穴ならジャックポットプールへ入る（§5 / #10）ため、呼び出し側が振り分ける。
 *
 * ## 配列の向き
 *
 * - `lane.stock` — 添字 0 が末端（落下口）側、末尾が奥側。落下は先頭から、押し込みと補充は末尾へ
 * - `lane.pending` — 添字 0 が奥側（レーンに近い側）。先に入ったカードから押し込まれる
 */
import type { Card } from "./deck.js";
import type { GameState } from "./setup.js";

export type PushResult = {
  /** 押し込み・落下・補充を反映した状態。落下カードはまだ誰にも渡していない */
  state: GameState;
  /** 実際に押し込んだ枚数。滞留が足りなければ投入コイン数より少なくなる */
  pushedCount: number;
  /** レーンの末端から落ちたカード。先に落ちた順 */
  fallenCards: Card[];
};

/**
 * 押し出しを解決する（docs/spec.md §4）。
 *
 * `insertedCoins` は投入カードのコイン数（2枚同時投入なら合計）。
 * これが押し込める枚数の上限になる。
 */
export function resolvePush(
  state: GameState,
  laneIndex: number,
  insertedCoins: number
): PushResult {
  const lane = state.lanes[laneIndex];
  if (lane === undefined) {
    throw new RangeError(`存在しないレーン: ${laneIndex}`);
  }
  if (!Number.isInteger(insertedCoins) || insertedCoins < 1) {
    throw new RangeError(`押し込み枚数は 1 以上の整数である必要がある: ${insertedCoins}`);
  }

  // 4-1. 押し込み — 滞留の奥側から、投入コイン数ぶんだけレーンへ移す
  const pushedCount = Math.min(insertedCoins, lane.pending.length);
  const pushedCards = lane.pending.slice(0, pushedCount);
  const remainingPending = lane.pending.slice(pushedCount);

  // 押し込んだカードはレーンの奥（末尾）へ入る
  const afterPush = [...lane.stock, ...pushedCards];

  // 4-2. 落下 — 押し込んだ枚数と同数が末端（先頭）から落ちる
  const fallenCards = afterPush.slice(0, pushedCount);
  const afterFall = afterPush.slice(pushedCount);

  // 4-3. 補充 — 落下した枚数ぶんを山札からレーンの奥へ
  const refillCount = Math.min(fallenCards.length, state.drawPile.length);
  const refill = state.drawPile.slice(0, refillCount);

  const lanes = state.lanes.map((l, index) =>
    index === laneIndex ? { ...l, stock: [...afterFall, ...refill], pending: remainingPending } : l
  );

  return {
    state: { ...state, lanes, drawPile: state.drawPile.slice(refillCount) },
    pushedCount,
    fallenCards,
  };
}

/**
 * 落ちたカードを手番プレイヤーの手札に加える（docs/spec.md §4-2）。
 *
 * 獲得したカードは手札に入り、そのまま次の投入に使える
 * （領域は手札ひとつだけ。docs/spec.md のルール解釈メモ）。
 */
export function addToHand(state: GameState, cards: readonly Card[]): GameState {
  const player = state.players[state.currentPlayerIndex];
  if (player === undefined) {
    throw new RangeError(`手番プレイヤーがいない: ${state.currentPlayerIndex}`);
  }

  const players = state.players.map((p, index) =>
    index === state.currentPlayerIndex ? { ...p, hand: [...p.hand, ...cards] } : p
  );

  return { ...state, players };
}
