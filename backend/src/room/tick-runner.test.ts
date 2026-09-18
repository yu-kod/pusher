import { describe, expect, it } from "vitest";
import { DEFAULT_BALANCE } from "../game/balance.js";
import { autoEventChooser } from "../game/chooser.js";
import { createRng } from "../game/rng.js";
import { createRoom, joinRoom, startGame, type Room } from "./room.js";
import { recordDeclaration } from "./tick-session.js";
import { runTick } from "./tick-runner.js";

const NOW = 1_700_000_000_000;
const deps = () => ({ rng: createRng(7), chooser: autoEventChooser });

function startedRoom(cpuFlags: readonly boolean[]): Room {
  const lobby = cpuFlags.reduce(
    (room, isCpu, i) => joinRoom(room, { name: `P${i + 1}`, token: `t${i + 1}`, isCpu }, NOW),
    createRoom("ABCDEF", NOW)
  );
  return startGame(lobby, createRng(1), DEFAULT_BALANCE, NOW);
}

describe("runTick", () => {
  it("CPU が宣言し、人間が揃えばその場で解決する", () => {
    const room = startedRoom([false, true, true]);
    const game = room.game;
    const tick = room.tick;
    if (game === null || tick === null) throw new Error("開始しているはず");

    const declared: Room = {
      ...room,
      tick: recordDeclaration(game, tick, {
        playerIndex: 0,
        key: "h0",
        declaration: { kind: "insert", laneIndex: 0, handIndexes: [0] },
      }),
    };

    expect(runTick(declared, deps(), NOW).tick?.phase).toBe("revealing");
  });

  it("人間の宣言がまだなら、CPU の宣言だけを入れて待つ", () => {
    const next = runTick(startedRoom([false, true, true]), deps(), NOW);

    expect(next.tick?.phase).toBe("declaring");
    expect(next.tick?.declarations.map((d) => d.playerIndex)).toEqual([1, 2]);
  });

  it("CPU だけの卓は締め切りを待たずに進む", () => {
    expect(runTick(startedRoom([true, true, true]), deps(), NOW).tick?.phase).toBe("revealing");
  });

  it("次のティックが開いたら、CPU はその場で宣言する", () => {
    const room = startedRoom([true, true, true]);
    const opened = runTick(room, deps(), NOW);
    const resolvedAt = opened.tick?.resolvedAt ?? 0;

    const next = runTick(opened, deps(), resolvedAt + 60_000);

    expect(next.tick?.phase).toBe("revealing");
    expect(next.tick?.index).toBeGreaterThan(opened.tick?.index ?? 0);
  });

  it("何も進まなければ同じルームを返す", () => {
    const waiting = runTick(startedRoom([false, false, false]), deps(), NOW);

    expect(runTick(waiting, deps(), NOW)).toBe(waiting);
  });

  it("ロビーでは何もしない", () => {
    const lobby = createRoom("ABCDEF", NOW);

    expect(runTick(lobby, deps(), NOW)).toBe(lobby);
  });
});
