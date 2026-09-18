import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import type { Room } from "../room/room.js";
import { createInMemoryRoomStore, RoomConflictError } from "../room/store.js";

/** ルームを1つ作り、参加者を揃えたアプリとコードを返す */
async function withRoom(names: readonly string[] = ["A", "B", "C"]) {
  const app = createApp({ store: createInMemoryRoomStore(), seed: 1 });

  const created = await post(app, "/api/rooms", { name: names[0] });
  const { code, token } = (await created.json()) as { code: string; token: string };
  const tokens = [token];

  for (const name of names.slice(1)) {
    const res = await post(app, `/api/rooms/${code}/players`, { name });
    tokens.push(((await res.json()) as { token: string }).token);
  }

  return { app, code, tokens };
}

function post(app: ReturnType<typeof createApp>, path: string, body: unknown, token?: string) {
  return app.request(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/rooms（ルーム作成）", () => {
  it("201 でルームコードと参加者情報を返す", async () => {
    const app = createApp({ store: createInMemoryRoomStore(), seed: 1 });

    const res = await post(app, "/api/rooms", { name: "A" });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { code: string; playerId: string; token: string };
    expect(body.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(body.playerId).toBe("p1");
    expect(body.token).toEqual(expect.any(String));
  });

  it("作成者がそのままルームの1人目になる", async () => {
    const { app, code } = await withRoom(["A"]);

    const res = await app.request(`/api/rooms/${code}`);

    const body = (await res.json()) as { players: { name: string }[] };
    expect(body.players).toEqual([{ id: "p1", name: "A", isCpu: false }]);
  });

  it("表示名がなければ 400", async () => {
    const app = createApp({ store: createInMemoryRoomStore(), seed: 1 });

    const res = await post(app, "/api/rooms", {});

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("表示名が空文字なら 400", async () => {
    const app = createApp({ store: createInMemoryRoomStore(), seed: 1 });

    expect((await post(app, "/api/rooms", { name: "" })).status).toBe(400);
  });
});

describe("POST /api/rooms/:code/players（参加）", () => {
  it("201 で参加者情報を返す", async () => {
    const { app, code } = await withRoom(["A"]);

    const res = await post(app, `/api/rooms/${code}/players`, { name: "B" });

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({ playerId: "p2" });
  });

  it("CPU として参加できる", async () => {
    const { app, code } = await withRoom(["A"]);

    await post(app, `/api/rooms/${code}/players`, { name: "CPU1", isCpu: true });

    const body = (await (await app.request(`/api/rooms/${code}`)).json()) as {
      players: { isCpu: boolean }[];
    };
    expect(body.players[1]?.isCpu).toBe(true);
  });

  it("知らないルームコードなら 404", async () => {
    const app = createApp({ store: createInMemoryRoomStore(), seed: 1 });

    const res = await post(app, "/api/rooms/NOPE22/players", { name: "B" });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "ROOM_NOT_FOUND" } });
  });

  it("満員なら 422", async () => {
    const { app, code } = await withRoom(["A", "B", "C", "D"]);

    const res = await post(app, `/api/rooms/${code}/players`, { name: "E" });

    expect(res.status).toBe(422);
  });

  it("同じ表示名なら 422", async () => {
    const { app, code } = await withRoom(["A"]);

    expect((await post(app, `/api/rooms/${code}/players`, { name: "A" })).status).toBe(422);
  });
});

describe("POST /api/rooms/:code/start（開始）", () => {
  it("200 でゲームが始まる", async () => {
    const { app, code, tokens } = await withRoom();

    const res = await post(app, `/api/rooms/${code}/start`, {}, tokens[0]);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { phase: string; game: { round: number } };
    expect(body.phase).toBe("playing");
    expect(body.game.round).toBe(1);
  });

  it("トークンがなければ 401", async () => {
    const { app, code } = await withRoom();

    const res = await post(app, `/api/rooms/${code}/start`, {});

    expect(res.status).toBe(401);
  });

  it("知らないトークンなら 403", async () => {
    const { app, code } = await withRoom();

    expect((await post(app, `/api/rooms/${code}/start`, {}, "bogus")).status).toBe(403);
  });

  it("2人では 422", async () => {
    const { app, code, tokens } = await withRoom(["A", "B"]);

    expect((await post(app, `/api/rooms/${code}/start`, {}, tokens[0])).status).toBe(422);
  });

  it("すでに開始していたら 422", async () => {
    const { app, code, tokens } = await withRoom();
    await post(app, `/api/rooms/${code}/start`, {}, tokens[0]);

    expect((await post(app, `/api/rooms/${code}/start`, {}, tokens[0])).status).toBe(422);
  });
});

