import { GoneException, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import { describe, expect, it, vi, type Mock } from "vitest";
import { createApiGatewaySend, type ApiGatewaySend } from "./apigw-send.js";

const ENDPOINT = "https://ws.example.com/prod";

// 既定のクライアントを使う経路だけは、ネットワークへ出ないようクライアントを差し替える
const defaultClientSend = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/client-apigatewaymanagementapi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@aws-sdk/client-apigatewaymanagementapi")>()),
  ApiGatewayManagementApiClient: class {
    send = defaultClientSend;
  },
}));

function sendWith(post: Mock<ApiGatewaySend>) {
  return createApiGatewaySend({ endpoint: ENDPOINT, send: post });
}

function gone() {
  return new GoneException({ $metadata: {}, message: "接続はもうない" });
}

describe("createApiGatewaySend", () => {
  it("接続 ID を指定して JSON を送る", async () => {
    const post = vi.fn<ApiGatewaySend>().mockResolvedValue({});

    await sendWith(post)("c1", { t: "pong" });

    const command = post.mock.calls[0]?.[0] as PostToConnectionCommand;
    expect(command).toBeInstanceOf(PostToConnectionCommand);
    expect(command.input.ConnectionId).toBe("c1");
    expect(JSON.parse(String(command.input.Data))).toEqual({ t: "pong" });
  });

  it("すでに切れた接続（410 Gone）は失敗として返し、呼び出し側に掃除させる", async () => {
    const post = vi.fn<ApiGatewaySend>().mockRejectedValue(gone());

    await expect(sendWith(post)("c1", { t: "pong" })).rejects.toThrow(GoneException);
  });

  it("エンドポイントを省かずに既定のクライアントを組み立てる", async () => {
    defaultClientSend.mockResolvedValue({});

    await createApiGatewaySend({ endpoint: ENDPOINT })("c1", { t: "pong" });

    expect(defaultClientSend).toHaveBeenCalled();
  });
});
