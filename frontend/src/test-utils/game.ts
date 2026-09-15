import type { Card, GameView, LaneView, PlayerView } from "@/lib/types";

export const coin = (coins: 1 | 2 | 3): Card => ({ kind: "coin", coins });
export const eventCard = (event: string): Card => ({ kind: "event", event });

export function buildLane(overrides: Partial<LaneView> = {}): LaneView {
  return { stockCount: 5, pending: [], hasExtraSlot: false, ...overrides };
}

export function buildPlayer(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    id: "p1",
    name: "あき",
    points: 0,
    hand: { owner: false, count: 5 },
    ...overrides,
  };
}

/** 対局画面のテスト用。既定は「自分（p1）の手番、手札はコイン3枚」 */
export function buildGame(overrides: Partial<GameView> = {}): GameView {
  return {
    viewerId: "p1",
    rules: { laneCount: 3, maxLanesPerRound: 1, maxRounds: 13, jackpotThreshold: 5 },
    lanes: [buildLane(), buildLane(), buildLane()],
    players: [
      buildPlayer({
        id: "p1",
        name: "あき",
        hand: { owner: true, cards: [coin(1), coin(2), coin(3)] },
      }),
      buildPlayer({ id: "p2", name: "はると" }),
      buildPlayer({ id: "p3", name: "CPU3" }),
    ],
    drawPileCount: 40,
    discardPileCount: 0,
    pendingPoints: 0,
    jackpotPoints: 0,
    jackpotCounter: 0,
    currentPlayerIndex: 0,
    startPlayerIndex: 0,
    insertionRoundsThisTurn: 0,
    round: 1,
    lastSideHolePlayerId: null,
    phase: "playing",
    ...overrides,
  };
}
