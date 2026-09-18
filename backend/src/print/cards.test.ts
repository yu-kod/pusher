import { describe, expect, it } from "vitest";
import { DEFAULT_DECK_CONFIG, EVENT_KINDS, createDeck } from "../game/deck.js";
import {
  BALL_CARD_POINTS,
  LANE_NAMES,
  SEATS,
  TABLETOP_BALANCE,
  buildBallCards,
  buildDeckCards,
  buildSeatCards,
  buildTabletopKit,
  cardFace,
  type PrintCard,
} from "./cards.js";

describe("buildDeckCards", () => {
  it("DEFAULT_DECK_CONFIG と同じ構成のカードを返す", () => {
    const cards = buildDeckCards(DEFAULT_DECK_CONFIG);

    expect(cards).toHaveLength(90);
    expect(cards.filter((c) => c.kind === "coin" && c.coins === 1)).toHaveLength(35);
    expect(cards.filter((c) => c.kind === "coin" && c.coins === 2)).toHaveLength(30);
    expect(cards.filter((c) => c.kind === "coin" && c.coins === 3)).toHaveLength(11);
    expect(cards.filter((c) => c.kind === "event")).toHaveLength(14);
  });

  it("構成を差し替えると枚数も変わる", () => {
    const cards = buildDeckCards({
      coins: { 1: 1, 2: 0, 3: 0 },
      events: { avalanche: 1, openLane: 0, extraSlot: 0, lottery: 0 },
    });

    expect(cards).toEqual<PrintCard[]>([
      { kind: "coin", coins: 1 },
      { kind: "event", event: "avalanche" },
    ]);
  });
});

describe("buildBallCards", () => {
  it("レーンの本数ぶんのボール札を返す", () => {
    expect(buildBallCards(3)).toEqual<PrintCard[]>([
      { kind: "ball", points: BALL_CARD_POINTS },
      { kind: "ball", points: BALL_CARD_POINTS },
      { kind: "ball", points: BALL_CARD_POINTS },
    ]);
  });
});

describe("buildSeatCards", () => {
  it("1席につきレーン指定3枚・降りる1枚・プレイヤーカード1枚を返す", () => {
    const cards = buildSeatCards(2);

    expect(cards).toHaveLength(10);
    expect(cards.filter((c) => c.kind === "lane")).toHaveLength(6);
    expect(cards.filter((c) => c.kind === "withdraw")).toHaveLength(2);
    expect(cards.filter((c) => c.kind === "seat")).toHaveLength(2);
  });

  it("席ごとにまとめて並ぶ（切ってそのまま1人へ配れる）", () => {
    const cards = buildSeatCards(2);

    expect(cards.slice(0, 5).every((c) => "seat" in c && c.seat === 0)).toBe(true);
    expect(cards.slice(5).every((c) => "seat" in c && c.seat === 1)).toBe(true);
  });
});

describe("TABLETOP_BALANCE", () => {
  it("採用案 A''（深いレーン）を刷る（#104）", () => {
    expect(TABLETOP_BALANCE.initialLaneCards).toBe(12);
    expect(TABLETOP_BALANCE.useBallCards).toBe(true);
    // デッキ104枚。既定値（90枚）ではなくプリセットが出典
    expect(createDeck(TABLETOP_BALANCE.deck)).toHaveLength(104);
  });
});

describe("buildTabletopKit", () => {
  it("メインデッキ・ボール札・各自のカードをこの順で束にする", () => {
    const kit = buildTabletopKit();

    expect(kit.map((section) => section.title)).toEqual([
      "メインデッキ",
      "ボール札",
      "各プレイヤーのカード",
    ]);
    expect(kit[0]?.cards).toHaveLength(104);
    expect(kit[1]?.cards).toHaveLength(TABLETOP_BALANCE.laneCount);
    expect(kit[2]?.cards).toHaveLength(SEATS.length * 5);
  });
});

describe("cardFace", () => {
  it("コインカードはコイン数と押し込み枚数を載せる", () => {
    const face = cardFace({ kind: "coin", coins: 3 });

    expect(face.tone).toBe("coin");
    expect(face.figure).toBe("3");
    expect(face.note).toContain("押し込み 2枚");
  });

  it("1コイン札と2コイン札はどちらも押し込み1枚", () => {
    expect(cardFace({ kind: "coin", coins: 1 }).note).toContain("押し込み 1枚");
    expect(cardFace({ kind: "coin", coins: 2 }).note).toContain("押し込み 1枚");
  });

  it("イベントカードは4種すべてに名前と効果がある", () => {
    for (const event of EVENT_KINDS) {
      const face = cardFace({ kind: "event", event });

      expect(face.tone).toBe("event");
      expect(face.title).not.toBe("");
      expect(face.body.length).toBeGreaterThan(10);
    }
  });

  it("ボール札は得点と、落ちたあとの入れ直しかたを載せる", () => {
    const face = cardFace({ kind: "ball", points: 10 });

    expect(face.tone).toBe("ball");
    expect(face.figure).toBe("10");
    // 入れ直すだけだとレーンが厚くなり続ける（game/ball.ts / #100）
    expect(face.note).toContain("山札");
  });

  it("レーン指定カードは席とレーンの名前を載せる", () => {
    const face = cardFace({ kind: "lane", seat: 1, lane: 2 });

    expect(face.tone).toBe("seat");
    expect(face.title).toBe(SEATS[1]?.name);
    expect(face.figure).toBe(LANE_NAMES[2]);
  });

  it("席やレーンが存在しなければ刷らずに落とす", () => {
    expect(() => cardFace({ kind: "seat", seat: SEATS.length })).toThrow(RangeError);
    expect(() => cardFace({ kind: "lane", seat: 0, lane: LANE_NAMES.length })).toThrow(RangeError);
  });

  it("降りるカードは席の名前と、降りると何が起きるかを載せる", () => {
    const face = cardFace({ kind: "withdraw", seat: 0 });

    expect(face.title).toBe(SEATS[0]?.name);
    expect(face.figure).toBe("降りる");
    expect(face.body).toContain("未確定得点");
  });

  it("プレイヤーカードは先行権の列に置くものだと分かる", () => {
    const face = cardFace({ kind: "seat", seat: 3 });

    expect(face.figure).toBe(SEATS[3]?.name);
    expect(face.body).toContain("先行権");
  });
});
