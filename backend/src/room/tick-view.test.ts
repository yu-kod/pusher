import { describe, expect, it } from "vitest";
import { DEFAULT_BALANCE } from "../game/balance.js";
import { autoEventChooser } from "../game/chooser.js";
import { createRng } from "../game/rng.js";
import { setupGame, type GameState } from "../game/setup.js";
import { scriptedRng } from "../test-utils/rng.js";
import {
  advanceTick,
  recordDeclaration,
  startTickSession,
  type TickSession,
} from "./tick-session.js";
import { tickViewFor } from "./tick-view.js";

const NOW = 1_700_000_000_000;
const game: GameState = setupGame(["A", "B", "C"], createRng(1), DEFAULT_BALANCE);
const ids = game.players.map((p) => p.id);

/** 全員が宣言を済ませた（1だけ降りる）状態 */
function declared(): TickSession {
  return startTickSession(game, NOW).active.reduce(
    (acc, playerIndex) =>
      recordDeclaration(game, acc, {
        playerIndex,
        key: `k${playerIndex}`,
        declaration:
          playerIndex === 1
            ? { kind: "withdraw" }
            : { kind: "insert", laneIndex: playerIndex, handIndexes: [0] },
      }),
    startTickSession(game, NOW)
  );
}

const declarationOf = (session: TickSession, viewerId: string, id: string) =>
  tickViewFor(game, session, viewerId).players.find((p) => p.id === id)?.declaration;

describe("tickViewFor — 宣言の拍", () => {
  const session = declared();

  it("他人については宣言を済ませたことだけが見える（docs/realtime.md §8-3）", () => {
    expect(tickViewFor(game, session, ids[0] ?? "").players).toEqual([
      {
        id: ids[0],
        declared: true,
        active: true,
        declaration: { kind: "insert", laneIndex: 0, handIndexes: [0] },
      },
      { id: ids[1], declared: true, active: true, declaration: null },
      { id: ids[2], declared: true, active: true, declaration: null },
    ]);
  });

  it("他人が「降りる」を選んだことも伏せる（§8-3）", () => {
    expect(declarationOf(session, ids[0] ?? "", ids[1] ?? "")).toBeNull();
  });

  it("自分の宣言だけは見える（確認と取り消しのため）", () => {
    expect(declarationOf(session, ids[1] ?? "", ids[1] ?? "")).toEqual({ kind: "withdraw" });
  });

  it("観戦者には誰の宣言も見えない", () => {
    const view = tickViewFor(game, session, "");

    expect(view.players.every((p) => p.declaration === null)).toBe(true);
    expect(view.players.every((p) => p.declared)).toBe(true);
  });

  it("まだ宣言していない人は declared が false", () => {
    const one = recordDeclaration(game, startTickSession(game, NOW), {
      playerIndex: 0,
      key: "k0",
      declaration: { kind: "insert", laneIndex: 0, handIndexes: [0] },
    });

    expect(tickViewFor(game, one, "").players.map((p) => p.declared)).toEqual([true, false, false]);
  });
});

describe("tickViewFor — 公開の拍から先", () => {
  const opened = advanceTick(
    game,
    declared(),
    { rng: scriptedRng([1, 1]), chooser: autoEventChooser },
    NOW
  );

  it("全員の宣言が一斉に開く（§8-3）", () => {
    const view = tickViewFor(opened.game, opened.session, ids[0] ?? "");

    expect(view.players.map((p) => p.declaration)).toEqual([
      { kind: "insert", laneIndex: 0, handIndexes: [0] },
      { kind: "withdraw" },
      { kind: "insert", laneIndex: 2, handIndexes: [0] },
    ]);
  });

  it("降りた人はラウンドから外れて見える", () => {
    const view = tickViewFor(opened.game, opened.session, "");

    expect(view.players.map((p) => p.active)).toEqual([true, false, true]);
  });

  it("解決のステップを先行権の順に、席の添字で返す（§8-5）", () => {
    const view = tickViewFor(opened.game, opened.session, "");

    expect(view.steps.map((s) => s.playerIndex)).toEqual([0, 2]);
    expect(view.steps[0]?.lanes[0]).toMatchObject({ laneIndex: 0, roll: 1 });
  });

  it("拍と時刻をそのまま載せる（§8-1）", () => {
    const view = tickViewFor(opened.game, opened.session, "");

    expect(view).toMatchObject({
      index: opened.session.index,
      phase: "revealing",
      deadlineAt: opened.session.deadlineAt,
      resolvedAt: opened.session.resolvedAt,
    });
  });
});

describe("tickViewFor — 先行権", () => {
  it("降りた順の列をそのまま返す（docs/spec.md §3 先行権）", () => {
    const session = { ...startTickSession(game, NOW), order: [2, 0, 1] };

    expect(tickViewFor(game, session, "").order).toEqual([2, 0, 1]);
  });
});
