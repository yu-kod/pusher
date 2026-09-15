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

  /**
   * セットアップで各レーンの**滞留エリア**に裏向きで置く枚数（§2）。
   *
   * 0 だとゲーム開始時の滞留が空になり、先手は押し込めるのが1枚だけの状態で動く。
   * 実測では手番順ごとの勝率が 0.14 / 0.27 / 0.29 / 0.31 と壊れていた（#54）。
   * 開始時点から滞留があれば、全員が同じ条件で始められる。
   *
   * 滞留の厚みの初期値そのものでもあるため、§7 最優先「滞留の厚み 3〜5枚」にも効く（#53）。
   * → プリセット initialPending0（#54 以前の挙動）/ initialPending3 で比較する。
   */
  initialPendingCards: number;

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
   * 既定は 1。#39 は「投入するレーン数をリスクの調整ダイヤルにする」設計だったが、
   * 実測では**手番の長さが手札の枚数で決まってしまい**、押し引きが成立しなかった
   * （1手番あたり 1.03 ラウンド。目標 2〜4）。1レーンに絞って手番を長くすることで、
   * 「もう1ラウンド行くか」の判断そのものがリスクダイヤルになる（#55）。
   * → プリセット multiLane（全レーンへ1枚ずつ）で以前のルールに戻せる。
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
   * 既定は 3 枚。1投入ラウンドで1枚使うので、そのまま**1手番に何ラウンド回せるか**を
   * 決める（#55）。
   *
   *   1手番の投入ラウンド数 ≒ ドロー枚数 ÷ 1ラウンドの投入枚数
   *
   * 2枚では 2.01 ラウンドで目標の下限に張り付く。3枚で 2.89 ラウンドになる。
   * → プリセット noRoundDraw（0枚）/ roundDraw1 / roundDraw2 で比較する。
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

  /**
   * この数のラウンドが終わったらゲーム終了（§3）。
   *
   * 既定は 13。**最終ラウンドで最後に手番を打つ席が有利**になるため、この席が
   * スタートプレイヤーの交代と噛み合わないラウンド数を選ぶ必要がある（#55）。
   * 12 は 3人・4人のどちらでも割り切れてしまい、特定の席に有利が固定される。
   * 13 は 3 とも 4 とも互いに素なので、手番順ごとの勝率の差が 0.02〜0.03 に収まる。
   */
  maxRounds: number;

  /**
   * ラウンドごとにスタートプレイヤーを次へ回すか（§3）。
   *
   * 滞留はラウンドを通じて育つため、後の手番ほど厚いレーンに当たりやすい。
   * 初期滞留を配って大幅に縮んだあとも、最後手がわずかに有利な傾向が残っていた（#54）。
   * 全員が順番にスタートプレイヤーを務めることで、この残りを均す。
   * → プリセット fixedStartPlayer で交代なしと比較できる。
   */
  rotateStartPlayer: boolean;

  // ---- 押し出し ----

  /**
   * 投入カードのコイン数から、押し込める枚数を決める（§4-1）。
   *
   * 「投入口増設」（§6）で2枚同時に投入した場合はコイン数の合計を受け取る。
   *
   * 既定は「コイン数 ÷ 2（切り上げ）」。#53 のシミュレーションで「コイン数そのまま」だと
   * 滞留が 1.10 枚しか育たなかったため圧縮した（§7 の目標 3〜5 枚）。
   * → プリセット pushFull（コイン数そのまま）/ pushPlusOne で比較できる。
   *
   * なお §7 は「厚すぎるならコイン数＋1に増やす」としていたが、押し込み枚数を増やすと
   * 除去量が増えて滞留は**薄くなる**。実測でも 0.83 枚まで薄くなり、記述が逆だったことが
   * 確認された。
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
  initialPendingCards: 5,
  initialHandSize: 5,
  deck: DEFAULT_DECK_CONFIG,

  maxLanesPerRound: 1,
  maxInsertionRoundsPerTurn: null,
  roundDrawCount: 3,
  roundLaneRefillCount: 0,
  handLimit: null,
  maxRounds: 13,
  rotateStartPlayer: true,

  pushCount: (totalCoins) => Math.ceil(totalCoins / 2),

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
  /** §7 次点: レーンを4本に増やす（v0.1 の構成） */
  lanes4: { laneCount: 4 },

  /**
   * #53 以前の既定: 3コイン札をコイン札の 25% に戻す。
   *
   *   1コイン 30 (39.5%) / 2コイン 27 (35.5%) / 3コイン 19 (25.0%)
   *
   * 既定は 14.5%。3コイン札は目標値が高く押し込み枚数も多い二重の優位があり、
   * 25% では投入1枚あたりの回収が 1.99 まで膨らむ（§7 次点）。
   */
  coin3Ratio25: { deck: { ...DEFAULT_DECK_CONFIG, coins: { 1: 30, 2: 27, 3: 19 } } },

  /** §7: ラウンド終了時のドローを廃止する */
  noRoundDraw: { roundDrawCount: 0 },
  /** §7: ドローを1枚に減らす（投入ラウンド数 1.12 まで落ちる） */
  roundDraw1: { roundDrawCount: 1 },
  /** #55 以前の既定: ドロー2枚（投入ラウンド数 2.01） */
  roundDraw2: { roundDrawCount: 2 },

  /** #53 以前の既定: 押し込み枚数をコイン数そのままにする（滞留 1.10 枚） */
  pushFull: { pushCount: (totalCoins: number) => totalCoins },
  /** §7: 押し込み枚数をコイン数 + 1 に増やす（滞留 0.83 枚。さらに薄くなる） */
  pushPlusOne: { pushCount: (totalCoins: number) => totalCoins + 1 },

  /** §7 次点: JP当選時にプールの半分だけ獲得し、残りを次へ持ち越す */
  jackpotHalfCarryOver: { jackpotPayoutRatio: 0.5 },

  /** #54 以前の挙動: 滞留が空の状態から始める（先手の勝率が 0.14 まで落ちる） */
  initialPending0: { initialPendingCards: 0 },
  /** #53 #54: 初期滞留を 3 枚にする */
  initialPending3: { initialPendingCards: 3 },

  /** #54 以前の挙動: スタートプレイヤーを固定する */
  fixedStartPlayer: { rotateStartPlayer: false },

  /** §7 次点: 手札上限を 7 枚に設ける（§3 の原案） */
  handLimit7: { handLimit: 7 },

  /** #55 以前のルール: 1回の投入ラウンドで全レーンへ1枚ずつ投入できる */
  multiLane: { maxLanesPerRound: LANE_COUNT },

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
