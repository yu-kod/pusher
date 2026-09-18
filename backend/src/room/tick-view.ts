/**
 * クライアントへ返すティックの姿（`docs/realtime.md` §8-1 / §8-3 / §8-5）。
 *
 * ## 宣言は公開の拍まで伏せる
 *
 * 新しいマスク要件がひとつ増える。宣言の中身は公開の拍が来るまで誰にも見せない。
 * 見せてよいのは「宣言したかどうか」だけ。
 *
 * **「降りた」ことも伏せる対象に含む。** ここは取り違えやすい。降りたことは
 * 投入先のような細かい指定ではないので、うっかり公開してよい情報に見える。
 * 誰かが降りたと先に分かると、残った人は「あのボール札は自分まで残る」と知った
 * 状態で投入先を決められる。**遅く決めた人ほど得をする**ようになり、伏せている
 * 意味がなくなる。
 *
 * レーンの中身や手札と同じく、**マスク済みの型しかクライアントへ渡せない**構造に
 * する（`docs/spec.md` §8）。`TickSession` を直接返す口は作らない。
 *
 * ## プレイヤーは席の添字で指す
 *
 * `players` は `GameView.players` と同じ席順に並ぶので、添字がそのまま相手を指す。
 * 解決の順も解決のステップも添字で返し、id への引き直しはクライアントに任せる。
 * サーバー側で引き直すと「卓にいない席」という起こりえない分岐を抱えることになり、
 * その分岐は一生テストできない。
 */
import type { Card } from "../game/deck.js";
import type { GameState, PlayerId } from "../game/setup.js";
import type { RollOutcome } from "../game/turn.js";
import type { Declaration, TickPhase, TickSession } from "./tick-session.js";

/** 開いたあとの宣言1つ。伏せているあいだはそもそも載せない */
export type DeclarationView = Declaration;

export type TickPlayerView = {
  id: PlayerId;
  /** 宣言を済ませたか。**中身は入らない**（`docs/realtime.md` §8-3） */
  declared: boolean;
  /** このラウンドにまだ参加しているか */
  active: boolean;
  /** 公開の拍に入るまで、自分のぶん以外は null */
  declaration: DeclarationView | null;
};

/** 解決したレーン1本ぶん。落ちたカードは落下口で表になるので公開してよい */
export type StepLaneView = {
  laneIndex: number;
  insertedCoins: number;
  target: number;
  roll: number;
  outcome: RollOutcome;
  fallen: Card[];
};

/** 解決のステップ1つ。クライアントはこの列を先頭から順に再生する（§8-5） */
export type ResolutionStepView = {
  /** `players` / `GameView.players` の何番目か（＝席の添字） */
  playerIndex: number;
  lanes: StepLaneView[];
  gainedPoints: number;
  busted: boolean;
};

export type TickView = {
  index: number;
  phase: TickPhase;
  /** いまの拍が終わる時刻（epoch ミリ秒）。サーバーの時刻が権威（§8-2） */
  deadlineAt: number;
  /** 解決の再生を始める時刻。宣言の拍のあいだは null（§8-5） */
  resolvedAt: number | null;
  steps: ResolutionStepView[];
  /**
   * 先行権の順。解決する順に並んだ席の添字（`docs/spec.md` §3）。
   *
   * 卓上では降りた順にプレイヤーカードが一列に並んでいて、誰も覚えておく必要が
   * ない。画面でも常に見えているようにするため、毎回そのまま載せる。
   */
  order: number[];
  /** 席順に並ぶ。`GameView.players` と同じ並び */
  players: TickPlayerView[];
};

/**
 * `viewerId` 向けにマスクしたティックを返す。
 *
 * 卓にいない id を渡せば観戦者として扱われ、誰の宣言も見えない。
 */
export function tickViewFor(game: GameState, session: TickSession, viewerId: PlayerId): TickView {
  // 公開の拍に入った時点で、投入先も「降りる」も一斉に開く
  const revealed = session.phase !== "declaring";

  return {
    index: session.index,
    phase: session.phase,
    deadlineAt: session.deadlineAt,
    resolvedAt: session.resolvedAt,
    order: [...session.order],

    steps: session.steps.map((step) => ({
      playerIndex: step.playerIndex,
      lanes: step.lanes.map((lane) => ({
        laneIndex: lane.laneIndex,
        insertedCoins: lane.insertedCoins,
        target: lane.target,
        roll: lane.roll,
        outcome: lane.outcome,
        fallen: lane.fallenCards,
      })),
      gainedPoints: step.gainedPoints,
      busted: step.busted,
    })),

    players: game.players.map((player, playerIndex) => {
      const declaration = session.declarations.find((d) => d.playerIndex === playerIndex);
      const visible = revealed || player.id === viewerId;

      return {
        id: player.id,
        declared: declaration !== undefined,
        active: session.active.includes(playerIndex),
        declaration: visible ? (declaration?.declaration ?? null) : null,
      };
    }),
  };
}
