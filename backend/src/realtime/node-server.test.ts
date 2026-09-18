import { serve } from "@hono/node-server";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createApp } from "../app.js";
import { createInMemoryRoomStore } from "../room/store.js";
import { createNodeRealtime } from "./node-server.js";
import { PROTOCOL_VERSION, type ServerMessage } from "./protocol.js";

/**
 * 実際に WebSocket を張って確かめる。
 *
 * この層の仕事はソケットと hub を繋ぐことなので、繋いだ状態でしか確かめられない。
 */
type Started = { close: () => Promise<void> };

const started: Started[] = [];
const clients: WebSocket[] = [];

afterEach(async () => {
  // 開いたままのソケットがあると server.close() が返らない
  for (const socket of clients.splice(0)) {
    socket.terminate();
  }
  await Promise.all(started.splice(0).map((s) => s.close()));
});

async function startServer() {
  const store = createInMemoryRoomStore();
  const realtime = createNodeRealtime(store);
  const app = createApp({ store, seed: 1, publish: realtime.publish });
  const server = serve({ fetch: app.fetch, port: 0 });
  const wss = realtime.attach(server);

  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  started.push({
    close: () =>
      new Promise<void>((resolve) => {
        wss.close(() => server.close(() => resolve()));
      }),
  });

  return { port, request: app.request.bind(app) };
}

/** 接続し、届いたメッセージを順に溜める */
async function connect(port: number) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  clients.push(socket);
  const received: ServerMessage[] = [];
  socket.on("message", (data) => received.push(JSON.parse(String(data)) as ServerMessage));
  await new Promise((resolve) => socket.once("open", resolve));

  return {
    socket,
    received,
    send: (message: unknown) => socket.send(JSON.stringify(message)),
    /** 条件を満たすメッセージが届くまで待つ */
    waitFor: (match: (m: ServerMessage) => boolean) =>
      new Promise<ServerMessage>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("メッセージが届かない")), 2000);
        const check = () => {
          const found = received.find(match);
          if (found !== undefined) {
            clearTimeout(timer);
            resolve(found);
          }
        };
        check();
        socket.on("message", check);
      }),
  };
}

type Request = (path: string, init?: RequestInit) => Response | Promise<Response>;

async function makeRoom(request: Request) {
  const post = (path: string, body: unknown) =>
    Promise.resolve(
      request(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );

  const created = await post("/api/rooms", { name: "あかり" });
  const { code, token } = (await created.json()) as { code: string; token: string };
  return { code, token, post };
}

describe("createNodeRealtime", () => {
  it("hello を送ると welcome と現在の状態が返る", async () => {
    const { port, request } = await startServer();
    const { code, token } = await makeRoom(request);
    const client = await connect(port);

    client.send({ t: "hello", v: PROTOCOL_VERSION, code, token });

    await expect(client.waitFor((m) => m.t === "welcome")).resolves.toMatchObject({
      playerId: "p1",
    });
    await expect(client.waitFor((m) => m.t === "room")).resolves.toMatchObject({
      room: { code, phase: "lobby" },
    });
  });

  it("繋いでいる別のクライアントへ、ルームの更新がすぐ届く", async () => {
    const { port, request } = await startServer();
    const { code, token, post } = await makeRoom(request);
    const watcher = await connect(port);
    watcher.send({ t: "hello", v: PROTOCOL_VERSION, code, token });
    await watcher.waitFor((m) => m.t === "room");

    await post(`/api/rooms/${code}/players`, { name: "ひなた" });

    const update = await watcher.waitFor((m) => m.t === "room" && m.room.players.length === 2);
    expect(update).toMatchObject({ room: { players: [{ name: "あかり" }, { name: "ひなた" }] } });
  });

  it("ping には pong を返す", async () => {
    const { port } = await startServer();
    const client = await connect(port);

    client.send({ t: "ping" });

    await expect(client.waitFor((m) => m.t === "pong")).resolves.toEqual({ t: "pong" });
  });

  it("読めないメッセージを送っても接続は切れない", async () => {
    const { port } = await startServer();
    const client = await connect(port);

    client.socket.send("これは JSON ではない");

    await expect(client.waitFor((m) => m.t === "error")).resolves.toMatchObject({
      code: "BAD_MESSAGE",
    });
    expect(client.socket.readyState).toBe(WebSocket.OPEN);
  });

  it("切断したクライアントへは配信しない", async () => {
    const { port, request } = await startServer();
    const { code, token, post } = await makeRoom(request);
    const client = await connect(port);
    client.send({ t: "hello", v: PROTOCOL_VERSION, code, token });
    await client.waitFor((m) => m.t === "room");

    client.socket.close();
    await new Promise((resolve) => client.socket.once("close", resolve));

    // 配信先が居なくなっても、アクションは成功する
    const res = await post(`/api/rooms/${code}/players`, { name: "ひなた" });
    expect(res.status).toBe(201);
  });
});
