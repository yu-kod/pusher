import { describe, expect, it } from "vitest";
import { createDeck, isCoinCard, isEventCard } from "./deck.js";
import {
  BALANCE_PRESETS,
  DEFAULT_BALANCE,
  withPreset,
  type Balance,
  type PresetName,
} from "./balance.js";

describe("DEFAULT_BALANCE", () => {
  it("設計書どおりの既定値になっている（docs/spec.md §1 §2 §3 §5）", () => {
    expect(DEFAULT_BALANCE.laneCount).toBe(3);
    expect(DEFAULT_BALANCE.initialLaneCards).toBe(12);
    expect(DEFAULT_BALANCE.initialHandSize).toBe(5);
    expect(DEFAULT_BALANCE.maxRounds).toBe(13);
    expect(DEFAULT_BALANCE.jackpotThreshold).toBe(5);
    expect(DEFAULT_BALANCE.roundDrawCount).toBe(3);
    expect(DEFAULT_BALANCE.roundLaneRefillCount).toBe(0);
    expect(DEFAULT_BALANCE.handLimit).toBeNull();
  });

  it("v0.3 の進行方式が既定になっている（docs/spec.md §3）", () => {
    expect(DEFAULT_BALANCE.progressMode).toBe("tick");
    expect(DEFAULT_BALANCE.useResolutionPriority).toBe(true);
    expect(DEFAULT_BALANCE.useBallCards).toBe(true);
    // 先行権の列がスタートプレイヤーの役を兼ねるので、席順の移動は無くなった
    expect(DEFAULT_BALANCE.rotateStartPlayer).toBe(false);
  });

  it("デッキが104枚、うちイベントカードが16枚ある（docs/spec.md §1）", () => {
    const deck = createDeck(DEFAULT_BALANCE.deck);

    expect(deck).toHaveLength(104);
    expect(deck.filter(isEventCard)).toHaveLength(16);
  });

  it("レーンの奥はボール札を含めて13枚になる（docs/spec.md §1「レーン」）", () => {
    expect(DEFAULT_BALANCE.initialLaneCards + 1).toBe(13);
  });

  it("コイン札の構成比が 46 / 39 / 15 に近い（docs/spec.md §1）", () => {
    const coins = createDeck(DEFAULT_BALANCE.deck).filter(isCoinCard);

    const ratio = (n: 1 | 2 | 3) => coins.filter((c) => c.coins === n).length / coins.length;
    expect(ratio(1)).toBeCloseTo(0.46, 1);
    expect(ratio(2)).toBeCloseTo(0.39, 1);
    expect(ratio(3)).toBeCloseTo(0.15, 1);
  });

  it("イベントカードがデッキ全体の 15% を占める（docs/spec.md §1）", () => {
    const deck = createDeck(DEFAULT_BALANCE.deck);

    expect(deck.filter(isEventCard).length / deck.length).toBeCloseTo(0.15, 1);
  });
});

describe("v0.2 へ戻すプリセット", () => {
  it("v02 は v0.2 の既定値一式に戻す", () => {
    const v02 = withPreset("v02");

    expect(v02.progressMode).toBe("turn");
    expect(v02.useResolutionPriority).toBe(false);
    expect(v02.useBallCards).toBe(false);
    expect(v02.rotateStartPlayer).toBe(true);
    expect(v02.initialLaneCards).toBe(5);
    expect(createDeck(v02.deck)).toHaveLength(90);
  });

  // §9 の段階測定は v0.2 から1つずつ足して測った。既定が v0.3 になっても
  // その並びを再現できないと「3つはセットでしか効かない」を確かめ直せない
  it("段階プリセットは v0.2 を土台に1つずつ足す（docs/turn-structure.md §9）", () => {
    const tick = withPreset("tickMode");
    expect(tick.progressMode).toBe("tick");
    expect(tick.useResolutionPriority).toBe(false);
    expect(tick.useBallCards).toBe(false);
    expect(tick.initialLaneCards).toBe(5);

    const priority = withPreset("tickPriority");
    expect(priority.useResolutionPriority).toBe(true);
    expect(priority.useBallCards).toBe(false);
    expect(priority.initialLaneCards).toBe(5);

    const ball = withPreset("tickBall");
    expect(ball.useBallCards).toBe(true);
    expect(ball.initialLaneCards).toBe(5);
  });

  it("tickBallDeep は既定値と同じものを指す（採用案 A″）", () => {
    expect(withPreset("tickBallDeep")).toEqual(DEFAULT_BALANCE);
  });

  it("deck90 はカードを増やさずに同じ深さにする（案 A′）", () => {
    const a1 = withPreset("deck90");

    expect(createDeck(a1.deck)).toHaveLength(90);
    expect(a1.initialLaneCards).toBe(12);
    expect(a1.initialPendingCards).toBe(5);
    expect(a1.useBallCards).toBe(true);
  });
});

