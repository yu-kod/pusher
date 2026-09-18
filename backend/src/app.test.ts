import type { PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { TABLE_NAME_ENV } from "./room/create-store.js";
import { WS_ENDPOINT_ENV } from "./realtime/create-realtime.js";

const dynamoSend = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/lib-dynamodb", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@aws-sdk/lib-dynamodb")>()),
  DynamoDBDocumentClient: { from: () => ({ send: dynamoSend }) },
}));

const postSend = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/client-apigatewaymanagementapi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@aws-sdk/client-apigatewaymanagementapi")>()),
  ApiGatewayManagementApiClient: class {
    send = postSend;
  },
}));

describe("createApp", () => {
  it("GET /api/health が ok を返す", async () => {
    const res = await createApp().request("/api/health");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "ok" });
  });

  it("未定義のパスは 404 を返す", async () => {
    const res = await createApp().request("/api/does-not-exist");

    expect(res.status).toBe(404);
  });
});

describe("createApp — 本番の配線（#90）", () => {
  beforeEach(() => {
    // vi.fn() の呼び出し履歴はテストを跨いで残るので、毎回ここで消す
    dynamoSend.mockClear();
    postSend.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("環境変数が揃っていれば、状態が変わったことを繋いでいる接続へ知らせる", async () => {
    vi.stubEnv(TABLE_NAME_ENV, "pusher-table-app");
    vi.stubEnv(WS_ENDPOINT_ENV, "https://ws.example.com/prod");
    // 保存（Put）の応答であり、ルームに繋いでいる接続（Query）の応答でもある
    dynamoSend.mockResolvedValue({ Items: [{ GSI1SK: "CONN#c1", playerId: null }] });
    postSend.mockResolvedValue({});

    const res = await createApp().request("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Alice" }),
    });

    expect(res.status).toBe(201);
    const command = postSend.mock.calls[0]?.[0] as PostToConnectionCommand;
    expect(JSON.parse(String(command.input.Data))).toMatchObject({ t: "room" });
  });

  it("WebSocket のエンドポイントが無ければ配信しない（ポーリングだけで遊べる）", async () => {
    const res = await createApp().request("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Alice" }),
    });

    expect(res.status).toBe(201);
    expect(postSend).not.toHaveBeenCalled();
  });
});
