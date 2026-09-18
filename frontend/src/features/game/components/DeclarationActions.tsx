import { cardLabel } from "@/lib/cards";
import { laneName } from "@/lib/rules";
import type { DeclarationView } from "@/lib/types";

type Props = {
  /** 自分の宣言。まだなら null。自分のぶんだけは宣言中も見える（§8-3） */
  declared: DeclarationView | null;
  /** レーンと手札が揃っているか */
  canDeclare: boolean;
  busy: boolean;
  /** 選びきっていないときは undefined（ボタンも押せない） */
  onDeclare?: () => void;
  onWithdraw: () => void;
  /** 宣言を取り下げる。降りる宣言とは別物で、選び直せる状態に戻す */
  onCancel: () => void;
};

/**
 * 宣言の拍の操作。
 *
 * 「投入する」と「降りる」は**どちらも宣言**で、並べて置く。どちらを選んでも
 * 他人からは「宣言済み」としか見えない（docs/realtime.md §8-3）。
 * 締め切りまでは取り消せる。
 */
export function DeclarationActions({
  declared,
  canDeclare,
  busy,
  onDeclare,
  onWithdraw,
  onCancel,
}: Props) {
  if (declared !== null) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-lg border-2 border-emerald-400/60 bg-emerald-400/10 px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-[13px]">
          {declared.kind === "withdraw"
            ? "降りると宣言しました"
            : `${laneName(declared.laneIndex)}へ ${cardLabel(declared.card)} で宣言しました`}
        </span>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="shrink-0 rounded-lg border-2 border-emerald-50/50 px-3 py-1.5 text-[13px] font-bold whitespace-nowrap text-emerald-50 disabled:opacity-40"
        >
          取り消す
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 flex gap-2">
      <button
        type="button"
        onClick={onDeclare}
        disabled={!canDeclare || busy}
        className="min-w-0 flex-1 rounded-lg bg-amber-400 px-3 py-2.5 font-bold whitespace-nowrap text-amber-950 shadow-[0_3px_0_#92400e] active:translate-y-0.5 active:shadow-[0_1px_0_#92400e] disabled:opacity-40"
      >
        宣言する
      </button>
      <button
        type="button"
        onClick={onWithdraw}
        disabled={busy}
        className="shrink-0 rounded-lg border-2 border-emerald-50/50 px-4 py-2.5 font-bold whitespace-nowrap text-emerald-50 disabled:opacity-40"
      >
        降りる
      </button>
    </div>
  );
}
