import { describe, expect, it } from "vitest";
import { DEFAULT_BALANCE, withPreset } from "../game/balance.js";
import { createRng } from "../game/rng.js";
import { expectedValueStrategy, randomStrategy } from "./strategy.js";
import { simulateGame, simulateMany, summarize } from "./runner.js";

const PLAYERS = 4;

describe("simulateGame", () => {
  it("ゲームが最後まで完走する", () => {
    const stats = simulateGame(DEFAULT_BALANCE, randomStrategy(), createRng(1), PLAYERS);

    expect(stats.finished).toBe(true);
    expect(stats.finalPoints).toHaveLength(PLAYERS);
  });

  it("ラウンド数が config.maxRounds を超えない（docs/spec.md §3）", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const stats = simulateGame(DEFAULT_BALANCE, randomStrategy(), createRng(seed), PLAYERS);

      expect(stats.rounds).toBeLessThanOrEqual(DEFAULT_BALANCE.maxRounds);
    }
  });

  it("手番と投入ラウンドが記録される", () => {
    const stats = simulateGame(DEFAULT_BALANCE, expectedValueStrategy(), createRng(2), PLAYERS);

    expect(stats.turns).toBeGreaterThan(0);
    expect(stats.insertionRounds).toBeGreaterThanOrEqual(stats.turns);
    expect(stats.insertedCards).toBeGreaterThanOrEqual(stats.insertionRounds);
  });

  it("同じシードなら同じ結果になる（再現性）", () => {
    const run = () =>
      simulateGame(DEFAULT_BALANCE, expectedValueStrategy(), createRng(42), PLAYERS);

    expect(run()).toEqual(run());
  });

  it("違うシードなら違う結果になる", () => {
    const a = simulateGame(DEFAULT_BALANCE, expectedValueStrategy(), createRng(1), PLAYERS);
    const b = simulateGame(DEFAULT_BALANCE, expectedValueStrategy(), createRng(2), PLAYERS);

    expect(a.finalPoints).not.toEqual(b.finalPoints);
  });

  it("勝者が1人以上いる（引き分けなら複数）", () => {
    const stats = simulateGame(DEFAULT_BALANCE, randomStrategy(), createRng(3), PLAYERS);

    expect(stats.winnerSeats.length).toBeGreaterThanOrEqual(1);
    expect(stats.winnerSeats.length).toBeLessThanOrEqual(PLAYERS);
  });

  it("3人でも回る（docs/spec.md 冒頭）", () => {
    expect(simulateGame(DEFAULT_BALANCE, randomStrategy(), createRng(5), 3).finished).toBe(true);
  });

  it("プリセットを差し替えて回せる", () => {
    const stats = simulateGame(
      withPreset("pushFull"),
      expectedValueStrategy(),
      createRng(1),
      PLAYERS
    );

    expect(stats.finished).toBe(true);
  });

  it("滞留の厚みを投入のたびに記録する（docs/spec.md §7）", () => {
    const stats = simulateGame(DEFAULT_BALANCE, expectedValueStrategy(), createRng(7), PLAYERS);

    expect(stats.pendingThickness).toHaveLength(stats.insertedCards);
    expect(stats.pendingThickness.every((n) => n >= 0)).toBe(true);
  });

  it("ドローを止めても完走する（手札が尽きる経路）", () => {
    const stats = simulateGame(
      withPreset("noRoundDraw"),
      expectedValueStrategy(),
      createRng(1),
      PLAYERS
    );

    expect(stats.finished).toBe(true);
  });
});

describe("summarize", () => {
  it("平均をまとめる", () => {
    const stats = [1, 2, 3].map((seed) =>
      simulateGame(DEFAULT_BALANCE, expectedValueStrategy(), createRng(seed), PLAYERS)
    );

    const summary = summarize(stats);

    expect(summary.games).toBe(3);
    expect(summary.avgRounds).toBeGreaterThan(0);
    expect(summary.avgInsertionRoundsPerTurn).toBeGreaterThanOrEqual(1);
    expect(summary.pointsPerInsertedCard).toBeGreaterThan(0);
    expect(summary.avgPendingThickness).toBeGreaterThanOrEqual(0);
  });

  it("バースト率は 0〜1 に収まる", () => {
    const stats = [1, 2].map((seed) =>
      simulateGame(DEFAULT_BALANCE, expectedValueStrategy(), createRng(seed), PLAYERS)
    );

    const summary = summarize(stats);

    expect(summary.bustRate).toBeGreaterThanOrEqual(0);
    expect(summary.bustRate).toBeLessThanOrEqual(1);
  });

  it("手番順ごとの勝率を出す。合計は 1 以上（引き分けを重複して数えるため）", () => {
    const stats = Array.from({ length: 10 }, (_, i) =>
      simulateGame(DEFAULT_BALANCE, expectedValueStrategy(), createRng(i + 1), PLAYERS)
    );

    const summary = summarize(stats);

    expect(summary.seatWinRates).toHaveLength(PLAYERS);
    // 引き分けは全員を勝者として数えるので合計は 1 以上。浮動小数の誤差を見込む
    expect(summary.seatWinRates.reduce((a, b) => a + b, 0)).toBeGreaterThan(0.99);
  });

  it("ゲームが 0 件でも壊れない", () => {
    const summary = summarize([]);

    expect(summary.games).toBe(0);
    expect(summary.avgRounds).toBe(0);
    expect(summary.pointsPerInsertedCard).toBe(0);
    expect(summary.seatWinRates).toEqual([]);
  });
});

describe("simulateMany", () => {
  it("指定回数ぶん回して集計する", () => {
    const summary = simulateMany(
      5,
      DEFAULT_BALANCE,
      expectedValueStrategy(),
      createRng(1),
      PLAYERS
    );

    expect(summary.games).toBe(5);
  });

  it("同じシードなら同じ集計になる", () => {
    const run = () =>
      simulateMany(3, DEFAULT_BALANCE, expectedValueStrategy(), createRng(9), PLAYERS);

    expect(run()).toEqual(run());
  });
});
