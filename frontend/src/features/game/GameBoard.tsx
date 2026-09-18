import { useEffect, useRef, useState } from "react";
import { declareInsert, declareWithdraw, resolveTick, retractDeclaration } from "@/lib/api";
import { messageOf } from "@/lib/errors";
import { ErrorMessage } from "@/components/ErrorMessage";
import { Lane } from "./components/Lane";
import { HandCard } from "./components/HandCard";
import { Seat } from "./components/Seat";
import { TickBanner } from "./components/TickBanner";
import { RevealPanel } from "./components/RevealPanel";
import { PriorityRow } from "./components/PriorityRow";
import { ResolutionPanel } from "./components/ResolutionPanel";
import { DeclarationActions } from "./components/DeclarationActions";
import { secondsLeft, stepAt } from "./tick";
import { useNow } from "./useNow";
import { useFitScale } from "./useFitScale";
import { assignSeats, type Seat as SeatData, type SeatPosition } from "./seating";
import { sideHoleHint } from "@/lib/rules";
import type {
  Card,
  Credentials,
  GameView,
  PlayerView,
  ResolutionStepView,
  TickPhase,
  TickView,
} from "@/lib/types";

type Props = {
  code: string;
  game: GameView;
  tick: TickView;
  credentials: Credentials;
  reload: () => Promise<void>;
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
export function GameBoard({ code, game, tick, credentials, reload }: Props) {
  /** 選んだ手札。描画したカードをそのまま持つので、添字から引き直さなくてよい */
  const [selected, setSelected] = useState<{ handIndex: number; card: Card } | null>(null);
  const [selectedLane, setSelectedLane] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const myIndex = game.players.findIndex((p) => p.id === credentials.playerId);
  const me = myIndex < 0 ? undefined : game.players[myIndex];
  const myHand = me?.hand.owner === true ? me.hand.cards : [];
  const finished = game.phase === "finished";

  // --- 3拍の進行（docs/realtime.md §8） ---
  const phase = tick.phase;
  // 表示のための時計。締め切りの判定そのものはサーバーが持つ（§8-2）
  const now = useNow(!finished);

  /** 解決を先頭から1歩ずつ再生する。全員ぶん届いていても、動かすのは1人ずつ（§8-5） */
  const playing =
    phase === "resolving"
      ? tick.steps[stepAt(tick.steps, now - (tick.resolvedAt ?? now))]
      : undefined;

  /** 自分の宣言。他人のぶんは公開の拍まで null で届く（§8-3） */
  const myDeclaration = tick.players[myIndex]?.declaration ?? null;
  const declaredCount = tick.players.filter((p) => p.declared).length;

  /** いま盤面が動いている席。宣言と公開の拍では誰も動かない */
  const movingIndex = playing?.playerIndex ?? null;

  /** レーンと手札を選べるか。宣言を済ませたら締め切りまで触らせない */
  const canChoose = phase === "declaring" && myDeclaration === null;
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

  /**
   * 締め切りを過ぎても誰も動かないときに、進行を1回だけ促す（docs/realtime.md §8-2）。
   *
   * Lambda には常駐プロセスが無く、締め切りは「時刻」として状態に置かれている。
   * 通りかかったリクエストが解決する作りなので、誰も操作していない卓が止まらない
   * ように、クライアントが1回だけ肩を叩く。解決は冪等なので、全員が投げても1回しか進まない。
   */
  // 卓は人数・レーンの深さ・滞留の枚数で高さが変わる。縦が足りない画面では、
  // 卓から少し離れて見ているものとして丸ごと縮める
  const [tableBox, tableScale] = useFitScale();

  const nudgedTick = useRef<number | null>(null);
  const tickIndex = tick.index;
  const deadlineAt = tick.deadlineAt;
  useEffect(() => {
    // 終わった卓は誰も進めない。叩いても返るものが無いので、肩を叩きにいかない
    if (finished || phase !== "declaring") {
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
  }, [finished, phase, tickIndex, deadlineAt, now, code, credentials.token, reload]);

  return (
    <main className="table-felt fixed inset-0 flex flex-col overflow-hidden text-emerald-50">
      <Header game={game} />

      <TickBanner
        phase={phase}
        secondsLeft={secondsLeft(tick.deadlineAt, now)}
        declaredCount={declaredCount}
        playerCount={game.players.length}
        resolving={playing === undefined ? null : (game.players[playing.playerIndex]?.name ?? null)}
      />

      <PriorityRow
        players={game.players}
        order={tick.order}
        movingIndex={movingIndex}
        meIndex={myIndex}
      />

      {/* 卓。自分は手前、他のプレイヤーは周り、台は真ん中 */}
      <div className="relative min-h-0 flex-1">
        {/*
         * 左右の席も卓と同じ倍率で縮める。席だけ原寸だと、向かいの席とちぐはぐになる。
         * transform ではなく scale を使うのは、-translate-y-1/2 を打ち消さないため
         */}
        <div
          className="absolute top-1/2 left-1 flex -translate-y-1/2 flex-col gap-2"
          style={{ scale: `${tableScale}` }}
        >
          {seatsAt("left").map((seat) => (
            <SeatOf
              key={seat.player.id}
              seat={seat}
              movingIndex={movingIndex}
              phase={phase}
              declared={tick.players[seat.index]?.declared ?? false}
            />
          ))}
        </div>
        <div
          className="absolute top-1/2 right-1 flex -translate-y-1/2 flex-col gap-2"
          style={{ scale: `${tableScale}` }}
        >
          {seatsAt("right").map((seat) => (
            <SeatOf
              key={seat.player.id}
              seat={seat}
              movingIndex={movingIndex}
              phase={phase}
              declared={tick.players[seat.index]?.declared ?? false}
            />
          ))}
        </div>

        {/*
         * 向かいの席と卓の中央は同じ流れに置く。別々の層に絶対配置すると、
         * レーンが深くなったぶんだけ台が伸びて席に乗り上げる。左右の席は
         * 上下の中央に貼りつくので、縦には干渉しない
         */}
        <div
          ref={tableBox}
          className="absolute inset-0 flex flex-col items-center justify-center px-[4.5rem] py-1"
        >
          <div
            className="flex flex-col items-center gap-2"
            style={{ transform: `scale(${tableScale})`, transformOrigin: "center" }}
          >
            {seatsAt("top").length > 0 && (
              <div className="flex shrink-0 justify-center gap-2">
                {seatsAt("top").map((seat) => (
                  <SeatOf
                    key={seat.player.id}
                    seat={seat}
                    movingIndex={movingIndex}
                    phase={phase}
                    declared={tick.players[seat.index]?.declared ?? false}
                  />
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
                  flight={flightFor(playing, index)}
                />
              ))}
            </section>

            <p className="text-center text-[11px] text-red-200">
              {sideHoleHint(game.rules.sideHole)} — 未確定得点はジャックポットへ
            </p>
          </div>
        </div>

        {phase === "revealing" && <RevealPanel players={game.players} tick={tick.players} />}
        {playing !== undefined && (
          <ResolutionPanel step={playing} name={game.players[playing.playerIndex]?.name ?? ""} />
        )}
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
              current={movingIndex === myIndex}
              currentLabel="解決中"
              isMe
              declared={phase === "declaring" ? (tick.players[myIndex]?.declared ?? false) : null}
            />
          ) : (
            <span className="rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-[13px] text-emerald-50/60">
              観戦中
            </span>
          )}

          {!finished && <PendingPoints points={game.pendingPoints} />}
        </div>

        {!finished && phase === "declaring" && (
          <DeclarationActions
            declared={myDeclaration}
            canDeclare={selection !== null}
            busy={busy}
            onDeclare={selection === null ? undefined : () => onDeclare(tick.index, selection)}
            onWithdraw={() => onWithdraw(tick.index)}
            onCancel={() => onRetract(tick.index)}
          />
        )}

        {!finished && phase !== "declaring" && (
          <p className="mt-2 py-2 text-center text-[13px] text-emerald-50/60">
            {phase === "revealing" ? "全員の狙いが開きました" : "先行権の順に解決しています"}
          </p>
        )}
      </footer>
    </main>
  );
}

/**
 * いま解決しているレーンに、投入されたカードが飛んでくる絵。
 *
 * 投入したカードそのものは届かないが、1レーンに1枚なのでコイン数がそのまま
 * その1枚を表す（`docs/spec.md` §3 手順1）。
 */
function flightFor(
  step: ResolutionStepView | undefined,
  laneIndex: number
): { seq: number; card: Card; gained: number } | null {
  const lane = step?.lanes.find((l) => l.laneIndex === laneIndex);
  if (step === undefined || lane === undefined) {
    return null;
  }
  return {
    seq: step.playerIndex,
    card: { kind: "coin", coins: Math.min(lane.insertedCoins, 3) as 1 | 2 | 3 },
    gained: step.gainedPoints,
  };
}

function SeatOf({
  seat,
  movingIndex,
  phase,
  declared,
}: {
  seat: SeatData<PlayerView>;
  /** いま盤面が動いている席。誰も動いていなければ null */
  movingIndex: number | null;
  phase: TickPhase;
  declared: boolean;
}) {
  const { player } = seat;
  return (
    <Seat
      name={player.name}
      points={player.points}
      handCount={player.hand.owner ? player.hand.cards.length : player.hand.count}
      position={seat.position}
      current={movingIndex === seat.index}
      // 3拍の進行に手番は無い。動いている席には、いま起きていることを添える
      currentLabel="解決中"
      isMe={false}
      // 宣言の拍で出せるのは真偽値だけ。何を宣言したかは席に出さない（§8-3）
      declared={phase === "declaring" ? declared : null}
    />
  );
}

function Header({ game }: { game: GameView }) {
  return (
    <header className="flex shrink-0 items-center justify-between bg-black/30 px-3 py-1.5 text-[13px]">
      <p className="text-emerald-50/70">
        ラウンド {game.round} / {game.rules.maxRounds}
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
