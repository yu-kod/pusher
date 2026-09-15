import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameBoard } from "./GameBoard";
import { buildGame, buildLane, buildPlayer, coin, eventCard } from "@/test-utils/game";
import type { GameView } from "@/lib/types";
import type { InsertResult } from "@/lib/api";

const CODE = "ABCDEF";
const credentials = { playerId: "p1", token: "t1" };

function setup(game: GameView = buildGame()) {
  const reload = vi.fn().mockResolvedValue(undefined);
  return {
    user: userEvent.setup(),
    reload,
    ...render(<GameBoard code={CODE} game={game} credentials={credentials} reload={reload} />),
  };
}

const emptyResult: InsertResult = {
  lanes: [{ laneIndex: 0, roll: 3, outcome: "success", target: 4 }],
  gainedPoints: 2,
  busted: false,
  canContinue: true,
  events: [],
  jackpot: null,
};

function mockInsert(result: InsertResult = emptyResult) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ ...buildGame(), result }),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("盤面", () => {
  it("ラウンドと手番とジャックポットを表示する", () => {
    setup(buildGame({ round: 4, jackpotPoints: 12, jackpotCounter: 3 }));

    expect(screen.getByText("ラウンド 4 / 13")).toBeInTheDocument();
    expect(screen.getByText(/^手番/)).toHaveTextContent("手番 あき");
    expect(screen.getByText(/JP 12点/)).toBeInTheDocument();
    expect(screen.getByText("(3/5)")).toBeInTheDocument();
  });

  it("レーンを3本表示し、滞留と奥の枚数を見せる", () => {
    setup(
      buildGame({
        lanes: [
          buildLane({ stockCount: 5, pending: [{ faceUp: false }, { faceUp: false }] }),
          buildLane({ stockCount: 4, pending: [] }),
          buildLane({ stockCount: 5, pending: [{ faceUp: false }] }),
        ],
      })
    );

    expect(screen.getByRole("button", { name: "左レーン" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "中央レーン" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "右レーン" })).toBeInTheDocument();
    expect(screen.getByText("滞留 2枚")).toBeInTheDocument();
    expect(screen.getByText("奥 4枚")).toBeInTheDocument();
  });

  it("奥の山・滞留エリア・落下口の3領域を見せる（docs/spec.md §1）", () => {
    setup(buildGame({ lanes: [buildLane({ stockCount: 4 }), buildLane(), buildLane()] }));

    const lane = screen.getByRole("button", { name: "左レーン" });
    expect(within(lane).getByText("奥 4枚")).toBeInTheDocument();
    expect(within(lane).getByText("滞留 0枚")).toBeInTheDocument();
    expect(within(lane).getByText("落下口")).toBeInTheDocument();
  });

  it("公開された滞留の中身を表向きのカードで見せる（docs/spec.md §6）", () => {
    setup(
      buildGame({
        lanes: [
          buildLane({ pending: [{ faceUp: true, card: coin(3) }, { faceUp: false }] }),
          buildLane(),
          buildLane(),
        ],
      })
    );

    const lane = screen.getByRole("button", { name: "左レーン" });
    expect(within(lane).getByRole("img", { name: "3コイン札" })).toBeInTheDocument();
  });

  it("増設マーカーを見せる", () => {
    setup(buildGame({ lanes: [buildLane({ hasExtraSlot: true }), buildLane(), buildLane()] }));

    expect(screen.getByText("投入口増設")).toBeInTheDocument();
  });

  it("山札と捨て札を場に出す（docs/spec.md §1）", () => {
    setup(buildGame({ drawPileCount: 37, discardPileCount: 6 }));

    expect(screen.getByText("山札 37枚")).toBeInTheDocument();
    expect(screen.getByText("捨て札 6枚")).toBeInTheDocument();
  });

  it("全員の得点と手札枚数を見せる", () => {
    setup(
      buildGame({
        players: [
          buildPlayer({
            id: "p1",
            name: "あき",
            points: 12,
            hand: { owner: true, cards: [coin(1)] },
          }),
          buildPlayer({ id: "p2", name: "はると", points: 30, hand: { owner: false, count: 4 } }),
          buildPlayer({ id: "p3", name: "CPU3", points: 8 }),
        ],
      })
    );

    expect(screen.getByText("30点")).toBeInTheDocument();
    expect(screen.getByText("手札4")).toBeInTheDocument();
  });
});

