/**
 * 先行権（`docs/turn-structure.md` §4-2）。
 *
 * **前のラウンドで早く降りた順が、次のラウンドの解決順になる。**
 *
 * 順番が席で決まるものから、**プレイヤーが点を諦めて買うもの**に変わる。これで
 * spec §3 の「スタートプレイヤーをラウンドごとに左隣へ移す」が要らなくなる。
 *
 * ## ここが純粋関数である理由
 *
 * 「誰がいつ降りたか」を知っているのはラウンドを回した側（サーバーとシミュレーション）で、
 * エンジンの1関数がラウンド全体を抱えているわけではない。だから順序の**ルール**だけを
 * ここに置き、観測した結果を渡してもらう形にする。ルールが呼び出し側に散らない。
 */

/** そのラウンドで、あるプレイヤーがどう降りたか */
export type RoundExit = {
  playerIndex: number;
  /** 何ティック目に降りたか。小さいほど早い */
  tick: number;
  /** 横穴か手札切れで「降りさせられた」か。自分から降りたなら false */
  forced: boolean;
};

/**
 * 次のラウンドの解決順を出す（§4-2）。
 *
 * 優先順位は上から順に
 *
 * 1. 自分から降りた人が、降りさせられた人より前
 * 2. 早く降りたほうが前
 * 3. 同着なら、前のラウンドの先行権の順
 *
 * 1 が 2 より強いのは、**降りる判断に報酬をつけるため**である。横穴を踏んで
 * 弾き出されたのは判断ではないので、早く終わっても得をしない。
 */
export function nextResolutionOrder(
  previousOrder: readonly number[],
  exits: readonly RoundExit[]
): number[] {
  if (exits.length !== previousOrder.length) {
    throw new RangeError(
      `全員ぶんの結果が要る: ${exits.length} 件（プレイヤーは ${previousOrder.length} 人）`
    );
  }
  if (new Set(exits.map((e) => e.playerIndex)).size !== exits.length) {
    throw new RangeError("同じプレイヤーが二重に降りている");
  }

  const rankOf = new Map(previousOrder.map((playerIndex, rank) => [playerIndex, rank]));
  const ranked = exits.map((exit) => {
    const rank = rankOf.get(exit.playerIndex);
    if (rank === undefined) {
      throw new RangeError(`前のラウンドの先行権に居ないプレイヤー: ${exit.playerIndex}`);
    }
    return { exit, rank };
  });

  return ranked
    .sort(
      (a, b) =>
        Number(a.exit.forced) - Number(b.exit.forced) ||
        a.exit.tick - b.exit.tick ||
        a.rank - b.rank
    )
    .map(({ exit }) => exit.playerIndex);
}
