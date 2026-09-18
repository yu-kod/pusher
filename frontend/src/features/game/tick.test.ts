import { describe, expect, it } from "vitest";
import { secondsLeft, stepAt } from "./tick";
import type { ResolutionStepView } from "../../lib/types";

describe("secondsLeft", () => {
  it("締め切りまでの残りを秒で返す", () => {
    expect(secondsLeft(10_000, 2_500)).toBe(8);
  });

  it("端数は切り上げる。残り0.1秒はまだ1秒として見せる", () => {
    expect(secondsLeft(10_000, 9_900)).toBe(1);
  });

  it("締め切りを過ぎたら0で止まる", () => {
    expect(secondsLeft(10_000, 12_000)).toBe(0);
  });

  it("ちょうど締め切りなら0", () => {
    expect(secondsLeft(10_000, 10_000)).toBe(0);
  });
});

const steps: ResolutionStepView[] = [
  {
    playerId: "a",
    laneIndex: 0,
    roll: 3,
    pushedCount: 2,
    droppedCount: 1,
    gainedPoints: 2,
    sideHole: false,
  },
  {
    playerId: "b",
    laneIndex: 1,
    roll: 6,
    pushedCount: 1,
    droppedCount: 0,
    gainedPoints: 0,
    sideHole: true,
  },
];

describe("stepAt", () => {
  it("解決が始まった瞬間は先頭のステップ", () => {
    expect(stepAt(steps, 0)).toBe(0);
  });

  it("1歩ぶんの時間が経つと次のステップへ進む", () => {
    expect(stepAt(steps, 1_800)).toBe(1);
  });

  it("盤面が同時に動かないよう、ステップはひとつずつしか進まない", () => {
    const seen = [0, 600, 1_200, 1_800, 2_400].map((ms) => stepAt(steps, ms));

    expect(seen).toEqual([0, 0, 1, 1, 2]);
  });

  it("最後まで再生しきったら、ステップ数そのものを返す", () => {
    expect(stepAt(steps, 99_999)).toBe(steps.length);
  });

  it("ステップが無ければ、最初から再生しきった状態", () => {
    expect(stepAt([], 0)).toBe(0);
  });
});
