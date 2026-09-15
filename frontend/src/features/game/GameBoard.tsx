import { useState } from "react";
import { insertCard, stopTurn, type InsertResult } from "@/lib/api";
import { messageOf } from "@/lib/errors";
import { ErrorMessage } from "@/components/ErrorMessage";
import { Lane } from "./components/Lane";
import { HandCard } from "./components/HandCard";
import type { Credentials, GameView } from "@/lib/types";

type Props = {
  code: string;
  game: GameView;
  credentials: Credentials;
  reload: () => Promise<void>;
};

const OUTCOME_LABEL: Record<InsertResult["lanes"][number]["outcome"], string> = {
  success: "成功",
  failure: "失敗",
  sideHole: "横穴",
};

export function GameBoard({ code, game, credentials, reload }: Props) {
  const [selectedHand, setSelectedHand] = useState<number | null>(null);
  const [selectedLane, setSelectedLane] = useState<number | null>(null);
  const [result, setResult] = useState<InsertResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const me = game.players.find((p) => p.id === credentials.playerId);
  const myHand = me?.hand.owner === true ? me.hand.cards : [];
  const isMyTurn = game.players[game.currentPlayerIndex]?.id === credentials.playerId;
  const finished = game.phase === "finished";

  /** 選んだカードをこのレーンへ入れたときの目標値（§3） */
  const targetFor = (laneIndex: number): number | null => {
    const card = selectedHand === null ? undefined : myHand[selectedHand];
    const lane = game.lanes[laneIndex];
    if (card === undefined || card.kind !== "coin" || lane === undefined) {
      return null;
    }
    return card.coins + lane.pending.length;
  };

  const run = (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        await action();
        await reload();
      } catch (cause) {
        setError(messageOf(cause));
      } finally {
        setBusy(false);
      }
    })();
  };

  /** カードとレーンの両方が選ばれていれば、投入に必要な組み合わせ */
  const selection =
    selectedHand === null || selectedLane === null
      ? null
      : { handIndex: selectedHand, laneIndex: selectedLane };

  const onInsert = ({ handIndex, laneIndex }: { handIndex: number; laneIndex: number }) => {
    run(async () => {
      const res = await insertCard(code, credentials.token, laneIndex, [handIndex]);
      setResult(res.result);
      setSelectedHand(null);
      setSelectedLane(null);
    });
  };

  const onStop = () => {
    run(async () => {
      await stopTurn(code, credentials.token);
      setResult(null);
    });
  };

  const canInsert = isMyTurn && !finished && selection !== null;

  return (
    <main className="mx-auto max-w-md p-4 pb-24">
      <Header game={game} />

      <section className="mt-4 grid grid-cols-3 gap-2">
        {game.lanes.map((lane, index) => (
          <Lane
            key={index}
            lane={lane}
            index={index}
            target={targetFor(index)}
            selected={selectedLane === index}
            disabled={!isMyTurn || finished || busy}
            onSelect={() => setSelectedLane(index)}
          />
        ))}
      </section>

      {result !== null && <ResultPanel result={result} />}

      <ErrorMessage message={error} />

      <section className="mt-6">
        <h2 className="text-sm font-medium text-gray-600">あなたの手札（{myHand.length}枚）</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {myHand.map((card, index) => (
            <HandCard
              key={index}
              card={card}
              selected={selectedHand === index}
              disabled={!isMyTurn || finished || busy}
              onSelect={() => setSelectedHand(index)}
            />
          ))}
          {myHand.length === 0 && <p className="text-sm text-gray-500">手札がありません</p>}
        </div>
      </section>

      <Players game={game} myId={credentials.playerId} />

      {finished ? (
        <Result game={game} />
      ) : (
        <TurnActions
          isMyTurn={isMyTurn}
          busy={busy}
          canInsert={canInsert}
          canStop={game.insertionRoundsThisTurn > 0}
          pendingPoints={game.pendingPoints}
          onInsert={selection === null ? undefined : () => onInsert(selection)}
          onStop={onStop}
        />
      )}
    </main>
  );
}

