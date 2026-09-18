import { describe, expect, it } from "vitest";
import { DEFAULT_BALANCE } from "../game/balance.js";
import { autoEventChooser } from "../game/chooser.js";
import { createRng } from "../game/rng.js";
import { setupGame, type GameState } from "../game/setup.js";
import { scriptedRng } from "../test-utils/rng.js";
import {
  advanceTick,
  DECLARATION_WINDOW,
  recordDeclaration,
  retractDeclaration,
  startTickSession,
  STEP_WINDOW,
  type Declaration,
  type TickOutcome,
  type TickSession,
} from "./tick-session.js";

const NOW = 1_700_000_000_000;

const gameOf = (playerCount: number) =>
  setupGame(
    Array.from({ length: playerCount }, (_, i) => `P${i + 1}`),
    createRng(1),
    DEFAULT_BALANCE
  );

describe("startTickSession", () => {
  it("宣言の拍から始まり、まだ誰も宣言していない", () => {
    const session = startTickSession(gameOf(3), NOW);

    expect(session.phase).toBe("declaring");
    expect(session.declarations).toEqual([]);
  });

  it("第1ラウンドの先行権は席順（docs/spec.md §3）", () => {
    expect(startTickSession(gameOf(4), NOW).order).toEqual([0, 1, 2, 3]);
  });

  it("全員がラウンドに参加している", () => {
    expect(startTickSession(gameOf(3), NOW).active).toEqual([0, 1, 2]);
  });

  it("締め切りは開始時刻から先にある", () => {
    expect(startTickSession(gameOf(3), NOW).deadlineAt).toBeGreaterThan(NOW);
  });
});

const insert = (laneIndex: number): Declaration => ({
  kind: "insert",
  laneIndex,
  handIndexes: [0],
});

describe("recordDeclaration", () => {
  const game = gameOf(3);
  const session = startTickSession(game, NOW);

  it("宣言を記録する", () => {
    const next = recordDeclaration(game, session, {
      playerIndex: 1,
      key: "k1",
      declaration: insert(0),
    });

    expect(next.declarations).toEqual([{ playerIndex: 1, key: "k1", declaration: insert(0) }]);
  });

  it("同じ冪等キーの再送は二重に記録しない（docs/realtime.md §8-4）", () => {
    const entry = { playerIndex: 1, key: "k1", declaration: insert(0) };
    const once = recordDeclaration(game, session, entry);

    expect(recordDeclaration(game, once, entry).declarations).toEqual(once.declarations);
  });

  it("同じプレイヤーが別のキーで宣言し直したら差し替える", () => {
    const first = recordDeclaration(game, session, {
      playerIndex: 1,
      key: "k1",
      declaration: insert(0),
    });
    const next = recordDeclaration(game, first, {
      playerIndex: 1,
      key: "k2",
      declaration: insert(2),
    });

    expect(next.declarations).toEqual([{ playerIndex: 1, key: "k2", declaration: insert(2) }]);
  });

  it("元の session を書き換えない", () => {
    recordDeclaration(game, session, { playerIndex: 1, key: "k1", declaration: insert(0) });

    expect(session.declarations).toEqual([]);
  });

  it("そのラウンドから降りたプレイヤーの宣言は受けない", () => {
    const withdrawn = { ...session, active: [0, 2] };

    expect(() =>
      recordDeclaration(game, withdrawn, { playerIndex: 1, key: "k1", declaration: insert(0) })
    ).toThrow(/降りている/);
  });

  it("宣言の拍でなければ受けない", () => {
    const resolving = { ...session, phase: "resolving" as const };

    expect(() =>
      recordDeclaration(game, resolving, { playerIndex: 1, key: "k1", declaration: insert(0) })
    ).toThrow(/宣言の拍ではない/);
  });
});

describe("retractDeclaration", () => {
  const game = gameOf(3);
  const session = startTickSession(game, NOW);

  it("自分の宣言を取り下げる", () => {
    const declared = recordDeclaration(game, session, {
      playerIndex: 1,
      key: "k1",
      declaration: insert(0),
    });

    expect(retractDeclaration(declared, 1).declarations).toEqual([]);
  });

  it("宣言していなければ何も起きない", () => {
    expect(retractDeclaration(session, 1).declarations).toEqual([]);
  });

  it("他人の宣言は消さない", () => {
    const declared = recordDeclaration(game, session, {
      playerIndex: 0,
      key: "k1",
      declaration: insert(0),
    });

    expect(retractDeclaration(declared, 1).declarations).toHaveLength(1);
  });

  it("宣言の拍を過ぎたら取り下げられない", () => {
    const revealing = { ...session, phase: "revealing" as const };

    expect(() => retractDeclaration(revealing, 1)).toThrow(/宣言の拍ではない/);
  });
});