describe("GET /api/rooms/:code（状態取得）", () => {
  it("ロビーではゲームが null", async () => {
    const { app, code } = await withRoom();

    const body = (await (await app.request(`/api/rooms/${code}`)).json()) as {
      phase: string;
      game: unknown;
    };

    expect(body.phase).toBe("lobby");
    expect(body.game).toBeNull();
  });

  it("トークンを渡すとそのプレイヤー向けのビューを返す", async () => {
    const { app, code, tokens } = await withRoom();
    await post(app, `/api/rooms/${code}/start`, {}, tokens[0]);

    const res = await app.request(`/api/rooms/${code}`, {
      headers: { Authorization: `Bearer ${tokens[1]}` },
    });

    const body = (await res.json()) as { game: { viewerId: string } };
    expect(body.game.viewerId).toBe("p2");
  });

  it("自分の手札だけ中身が見える（docs/spec.md §8）", async () => {
    const { app, code, tokens } = await withRoom();
    await post(app, `/api/rooms/${code}/start`, {}, tokens[0]);

    const res = await app.request(`/api/rooms/${code}`, {
      headers: { Authorization: `Bearer ${tokens[0]}` },
    });

    const body = (await res.json()) as {
      game: { players: { hand: { owner: boolean } }[] };
    };
    expect(body.game.players[0]?.hand.owner).toBe(true);
    expect(body.game.players[1]?.hand.owner).toBe(false);
  });

  it("トークンなしなら観戦者として扱い、誰の手札も見えない", async () => {
    const { app, code, tokens } = await withRoom();
    await post(app, `/api/rooms/${code}/start`, {}, tokens[0]);

    const res = await app.request(`/api/rooms/${code}`);

    const body = (await res.json()) as { game: { players: { hand: { owner: boolean } }[] } };
    expect(body.game.players.every((p) => p.hand.owner === false)).toBe(true);
  });

  it("レスポンスにトークンを含めない", async () => {
    const { app, code, tokens } = await withRoom();

    const text = await (await app.request(`/api/rooms/${code}`)).text();

    expect(text).not.toContain(tokens[0]);
  });

  it("知らないルームコードなら 404", async () => {
    const app = createApp({ store: createInMemoryRoomStore(), seed: 1 });

    expect((await app.request("/api/rooms/NOPE22")).status).toBe(404);
  });
});

/** 3人でゲームを開始した状態を作る */
async function startedRoom() {
  const started = await withRoom();
  await post(started.app, `/api/rooms/${started.code}/start`, {}, started.tokens[0]);
  return started;
}

type Snapshot = {
  phase: string;
  game: {
    round: number;
    players: { points: number; hand: { cards?: { kind: string }[]; count?: number } }[];
  } | null;
  tick: {
    index: number;
    phase: string;
    players: { id: string; declared: boolean; declaration: unknown }[];
    steps: { playerIndex: number }[];
  } | null;
};

async function snapshot(
  app: ReturnType<typeof createApp>,
  code: string,
  token?: string
): Promise<Snapshot> {
  const res = await app.request(`/api/rooms/${code}`, {
    headers: token === undefined ? {} : { Authorization: `Bearer ${token}` },
  });
  return (await res.json()) as Snapshot;
}

/**
 * そのプレイヤーが投入できる手札の添字を返す。
 *
 * 配られる手札にはイベントカードが混ざりうるので、コインカードを選ぶ必要がある。
 */
