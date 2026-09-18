/**
 * 押し出しの解決（docs/spec.md §4）。
 *
 * 押し出しに成功したら 4-1 押し込み → 4-2 落下 の順に処理する。補充は行わない（§4-3）。
 *
 * 落ちたカードの行き先はここでは決めない。得点にするのは collectFallenCards、
 * 横穴なら未確定得点ごとジャックポットへ移る（§5）ため、呼び出し側が振り分ける。
 *
 * ## 配列の向き
 *
 * - `lane.stock` — 添字 0 が末端（落下口）側、末尾が奥側。落下は先頭から、押し込みは末尾へ
 * - `lane.pending` — 添字 0 が奥側（レーンに近い側）。先に入ったカードから押し込まれる
 */
import { isCoinCard, isEventCard, type Card } from "./deck.js";
import { totalPoints } from "./score.js";
import type { GameState, Player } from "./setup.js";

/**
 * いま解決しているプレイヤー。
 *
 * 未確定得点はプレイヤーごとに持つ（#88）。手番制では手番中の1人しか動かないが、
 * ティック同時進行では同じラウンドの中で複数人が同時に抱えるため、
 * 「いま解決しているプレイヤーのぶんだけ」を触る形に統一しておく。
 */
function currentPlayer(state: GameState): Player {
  const player = state.players[state.currentPlayerIndex];
  if (player === undefined) {
    throw new RangeError(`手番プレイヤーがいない: ${state.currentPlayerIndex}`);
  }
  return player;
}

/** 手番プレイヤーだけを差し替えた players を返す */
function updateCurrentPlayer(state: GameState, update: (player: Player) => Player): Player[] {
  const updated = update(currentPlayer(state));
  return state.players.map((p, index) => (index === state.currentPlayerIndex ? updated : p));
}

/** 手番プレイヤーの未確定得点（§3） */
export function pendingPointsOf(state: GameState): number {
  return currentPlayer(state).pendingPoints;
}

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
 * 押し込める枚数は balance.pushCount がここから決める（既定はコイン数そのまま）。
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

  // 4-1. 押し込み — 滞留の奥側から、押し込める枚数ぶんだけレーンへ移す。
  // 「コイン数ぶん」は既定のルールで、balance.pushCount で差し替えられる（§7）
  const pushedCount = Math.min(state.config.pushCount(insertedCoins), lane.pending.length);
  const pushedCards = lane.pending.slice(0, pushedCount).map((p) => p.card);
  const remainingPending = lane.pending.slice(pushedCount);

  // 押し込んだカードはレーンの奥（末尾）へ入る
  const afterPush = [...lane.stock, ...pushedCards];

  // 4-2. 落下 — 押し込んだ枚数と同数が末端（先頭）から落ちる
  const fallenCards = afterPush.slice(0, pushedCount);
  const afterFall = afterPush.slice(pushedCount);

  // 4-3. 補充は行わない — 押し込んだ枚数と落ちた枚数が等しいため、
  // レーンの厚みはこれで一定に保たれる（docs/spec.md §4-3）
  const lanes = state.lanes.map((l, index) =>
    index === laneIndex ? { ...l, stock: afterFall, pending: remainingPending } : l
  );

  return { state: { ...state, lanes }, pushedCount, fallenCards };
}

/**
 * 落ちたカードを未確定得点に加え、カードを場から片付ける（docs/spec.md §4-2 §6）。
 *
 * - コインカード → 印字されたコイン数を未確定得点へ。カードは**山札の底へ戻す**
 * - イベントカード → 0点。**捨て札**にする（山札へは戻らない）
 *
 * 得点はまだ確定しない。手番を「やめる」まで未確定のまま積み上がり、
 * 横穴（バースト）が出たらジャックポットへ移る（§3 §5）。
 *
 * 山札へ戻す位置を底にしている理由は docs/spec.md のルール解釈メモを参照。
 */
export function collectFallenCards(state: GameState, cards: readonly Card[]): GameState {
  const coins = cards.filter(isCoinCard);
  const events = cards.filter(isEventCard);

  const players = updateCurrentPlayer(state, (p) => ({
    ...p,
    pendingPoints: p.pendingPoints + totalPoints(coins),
  }));

  return {
    ...state,
    players,
    drawPile: [...state.drawPile, ...coins],
    discardPile: [...state.discardPile, ...events],
  };
}

/**
 * 未確定得点を手番プレイヤーの得点として確定する（docs/spec.md §3「やめる」）。
 *
 * ここで手番が終わるので、投入ラウンドの回数も 0 に戻す。
 */
export function bankPendingPoints(state: GameState): GameState {
  const players = updateCurrentPlayer(state, (p) => ({
    ...p,
    points: p.points + p.pendingPoints,
    pendingPoints: 0,
  }));

  return { ...state, players, insertionRoundsThisTurn: 0 };
}
