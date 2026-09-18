/**
 * ティック同時進行（`docs/turn-structure.md` §4-1）。
 *
 * 1ティックは3拍からなる。
 *
 *   ① 宣言（同時・伏せ） → ② 一斉公開 → ③ 先行権順に1人ずつ解決
 *
 * ①②は通信層と UI の責務で、エンジンが受け持つのは③だけ。ここに渡ってくる時点で
 * 宣言は出そろっていて、順番も決まっている。
 *
 * ## 盤面が動くのは、いつでも1人ぶんずつ
 *
 * 「同時」なのは宣言だけで、解決は必ず逐次で行う（`docs/turn-structure.md` §4-6）。
 * だから1人ぶんの解決は手番制とまったく同じで、`resolveInsertionRound` をそのまま使う。
 * 2人目は1人目の結果が反映された盤面で目標値を算出する（§4-7）。
 *
 * ## チキンレースは各自の器で
 *
 * 未確定得点はプレイヤーごとに持つ（#88）。誰かが横穴を踏んでも、巻き込まれるのは
 * その人の未確定得点だけで、同じティックにいる他のプレイヤーには及ばない。
 */
import { resolveInsertionRound, type InsertionRoundResult } from "./round.js";
import type { EventChooser } from "./resolve.js";
import type { Rng } from "./rng.js";
import type { GameState } from "./setup.js";
import type { LaneInsertion } from "./turn.js";

/** 1プレイヤーぶんの宣言（`docs/turn-structure.md` §4-10「投入する」） */
export type TickDeclaration = {
  playerIndex: number;
  /** 通常は1レーンへ1枚。「投入口増設」のあるレーンは2枚まで（docs/spec.md §6） */
  insertions: readonly LaneInsertion[];
};

/** 宣言1つぶんの解決結果 */
export type TickPlayerResult = {
  playerIndex: number;
  round: InsertionRoundResult;
};

export type TickResult = {
  state: GameState;
  /** 解決した順（＝先行権順）に並ぶ。宣言しなかったプレイヤーは含まれない */
  players: TickPlayerResult[];
};

/**
 * 1ティックを解決する（`docs/turn-structure.md` §4-1）。
 *
 * `declarations` は**解決する順に**並べて渡す。順番を決めるのは先行権であって
 * 宣言の到着順ではないため、並べ替えはここではなく呼び出し側が行う
 * （`docs/realtime.md` §8 — 通信層は順番を決めない）。
 *
 * 「降りる」の宣言はここには来ない。降りたプレイヤーはそのラウンドの以後の
 * ティックに参加しないので、単に `declarations` から外れる。
 */
export function resolveTick(
  state: GameState,
  declarations: readonly TickDeclaration[],
  chooser: EventChooser,
  rng: Pick<Rng, "rollD6">
): TickResult {
  // 1手番あたりの投入ラウンド数の上限は、ゲーム全体に1つしかない
  // `insertionRoundsThisTurn` を見ている（docs/spec.md §7 の調整用）。
  // 同時進行ではプレイヤーごとの回数になるため、そのままでは意味が変わる。
  // 使う必要が出たら Player へ移す。それまでは黙って誤動作させない
  if (state.config.maxInsertionRoundsPerTurn !== null) {
    throw new RangeError(
      "maxInsertionRoundsPerTurn はティック同時進行では未対応（プレイヤーごとの回数にする必要がある）"
    );
  }

  let current = state;
  const players: TickPlayerResult[] = [];

  for (const { playerIndex, insertions } of declarations) {
    if (current.players[playerIndex] === undefined) {
      throw new RangeError(`存在しないプレイヤー: ${playerIndex}`);
    }

    // 解決中のプレイヤーを手番プレイヤーとして扱う。
    // これで得点も横穴もそのプレイヤーのものとして処理される
    const round = resolveInsertionRound(
      { ...current, currentPlayerIndex: playerIndex },
      insertions,
      chooser,
      rng
    );

    current = round.state;
    players.push({ playerIndex, round });
  }

  // ティックの外に手番プレイヤーという概念はないので、呼び出し側を驚かせないよう戻す
  return { state: { ...current, currentPlayerIndex: state.currentPlayerIndex }, players };
}
