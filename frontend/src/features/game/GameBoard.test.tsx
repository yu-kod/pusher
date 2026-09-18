import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameBoard } from "./GameBoard";
import {
  buildGame,
  buildLane,
  buildPlayer,
  buildStep,
  buildTick,
  buildTickPlayer,
  coin,
  eventCard,
} from "@/test-utils/game";
import type { GameView, TickView } from "@/lib/types";

const CODE = "ABCDEF";
const credentials = { playerId: "p1", token: "t1" };

/** 卓の時刻。3拍はすべて時刻で表されるので、テストの側でも1点に固定する */
const NOW = 1_700_000_000_000;

function setup(game: GameView = buildGame(), tick: TickView = buildTick()) {
  const reload = vi.fn().mockResolvedValue(undefined);
  return {
    user: userEvent.setup(),
    reload,
    ...render(
      <GameBoard code={CODE} game={game} tick={tick} credentials={credentials} reload={reload} />
    ),
  };
}

/**
 * 宣言・取り消し・解決の口。
 *
 * どれもルーム全体を返すので、画面は中身を読まずに `reload` で読み直す。
 * ここで見たいのは「どこへ何を送ったか」だけ。
 */
function mockApi() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ game: buildGame(), tick: buildTick() }),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("盤面", () => {
  it("ラウンドとジャックポットを表示する", () => {
    setup(buildGame({ round: 4, jackpotPoints: 12, jackpotCounter: 3 }));

    const banner = within(screen.getByRole("banner"));
    expect(banner.getByText("ラウンド 4 / 13")).toBeInTheDocument();
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

  it("未確定得点を大きく見せる（docs/spec.md §3）", () => {
    setup(buildGame({ pendingPoints: 7 }));

    expect(screen.getByText("7点")).toBeInTheDocument();
  });
});

describe("卓を囲む並び", () => {
  const seatOf = (name: string) => screen.getByLabelText(`${name}の席`);

  it("自分は手前に座る", () => {
    setup();

    expect(seatOf("あき")).toHaveAttribute("data-position", "bottom");
    expect(within(seatOf("あき")).getByText("あなた")).toBeInTheDocument();
  });

  it("3人なら他の2人は自分を挟んで左右に座る", () => {
    setup();

    expect(seatOf("はると")).toHaveAttribute("data-position", "left");
    expect(seatOf("CPU3")).toHaveAttribute("data-position", "right");
  });

  it("4人なら四方が埋まる", () => {
    setup(
      buildGame({
        players: [
          buildPlayer({ id: "p1", name: "あき", hand: { owner: true, cards: [coin(1)] } }),
          buildPlayer({ id: "p2", name: "はると" }),
          buildPlayer({ id: "p3", name: "CPU3" }),
          buildPlayer({ id: "p4", name: "みなと" }),
        ],
      })
    );

    expect(seatOf("はると")).toHaveAttribute("data-position", "left");
    expect(seatOf("CPU3")).toHaveAttribute("data-position", "top");
    expect(seatOf("みなと")).toHaveAttribute("data-position", "right");
  });

  it("観戦者からは全員が卓の向こうに見える", () => {
    render(
      <GameBoard
        code={CODE}
        game={buildGame()}
        tick={buildTick()}
        credentials={{ playerId: "unknown", token: "t9" }}
        reload={vi.fn()}
      />
    );

    expect(screen.getAllByTestId("seat")).toHaveLength(3);
    expect(seatOf("あき")).toHaveAttribute("data-position", "top");
    expect(screen.getByText("観戦中")).toBeInTheDocument();
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

  it("横穴になる出目を常に示す（docs/spec.md §5）", () => {
    setup();

    expect(screen.getByText(/出目 6 は横穴/)).toBeInTheDocument();
  });

  it("どのレーンも同じ危険度なら、レーンごとの印は出さない（#67）", async () => {
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
    expect(screen.queryByText("横穴あり")).not.toBeInTheDocument();
  });

  it("目標値に下限がある設定では、危険なレーンにだけ印を出す（docs/spec.md §5）", async () => {
    const game = buildGame({
      rules: {
        laneCount: 3,
        maxLanesPerRound: 1,
        maxRounds: 13,
        jackpotThreshold: 5,
        sideHole: { minRoll: 6, minTarget: 6 },
      },
      lanes: [
        buildLane({ pending: Array.from({ length: 5 }, () => ({ faceUp: false as const })) }),
        buildLane(),
        buildLane(),
      ],
    });
    const { user } = setup(game);

    await user.click(screen.getByRole("button", { name: "1コイン札" }));

    expect(screen.getByText("目標値 6")).toBeInTheDocument();
    expect(screen.getByText("横穴あり")).toBeInTheDocument();
  });
});

describe("宣言（docs/realtime.md §8-3）", () => {
  it("カードとレーンを選ぶまで宣言できない", async () => {
    const { user } = setup();

    expect(screen.getByRole("button", { name: "宣言する" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "1コイン札" }));
    expect(screen.getByRole("button", { name: "宣言する" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "中央レーン" }));
    expect(screen.getByRole("button", { name: "宣言する" })).toBeEnabled();
  });

  it("選んだカードとレーンをサーバーへ送る", async () => {
    const fetchMock = mockApi();
    const { user } = setup(buildGame(), buildTick({ index: 3 }));

    await user.click(screen.getByRole("button", { name: "3コイン札" }));
    await user.click(screen.getByRole("button", { name: "右レーン" }));
    await user.click(screen.getByRole("button", { name: "宣言する" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/rooms/${CODE}/ticks/3/declarations`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: expect.stringContaining('"laneIndex":2'),
    });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: expect.stringContaining('"handIndexes":[2]'),
    });
  });

  it("降りることも同じ口へ送る", async () => {
    const fetchMock = mockApi();
    const { user } = setup(buildGame(), buildTick({ index: 3 }));

    await user.click(screen.getByRole("button", { name: "降りる" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // 送り先が分かれていると、どちらを選んだかが通信だけで分かってしまう（§8-3）
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/rooms/${CODE}/ticks/3/declarations`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: expect.stringContaining('"kind":"withdraw"'),
    });
  });

  it("宣言を済ませたら、自分が何を宣言したかだけは見える", () => {
    setup(
      buildGame({
        players: [
          buildPlayer({ id: "p1", name: "あき", hand: { owner: true, cards: [coin(1)] } }),
          buildPlayer({ id: "p2", name: "はると" }),
          buildPlayer({ id: "p3", name: "そら" }),
        ],
      }),
      buildTick({
        players: [
          buildTickPlayer({
            id: "p1",
            declared: true,
            declaration: { kind: "insert", laneIndex: 0, handIndexes: [0] },
          }),
          buildTickPlayer({ id: "p2", declared: true }),
          buildTickPlayer({ id: "p3" }),
        ],
      })
    );

    expect(screen.getByText(/左レーンへ投入すると宣言しました/)).toBeInTheDocument();
  });

  it("宣言を済ませたら、もう手札もレーンも選べない", () => {
    setup(
      buildGame(),
      buildTick({
        players: [
          buildTickPlayer({ id: "p1", declared: true, declaration: { kind: "withdraw" } }),
          buildTickPlayer({ id: "p2" }),
          buildTickPlayer({ id: "p3" }),
        ],
      })
    );

    expect(screen.getByRole("button", { name: "中央レーン" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "1コイン札" })).toBeDisabled();
  });

  it("締め切りまでは、宣言を取り下げて選び直せる", async () => {
    const fetchMock = mockApi();
    const { user } = setup(
      buildGame(),
      buildTick({
        index: 3,
        players: [
          buildTickPlayer({ id: "p1", declared: true, declaration: { kind: "withdraw" } }),
          buildTickPlayer({ id: "p2" }),
          buildTickPlayer({ id: "p3" }),
        ],
      })
    );

    await user.click(screen.getByRole("button", { name: "取り消す" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // 取り下げは「降りる宣言」とは別物。選び直せる状態に戻すだけ（§8-3）
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/rooms/${CODE}/ticks/3/declarations`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "DELETE" });
  });

  it("宣言に失敗したら理由を表示する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: () =>
          Promise.resolve({ error: { code: "UNPROCESSABLE", message: "その手札は出せない" } }),
      })
    );
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "1コイン札" }));
    await user.click(screen.getByRole("button", { name: "左レーン" }));
    await user.click(screen.getByRole("button", { name: "宣言する" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("その手札は出せない");
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
        tick={buildTick()}
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

  it("終了後は宣言できない", () => {
    setup(buildGame({ phase: "finished" }));

    expect(screen.queryByRole("button", { name: "宣言する" })).not.toBeInTheDocument();
  });
});

describe("レーン本数が違う設定", () => {
  it("4本でも名前がないレーンを添字で表示する", () => {
    setup(
      buildGame({
        rules: {
          laneCount: 4,
          maxLanesPerRound: 1,
          maxRounds: 13,
          jackpotThreshold: 5,
          sideHole: { minRoll: 6, minTarget: 1 },
        },
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

describe("3拍の進行（docs/realtime.md §8）", () => {
  /** 席は あき（自分）／はると／そら の3人 */
  const game = buildGame({
    players: [
      buildPlayer({
        id: "p1",
        name: "あき",
        hand: { owner: true, cards: [coin(1), coin(2), coin(3)] },
      }),
      buildPlayer({ id: "p2", name: "はると" }),
      buildPlayer({ id: "p3", name: "そら" }),
    ],
  });

  /** 宣言の拍。はるとだけが宣言を済ませている */
  const declaring = (overrides: Partial<TickView> = {}): TickView =>
    buildTick({
      index: 3,
      deadlineAt: NOW + 8_000,
      players: [
        buildTickPlayer({ id: "p1" }),
        buildTickPlayer({ id: "p2", declared: true }),
        buildTickPlayer({ id: "p3" }),
      ],
      ...overrides,
    });

  /** 先行権順に、はると → あき の2人ぶん。2人目は横穴 */
  const STEPS = [
    buildStep({
      playerIndex: 1,
      lanes: [
        { laneIndex: 1, insertedCoins: 2, target: 4, roll: 4, outcome: "success", droppedCount: 1 },
      ],
      gainedPoints: 3,
    }),
    buildStep({
      playerIndex: 0,
      lanes: [
        {
          laneIndex: 0,
          insertedCoins: 1,
          target: 7,
          roll: 6,
          outcome: "sideHole",
          droppedCount: 0,
        },
      ],
      gainedPoints: 0,
      busted: true,
    }),
  ];

  const resolving = (overrides: Partial<TickView> = {}): TickView =>
    declaring({ phase: "resolving", resolvedAt: NOW, steps: STEPS, ...overrides });

  it("いまどの拍かを常に出しておく", () => {
    setup(game, declaring());

    expect(screen.getByTestId("tick-banner")).toHaveAttribute("data-phase", "declaring");
  });

  it("宣言の拍では、締め切りまでの残りと宣言した人数を出す", () => {
    setup(game, declaring());

    expect(screen.getByText("残り8秒")).toBeInTheDocument();
    expect(screen.getByText("1/3人")).toBeInTheDocument();
  });

  it("宣言の拍では、誰が宣言を済ませたかが席に出る", () => {
    setup(game, declaring());

    expect(within(screen.getByLabelText("はるとの席")).getByText("宣言済み")).toBeInTheDocument();
    expect(within(screen.getByLabelText("そらの席")).getByText("考え中")).toBeInTheDocument();
  });

  it("公開までは、他人が何を宣言したかが画面のどこにも出ない", () => {
    const { container } = setup(game, declaring());

    // サーバーは中身を送ってこないが、画面が推測して埋めることもしない（§8-3）
    expect(screen.queryByTestId("reveal-row")).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/降りた/);
  });

  it("宣言したかどうかが届いていない席は、まだ考えていると見なす", () => {
    // 卓のどの向きの席でも、自分の席でも同じに扱う
    const four = buildGame({
      players: [...game.players, buildPlayer({ id: "p4", name: "みなと" })],
    });
    setup(four, declaring({ players: [] }));

    expect(within(screen.getByLabelText("はるとの席")).getByText("考え中")).toBeInTheDocument();
    expect(within(screen.getByLabelText("そらの席")).getByText("考え中")).toBeInTheDocument();
    expect(within(screen.getByLabelText("あきの席")).getByText("考え中")).toBeInTheDocument();
    expect(screen.getByText("0/4人")).toBeInTheDocument();
  });

  it("公開の拍では、全員の宣言が一斉に開く", () => {
    setup(
      game,
      declaring({
        phase: "revealing",
        players: [
          buildTickPlayer({
            id: "p1",
            declared: true,
            declaration: { kind: "insert", laneIndex: 0, handIndexes: [0] },
          }),
          buildTickPlayer({ id: "p2", declared: true, declaration: { kind: "withdraw" } }),
          buildTickPlayer({ id: "p3" }),
        ],
      })
    );

    expect(screen.getAllByTestId("reveal-row")).toHaveLength(3);
    expect(screen.getByText("降りた")).toBeInTheDocument();
  });

  it("公開の拍では、宣言の操作を出さない", () => {
    setup(game, declaring({ phase: "revealing" }));

    expect(screen.queryByRole("button", { name: "宣言する" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "降りる" })).not.toBeInTheDocument();
    expect(screen.getByText("全員の狙いが開きました")).toBeInTheDocument();
  });

  it("解決の拍では、先頭の1人ぶんだけが動く", () => {
    setup(game, resolving());

    expect(screen.getAllByTestId("resolution-step")).toHaveLength(1);
    expect(screen.getByLabelText("出目 4")).toBeInTheDocument();
    expect(screen.queryByLabelText("出目 6")).not.toBeInTheDocument();
    expect(screen.getByText("先行権の順に解決しています")).toBeInTheDocument();
  });

  it("解決の拍では、投入されたカードがそのレーンへ飛んでいく", () => {
    setup(game, resolving());

    const lane = screen.getByRole("button", { name: "中央レーン" });
    expect(within(lane).getByTestId("tossed-card")).toBeInTheDocument();
    expect(within(lane).getByText("+3点")).toBeInTheDocument();
  });

  it("時間が経つと、次の人へ進む", async () => {
    setup(game, resolving());

    await vi.advanceTimersByTimeAsync(1_500);

    await waitFor(() => expect(screen.getByLabelText("出目 6")).toBeInTheDocument());
    expect(screen.getAllByTestId("resolution-step")).toHaveLength(1);
  });

  it("解決の拍では、いま誰の番が動いているかが分かる", () => {
    setup(game, resolving());

    expect(within(screen.getByTestId("tick-banner")).getByText("はると")).toBeInTheDocument();
  });

  it("解決の拍では、いま動いている人の席だけが光る", () => {
    setup(game, resolving());

    expect(screen.getByLabelText("はるとの席")).toHaveAttribute("data-current", "true");
    expect(screen.getByLabelText("そらの席")).toHaveAttribute("data-current", "false");
  });

  it("自分の番が来たら、手前の席が光る", async () => {
    setup(game, resolving());

    await vi.advanceTimersByTimeAsync(1_500);

    await waitFor(() =>
      expect(screen.getByLabelText("あきの席")).toHaveAttribute("data-current", "true")
    );
  });

  it("再生しきったら、解決の表示を畳む", async () => {
    setup(game, resolving({ steps: [STEPS[0] as (typeof STEPS)[number]] }));

    await vi.advanceTimersByTimeAsync(1_500);

    await waitFor(() => expect(screen.queryByTestId("resolution-step")).not.toBeInTheDocument());
  });

  it("解決の時刻がまだ来ていなければ、先頭から再生する", () => {
    setup(game, resolving({ resolvedAt: null }));

    expect(screen.getByLabelText("出目 4")).toBeInTheDocument();
  });

  it("卓を離れた人の解決でも、画面は止まらない", () => {
    setup(game, resolving({ steps: [buildStep({ playerIndex: 9 })] }));

    expect(screen.getByTestId("resolution-step")).toBeInTheDocument();
    expect(within(screen.getByTestId("tick-banner")).queryByText("はると")).not.toBeInTheDocument();
  });

  it("締め切りを過ぎても動かないときは、進行を1回だけ促す", async () => {
    const fetchMock = mockApi();
    setup(game, declaring({ deadlineAt: NOW + 1_000 }));

    await vi.advanceTimersByTimeAsync(2_000);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/rooms/${CODE}/ticks/3/resolve`);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("進行を促すのに失敗しても、画面は壊れない", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    setup(game, declaring({ deadlineAt: NOW + 1_000 }));

    await vi.advanceTimersByTimeAsync(2_000);

    // 肩を叩くだけなので、失敗をユーザーに見せない（§8-2）
    await waitFor(() => expect(screen.getByTestId("tick-banner")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("終わった卓では、進行を促さない", async () => {
    const fetchMock = mockApi();
    setup({ ...game, phase: "finished" }, declaring({ deadlineAt: NOW - 1_000 }));

    await vi.advanceTimersByTimeAsync(2_000);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("先行権の列を、解決する順に出す", () => {
    setup(game, declaring({ order: [1, 2, 0] }));

    const row = within(screen.getByLabelText("先行権の順"));
    expect(row.getAllByTestId("priority-seat").map((n) => n.textContent)).toEqual([
      "1はると",
      "2そら",
      "3あき",
    ]);
  });

  it("宣言の拍でも先行権の列は見えている", () => {
    setup(game, declaring({ order: [1, 2, 0] }));

    // いつ降りれば次に何番目になるかが読めないと、降りる判断ができない
    expect(screen.getByTestId("tick-banner")).toHaveAttribute("data-phase", "declaring");
    expect(screen.getByLabelText("先行権の順")).toBeInTheDocument();
  });

  it("解決の拍では、列の中でいま動いている人が分かる", () => {
    setup(game, resolving({ order: [1, 2, 0] }));

    const seats = within(screen.getByLabelText("先行権の順")).getAllByTestId("priority-seat");
    expect(seats[0]).toHaveAttribute("data-moving", "true");
    expect(seats[1]).toHaveAttribute("data-moving", "false");
  });
});