const deps = (rolls: readonly number[]) => ({
  rng: scriptedRng(rolls),
  chooser: autoEventChooser,
});

/** 参加中の全員が0番レーンへ投入を宣言した状態 */
function allDeclared(game: GameState, session: TickSession): TickSession {
  return session.active.reduce(
    (acc, playerIndex) =>
      recordDeclaration(game, acc, { playerIndex, key: `k${playerIndex}`, declaration: insert(0) }),
    session
  );
}

describe("advanceTick — 宣言が出そろったとき", () => {
  const game = gameOf(3);
  const declared = allDeclared(game, startTickSession(game, NOW));

  it("締め切りを待たずに公開の拍へ進む（docs/realtime.md §8-2）", () => {
    const next = advanceTick(game, declared, deps([1, 1, 1]), NOW);

    expect(next.session.phase).toBe("revealing");
  });

  it("先行権の順に1人ずつのステップを並べる（docs/spec.md §3 ③）", () => {
    const next = advanceTick(game, { ...declared, order: [2, 0, 1] }, deps([1, 1, 1]), NOW);

    expect(next.session.steps.map((step) => step.playerIndex)).toEqual([2, 0, 1]);
  });

  it("盤面は1回の計算で全員ぶん動かす（§8-5）", () => {
    const next = advanceTick(game, declared, deps([1, 1, 1]), NOW);

    expect(next.game.players.map((p) => p.hand.length)).toEqual(
      game.players.map((p) => p.hand.length - 1)
    );
  });

  it("解決の再生を始める時刻を全員ぶん揃えて持つ（§8-5）", () => {
    const next = advanceTick(game, declared, deps([1, 1, 1]), NOW);

    expect(next.session.resolvedAt).toBeGreaterThan(NOW);
    expect(next.session.deadlineAt).toBe(next.session.resolvedAt);
  });

  it("成功したプレイヤーはそのラウンドに残る", () => {
    const next = advanceTick(game, declared, deps([1, 1, 1]), NOW);

    expect(next.session.active).toEqual([0, 1, 2]);
  });
});

describe("advanceTick — まだ宣言が揃っていないとき", () => {
  const game = gameOf(3);
  const session = startTickSession(game, NOW);

  it("締め切り前なら何も起きない", () => {
    const one = recordDeclaration(game, session, {
      playerIndex: 0,
      key: "k0",
      declaration: insert(0),
    });

    expect(advanceTick(game, one, deps([]), NOW + 1).session).toBe(one);
  });
});

/** 指定したプレイヤーに未確定得点を持たせる */
function withPending(game: GameState, playerIndex: number, points: number): GameState {
  return {
    ...game,
    players: game.players.map((p, i) => (i === playerIndex ? { ...p, pendingPoints: points } : p)),
  };
}

describe("advanceTick — 降りる", () => {
  const game = gameOf(3);
  const session = startTickSession(game, NOW);

  it("「降りる」を宣言した人はそのラウンドから外れる（docs/spec.md §3）", () => {
    const declared = session.active.reduce(
      (acc, playerIndex) =>
        recordDeclaration(game, acc, {
          playerIndex,
          key: `k${playerIndex}`,
          declaration: playerIndex === 1 ? { kind: "withdraw" } : insert(0),
        }),
      session
    );

    expect(advanceTick(game, declared, deps([1, 1]), NOW).session.active).toEqual([0, 2]);
  });

  it("降りた人の未確定得点は確定して本人に入る", () => {
    const declared = recordDeclaration(game, session, {
      playerIndex: 1,
      key: "k1",
      declaration: { kind: "withdraw" },
    });
    const withdrawing = { ...declared, active: [1] };
    const next = advanceTick(withPending(game, 1, 7), withdrawing, deps([]), NOW);

    expect(next.game.players[1]).toMatchObject({ points: 7, pendingPoints: 0 });
  });

  it("自分から降りたことを先行権の材料として残す（§3 先行権）", () => {
    const declared = recordDeclaration(game, session, {
      playerIndex: 1,
      key: "k1",
      declaration: { kind: "withdraw" },
    });
    const next = advanceTick(game, { ...declared, active: [1] }, deps([]), NOW);

    expect(next.session.exits).toEqual([{ playerIndex: 1, tick: 0, forced: false }]);
  });
});

