/**
 * ゲームバランスの調整値。
 *
 * docs/spec.md §7 のとおり、ここにある数値は**すべて暫定**で、プレイテストと
 * シミュレーション（#13）によって変わる前提。エンジンにマジックナンバーを
 * 散らさず、変えたい数値がすべてこのファイルから辿れる状態を保つ。
 *
 * 各値には出典（docs/spec.md のどこ由来か）と、§7 の検証項目に該当する場合は
 * 何と比較すべきかを添えてある。
 */
import { DEFAULT_DECK_CONFIG, type DeckConfig } from "./deck.js";

export type Balance = {
  // ---- 場の構成 ----

  /**
   * レーンの本数（§1）。
   *
   * §7 次点「レーン3本が適正か：少ないと滞留が集中して育ちやすい。4本に戻す選択肢もある」
   * → プリセット lanes3 / lanes4 で比較する。
   */
  laneCount: number;

  /** セットアップで各レーンの奥に置く枚数（§2） */
  initialLaneCards: number;

  /** セットアップで各プレイヤーに配る枚数（§2） */
  initialHandSize: number;

  /**
   * デッキの構成（§1）。
   *
   * §7 次点「コイン数の構成比：3コイン札が強すぎないか。必要なら3コイン札の比率を
   * 15%まで下げる」→ プリセット coin3Ratio15 で比較する。
   *
   * 総枚数の根拠は docs/spec.md のルール解釈メモを参照。
   */
  deck: DeckConfig;

  // ---- 手番とラウンド ----

  /**
   * 1回の投入ラウンドで投入できるレーンの数（§3）。
   *
   * 各レーンへ最大1枚ずつ投入でき、投入したレーンの数だけダイスを振る。
   * そのままチキンレースのリスク調整ダイヤルになる（k レーンなら
   * バースト確率 1-(5/6)^k）。1 にすると押し引きの幅がなくなる
   * → プリセット singleLane。
   */
  maxLanesPerRound: number;

  /**
   * 1手番に行える投入ラウンドの回数。`null` で無制限（既定）。
   *
   * 手札の枚数と横穴が自然な上限になるため、既定では別途の上限を設けない。
   * §7 の検証項目「1手番あたりの投入ラウンド数が2〜4回に収まるか」がシミュレーション
   * （#13）で外れた場合の調整用 → プリセット insertionRounds3。
   */
  maxInsertionRoundsPerTurn: number | null;

  /**
   * ラウンド終了時に各プレイヤーがドローする枚数（§3）。
   *
   * 既定は 2 枚。毎手番2枚投入で収支が均衡し、3枚で消耗、1枚で蓄積する設計
   * （§7 最優先「ドロー枚数と投入枚数の関係」）。
   * → プリセット noRoundDraw（0枚）/ roundDraw1 / roundDraw3 で比較する。
   */
  roundDrawCount: number;

  /**
   * ラウンド終了時に各レーンの奥へ補充する枚数。
   *
   * v0.2 で 0 が既定。押し込みと落下が釣り合うためレーンの厚みは一定に保たれ、
   * 補充するとレーンが増え続けて山札が枯れる（§4-3 / §8）。
   */
  roundLaneRefillCount: number;

  /**
   * 手札の上限。`null` で無制限（既定）。
   *
   * §3 は「手札上限 7枚」と書き、§7 は「上限があると得点カードの死蔵ができず、投入が
   * 促される」をその理由に挙げている。しかし §3 の手番では**投入が必須**でパスできない
   * ため、死蔵は手番構造によってすでに防がれている。また投入1枚あたりの回収期待値が
   * 1.0 を超えていれば投入は得なので、促す必要もない。上限は経済が壊れているときの
   * 対症療法になってしまうため、既定では設けない。
   *
   * §7 が検証項目に挙げているので、比較できるようプリセット handLimit7 を用意してある。
   */
  handLimit: number | null;

  /** この数のラウンドが終わったらゲーム終了（§3） */
  maxRounds: number;

  // ---- 押し出し ----

  /**
   * 投入カードのコイン数から、押し込める枚数を決める（§4-1）。
   *
   * 「投入口増設」（§6）で2枚同時に投入した場合はコイン数の合計を受け取る。
   *
   * §7 最優先「滞留の厚み：狙いどおり3〜5枚で推移するか。薄すぎる（＝すぐ刈られる）なら
   * 押し込み枚数を『コイン数 ÷ 2（切り上げ）』に圧縮する。厚すぎるなら『コイン数＋1』に
   * 増やす」→ プリセット pushHalf / pushPlusOne で比較する。
   */
  pushCount: (totalCoins: number) => number;

  // ---- ジャックポット ----

  /** カウンターがこの値に達すると JP判定を行う（§5）。カウンターの上限でもある */
  jackpotThreshold: number;

  /**
   * JP当選時にプールから獲得する割合（§5）。
   *
   * §7 次点「ジャックポットの重さ：総取りが強すぎて他の努力が無意味にならないか。
   * 強すぎる場合はプールの半分のみ獲得、残りは次のJPへ持ち越しとする」
   * → プリセット jackpotHalfCarryOver（0.5）で比較する。
   */
  jackpotPayoutRatio: number;
};

