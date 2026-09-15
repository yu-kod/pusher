/**
 * イベントカードの効果（docs/spec.md §6）。
 *
 * ## 選択はすべて引数で受け取る
 *
 * 「横穴開放」と「投入口増設」はレーンの指定を、「横穴開放」はさらに滞留から1枚の選択を
 * プレイヤーに求める。エンジンは I/O を持たない純粋関数なので、これらは引数で渡す。
 * いつ誰に選ばせるかは手番の進行（#12）と API（#14）の責務。
 *
 * ## §6 の基本の扱いはここでは行わない
 *
 * 「イベントカードを捨て札にする」「レーンからもう1枚落とす」「連鎖」は、
 * 落下カードの振り分けと一体なので手番の進行（#12）で扱う。
 * ここにあるのは各イベントの効果そのものだけ。
 */
import type { Card } from "./deck.js";
import { rollJackpot } from "./jackpot.js";
import { collectFallenCards, resolvePush } from "./push.js";
import type { Rng } from "./rng.js";
import type { GameState } from "./setup.js";

/** 「抽選抽選」がカウンターを進める数（§6） */
const LOTTERY_COUNTER_ADVANCE = 2;

export type AvalancheResult = {
  state: GameState;
  /** 全レーンから落ちたカード。レーン順に並ぶ */
  fallenCards: Card[];
};

/**
 * なだれ（docs/spec.md §6）。
 *
 * 全レーンの滞留を1枚ずつ奥へ押し込む。押し込んだ枚数ぶん各レーンから落下する。
 * 通常の押し出しと同じ処理を使うため、補充も行う（docs/spec.md のルール解釈メモ）。
 *
 * 滞留が空のレーンでは押し込みが 0 枚になり、そのレーンからは何も落ちない。
 */
export function resolveAvalanche(state: GameState): AvalancheResult {
  let current = state;
  const fallenCards: Card[] = [];

  for (let laneIndex = 0; laneIndex < current.lanes.length; laneIndex++) {
    const result = resolvePush(current, laneIndex, 1);
    current = result.state;
    fallenCards.push(...result.fallenCards);
  }

  return { state: current, fallenCards };
}

export type OpenLaneResult = {
  state: GameState;
  /** 得点にしたカード。滞留が空だった場合は null */
  takenCard: Card | null;
};

/**
 * 横穴開放（docs/spec.md §6）。
 *
 * 指定した1レーンの滞留をすべて表向きにする。引いた人はその中から1枚を選んで点数にし、
 * カードは山札へ戻す。残りは**表向きのまま**滞留し、そのレーンの中身が全員に公開された状態が続く。
 */
export function resolveOpenLane(
  state: GameState,
  laneIndex: number,
  pickIndex: number
): OpenLaneResult {
  const lane = state.lanes[laneIndex];
  if (lane === undefined) {
    throw new RangeError(`存在しないレーン: ${laneIndex}`);
  }

  // 滞留が空なら公開するものも獲得するものもない
  if (lane.pending.length === 0) {
    return { state, takenCard: null };
  }

  const picked = lane.pending[pickIndex];
  if (picked === undefined) {
    throw new RangeError(`滞留の範囲外を選んだ: ${pickIndex}`);
  }

  const remaining = lane.pending
    .filter((_, index) => index !== pickIndex)
    .map((p) => ({ ...p, faceUp: true }));

  const lanes = state.lanes.map((l, index) =>
    index === laneIndex ? { ...l, pending: remaining } : l
  );

  // 選んだ1枚は点数になり、カードは山札へ戻る（§6 / §4-2 と同じ扱い）
  return {
    state: collectFallenCards({ ...state, lanes }, [picked.card]),
    takenCard: picked.card,
  };
}

/**
 * 投入口増設（docs/spec.md §6）。
 *
 * 指定した1レーンに増設マーカーを置く。以後このレーンには誰でも2枚同時に投入できる。
 *
 * 「引いた人は即座にもう1手番行える」は手番の進行に関わるため、ここでは扱わない（#12）。
 */
export function resolveExtraSlot(state: GameState, laneIndex: number): GameState {
  if (state.lanes[laneIndex] === undefined) {
    throw new RangeError(`存在しないレーン: ${laneIndex}`);
  }

  const lanes = state.lanes.map((l, index) =>
    index === laneIndex ? { ...l, hasExtraSlot: true } : l
  );

  return { ...state, lanes };
}

export type LotteryResult = {
  state: GameState;
  jackpotRoll: number;
  jackpotWon: boolean;
  wonPoints: number;
};

/**
 * 抽選抽選（docs/spec.md §6）。
 *
 * ジャックポットカウンターを2つ進め、引いた人は即座に JP判定を1回行える。
 * 外れてもカウンターは戻らない。
 *
 * カウンターが閾値に達していなくても判定は行う（§6 が「即座にJP判定を1回行える」と
 * 無条件に書いているため）。
 */
export function resolveLottery(state: GameState, rng: Pick<Rng, "rollD6">): LotteryResult {
  const advanced: GameState = {
    ...state,
    jackpotCounter: Math.min(
      state.jackpotCounter + LOTTERY_COUNTER_ADVANCE,
      state.config.jackpotThreshold
    ),
  };

  const result = rollJackpot(advanced, rng);

  return {
    state: result.state,
    jackpotRoll: result.roll,
    jackpotWon: result.won,
    wonPoints: result.wonPoints,
  };
}