function Header({ game }: { game: GameView }) {
  const current = game.players[game.currentPlayerIndex];

  return (
    <header className="flex items-baseline justify-between">
      <p className="text-sm text-gray-600">
        ラウンド {game.round} / {game.rules.maxRounds}
      </p>
      <p className="text-sm">
        手番 <span className="font-medium">{current?.name}</span>
      </p>
      <p className="text-sm text-gray-600">
        JP {game.jackpotPoints}点
        <span className="ml-1 text-xs">
          ({game.jackpotCounter}/{game.rules.jackpotThreshold})
        </span>
      </p>
    </header>
  );
}

function ResultPanel({ result }: { result: InsertResult }) {
  const lane = result.lanes[0];

  return (
    <section aria-live="polite" className="mt-4 rounded bg-gray-50 px-3 py-2 text-sm">
      {lane !== undefined && (
        <p>
          出目 <span className="font-bold">{lane.roll}</span> / 目標値 {lane.target} →{" "}
          <span className="font-bold">{OUTCOME_LABEL[lane.outcome]}</span>
        </p>
      )}
      <p className="mt-1">
        獲得 {result.gainedPoints}点
        {result.busted && (
          <span className="ml-2 font-bold text-red-700">横穴！ジャックポットへ</span>
        )}
      </p>
      {result.events.length > 0 && (
        <p className="mt-1 text-blue-700">
          イベント: {result.events.map((e) => e.event).join(", ")}
        </p>
      )}
      {result.jackpot !== null && (
        <p className="mt-1">
          JP判定 出目{result.jackpot.roll} →{" "}
          {result.jackpot.won ? `${result.jackpot.wonPoints}点 獲得！` : "はずれ"}
        </p>
      )}
    </section>
  );
}

function Players({ game, myId }: { game: GameView; myId: string }) {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-medium text-gray-600">得点</h2>
      <ul className="mt-2 divide-y divide-gray-200 rounded border border-gray-200 text-sm">
        {game.players.map((player, index) => (
          <li
            key={player.id}
            className={`flex justify-between px-3 py-2 ${
              index === game.currentPlayerIndex ? "bg-gray-50 font-medium" : ""
            }`}
          >
            <span>
              {player.name}
              {player.id === myId && <span className="ml-1 text-xs text-gray-500">（あなた）</span>}
            </span>
            <span>
              {player.points}点
              <span className="ml-2 text-xs text-gray-500">
                手札{player.hand.owner ? player.hand.cards.length : player.hand.count}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

type TurnActionsProps = {
  isMyTurn: boolean;
  busy: boolean;
  canInsert: boolean;
  canStop: boolean;
  pendingPoints: number;
  /** カードとレーンが選ばれていないときは undefined（ボタンも押せない） */
  onInsert?: () => void;
  onStop: () => void;
};

/**
 * 手番の操作。押し引きの中心なので、未確定得点を大きく見せる（docs/spec.md §3）。
 */
function TurnActions({
  isMyTurn,
  busy,
  canInsert,
  canStop,
  pendingPoints,
  onInsert,
  onStop,
}: TurnActionsProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white px-4 py-3">
      <div className="mx-auto flex max-w-md items-center gap-3">
        <div className="shrink-0">
          <p className="text-xs text-gray-500">未確定</p>
          <p className="text-2xl font-bold leading-none">{pendingPoints}点</p>
        </div>

        {isMyTurn ? (
          <div className="flex flex-1 gap-2">
            <button
              type="button"
              onClick={onInsert}
              disabled={!canInsert || busy}
              className="flex-1 rounded bg-gray-900 px-4 py-3 font-medium text-white disabled:opacity-40"
            >
              投入する
            </button>
            <button
              type="button"
              onClick={onStop}
              disabled={!canStop || busy}
              className="rounded border border-gray-900 px-4 py-3 font-medium disabled:opacity-40"
            >
              やめる
            </button>
          </div>
        ) : (
          <p className="flex-1 text-center text-sm text-gray-500">他のプレイヤーの手番です</p>
        )}
      </div>
    </div>
  );
}

function Result({ game }: { game: GameView }) {
  const best = Math.max(...game.players.map((p) => p.points));
  const winners = game.players.filter((p) => p.points === best);

  return (
    <section
      aria-labelledby="result-heading"
      className="mt-8 rounded border-2 border-gray-900 p-4 text-center"
    >
      <h2 id="result-heading" className="text-lg font-bold">
        ゲーム終了
      </h2>
      <p className="mt-2">
        勝者 <span className="font-bold">{winners.map((p) => p.name).join(" / ")}</span>（{best}点）
      </p>
    </section>
  );
}
