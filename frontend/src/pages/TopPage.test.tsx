import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "@/test-utils/render";
import { App } from "@/App";

function mockFetch(handler: (path: string, init?: RequestInit) => unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn((path: string, init?: RequestInit) =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(handler(path, init)) })
    )
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("トップ画面", () => {
  it("タイトルと導線を表示する", () => {
    renderWithRouter(<App />);

    expect(screen.getByRole("heading", { name: "PUSHER TABLE" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ルームを作る" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "参加する" })).toBeInTheDocument();
  });

  it("表示名を入れずにルームを作ろうとすると知らせる", async () => {
    const { user } = renderWithRouter(<App />);

    await user.click(screen.getByRole("button", { name: "ルームを作る" }));

    expect(await screen.findByText("表示名を入力してください")).toBeInTheDocument();
  });

  it("ルームを作るとロビーへ移る", async () => {
    mockFetch((path) =>
      path === "/api/rooms"
        ? { code: "ABCDEF", playerId: "p1", token: "t1" }
        : {
            code: "ABCDEF",
            phase: "lobby",
            players: [{ id: "p1", name: "あき", isCpu: false }],
            game: null,
          }
    );
    const { user } = renderWithRouter(<App />);

    await user.type(screen.getByLabelText("表示名"), "あき");
    await user.click(screen.getByRole("button", { name: "ルームを作る" }));

    expect(await screen.findByText("ABCDEF")).toBeInTheDocument();
  });

  it("ルームコードを入れて参加できる", async () => {
    mockFetch((path) =>
      path.endsWith("/players")
        ? { playerId: "p2", token: "t2" }
        : {
            code: "ABCDEF",
            phase: "lobby",
            players: [
              { id: "p1", name: "あき", isCpu: false },
              { id: "p2", name: "はると", isCpu: false },
            ],
            game: null,
          }
    );
    const { user } = renderWithRouter(<App />);

    await user.type(screen.getByLabelText("表示名"), "はると");
    await user.type(screen.getByLabelText("ルームコード"), "abcdef");
    await user.click(screen.getByRole("button", { name: "参加する" }));

    await waitFor(() => expect(screen.getByText("ABCDEF")).toBeInTheDocument());
    expect(screen.getByText("はると")).toBeInTheDocument();
  });

  it("表示名を入れずに参加しようとすると知らせる", async () => {
    const { user } = renderWithRouter(<App />);

    await user.type(screen.getByLabelText("ルームコード"), "ABCDEF");
    await user.click(screen.getByRole("button", { name: "参加する" }));

    expect(await screen.findByText("表示名を入力してください")).toBeInTheDocument();
  });

  it("ルームコードを入れずに参加しようとすると知らせる", async () => {
    const { user } = renderWithRouter(<App />);

    await user.type(screen.getByLabelText("表示名"), "はると");
    await user.click(screen.getByRole("button", { name: "参加する" }));

    expect(await screen.findByText("ルームコードを入力してください")).toBeInTheDocument();
  });

  it("サーバーがエラーを返したら理由を表示する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: () => Promise.resolve({ error: { code: "UNPROCESSABLE", message: "ルームが満員" } }),
      })
    );
    const { user } = renderWithRouter(<App />);

    await user.type(screen.getByLabelText("表示名"), "はると");
    await user.type(screen.getByLabelText("ルームコード"), "ABCDEF");
    await user.click(screen.getByRole("button", { name: "参加する" }));

    expect(await screen.findByText("ルームが満員")).toBeInTheDocument();
  });

  it("ルーム作成に失敗したら理由を表示する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () =>
          Promise.resolve({ error: { code: "INTERNAL_ERROR", message: "想定外のエラー" } }),
      })
    );
    const { user } = renderWithRouter(<App />);

    await user.type(screen.getByLabelText("表示名"), "あき");
    await user.click(screen.getByRole("button", { name: "ルームを作る" }));

    expect(await screen.findByText("想定外のエラー")).toBeInTheDocument();
  });
});
