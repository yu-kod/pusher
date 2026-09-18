/**
 * クライアントへ返す状態（docs/spec.md §8）。
 *
 * 「レーンの中身と滞留エリアが裏向きで、枚数だけが公開情報」という情報設計が
 * このゲームの核になっている。サーバーが持つ `GameState` をそのまま返すと、
 * めくる瞬間の快感がまるごと失われる。
 *
 * ## GameState とは別の型にする
 *
 * マスクし忘れを型で防ぐため、クライアントへ渡せるのはこの `GameView` だけにする。
 * `GameState` を受け取る API は作らない。
 *
 * ## 誰向けかを型に含める
 *
 * 自分の手札は見えるが他人の手札は枚数しか見えないため、マスク結果はプレイヤーごとに
 * 異なる。`viewerId` を持たせて、どのプレイヤー向けのビューかを取り違えないようにする。
 */
import type { Balance, SideHoleRule } from "./balance.js";
import type { Card } from "./deck.js";
import { ballIndexOf } from "./ball.js";
import type { GamePhase, GameState, PlayerId } from "./setup.js";
import { pendingPointsOf } from "./push.js";

/**
 * 滞留エリアのカード1枚。
 *
 * 裏向きのものは中身を持たない。「横穴開放」（§6）で表向きになったものだけ
 * カードを返す。判別可能なユニオンにして、裏向きなのに中身がある状態を
 * 型で表現できないようにしてある。
 */
export type PendingCardView = { faceUp: true; card: Card } | { faceUp: false };

export type LaneView = {
  /** 奥の山は枚数のみ。中身は誰にも見えない */
  stockCount: number;
  /**
   * ボール札が末端から何枚目にあるか（`docs/turn-structure.md` §4-3）。
   *
   * **奥の山で唯一の公開情報。** 列の中で1枚だけ表向きに置かれているので、
   * 「あと何枚押し込めば落ちるか」は卓上でも全員に見えている。ここを隠すと
   * 同じレーンを狙う理由そのものが消える。ボール札を使わない設定では null。
   */
  ballIndex: number | null;
  pending: PendingCardView[];
  hasExtraSlot: boolean;
};

/** 手札。自分のものだけ中身が見える */
export type HandView = { owner: true; cards: Card[] } | { owner: false; count: number };

export type PlayerView = {
  id: PlayerId;
  name: string;
  points: number;
  /**
   * まだ確定していない得点（§3）。
   *
   * 未確定得点トラックは卓上に出ている公開情報なので（docs/spec.md §1）、
   * 全員ぶん返してよい。裏向き情報ではない。
   */
  pendingPoints: number;
  hand: HandView;
};

/**
 * 表示に必要な調整値だけを抜き出したもの。
 *
 * `Balance` をそのまま返してはいけない。`pushCount` は関数なので JSON 化できず、
 * デッキ構成をクライアントへ渡す理由もない。
 */
export type RulesView = {
  laneCount: number;
  maxLanesPerRound: number;
  maxRounds: number;
  jackpotThreshold: number;
  /**
   * 横穴の発生条件（§5）。
   *
   * クライアントにルールを実装させないために返す。これが無いと画面側が
   * 「目標値6以上なら危険」を自前で持つことになり、調整値を変えたときに嘘になる。
   */
  sideHole: SideHoleRule;
};

export type GameView = {
  /** このビューを見るプレイヤー。卓にいない id なら観戦者として扱う */
  viewerId: PlayerId;
  rules: RulesView;
  lanes: LaneView[];
  players: PlayerView[];
  /** 山札は枚数のみ */
  drawPileCount: number;
  /** 捨て札も枚数のみ。残りのイベント枚数を数えられないようにする */
  discardPileCount: number;
  /**
   * 手番プレイヤーの未確定得点（§3）。
   *
   * プレイヤーごとの値は `players[].pendingPoints` にある。同時進行（#88）では
   * 手番プレイヤーという概念が薄れるので、そちらを使うほうが確実。
   */
  pendingPoints: number;
  jackpotPoints: number;
  jackpotCounter: number;
  currentPlayerIndex: number;
  startPlayerIndex: number;
  insertionRoundsThisTurn: number;
  round: number;
  lastSideHolePlayerId: PlayerId | null;
  phase: GamePhase;
};

function rulesOf(config: Balance): RulesView {
  return {
    laneCount: config.laneCount,
    maxLanesPerRound: config.maxLanesPerRound,
    maxRounds: config.maxRounds,
    jackpotThreshold: config.jackpotThreshold,
    sideHole: { ...config.sideHole },
  };
}

/**
 * 指定したプレイヤー向けにマスクした状態を返す（docs/spec.md §8）。
 *
 * `viewerId` が卓にいないプレイヤーなら、どの手札も枚数しか見えない（観戦者）。
 */
export function viewFor(state: GameState, viewerId: PlayerId): GameView {
  return {
    viewerId,
    rules: rulesOf(state.config),

    lanes: state.lanes.map((lane) => ({
      stockCount: lane.stock.length,
      ballIndex: ballIndexOf(lane),
      pending: lane.pending.map((p): PendingCardView =>
        p.faceUp ? { faceUp: true, card: p.card } : { faceUp: false }
      ),
      hasExtraSlot: lane.hasExtraSlot,
    })),

    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      points: player.points,
      pendingPoints: player.pendingPoints,
      hand:
        player.id === viewerId
          ? { owner: true, cards: player.hand }
          : { owner: false, count: player.hand.length },
    })),

    drawPileCount: state.drawPile.length,
    discardPileCount: state.discardPile.length,
    pendingPoints: pendingPointsOf(state),
    jackpotPoints: state.jackpotPoints,
    jackpotCounter: state.jackpotCounter,
    currentPlayerIndex: state.currentPlayerIndex,
    startPlayerIndex: state.startPlayerIndex,
    insertionRoundsThisTurn: state.insertionRoundsThisTurn,
    round: state.round,
    lastSideHolePlayerId: state.lastSideHolePlayerId,
    phase: state.phase,
  };
}
