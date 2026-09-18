import { useSyncExternalStore } from "react";

/** 描き直す間隔（ms）。秒の表示が滑らかに落ちる程度で足りる */
const TICK = 250;

/**
 * 卓で共有する表示用の時計。描き直しのたびに読み直さず、ここに1つだけ持つ。
 *
 * React は描画中に外の値を読むことを許さないので、読んだ時刻を控えておき、
 * 変わったことを購読者へ知らせる形にしている。
 */
let clock = Date.now();

function subscribe(onChange: () => void): () => void {
  clock = Date.now();
  const id = setInterval(() => {
    clock = Date.now();
    onChange();
  }, TICK);
  return () => clearInterval(id);
}

/** 購読しないときの空の登録口。時計は止まったままになる */
const idle = (): (() => void) => () => {};

const read = (): number => clock;

/**
 * いまの時刻。カウントダウンと解決の再生に使う。
 *
 * これは**表示のための時計**で、判定には使わない。締め切りの権威はサーバーの
 * `deadlineAt` にあり、端末の時計がずれていても締め切りの判定はずれない
 * （docs/realtime.md §8-2）。
 *
 * 要らないときは動かさない。手番制で遊んでいる間まで毎秒描き直す必要はない。
 */
export function useNow(active: boolean): number {
  return useSyncExternalStore(active ? subscribe : idle, read, read);
}
