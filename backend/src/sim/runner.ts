/**
 * シミュレーションのランナー（#49）。
 *
 * セットアップから勝敗判定までをエンジンの関数だけで回し、docs/spec.md §7 の
 * 検証項目に対応する観測値を集める。API を経由しないので数万ゲーム回せる。
 */
import type { Balance } from "../game/balance.js";
import { endRound, endTurn, determineWinners } from "../game/progress.js";
import { bankPendingPoints } from "../game/push.js";
import type { Rng } from "../game/rng.js";
import { resolveInsertionRound } from "../game/round.js";
import { setupGame, type GameState } from "../game/setup.js";
import type { Strategy } from "./strategy.js";

/** 1ゲームぶんの観測値 */
export type GameStats = {
  /** ゲームが終了状態まで到達したか */
  finished: boolean;
  rounds: number;
  turns: number;
  insertionRounds: number;
  /** 横穴で終わった手番の数 */
  busts: number;
  insertedCards: number;
  /** 投入した各レーンの、投入前の滞留枚数（§7「滞留の厚み」） */
  pendingThickness: number[];
  /**
   * 1投入ラウンドで使ったレーン数（§7 / #56）。
   *
   * 常に上限に張り付いているなら「どれだけ賭けるか」の判断が発生していない。
   */
  lanesPerInsertion: number[];
  /** 続けられるのに自分でやめた手番の数（§7 / #56） */
  voluntaryStops: number;
  /**
   * 自分でやめた時点の未確定得点（§7 の「引き際」）。
   *
   * §7 は当初 15〜20点としていたが、これは v0.1 の得点スケールの数字（#55）。
   */
  stopPoints: number[];
  /** 横穴か手札切れで続けられなくなった手番の数 */
  forcedStops: number;
  /** 解決したイベントの数 */
  events: number;
  finalPoints: number[];
  /** 勝者の手番順（0 始まり）。引き分けなら複数 */
  winnerSeats: number[];
};

/** そのラウンドで投入したレーンの、投入前の滞留枚数を拾う */
function thicknessOf(state: GameState, laneIndexes: readonly number[]): number[] {
  return state.lanes.flatMap((lane, index) =>
    laneIndexes.includes(index) ? [lane.pending.length] : []
  );
}

/**
 * 1ゲームを最後まで回す。
 *
 * 手番は「投入ラウンドを続けられるあいだ繰り返し、やめたら次のプレイヤーへ」。
 * 「投入口増設」を引いた手番は、同じプレイヤーがもう1手番行う（docs/spec.md §6）。
 */
export function simulateGame(
  config: Balance,
  strategy: Strategy,
  rng: Rng,
  playerCount: number
): GameStats {
  const names = Array.from({ length: playerCount }, (_, i) => `P${i + 1}`);
  let state = setupGame(names, rng, config);

  const stats = {
    rounds: 0,
    turns: 0,
    insertionRounds: 0,
    busts: 0,
    insertedCards: 0,
    events: 0,
    voluntaryStops: 0,
    forcedStops: 0,
  };
  const pendingThickness: number[] = [];
  const lanesPerInsertion: number[] = [];
  const stopPoints: number[] = [];

  while (state.phase === "playing") {
    // 「投入口増設」を引くと同じプレイヤーがもう1手番行う（docs/spec.md §6）
    let extraTurns = 0;

    for (;;) {
      stats.turns++;

      // 投入ラウンドを続けられるあいだ繰り返す（§3 チキンレース）
      for (;;) {
        const insertions = strategy.chooseInsertions(state, rng);
        if (insertions.length === 0) {
          // 投入できる札が手札にない。手番の最初でしか起こらない
          stats.forcedStops++;
          break;
        }

        lanesPerInsertion.push(insertions.length);
        pendingThickness.push(
          ...thicknessOf(
            state,
            insertions.map((i) => i.laneIndex)
          )
        );
        stats.insertedCards += insertions.reduce((sum, i) => sum + i.handIndexes.length, 0);

        const round = resolveInsertionRound(state, insertions, strategy, rng);
        state = round.state;
        stats.insertionRounds++;
        stats.events += round.events.length;
        extraTurns += round.events.filter((e) => e.extraTurn).length;
        if (round.busted) {
          stats.busts++;
        }

        if (!round.canContinue) {
          // 横穴か手札切れ。やめる／続けるを選ぶ余地がなかった
          stats.forcedStops++;
          break;
        }
        if (!strategy.shouldContinue(state, rng)) {
          stats.voluntaryStops++;
          stopPoints.push(state.pendingPoints);
          break;
        }
      }

      if (extraTurns === 0) {
        break;
      }

      // 未確定得点だけ確定させ、手番は移さずにもう1手番行う
      extraTurns--;
      state = bankPendingPoints(state);
    }

    const turn = endTurn(state);
    state = turn.state;

    if (turn.roundEnded) {
      const round = endRound(state, rng, strategy);
      state = round.state;
      stats.rounds++;
      stats.events += round.events.length;
    }
  }

  const winnerIds = new Set(determineWinners(state).map((p) => p.id));

  return {
    ...stats,
    finished: state.phase === "finished",
    pendingThickness,
    lanesPerInsertion,
    stopPoints,
    finalPoints: state.players.map((p) => p.points),
    winnerSeats: state.players.flatMap((p, seat) => (winnerIds.has(p.id) ? [seat] : [])),
  };
}