describe("advanceTick — 締め切り", () => {
  const game = gameOf(3);
  const session = startTickSession(game, NOW);
  const late = session.deadlineAt + 1;

  it("締め切りを過ぎたら、宣言が揃っていなくても進む（docs/realtime.md §8-2）", () => {
    expect(advanceTick(game, session, deps([]), late).session.phase).toBe("revealing");
  });

  it("宣言しなかった人は降りたものとして扱い、未確定得点は本人に残す（§8-6）", () => {
    const next = advanceTick(withPending(game, 1, 7), { ...session, active: [1] }, deps([]), late);

    expect(next.game.players[1]).toMatchObject({ points: 7, pendingPoints: 0 });
  });

  it("時間切れは「降りさせられた」扱いにする（ルール解釈メモ）", () => {
    const next = advanceTick(game, { ...session, active: [1] }, deps([]), late);

    expect(next.session.exits).toEqual([{ playerIndex: 1, tick: 0, forced: true }]);
  });
});

describe("advanceTick — 解決でラウンドから外れる", () => {
  const game = gameOf(3);
  const session = startTickSession(game, NOW);
  const alone = (playerIndex: number) =>
    recordDeclaration(
      game,
      { ...session, active: [playerIndex] },
      {
        playerIndex,
        key: "k",
        declaration: insert(0),
      }
    );

  it("横穴を踏んだ人はそのラウンドから外れる（docs/spec.md §5）", () => {
    const next = advanceTick(withPending(game, 1, 7), alone(1), deps([6]), NOW);

    expect(next.session.active).toEqual([]);
    expect(next.session.exits).toEqual([{ playerIndex: 1, tick: 0, forced: true }]);
  });

  it("横穴の未確定得点はジャックポットへ移り、本人には入らない", () => {
    const next = advanceTick(withPending(game, 1, 7), alone(1), deps([6]), NOW);

    expect(next.game.players[1]).toMatchObject({ points: 0, pendingPoints: 0 });
    expect(next.game.jackpotPoints).toBeGreaterThanOrEqual(7);
  });

  it("手札が尽きた人はラウンドから外れ、未確定得点は確定する（§3）", () => {
    const pending = withPending(game, 1, 7);
    const lastCard: GameState = {
      ...pending,
      players: pending.players.map((p, i) => (i === 1 ? { ...p, hand: p.hand.slice(0, 1) } : p)),
    };
    const next = advanceTick(lastCard, alone(1), deps([1]), NOW);

    expect(next.session.active).toEqual([]);
    expect(next.session.exits).toEqual([{ playerIndex: 1, tick: 0, forced: true }]);
    expect(next.game.players[1]?.points).toBeGreaterThanOrEqual(7);
  });
});

describe("advanceTick — 拍を送る", () => {
  const game = gameOf(3);
  const opened = advanceTick(
    game,
    allDeclared(game, startTickSession(game, NOW)),
    deps([1, 1, 1]),
    NOW
  );
  const revealedAt = opened.session.resolvedAt ?? 0;

  it("公開の拍のあいだは何も起きない", () => {
    expect(advanceTick(opened.game, opened.session, deps([]), revealedAt - 1).session).toBe(
      opened.session
    );
  });

  it("公開が終わったら解決の拍へ移る", () => {
    const next = advanceTick(opened.game, opened.session, deps([]), revealedAt);

    expect(next.session.phase).toBe("resolving");
  });

  it("解決の拍はステップの数だけ続く（docs/realtime.md §8-5）", () => {
    const next = advanceTick(opened.game, opened.session, deps([]), revealedAt);

    expect(next.session.deadlineAt).toBe(revealedAt + STEP_WINDOW * 3);
  });

  it("演出が終わったら次のティックの宣言が開く", () => {
    const end = revealedAt + STEP_WINDOW * 3;
    const next = advanceTick(opened.game, opened.session, deps([]), end);

    expect(next.session).toMatchObject({
      index: 1,
      phase: "declaring",
      declarations: [],
      resolvedAt: null,
      deadlineAt: end + DECLARATION_WINDOW,
    });
  });

  it("盤面はもう動いている。動かすのは解決のときの1回だけ（§8-5）", () => {
    const end = revealedAt + STEP_WINDOW * 3;
    const next = advanceTick(opened.game, opened.session, deps([]), end);

    expect(next.game).toBe(opened.game);
  });
});

