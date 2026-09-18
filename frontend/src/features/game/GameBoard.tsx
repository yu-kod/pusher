import { useEffect, useRef, useState } from "react";
import {
  declareInsert,
  declareWithdraw,
  insertCard,
  resolveTick,
  retractDeclaration,
  stopTurn,
  type InsertResult,
} from "@/lib/api";
import { messageOf } from "@/lib/errors";
import { ErrorMessage } from "@/components/ErrorMessage";
import { Lane } from "./components/Lane";
import { HandCard } from "./components/HandCard";
import { Die } from "./components/Die";
import { Seat } from "./components/Seat";
import { TickBanner } from "./components/TickBanner";
import { RevealPanel } from "./components/RevealPanel";
import { ResolutionPanel } from "./components/ResolutionPanel";
import { DeclarationActions } from "./components/DeclarationActions";
import { secondsLeft, stepAt } from "./tick";
import { useNow } from "./useNow";
import { assignSeats, type Seat as SeatData, type SeatPosition } from "./seating";
import { sideHoleHint } from "@/lib/rules";
import type { Card, Credentials, GameView, PlayerView, TickPhase } from "@/lib/types";

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

/**
 * 対局画面。
 *
 * 1台のプッシャー台を全員で囲むのがこのゲームの核なので、画面も卓を囲んでいる
 * 形にしている。自分は手前、他のプレイヤーは卓の周り、台は真ん中。
 *
 * これは**卓上でやっていることをそのまま写したもの**で、画面が独自の物理を
 * 持つことはない。押し出しの結果はサーバー（＝ダイスと枚数）が決める。
 */