async function handIndexOf(app: ReturnType<typeof createApp>, code: string, token: string) {
  const body = await snapshot(app, code, token);
  const cards = body.game?.players.flatMap((p) => p.hand.cards ?? []) ?? [];
  return cards.findIndex((card) => card.kind === "coin");
}

function declare(
  app: ReturnType<typeof createApp>,
  code: string,
  token: string,
  tick: number,
  body: unknown
) {
  return post(app, `/api/rooms/${code}/ticks/${tick}/declarations`, body, token);
}

/** そのプレイヤーが「投入する」を宣言する */
async function declareInsert(
  app: ReturnType<typeof createApp>,
  code: string,
  token: string,
  tick: number,
  laneIndex = 0
) {
  const handIndex = await handIndexOf(app, code, token);
  return declare(app, code, token, tick, {
    kind: "insert",
    laneIndex,
    handIndexes: [handIndex],
    key: `${token}-${tick}`,
  });
}

describe("POST /api/rooms/:code/ticks/:tick/declarations（宣言）", () => {
  it("200 で宣言済みになる", async () => {
    const { app, code, tokens } = await startedRoom();

    const res = await declareInsert(app, code, tokens[0] ?? "", 0);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Snapshot;
    expect(body.tick?.players[0]?.declared).toBe(true);
  });

  it("中身は宣言した本人にしか見えない（docs/realtime.md §8-3）", async () => {
    const { app, code, tokens } = await startedRoom();
    await declareInsert(app, code, tokens[0] ?? "", 0);

    const other = await snapshot(app, code, tokens[1]);

    expect(other.tick?.players[0]).toMatchObject({ declared: true, declaration: null });
  });

  it("全員が宣言すると、締め切りを待たずに公開の拍へ進む（§8-2）", async () => {
    const { app, code, tokens } = await startedRoom();

    await declareInsert(app, code, tokens[0] ?? "", 0);
    await declareInsert(app, code, tokens[1] ?? "", 0, 1);
    const res = await declareInsert(app, code, tokens[2] ?? "", 0, 2);

    const body = (await res.json()) as Snapshot;
    expect(body.tick?.phase).toBe("revealing");
    expect(body.tick?.steps).toHaveLength(3);
  });

  it("「降りる」を宣言できる（docs/spec.md §3）", async () => {
    const { app, code, tokens } = await startedRoom();

    const res = await declare(app, code, tokens[0] ?? "", 0, { kind: "withdraw", key: "w0" });

    expect(res.status).toBe(200);
  });

  it("同じ冪等キーの再送は二重に宣言しない（§8-4）", async () => {
    const { app, code, tokens } = await startedRoom();
    const body = { kind: "withdraw", key: "same" };

    await declare(app, code, tokens[0] ?? "", 0, body);
    const res = await declare(app, code, tokens[0] ?? "", 0, body);

    const snap = (await res.json()) as Snapshot;
    expect(snap.tick?.players.filter((p) => p.declared)).toHaveLength(1);
  });

  it("存在しないレーンなら 422", async () => {
    const { app, code, tokens } = await startedRoom();

    const res = await declare(app, code, tokens[0] ?? "", 0, {
      kind: "insert",
      laneIndex: 99,
      handIndexes: [0],
      key: "k",
    });

    expect(res.status).toBe(422);
  });

  it("閉じたティックへの宣言は 409", async () => {
    const { app, code, tokens } = await startedRoom();

    const res = await declare(app, code, tokens[0] ?? "", 99, { kind: "withdraw", key: "k" });

    expect(res.status).toBe(409);
  });

  it("body の形式が不正なら 400", async () => {
    const { app, code, tokens } = await startedRoom();

    expect((await declare(app, code, tokens[0] ?? "", 0, { kind: "insert" })).status).toBe(400);
  });

  it("冪等キーがなければ 400", async () => {
    const { app, code, tokens } = await startedRoom();

    expect((await declare(app, code, tokens[0] ?? "", 0, { kind: "withdraw" })).status).toBe(400);
  });

  it("トークンがなければ 401", async () => {
    const { app, code } = await startedRoom();

    const res = await post(app, `/api/rooms/${code}/ticks/0/declarations`, {
      kind: "withdraw",
      key: "k",
    });

    expect(res.status).toBe(401);
  });

  it("ロビーのままなら 422", async () => {
    const { app, code, tokens } = await withRoom();

    const res = await declare(app, code, tokens[0] ?? "", 0, { kind: "withdraw", key: "k" });

    expect(res.status).toBe(422);
  });
});

