/** 3x3 グリッドのセル番号。対になる位置から順に埋め、奇数の目は中央を足す */
const PAIRS = [
  [1, 9],
  [3, 7],
  [4, 6],
] as const;

/** 出目に対応するピップの位置（セル番号の昇順） */
export function pipCells(value: number): number[] {
  const pairs = PAIRS.slice(0, Math.floor(value / 2)).flatMap((pair) => [...pair]);
  const cells = value % 2 === 1 ? [...pairs, 5] : pairs;
  return cells.sort((a, b) => a - b);
}
