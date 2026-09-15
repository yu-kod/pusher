/**
 * ゲーム状態の型とセットアップ処理（docs/spec.md §1 §2）。
 *
 * 状態は不変に扱う。各関数は引数の状態を変更せず、新しい状態を返す。
 */
import { type Balance } from "./balance.js";
import { createDeck, type Card } from "./deck.js";
import type { Rng } from "./rng.js";

export type PlayerId = string;

export type Player = {
  id: PlayerId;
  name: string;
  /**
   * 手札。中身は本人のみが見える。
   *
   * v0.2 で手札は**弾薬のみ**になった。得点にはならない（docs/spec.md §1）。
   */
  hand: Card[];
  /** 確定した得点。手番を終えるたびに未確定得点がここへ加算される（§3） */
  points: number;
};

/**
 * 滞留エリアのカード1枚。
 *
 * 通常は裏向き（`faceUp: false`）で、公開情報は枚数だけ。
 * 「横穴開放」（§6）で表向きになったカードは、以後も表向きのまま滞留し続ける。
 */
export type PendingCard = {
  card: Card;
  faceUp: boolean;
};

export type Lane = {
  /** 奥の山。裏向きで、中身は誰にも分からない */
  stock: Card[];
  /** 滞留エリア。添字 0 が奥側（レーンに近い側）で、先に入ったカードから押し込まれる */
  pending: PendingCard[];
  /** 投入口増設マーカー（§6）。置かれると誰でも2枚同時に投入できる */
  hasExtraSlot: boolean;
};

export type GamePhase = "playing" | "finished";

export type GameState = {
  config: Balance;
  lanes: Lane[];
  players: Player[];
  /** 山札。落下したコインカードは底へ戻る（docs/spec.md のルール解釈メモ） */
  drawPile: Card[];
  /** 捨て札。解決済みのイベントカードが入る。山札へは戻らない（§6） */
  discardPile: Card[];
  /**
   * 手番中に積み上がる未確定得点（§3）。
   *
   * 「やめる」で手番プレイヤーの points へ加算され、横穴（バースト）で
   * ジャックポットへ移る。手番の開始時は 0。
   */
  pendingPoints: number;
  /**
   * この手番でこれまでに行った投入ラウンドの回数（§3）。
   *
   * 手番が終わる（「やめる」または横穴）たびに 0 に戻る。
   * config.maxInsertionRoundsPerTurn と突き合わせて、続けられるかを判定する。
   */
  insertionRoundsThisTurn: number;
  /** ジャックポットに溜まった点数（§5） */
  jackpotPoints: number;
  /** ジャックポットカウンター（0〜5） */
  jackpotCounter: number;
  currentPlayerIndex: number;
  round: number;
  /** ゲーム終了時の未払い出し処理に使う（§5） */
  lastSideHolePlayerId: PlayerId | null;
  phase: GamePhase;
};

/** 3〜4人用（docs/spec.md 冒頭） */
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 4;

/**
 * 初期状態を作る（docs/spec.md §2）。
 *
 * 1. メインデッキをシャッフルする
 * 2. 各レーンの奥に initialLaneCards 枚ずつ裏向きで配置する
 * 3. 各プレイヤーに initialHandSize 枚を配る
 * 4. ジャックポットカウンターを 0 に置く
 * 5. 残りを山札とする
 */
export function setupGame(playerNames: readonly string[], rng: Rng, config: Balance): GameState {
  if (playerNames.length < MIN_PLAYERS || playerNames.length > MAX_PLAYERS) {
    throw new RangeError(
      `プレイヤーは ${MIN_PLAYERS}〜${MAX_PLAYERS} 人である必要がある: ${playerNames.length} 人`
    );
  }

  const deck = rng.shuffle(createDeck(config.deck));

  const required =
    config.laneCount * config.initialLaneCards + playerNames.length * config.initialHandSize;
  if (deck.length < required) {
    throw new RangeError(
      `デッキが足りない: 配布に ${required} 枚必要だが ${deck.length} 枚しかない`
    );
  }

  // シャッフル済みデッキの先頭から順に配っていく
  let next = 0;
  const take = (count: number): Card[] => deck.slice(next, (next += count));

  const lanes: Lane[] = Array.from({ length: config.laneCount }, () => ({
    stock: take(config.initialLaneCards),
    pending: [],
    hasExtraSlot: false,
  }));

  const players: Player[] = playerNames.map((name, index) => ({
    id: `p${index + 1}`,
    name,
    hand: take(config.initialHandSize),
    points: 0,
  }));

  return {
    config,
    lanes,
    players,
    drawPile: deck.slice(next),
    discardPile: [],
    pendingPoints: 0,
    insertionRoundsThisTurn: 0,
    jackpotPoints: 0,
    jackpotCounter: 0,
    currentPlayerIndex: 0,
    round: 1,
    lastSideHolePlayerId: null,
    phase: "playing",
  };
}