describe("withPreset", () => {
  it("プリセットを適用した Balance を返す", () => {
    expect(withPreset("lanes4").laneCount).toBe(4);
    expect(withPreset("roundDraw2").roundDrawCount).toBe(2);
  });

  it("元の DEFAULT_BALANCE を変更しない", () => {
    withPreset("lanes4");

    expect(DEFAULT_BALANCE.laneCount).toBe(3);
  });

  it("指定しなかった値は既定のまま残る", () => {
    const balance = withPreset("lanes4");

    expect(balance.maxRounds).toBe(DEFAULT_BALANCE.maxRounds);
    expect(balance.deck).toEqual(DEFAULT_BALANCE.deck);
  });

  it("複数のプリセットを重ねられる", () => {
    const balance = withPreset("lanes4", "noRoundDraw");

    expect(balance.laneCount).toBe(4);
    expect(balance.roundDrawCount).toBe(0);
  });

  it("後のプリセットが先のプリセットを上書きする", () => {
    expect(withPreset("roundDraw1", "roundDraw2").roundDrawCount).toBe(2);
  });

  it("プリセットを渡さなければ既定値を返す", () => {
    expect(withPreset()).toEqual(DEFAULT_BALANCE);
  });
});

describe("BALANCE_PRESETS（docs/spec.md §7 の検証項目）", () => {
  const names = Object.keys(BALANCE_PRESETS) as PresetName[];

  it("§7 の検証項目に対応するプリセットが揃っている", () => {
    expect(names).toEqual(
      expect.arrayContaining([
        "lanes4",
        "coin3Ratio25",
        "noRoundDraw",
        "pushFull",
        "pushPlusOne",
        "jackpotHalfCarryOver",
      ])
    );
  });

  it("どのプリセットを適用しても Balance として成立する", () => {
    for (const name of names) {
      const balance = withPreset(name);

      expect(balance.laneCount).toBeGreaterThan(0);
      expect(balance.initialLaneCards).toBeGreaterThan(0);
      expect(createDeck(balance.deck).length).toBeGreaterThan(0);
    }
  });

  describe("レーン本数（§7 次点）", () => {
    it("lanes4 はレーンを4本にする", () => {
      expect(withPreset("lanes4").laneCount).toBe(4);
    });
  });

  describe("3コイン札の比率（§7 次点）", () => {
    it("既定は3コイン札をコイン札の 15% 程度に抑えている", () => {
      const coins = createDeck(DEFAULT_BALANCE.deck).filter(isCoinCard);

      const ratio = coins.filter((c) => c.coins === 3).length / coins.length;
      expect(ratio).toBeCloseTo(0.15, 1);
    });

    it("総枚数は既定と変わらない", () => {
      expect(createDeck(withPreset("coin3Ratio25").deck)).toHaveLength(
        createDeck(DEFAULT_BALANCE.deck).length
      );
    });
  });

  describe("ラウンド収入の要否（§7 最優先）", () => {
    it("noRoundDraw はラウンド終了時のドローを行わない", () => {
      expect(withPreset("noRoundDraw").roundDrawCount).toBe(0);
    });
  });

  describe("押し込み枚数（§7 最優先）", () => {
    it("既定はコイン数 ÷ 2（切り上げ）", () => {
      expect(DEFAULT_BALANCE.pushCount(1)).toBe(1);
      expect(DEFAULT_BALANCE.pushCount(2)).toBe(1);
      expect(DEFAULT_BALANCE.pushCount(3)).toBe(2);
    });

    it("pushFull はコイン数そのままに戻す（#53 以前の既定）", () => {
      const { pushCount } = withPreset("pushFull");

      expect(pushCount(1)).toBe(1);
      expect(pushCount(2)).toBe(2);
      expect(pushCount(3)).toBe(3);
    });

    it("pushPlusOne はコイン数 + 1 に増やす", () => {
      const { pushCount } = withPreset("pushPlusOne");

      expect(pushCount(1)).toBe(2);
      expect(pushCount(3)).toBe(4);
    });
  });

  describe("ジャックポットの重さ（§7 次点）", () => {
    it("既定はプールを全獲得する", () => {
      expect(DEFAULT_BALANCE.jackpotPayoutRatio).toBe(1);
    });

    it("jackpotHalfCarryOver は半分だけ獲得する", () => {
      expect(withPreset("jackpotHalfCarryOver").jackpotPayoutRatio).toBe(0.5);
    });
  });

  describe("投入できるレーン数（#55）", () => {
    it("既定は1投入ラウンドにつき1レーン", () => {
      expect(DEFAULT_BALANCE.maxLanesPerRound).toBe(1);
    });

    it("multiLane は全レーンへ1枚ずつ投入できるようにする（#55 以前のルール）", () => {
      expect(withPreset("multiLane").maxLanesPerRound).toBe(DEFAULT_BALANCE.laneCount);
    });
  });

  describe("ラウンドのドロー枚数（#55）", () => {
    it("既定は3枚", () => {
      expect(DEFAULT_BALANCE.roundDrawCount).toBe(3);
    });

    it("roundDraw2 は #55 以前の2枚に戻す", () => {
      expect(withPreset("roundDraw2").roundDrawCount).toBe(2);
    });
  });
});