const LANE_COUNT = 3;

export const DEFAULT_BALANCE: Balance = {
  laneCount: LANE_COUNT,
  initialLaneCards: 5,
  initialHandSize: 5,
  deck: DEFAULT_DECK_CONFIG,

  maxLanesPerRound: LANE_COUNT,
  maxInsertionRoundsPerTurn: null,
  roundDrawCount: 2,
  roundLaneRefillCount: 0,
  handLimit: null,
  maxRounds: 12,

  pushCount: (totalCoins) => totalCoins,

  jackpotThreshold: 5,
  jackpotPayoutRatio: 1,
};

/**
 * docs/spec.md §7 の検証項目に対応するプリセット。
 *
 * シミュレーション（#13）から名前で選んで比較できるようにしてある。
 * それぞれ「§7 が何と比較せよと言っているか」に1対1で対応する。
 */
export const BALANCE_PRESETS = {
  /** §7 次点: レーンを3本に減らす */
  lanes3: { laneCount: 3, maxLanesPerRound: 3 },
  /** §7 次点: レーン4本（既定と同じ。比較対象として明示する） */
  lanes4: { laneCount: 4, maxLanesPerRound: 4 },

  /**
   * §7 次点: 3コイン札の比率をコイン札の 15% まで下げる。
   *
   * コイン札は 76 枚なので 15% は 11 枚。減らした 8 枚は既定の 1:2 の比（40:35）で
   * 1コイン札と2コイン札へ配分し、総枚数を既定と揃える。
   *   1コイン 35 (46.1%) / 2コイン 30 (39.5%) / 3コイン 11 (14.5%)
   */
  coin3Ratio15: { deck: { ...DEFAULT_DECK_CONFIG, coins: { 1: 35, 2: 30, 3: 11 } } },

  /** §7: ラウンド終了時のドローを廃止する */
  noRoundDraw: { roundDrawCount: 0 },
  /** §7: ドローを1枚に減らす（投入1枚で均衡する） */
  roundDraw1: { roundDrawCount: 1 },
  /** §7: ドローを3枚に増やす（全レーンへ撒き続けられる） */
  roundDraw3: { roundDrawCount: 3 },

  /** §7 最優先: 押し込み枚数をコイン数 ÷ 2（切り上げ）に圧縮する */
  pushHalf: { pushCount: (totalCoins: number) => Math.ceil(totalCoins / 2) },
  /** §7 最優先: 押し込み枚数をコイン数 + 1 に増やす */
  pushPlusOne: { pushCount: (totalCoins: number) => totalCoins + 1 },

  /** §7 次点: JP当選時にプールの半分だけ獲得し、残りを次へ持ち越す */
  jackpotHalfCarryOver: { jackpotPayoutRatio: 0.5 },

  /** §7 次点: 手札上限を 7 枚に設ける（§3 の原案） */
  handLimit7: { handLimit: 7 },

  /** #39 の変更前のルール: 1回の投入ラウンドで1レーンだけ */
  singleLane: { maxLanesPerRound: 1 },

  /** §7: 1手番あたりの投入ラウンドを3回までに制限する */
  insertionRounds3: { maxInsertionRoundsPerTurn: 3 },
} as const satisfies Record<string, Partial<Balance>>;

export type PresetName = keyof typeof BALANCE_PRESETS;

/**
 * プリセットを既定値に重ねた Balance を返す。
 *
 * 複数渡せる。後のものが先のものを上書きする。
 * 既定値は変更しない（新しいオブジェクトを返す）。
 */
export function withPreset(...names: readonly PresetName[]): Balance {
  return names.reduce<Balance>(
    (balance, name) => ({ ...balance, ...BALANCE_PRESETS[name] }),
    DEFAULT_BALANCE
  );
}