describe("DELETE /api/rooms/:code/ticks/:tick/declarations（宣言の取り消し）", () => {
  function del(app: ReturnType<typeof createApp>, code: string, token: string, tick: number) {
    return app.request(`/api/rooms/${code}/ticks/${tick}/declarations`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  it("締め切りまでは何度でも決め直せる", async () => {
    const { app, code, tokens } = await startedRoom();
    await declare(app, code, tokens[0] ?? "", 0, { kind: "withdraw", key: "k" });

    const res = await del(app, code, tokens[0] ?? "", 0);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Snapshot;
    expect(body.tick?.players[0]?.declared).toBe(false);
  });

  it("閉じたティックなら 409", async () => {
    const { app, code, tokens } = await startedRoom();

    expect((await del(app, code, tokens[0] ?? "", 99)).status).toBe(409);
  });

  it("トークンがなければ 401", async () => {
    const { app, code } = await startedRoom();

    const res = await app.request(`/api/rooms/${code}/ticks/0/declarations`, { method: "DELETE" });

    expect(res.status).toBe(401);
  });
});

/**
 * 時計を進められるアプリで3人のゲームを開始する。
 *
 * 締め切りも演出の終わりも時刻で決まるので（docs/realtime.md §8-2）、
 * 拍をまたぐテストは時計を進める必要がある。
 */
async function withClock(cpuNames: readonly string[] = []) {
  let clock = 1_700_000_000_000;
  const app = createApp({ store: createInMemoryRoomStore(), seed: 1, now: () => clock });

  const created = await post(app, "/api/rooms", { name: "A" });
  const { code, token } = (await created.json()) as { code: string; token: string };
  const tokens = [token];
  const names = cpuNames.length > 0 ? cpuNames : ["B", "C"];
  for (const name of names) {
    const res = await post(app, `/api/rooms/${code}/players`, {
      name,
      isCpu: cpuNames.length > 0,
    });
    tokens.push(((await res.json()) as { token: string }).token);
  }
  await post(app, `/api/rooms/${code}/start`, {}, tokens[0]);

  return { app, code, tokens, advance: (ms: number) => (clock += ms) };
}

describe("POST /api/rooms/:code/ticks/:tick/resolve（締め切りの肩を叩く）", () => {
  it("誰も宣言しないまま締め切りを過ぎたら、肩を叩けば進む（docs/realtime.md §8-2）", async () => {
    const { app, code, tokens, advance } = await withClock();
    advance(60_000);

    const res = await post(app, `/api/rooms/${code}/ticks/0/resolve`, {}, tokens[0]);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Snapshot;
    expect(body.tick?.phase).toBe("revealing");
  });

  it("締め切り前なら何も起きない", async () => {
    const { app, code, tokens } = await withClock();

    const res = await post(app, `/api/rooms/${code}/ticks/0/resolve`, {}, tokens[0]);

    expect(((await res.json()) as Snapshot).tick?.phase).toBe("declaring");
  });

  it("すでに次のティックへ進んでいたら、いまの状態を返すだけ（409 にしない）", async () => {
    const { app, code, tokens } = await withClock();

    const res = await post(app, `/api/rooms/${code}/ticks/99/resolve`, {}, tokens[0]);

    expect(res.status).toBe(200);
    expect(((await res.json()) as Snapshot).tick?.index).toBe(0);
  });

  it("トークンがなければ 401", async () => {
    const { app, code } = await startedRoom();

    expect((await post(app, `/api/rooms/${code}/ticks/0/resolve`, {})).status).toBe(401);
  });
});

describe("ラウンドの進行", () => {
  it("全員が降りるとラウンドが進む（docs/spec.md §3）", async () => {
    const { app, code, tokens, advance } = await withClock();

    // 3人とも降りる。投入が無いので解決するステップも無く、演出はすぐ終わる
    for (const [i, token] of tokens.entries()) {
      await declare(app, code, token, 0, { kind: "withdraw", key: `w${i}` });
    }
    advance(60_000);
    await post(app, `/api/rooms/${code}/ticks/0/resolve`, {}, tokens[0]);

    const body = await snapshot(app, code, tokens[0]);
    expect(body.game?.round).toBe(2);
    expect(body.tick?.index).toBe(1);
  });

  it("次のラウンドでは全員がまた参加している", async () => {
    const { app, code, tokens, advance } = await withClock();
    for (const [i, token] of tokens.entries()) {
      await declare(app, code, token, 0, { kind: "withdraw", key: `w${i}` });
    }
    advance(60_000);
    await post(app, `/api/rooms/${code}/ticks/0/resolve`, {}, tokens[0]);

    const res = await declareInsert(app, code, tokens[0] ?? "", 1);

    expect(res.status).toBe(200);
  });
});

describe("シードを指定しない場合", () => {
  it("既定でもルームを作れる（毎回異なる乱数を使う）", async () => {
    const app = createApp({ store: createInMemoryRoomStore() });

    const res = await post(app, "/api/rooms", { name: "A" });

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      code: expect.stringMatching(/^[A-Z2-9]{6}$/),
    });
  });
});

