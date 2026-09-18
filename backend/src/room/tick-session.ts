/**
 * 1ティックぶんの進行（`docs/realtime.md` §8 / `docs/spec.md` §3）。
 *
 * 1ティックは3拍からなる。
 *
 *   ① 宣言（同時・伏せる） → ② 一斉公開 → ③ 先行権順に1人ずつ解決
 *
 * エンジン（`game/tick.ts`）が受け持つのは③だけで、**宣言を集めて締め切り、
 * いつ解決するかを決める**のがここ。卓上版に締め切りは無いので、この層は
 * 「Web版だけの進行の補助」にあたる（`docs/realtime.md` §8）。
 *
 * ## 時計を自分で読まない
 *
 * `now` は必ず引数で受ける。エンジンが `Rng` を注入されるのと同じ理由で、
 * こうしておかないと締め切りにまつわる分岐をテストで固定できない。
 */
import { nextResolutionOrder, type RoundExit } from "../game/priority.js";
import { endRound } from "../game/progress.js";
import { bankPendingPoints } from "../game/push.js";
import type { EventChooser } from "../game/resolve.js";
import type { Rng } from "../game/rng.js";
import type { LaneRoundResult } from "../game/round.js";
import type { GameState } from "../game/setup.js";
import { resolveTick, type TickDeclaration } from "../game/tick.js";
import { insertIntoLanes, type LaneInsertion } from "../game/turn.js";

/**
 * 宣言の締め切りまでの長さ（ミリ秒）。
 *
 * `docs/realtime.md` §8-1 の12秒。卓上版に無い数字なので調整値（`Balance`）には
 * 置かず、Web版の進行の都合としてここに置く。
 */
export const DECLARATION_WINDOW = 12_000;

/**
 * 一斉公開の拍の長さ（ミリ秒）。全員の狙いを読む間。
 *
 * この間、盤面は動いて見えない。実際には解決まで計算済みで、クライアントは
 * ステップ列を再生しているだけ（`docs/realtime.md` §8-5「結果先行・演出後追い」）。
 */
export const REVEAL_WINDOW = 2_000;

/**
 * 解決のステップ1つを再生する長さ（ミリ秒）。
 *
 * **フロントエンドの `features/game/tick.ts` の値と揃える。** サーバー側が短いと
 * 演出の途中で次のティックが開いてしまう。
 */
export const STEP_WINDOW = 1_200;

/** ティックの拍（`docs/realtime.md` §8-1） */
export type TickPhase = "declaring" | "revealing" | "resolving";

/** 1プレイヤーぶんの宣言（`docs/spec.md` §3 ①） */
export type Declaration =
  { kind: "insert"; laneIndex: number; handIndexes: number[] } | { kind: "withdraw" };

/** 届いた宣言1件 */
export type DeclarationEntry = {
  playerIndex: number;
  /** 冪等キー。同じ値の再送は二重に処理しない（`docs/realtime.md` §8-4） */
  key: string;
  declaration: Declaration;
};

/** 解決のステップ1つ。1人ぶんの投入ラウンドにあたる（`docs/realtime.md` §8-5） */
export type ResolutionStep = {
  playerIndex: number;
  /** 投入したレーンごとの判定と結果。既定のルールでは1本 */
  lanes: LaneRoundResult[];
  /** このステップで未確定得点に積み上がった点数 */
  gainedPoints: number;
  /** 横穴を踏んだか（`docs/spec.md` §5） */
  busted: boolean;
};

export type TickSession = {
  /** 何ティック目か。ラウンドをまたいで増え続ける */
  index: number;
  phase: TickPhase;
  /** 宣言の締め切り（epoch ミリ秒）。サーバーの時刻が権威（§8-2） */
  deadlineAt: number;
  /** このティックの宣言。公開の拍までは中身を他人へ見せない（§8-3） */
  declarations: DeclarationEntry[];
  /** 先行権の順（`docs/spec.md` §3）。ラウンドをまたいで持ち越す */
  order: number[];
  /** このラウンドにまだ参加しているプレイヤー（席の添字） */
  active: number[];
  /**
   * 解決の再生を始める時刻（＝公開の拍の終わり）。
   *
   * 受信のタイミングは端末ごとにずれるが、**どこから再生を始めるかは揃う**
   * （`docs/realtime.md` §8-5）。宣言の拍のあいだは null。
   */
  resolvedAt: number | null;
  /** 直前の解決のステップ列。クライアントが先頭から順に再生する */
  steps: ResolutionStep[];
  /** このラウンドで誰が何ティック目にどう降りたか。次のラウンドの先行権の材料 */
  exits: RoundExit[];
};

export type TickDeps = {
  rng: Rng;
  chooser: EventChooser;
};

export type TickOutcome = { game: GameState; session: TickSession };

/**
 * ゲーム開始時の最初のティックを開く。
 *
 * 第1ラウンドの先行権は席順（`docs/spec.md` §3「先行権」）。
 */
