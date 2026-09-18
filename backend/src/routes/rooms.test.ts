import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
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

/** 手番プレイヤーのトークンを返す */
async function currentToken(app: ReturnType<typeof createApp>, code: string, tokens: string[]) {
  const body = (await (await app.request(`/api/rooms/${code}`)).json()) as {
    game: { currentPlayerIndex: number };
  };
  return tokens[body.game.currentPlayerIndex] ?? "";
}

/**
 * 手番プレイヤーのトークンと、投入できる手札の添字を返す。
 *
 * 配られる手札にはイベントカードが混ざりうるので、コインカードを選ぶ必要がある。
 */
async function currentTurn(app: ReturnType<typeof createApp>, code: string, tokens: string[]) {
  const token = await currentToken(app, code, tokens);
  const body = (await (
    await app.request(`/api/rooms/${code}`, { headers: { Authorization: `Bearer ${token}` } })
  ).json()) as { game: { players: { hand: { cards?: { kind: string }[] } }[] } };

  const cards = body.game.players.flatMap((p) => p.hand.cards ?? []);
  const handIndex = cards.findIndex((card) => card.kind === "coin");
  return { token, handIndex, handSize: cards.length };
}

describe("POST /api/rooms/:code/turns/insert（投入）", () => {
  it("200 で投入ラウンドの結果を返す", async () => {
    const { app, code, tokens } = await startedRoom();

    const { token, handIndex } = await currentTurn(app, code, tokens);

    const res = await post(
      app,
      `/api/rooms/${code}/turns/insert`,
      { laneIndex: 0, handIndexes: [handIndex] },
      token
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: { lanes: { roll: number; outcome: string; laneIndex: number }[] };
    };
    const lane = body.result.lanes[0];
    expect(body.result.lanes).toHaveLength(1);
    expect(lane?.laneIndex).toBe(0);
    expect(lane?.roll).toBeGreaterThanOrEqual(1);
    expect(lane?.roll).toBeLessThanOrEqual(6);
    expect(["success", "failure", "sideHole"]).toContain(lane?.outcome);
  });

  it("投入したカードが手札から減る", async () => {
    const { app, code, tokens } = await startedRoom();
    const token = await currentToken(app, code, tokens);

    const res = await post(
      app,
      `/api/rooms/${code}/turns/insert`,
      { laneIndex: 0, handIndexes: [0] },
      token
    );

    const body = (await res.json()) as { game: { players: { hand: { cards?: unknown[] } }[] } };
    const me = body.game.players.find((p) => p.hand.cards !== undefined);
    expect(me?.hand.cards).toHaveLength(4);
  });

  it("手番でないプレイヤーは 422", async () => {
    const { app, code, tokens } = await startedRoom();
    const current = await currentToken(app, code, tokens);
    const other = tokens.find((t) => t !== current) ?? "";

    const res = await post(
      app,
      `/api/rooms/${code}/turns/insert`,
      { laneIndex: 0, handIndexes: [0] },
      other
    );

    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({
      error: { message: expect.stringContaining("手番") },
    });
  });

  it("ロビーのままなら 422", async () => {
    const { app, code, tokens } = await withRoom();

    const res = await post(
      app,
      `/api/rooms/${code}/turns/insert`,
      { laneIndex: 0, handIndexes: [0] },
      tokens[0]
    );

    expect(res.status).toBe(422);
  });

  it("存在しないレーンなら 422", async () => {
    const { app, code, tokens } = await startedRoom();

    const res = await post(
      app,
      `/api/rooms/${code}/turns/insert`,
      { laneIndex: 9, handIndexes: [0] },
      await currentToken(app, code, tokens)
    );

    expect(res.status).toBe(422);
  });

  it("body の形式が不正なら 400", async () => {
    const { app, code, tokens } = await startedRoom();

    const res = await post(
      app,
      `/api/rooms/${code}/turns/insert`,
      { laneIndex: "zero" },
      await currentToken(app, code, tokens)
    );

    expect(res.status).toBe(400);
  });

  it("トークンがなければ 401", async () => {
    const { app, code } = await startedRoom();

    const res = await post(app, `/api/rooms/${code}/turns/insert`, {
      laneIndex: 0,
      handIndexes: [0],
    });

    expect(res.status).toBe(401);
  });

  it("続けられなくなったら手番が移る", async () => {
    const { app, code, tokens } = await startedRoom();

    // 手札 5枚を使い切るまで投入すれば、遅くともそこで手番が終わる
    let moved = false;
    for (let i = 0; i < 6 && !moved; i++) {
      const token = await currentToken(app, code, tokens);
      const res = await post(
        app,
        `/api/rooms/${code}/turns/insert`,
        { laneIndex: 0, handIndexes: [0] },
        token
      );
      const body = (await res.json()) as {
        result: { canContinue: boolean };
        game: { currentPlayerIndex: number };
      };
      moved = !body.result.canContinue && body.game.currentPlayerIndex !== 0;
    }

    expect(moved).toBe(true);
  });
});

