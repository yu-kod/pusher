import { describe, expect, it } from "vitest";
import { scriptedRng } from "../test-utils/rng.js";
import { createRng } from "./rng.js";
import { DEFAULT_BALANCE, withPreset } from "./balance.js";
import { setupGame, type GameState } from "./setup.js";
import { applySideHole, canRollJackpot, rollJackpot, settleJackpotAtGameEnd } from "./jackpot.js";
import { splitOverrides, withPendingPoints, type StateOverrides } from "../test-utils/state.js";
import { pendingPointsOf } from "./push.js";

function buildState(overrides?: StateOverrides): GameState {
  const { pendingPoints, rest } = splitOverrides(overrides);
  const base = setupGame(["A", "B", "C"], createRng(1), DEFAULT_BALANCE);
  return withPendingPoints(
    {
      ...base,
      players: base.players.map((p) => ({ ...p, hand: [], points: 0 })),
      jackpotPoints: 0,
      jackpotCounter: 0,
      ...rest,
    },
    pendingPoints
  );
}

describe("applySideHole", () => {
  it("未確定得点を獲得者ではなくジャックポットへ移す（docs/spec.md §3 §5）", () => {
    const state = buildState({ pendingPoints: 5 });

    const next = applySideHole(state);

    expect(next.jackpotPoints).toBe(5);
    expect(pendingPointsOf(next)).toBe(0);
    expect(next.players[0]?.points).toBe(0);
  });

  it("既存のジャックポットに積み増す", () => {
    const state = buildState({ jackpotPoints: 4, pendingPoints: 3 });

    expect(applySideHole(state).jackpotPoints).toBe(7);
  });

  it("確定済みの得点は失われない（docs/spec.md §3）", () => {
    const base = buildState({ pendingPoints: 5 });
    const state = { ...base, players: base.players.map((p) => ({ ...p, points: 8 })) };

    expect(applySideHole(state).players[0]?.points).toBe(8);
  });

  it("カウンターを1つ進める（docs/spec.md §5）", () => {
    expect(applySideHole(buildState({ jackpotCounter: 2 })).jackpotCounter).toBe(3);
  });

  it("カウンターは 5 で頭打ちになる（docs/spec.md §5）", () => {
    expect(applySideHole(buildState({ jackpotCounter: 5 })).jackpotCounter).toBe(5);
  });

  it("最後に横穴を出したプレイヤーを記録する", () => {
    const state = { ...buildState(), currentPlayerIndex: 1 };

    expect(applySideHole(state).lastSideHolePlayerId).toBe(state.players[1]?.id);
  });

  it("元の状態を変更しない", () => {
    const state = buildState({ jackpotCounter: 1, pendingPoints: 3 });

    applySideHole(state);

    expect(state.jackpotCounter).toBe(1);
    expect(pendingPointsOf(state)).toBe(3);
    expect(state.jackpotPoints).toBe(0);
  });

  it("手番プレイヤーの添字が範囲外なら例外を投げる", () => {
    const state = { ...buildState(), currentPlayerIndex: 99 };

    expect(() => applySideHole(state)).toThrow(RangeError);
  });
});

describe("canRollJackpot", () => {
  it("カウンターが 5 に達したら判定できる（docs/spec.md §5）", () => {
    expect(canRollJackpot(buildState({ jackpotCounter: 5 }))).toBe(true);
  });

  it("カウンターが 5 未満なら判定できない", () => {
    expect(canRollJackpot(buildState({ jackpotCounter: 4 }))).toBe(false);
  });
});

describe("rollJackpot", () => {
  it("6 が出たらジャックポットの点数を全獲得する（docs/spec.md §5）", () => {
    const state = buildState({ jackpotCounter: 5, jackpotPoints: 12 });

    const result = rollJackpot(state, scriptedRng([6]));

    expect(result.won).toBe(true);
    expect(result.wonPoints).toBe(12);
    expect(result.state.players[0]?.points).toBe(12);
    expect(result.state.jackpotPoints).toBe(0);
  });

  it("当選したらカウンターを 0 に戻す（docs/spec.md ルール解釈メモ）", () => {
    const state = buildState({ jackpotCounter: 5, jackpotPoints: 3 });

    expect(rollJackpot(state, scriptedRng([6])).state.jackpotCounter).toBe(0);
  });

  it("6 以外なら外れる", () => {
    const state = buildState({ jackpotCounter: 5, jackpotPoints: 3 });

    const result = rollJackpot(state, scriptedRng([5]));

    expect(result.won).toBe(false);
    expect(result.wonPoints).toBe(0);
    expect(result.state.players[0]?.points).toBe(0);
    expect(result.state.jackpotPoints).toBe(3);
  });

  it("外れてもカウンターは 5 のまま据え置く（docs/spec.md §5）", () => {
    const state = buildState({ jackpotCounter: 5, jackpotPoints: 3 });

    expect(rollJackpot(state, scriptedRng([1])).state.jackpotCounter).toBe(5);
  });

  it("出目を返す", () => {
    expect(rollJackpot(buildState(), scriptedRng([4])).roll).toBe(4);
  });

  it("手番プレイヤーが獲得する", () => {
    const state = { ...buildState({ jackpotPoints: 3 }), currentPlayerIndex: 2 };

    const result = rollJackpot(state, scriptedRng([6]));

    expect(result.state.players[2]?.points).toBe(3);
    expect(result.state.players[0]?.points).toBe(0);
  });

  it("ジャックポットが 0 でも当選処理が壊れない", () => {
    const result = rollJackpot(buildState({ jackpotCounter: 5 }), scriptedRng([6]));

    expect(result.won).toBe(true);
    expect(result.wonPoints).toBe(0);
  });

  it("元の状態を変更しない", () => {
    const state = buildState({ jackpotCounter: 5, jackpotPoints: 3 });

    rollJackpot(state, scriptedRng([6]));

    expect(state.jackpotPoints).toBe(3);
    expect(state.jackpotCounter).toBe(5);
  });

  it("手番プレイヤーの添字が範囲外なら例外を投げる", () => {
    const state = { ...buildState(), currentPlayerIndex: 99 };

    expect(() => rollJackpot(state, scriptedRng([6]))).toThrow(RangeError);
  });
});