export function startTickSession(game: GameState, now: number): TickSession {
  const seats = game.players.map((_, index) => index);

  return {
    index: 0,
    phase: "declaring",
    deadlineAt: now + DECLARATION_WINDOW,
    declarations: [],
    order: seats,
    active: [...seats],
    resolvedAt: null,
    steps: [],
    exits: [],
  };
}

/** 投入の宣言を、エンジンが受け取る形に直す。「降りる」なら null */
function insertionsOf(declaration: Declaration): LaneInsertion[] | null {
  return declaration.kind === "insert"
    ? [{ laneIndex: declaration.laneIndex, handIndexes: declaration.handIndexes }]
    : null;
}

/**
 * その宣言が実際に投入できるかを、エンジンに確かめてもらう。
 *
 * 「存在しないレーン」「持っていない手札」といった判定を自前で書くと、ルールが
 * この層にも散る。解決に使うのと同じ `insertIntoLanes` を空振りさせて、
 * 投げた例外をそのまま宣言した本人へ返す（`docs/realtime.md` §8-3）。
 */
function requirePlayable(game: GameState, entry: DeclarationEntry): void {
  const insertions = insertionsOf(entry.declaration);
  if (insertions !== null) {
    insertIntoLanes({ ...game, currentPlayerIndex: entry.playerIndex }, insertions);
  }
}

/** 受け付けたあとに盤面が変わって、その宣言がもう通らなくなっていないか */
function stillPlayable(game: GameState, entry: DeclarationEntry): boolean {
  try {
    requirePlayable(game, entry);
    return true;
  } catch {
    return false;
  }
}

function requireDeclaring(session: TickSession): void {
  if (session.phase !== "declaring") {
    throw new RangeError(`いまは宣言の拍ではない: ${session.phase}`);
  }
}

/**
 * 宣言を1件受ける（`docs/spec.md` §3 ①）。
 *
 * 同じ冪等キーの再送は二重に記録しない（`docs/realtime.md` §8-4）。通信が切れて
 * 同じ宣言が何本届いても結果は変わらない。
 *
 * 別のキーで宣言し直したら差し替える。宣言は公開の拍まで誰にも見えないので、
 * 締め切りまでに決め直すのは卓上で伏せたカードを取り替えるのと同じこと。
 *
 * 投入できない宣言はここで弾く。**エラーが返るのは宣言した本人だけ**で、
 * 他の人の宣言は何も変わらない。「誰かの宣言が弾かれた」が見えると、それ自体が
 * 手がかりになってしまう（`docs/realtime.md` §8-3）。
 */
export function recordDeclaration(
  game: GameState,
  session: TickSession,
  entry: DeclarationEntry
): TickSession {
  requireDeclaring(session);
  if (!session.active.includes(entry.playerIndex)) {
    throw new RangeError(`このラウンドからすでに降りている: ${entry.playerIndex}`);
  }
  if (session.declarations.some((d) => d.key === entry.key)) {
    return session;
  }
  requirePlayable(game, entry);

  return {
    ...session,
    declarations: [
      ...session.declarations.filter((d) => d.playerIndex !== entry.playerIndex),
      entry,
    ],
  };
}

/** 自分の宣言を取り下げる。宣言していなければ何も起きない */
export function retractDeclaration(session: TickSession, playerIndex: number): TickSession {
  requireDeclaring(session);

  return {
    ...session,
    declarations: session.declarations.filter((d) => d.playerIndex !== playerIndex),
  };
}

/** 宣言を先行権の順に並べ替える。順番を決めるのは到着順ではない（`docs/realtime.md` §8-4） */
function inPriorityOrder(session: TickSession): DeclarationEntry[] {
  return session.order.flatMap((playerIndex) =>
    session.declarations.filter((d) => d.playerIndex === playerIndex)
  );
}

/** そのプレイヤーの未確定得点を確定してラウンドから降ろす（`docs/spec.md` §3） */
function bank(game: GameState, playerIndex: number): GameState {
  return {
    ...bankPendingPoints({ ...game, currentPlayerIndex: playerIndex }),
    currentPlayerIndex: game.currentPlayerIndex,
  };
}

