import { useState } from "react";
import { insertCard, stopTurn, type InsertResult } from "@/lib/api";
import { messageOf } from "@/lib/errors";
import { ErrorMessage } from "@/components/ErrorMessage";
import { Lane } from "./components/Lane";
import { HandCard } from "./components/HandCard";
import { Die } from "./components/Die";
import { sideHoleHint } from "@/lib/rules";
import type { Card, Credentials, GameView } from "@/lib/types";

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

const OUTCOME_STYLE: Record<InsertResult["lanes"][number]["outcome"], string> = {
  success: "bg-emerald-200 text-emerald-950",
  failure: "bg-stone-300 text-stone-800",
  sideHole: "bg-red-300 text-red-950",
};

export function GameBoard({ code, game, credentials, reload }: Props) {
  const [selectedHand, setSelectedHand] = useState<number | null>(null);
  const [selectedLane, setSelectedLane] = useState<number | null>(null);
  const [result, setResult] = useState<InsertResult | null>(null);
  /** 結果が来るたびに増やす。アニメーションを振り直すための key に使う */
  const [resultSeq, setResultSeq] = useState(0);
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

  /**
   * このレーンだけが横穴になりうるか（§5）。
   *
   * 下限が 1 のときはどのレーンでも起きるので、レーンごとの印は出さない。
   * 条件そのものは盤面の下に一行で出している。
   */
  const riskyFor = (target: number | null): boolean => {
    const { minTarget } = game.rules.sideHole;
    return target !== null && minTarget > 1 && target >= minTarget;
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
      setResultSeq((seq) => seq + 1);
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
    <main className="table-felt min-h-dvh px-3 pt-3 pb-32 text-emerald-50">
      <div className="mx-auto max-w-md">
        <Header game={game} />

        {/* プッシャー台。レーンを木枠にはめ込んで並べる */}
        <section
          className="mt-3 grid gap-2 rounded-xl border-4 border-[#5c3a21] bg-[#3b2515] p-2 shadow-[0_6px_16px_rgba(0,0,0,0.5)]"
          style={{ gridTemplateColumns: `repeat(${game.lanes.length}, minmax(0, 1fr))` }}
        >
          {game.lanes.map((lane, index) => (
            <Lane
              key={index}
              lane={lane}
              index={index}
              target={targetFor(index)}
              risky={riskyFor(targetFor(index))}
              selected={selectedLane === index}
              disabled={!isMyTurn || finished || busy}
              onSelect={() => setSelectedLane(index)}
            />
          ))}
        </section>

        <p className="mt-2 text-center text-[11px] text-red-200">
          {sideHoleHint(game.rules.sideHole)} — 未確定得点はジャックポットへ
        </p>

        <Piles drawCount={game.drawPileCount} discardCount={game.discardPileCount} />

        {result !== null && <ResultPanel key={resultSeq} result={result} />}

        <ErrorMessage message={error} />

        <Hand
          cards={myHand}
          selectedIndex={selectedHand}
          disabled={!isMyTurn || finished || busy}
          onSelect={setSelectedHand}
        />

        <Players game={game} myId={credentials.playerId} />

        {finished && <Result game={game} />}
      </div>

      {!finished && (
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
    <header className="flex items-center justify-between rounded-lg bg-black/30 px-3 py-2 text-[13px]">
      <p className="text-emerald-50/70">
        ラウンド {game.round} / {game.rules.maxRounds}
      </p>
      <p>
        手番 <span className="font-bold text-amber-200">{current?.name}</span>
      </p>
      <p className="text-emerald-50/70">
        JP {game.jackpotPoints}点
        <span className="ml-1 text-[11px]">
          ({game.jackpotCounter}/{game.rules.jackpotThreshold})
        </span>
      </p>
    </header>
  );
}

function ResultPanel({ result }: { result: InsertResult }) {
  const lane = result.lanes[0];

  return (
    <section
      aria-live="polite"
      className="animate-slide-up mt-3 flex items-center gap-3 rounded-lg bg-black/35 px-3 py-2 text-sm"
    >
      {lane !== undefined && <Die value={lane.roll} className="animate-die-roll" />}
      <div className="min-w-0 flex-1">
        {lane !== undefined && (
          <p className="flex items-center gap-2">
            <span className="text-emerald-50/70">目標値 {lane.target}</span>
            <span className={`rounded px-1.5 py-0.5 font-bold ${OUTCOME_STYLE[lane.outcome]}`}>
              {OUTCOME_LABEL[lane.outcome]}
            </span>
          </p>
        )}
        <p className="mt-1">
          獲得 <span className="font-bold text-amber-200">{result.gainedPoints}点</span>
          {result.busted && (
            <span className="ml-2 font-bold text-red-300">横穴！ジャックポットへ</span>
          )}
        </p>
        {result.events.length > 0 && (
          <p className="mt-1 text-sky-200">
            イベント: {result.events.map((e) => e.event).join(", ")}
          </p>
        )}
        {result.jackpot !== null && (
          <p className="mt-1">
            JP判定 出目{result.jackpot.roll} →{" "}
            {result.jackpot.won ? `${result.jackpot.wonPoints}点 獲得！` : "はずれ"}
          </p>
        )}
      </div>
    </section>
  );
}

type HandProps = {
  cards: Card[];
  selectedIndex: number | null;
  disabled: boolean;
  onSelect: (index: number) => void;
};

/** 手札。実際に手に持っているように少し重ねて並べる */
function Hand({ cards, selectedIndex, disabled, onSelect }: HandProps) {
  return (
    <section className="mt-4">
      <h2 className="text-xs font-medium text-emerald-50/60">あなたの手札（{cards.length}枚）</h2>
      <div className="mt-3 flex flex-wrap items-end pl-3">
        {cards.map((card, index) => (
          <div key={index} className="-ml-2.5">
            <HandCard
              card={card}
              selected={selectedIndex === index}
              disabled={disabled}
              onSelect={() => onSelect(index)}
            />
          </div>
        ))}
        {cards.length === 0 && <p className="text-sm text-emerald-50/60">手札がありません</p>}
      </div>
    </section>
  );
}

/** 机の脇に置く山札と捨て札。どちらも中身は見えない（枚数だけが公開情報） */
function Piles({ drawCount, discardCount }: { drawCount: number; discardCount: number }) {
  return (
    <section className="mt-3 flex items-end justify-center gap-8 text-[11px] text-emerald-50/60">
      <span className="flex flex-col items-center gap-1">
        <span className="relative h-[42px] w-[30px]" aria-hidden="true">
          <span className="card-back absolute top-0.5 left-0.5 block h-[42px] w-[30px] rounded-[3px] border border-black/25" />
          <span className="card-back absolute block h-[42px] w-[30px] rounded-[3px] border border-black/25" />
        </span>
        山札 {drawCount}枚
      </span>
      <span className="flex flex-col items-center gap-1">
        <span
          className="block h-[42px] w-[30px] rounded-[3px] border border-dashed border-white/25 bg-black/20"
          aria-hidden="true"
        />
        捨て札 {discardCount}枚
      </span>
    </section>
  );
}

function Players({ game, myId }: { game: GameView; myId: string }) {
  return (
    <section className="mt-6">
      <h2 className="text-xs font-medium text-emerald-50/60">得点</h2>
      <ul className="mt-2 divide-y divide-white/10 overflow-hidden rounded-lg bg-black/25 text-sm">
        {game.players.map((player, index) => (
          <li
            key={player.id}
            className={`flex items-center justify-between px-3 py-2 ${
              index === game.currentPlayerIndex ? "bg-amber-200/15 font-medium" : ""
            }`}
          >
            <span>
              {player.name}
              {player.id === myId && (
                <span className="ml-1 text-[11px] text-emerald-50/50">（あなた）</span>
              )}
            </span>
            <span className="flex items-center gap-2">
              <span className="font-bold text-amber-200">{player.points}点</span>
              <span className="flex items-center gap-1 text-[11px] text-emerald-50/50">
                <span
                  className="card-back h-4 w-3 rounded-[2px] border border-black/30"
                  aria-hidden="true"
                />
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
    <div className="fixed inset-x-0 bottom-0 border-t-4 border-[#5c3a21] bg-[#3b2515] px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.5)]">
      <div className="mx-auto flex max-w-md items-center gap-3">
        <div className="shrink-0 rounded-lg bg-black/40 px-3 py-1.5 text-center">
          <p className="text-[10px] tracking-wider text-emerald-50/60">未確定</p>
          <p className="text-2xl leading-none font-bold text-amber-200 tabular-nums">
            {pendingPoints}点
          </p>
        </div>

        {isMyTurn ? (
          <div className="flex flex-1 gap-2">
            <button
              type="button"
              onClick={onInsert}
              disabled={!canInsert || busy}
              className="flex-1 rounded-lg bg-amber-400 px-4 py-3 font-bold text-amber-950 shadow-[0_3px_0_#92400e] active:translate-y-0.5 active:shadow-[0_1px_0_#92400e] disabled:opacity-40"
            >
              投入する
            </button>
            <button
              type="button"
              onClick={onStop}
              disabled={!canStop || busy}
              className="rounded-lg border-2 border-emerald-50/50 px-4 py-3 font-bold text-emerald-50 disabled:opacity-40"
            >
              やめる
            </button>
          </div>
        ) : (
          <p className="flex-1 text-center text-sm text-emerald-50/60">他のプレイヤーの手番です</p>
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
      className="animate-slide-up mt-8 rounded-xl border-4 border-amber-300 bg-black/40 p-4 text-center"
    >
      <h2 id="result-heading" className="text-lg font-bold text-amber-200">
        ゲーム終了
      </h2>
      <p className="mt-2">
        勝者{" "}
        <span className="font-bold text-amber-200">{winners.map((p) => p.name).join(" / ")}</span>（
        {best}点）
      </p>
    </section>
  );
}