describe("想定外のエラー", () => {
  it("500 と INTERNAL_ERROR を返す", async () => {
    const store = createInMemoryRoomStore();
    const app = createApp({
      store: { ...store, get: () => Promise.reject(new TypeError("ストアが壊れた")) },
    });

    const res = await app.request("/api/rooms/ABCDEF");

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "INTERNAL_ERROR" } });
  });
});

describe("ボディが JSON でない場合", () => {
  /** Content-Type だけ付けて本文を送らない */
  function postRaw(app: ReturnType<typeof createApp>, path: string, token?: string) {
    return app.request(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
      },
      body: "これは JSON ではない",
    });
  }

  it("ルーム作成は 400", async () => {
    const app = createApp({ store: createInMemoryRoomStore(), seed: 1 });

    expect((await postRaw(app, "/api/rooms")).status).toBe(400);
  });

  it("参加は 400", async () => {
    const { app, code } = await withRoom(["A"]);

    expect((await postRaw(app, `/api/rooms/${code}/players`)).status).toBe(400);
  });

  it("宣言は 400", async () => {
    const { app, code, tokens } = await startedRoom();

    const res = await postRaw(app, `/api/rooms/${code}/ticks/0/declarations`, tokens[0]);

    expect(res.status).toBe(400);
  });
});

describe("CPU プレイヤー（#16）", () => {
  it("ゲームが始まった時点で、CPU はもう宣言を済ませている", async () => {
    const { app, code, tokens } = await withClock(["CPU1", "CPU2"]);

    const body = await snapshot(app, code, tokens[0]);

    expect(body.tick?.players.map((p) => p.declared)).toEqual([false, true, true]);
  });

  it("人間が宣言すると、その場で全員ぶんが解決する", async () => {
    const { app, code, tokens } = await withClock(["CPU1", "CPU2"]);

    const res = await declareInsert(app, code, tokens[0] ?? "", 0);

    const body = (await res.json()) as Snapshot;
    expect(body.tick?.phase).toBe("revealing");
    expect(body.tick?.steps.length).toBeGreaterThan(0);
  });

  it("CPU の宣言の中身は、公開の拍まで人間に見えない（docs/realtime.md §8-3）", async () => {
    const { app, code, tokens } = await withClock(["CPU1", "CPU2"]);

    const body = await snapshot(app, code, tokens[0]);

    expect(body.tick?.players.slice(1).every((p) => p.declaration === null)).toBe(true);
  });

  it("CPU が得点を積む", async () => {
    const { app, code, tokens, advance } = await withClock(["CPU1", "CPU2"]);

    // 人間は降り続け、CPU だけがラウンドを回す
    for (let tick = 0; tick < 6; tick++) {
      await declare(app, code, tokens[0] ?? "", tick, { kind: "withdraw", key: `w${tick}` });
      advance(60_000);
      await post(app, `/api/rooms/${code}/ticks/${tick}/resolve`, {}, tokens[0]);
    }

    const body = await snapshot(app, code, tokens[0]);
    const cpuPoints = body.game?.players.slice(1).map((p) => p.points) ?? [];
    expect(cpuPoints.some((points) => points > 0)).toBe(true);
  });
});