/** N ゲームぶんの集計（§7 の検証項目に対応する） */
export type Summary = {
  games: number;
  avgRounds: number;
  /** §7 最優先「1手番あたりの投入ラウンド数」。目標 2〜4 */
  avgInsertionRoundsPerTurn: number;
  /** 横穴で終わった手番の割合 */
  bustRate: number;
  /** §7 最優先「投入1枚あたりの回収期待値」。目標 1.0〜1.2 */
  pointsPerInsertedCard: number;
  /** §7 最優先「滞留の厚み」。目標 3〜5 枚 */
  avgPendingThickness: number;
  /**
   * 1投入ラウンドあたりの平均レーン数（§7 / #56）。
   *
   * 上限に張り付いていたら「どれだけ賭けるか」の判断が発生していない。
   */
  avgLanesPerInsertion: number;
  /**
   * 続けられるのに自分でやめた手番の割合（§7 / #56）。
   *
   * 0 に近いほど、やめどきの判断ではなく手札切れとバーストだけで手番が終わっている。
   */
  voluntaryStopRate: number;
  /**
   * 自分でやめた時点の未確定得点の平均（§7 の「引き際」）。
   *
   * §7 は当初 15〜20点としていたが、これは v0.1 の得点スケールの数字で、
   * ポイント制では絶対値に意味がない（#55）。1手番の取り分と同程度に落ち着く。
   * 判断が発生しているかは1手番あたりの投入ラウンド数で見る。
   */
  avgStopPoints: number;
  avgEventsPerGame: number;
  /** 手番順ごとの勝率。引き分けは全員を勝者として数えるため合計は 1 以上になる */
  seatWinRates: number[];
};

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

export function summarize(stats: readonly GameStats[]): Summary {
  const seats = stats[0]?.finalPoints.length ?? 0;
  const totalTurns = sum(stats.map((s) => s.turns));
  const totalInserted = sum(stats.map((s) => s.insertedCards));

  return {
    games: stats.length,
    avgRounds: mean(stats.map((s) => s.rounds)),
    avgInsertionRoundsPerTurn:
      totalTurns === 0 ? 0 : sum(stats.map((s) => s.insertionRounds)) / totalTurns,
    bustRate: totalTurns === 0 ? 0 : sum(stats.map((s) => s.busts)) / totalTurns,
    pointsPerInsertedCard:
      totalInserted === 0 ? 0 : sum(stats.map((s) => sum(s.finalPoints))) / totalInserted,
    avgPendingThickness: mean(stats.flatMap((s) => s.pendingThickness)),
    avgLanesPerInsertion: mean(stats.flatMap((s) => s.lanesPerInsertion)),
    voluntaryStopRate: totalTurns === 0 ? 0 : sum(stats.map((s) => s.voluntaryStops)) / totalTurns,
    avgStopPoints: mean(stats.flatMap((s) => s.stopPoints)),
    avgEventsPerGame: mean(stats.map((s) => s.events)),
    // stats が空なら seats も 0 になるので、ここでゼロ除算は起きない
    seatWinRates: Array.from(
      { length: seats },
      (_, seat) => stats.filter((s) => s.winnerSeats.includes(seat)).length / stats.length
    ),
  };
}

export function simulateMany(
  games: number,
  config: Balance,
  strategy: Strategy,
  rng: Rng,
  playerCount: number
): Summary {
  return summarize(
    Array.from({ length: games }, () => simulateGame(config, strategy, rng, playerCount))
  );
}
