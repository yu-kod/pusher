import { describe, expect, it } from "vitest";
import { DEFAULT_BALANCE } from "../game/balance.js";
import { createRng } from "../game/rng.js";
import { createRoom, generateRoomCode, joinRoom, startGame, type Room } from "./room.js";

const NOW = 1_700_000_000_000;

function lobbyWith(names: readonly string[]): Room {
  return names.reduce(
    (room, name, i) => joinRoom(room, { name, token: `t${i + 1}`, isCpu: false }, NOW + i),
    createRoom("ABCDEF", NOW)
  );
}

describe("generateRoomCode", () => {
  it("6文字のコードを返す", () => {
    expect(generateRoomCode(createRng(1))).toHaveLength(6);
  });

  it("紛らわしい文字（0 O 1 I）を含まない", () => {
    const rng = createRng(1);
    const codes = Array.from({ length: 200 }, () => generateRoomCode(rng));

    expect(codes.join("")).not.toMatch(/[0O1I]/);
  });

  it("英大文字と数字だけを使う", () => {
    const rng = createRng(3);

    expect(generateRoomCode(rng)).toMatch(/^[A-Z2-9]{6}$/);
  });

  it("同じシードなら同じコードになる", () => {
    expect(generateRoomCode(createRng(7))).toBe(generateRoomCode(createRng(7)));
  });
});

describe("createRoom", () => {
  it("ロビー状態で始まる", () => {
    const room = createRoom("ABCDEF", NOW);

    expect(room.phase).toBe("lobby");
    expect(room.players).toEqual([]);
    expect(room.game).toBeNull();
  });

  it("コードと作成時刻を持つ", () => {
    const room = createRoom("ABCDEF", NOW);

    expect(room.code).toBe("ABCDEF");
    expect(room.createdAt).toBe(NOW);
    expect(room.updatedAt).toBe(NOW);
  });
});

describe("joinRoom", () => {
  it("プレイヤーを追加する", () => {
    const room = joinRoom(createRoom("ABCDEF", NOW), { name: "A", token: "t1", isCpu: false }, NOW);

    expect(room.players).toEqual([{ id: "p1", name: "A", token: "t1", isCpu: false }]);
  });

  it("参加順に p1, p2, ... の id を振る（setupGame と揃える）", () => {
    expect(lobbyWith(["A", "B", "C"]).players.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("CPU も参加できる", () => {
    const room = joinRoom(
      createRoom("ABCDEF", NOW),
      { name: "CPU", token: "t1", isCpu: true },
      NOW
    );

    expect(room.players[0]?.isCpu).toBe(true);
  });

  it("更新時刻を進める", () => {
    const room = joinRoom(
      createRoom("ABCDEF", NOW),
      { name: "A", token: "t1", isCpu: false },
      NOW + 5
    );

    expect(room.updatedAt).toBe(NOW + 5);
  });

  it("元のルームを変更しない", () => {
    const room = createRoom("ABCDEF", NOW);

    joinRoom(room, { name: "A", token: "t1", isCpu: false }, NOW);

    expect(room.players).toEqual([]);
  });

  it("4人を超えて参加できない（docs/spec.md 冒頭）", () => {
    const full = lobbyWith(["A", "B", "C", "D"]);

    expect(() => joinRoom(full, { name: "E", token: "t5", isCpu: false }, NOW)).toThrow(/満員/);
  });

  it("同じ表示名では参加できない", () => {
    const room = lobbyWith(["A"]);

    expect(() => joinRoom(room, { name: "A", token: "t2", isCpu: false }, NOW)).toThrow(/表示名/);
  });

  it("ゲーム開始後は参加できない", () => {
    const started = startGame(lobbyWith(["A", "B", "C"]), createRng(1), DEFAULT_BALANCE, NOW);

    expect(() => joinRoom(started, { name: "D", token: "t4", isCpu: false }, NOW)).toThrow(/開始/);
  });
});

describe("startGame", () => {
  it("3人でゲームを開始できる", () => {
    const room = startGame(lobbyWith(["A", "B", "C"]), createRng(1), DEFAULT_BALANCE, NOW);

    expect(room.phase).toBe("playing");
    expect(room.game?.players.map((p) => p.name)).toEqual(["A", "B", "C"]);
  });

  it("参加順の id とゲーム側の id が一致する", () => {
    const room = startGame(lobbyWith(["A", "B", "C"]), createRng(1), DEFAULT_BALANCE, NOW);

    expect(room.game?.players.map((p) => p.id)).toEqual(room.players.map((p) => p.id));
  });

  it("4人でも開始できる", () => {
    const room = startGame(lobbyWith(["A", "B", "C", "D"]), createRng(1), DEFAULT_BALANCE, NOW);

    expect(room.game?.players).toHaveLength(4);
  });

  it("2人では開始できない（docs/spec.md 冒頭）", () => {
    expect(() => startGame(lobbyWith(["A", "B"]), createRng(1), DEFAULT_BALANCE, NOW)).toThrow(
      /3〜4人/
    );
  });

  it("すでに開始していたら開始できない", () => {
    const started = startGame(lobbyWith(["A", "B", "C"]), createRng(1), DEFAULT_BALANCE, NOW);

    expect(() => startGame(started, createRng(1), DEFAULT_BALANCE, NOW)).toThrow(/開始/);
  });

  it("元のルームを変更しない", () => {
    const room = lobbyWith(["A", "B", "C"]);

    startGame(room, createRng(1), DEFAULT_BALANCE, NOW);

    expect(room.phase).toBe("lobby");
    expect(room.game).toBeNull();
  });
});
