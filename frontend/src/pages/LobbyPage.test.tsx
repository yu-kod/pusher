import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen as domScreen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { renderWithRouter } from "@/test-utils/render";
import { App } from "@/App";
import { LobbyPage } from "./LobbyPage";
import type { RoomView } from "@/lib/types";

const CODE = "ABCDEF";

function lobby(players: RoomView["players"]): RoomView {
  return { code: CODE, phase: "lobby", players, game: null };
}

const あき = { id: "p1", name: "あき", isCpu: false };
const はると = { id: "p2", name: "はると", isCpu: false };
const cpu = { id: "p3", name: "CPU3", isCpu: true };

/** パスごとに返す値を決める fetch のモック */
function mockFetch(handler: (path: string, init?: RequestInit) => unknown) {
  const fetchMock = vi.fn((path: string, init?: RequestInit) => {
    const result = handler(path, init);
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(result) });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** 参加済みの状態にする */
function signIn(playerId = "p1") {
  localStorage.setItem(`pusher-table:room:${CODE}`, JSON.stringify({ playerId, token: "t1" }));
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ロビー画面", () => {
  it("ルームコードと参加者を表示する", async () => {
    signIn();
    mockFetch(() => lobby([あき, はると]));

    renderWithRouter(<App />, { route: `/rooms/${CODE}` });

    expect(await screen.findByText(CODE)).toBeInTheDocument();
    expect(screen.getByText("あき")).toBeInTheDocument();
    expect(screen.getByText("はると")).toBeInTheDocument();
    expect(screen.getByText("参加者 2 / 4")).toBeInTheDocument();
  });

  it("自分には「あなた」と付ける", async () => {
    signIn("p2");
    mockFetch(() => lobby([あき, はると]));

    renderWithRouter(<App />, { route: `/rooms/${CODE}` });

    expect(await screen.findByText("（あなた）")).toBeInTheDocument();
  });

  it("3人未満では開始できない", async () => {
    signIn();
    mockFetch(() => lobby([あき, はると]));

    renderWithRouter(<App />, { route: `/rooms/${CODE}` });

    expect(await screen.findByRole("button", { name: "ゲームを開始" })).toBeDisabled();
    expect(screen.getByText("3〜4人で開始できます")).toBeInTheDocument();
  });

  it("3人そろえば開始できる", async () => {
    signIn();
    mockFetch(() => lobby([あき, はると, cpu]));

    renderWithRouter(<App />, { route: `/rooms/${CODE}` });

    expect(await screen.findByRole("button", { name: "ゲームを開始" })).toBeEnabled();
  });

  it("開始を押すとサーバーへ要求する", async () => {
    signIn();
    const fetchMock = mockFetch(() => lobby([あき, はると, cpu]));
    const { user } = renderWithRouter(<App />, { route: `/rooms/${CODE}` });

    await user.click(await screen.findByRole("button", { name: "ゲームを開始" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/rooms/${CODE}/start`,
        expect.objectContaining({ method: "POST" })
      )
    );
  });

  it("CPU を追加できる", async () => {
    signIn();
    const fetchMock = mockFetch(() => lobby([あき, はると]));
    const { user } = renderWithRouter(<App />, { route: `/rooms/${CODE}` });

    await user.click(await screen.findByRole("button", { name: "CPU を追加" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/rooms/${CODE}/players`,
        expect.objectContaining({ body: JSON.stringify({ name: "CPU2", isCpu: true }) })
      )
    );
  });

  it("満員なら CPU を追加できない", async () => {
    signIn();
    mockFetch(() => lobby([あき, はると, cpu, { id: "p4", name: "CPU4", isCpu: true }]));

    renderWithRouter(<App />, { route: `/rooms/${CODE}` });

    expect(await screen.findByRole("button", { name: "CPU を追加" })).toBeDisabled();
  });

  it("CPU だけ外せる", async () => {
    signIn();
    mockFetch(() => lobby([あき, はると, cpu]));

    renderWithRouter(<App />, { route: `/rooms/${CODE}` });

    expect(await screen.findByRole("button", { name: "CPU3 を外す" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "あき を外す" })).not.toBeInTheDocument();
  });

  it("外すを押すとサーバーへ要求する", async () => {
    signIn();
    const fetchMock = mockFetch(() => lobby([あき, はると, cpu]));
    const { user } = renderWithRouter(<App />, { route: `/rooms/${CODE}` });

    await user.click(await screen.findByRole("button", { name: "CPU3 を外す" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/rooms/${CODE}/players/p3`,
        expect.objectContaining({ method: "DELETE" })
      )
    );
  });

  it("招待URLをコピーできる", async () => {
    signIn();
    mockFetch(() => lobby([あき]));
    // userEvent.setup() が navigator.clipboard を差し替えるので、描画後に spy を張る
    const { user } = renderWithRouter(<App />, { route: `/rooms/${CODE}` });
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

    await user.click(await screen.findByRole("button", { name: "招待URLをコピー" }));

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/rooms/${CODE}`);
    expect(await screen.findByRole("button", { name: "コピーしました" })).toBeInTheDocument();
  });

  it("クリップボードが使えなければ知らせる", async () => {
    signIn();
    mockFetch(() => lobby([あき]));
    const { user } = renderWithRouter(<App />, { route: `/rooms/${CODE}` });
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("だめ"));

    await user.click(await screen.findByRole("button", { name: "招待URLをコピー" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("コピーできませんでした");
  });

  it("ゲームが始まっていれば対局中と表示する", async () => {
    signIn();
    mockFetch(() => ({ ...lobby([あき, はると, cpu]), phase: "playing" }));

    renderWithRouter(<App />, { route: `/rooms/${CODE}` });

    expect(await screen.findByRole("heading", { name: "ゲーム中" })).toBeInTheDocument();
  });

  it("開始に失敗したら理由を表示する", async () => {
    signIn();
    vi.stubGlobal(
      "fetch",
      vi.fn((path: string) =>
        path.endsWith("/start")
          ? Promise.resolve({
              ok: false,
              status: 422,
              json: () =>
                Promise.resolve({ error: { code: "UNPROCESSABLE", message: "3〜4人で開始する" } }),
            })
          : Promise.resolve({
              ok: true,
              status: 200,
              json: () => Promise.resolve(lobby([あき, はると, cpu])),
            })
      )
    );
    const { user } = renderWithRouter(<App />, { route: `/rooms/${CODE}` });

    await user.click(await screen.findByRole("button", { name: "ゲームを開始" }));

    expect(await screen.findByText("3〜4人で開始する")).toBeInTheDocument();
  });

  it("サーバーがエラーを返したら理由を表示する", async () => {
    signIn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () =>
          Promise.resolve({ error: { code: "ROOM_NOT_FOUND", message: "ルームが見つからない" } }),
      })
    );

    renderWithRouter(<App />, { route: `/rooms/${CODE}` });

    expect(await screen.findByText("ルームが見つからない")).toBeInTheDocument();
  });

  it("読み込み中を表示する", () => {
    signIn();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined))
    );

    renderWithRouter(<App />, { route: `/rooms/${CODE}` });

    expect(screen.getByText("読み込み中…")).toBeInTheDocument();
  });
});

