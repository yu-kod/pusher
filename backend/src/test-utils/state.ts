/**
 * ゲーム状態を組み立てるテスト用ヘルパー。
 *
 * 未確定得点は `Player` が持つ（#88）。テストの多くは「手番プレイヤーが N 点
 * 抱えている状態」を作りたいだけなので、その組み立てをここに集約する。
 */
import type { GameState } from "../game/setup.js";

/** 手番プレイヤーの未確定得点を設定した状態を返す（docs/spec.md §3） */
export function withPendingPoints(state: GameState, pendingPoints: number): GameState {
  return {
    ...state,
    players: state.players.map((player, index) =>
      index === state.currentPlayerIndex ? { ...player, pendingPoints } : player
    ),
  };
}

/**
 * `Partial<GameState>` に、手番プレイヤーの未確定得点を混ぜて渡せるようにした型。
 *
 * 既存のテストが `buildState({ pendingPoints: 7 })` と書けるようにするためのもの。
 */
export type StateOverrides = Partial<GameState> & { pendingPoints?: number };

/** `StateOverrides` を未確定得点とそれ以外に分ける */
export function splitOverrides(overrides?: StateOverrides): {
  pendingPoints: number;
  rest: Partial<GameState>;
} {
  const { pendingPoints = 0, ...rest } = overrides ?? {};
  return { pendingPoints, rest };
}
