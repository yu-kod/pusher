import type { Rng } from "../game/rng.js";

/**
 * 出目を並べて返す決定的な Rng。
 *
 * エンジンは乱数を引数で受け取るので、テストでは出目を直接指定できる。
 * 用意した出目を使い切ったら例外を投げる（想定より多く振っていることに気づけるように）。
 */
export function scriptedRng(rolls: readonly number[]): Rng {
  let index = 0;
  return {
    nextInt: () => 0,
    shuffle: (items) => [...items],
    rollD6: () => {
      const roll = rolls[index++];
      if (roll === undefined) throw new Error("出目を使い切った");
      return roll;
    },
  };
}