describe("DELETE /api/rooms/:code/players/:id（CPU の削除）", () => {
  async function lobbyWithCpu() {
    const app = createApp({ store: createInMemoryRoomStore(), seed: 1 });
    const created = await post(app, "/api/rooms", { name: "あなた" });
    const { code, token } = (await created.json()) as { code: string; token: string };
    await post(app, `/api/rooms/${code}/players`, { name: "CPU1", isCpu: true });
    return { app, code, token };
  }

  function del(app: ReturnType<typeof createApp>, path: string, token?: string) {
    return app.request(path, {
      method: "DELETE",
      headers: token === undefined ? {} : { Authorization: `Bearer ${token}` },
    });
  }

  it("CPU を削除できる", async () => {
    const { app, code, token } = await lobbyWithCpu();

    const res = await del(app, `/api/rooms/${code}/players/p2`, token);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { players: { id: string }[] };
    expect(body.players.map((p) => p.id)).toEqual(["p1"]);
  });

  it("人間は削除できない", async () => {
    const { app, code, token } = await lobbyWithCpu();

    expect((await del(app, `/api/rooms/${code}/players/p1`, token)).status).toBe(422);
  });

  it("ゲーム開始後は削除できない", async () => {
    const { app, code, token } = await lobbyWithCpu();
    await post(app, `/api/rooms/${code}/players`, { name: "CPU2", isCpu: true });
    await post(app, `/api/rooms/${code}/start`, {}, token);

    expect((await del(app, `/api/rooms/${code}/players/p2`, token)).status).toBe(422);
  });

  it("いないプレイヤーなら 422", async () => {
    const { app, code, token } = await lobbyWithCpu();

    expect((await del(app, `/api/rooms/${code}/players/p9`, token)).status).toBe(422);
  });

  it("トークンがなければ 401", async () => {
    const { app, code } = await lobbyWithCpu();

    expect((await del(app, `/api/rooms/${code}/players/p2`)).status).toBe(401);
  });

  it("削除したあとも残りの id は変わらない", async () => {
    const { app, code, token } = await lobbyWithCpu();
    await post(app, `/api/rooms/${code}/players`, { name: "CPU2", isCpu: true });

    await del(app, `/api/rooms/${code}/players/p2`, token);

    const body = (await (await app.request(`/api/rooms/${code}`)).json()) as {
      players: { id: string; name: string }[];
    };
    expect(body.players).toEqual([
      { id: "p1", name: "あなた", isCpu: false },
      { id: "p3", name: "CPU2", isCpu: true },
    ]);
  });
});

describe("同時更新", () => {
  it("同時に参加すると、片方だけが通り、もう片方は 409 になる", async () => {
    const { app, code } = await withRoom(["A"]);

    const [first, second] = await Promise.all([
      post(app, `/api/rooms/${code}/players`, { name: "B" }),
      post(app, `/api/rooms/${code}/players`, { name: "C" }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
  });

  it("負けたほうの更新で先に入った参加者が消えない", async () => {
    const { app, code } = await withRoom(["A"]);

    await Promise.all([
      post(app, `/api/rooms/${code}/players`, { name: "B" }),
      post(app, `/api/rooms/${code}/players`, { name: "C" }),
    ]);

    const body = (await (await app.request(`/api/rooms/${code}`)).json()) as {
      players: { name: string }[];
    };
    expect(body.players).toHaveLength(2);
    expect(body.players[0]?.name).toBe("A");
  });

  it("409 のレスポンスは統一形式のエラーを返す", async () => {
    const store = createInMemoryRoomStore();
    const app = createApp({
      store: { ...store, update: (room) => Promise.reject(new RoomConflictError(room.code)) },
      seed: 1,
    });
    const created = await post(app, "/api/rooms", { name: "A" });
    const { code } = (await created.json()) as { code: string };

    const res = await post(app, `/api/rooms/${code}/players`, { name: "B" });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "ROOM_CONFLICT" } });
  });

  it("保存先のそれ以外の失敗は 500 のまま（握りつぶさない）", async () => {
    const store = createInMemoryRoomStore();
    const app = createApp({
      store: { ...store, update: () => Promise.reject(new Error("テーブルが無い")) },
      seed: 1,
    });
    const created = await post(app, "/api/rooms", { name: "A" });
    const { code } = (await created.json()) as { code: string };

    const res = await post(app, `/api/rooms/${code}/players`, { name: "B" });

    expect(res.status).toBe(500);
  });

  it("ルームコードが衝突したら 409（作成をやり直せる）", async () => {
    const store = createInMemoryRoomStore();
    // 同じシードなので2回目の作成は同じコードになる
    const app = createApp({ store, seed: 1 });
    await post(app, "/api/rooms", { name: "A" });

    const res = await post(createApp({ store, seed: 1 }), "/api/rooms", { name: "B" });

    expect(res.status).toBe(409);
  });
});

