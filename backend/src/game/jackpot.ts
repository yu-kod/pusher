/**
 * 横穴とジャックポット（docs/spec.md §5）。
 *
 * 横穴は出目6かつ目標値6以上のとき発生する（判定は turn.ts）。
 * 押し出し自体は通常どおり処理され（push.ts）、落ちたカードの行き先だけが変わる。
 */
import type { Card } from "./deck.js";
import type { Rng } from "./rng.js";
import type { GameState } from "./setup.js";

/** ジャックポット当選となる出目（§5） */
const JACKPOT_WIN_ROLL = 6;

/**
 * 横穴を処理する（docs/spec.md §5）。
 *
 * - 落ちたカードは獲得者のものにならず、ジャックポットプールへ入る
 * - ジャックポットカウンターを1つ進める（上限 config.jackpotThreshold で頭打ち）
 * - 最後に横穴を出したプレイヤーを記録する（ゲーム終了時の未払い出し処理に使う）
 *
 * 押し出しそのもの（押し込み・落下・補充）は resolvePush が済ませている前提で、
 * その落下カードを受け取る。
 */
export function applySideHole(state: GameState, fallenCards: readonly Card[]): GameState {
  const player = state.players[state.currentPlayerIndex];
  if (player === undefined) {
    throw new RangeError(`手番プレイヤーがいない: ${state.currentPlayerIndex}`);
  }

  return {
    ...state,
    jackpotPool: [...state.jackpotPool, ...fallenCards],
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
  /** 当選して獲得したプールのカード。外れたら空 */
  wonCards: Card[];
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
    return { state, roll, won: false, wonCards: [] };
  }

  // 既定は全獲得。jackpotPayoutRatio を下げるとプールの一部だけを獲得し、
  // 残りは次のジャックポットへ持ち越す（§7 次点の検証項目）
  const wonCount = Math.floor(state.jackpotPool.length * state.config.jackpotPayoutRatio);
  const wonCards = state.jackpotPool.slice(0, wonCount);
  const carriedOver = state.jackpotPool.slice(wonCount);

  const players = state.players.map((p, index) =>
    index === state.currentPlayerIndex ? { ...p, hand: [...p.hand, ...wonCards] } : p
  );

  return {
    state: { ...state, players, jackpotPool: carriedOver, jackpotCounter: 0 },
    roll,
    won: true,
    wonCards,
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
          index === winnerIndex ? { ...p, hand: [...p.hand, ...state.jackpotPool] } : p
        );

  return { ...state, players, jackpotPool: [] };
}
