import { describe, expect, it } from "vitest";
import { fitScale } from "./fitScale";

describe("fitScale", () => {
  it("収まっているなら等倍のまま", () => {
    expect(fitScale(600, 400)).toBe(1);
  });

  it("ちょうど収まるなら等倍", () => {
    expect(fitScale(400, 400)).toBe(1);
  });

  it("入りきらないぶんだけ縮める", () => {
    expect(fitScale(300, 600)).toBe(0.5);
  });

  it("余っていても引き伸ばさない。卓が不自然に大きくなる", () => {
    expect(fitScale(2000, 400)).toBe(1);
  });

  it("縮めすぎない。読めない卓になるくらいなら、はみ出したほうがまし", () => {
    expect(fitScale(10, 1000)).toBeGreaterThanOrEqual(0.5);
  });

  it("測れていない間は等倍にしておく", () => {
    expect(fitScale(0, 400)).toBe(1);
    expect(fitScale(600, 0)).toBe(1);
  });
});