describe("更新の配信（#15）", () => {
  /** 配信された Room を順に記録するアプリを作る */
  function withPublish() {
    const published: Room[] = [];
    const app = createApp({
      store: createInMemoryRoomStore(),
      seed: 1,
      publish: (room) => {
        published.push(room);
        return Promise.resolve();
      },
    });
    return { app, published };
  }

  it("HTTP でも WebSocket でも、同じ rev の付いた状態を返す", async () => {
    const app = createApp({ store: createInMemoryRoomStore(), seed: 1, now: () => 1_700_000_000 });
    const created = await post(app, "/api/rooms", { name: "A" });
    const { code } = (await created.json()) as { code: string };

    const res = await app.request(`/api/rooms/${code}`);

    await expect(res.json()).resolves.toMatchObject({ rev: 1_700_000_000 });
  });

  it("ルームを作ったら、その状態を配信する", async () => {
    const { app, published } = withPublish();

    await post(app, "/api/rooms", { name: "A" });

    expect(published).toHaveLength(1);
    expect(published[0]?.players).toEqual([expect.objectContaining({ name: "A" })]);
  });

  it("誰かが参加したら、そのルームの状態を配信する", async () => {
    const { app, published } = withPublish();
    const created = await post(app, "/api/rooms", { name: "A" });
    const { code } = (await created.json()) as { code: string };

    await post(app, `/api/rooms/${code}/players`, { name: "B" });

    expect(published[1]?.players.map((p) => p.name)).toEqual(["A", "B"]);
  });

  it("ゲームを開始したら、開始後の状態を配信する", async () => {
    const { app, published } = withPublish();
    const created = await post(app, "/api/rooms", { name: "A" });
    const { code, token } = (await created.json()) as { code: string; token: string };
    await post(app, `/api/rooms/${code}/players`, { name: "B" });
    await post(app, `/api/rooms/${code}/players`, { name: "C" });

    await post(app, `/api/rooms/${code}/start`, {}, token);

    expect(published[published.length - 1]?.phase).toBe("playing");
  });

  it("配信の元になるのはサーバーの完全な状態で、マスクは配信側が行う", async () => {
    const { app, published } = withPublish();

    await post(app, "/api/rooms", { name: "A" });

    // トークンを含む Room をそのまま渡す。誰向けに削るかは hub が接続ごとに決める
    expect(published[0]?.players[0]?.token).toEqual(expect.any(String));
  });

  it("配信に失敗してもアクションは成功のまま返す", async () => {
    const app = createApp({
      store: createInMemoryRoomStore(),
      seed: 1,
      publish: () => Promise.reject(new Error("配信先が落ちている")),
    });

    const res = await post(app, "/api/rooms", { name: "A" });

    expect(res.status).toBe(201);
  });

  it("失敗したアクションでは配信しない", async () => {
    const { app, published } = withPublish();

    await post(app, "/api/rooms", { name: "" });

    expect(published).toEqual([]);
  });
});
