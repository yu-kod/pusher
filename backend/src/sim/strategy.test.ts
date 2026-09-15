import { describe, expect, it } from "vitest";
import { coin, faceDown } from "../test-utils/cards.js";
import { DEFAULT_BALANCE, withPreset } from "../game/balance.js";
import { createRng } from "../game/rng.js";
import { setupGame, type GameState, type Lane } from "../game/setup.js";
import { expectedValueStrategy, randomStrategy } from "./strategy.js";

function buildState(
  hand: readonly (1 | 2 | 3)[],
  lanes: readonly Partial<Lane>[] = [{}, {}, {}],
  overrides?: Partial<GameState>
): GameState {
  const base = setupGame(["A", "B", "C"], createRng(1), DEFAULT_BALANCE);
  return {
    ...base,
    players: base.players.map((p, i) => ({
      ...p,
      hand: i === 0 ? hand.map((c) => coin(c)) : [],
      points: 0,
    })),
    lanes: base.lanes.map((lane, i) => ({
      ...lane,
      stock: [coin(1), coin(1), coin(1), coin(1), coin(1)],
      pending: [],
      hasExtraSlot: false,
      ...lanes[i],
    })),
    pendingPoints: 0,
    ...overrides,
  };
}

describe("randomStrategy", () => {
  const strategy = randomStrategy();

  it("投入可能なレーン数の範囲に収まる", () => {
    const rng = createRng(7);
    const state = buildState([1, 2, 3]);

    for (let i = 0; i < 50; i++) {
      const insertions = strategy.chooseInsertions(state, rng);

      expect(insertions.length).toBeGreaterThanOrEqual(1);
      expect(insertions.length).toBeLessThanOrEqual(DEFAULT_BALANCE.maxLanesPerRound);
    }
  });

  it("同じレーン・同じ手札を二重に指定しない", () => {
    const rng = createRng(3);
    const state = buildState([1, 2, 3]);

    for (let i = 0; i < 50; i++) {
      const insertions = strategy.chooseInsertions(state, rng);
      const lanes = insertions.map((x) => x.laneIndex);
      const hands = insertions.flatMap((x) => x.handIndexes);

      expect(new Set(lanes).size).toBe(lanes.length);
      expect(new Set(hands).size).toBe(hands.length);
    }
  });

  it("手札の枚数を超えて投入しない", () => {
    const rng = createRng(11);
    const state = buildState([2]);

    for (let i = 0; i < 20; i++) {
      expect(strategy.chooseInsertions(state, rng)).toHaveLength(1);
    }
  });

  it("手札が空なら投入しない", () => {
    expect(strategy.chooseInsertions(buildState([]), createRng(1))).toEqual([]);
  });

  it("config.maxLanesPerRound を守る", () => {
    const rng = createRng(5);
    const base = buildState([1, 2, 3]);
    const state = { ...base, config: withPreset("singleLane") };

    for (let i = 0; i < 20; i++) {
      expect(strategy.chooseInsertions(state, rng)).toHaveLength(1);
    }
  });

  it("続けるかどうかをランダムに決める", () => {
    const rng = createRng(2);
    const state = buildState([1, 2, 3]);
    const results = Array.from({ length: 40 }, () => strategy.shouldContinue(state, rng));

    expect(new Set(results).size).toBe(2);
  });
});

describe("expectedValueStrategy", () => {
  const strategy = expectedValueStrategy();

  it("未確定得点が 0 なら必ず投入する（パスはできない・docs/spec.md §3）", () => {
    const state = buildState([1, 2, 3], [{}, {}, {}], { pendingPoints: 0 });

    expect(strategy.chooseInsertions(state, createRng(1)).length).toBeGreaterThanOrEqual(1);
  });

  it("未確定得点が積み上がるほど投入レーン数を絞る（docs/spec.md §3）", () => {
    // 滞留5枚のレーンに1コイン札 → 目標値6。出目6 が横穴になる
    const risky = { pending: faceDown([coin(1), coin(1), coin(1), coin(1), coin(1)]) };
    const lanes = [risky, risky, risky];

    const few = strategy.chooseInsertions(
      buildState([1, 1, 1], lanes, { pendingPoints: 2 }),
      createRng(1)
    );
    const many = strategy.chooseInsertions(
      buildState([1, 1, 1], lanes, { pendingPoints: 60 }),
      createRng(1)
    );

    expect(many.length).toBeLessThan(few.length);
  });

  it("横穴のないレーン（目標値6未満）ならいくら積んでも投入し続けられる", () => {
    // 滞留なしに1コイン札 → 目標値1。出目6でも横穴にならない
    const state = buildState([1, 1, 1], [{}, {}, {}], { pendingPoints: 100 });

    expect(strategy.chooseInsertions(state, createRng(1)).length).toBeGreaterThanOrEqual(1);
  });

  it("手札が空なら投入しない", () => {
    expect(strategy.chooseInsertions(buildState([]), createRng(1))).toEqual([]);
  });

  it("投入するレーンは重複しない", () => {
    const insertions = strategy.chooseInsertions(buildState([3, 3, 3]), createRng(1));
    const lanes = insertions.map((x) => x.laneIndex);

    expect(new Set(lanes).size).toBe(lanes.length);
  });

  it("未確定得点を抱えすぎたら引く（docs/spec.md §3）", () => {
    const risky = { pending: faceDown([coin(1), coin(1), coin(1), coin(1), coin(1)]) };
    const state = buildState([1, 1, 1], [risky, risky, risky], { pendingPoints: 500 });

    expect(strategy.shouldContinue(state, createRng(1))).toBe(false);
  });

  it("引き際でなければ続ける", () => {
    const state = buildState([1, 1, 1], [{}, {}, {}], { pendingPoints: 3 });

    expect(strategy.shouldContinue(state, createRng(1))).toBe(true);
  });
});

describe("EventChooser としての振る舞い", () => {
  it.each([
    ["randomStrategy", randomStrategy()],
    ["expectedValueStrategy", expectedValueStrategy()],
  ])("%s は存在するレーンを選ぶ", (_name, strategy) => {
    const state = buildState([1]);

    const laneIndex = strategy.chooseLane(state, "openLane");

    expect(laneIndex).toBeGreaterThanOrEqual(0);
    expect(laneIndex).toBeLessThan(state.lanes.length);
  });

  it.each([
    ["randomStrategy", randomStrategy()],
    ["expectedValueStrategy", expectedValueStrategy()],
  ])("%s は滞留の範囲内を選ぶ", (_name, strategy) => {
    const state = buildState([1], [{ pending: faceDown([coin(1), coin(3), coin(2)]) }, {}, {}]);

    const pickIndex = strategy.choosePending(state, 0);

    expect(pickIndex).toBeGreaterThanOrEqual(0);
    expect(pickIndex).toBeLessThan(3);
  });

  it("expectedValueStrategy は最も滞留が厚いレーンを選ぶ", () => {
    const state = buildState(
      [1],
      [{ pending: faceDown([coin(1)]) }, { pending: faceDown([coin(1), coin(1), coin(1)]) }, {}]
    );

    expect(expectedValueStrategy().chooseLane(state, "openLane")).toBe(1);
  });

  it("expectedValueStrategy は公開された滞留から最も高いカードを選ぶ", () => {
    const state = buildState([1], [{ pending: faceDown([coin(1), coin(3), coin(2)]) }, {}, {}]);

    expect(expectedValueStrategy().choosePending(state, 0)).toBe(1);
  });

  it("滞留が空のレーンでも choosePending が壊れない", () => {
    expect(expectedValueStrategy().choosePending(buildState([1]), 0)).toBe(0);
  });
});
