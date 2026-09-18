/**
 * 卓上版（プリント＆プレイ）のカード一式（#91）。
 *
 * 枚数と構成比は `game/balance.ts` の調整値を単一の出典とし、ここでは印刷用の
 * 見た目だけを決める。**同じ数字を2か所に書かない。**
 *
 * ルールの出典は `docs/spec.md` と `docs/turn-structure.md`（本命案）。
 */
import {
  createDeck,
  isCoinCard,
  type CoinCount,
  type DeckConfig,
  type EventKind,
} from "../game/deck.js";
import { withPreset } from "../game/balance.js";

/**
 * 卓上版が刷る構成（#106）。
 *
 * 採用案 A''（プリセット `tickBallDeep`、#104）— ティック同時進行・先行権・ボール札に
 * **深いレーン**（12枚＋ボール札）を足した形。デッキは104枚になる。
 *
 * 既定値ではなくプリセットを見ているのは、`docs/spec.md` v0.3 のルールがエンジンに
 * 入った一方で、**既定値はまだ v0.2 のまま**だから（spec v0.3 冒頭「実装の状態」）。
 * サーバーが3拍を持って既定が切り替わったら、ここを `DEFAULT_BALANCE` に戻せばよい。
 *
 * ## カードを増やさない案（A'）に切り替えるとき
 *
 * デッキを90枚のままにする案（初期滞留を9枚 → 5枚に下げて同じ深さにする）を採る場合、
 * ここを次に差し替えて `npm run print` を回せば刷り物はすべて追従する。
 * ルールブックの「中身」「準備」「早見表」の枚数だけは手書きなので直す。
 *
 *     export const TABLETOP_BALANCE: Balance = {
 *       ...withPreset("tickBallDeep"),
 *       initialPendingCards: 5,
 *       deck: DEFAULT_DECK_CONFIG,
 *     };
 */
export const TABLETOP_BALANCE = withPreset("tickBallDeep");

/** 席（プレイヤー）。色は印刷後に見分けるためのもので、ルールには関わらない */
export const SEATS = [
  { name: "赤", color: "#c0392b" },
  { name: "青", color: "#2472a4" },
  { name: "緑", color: "#1e8449" },
  { name: "黄", color: "#b7950b" },
] as const;

/** レーンの呼び名（docs/spec.md §1「左・中央・右」） */
export const LANE_NAMES = ["左", "中央", "右"] as const;

/**
 * ボール札の得点（docs/turn-structure.md §4-3）。
 *
 * エンジンの調整値が出典（#100）。印刷物とエンジンで別の数字を持たない。
 */
export const BALL_CARD_POINTS = TABLETOP_BALANCE.ballPoints;

export type PrintCard =
  | { kind: "coin"; coins: CoinCount }
  | { kind: "event"; event: EventKind }
  | { kind: "ball"; points: number }
  | { kind: "lane"; seat: number; lane: number }
  | { kind: "withdraw"; seat: number }
  | { kind: "seat"; seat: number };

/** 印刷するカード1枚の面。レイアウトは `render.ts` が決める */
export type CardFace = {
  /** 左上の小さい見出し */
  title: string;
  /** 中央の大きな表示 */
  figure: string;
  /** 本文（効果・補足） */
  body: string;
  /** 下部の注記 */
  note: string;
  /** 見た目の系統 */
  tone: "coin" | "event" | "ball" | "seat";
  /** 縁の色。席ごとのカードだけ色がつく */
  color?: string;
};

/** 1つの束（切ったあと1つの山になるまとまり） */
export type KitSection = {
  title: string;
  description: string;
  cards: PrintCard[];
};

/** メインデッキ90枚（コイン札＋イベント札）。順番は構成の確認用で、遊ぶ前にシャッフルする */
export function buildDeckCards(config: DeckConfig = TABLETOP_BALANCE.deck): PrintCard[] {
  return createDeck(config).map((card) =>
    isCoinCard(card)
      ? ({ kind: "coin", coins: card.coins } as const)
      : ({ kind: "event", event: card.event } as const)
  );
}

/** ボール札。各レーンに1枚ずつ、表向きで入る（docs/turn-structure.md §4-3） */
export function buildBallCards(laneCount: number): PrintCard[] {
  return Array.from({ length: laneCount }, () => ({
    kind: "ball" as const,
    points: BALL_CARD_POINTS,
  }));
}

/**
 * 各プレイヤーが持つカード（docs/turn-structure.md §4-11）。
 *
 * レーン指定3枚＋降りる1枚＋プレイヤーカード1枚。席ごとにまとめて並べるので、
 * 切ったあとそのまま1人へ配れる。
 */
