import { describe, expect, it } from "vitest";
import { pipCells } from "./dice";

describe("pipCells", () => {
  it("出目ごとに、サイコロの面と同じ位置へピップを置く", () => {
    // 3x3 グリッドのセル番号（1が左上、5が中央、9が右下）
    expect(pipCells(1)).toEqual([5]);
    expect(pipCells(2)).toEqual([1, 9]);
    expect(pipCells(3)).toEqual([1, 5, 9]);
    expect(pipCells(4)).toEqual([1, 3, 7, 9]);
    expect(pipCells(5)).toEqual([1, 3, 5, 7, 9]);
    expect(pipCells(6)).toEqual([1, 3, 4, 6, 7, 9]);
  });
});
