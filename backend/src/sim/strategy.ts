/**
 * シミュレーション用の戦略（#49）。
 *
 * 「どのレーンへ投入するか」「続けるか、やめるか」「イベントで何を選ぶか」を決める。
 * CPU プレイヤー（#16）と共有できるよう、ゲームエンジンと同じく純粋関数で書き、
 * 乱数は引数で受け取る。
 *
 * ## 裏向き情報は使わない
 *
 * 戦略が見てよいのは公開情報だけ（docs/spec.md §8）。レーンの奥の山と滞留エリアは
 * **枚数しか使わない**。中身が見えるのは「横穴開放」で公開されたあとだけで、
 * そこは choosePending が受け取る。
 */
import { autoEventChooser } from "../game/chooser.js";
import { isCoinCard, type CoinCard } from "../game/deck.js";
import type { EventChooser } from "../game/resolve.js";
import type { Rng } from "../game/rng.js";
import type { GameState, Lane } from "../game/setup.js";
import type { LaneInsertion } from "../game/turn.js";

export type Strategy = EventChooser & {
  readonly name: string;
  /**
   * この投入ラウンドでどのレーンへ投入するか。
   *
   * 空配列を返したら「もう投入しない」＝手番終了。投入できる札がない場合も空になる。
   */
  chooseInsertions(state: GameState, rng: Rng): LaneInsertion[];
  /** 投入ラウンドのあと、もう一度行うか */
  shouldContinue(state: GameState, rng: Rng): boolean;
};

/**
 * 山札1枚あたりの期待点。
 *
 * 既定のデッキ構成（コイン 30/27/19、イベント 14）から
 * (30×1 + 27×2 + 19×3) ÷ 90 ≒ 1.57。レーンの中身は裏向きなので、
 * 戦略はこの平均値で見積もる。
 */
const ESTIMATED_POINTS_PER_CARD = (30 * 1 + 27 * 2 + 19 * 3) / 90;

/** 出目6が横穴になる目標値の下限（docs/spec.md §5） */
const SIDE_HOLE_TARGET = 6;
const D6_FACES = 6;

/** 手番プレイヤーの手札のうち、投入できる（コインカードの）ものと添字 */
type HandEntry = { card: CoinCard; handIndex: number };

function coinHand(state: GameState): HandEntry[] {
  return state.players.flatMap((player, index) =>
    index === state.currentPlayerIndex
      ? player.hand.flatMap((card, handIndex) => (isCoinCard(card) ? [{ card, handIndex }] : []))
      : []
  );
}

/** 1レーンへ1枚投入したときの見積もり */
type LaneOption = {
  laneIndex: number;
  handIndex: number;
  /** 成功したときに得られる点数の期待値 */
  gain: number;
  /** 横穴になりうるレーンか（目標値6以上） */
  risky: boolean;
};

function evaluate(
  state: GameState,
  lane: Lane,
  laneIndex: number,
  { card, handIndex }: HandEntry
): LaneOption {
  const target = card.coins + lane.pending.length;
  const risky = target >= SIDE_HOLE_TARGET;

  // 目標値6以上なら出目6は横穴なので成功率は 5/6 で頭打ち（§5）
  const successRate = risky ? (D6_FACES - 1) / D6_FACES : target / D6_FACES;
  // 押し込めるのは滞留にあるぶんだけ。投入した1枚も滞留に入る
  const pushed = Math.min(state.config.pushCount(card.coins), lane.pending.length + 1);

  return { laneIndex, handIndex, gain: successRate * pushed * ESTIMATED_POINTS_PER_CARD, risky };
}

/** k 本のリスクありレーンへ投入したときのバースト確率 1-(5/6)^k（docs/spec.md §3） */
function bustProbability(riskyLanes: number): number {
  return 1 - ((D6_FACES - 1) / D6_FACES) ** riskyLanes;
}

/** 0 以上 max 未満の相異なる整数を count 個選ぶ */
function pickDistinct(rng: Rng, max: number, count: number): number[] {
  const pool = Array.from({ length: max }, (_, i) => i);
  return rng.shuffle(pool).slice(0, count);
}

/**
 * ランダム戦略。
 *
 * 投入できるレーン数の範囲からランダムに選ぶ。押し引きの判断も五分五分。
 * 期待値戦略の比較対象（下限）として使う。
 */
export function randomStrategy(): Strategy {
  return {
    ...autoEventChooser,
    name: "random",

    chooseInsertions(state, rng) {
      const hand = coinHand(state);
      const maxLanes = Math.min(state.config.maxLanesPerRound, state.lanes.length, hand.length);
      if (maxLanes === 0) {
        return [];
      }

      const count = 1 + rng.nextInt(maxLanes);
      const lanes = pickDistinct(rng, state.lanes.length, count);
      const cards = rng.shuffle(hand.map((entry) => entry.handIndex)).slice(0, count);

      return lanes.map((laneIndex, i) => ({
        laneIndex,
        handIndexes: cards.slice(i, i + 1),
      }));
    },

    shouldContinue(_state, rng) {
      return rng.nextInt(2) === 0;
    },
  };
}

/**
 * 期待値戦略（docs/spec.md §3 のチキンレース）。
 *
 * > 押し続ける条件: バースト確率 ＜ 次の利得 ÷ (次の利得 ＋ 未確定得点)
 *
 * 期待値の高いレーンから貪欲に足していき、この条件を満たさなくなったら止める。
 * 未確定得点が積み上がるほど投入レーン数が絞られ、目標値6未満のレーン
 * （横穴がない＝リスク 0）が逃げ道になる。
 */
export function expectedValueStrategy(): Strategy {
  const choose = (state: GameState): LaneInsertion[] => {
    const hand = coinHand(state);
    const maxLanes = Math.min(state.config.maxLanesPerRound, state.lanes.length, hand.length);

    const options = state.lanes
      .flatMap((lane, laneIndex) => hand.map((entry) => evaluate(state, lane, laneIndex, entry)))
      .sort((a, b) => b.gain - a.gain);

    const chosen: LaneOption[] = [];
    for (const option of options) {
      if (chosen.length >= maxLanes) {
        break;
      }
      if (
        chosen.some((c) => c.laneIndex === option.laneIndex || c.handIndex === option.handIndex)
      ) {
        continue;
      }

      const next = [...chosen, option];
      const gain = next.reduce((sum, c) => sum + c.gain, 0);
      const bust = bustProbability(next.filter((c) => c.risky).length);

      // 押し続ける条件（§3）。未確定得点が 0 なら右辺が 1 になり必ず通る
      if (bust >= gain / (gain + state.pendingPoints)) {
        continue;
      }
      chosen.push(option);
    }

    return chosen
      .sort((a, b) => a.laneIndex - b.laneIndex)
      .map(({ laneIndex, handIndex }) => ({ laneIndex, handIndexes: [handIndex] }));
  };

  return {
    ...autoEventChooser,
    name: "expectedValue",
    chooseInsertions: (state) => choose(state),
    // 投入する手が残っているかどうかが、そのまま続けるかどうかになる
    shouldContinue: (state) => choose(state).length > 0,
  };
}
