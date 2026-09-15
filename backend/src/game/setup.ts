/**
 * ゲーム状態の型とセットアップ処理（docs/spec.md §1 §2）。
 *
 * 状態は不変に扱う。各関数は引数の状態を変更せず、新しい状態を返す。
 */
import { DEFAULT_DECK_CONFIG, createDeck, type Card, type DeckConfig } from "./deck.js";
import type { Rng } from "./rng.js";

export type PlayerId = string;

export type Player = {
  id: PlayerId;
  name: string;
  /**
   * 手札。中身は本人のみが見える。
   *
   * 押し出しで獲得したカードもここへ加える。領域は手札ひとつだけで、
   * 得点は手札のコイン合計になる（docs/spec.md のルール解釈メモ）。
   */
  hand: Card[];
};

export type Lane = {
  /** 奥の山。裏向きで、中身は誰にも分からない */
  stock: Card[];
  /** 滞留エリア。裏向きで、公開情報は枚数だけ */
  pending: Card[];
  /** 投入口増設マーカー（§6）。置かれると誰でも2枚同時に投入できる */
  hasExtraSlot: boolean;
};

export type GamePhase = "playing" | "finished";

export type GameState = {
  config: GameConfig;
  lanes: Lane[];
  players: Player[];
  /** 山札 */
  drawPile: Card[];
  /** ジャックポットプール。表向き */
  jackpotPool: Card[];
  /** ジャックポットカウンター（0〜5） */
  jackpotCounter: number;
  currentPlayerIndex: number;
  round: number;
  /** ゲーム終了時の未払い出し処理に使う（§5） */
  lastSideHolePlayerId: PlayerId | null;
  phase: GamePhase;
};

/**
 * ルールの数値。
 *
 * docs/spec.md §7 のとおり**すべて暫定**で、シミュレーション（#13）で調整する。
 * マジックナンバーを実装に散らさず、ここに集約する。
 */
export type GameConfig = {
  deck: DeckConfig;
  /** レーンの本数（§1）。§7 で 3 本も検証する */
  laneCount: number;
  /** セットアップで各レーンの奥に置く枚数（§2） */
  initialLaneCards: number;
  /** セットアップで各プレイヤーに配る枚数（§2） */
  initialHandSize: number;
  /** 手札上限（§3） */
  handLimit: number;
  /** この数のラウンドが終わったらゲーム終了（§3） */
  maxRounds: number;
  /** ジャックポットカウンターがこの値に達すると JP判定を行う（§5）。カウンターの上限でもある */
  jackpotThreshold: number;
};

export const DEFAULT_GAME_CONFIG: GameConfig = {
  deck: DEFAULT_DECK_CONFIG,
  laneCount: 4,
  initialLaneCards: 5,
  initialHandSize: 5,
  handLimit: 7,
  maxRounds: 12,
  jackpotThreshold: 5,
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
export function setupGame(playerNames: readonly string[], rng: Rng, config: GameConfig): GameState {
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
  }));

  return {
    config,
    lanes,
    players,
    drawPile: deck.slice(next),
    jackpotPool: [],
    jackpotCounter: 0,
    currentPlayerIndex: 0,
    round: 1,
    lastSideHolePlayerId: null,
    phase: "playing",
  };
}
