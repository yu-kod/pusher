import type {
  Card,
  GameView,
  LaneView,
  PlayerView,
  ResolutionStepView,
  TickPlayerView,
  TickView,
} from "@/lib/types";

export const coin = (coins: 1 | 2 | 3): Card => ({ kind: "coin", coins });
export const eventCard = (event: string): Card => ({ kind: "event", event });

export function buildLane(overrides: Partial<LaneView> = {}): LaneView {
  return { stockCount: 6, ballIndex: 5, pending: [], hasExtraSlot: false, ...overrides };
}

export function buildPlayer(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    id: "p1",
    name: "あき",
    points: 0,
    pendingPoints: 0,
    hand: { owner: false, count: 5 },
    ...overrides,
  };
}

export function buildTickPlayer(overrides: Partial<TickPlayerView> = {}): TickPlayerView {
  return { id: "p1", declared: false, active: true, declaration: null, ...overrides };
}

/** 3拍の進行。既定は「宣言の拍、まだ誰も宣言していない、先行権は席順」 */
export function buildTick(overrides: Partial<TickView> = {}): TickView {
  return {
    index: 0,
    phase: "declaring",
    deadlineAt: 1_700_000_012_000,
    resolvedAt: null,
    steps: [],
    order: [0, 1, 2],
    players: [
      buildTickPlayer({ id: "p1" }),
      buildTickPlayer({ id: "p2" }),
      buildTickPlayer({ id: "p3" }),
    ],
    ...overrides,
  };
}

export function buildStep(overrides: Partial<ResolutionStepView> = {}): ResolutionStepView {
  return {
    playerIndex: 0,
    lanes: [
      {
        laneIndex: 0,
        insertedCoins: 2,
        target: 4,
        roll: 3,
        outcome: "success",
        droppedCount: 1,
      },
    ],
    gainedPoints: 2,
    busted: false,
    ...overrides,
  };
}

/** 対局画面のテスト用。既定は「自分（p1）の手番、手札はコイン3枚」 */
export function buildGame(overrides: Partial<GameView> = {}): GameView {
  return {
    viewerId: "p1",
    rules: {
      laneCount: 3,
      maxLanesPerRound: 1,
      maxRounds: 13,
      jackpotThreshold: 5,
      sideHole: { minRoll: 6, minTarget: 1 },
    },
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