export function buildSeatCards(seatCount: number): PrintCard[] {
  return Array.from({ length: seatCount }, (_, seat) => [
    ...LANE_NAMES.map((_name, lane) => ({ kind: "lane" as const, seat, lane })),
    { kind: "withdraw" as const, seat },
    { kind: "seat" as const, seat },
  ]).flat();
}

/** 卓上版一式。印刷する順に並べる */
export function buildTabletopKit(config: DeckConfig = TABLETOP_BALANCE.deck): KitSection[] {
  return [
    {
      title: "メインデッキ",
      description: `コイン札とイベント札。全部で ${createDeck(config).length} 枚（docs/spec.md §1）`,
      cards: buildDeckCards(config),
    },
    {
      title: "ボール札",
      description: `各レーンに1枚ずつ、表向きで入れる。落ちると ${BALL_CARD_POINTS}点`,
      cards: buildBallCards(TABLETOP_BALANCE.laneCount),
    },
    {
      title: "各プレイヤーのカード",
      description: "席ごとに5枚（レーン指定3枚・降りる・プレイヤーカード）",
      cards: buildSeatCards(SEATS.length),
    },
  ];
}

const EVENT_FACES: Record<EventKind, { name: string; body: string }> = {
  avalanche: {
    name: "なだれ",
    body: "全レーンの滞留を1枚ずつ奥へ押し込む。押し込んだ枚数ぶん各レーンから落ち、引いた人が得点する。",
  },
  openLane: {
    name: "横穴開放",
    body: "1レーンを指定し、その滞留をすべて表向きにする。引いた人はその中から1枚を選んで得点にし、そのカードを山札へ戻す。残りは表向きのまま滞留する。",
  },
  extraSlot: {
    name: "投入口増設",
    body: "1レーンを指定し、このカードを置く。以後そのレーンには誰でも2枚同時に投入できる（目標値は2枚のコイン合計＋滞留枚数、押し込みもコインの合計から数える）。",
  },
  lottery: {
    name: "抽選抽選",
    body: "ジャックポットカウンターを2つ進める。引いた人はすぐに JP判定を1回行える（外れてもカウンターは戻らない）。",
  },
};

/** カード1枚に印刷する内容を決める */
export function cardFace(card: PrintCard): CardFace {
  if (card.kind === "coin") {
    return {
      title: `コイン ${"●".repeat(card.coins)}`,
      figure: String(card.coins),
      body: "目標値 ＝ このコイン数 ＋ 滞留の枚数",
      note: `押し込み ${TABLETOP_BALANCE.pushCount(card.coins)}枚 ／ 落ちると ${card.coins}点`,
      tone: "coin",
    };
  }

  if (card.kind === "event") {
    const face = EVENT_FACES[card.event];
    return {
      title: "イベント",
      figure: face.name,
      body: face.body,
      note: "落ちたら即座に解決し、捨て札にする。そのレーンからもう1枚落とす",
      tone: "event",
    };
  }

  if (card.kind === "ball") {
    return {
      title: "ボール",
      figure: String(card.points),
      body: "レーンの中で1枚だけ表向きに置く。落ちると得点になる。",
      note: "落ちたら奥の端へ表向きで戻し、その1枚下のカードを山札の下へ戻す",
      tone: "ball",
    };
  }

  const seat = SEATS[card.seat];
  if (seat === undefined) {
    throw new RangeError(`存在しない席: ${card.seat}`);
  }
  const { name: seatName, color } = seat;

  if (card.kind === "lane") {
    const laneName = LANE_NAMES[card.lane];
    if (laneName === undefined) {
      throw new RangeError(`存在しないレーン: ${card.lane}`);
    }
    return {
      title: seatName,
      figure: laneName,
      body: "投入するレーンの宣言。手札1枚といっしょに伏せて出す。",
      note: "宣言は全員が伏せ終わってから一斉に開く",
      tone: "seat",
      color,
    };
  }

  if (card.kind === "withdraw") {
    return {
      title: seatName,
      figure: "降りる",
      body: "このラウンドから抜ける。未確定得点をそのまま得点として確定する。",
      note: "降りた順にプレイヤーカードを並べる。それが次のラウンドの解決順になる",
      tone: "seat",
      color,
    };
  }

  return {
    title: "プレイヤー",
    figure: seatName,
    body: "降りたときに先行権の列へ置く。列の並びが次のラウンドの解決順になる。",
    note: "横穴・手札切れで抜けた人は、自分から降りた人より後ろに置く",
    tone: "seat",
    color,
  };
}
