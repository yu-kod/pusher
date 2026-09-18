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
import { applySideHole, canRollJackpot, rollJackpot } from "./jackpot.js";
import { pendingPointsOf, resolvePush } from "./push.js";
import { collectAndResolveFall, type EventChooser, type ResolvedEvent } from "./resolve.js";
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

/** 横穴をきっかけに行った JP判定の結果（docs/spec.md §5） */
export type RoundJackpotResult = {
  roll: number;
  won: boolean;
  wonPoints: number;
};

export type InsertionRoundResult = {
  state: GameState;
  /** レーンごとの結果。**左から順**に並ぶ（docs/spec.md §3 の解決順） */
  lanes: LaneRoundResult[];
  /**
   * このラウンドで未確定得点に積み上がった点数。
   *
   * 横穴が出た場合、この点数もジャックポットへ移っている（手元には残らない）。
   */
  gainedPoints: number;
  /** 横穴が出たか。出ていたら手番は即座に終了する（docs/spec.md §5） */
  busted: boolean;
  /** 横穴でカウンターが閾値に達し、JP判定を行った場合のみ入る */
  jackpot: RoundJackpotResult | null;
  /** 落ちたカードに含まれていたイベントの解決結果（§6）。連鎖した順に並ぶ */
  events: ResolvedEvent[];
  /**
   * もう一度投入ラウンドを行えるか（docs/spec.md §3）。
   *
   * 実際に続けるかはプレイヤーが決める。false なら選ぶ余地がなく、未確定得点を
   * 確定して手番終了になる（横穴の場合はすでにジャックポットへ移っている）。
   */
  canContinue: boolean;
};

/**
 * もう一度投入ラウンドを行える状態か（docs/spec.md §3）。
 *
 * 横穴が出た場合は手番が即座に終了するため、呼ばれない。
 *
 * - 手札が空なら投入できない
 * - config.maxInsertionRoundsPerTurn を超えない（既定は無制限）
 */
function canContinueTurn(state: GameState): boolean {
  const hasCards = state.players.some(
    (player, index) => index === state.currentPlayerIndex && player.hand.length > 0
  );
  if (!hasCards) {
    return false;
  }

  const max = state.config.maxInsertionRoundsPerTurn;
  return max === null || state.insertionRoundsThisTurn < max;
}

/**
 * 投入ラウンドを1回解決する（docs/spec.md §3）。
 *
 * - 各レーンへ最大1枚ずつ投入し、投入したレーンのぶんだけ d6 を振る
 * - レーンごとに独立して判定し、成功（と横穴）は §4 の押し出しを解決する
 * - 失敗したレーンでは投入カードが裏向きのまま滞留に残る
 * - 落ちたカードの点数は**未確定得点**に積み上がる。まだ手番プレイヤーの得点にはならない
 * - 横穴が出たら未確定得点はすべてジャックポットへ移り、手番は即座に終了する（§5）
 *
 * 同じラウンドで複数のレーンが横穴になっても、横穴は1回として扱う
 * （docs/spec.md のルール解釈メモ）。
 */
export function resolveInsertionRound(
  state: GameState,
  insertions: readonly LaneInsertion[],
  chooser: EventChooser,
  rng: Pick<Rng, "rollD6">
): InsertionRoundResult {
  const inserted = insertIntoLanes(state, insertions);

  // §3 手順3: 投入したレーンのぶんだけ d6 を同時に振る
  const rolled = inserted.lanes.map((detail) => ({ ...detail, roll: rng.rollD6() }));

  // §3 手順4: レーン順（左から）に解決する
  let current = inserted.state;
  const events: ResolvedEvent[] = [];
  const lanes = rolled.map(({ laneIndex, insertedCoins, target, roll }): LaneRoundResult => {
    const outcome = classifyRoll(roll, target, state.config.sideHole);
    if (outcome === "failure") {
      // 投入カードは裏向きのまま滞留に残る（insertIntoLanes が裏向きで入れている）
      return { laneIndex, insertedCoins, target, roll, outcome, fallenCards: [] };
    }

    const pushed = resolvePush(current, laneIndex, insertedCoins);
    // 落下カードを点数にし、イベントが混じっていれば §6 を適用する
    const resolved = collectAndResolveFall(
      pushed.state,
      laneIndex,
      pushed.fallenCards,
      chooser,
      rng
    );
    current = resolved.state;
    events.push(...resolved.events);
    return { laneIndex, insertedCoins, target, roll, outcome, fallenCards: pushed.fallenCards };
  });

  const gainedPoints = pendingPointsOf(current) - pendingPointsOf(state);
  current = { ...current, insertionRoundsThisTurn: current.insertionRoundsThisTurn + 1 };

  const busted = lanes.some((lane) => lane.outcome === "sideHole");
  if (!busted) {
    return {
      state: current,
      lanes,
      gainedPoints,
      busted,
      jackpot: null,
      events,
      canContinue: canContinueTurn(current),
    };
  }

  // 横穴で手番が終わるので、投入ラウンドの回数を 0 に戻す（「やめる」と同じ扱い）
  current = { ...current, insertionRoundsThisTurn: 0 };

  // §5 横穴 — 未確定得点がすべてジャックポットへ移り、カウンターが1つ進む。
  // 複数レーンが横穴でも1回だけ適用する（docs/spec.md のルール解釈メモ）
  current = applySideHole(current);

  // §5 ジャックポットチャンス — カウンターが閾値に達していれば即座に JP判定
  if (!canRollJackpot(current)) {
    return {
      state: current,
      lanes,
      gainedPoints,
      busted,
      jackpot: null,
      events,
      canContinue: false,
    };
  }

  const { state: afterJackpot, roll, won, wonPoints } = rollJackpot(current, rng);
  return {
    state: afterJackpot,
    lanes,
    gainedPoints,
    busted,
    jackpot: { roll, won, wonPoints },
    events,
    canContinue: false,
  };
}