describe("部分上書き", () => {
  it("スプレッドで一部だけ差し替えられる", () => {
    const balance: Balance = { ...DEFAULT_BALANCE, laneCount: 6, maxRounds: 20 };

    expect(balance.laneCount).toBe(6);
    expect(balance.maxRounds).toBe(20);
    expect(balance.deck).toEqual(DEFAULT_BALANCE.deck);
  });

  it("デッキ構成の一部だけ差し替えられる", () => {
    const balance: Balance = {
      ...DEFAULT_BALANCE,
      deck: { ...DEFAULT_BALANCE.deck, coins: { 1: 10, 2: 10, 3: 10 } },
    };

    expect(createDeck(balance.deck).filter(isCoinCard)).toHaveLength(30);
    expect(balance.deck.events).toEqual(DEFAULT_BALANCE.deck.events);
  });
});

describe("プリセットがエンジンの挙動を変える", () => {
  it("lanes4 を適用するとレーンが4本になる", async () => {
    const { setupGame } = await import("./setup.js");
    const { createRng } = await import("./rng.js");

    expect(setupGame(["A", "B", "C"], createRng(1), withPreset("lanes4")).lanes).toHaveLength(4);
  });

  it("pushFull を適用すると押し込み枚数が増える", async () => {
    const { setupGame } = await import("./setup.js");
    const { createRng } = await import("./rng.js");
    const { resolvePush } = await import("./push.js");
    const { coin, faceDown } = await import("../test-utils/cards.js");

    const build = (balance: Balance) => {
      const base = setupGame(["A", "B", "C"], createRng(1), balance);
      return {
        ...base,
        lanes: base.lanes.map((lane, i) =>
          i === 0
            ? {
                ...lane,
                stock: [coin(1), coin(1), coin(1)],
                pending: faceDown([coin(1), coin(1), coin(1)]),
              }
            : lane
        ),
      };
    };

    // 3コイン札の投入: 既定は ceil(3/2) = 2枚、pushFull は3枚
    expect(resolvePush(build(DEFAULT_BALANCE), 0, 3).pushedCount).toBe(2);
    expect(resolvePush(build(withPreset("pushFull")), 0, 3).pushedCount).toBe(3);
  });

  it("jackpotHalfCarryOver を適用すると半分だけ獲得し残りが持ち越される", async () => {
    const { setupGame } = await import("./setup.js");
    const { createRng } = await import("./rng.js");
    const { rollJackpot } = await import("./jackpot.js");

    const alwaysSix = { rollD6: () => 6 };
    const build = (balance: Balance) => {
      const base = setupGame(["A", "B", "C"], createRng(1), balance);
      return {
        ...base,
        players: base.players.map((p) => ({ ...p, points: 0 })),
        jackpotPoints: 8,
        jackpotCounter: balance.jackpotThreshold,
      };
    };

    const full = rollJackpot(build(DEFAULT_BALANCE), alwaysSix);
    expect(full.wonPoints).toBe(8);
    expect(full.state.jackpotPoints).toBe(0);

    const half = rollJackpot(build(withPreset("jackpotHalfCarryOver")), alwaysSix);
    expect(half.wonPoints).toBe(4);
    expect(half.state.jackpotPoints).toBe(4);
  });

  it("handLimit7 を適用すると上限が 7 枚になる（既定は無制限）", () => {
    expect(DEFAULT_BALANCE.handLimit).toBeNull();
    expect(withPreset("handLimit7").handLimit).toBe(7);
  });
});