describe("目標値の提示（docs/spec.md §3）", () => {
  it("カードを選ぶまでは表示しない", () => {
    setup();

    expect(screen.queryByText(/目標値/)).not.toBeInTheDocument();
  });

  it("カードを選ぶと各レーンの目標値が出る", async () => {
    const { user } = setup(
      buildGame({
        lanes: [
          buildLane({ pending: [{ faceUp: false }, { faceUp: false }] }),
          buildLane({ pending: [] }),
          buildLane({ pending: [{ faceUp: false }] }),
        ],
      })
    );

    await user.click(screen.getByRole("button", { name: "2コイン札" }));

    // 2コイン + 滞留 2 / 0 / 1
    expect(screen.getByText("目標値 4")).toBeInTheDocument();
    expect(screen.getByText("目標値 2")).toBeInTheDocument();
    expect(screen.getByText("目標値 3")).toBeInTheDocument();
  });

  it("目標値が6以上のレーンは横穴のリスクを知らせる（docs/spec.md §5）", async () => {
    const { user } = setup(
      buildGame({
        lanes: [
          buildLane({ pending: Array.from({ length: 5 }, () => ({ faceUp: false as const })) }),
          buildLane(),
          buildLane(),
        ],
      })
    );

    await user.click(screen.getByRole("button", { name: "1コイン札" }));

    expect(screen.getByText("目標値 6")).toBeInTheDocument();
    expect(screen.getByText("横穴あり")).toBeInTheDocument();
  });
});

describe("投入", () => {
  it("カードとレーンを選ぶまで投入できない", async () => {
    const { user } = setup();

    expect(screen.getByRole("button", { name: "投入する" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "1コイン札" }));
    expect(screen.getByRole("button", { name: "投入する" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "中央レーン" }));
    expect(screen.getByRole("button", { name: "投入する" })).toBeEnabled();
  });

  it("選んだカードとレーンをサーバーへ送る", async () => {
    const fetchMock = mockInsert();
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "3コイン札" }));
    await user.click(screen.getByRole("button", { name: "右レーン" }));
    await user.click(screen.getByRole("button", { name: "投入する" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/rooms/${CODE}/turns/insert`,
        expect.objectContaining({ body: JSON.stringify({ laneIndex: 2, handIndexes: [2] }) })
      )
    );
  });

  it("結果を表示する", async () => {
    mockInsert();
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "1コイン札" }));
    await user.click(screen.getByRole("button", { name: "左レーン" }));
    await user.click(screen.getByRole("button", { name: "投入する" }));

    expect(await screen.findByRole("img", { name: "出目 3" })).toBeInTheDocument();
    expect(screen.getByText(/目標値 4/)).toBeInTheDocument();
    expect(screen.getByText("成功")).toBeInTheDocument();
    expect(screen.getByText(/獲得/)).toHaveTextContent("獲得 2点");
  });

  it("横穴を踏んだら知らせる（docs/spec.md §5）", async () => {
    mockInsert({
      ...emptyResult,
      lanes: [{ laneIndex: 0, roll: 6, outcome: "sideHole", target: 7 }],
      busted: true,
      canContinue: false,
    });
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "1コイン札" }));
    await user.click(screen.getByRole("button", { name: "左レーン" }));
    await user.click(screen.getByRole("button", { name: "投入する" }));

    expect(await screen.findByText("横穴！ジャックポットへ")).toBeInTheDocument();
  });

  it("イベントが解決されたら知らせる", async () => {
    mockInsert({ ...emptyResult, events: [{ event: "avalanche", extraTurn: false }] });
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "1コイン札" }));
    await user.click(screen.getByRole("button", { name: "左レーン" }));
    await user.click(screen.getByRole("button", { name: "投入する" }));

    expect(await screen.findByText("イベント: avalanche")).toBeInTheDocument();
  });

  it("JP判定に当たったら知らせる", async () => {
    mockInsert({ ...emptyResult, jackpot: { roll: 6, won: true, wonPoints: 20 } });
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "1コイン札" }));
    await user.click(screen.getByRole("button", { name: "左レーン" }));
    await user.click(screen.getByRole("button", { name: "投入する" }));

    expect(await screen.findByText(/JP判定 出目6/)).toHaveTextContent("20点 獲得！");
  });

  it("JP判定に外れたら知らせる", async () => {
    mockInsert({ ...emptyResult, jackpot: { roll: 2, won: false, wonPoints: 0 } });
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "1コイン札" }));
    await user.click(screen.getByRole("button", { name: "左レーン" }));
    await user.click(screen.getByRole("button", { name: "投入する" }));

    expect(await screen.findByText(/JP判定 出目2/)).toHaveTextContent("はずれ");
  });

  it("投入に失敗したら理由を表示する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: () =>
          Promise.resolve({ error: { code: "UNPROCESSABLE", message: "いまは手番ではない" } }),
      })
    );
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "1コイン札" }));
    await user.click(screen.getByRole("button", { name: "左レーン" }));
    await user.click(screen.getByRole("button", { name: "投入する" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("いまは手番ではない");
  });
});

describe("押し引き（docs/spec.md §3）", () => {
  it("未確定得点を大きく見せる", () => {
    setup(buildGame({ pendingPoints: 7 }));

    expect(screen.getByText("7点")).toBeInTheDocument();
  });

  it("1回も投入していなければ「やめる」は押せない", () => {
    setup(buildGame({ insertionRoundsThisTurn: 0 }));

    expect(screen.getByRole("button", { name: "やめる" })).toBeDisabled();
  });

  it("投入していれば「やめる」で確定できる", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(buildGame()) });
    vi.stubGlobal("fetch", fetchMock);
    const { user } = setup(buildGame({ insertionRoundsThisTurn: 1, pendingPoints: 5 }));

    await user.click(screen.getByRole("button", { name: "やめる" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/rooms/${CODE}/turns/stop`,
        expect.objectContaining({ method: "POST" })
      )
    );
  });
});

