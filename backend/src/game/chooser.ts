/**
 * イベントの選択を自動で決める既定の方針（docs/spec.md §6）。
 *
 * 「横穴開放」「投入口増設」は対象レーンを、「横穴開放」はさらに滞留から1枚を
 * プレイヤーに選ばせる。人間に選ばせる UI が要るのは #18 の責務なので、
 * ここでは**選ばなかった場合の既定**を用意する。
 *
 * CPU（#16）とシミュレーション（#49）も同じ方針を使う。
 */
import type { EventKind } from "./deck.js";
import type { EventChooser } from "./resolve.js";
import { cardPoints } from "./score.js";
import type { GameState } from "./setup.js";

export const autoEventChooser: EventChooser = {
  // 滞留が最も厚いレーンを選ぶ。開放すれば大きく、増設すれば以後2枚入れられる
  chooseLane(state: GameState, _event: EventKind): number {
    return state.lanes.reduce(
      (best, lane, index) =>
        lane.pending.length > best.thickness ? { index, thickness: lane.pending.length } : best,
      { index: 0, thickness: -1 }
    ).index;
  },

  // 公開された滞留から最も高いカードを選ぶ（§6 で表向きになっている）
  choosePending(state: GameState, laneIndex: number): number {
    const pending = state.lanes.flatMap((lane, index) => (index === laneIndex ? lane.pending : []));
    return pending.reduce(
      (best, p, index) =>
        cardPoints(p.card) > best.value ? { index, value: cardPoints(p.card) } : best,
      { index: 0, value: -1 }
    ).index;
  },
};
