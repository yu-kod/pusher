import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  createRoom,
  declareInsert,
  declareWithdraw,
  fetchRoom,
  joinRoom,
  removeCpu,
  resolveTick,
  retractDeclaration,
  startGame,
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

const ROOM = { code: "ABCDEF", phase: "playing", players: [], game: null };

describe("declareInsert", () => {
  it("レーンと手札の添字を、そのティックの宣言として送る", async () => {
    const fetchMock = mockFetch(200, ROOM);

    await declareInsert("ABCDEF", "t1", 3, 1, 2, "k-1");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/rooms/ABCDEF/ticks/3/declarations");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ kind: "insert", laneIndex: 1, handIndexes: [2], key: "k-1" }),
      headers: { Authorization: "Bearer t1" },
    });
  });
});

describe("declareWithdraw", () => {
  it("降りることを宣言する。投入と同じ口へ送る", async () => {
    const fetchMock = mockFetch(200, ROOM);

    await declareWithdraw("ABCDEF", "t1", 3, "k-2");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/rooms/ABCDEF/ticks/3/declarations");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ kind: "withdraw", key: "k-2" }),
    });
  });
});

describe("resolveTick", () => {
  it("締め切りを過ぎても誰も動かないとき、進行を促す", async () => {
    const fetchMock = mockFetch(200, ROOM);

    await resolveTick("ABCDEF", "t1", 3);

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/rooms/ABCDEF/ticks/3/resolve");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
  });
});

describe("retractDeclaration", () => {
  it("締め切りまでは、自分の宣言を取り下げられる", async () => {
    const fetchMock = mockFetch(200, ROOM);

    await retractDeclaration("ABCDEF", "t1", 3);

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/rooms/ABCDEF/ticks/3/declarations");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "DELETE" });
  });
});
