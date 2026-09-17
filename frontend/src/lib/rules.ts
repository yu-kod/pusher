import type { SideHoleRule } from "./types";

const D6_MAX = 6;

/**
 * 横穴の条件を一行で言い直す（docs/spec.md §5）。
 *
 * ルールの判定はサーバーが持つ。ここでやるのは**サーバーが返した条件を読み上げること**
 * だけで、条件そのものを画面側で決めない。
 */
export function sideHoleHint({ minRoll, minTarget }: SideHoleRule): string {
  const rolls: number[] = [];
  for (let roll = minRoll; roll <= D6_MAX; roll++) {
    rolls.push(roll);
  }
  const faces = `出目 ${rolls.join("・")} は横穴`;

  // 下限が 1 なら目標値によらず起きるので、条件を添えない
  return minTarget <= 1 ? faces : `目標値${minTarget}以上なら${faces}`;
}
