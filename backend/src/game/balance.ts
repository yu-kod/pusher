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

/**
 * 横穴（バースト）の発生条件（docs/spec.md §5）。
 *
 * 横穴はチキンレース（§3）の引き際を決める唯一のリスクなので、この2つの数値が
 * そのまま「押し引きの判断がいつ来るか」を決める。
 *
 *   押し続ける条件: バースト確率 ＜ 次の利得 ÷ (次の利得 ＋ 未確定得点)
 *
 * バースト確率 b のとき、降りるべき未確定得点は `利得 × (1 - b) ÷ b`。
 * b が小さいほど判断が遠のき、手札が尽きるほうが先に来る（#67）。
 */
export type SideHoleRule = {
  /** この出目以上が横穴になる。6 なら出目6だけ */
  minRoll: number;
  /** 目標値がこの値以上のときだけ横穴が起きる */
  minTarget: number;
};

/**
 * 進行方式（`docs/turn-structure.md`）。
 *
 * - `turn` — 手番制。1人ずつ順に手番を行う（docs/spec.md §3 の v0.2 のルール）
 * - `tick` — ティック同時進行。1ティックで参加中の全員が同時に1投入ラウンドを行い、
 *   各自が自分のタイミングで降りる。解決は先行権順に1人ずつ
 */
