import { useState } from "react";
import { Link } from "react-router-dom";
import { PusherStage } from "@/features/pusher/PusherStage";
import { usePusherTable } from "@/features/pusher/usePusherTable";

/**
 * プッシャー台の手触りを確かめるための画面。
 *
 * ルールの本体（カードとダイス）はサーバーが持つ。ここで見たいのは
 * 「押されて落ちる」が気持ちいいかどうかだけなので、1人用のオフライン試作にしてある。
 * あとで通信につなぐときは `usePusherTable` の中身をサーバー駆動に差し替える。
 */
export function PusherPage() {
  const [runId, setRunId] = useState(0);
  return <PusherMachine key={runId} onRestart={() => setRunId((id) => id + 1)} />;
}

function PusherMachine({ onRestart }: { onRestart: () => void }) {
  const { table, bursts, drop } = usePusherTable();
  const [aimX, setAimX] = useState(table.config.width / 2);
  const empty = table.purse <= 0;

  return (
    <main className="pusher-cabinet fixed inset-0 flex flex-col overflow-hidden text-emerald-50">
      <header className="flex shrink-0 items-center gap-3 px-4 pt-[env(safe-area-inset-top)] pb-1">
        <Link
          to="/"
          className="rounded-full border border-white/15 px-3 py-1 text-xs text-emerald-50/70 hover:border-white/40"
        >
          ← 戻る
        </Link>
        <span className="text-[11px] font-bold tracking-[0.3em] text-amber-200/70">
          PUSHER TABLE
        </span>
      </header>

      <div className="grid shrink-0 grid-cols-3 gap-2 px-4 py-2">
        <Meter label="得点" value={table.score} tone="score" testId="hud-score" />
        <Meter label="ジャックポット" value={table.jackpot} tone="jackpot" testId="hud-jackpot" />
        <Meter label="手持ち" value={table.purse} tone="purse" testId="hud-purse" />
      </div>

      <div className="min-h-0 flex-1">
        <PusherStage
          table={table}
          bursts={bursts}
          aimX={aimX}
          onAim={setAimX}
          onDrop={(x) => {
            setAimX(x);
            drop(x);
          }}
        />
      </div>

      <footer className="shrink-0 space-y-2 px-4 pt-1 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <p className="text-center text-[11px] text-emerald-50/50" aria-live="polite">
          {empty
            ? "手持ちがなくなりました。落ちてくるのを待つか、最初からどうぞ"
            : "台をタップした位置にコインが落ちます"}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => drop(aimX)}
            disabled={empty}
            className="flex-1 rounded-xl bg-amber-400 py-3 font-bold text-amber-950 shadow-[0_4px_0_#92400e] transition active:translate-y-0.5 active:shadow-[0_1px_0_#92400e] disabled:opacity-40 disabled:shadow-none"
          >
            コインを投入
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="rounded-xl border border-white/20 px-4 py-3 text-sm font-medium text-emerald-50/80 hover:border-white/40"
          >
            最初から
          </button>
        </div>
      </footer>
    </main>
  );
}

const TONES = {
  score: "text-amber-200",
  jackpot: "text-rose-300",
  purse: "text-sky-200",
} as const;

function Meter({
  label,
  value,
  tone,
  testId,
}: {
  label: string;
  value: number;
  tone: keyof typeof TONES;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className="rounded-lg border border-white/10 bg-black/35 px-2 py-1 text-center"
    >
      <span className="block text-[10px] tracking-wider text-emerald-50/50">{label}</span>
      <span className={`block font-mono text-xl leading-tight font-bold ${TONES[tone]}`}>
        {value}
      </span>
    </div>
  );
}
