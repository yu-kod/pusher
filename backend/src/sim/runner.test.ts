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

  it("1投入ラウンドで使ったレーン数を記録する（docs/spec.md §7）", () => {
    const stats = simulateGame(DEFAULT_BALANCE, expectedValueStrategy(), createRng(4), PLAYERS);

    expect(stats.lanesPerInsertion).toHaveLength(stats.insertionRounds);
    expect(
      stats.lanesPerInsertion.every((n) => n >= 1 && n <= DEFAULT_BALANCE.maxLanesPerRound)
    ).toBe(true);
  });

  it("手番の終わり方を「自分でやめた」と「続けられなかった」に分けて数える", () => {
    const stats = simulateGame(DEFAULT_BALANCE, expectedValueStrategy(), createRng(4), PLAYERS);

    expect(stats.voluntaryStops + stats.forcedStops).toBe(stats.turns);
  });

  it("手番制でも、手札が尽きて1枚も投入できない手番があれば数える", () => {
    // ドローを止めると手札はいつか尽きる。投入する前に終わる手番も「続けられなかった」
    const stats = simulateGame(
      withPreset("v02", "noRoundDraw"),
      expectedValueStrategy(),
      createRng(1),
      PLAYERS
    );

    expect(stats.forcedStops).toBeGreaterThan(0);
    expect(stats.voluntaryStops + stats.forcedStops).toBe(stats.turns);
  });

  it("ランダム戦略は自分でやめる判断をする", () => {
    const stats = simulateGame(DEFAULT_BALANCE, randomStrategy(), createRng(4), PLAYERS);

    expect(stats.voluntaryStops).toBeGreaterThan(0);
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

describe("判断が発生しているかの指標（docs/spec.md §7 / #56）", () => {
  it("1投入ラウンドあたりの平均レーン数を出す", () => {
    const summary = simulateMany(
      5,
      DEFAULT_BALANCE,
      expectedValueStrategy(),
      createRng(1),
      PLAYERS
    );

    expect(summary.avgLanesPerInsertion).toBeGreaterThanOrEqual(1);
    expect(summary.avgLanesPerInsertion).toBeLessThanOrEqual(DEFAULT_BALANCE.maxLanesPerRound);
  });

  it("やめた時点の未確定得点を記録する（docs/spec.md §7 の引き際）", () => {
    const stats = simulateGame(DEFAULT_BALANCE, expectedValueStrategy(), createRng(4), PLAYERS);

    expect(stats.stopPoints).toHaveLength(stats.voluntaryStops);
    expect(stats.stopPoints.every((n) => n >= 0)).toBe(true);
  });

  it("自分でやめた手番の割合を出す", () => {
    const summary = simulateMany(5, DEFAULT_BALANCE, randomStrategy(), createRng(1), PLAYERS);

    expect(summary.voluntaryStopRate).toBeGreaterThan(0);
    expect(summary.voluntaryStopRate).toBeLessThanOrEqual(1);
  });

  it("やめた時点の未確定得点の平均を出す", () => {
    const summary = simulateMany(
      5,
      DEFAULT_BALANCE,
      expectedValueStrategy(),
      createRng(1),
      PLAYERS
    );

    expect(summary.avgStopPoints).toBeGreaterThan(0);
  });

  it("ゲームが 0 件でも壊れない", () => {
    const summary = summarize([]);

    expect(summary.avgLanesPerInsertion).toBe(0);
    expect(summary.voluntaryStopRate).toBe(0);
    expect(summary.avgStopPoints).toBe(0);
  });
});

describe("ティック同時進行（docs/turn-structure.md §4-1）", () => {
  const tick = withPreset("tickMode");

  it("同時進行でも完走する", () => {
    const stats = simulateGame(tick, expectedValueStrategy(), createRng(1), PLAYERS);

    expect(stats.finished).toBe(true);
    expect(stats.rounds).toBeLessThanOrEqual(tick.maxRounds);
  });

  it("3人でも回る", () => {
    expect(simulateGame(tick, randomStrategy(), createRng(5), 3).finished).toBe(true);
  });

  it("ティック数を数える。手番制では 0 のまま", () => {
    const simultaneous = simulateGame(tick, expectedValueStrategy(), createRng(2), PLAYERS);
    const sequential = simulateGame(
      withPreset("v02"),
      expectedValueStrategy(),
      createRng(2),
      PLAYERS
    );

    expect(simultaneous.ticks).toBeGreaterThan(0);
    expect(sequential.ticks).toBe(0);
    expect(sequential.sameLaneTicks).toBe(0);
  });

  it("1ティックで複数人が解決するので、ティック数は投入ラウンド数より少ない", () => {
    const stats = simulateGame(tick, expectedValueStrategy(), createRng(3), PLAYERS);

    expect(stats.ticks).toBeLessThan(stats.insertionRounds);
  });

  it("同じレーンの取り合いが起きる（§4-5）", () => {
    const stats = simulateGame(tick, expectedValueStrategy(), createRng(3), PLAYERS);

    expect(stats.sameLaneTicks).toBeGreaterThan(0);
    expect(stats.sameLaneTicks).toBeLessThanOrEqual(stats.ticks);
  });

  it("全員がラウンドごとにちょうど1回だけ降りる", () => {
    const stats = simulateGame(tick, expectedValueStrategy(), createRng(4), PLAYERS);

    expect(stats.voluntaryStops + stats.forcedStops).toBe(stats.turns);
    expect(stats.turns).toBe(stats.rounds * PLAYERS);
  });

  it("手札が尽きて誰も投入できないラウンドがあっても完走する", () => {
    const stats = simulateGame(
      withPreset("tickMode", "noRoundDraw"),
      expectedValueStrategy(),
      createRng(1),
      PLAYERS
    );

    expect(stats.finished).toBe(true);
  });

  it("未確定得点はプレイヤーごとなので、得点が入るのは降りた人だけ（#88）", () => {
    const stats = simulateGame(tick, expectedValueStrategy(), createRng(6), PLAYERS);

    expect(stats.finalPoints).toHaveLength(PLAYERS);
    expect(stats.finalPoints.some((p) => p > 0)).toBe(true);
  });

  it("同じシードなら同じ結果になる（再現性）", () => {
    const run = () => simulateGame(tick, expectedValueStrategy(), createRng(42), PLAYERS);

    expect(run()).toEqual(run());
  });

  it("1ゲームあたりのティック数と取り合いの割合を集計する", () => {
    const summary = simulateMany(5, tick, expectedValueStrategy(), createRng(1), PLAYERS);

    expect(summary.avgTicksPerGame).toBeGreaterThan(0);
    expect(summary.sameLaneRate).toBeGreaterThan(0);
    expect(summary.sameLaneRate).toBeLessThanOrEqual(1);
  });

  it("ゲームが 0 件でも壊れない", () => {
    const summary = summarize([]);

    expect(summary.avgTicksPerGame).toBe(0);
    expect(summary.sameLaneRate).toBe(0);
  });
});

describe("先行権（docs/turn-structure.md §4-2 / #98）", () => {
  const priority = withPreset("tickPriority");

  it("先行権つきでも完走する", () => {
    const stats = simulateGame(priority, expectedValueStrategy(), createRng(1), PLAYERS);

    expect(stats.finished).toBe(true);
  });

  it("3人でも回る", () => {
    expect(simulateGame(priority, randomStrategy(), createRng(5), 3).finished).toBe(true);
  });

  it("全員がラウンドごとにちょうど1回だけ降りる（先行権の材料が揃う）", () => {
    const stats = simulateGame(priority, expectedValueStrategy(), createRng(4), PLAYERS);

    expect(stats.voluntaryStops + stats.forcedStops).toBe(stats.turns);
    expect(stats.turns).toBe(stats.rounds * PLAYERS);
  });

  it("解決順が変わるので、席順のままの同時進行とは違う結果になる", () => {
    const withPriority = simulateGame(priority, expectedValueStrategy(), createRng(3), PLAYERS);
    const bySeat = simulateGame(
      withPreset("tickMode"),
      expectedValueStrategy(),
      createRng(3),
      PLAYERS
    );

    expect(withPriority.finalPoints).not.toEqual(bySeat.finalPoints);
  });

  it("手札が尽きるほうへ寄せても完走する", () => {
    const stats = simulateGame(
      withPreset("tickPriority", "noRoundDraw"),
      expectedValueStrategy(),
      createRng(1),
      PLAYERS
    );

    expect(stats.finished).toBe(true);
  });

  it("同じシードなら同じ結果になる（再現性）", () => {
    const run = () => simulateGame(priority, expectedValueStrategy(), createRng(42), PLAYERS);

    expect(run()).toEqual(run());
  });
});

describe("ボール札（docs/turn-structure.md §4-3 / #100）", () => {
  const ball = withPreset("tickBall");

  it("本命案の3点セットで完走する", () => {
    const stats = simulateGame(ball, expectedValueStrategy(), createRng(1), PLAYERS);

    expect(stats.finished).toBe(true);
  });

  it("3人でも回る", () => {
    expect(simulateGame(ball, randomStrategy(), createRng(5), 3).finished).toBe(true);
  });

  it("ボール札が落ちる。使わない設定では 0 のまま", () => {
    const withBall = simulateGame(ball, expectedValueStrategy(), createRng(2), PLAYERS);
    const without = simulateGame(
      withPreset("tickPriority"),
      expectedValueStrategy(),
      createRng(2),
      PLAYERS
    );

    expect(withBall.ballDrops).toBeGreaterThan(0);
    expect(without.ballDrops).toBe(0);
  });

  it("ボール札はレーンから消えない。何度落ちても場には常にレーン数ぶんある", () => {
    // 落ちる経路は押し出しと「もう1枚落とす」（§6-3）の2つ。片方でも入れ直しを
    // 忘れるとレーンから静かに消え、そのレーンを狙う理由だけが失われる
    for (let seed = 1; seed <= 20; seed++) {
      const stats = simulateGame(ball, expectedValueStrategy(), createRng(seed), PLAYERS);

      expect(stats.finalBallCount).toBe(DEFAULT_BALANCE.laneCount);
      expect(stats.ballDrops).toBeGreaterThan(0);
    }
  });

  it("ボール札を使わない設定では場に1枚も無い", () => {
    const stats = simulateGame(
      withPreset("tickPriority"),
      expectedValueStrategy(),
      createRng(2),
      PLAYERS
    );

    expect(stats.finalBallCount).toBe(0);
  });

  it("手番制でもボール札だけ足せる", () => {
    const stats = simulateGame(
      withPreset("ballCards"),
      expectedValueStrategy(),
      createRng(1),
      PLAYERS
    );

    expect(stats.finished).toBe(true);
    expect(stats.ballDrops).toBeGreaterThan(0);
  });

  it("落下回数とレーンの厚みを集計する", () => {
    const summary = simulateMany(20, ball, expectedValueStrategy(), createRng(1), PLAYERS);
    const without = simulateMany(
      20,
      withPreset("tickPriority"),
      expectedValueStrategy(),
      createRng(1),
      PLAYERS
    );

    expect(summary.avgBallDrops).toBeGreaterThan(0);
    // レーンは「もう1枚落とす」（§6-3）で少しずつ薄くなる。補充はしない（§4-3）ので
    // 終了時は初期値より薄い。ボール札は入れ直すぶん、その1枚だけ厚い側に出る
    expect(summary.avgFinalLaneStock).toBeGreaterThan(without.avgFinalLaneStock);
  });

  it("ゲームが 0 件でも壊れない", () => {
    const summary = summarize([]);

    expect(summary.avgBallDrops).toBe(0);
    expect(summary.avgFinalLaneStock).toBe(0);
  });

  it("同じシードなら同じ結果になる（再現性）", () => {
    const run = () => simulateGame(ball, expectedValueStrategy(), createRng(42), PLAYERS);

    expect(run()).toEqual(run());
  });
});

describe("採用案 A''（docs/turn-structure.md §9）", () => {
  const adopted = withPreset("tickBallDeep");

  it("完走する", () => {
    expect(simulateGame(adopted, expectedValueStrategy(), createRng(1), PLAYERS).finished).toBe(
      true
    );
  });

  it("3人でも回る", () => {
    expect(simulateGame(adopted, randomStrategy(), createRng(5), 3).finished).toBe(true);
  });

  it("ボール札が「大物」になる。現行のレーンの深さより落下が減る", () => {
    const deep = simulateMany(50, adopted, expectedValueStrategy(), createRng(11), PLAYERS);
    const shallow = simulateMany(
      50,
      withPreset("tickBall"),
      expectedValueStrategy(),
      createRng(11),
      PLAYERS
    );

    expect(deep.avgBallDrops).toBeLessThan(shallow.avgBallDrops / 2);
  });

  it("押し引きの判断は生きたまま（目標 0.3 以上）", () => {
    const summary = simulateMany(50, adopted, expectedValueStrategy(), createRng(11), PLAYERS);

    expect(summary.voluntaryStopRate).toBeGreaterThan(0.3);
  });
});