describe("再判定の流れ（docs/spec.md §5）", () => {
  it("外れたあと、次の横穴でまた JP判定できる", () => {
    const rng = scriptedRng([1, 6]);
    let state = buildState({ jackpotCounter: 4, jackpotPoints: 3, pendingPoints: 1 });

    // 1回目の横穴でカウンターが 5 に達し、JP判定に外れる
    state = applySideHole(state);
    expect(state.jackpotCounter).toBe(5);
    const first = rollJackpot(state, rng);
    expect(first.won).toBe(false);

    // 2回目の横穴。カウンターは 5 で頭打ちのまま、再判定して当たる
    state = applySideHole(withPendingPoints(first.state, 2));
    expect(state.jackpotCounter).toBe(5);
    const second = rollJackpot(state, rng);
    expect(second.won).toBe(true);
    expect(second.wonPoints).toBe(6);
  });
});

describe("settleJackpotAtGameEnd", () => {
  it("既定では、カウンターが 5 でも誰も獲得せず流れる（docs/spec.md §5 / #68）", () => {
    const base = buildState({ jackpotCounter: 5, jackpotPoints: 5 });
    const state = { ...base, lastSideHolePlayerId: base.players[1]?.id ?? null };

    const next = settleJackpotAtGameEnd(state);

    expect(next.players.every((p) => p.points === 0)).toBe(true);
    expect(next.jackpotPoints).toBe(0);
  });

  it("払い出す設定なら、最後に横穴を出したプレイヤーが獲得する（#68 以前の既定）", () => {
    const base = buildState({
      jackpotCounter: 5,
      jackpotPoints: 5,
      config: withPreset("payUnpaidJackpot"),
    });
    const state = { ...base, lastSideHolePlayerId: base.players[1]?.id ?? null };

    const next = settleJackpotAtGameEnd(state);

    expect(next.players[1]?.points).toBe(5);
    expect(next.jackpotPoints).toBe(0);
  });

  it("払い出す設定でも、カウンターが 5 未満なら流れる（docs/spec.md §5）", () => {
    const base = buildState({
      jackpotCounter: 4,
      jackpotPoints: 3,
      config: withPreset("payUnpaidJackpot"),
    });
    const state = { ...base, lastSideHolePlayerId: base.players[1]?.id ?? null };

    expect(settleJackpotAtGameEnd(state).players.every((p) => p.points === 0)).toBe(true);
  });

  it("払い出す設定でも、横穴を出した人がいなければ流れる", () => {
    const state = buildState({
      jackpotCounter: 5,
      jackpotPoints: 3,
      config: withPreset("payUnpaidJackpot"),
    });

    expect(settleJackpotAtGameEnd(state).players.every((p) => p.points === 0)).toBe(true);
  });

  it("カウンターが 5 未満なら誰も獲得せず流れる（docs/spec.md §5）", () => {
    const base = buildState({ jackpotCounter: 4, jackpotPoints: 3 });
    const state = { ...base, lastSideHolePlayerId: base.players[1]?.id ?? null };

    const next = settleJackpotAtGameEnd(state);

    expect(next.players.every((p) => p.points === 0)).toBe(true);
    expect(next.jackpotPoints).toBe(0);
  });

  it("カウンターが 5 でも横穴を出した人がいなければ流れる", () => {
    const state = buildState({ jackpotCounter: 5, jackpotPoints: 3 });

    const next = settleJackpotAtGameEnd(state);

    expect(next.players.every((p) => p.points === 0)).toBe(true);
    expect(next.jackpotPoints).toBe(0);
  });

  it("ジャックポットが 0 なら何も起きない", () => {
    const base = buildState({ jackpotCounter: 5 });
    const state = { ...base, lastSideHolePlayerId: base.players[0]?.id ?? null };

    expect(settleJackpotAtGameEnd(state).players[0]?.points).toBe(0);
  });

  it("記録されたプレイヤーが見つからなければ流れる", () => {
    const state = {
      ...buildState({ jackpotCounter: 5, jackpotPoints: 3 }),
      lastSideHolePlayerId: "missing",
    };

    const next = settleJackpotAtGameEnd(state);

    expect(next.players.every((p) => p.points === 0)).toBe(true);
    expect(next.jackpotPoints).toBe(0);
  });

  it("元の状態を変更しない", () => {
    const base = buildState({ jackpotCounter: 5, jackpotPoints: 3 });
    const state = { ...base, lastSideHolePlayerId: base.players[0]?.id ?? null };

    settleJackpotAtGameEnd(state);

    expect(state.jackpotPoints).toBe(3);
  });
});