describe("招待URLから来た人", () => {
  it("参加していなければ表示名を尋ねる", async () => {
    mockFetch(() => lobby([あき]));

    renderWithRouter(<App />, { route: `/rooms/${CODE}` });

    expect(
      await screen.findByRole("heading", { name: `ルーム ${CODE} に参加` })
    ).toBeInTheDocument();
  });

  it("表示名を入れて参加するとロビーが見える", async () => {
    mockFetch((path) =>
      path.endsWith("/players") ? { playerId: "p2", token: "t2" } : lobby([あき, はると])
    );
    const { user } = renderWithRouter(<App />, { route: `/rooms/${CODE}` });

    await user.type(await screen.findByLabelText("表示名"), "はると");
    await user.click(screen.getByRole("button", { name: "参加する" }));

    expect(await screen.findByText("参加者 2 / 4")).toBeInTheDocument();
  });

  it("表示名が空なら知らせる", async () => {
    mockFetch(() => lobby([あき]));
    const { user } = renderWithRouter(<App />, { route: `/rooms/${CODE}` });

    await user.click(await screen.findByRole("button", { name: "参加する" }));

    expect(await screen.findByText("表示名を入力してください")).toBeInTheDocument();
  });

  it("参加に失敗したら理由を表示する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((path: string) =>
        path.endsWith("/players")
          ? Promise.resolve({
              ok: false,
              status: 422,
              json: () =>
                Promise.resolve({ error: { code: "UNPROCESSABLE", message: "満員です" } }),
            })
          : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(lobby([あき])) })
      )
    );
    const { user } = renderWithRouter(<App />, { route: `/rooms/${CODE}` });

    await user.type(await screen.findByLabelText("表示名"), "はると");
    await user.click(screen.getByRole("button", { name: "参加する" }));

    expect(await screen.findByText("満員です")).toBeInTheDocument();
  });
});

describe("ルームコードが URL にない場合", () => {
  it("落ちずにエラーを表示する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () =>
          Promise.resolve({ error: { code: "ROOM_NOT_FOUND", message: "ルームが見つからない" } }),
      })
    );

    render(
      <MemoryRouter initialEntries={["/rooms"]}>
        <Routes>
          <Route path="/rooms" element={<LobbyPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await domScreen.findByText("ルームが見つからない")).toBeInTheDocument();
  });
});
