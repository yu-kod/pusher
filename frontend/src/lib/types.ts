/**
 * サーバーから受け取る型。
 *
 * backend の `GameView`（docs/spec.md §8）に対応する。裏向きのカードは中身を
 * 持たないので、**クライアント側でも中身を組み立てられない**形になっている。
 */
export type CoinCard = { kind: "coin"; coins: 1 | 2 | 3 };
export type EventCard = { kind: "event"; event: string };
export type Card = CoinCard | EventCard;

/** 滞留エリアのカード。表向き（§6 の「横穴開放」後）だけ中身が見える */
export type PendingCardView = { faceUp: true; card: Card } | { faceUp: false };

export type LaneView = {
  stockCount: number;
  /**
   * ボール札が末端（落下口の側）から何枚目にあるか。無ければ null。
   *
   * 奥の山で**唯一の公開情報**（docs/turn-structure.md §4-3）。卓上では列の中で
   * 1枚だけ表向きに置かれ、あと何枚押し込めば落ちるかが全員に見える。
   * これが見えないと、同じレーンを狙い合う理由そのものが消える。
   */
  ballIndex: number | null;
  pending: PendingCardView[];
  hasExtraSlot: boolean;
};

/** 手札。自分のものだけ中身が見える */
export type HandView = { owner: true; cards: Card[] } | { owner: false; count: number };

export type PlayerView = {
  id: string;
  name: string;
  points: number;
  hand: HandView;
  /**
   * 宣言を済ませたか（docs/realtime.md §8-3）。
   *
   * 宣言の拍で公開されるのはこの真偽値だけで、**中身は入らない**。投入先も、
   * 降りたことも伏せる。誰が降りたか先に分かると、残った人は「あのボール札は
   * 自分まで残る」と知って投入先を決められ、遅く決めた人ほど得をする。
   */
  declared?: boolean;
  /**
   * 宣言の中身。公開の拍に入るまで、他人のぶんは `null` で届く。
   * 自分のぶんだけは宣言中も入っている（確認と取り消しのため）。
   */
  declaration?: DeclarationView | null;
};

/** 宣言の拍で選べる2つ（docs/turn-structure.md §4）。どちらも「宣言した」として扱う */
export type DeclarationView =
  /** 投入する — レーン1つと手札1枚 */
  | { kind: "insert"; laneIndex: number; handIndex: number; card: Card }
  /** 降りる — 未確定得点を確定して、そのラウンドから抜ける */
  | { kind: "withdraw" };

/** 進行の拍（docs/realtime.md §8-1） */
export type TickPhase = "declaring" | "revealing" | "resolving";

/**
 * 解決1人ぶん（docs/realtime.md §8-5）。
 *
 * サーバーは1回の計算で全員ぶんを出し、列として1つのスナップショットに載せる。
 * 1人ずつ動いて見えるのは演出の側の話で、配信は1回きり。
 */
export type ResolutionStepView = {
  playerId: string;
  laneIndex: number;
  roll: number;
  pushedCount: number;
  droppedCount: number;
  gainedPoints: number;
  sideHole: boolean;
};

/** 横穴（バースト）の発生条件（docs/spec.md §5）。判定はサーバーが行う */
export type SideHoleRule = { minRoll: number; minTarget: number };

export type RulesView = {
  laneCount: number;
  maxLanesPerRound: number;
  maxRounds: number;
  jackpotThreshold: number;
  sideHole: SideHoleRule;
};

export type GameView = {
  viewerId: string;
  rules: RulesView;
  lanes: LaneView[];
  players: PlayerView[];
  drawPileCount: number;
  discardPileCount: number;
  pendingPoints: number;
  jackpotPoints: number;
  jackpotCounter: number;
  currentPlayerIndex: number;
  startPlayerIndex: number;
  insertionRoundsThisTurn: number;
  round: number;
  lastSideHolePlayerId: string | null;
  phase: "playing" | "finished";

  /**
   * 解決する順に並んだプレイヤー id（先行権・docs/spec.md v0.3）。
   *
   * 卓上ではプレイヤーカードの列がこれにあたる公開情報。順番を決めるのは
   * サーバー（`backend/src/game/priority.ts`）で、画面は並べるだけ。
   * サーバーがまだ解決順を持っていない間は届かない。
   */
  resolutionOrder?: string[];

  /**
   * ティック同時進行（docs/realtime.md §8）。
   *
   * サーバーがまだ3拍を持っていない間は届かない。その場合は手番制として動く。
   * **拍の情報はひとまとまりで届く。** 拍だけあって締め切りが無い、という状態は
   * 起こりえないので、型の上でも分けない。
   */
  tick?: TickView;
};

/** いま進行中のティック（docs/realtime.md §8-1） */
export type TickView = {
  /** 何ティック目か */
  index: number;
  phase: TickPhase;
  /** 宣言の締め切り（サーバーの epoch ミリ秒）。権威はここで、端末の時計は表示にしか使わない */
  deadlineAt: number;
  /** 解決を計算した時刻。再生の開始点をここに揃える（§8-5）。解決前は null */
  resolvedAt: number | null;
  /** 先行権順に並んだ解決のステップ列。解決前は空 */
  steps: ResolutionStepView[];
};

export type RoomPlayer = { id: string; name: string; isCpu: boolean };

export type RoomView = {
  code: string;
  /**
   * サーバーが状態を更新した時刻（docs/realtime.md §3）。
   *
   * 同じ形の状態が HTTP のレスポンスと WebSocket の push の両方から届く。
   * 経路が違えば追い越しが起きるので、手元より古いものを捨てる判断に使う。
   */
  rev: number;
  phase: "lobby" | "playing";
  players: RoomPlayer[];
  game: GameView | null;
};

/** 参加（作成）したときに返るもの */
export type Credentials = { playerId: string; token: string };
