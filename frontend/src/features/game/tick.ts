/**
 * 3拍の進行（docs/realtime.md §8-1）を画面に出すための純粋な計算。
 *
 * **拍の切り替えも、締め切りも、解決の中身も決めない。** それはサーバーが持つ。
 * ここでやるのは、届いた時刻とステップ列を「いま何秒／いま何歩目」に直すことだけ。
 */
import type { ResolutionStepView } from "../../lib/types";

/** 解決1歩ぶんを見せる時間（ms）。盤面が1人ずつしか動かないための間 */
const STEP_DURATION = 1_200;

/**
 * 締め切りまでの残り秒。
 *
 * 権威はサーバーの `deadlineAt` なので、端末の時計がずれていても締め切りの判定はずれない。
 * ここで出すのはカウントダウンの表示だけ（§8-2）。
 */
export function secondsLeft(deadlineAt: number, now: number): number {
  return Math.max(0, Math.ceil((deadlineAt - now) / 1_000));
}

/**
 * いま何歩目まで再生したか。返すのは「次に動く人の添字」。
 *
 * 全員ぶんの解決は1つのスナップショットで届いている（§8-5）。それを先頭から
 * 1歩ずつ進めることで、**盤面が同時に動く瞬間を作らない**。
 * 再生しきると `steps.length` を返す。
 */
export function stepAt(steps: readonly ResolutionStepView[], elapsed: number): number {
  return Math.min(steps.length, Math.floor(elapsed / STEP_DURATION));
}
