/**
 * 横穴とジャックポット（docs/spec.md §5）。
 *
 * 横穴は出目6かつ目標値6以上のとき発生する（判定は turn.ts）。
 * 押し出し自体は通常どおり処理され（push.ts）、落ちたカードの行き先だけが変わる。
 */
import type { Rng } from "./rng.js";
import type { GameState } from "./setup.js";

/** ジャックポット当選となる出目（§5） */
const JACKPOT_WIN_ROLL = 6;

/**
 * 横穴（バースト）を処理する（docs/spec.md §3 §5）。
 *
 * - **その手番の未確定得点がすべてジャックポットへ移る**（この投入ラウンドの落下分も含む）
 * - ジャックポットカウンターを1つ進める（上限 config.jackpotThreshold で頭打ち）
 * - 最後に横穴を出したプレイヤーを記録する（ゲーム終了時の未払い出し処理に使う）
 *
 * 落下カード自体は collectFallenCards が未確定得点へ加えて山札へ戻したあとなので、
 * ここではカードを扱わない。すでに確定した得点は失われない。
 */
export function applySideHole(state: GameState): GameState {
  const player = state.players[state.currentPlayerIndex];
  if (player === undefined) {
    throw new RangeError(`手番プレイヤーがいない: ${state.currentPlayerIndex}`);
  }

  return {
    ...state,
    // この手番の未確定得点がすべてジャックポットへ移る（バースト）
    jackpotPoints: state.jackpotPoints + state.pendingPoints,
    pendingPoints: 0,
    jackpotCounter: Math.min(state.jackpotCounter + 1, state.config.jackpotThreshold),
    lastSideHolePlayerId: player.id,
  };
}

/** カウンターが閾値に達していて JP判定を行えるか（§5） */
export function canRollJackpot(state: GameState): boolean {
  return state.jackpotCounter >= state.config.jackpotThreshold;
}

export type JackpotRollResult = {
  state: GameState;
  /** JP判定の出目 */
  roll: number;
  won: boolean;
  /** 当選して獲得した点数。外れたら 0 */
  wonPoints: number;
};

/**
 * JP判定を行う（docs/spec.md §5）。
 *
 * d6 を1個振り、6 が出れば手番プレイヤーがプールのカードを全獲得する。
 *
 * - 当選: プールを空にし、カウンターを 0 に戻す（docs/spec.md のルール解釈メモ）。
 *   balance.jackpotPayoutRatio を下げると一部だけ獲得し、残りは持ち越す
 * - 外れ: カウンターは据え置き。以後、誰かが横穴を出すたびに再判定できる
 */
export function rollJackpot(state: GameState, rng: Pick<Rng, "rollD6">): JackpotRollResult {
  const player = state.players[state.currentPlayerIndex];
  if (player === undefined) {
    throw new RangeError(`手番プレイヤーがいない: ${state.currentPlayerIndex}`);
  }

  const roll = rng.rollD6();
  if (roll !== JACKPOT_WIN_ROLL) {
    return { state, roll, won: false, wonPoints: 0 };
  }

  // 既定は全獲得。jackpotPayoutRatio を下げると一部だけを獲得し、
  // 残りは次のジャックポットへ持ち越す（§7 次点の検証項目）
  const wonPoints = Math.floor(state.jackpotPoints * state.config.jackpotPayoutRatio);
  const carriedOver = state.jackpotPoints - wonPoints;

  const players = state.players.map((p, index) =>
    index === state.currentPlayerIndex ? { ...p, points: p.points + wonPoints } : p
  );

  return {
    state: { ...state, players, jackpotPoints: carriedOver, jackpotCounter: 0 },
    roll,
    won: true,
    wonPoints,
  };
}

/**
 * ゲーム終了時、未払い出しのジャックポットを処理する（docs/spec.md §5）。
 *
 * カウンターが閾値に達していれば最後に横穴を出したプレイヤーが獲得する。
 * 達していなければ流れる（誰も獲得しない）。
 */
export function settleJackpotAtGameEnd(state: GameState): GameState {
  const winnerIndex = canRollJackpot(state)
    ? state.players.findIndex((p) => p.id === state.lastSideHolePlayerId)
    : -1;

  // 横穴を出した人がいない（-1）なら流れる
  const players =
    winnerIndex === -1
      ? state.players
      : state.players.map((p, index) =>
          index === winnerIndex ? { ...p, points: p.points + state.jackpotPoints } : p
        );

  return { ...state, players, jackpotPoints: 0 };
}