/** 宣言を締め切って解決し、公開の拍へ移す */
function closeDeclaring(
  game: GameState,
  session: TickSession,
  deps: TickDeps,
  now: number
): TickOutcome {
  // 自分から降りた人、締め切りまでに何も言わなかった人、そして受け付けたあとに
  // 宣言が通らなくなった人。どれも未確定得点は本人に残す（`docs/realtime.md` §8-6）。
  // 違うのは先行権での扱いだけで、自分で決めたのでなければ「降りさせられた」側に
  // 置く（ルール解釈メモ）。1人の宣言が通らなくなっても卓は止めない
  const leaving = session.active.flatMap((playerIndex) => {
    const declared = session.declarations.find((d) => d.playerIndex === playerIndex);
    if (declared === undefined) {
      return [{ playerIndex, tick: session.index, forced: true }];
    }
    if (declared.declaration.kind === "withdraw") {
      return [{ playerIndex, tick: session.index, forced: false }];
    }
    return stillPlayable(game, declared)
      ? []
      : [{ playerIndex, tick: session.index, forced: true }];
  });

  const inserts: TickDeclaration[] = inPriorityOrder(session).flatMap((entry) => {
    const insertions = insertionsOf(entry.declaration);
    return insertions === null || leaving.some((exit) => exit.playerIndex === entry.playerIndex)
      ? []
      : [{ playerIndex: entry.playerIndex, insertions }];
  });
  const banked = leaving.reduce((state, exit) => bank(state, exit.playerIndex), game);

  const resolved = resolveTick(banked, inserts, deps.chooser, deps.rng);
  const steps: ResolutionStep[] = resolved.players.map(({ playerIndex, round }) => ({
    playerIndex,
    lanes: round.lanes,
    gainedPoints: round.gainedPoints,
    busted: round.busted,
  }));

  // 横穴と手札切れは「降りさせられた」。続けるかどうかを選ぶ余地がないので、
  // 自分から降りた人より後ろに置く（`docs/spec.md` §3 先行権）。
  // 横穴の未確定得点はすでにジャックポットへ移っているので、ここでは確定させない
  const forcedOut = resolved.players.flatMap(({ playerIndex, round }) =>
    round.busted || !round.canContinue
      ? [{ exit: { playerIndex, tick: session.index, forced: true }, bank: !round.busted }]
      : []
  );
  const settled = forcedOut.reduce(
    (state, out) => (out.bank ? bank(state, out.exit.playerIndex) : state),
    resolved.state
  );

  const exits = [...leaving, ...forcedOut.map((out) => out.exit)];
  const resolvedAt = now + REVEAL_WINDOW;

  return {
    game: settled,
    session: {
      ...session,
      phase: "revealing",
      deadlineAt: resolvedAt,
      resolvedAt,
      steps,
      active: session.active.filter(
        (playerIndex) => !exits.some((exit) => exit.playerIndex === playerIndex)
      ),
      exits: [...session.exits, ...exits],
    },
  };
}

/**
 * 通りかかったリクエストが、締め切りと演出の終わりを片づける（`docs/realtime.md` §8-2）。
 *
 * Lambda には常駐プロセスがないので、締め切りを**時刻として状態に持たせ**、
 * 次に届いたリクエストが解決する（遅延評価）。ほとんどの場合は最後の宣言が
 * その場で解決するので、締め切りを待つことはない。
 */
export function advanceTick(
  game: GameState,
  session: TickSession,
  deps: TickDeps,
  now: number
): TickOutcome {
  let current: TickOutcome = { game, session };

  // 拍は続けて終わりうる（誰も投入しなかったティックは演出が無いので、公開も解決も
  // 同じ瞬間に終わる）。1リクエストで追いつけるように、進まなくなるまで回す
  for (;;) {
    const next = step(current, deps, now);
    if (next === current) {
      return current;
    }
    current = next;
  }
}

/** 拍を1つだけ送る。送れなければ受け取った状態をそのまま返す */
function step(current: TickOutcome, deps: TickDeps, now: number): TickOutcome {
  const { game, session } = current;
  if (game.phase !== "playing") {
    return current;
  }

  if (session.phase === "declaring") {
    const everyoneDeclared = session.active.every((playerIndex) =>
      session.declarations.some((d) => d.playerIndex === playerIndex)
    );
    return everyoneDeclared || now >= session.deadlineAt
      ? closeDeclaring(game, session, deps, now)
      : current;
  }

  if (now < session.deadlineAt) {
    return current;
  }

  if (session.phase === "revealing") {
    return {
      game,
      session: {
        ...session,
        phase: "resolving",
        deadlineAt: session.deadlineAt + session.steps.length * STEP_WINDOW,
      },
    };
  }

  return openNextTick(current, deps, now);
}

/**
 * 演出が終わったので次のティックを開く。参加者が尽きていればラウンドを終える。
 *
 * ラウンド終了処理（ドローと補充）は**ここで行う**。解決と同じ瞬間にまとめて
 * 済ませてしまうと、演出を再生している最中の盤面に次のラウンドのドローが
 * 写り込んでしまう。
 */
function openNextTick(current: TickOutcome, deps: TickDeps, now: number): TickOutcome {
  const { game, session } = current;
  const opened = {
    ...session,
    index: session.index + 1,
    phase: "declaring" as const,
    deadlineAt: now + DECLARATION_WINDOW,
    declarations: [],
    resolvedAt: null,
    steps: [],
  };

  if (session.active.length > 0) {
    return { game, session: opened };
  }

  // 降りた順がそのまま次のラウンドの先行権になる（`docs/spec.md` §3 先行権）。
  // 卓上では降りた順にプレイヤーカードが列へ並んでいくので、並べ替えは要らない
  const order = nextResolutionOrder(session.order, session.exits);
  const ended = endRound(game, deps.rng, deps.chooser);

  return {
    game: ended.state,
    session: {
      ...opened,
      order,
      active: ended.state.phase === "playing" ? [...order] : [],
      exits: [],
    },
  };
}
