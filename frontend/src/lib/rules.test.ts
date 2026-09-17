import { describe, expect, it } from "vitest";
import { sideHoleHint } from "./rules";

describe("sideHoleHint", () => {
  it("目標値の下限が無ければ、横穴になる出目だけを伝える", () => {
    expect(sideHoleHint({ minRoll: 6, minTarget: 1 })).toBe("出目 6 は横穴");
  });

  it("出目の下限が下がれば、横穴になる出目を並べる", () => {
    expect(sideHoleHint({ minRoll: 5, minTarget: 1 })).toBe("出目 5・6 は横穴");
  });

  it("目標値の下限があれば、条件も添える", () => {
    expect(sideHoleHint({ minRoll: 6, minTarget: 6 })).toBe("目標値6以上なら出目 6 は横穴");
  });
});