describe("自分の手番でないとき", () => {
  const notMyTurn = buildGame({ currentPlayerIndex: 1 });

  it("その旨を表示する", () => {
    setup(notMyTurn);

    expect(screen.getByText("他のプレイヤーの手番です")).toBeInTheDocument();
  });

  it("手札もレーンも選べない", () => {
    setup(notMyTurn);

    expect(screen.getByRole("button", { name: "1コイン札" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "左レーン" })).toBeDisabled();
  });
});

describe("手札", () => {
  it("イベントカードは選べない（docs/spec.md ルール解釈メモ）", () => {
    setup(
      buildGame({
        players: [
          buildPlayer({
            id: "p1",
            name: "あき",
            hand: { owner: true, cards: [coin(1), eventCard("avalanche")] },
          }),
          buildPlayer({ id: "p2", name: "はると" }),
          buildPlayer({ id: "p3", name: "CPU3" }),
        ],
      })
    );

    expect(screen.getByRole("button", { name: "イベント: avalanche" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "1コイン札" })).toBeEnabled();
  });

  it("手札がなければその旨を出す", () => {
    setup(
      buildGame({
        players: [
          buildPlayer({ id: "p1", name: "あき", hand: { owner: true, cards: [] } }),
          buildPlayer({ id: "p2", name: "はると" }),
          buildPlayer({ id: "p3", name: "CPU3" }),
        ],
      })
    );

    expect(screen.getByText("手札がありません")).toBeInTheDocument();
  });

  it("観戦者には自分の手札がない", () => {
    render(
      <GameBoard
        code={CODE}
        game={buildGame()}
        credentials={{ playerId: "unknown", token: "t9" }}
        reload={vi.fn()}
      />
    );

    expect(screen.getByText("手札がありません")).toBeInTheDocument();
  });
});

describe("ゲーム終了", () => {
  it("勝者と得点を表示する", () => {
    setup(
      buildGame({
        phase: "finished",
        players: [
          buildPlayer({ id: "p1", name: "あき", points: 40, hand: { owner: true, cards: [] } }),
          buildPlayer({ id: "p2", name: "はると", points: 55 }),
          buildPlayer({ id: "p3", name: "CPU3", points: 20 }),
        ],
      })
    );

    const result = screen.getByRole("region", { name: "ゲーム終了" });
    expect(within(result).getByText("はると")).toBeInTheDocument();
    expect(within(result).getByText(/55点/)).toBeInTheDocument();
  });

  it("同点なら両方を勝者にする", () => {
    setup(
      buildGame({
        phase: "finished",
        players: [
          buildPlayer({ id: "p1", name: "あき", points: 40, hand: { owner: true, cards: [] } }),
          buildPlayer({ id: "p2", name: "はると", points: 40 }),
          buildPlayer({ id: "p3", name: "CPU3", points: 20 }),
        ],
      })
    );

    expect(screen.getByText("あき / はると")).toBeInTheDocument();
  });

  it("終了後は投入できない", () => {
    setup(buildGame({ phase: "finished" }));

    expect(screen.queryByRole("button", { name: "投入する" })).not.toBeInTheDocument();
  });
});

describe("レーン本数が違う設定", () => {
  it("4本でも名前がないレーンを添字で表示する", () => {
    setup(
      buildGame({
        rules: { laneCount: 4, maxLanesPerRound: 1, maxRounds: 13, jackpotThreshold: 5 },
        lanes: [buildLane(), buildLane(), buildLane(), buildLane()],
      })
    );

    expect(screen.getByRole("button", { name: "3レーン" })).toBeInTheDocument();
  });
});

describe("公開された滞留にイベントカードがある場合", () => {
  it("イベント札として見せる（正常系では起こらない防御的な表示）", () => {
    setup(
      buildGame({
        lanes: [
          buildLane({ pending: [{ faceUp: true, card: eventCard("avalanche") }] }),
          buildLane(),
          buildLane(),
        ],
      })
    );

    const lane = screen.getByRole("button", { name: "左レーン" });
    expect(within(lane).getByRole("img", { name: "イベント: avalanche" })).toBeInTheDocument();
  });
});