describe("advanceTick — ラウンドが終わるとき", () => {
  const game = gameOf(3);
  const live = { rng: createRng(5), chooser: autoEventChooser };

  /** 先に1と0が降りていて、最後の1人（2）がいま降りる直前の状態 */
  function lastToWithdraw(): TickSession {
    const base = startTickSession(game, NOW);
    return recordDeclaration(
      game,
      {
        ...base,
        index: 1,
        active: [2],
        exits: [
          { playerIndex: 1, tick: 0, forced: false },
          { playerIndex: 0, tick: 1, forced: false },
        ],
      },
      { playerIndex: 2, key: "k2", declaration: { kind: "withdraw" } }
    );
  }

  /** 宣言を締め切り、公開と解決の演出も終わったところまで進める */
  function settle(state: GameState, session: TickSession): TickOutcome {
    const closed = advanceTick(state, session, live, NOW + 60_000);
    return advanceTick(closed.game, closed.session, live, NOW + 120_000);
  }

  it("全員が降りたらラウンド終了処理を行う（docs/spec.md §3）", () => {
    const next = settle(game, lastToWithdraw());

    expect(next.game.round).toBe(game.round + 1);
  });

  it("降りた順がそのまま次のラウンドの先行権になる（§3 先行権）", () => {
    const next = settle(game, lastToWithdraw());

    expect(next.session.order).toEqual([1, 0, 2]);
  });

  it("次のラウンドには全員が参加し、降りた記録は持ち越さない", () => {
    const next = settle(game, lastToWithdraw());

    expect(next.session.active).toEqual([1, 0, 2]);
    expect(next.session.exits).toEqual([]);
  });

  it("ラウンド終了処理でドローする（§3）", () => {
    const next = settle(game, lastToWithdraw());

    // 引いたカードがイベントだとその場で解決して捨て札になり、落ちたカードは
    // 山札の底へ戻る（ルール解釈メモ）。増減は人によって違うので、確かめるのは
    // 山札が減ったことのほう
    expect(next.game.drawPile.length).toBeLessThan(game.drawPile.length);
  });

  it("ゲームが終わったら次のティックを開かない", () => {
    const lastRound: GameState = { ...game, round: game.config.maxRounds };
    const next = settle(lastRound, lastToWithdraw());

    expect(next.game.phase).toBe("finished");
    expect(next.session.active).toEqual([]);
  });
});

describe("recordDeclaration — 宣言が通るかをその場で確かめる", () => {
  const game = gameOf(3);
  const session = startTickSession(game, NOW);
  const entry = (declaration: Declaration) => ({ playerIndex: 1, key: "k1", declaration });

  it("存在しないレーンを指した宣言は受けない", () => {
    expect(() =>
      recordDeclaration(game, session, entry({ kind: "insert", laneIndex: 9, handIndexes: [0] }))
    ).toThrow(/レーン/);
  });

  it("持っていない手札を指した宣言は受けない", () => {
    expect(() =>
      recordDeclaration(game, session, entry({ kind: "insert", laneIndex: 0, handIndexes: [99] }))
    ).toThrow(/手札/);
  });

  it("弾かれた宣言は他の人の宣言に影響しない（docs/realtime.md §8-3）", () => {
    const other = recordDeclaration(game, session, {
      playerIndex: 0,
      key: "k0",
      declaration: insert(0),
    });

    expect(() =>
      recordDeclaration(game, other, entry({ kind: "insert", laneIndex: 9, handIndexes: [0] }))
    ).toThrow();
    expect(other.declarations).toHaveLength(1);
  });

  it("「降りる」はいつでも受ける", () => {
    expect(recordDeclaration(game, session, entry({ kind: "withdraw" })).declarations).toHaveLength(
      1
    );
  });
});

describe("advanceTick — 受け付けたあとに通らなくなった宣言", () => {
  const game = gameOf(3);

  it("その人だけ降ろし、卓は止めない", () => {
    const session = recordDeclaration(
      game,
      { ...startTickSession(game, NOW), active: [1] },
      {
        playerIndex: 1,
        key: "k1",
        declaration: { kind: "insert", laneIndex: 0, handIndexes: [4] },
      }
    );
    // 宣言を受けたあとで手札が減った（イベントの解決などで起こりうる）
    const shrunk: GameState = {
      ...game,
      players: game.players.map((p, i) => (i === 1 ? { ...p, hand: p.hand.slice(0, 1) } : p)),
    };
    const next = advanceTick(shrunk, session, deps([]), NOW);

    expect(next.session.phase).toBe("revealing");
    expect(next.session.steps).toEqual([]);
    expect(next.session.exits).toEqual([{ playerIndex: 1, tick: 0, forced: true }]);
  });
});
