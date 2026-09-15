import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  createRoom,
  fetchRoom,
  insertCard,
  joinRoom,
  removeCpu,
  startGame,
  stopTurn,
} from "./api";

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createRoom", () => {
  it("表示名を送ってルーム情報を受け取る", async () => {
    const fetchMock = mockFetch(201, { code: "ABCDEF", playerId: "p1", token: "t1" });

    await expect(createRoom("あき")).resolves.toEqual({
      code: "ABCDEF",
      playerId: "p1",
      token: "t1",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/rooms",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "あき" }),
      })
    );
  });

  it("エラーならコードとメッセージを持つ例外を投げる", async () => {
    mockFetch(422, { error: { code: "UNPROCESSABLE", message: "満員" } });

    await expect(createRoom("あき")).rejects.toThrow(ApiError);
    await expect(createRoom("あき")).rejects.toMatchObject({
      code: "UNPROCESSABLE",
      message: "満員",
    });
  });

  it("エラー本文が読めなくても例外を投げる", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error("not json")),
      })
    );

    await expect(createRoom("あき")).rejects.toMatchObject({ code: "UNKNOWN" });
  });
});

describe("joinRoom", () => {
  it("表示名と CPU 種別を送る", async () => {
    const fetchMock = mockFetch(201, { playerId: "p2", token: "t2" });

    await expect(joinRoom("ABCDEF", "はると", false)).resolves.toEqual({
      playerId: "p2",
      token: "t2",
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/rooms/ABCDEF/players");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({ name: "はると", isCpu: false }),
    });
  });
});

describe("fetchRoom", () => {
  it("トークンがあれば Authorization を付ける", async () => {
    const fetchMock = mockFetch(200, { code: "ABCDEF", phase: "lobby", players: [], game: null });

    await fetchRoom("ABCDEF", "t1");

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer t1" },
    });
  });

  it("トークンがなければ Authorization を付けない", async () => {
    const fetchMock = mockFetch(200, { code: "ABCDEF", phase: "lobby", players: [], game: null });

    await fetchRoom("ABCDEF");

    expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty("Authorization");
  });
});

describe("startGame", () => {
  it("開始を要求する", async () => {
    const fetchMock = mockFetch(200, { code: "ABCDEF", phase: "playing", players: [], game: null });

    await startGame("ABCDEF", "t1");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/rooms/ABCDEF/start");
  });
});

describe("removeCpu", () => {
  it("CPU の削除を要求する", async () => {
    const fetchMock = mockFetch(200, { code: "ABCDEF", phase: "lobby", players: [], game: null });

    await removeCpu("ABCDEF", "p2", "t1");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/rooms/ABCDEF/players/p2");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "DELETE" });
  });
});

describe("insertCard", () => {
  it("レーンと手札の添字を送る", async () => {
    const fetchMock = mockFetch(200, {
      code: "ABCDEF",
      phase: "playing",
      players: [],
      game: null,
      result: {
        lanes: [],
        gainedPoints: 0,
        busted: false,
        canContinue: true,
        events: [],
        jackpot: null,
      },
    });

    await insertCard("ABCDEF", "t1", 1, [2]);

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/rooms/ABCDEF/turns/insert");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ laneIndex: 1, handIndexes: [2] }),
      headers: { Authorization: "Bearer t1" },
    });
  });
});

describe("stopTurn", () => {
  it("やめるを要求する", async () => {
    const fetchMock = mockFetch(200, { code: "ABCDEF", phase: "playing", players: [], game: null });

    await stopTurn("ABCDEF", "t1");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/rooms/ABCDEF/turns/stop");
  });
});