describe("POST /api/rooms/:code/turns/stop（やめる）", () => {
  it("未確定得点が確定して手番が移る（docs/spec.md §3）", async () => {
    const { app, code, tokens } = await startedRoom();
    const { token, handIndex } = await currentTurn(app, code, tokens);
    await post(
      app,
      `/api/rooms/${code}/turns/insert`,
      { laneIndex: 0, handIndexes: [handIndex] },
      token
    );

    const res = await post(app, `/api/rooms/${code}/turns/stop`, {}, token);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      game: { pendingPoints: number; currentPlayerIndex: number };
    };
    expect(body.game.pendingPoints).toBe(0);
    expect(body.game.currentPlayerIndex).toBe(1);
  });

  it("1回も投入していなければ 422（パスはできない）", async () => {
    const { app, code, tokens } = await startedRoom();

    const res = await post(
      app,
      `/api/rooms/${code}/turns/stop`,
      {},
      await currentToken(app, code, tokens)
    );

    expect(res.status).toBe(422);
  });

  it("手番でないプレイヤーは 422", async () => {
    const { app, code, tokens } = await startedRoom();
    const current = await currentToken(app, code, tokens);
    const other = tokens.find((t) => t !== current) ?? "";

    expect((await post(app, `/api/rooms/${code}/turns/stop`, {}, other)).status).toBe(422);
  });
});

describe("ラウンドの進行", () => {
  it("全員が手番を終えるとラウンドが進み、全員がドローする（docs/spec.md §3）", async () => {
    const { app, code, tokens } = await startedRoom();

    // 3人それぞれ 1回投入してやめる
    for (let i = 0; i < 3; i++) {
      const { token, handIndex } = await currentTurn(app, code, tokens);
      await post(
        app,
        `/api/rooms/${code}/turns/insert`,
        { laneIndex: 0, handIndexes: [handIndex] },
        token
      );
      // 続けられる場合だけ「やめる」を送る（横穴や手札切れなら手番はすでに移っている）
      await post(app, `/api/rooms/${code}/turns/stop`, {}, token);
    }

    const body = (await (await app.request(`/api/rooms/${code}`)).json()) as {
      game: { round: number; currentPlayerIndex: number };
    };
    expect(body.game.round).toBe(2);
    // ラウンドが進むとスタートプレイヤーが交代する（#54）
    expect(body.game.currentPlayerIndex).toBe(1);
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

  it("投入は 400", async () => {
    const { app, code, tokens } = await startedRoom();

    const res = await postRaw(
      app,
      `/api/rooms/${code}/turns/insert`,
      await currentToken(app, code, tokens)
    );

    expect(res.status).toBe(400);
  });
});

describe("CPU プレイヤー（#16）", () => {
  /** 人間1人 + CPU2人でゲームを開始する */
  async function withCpus() {
    const app = createApp({ store: createInMemoryRoomStore(), seed: 1 });
    const created = await post(app, "/api/rooms", { name: "あなた" });
    const { code, token } = (await created.json()) as { code: string; token: string };
    await post(app, `/api/rooms/${code}/players`, { name: "CPU1", isCpu: true });
    await post(app, `/api/rooms/${code}/players`, { name: "CPU2", isCpu: true });
    await post(app, `/api/rooms/${code}/start`, {}, token);
    return { app, code, token };
  }

  it("人間がやめると CPU の手番が自動で進み、人間へ戻ってくる", async () => {
    const { app, code, token } = await withCpus();
    const { handIndex } = await currentTurn(app, code, [token]);
    await post(
      app,
      `/api/rooms/${code}/turns/insert`,
      { laneIndex: 0, handIndexes: [handIndex] },
      token
    );

    const res = await post(app, `/api/rooms/${code}/turns/stop`, {}, token);

    const body = (await res.json()) as { game: { currentPlayerIndex: number; round: number } };
    // CPU 2人が打ち終わってラウンドも進み、手番は人間（p1）へ戻る
    expect(body.game.currentPlayerIndex).toBe(0);
    expect(body.game.round).toBe(2);
  });

  it("CPU が得点を積む", async () => {
    const { app, code, token } = await withCpus();
    const { handIndex } = await currentTurn(app, code, [token]);
    await post(
      app,
      `/api/rooms/${code}/turns/insert`,
      { laneIndex: 0, handIndexes: [handIndex] },
      token
    );
    await post(app, `/api/rooms/${code}/turns/stop`, {}, token);

    const body = (await (await app.request(`/api/rooms/${code}`)).json()) as {
      game: { players: { name: string; points: number }[] };
    };
    expect(
      body.game.players.filter((p) => p.name.startsWith("CPU")).some((p) => p.points > 0)
    ).toBe(true);
  });

  it("ゲーム開始時に手番が CPU なら、その場で人間まで進む", async () => {
    const app = createApp({ store: createInMemoryRoomStore(), seed: 1 });
    const created = await post(app, "/api/rooms", { name: "CPU1", isCpu: true });
    const { code } = (await created.json()) as { code: string };
    const joined = await post(app, `/api/rooms/${code}/players`, { name: "あなた" });
    const { token } = (await joined.json()) as { token: string };
    await post(app, `/api/rooms/${code}/players`, { name: "CPU2", isCpu: true });

    const res = await post(app, `/api/rooms/${code}/start`, {}, token);

    const body = (await res.json()) as { game: { currentPlayerIndex: number } };
    expect(body.game.currentPlayerIndex).toBe(1);
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
