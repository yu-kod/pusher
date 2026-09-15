/**
 * 投入ラウンド（docs/spec.md §3）。
 *
 * 手番は1回以上の投入ラウンドで構成される。1ラウンドの中身は
 *
 *   投入 → 目標値の算出 → 判定（ダイスを同時に振る） → 解決（左から順に）
 *
 * で、ここではその1ラウンドぶんだけを解決する。
 *
 * ## 続けるか、やめるかは決めない
 *
 * チキンレースの判断はプレイヤーのものなので、エンジンは「続けられる状態か」を
 * 返すだけにとどめる。実際に続ける／やめるを選ぶのは呼び出し側（#12 / #14）。
 */
import type { Card } from "./deck.js";
import { collectFallenCards, resolvePush } from "./push.js";
import type { Rng } from "./rng.js";
import type { GameState } from "./setup.js";
import { classifyRoll, insertIntoLanes, type LaneInsertion, type RollOutcome } from "./turn.js";

/** 投入した1レーンぶんの判定と解決の結果 */
export type LaneRoundResult = {
  laneIndex: number;
  /** そのレーンへ投入したカードのコイン数の合計 */
  insertedCoins: number;
  /** 投入前の滞留枚数から算出した目標値 */
  target: number;
  roll: number;
  outcome: RollOutcome;
  /** そのレーンの末端から落ちたカード。失敗なら空 */
  fallenCards: Card[];
};

export type InsertionRoundResult = {
  state: GameState;
  /** レーンごとの結果。**左から順**に並ぶ（docs/spec.md §3 の解決順） */
  lanes: LaneRoundResult[];
  /** このラウンドで未確定得点に積み上がった点数 */
  gainedPoints: number;
};

/**
 * 投入ラウンドを1回解決する（docs/spec.md §3）。
 *
 * - 各レーンへ最大1枚ずつ投入し、投入したレーンのぶんだけ d6 を振る
 * - レーンごとに独立して判定し、成功（と横穴）は §4 の押し出しを解決する
 * - 失敗したレーンでは投入カードが裏向きのまま滞留に残る
 * - 落ちたカードの点数は**未確定得点**に積み上がる。まだ手番プレイヤーの得点にはならない
 */
export function resolveInsertionRound(
  state: GameState,
  insertions: readonly LaneInsertion[],
  rng: Pick<Rng, "rollD6">
): InsertionRoundResult {
  const inserted = insertIntoLanes(state, insertions);

  // §3 手順3: 投入したレーンのぶんだけ d6 を同時に振る
  const rolled = inserted.lanes.map((detail) => ({ ...detail, roll: rng.rollD6() }));

  // §3 手順4: レーン順（左から）に解決する
  let current = inserted.state;
  const lanes = rolled.map(({ laneIndex, insertedCoins, target, roll }): LaneRoundResult => {
    const outcome = classifyRoll(roll, target);
    if (outcome === "failure") {
      // 投入カードは裏向きのまま滞留に残る（insertIntoLanes が裏向きで入れている）
      return { laneIndex, insertedCoins, target, roll, outcome, fallenCards: [] };
    }

    const pushed = resolvePush(current, laneIndex, insertedCoins);
    current = collectFallenCards(pushed.state, pushed.fallenCards);
    return { laneIndex, insertedCoins, target, roll, outcome, fallenCards: pushed.fallenCards };
  });

  return {
    state: current,
    lanes,
    gainedPoints: current.pendingPoints - state.pendingPoints,
  };
}