export type ProgressMode = "turn" | "tick";

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
   * 既定は 9。滞留の厚みは13ラウンドでは平衡に達せず、**初期値がそのまま
   * ゲーム中の厚みを決める**（#67）。横穴を常時発生させると除去が増えて
   * 厚みが 2.4 まで落ちるため、初期値で戻している。
   * → プリセット initialPending0（#54 以前の挙動）/ initialPending3 / initialPending5 で比較する。
   */
  initialPendingCards: number;

  /** セットアップで**先手**に配る枚数（§2） */
  initialHandSize: number;

  /**
   * 手番順が1つ後ろになるごとに、初期手札へ加える枚数（§2）。
   *
   * 既定は 1（先手5枚・2番手6枚・3番手7枚・4番手8枚）。先手はゲーム開始時に
   * 積まれている滞留を万全の手札で刈れるぶん有利で、実測では勝率の差が
   * 0.043〜0.067 あった。後手ほど弾薬を厚くすると 0.026〜0.028 に収まる（#68）。
   * → プリセット noHandBonus（全員同じ枚数）で比較する。
   */
  initialHandBonusPerSeat: number;

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
   * 進行方式（`docs/turn-structure.md`）。
   *
   * 既定は `turn`（docs/spec.md §3 の手番制）。`tick` に切り替えると、
   * 1ティックで参加中の全員が同時に1投入ラウンドを行う形になる。
   *
   * 手番制は待ち時間が全体の75%を占め（4人で1ゲーム 136.4 投入ラウンドを逐次解決）、
   * `docs/design-notes.md` §4 がダウンタイムの問題として挙げている。
   * → プリセット tickMode で比較する。
   */
  progressMode: ProgressMode;

  /**
   * 解決順を先行権で決めるか（`docs/turn-structure.md` §4-2）。
   *
   * false なら席順（スタートプレイヤーから左回り）。true なら「前のラウンドで
   * 早く降りた順」になり、降りる判断そのものに報酬がつく。
   * ティック同時進行でのみ意味を持つ。
   */
  useResolutionPriority: boolean;

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

  // ---- 横穴 ----

  /**
   * 横穴の発生条件（§5）。
   *
   * §7 最優先「自分でやめた割合」に直結する。既定は「出目6は目標値によらず常に横穴」。
   *
   * #67 以前は「目標値6以上のとき出目6」だった。この条件では目標値5以下のレーンが
   * **リスク 0 の逃げ道**になり、押し続けることに不利益がないため、手番は常に
   * 手札切れで終わっていた（自分でやめた割合 0.01）。下限を外して逃げ道を無くすと
   * 0.38 まで上がる。
   * → プリセット sideHoleTarget6（#67 以前の既定）/ sideHoleTarget5 / sideHoleRoll5 で比較する。
   */
  sideHole: SideHoleRule;

  // ---- ジャックポット ----

  /** カウンターがこの値に達すると JP判定を行う（§5）。カウンターの上限でもある */
  jackpotThreshold: number;

  /**
   * ゲーム終了時、未払い出しのジャックポットを最後に横穴を出したプレイヤーへ払い出すか（§5）。
   *
   * 既定は false（流す）。横穴が常時発生するようになってプールが太くなった結果、
   * この払い出しが**最終ラウンドで最後に打つ席への大きなボーナス**になっていた。
   * 誰が最後に横穴を出すかは運でしかなく、手番順の偏りを 0.043 → 0.064 に広げていた（#68）。
   * → プリセット payUnpaidJackpot（#68 以前の既定）で比較する。
   */
  payUnpaidJackpotAtGameEnd: boolean;

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
  initialPendingCards: 9,
  initialHandSize: 5,
  initialHandBonusPerSeat: 1,
  deck: DEFAULT_DECK_CONFIG,

  progressMode: "turn",
  useResolutionPriority: false,
  maxLanesPerRound: 1,
  maxInsertionRoundsPerTurn: null,
  roundDrawCount: 3,
  roundLaneRefillCount: 0,
  handLimit: null,
  maxRounds: 13,
  rotateStartPlayer: true,

  pushCount: (totalCoins) => Math.ceil(totalCoins / 2),

  sideHole: { minRoll: 6, minTarget: 1 },

  jackpotThreshold: 5,
  payUnpaidJackpotAtGameEnd: false,
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

  /**
   * `docs/turn-structure.md` の本命案: ティック同時進行に切り替える。
   *
   * 1ティックで参加中の全員が同時に1投入ラウンドを行い、解決は1人ずつ順に。
   * 待ち時間の割合が下がるかわりに、1ティックで最大4枚が投入されるので
   * 滞留が厚くなる方向に動く。初期滞留の調整が要るかを測るためのプリセット。
   */
  tickMode: { progressMode: "tick" as const },

  /**
   * §9 段階2: ティック同時進行に先行権を足す。
   *
   * 先行権が席順を置き換えるので、スタートプレイヤーのラウンドごとの移動は止める
   * （§4-2 — 順番は席で決まるものではなくなる）。
   */
  tickPriority: {
    progressMode: "tick" as const,
    useResolutionPriority: true,
    rotateStartPlayer: false,
  },

  /** #68 以前の既定: 全員に同じ枚数を配る（先手の勝率が 0.28 まで上がる） */
  noHandBonus: { initialHandBonusPerSeat: 0 },

  /** #68 以前の既定: ゲーム終了時、未払い出しのJPを最後に横穴を出した人へ払い出す */
  payUnpaidJackpot: { payUnpaidJackpotAtGameEnd: true },

  /** §7 次点: JP当選時にプールの半分だけ獲得し、残りを次へ持ち越す */
  jackpotHalfCarryOver: { jackpotPayoutRatio: 0.5 },

  /** #54 以前の挙動: 滞留が空の状態から始める（先手の勝率が 0.14 まで落ちる） */
  initialPending0: { initialPendingCards: 0 },
  /** #53 #54: 初期滞留を 3 枚にする */
  initialPending3: { initialPendingCards: 3 },
  /** #67 以前の既定: 初期滞留 5 枚（横穴を常時にすると厚みが 2.4 まで落ちる） */
  initialPending5: { initialPendingCards: 5 },

  /** #54 以前の挙動: スタートプレイヤーを固定する */
  fixedStartPlayer: { rotateStartPlayer: false },

  /** §7 次点: 手札上限を 7 枚に設ける（§3 の原案） */
  handLimit7: { handLimit: 7 },

  /** #55 以前のルール: 1回の投入ラウンドで全レーンへ1枚ずつ投入できる */
  multiLane: { maxLanesPerRound: LANE_COUNT },

  /** §7: 1手番あたりの投入ラウンドを3回までに制限する */
  insertionRounds3: { maxInsertionRoundsPerTurn: 3 },

  /** #67 以前の既定: 目標値6以上のときだけ出目6が横穴（やめた割合 0.01） */
  sideHoleTarget6: { sideHole: { minRoll: 6, minTarget: 6 } },
  /** #67: 下限を目標値5に下げる（逃げ道が細るだけでは 0.02 にしかならない） */
  sideHoleTarget5: { sideHole: { minRoll: 6, minTarget: 5 } },
  /** #67: 出目5も横穴にする。バースト確率が 2/6 になり、降りるべき点数がさらに下がる */
  sideHoleRoll5: { sideHole: { minRoll: 5, minTarget: 1 } },
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