export function GameBoard({ code, game, credentials, reload }: Props) {
  /** 選んだ手札。描画したカードをそのまま持つので、添字から引き直さなくてよい */
  const [selected, setSelected] = useState<{ handIndex: number; card: Card } | null>(null);
  const [selectedLane, setSelectedLane] = useState<number | null>(null);
  const [result, setResult] = useState<InsertResult | null>(null);
  /** 結果が来るたびに増やす。アニメーションを振り直すための key に使う */
  const [resultSeq, setResultSeq] = useState(0);
  /** いま投入したカードが、どのレーンへ入ったか */
  const [flight, setFlight] = useState<{ laneIndex: number; card: Card } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const myIndex = game.players.findIndex((p) => p.id === credentials.playerId);
  const me = myIndex < 0 ? undefined : game.players[myIndex];
  const myHand = me?.hand.owner === true ? me.hand.cards : [];
  const isMyTurn = game.players[game.currentPlayerIndex]?.id === credentials.playerId;
  const finished = game.phase === "finished";

  // --- 3拍の進行（docs/realtime.md §8）。サーバーがまだ持っていなければ手番制のまま ---
  const tick = game.tick;
  const phase = tick?.phase;
  const inTick = tick !== undefined;
  // 表示のための時計。締め切りの判定そのものはサーバーが持つ（§8-2）
  const now = useNow(inTick);

  /** 解決を先頭から1歩ずつ再生する。全員ぶん届いていても、動かすのは1人ずつ（§8-5） */
  const playing =
    tick?.phase === "resolving"
      ? tick.steps[stepAt(tick.steps, now - (tick.resolvedAt ?? now))]
      : undefined;

  /** 自分の宣言。他人のぶんは公開の拍まで null で届く（§8-3） */
  const myDeclaration = me?.declaration ?? null;
  const declaredCount = game.players.filter((p) => p.declared === true).length;

  /** いま盤面が動いている人。宣言と公開の拍では誰も動かない */
  const movingId = inTick
    ? (playing?.playerId ?? null)
    : (game.players[game.currentPlayerIndex]?.id ?? null);

  /** レーンと手札を選べるか。宣言を済ませたら締め切りまで触らせない */
  const canChoose = inTick ? phase === "declaring" && myDeclaration === null : isMyTurn;
  const choosingDisabled = !canChoose || finished || busy;

  const seats = assignSeats(game.players, myIndex < 0 ? 0 : myIndex);
  // 手前の席は自分専用で、操作と一緒に画面の下に出す。観戦者は席を持たないので、
  // 誰も手前に座らせず、全員を卓の向こう側に回す
  const around: SeatData<PlayerView>[] =
    me === undefined
      ? seats.map((seat) => (seat.position === "bottom" ? { ...seat, position: "top" } : seat))
      : seats.slice(1);
  const seatsAt = (position: SeatPosition): SeatData<PlayerView>[] =>
    around.filter((seat) => seat.position === position);

  /** 選んだカードをこのレーンへ入れたときの目標値（§3） */
  const targetFor = (laneIndex: number): number | null => {
    const card = selected?.card;
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
    selected === null || selectedLane === null
      ? null
      : { handIndex: selected.handIndex, laneIndex: selectedLane, card: selected.card };

  const onInsert = ({ handIndex, laneIndex, card }: NonNullable<typeof selection>) => {
    run(async () => {
      const res = await insertCard(code, credentials.token, laneIndex, [handIndex]);
      setResult(res.result);
      setResultSeq((seq) => seq + 1);
      // 投入したカードは手札から消えるので、飛んでいく絵のためにここで控える
      setFlight({ laneIndex, card });
      setSelected(null);
      setSelectedLane(null);
    });
  };

  const onDeclare = (
    tickIndex: number,
    { handIndex, laneIndex }: NonNullable<typeof selection>
  ) => {
    run(async () => {
      await declareInsert(
        code,
        credentials.token,
        tickIndex,
        laneIndex,
        handIndex,
        crypto.randomUUID()
      );
      setSelected(null);
      setSelectedLane(null);
    });
  };

  const onWithdraw = (tickIndex: number) => {
    run(async () => {
      await declareWithdraw(code, credentials.token, tickIndex, crypto.randomUUID());
      setSelected(null);
      setSelectedLane(null);
    });
  };

  const onRetract = (tickIndex: number) => {
    run(async () => {
      await retractDeclaration(code, credentials.token, tickIndex);
    });
  };

  const onStop = () => {
    run(async () => {
      await stopTurn(code, credentials.token);
      setResult(null);
      setFlight(null);
    });
  };

  const canInsert = isMyTurn && !finished && selection !== null;

  /**
   * 締め切りを過ぎても誰も動かないときに、進行を1回だけ促す（docs/realtime.md §8-2）。
   *
   * Lambda には常駐プロセスが無く、締め切りは「時刻」として状態に置かれている。
   * 通りかかったリクエストが解決する作りなので、誰も操作していない卓が止まらない
   * ように、クライアントが1回だけ肩を叩く。解決は冪等なので、全員が投げても1回しか進まない。
   */
  const nudgedTick = useRef<number | null>(null);
  const tickIndex = tick?.index;
  const deadlineAt = tick?.deadlineAt;
  useEffect(() => {
    if (phase !== "declaring" || tickIndex === undefined || deadlineAt === undefined) {
      return;
    }
    if (now < deadlineAt || nudgedTick.current === tickIndex) {
      return;
    }
    nudgedTick.current = tickIndex;
    void (async () => {
      try {
        await resolveTick(code, credentials.token, tickIndex);
        await reload();
      } catch {
        // 肩を叩くだけなので、失敗しても画面には出さない。締め切りは過ぎたままなので、
        // 次に誰かが動けばそこで解決される
      }
    })();
  }, [phase, tickIndex, deadlineAt, now, code, credentials.token, reload]);

  return (
    <main className="table-felt fixed inset-0 flex flex-col overflow-hidden text-emerald-50">
      <Header game={game} showTurn={!inTick} />

      {tick !== undefined && (
        <TickBanner
          phase={tick.phase}
          secondsLeft={secondsLeft(tick.deadlineAt, now)}
          declaredCount={declaredCount}
          playerCount={game.players.length}
          resolving={
            playing === undefined
              ? null
              : (game.players.find((p) => p.id === playing.playerId)?.name ?? null)
          }
        />
      )}

      {/* 卓。自分は手前、他のプレイヤーは周り、台は真ん中 */}
      <div className="relative min-h-0 flex-1">
        <div className="absolute top-1/2 left-1 flex -translate-y-1/2 flex-col gap-2">
          {seatsAt("left").map((seat) => (
            <SeatOf key={seat.player.id} seat={seat} movingId={movingId} phase={phase} />
          ))}
        </div>
        <div className="absolute top-1/2 right-1 flex -translate-y-1/2 flex-col gap-2">
          {seatsAt("right").map((seat) => (
            <SeatOf key={seat.player.id} seat={seat} movingId={movingId} phase={phase} />
          ))}
        </div>

        {/*
         * 向かいの席と卓の中央は同じ流れに置く。別々の層に絶対配置すると、
         * レーンが深くなったぶんだけ台が伸びて席に乗り上げる。左右の席は
         * 上下の中央に貼りつくので、縦には干渉しない
         */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-[4.5rem] py-1">
          {seatsAt("top").length > 0 && (
            <div className="flex shrink-0 justify-center gap-2">
              {seatsAt("top").map((seat) => (
                <SeatOf key={seat.player.id} seat={seat} movingId={movingId} phase={phase} />
              ))}
            </div>
          )}

          <Piles drawCount={game.drawPileCount} discardCount={game.discardPileCount} />

          <section
            aria-label="プッシャー台"
            className="grid gap-2 rounded-xl border-4 border-[#5c3a21] bg-[#3b2515] p-2 shadow-[0_6px_16px_rgba(0,0,0,0.5)]"
            style={{ gridTemplateColumns: `repeat(${game.lanes.length}, minmax(0, 1fr))` }}
          >
            {game.lanes.map((lane, index) => (
              <Lane
                key={index}
                lane={lane}
                index={index}
                laneCount={game.lanes.length}
                target={targetFor(index)}
                risky={riskyFor(targetFor(index))}
                selected={selectedLane === index}
                disabled={choosingDisabled}
                onSelect={() => setSelectedLane(index)}
                flight={
                  flight !== null && flight.laneIndex === index && result !== null
                    ? { seq: resultSeq, card: flight.card, gained: result.gainedPoints }
                    : null
                }
              />
            ))}
          </section>

          <p className="text-center text-[11px] text-red-200">
            {sideHoleHint(game.rules.sideHole)} — 未確定得点はジャックポットへ
          </p>
        </div>

        {phase === "revealing" && <RevealPanel players={game.players} />}
        {playing !== undefined && (
          <ResolutionPanel
            step={playing}
            name={game.players.find((p) => p.id === playing.playerId)?.name ?? ""}
          />
        )}
        {!inTick && result !== null && <ResultPanel key={resultSeq} result={result} />}
        {finished && <Result game={game} />}
      </div>

      {/* 手前。自分の席と手札と操作 */}
      <footer className="shrink-0 border-t-4 border-[#5c3a21] bg-[#3b2515]/95 px-3 pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] shadow-[0_-4px_12px_rgba(0,0,0,0.5)]">
        <ErrorMessage message={error} />

        <Hand
          cards={myHand}
          selectedIndex={selected?.handIndex ?? null}
          disabled={choosingDisabled}
          onSelect={(handIndex, card) => setSelected({ handIndex, card })}
        />

        <div className="mt-2 flex items-center justify-between gap-2">
          {me !== undefined ? (
            <Seat
              name={me.name}
              points={me.points}
              handCount={myHand.length}
              position="bottom"
              current={movingId === me.id}
              currentLabel={phase === undefined ? undefined : "解決中"}
              isMe
              declared={phase === "declaring" ? (me.declared ?? false) : null}
            />
          ) : (
            <span className="rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-[13px] text-emerald-50/60">
              観戦中
            </span>
          )}

          {!finished && <PendingPoints points={game.pendingPoints} />}
        </div>

        {!finished && tick !== undefined && tick.phase === "declaring" && (
          <DeclarationActions
            declared={myDeclaration}
            canDeclare={selection !== null}
            busy={busy}
            onDeclare={selection === null ? undefined : () => onDeclare(tick.index, selection)}
            onWithdraw={() => onWithdraw(tick.index)}
            onCancel={() => onRetract(tick.index)}
          />
        )}

        {!finished && inTick && phase !== "declaring" && (
          <p className="mt-2 py-2 text-center text-[13px] text-emerald-50/60">
            {phase === "revealing" ? "全員の狙いが開きました" : "先行権の順に解決しています"}
          </p>
        )}

        {!finished && !inTick && (
          <TurnActions
            isMyTurn={isMyTurn}
            busy={busy}
            canInsert={canInsert}
            canStop={game.insertionRoundsThisTurn > 0}
            onInsert={selection === null ? undefined : () => onInsert(selection)}
            onStop={onStop}
          />
        )}
      </footer>
    </main>
  );
}

function SeatOf({
  seat,
  movingId,
  phase,
}: {
  seat: SeatData<PlayerView>;
  /** いま盤面が動いている人。誰も動いていなければ null */
  movingId: string | null;
  phase: TickPhase | undefined;
}) {
  const { player } = seat;
  return (
    <Seat
      name={player.name}
      points={player.points}
      handCount={player.hand.owner ? player.hand.cards.length : player.hand.count}
      position={seat.position}
      current={movingId === player.id}
      // 3拍の進行に手番は無い。動いている席には、いま起きていることを添える
      currentLabel={phase === undefined ? undefined : "解決中"}
      isMe={false}
      // 宣言の拍で出せるのは真偽値だけ。何を宣言したかは席に出さない（§8-3）
      declared={phase === "declaring" ? (player.declared ?? false) : null}
    />
  );
}

function Header({ game, showTurn }: { game: GameView; showTurn: boolean }) {
  const current = game.players[game.currentPlayerIndex];

  return (
    <header className="flex shrink-0 items-center justify-between bg-black/30 px-3 py-1.5 text-[13px]">
      <p className="text-emerald-50/70">
        ラウンド {game.round} / {game.rules.maxRounds}
      </p>
      {showTurn && (
        <p>
          手番 <span className="font-bold text-amber-200">{current?.name}</span>
        </p>
      )}
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
      className="animate-slide-up absolute inset-x-2 bottom-2 mx-auto flex max-w-md items-center gap-3 rounded-lg bg-black/70 px-3 py-2 text-sm backdrop-blur-[2px]"
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
  onSelect: (index: number, card: Card) => void;
};

/** 手札を1枚ぶんずらす量（px）。枚数が増えるほど詰める */
const FAN_SPREAD = 240;
/** 扇の端から端までの角度（度） */
const FAN_ANGLE = 14;

/**
 * 自分の手札。実際に手に持っているように、扇状に広げて並べる。
 *
 * 中身が見えるのは自分の手札だけ（`docs/spec.md` §8）。
 */
function Hand({ cards, selectedIndex, disabled, onSelect }: HandProps) {
  const count = cards.length;

  if (count === 0) {
    return (
      <p className="flex h-[84px] items-center justify-center text-sm text-emerald-50/60">
        手札がありません
      </p>
    );
  }

  const step = Math.min(44, FAN_SPREAD / count);
  const angleStep = count === 1 ? 0 : FAN_ANGLE / (count - 1);

  return (
    <section aria-label={`あなたの手札（${count}枚）`} className="relative h-[84px]">
      {cards.map((card, index) => {
        const offset = index - (count - 1) / 2;
        return (
          <div
            key={index}
            className="absolute bottom-0 left-1/2 origin-bottom"
            style={{
              transform: `translateX(${offset * step - 27}px) rotate(${offset * angleStep}deg)`,
              zIndex: index,
            }}
          >
            <HandCard
              card={card}
              selected={selectedIndex === index}
              disabled={disabled}
              onSelect={() => onSelect(index, card)}
            />
          </div>
        );
      })}
    </section>
  );
}

/** 机の脇に置く山札と捨て札。どちらも中身は見えない（枚数だけが公開情報） */
function Piles({ drawCount, discardCount }: { drawCount: number; discardCount: number }) {
  return (
    <section className="flex items-end justify-center gap-6 text-[11px] text-emerald-50/60">
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

/** 未確定得点。押し引きの中心なので大きく見せる（docs/spec.md §3） */
function PendingPoints({ points }: { points: number }) {
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-lg bg-black/40 px-3 py-1.5">
      <span className="text-[10px] tracking-wider text-emerald-50/60">未確定</span>
      <span className="text-xl leading-none font-bold text-amber-200 tabular-nums">{points}点</span>
    </div>
  );
}

type TurnActionsProps = {
  isMyTurn: boolean;
  busy: boolean;
  canInsert: boolean;
  canStop: boolean;
  /** カードとレーンが選ばれていないときは undefined（ボタンも押せない） */
  onInsert?: () => void;
  onStop: () => void;
};

/** 手番の操作 */
function TurnActions({ isMyTurn, busy, canInsert, canStop, onInsert, onStop }: TurnActionsProps) {
  if (!isMyTurn) {
    return (
      <p className="mt-2 py-2 text-center text-[13px] text-emerald-50/60">
        他のプレイヤーの手番です
      </p>
    );
  }

  return (
    <div className="mt-2 flex gap-2">
      <button
        type="button"
        onClick={onInsert}
        disabled={!canInsert || busy}
        className="min-w-0 flex-1 rounded-lg bg-amber-400 px-3 py-2.5 font-bold whitespace-nowrap text-amber-950 shadow-[0_3px_0_#92400e] active:translate-y-0.5 active:shadow-[0_1px_0_#92400e] disabled:opacity-40"
      >
        投入する
      </button>
      <button
        type="button"
        onClick={onStop}
        disabled={!canStop || busy}
        className="shrink-0 rounded-lg border-2 border-emerald-50/50 px-4 py-2.5 font-bold whitespace-nowrap text-emerald-50 disabled:opacity-40"
      >
        やめる
      </button>
    </div>
  );
}

function Result({ game }: { game: GameView }) {
  const best = Math.max(...game.players.map((p) => p.points));
  const winners = game.players.filter((p) => p.points === best);

  return (
    <section
      aria-labelledby="result-heading"
      className="animate-slide-up absolute inset-x-4 top-1/2 mx-auto max-w-sm -translate-y-1/2 rounded-xl border-4 border-amber-300 bg-black/85 p-4 text-center backdrop-blur-[2px]"
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
