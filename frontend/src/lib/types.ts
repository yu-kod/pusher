/**
 * サーバーから受け取る型。
 *
 * backend の `GameView`（docs/spec.md §8）に対応する。裏向きのカードは中身を
 * 持たないので、**クライアント側でも中身を組み立てられない**形になっている。
 */
export type CoinCard = { kind: "coin"; coins: 1 | 2 | 3 };
export type EventCard = { kind: "event"; event: string };
export type Card = CoinCard | EventCard;

/** 滞留エリアのカード。表向き（§6 の「横穴開放」後）だけ中身が見える */
export type PendingCardView = { faceUp: true; card: Card } | { faceUp: false };

export type LaneView = {
  stockCount: number;
  pending: PendingCardView[];
  hasExtraSlot: boolean;
};

/** 手札。自分のものだけ中身が見える */
export type HandView = { owner: true; cards: Card[] } | { owner: false; count: number };

export type PlayerView = {
  id: string;
  name: string;
  points: number;
  hand: HandView;
};

/** 横穴（バースト）の発生条件（docs/spec.md §5）。判定はサーバーが行う */
export type SideHoleRule = { minRoll: number; minTarget: number };

export type RulesView = {
  laneCount: number;
  maxLanesPerRound: number;
  maxRounds: number;
  jackpotThreshold: number;
  sideHole: SideHoleRule;
};

export type GameView = {
  viewerId: string;
  rules: RulesView;
  lanes: LaneView[];
  players: PlayerView[];
  drawPileCount: number;
  discardPileCount: number;
  pendingPoints: number;
  jackpotPoints: number;
  jackpotCounter: number;
  currentPlayerIndex: number;
  startPlayerIndex: number;
  insertionRoundsThisTurn: number;
  round: number;
  lastSideHolePlayerId: string | null;
  phase: "playing" | "finished";
};

export type RoomPlayer = { id: string; name: string; isCpu: boolean };

export type RoomView = {
  code: string;
  /**
   * サーバーが状態を更新した時刻（docs/realtime.md §3）。
   *
   * 同じ形の状態が HTTP のレスポンスと WebSocket の push の両方から届く。
   * 経路が違えば追い越しが起きるので、手元より古いものを捨てる判断に使う。
   */
  rev: number;
  phase: "lobby" | "playing";
  players: RoomPlayer[];
  game: GameView | null;
};

/** 参加（作成）したときに返るもの */
export type Credentials = { playerId: string; token: string };
