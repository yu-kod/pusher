/**
 * 投入と押し出し判定（docs/spec.md §3 §5）。
 *
 * 押し出しの解決（押し込み・落下・補充）は #9 で別に扱う。
 * ここでは「どのカードを滞留エリアへ入れるか」と「出目をどう判定するか」までを担う。
 */
import { isEventCard, type CoinCard } from "./deck.js";
import type { GameState } from "./setup.js";

export type RollOutcome =
  /** 押し出し成功 */
  | "success"
  /** 失敗。投入カードは裏返して滞留エリアに残る */
  | "failure"
  /** 横穴。押し出しは起きるが、落ちたカードはジャックポットプールへ入る */
  | "sideHole";

const D6_MIN = 1;
const D6_MAX = 6;

/** 投入口増設マーカーがあるレーンに同時投入できる枚数（§6） */
const MAX_CARDS_WITH_EXTRA_SLOT = 2;

function assertNonNegativeInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} は 0 以上の整数である必要がある: ${value}`);
  }
}

function assertPositiveInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${label} は 1 以上の整数である必要がある: ${value}`);
  }
}

/**
 * 目標値を算出する（docs/spec.md §3）。
 *
 *   目標値 ＝ 投入カードのコイン数 ＋ 滞留エリアの既存カード枚数
 *
 * 滞留枚数は**投入前**の枚数を渡す。
 * 2枚同時投入（§6 投入口増設）ではコイン数の合計を渡す。
 */
export function calculateTarget(totalCoins: number, pendingCountBeforeInsert: number): number {
  assertPositiveInt(totalCoins, "コイン数の合計");
  assertNonNegativeInt(pendingCountBeforeInsert, "滞留枚数");
  return totalCoins + pendingCountBeforeInsert;
}

/**
 * 出目を判定する（docs/spec.md §3 §5）。
 *
 * - 出目が 6 かつ目標値が 6 以上 → 横穴（成功判定より優先する）
 * - 出目 ≦ 目標値 → 成功
 * - 出目 > 目標値 → 失敗
 *
 * 横穴を出目6に固定することで、目標値が6以上でも確定成功にならず、
 * 成功率の上限が 6分の5（約83%）に固定される。
 */
export function classifyRoll(roll: number, target: number): RollOutcome {
  if (!Number.isInteger(roll) || roll < D6_MIN || roll > D6_MAX) {
    throw new RangeError(`出目は ${D6_MIN}〜${D6_MAX} の整数である必要がある: ${roll}`);
  }
  assertPositiveInt(target, "目標値");

  if (roll === D6_MAX && target >= D6_MAX) {
    return "sideHole";
  }
  return roll <= target ? "success" : "failure";
}

export type InsertResult = {
  /** 投入後の状態。滞留エリアにカードが入り、手札から取り除かれている */
  state: GameState;
  /** 投入したカードのコイン数の合計 */
  insertedCoins: number;
  /** 投入前の滞留枚数から算出した目標値 */
  target: number;
};

/**
 * 手番プレイヤーの手札から、指定のレーンの滞留エリアへカードを投入する（docs/spec.md §3）。
 *
 * 手番プレイヤー以外は指定できない（引数にプレイヤーを取らない）。
 * 呼び出し側（API）が「要求元が手番プレイヤーか」を検証する。
 */
export function insertCards(
  state: GameState,
  laneIndex: number,
  handIndexes: readonly number[]
): InsertResult {
  const lane = state.lanes[laneIndex];
  if (lane === undefined) {
    throw new RangeError(`存在しないレーン: ${laneIndex}`);
  }

  const player = state.players[state.currentPlayerIndex];
  if (player === undefined) {
    throw new RangeError(`手番プレイヤーがいない: ${state.currentPlayerIndex}`);
  }

  const maxCards = lane.hasExtraSlot ? MAX_CARDS_WITH_EXTRA_SLOT : 1;
  if (handIndexes.length < 1 || handIndexes.length > maxCards) {
    throw new Error(
      `このレーンへ同時に投入できるのは 1〜${maxCards} 枚: ${handIndexes.length} 枚を指定した`
    );
  }
  if (new Set(handIndexes).size !== handIndexes.length) {
    throw new Error(`同じ手札を複数回指定している: ${handIndexes.join(", ")}`);
  }

  const cards: CoinCard[] = handIndexes.map((handIndex) => {
    const card = player.hand[handIndex];
    if (card === undefined) {
      throw new RangeError(`存在しない手札: ${handIndex}`);
    }
    if (isEventCard(card)) {
      // docs/spec.md のルール解釈メモを参照。コイン数がないため目標値を算出できない
      throw new Error(`イベントカードは投入できない: ${card.event}`);
    }
    return card;
  });

  const insertedCoins = cards.reduce((sum, card) => sum + card.coins, 0);
  const target = calculateTarget(insertedCoins, lane.pending.length);

  const removed = new Set(handIndexes);
  const players = state.players.map((p, index) =>
    index === state.currentPlayerIndex
      ? { ...p, hand: p.hand.filter((_, handIndex) => !removed.has(handIndex)) }
      : p
  );
  const lanes = state.lanes.map((l, index) =>
    index === laneIndex
      ? { ...l, pending: [...l.pending, ...cards.map((card) => ({ card, faceUp: false }))] }
      : l
  );

  return { state: { ...state, players, lanes }, insertedCoins, target };
}
