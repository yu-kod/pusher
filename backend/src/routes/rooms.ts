/**
 * ルーム API（docs/spec.md §8 / #14）。
 *
 * サーバー権威型。ルールの判定はすべてエンジンが行い、クライアントは
 * 「何をしたいか」だけを送る。返す状態は必ずマスク済みの `GameView`。
 *
 * ## 本人確認
 *
 * アカウントを作らせないので、参加時に発行したトークンを以後の操作で提示させる。
 * これがないと他人の手番を勝手に進めたり、他人の手札を覗いたりできてしまう。
 * トークンはレスポンスに含めない。
 *
 * ## シード
 *
 * シードは**サーバーが作る**。クライアントから受け取る口は作らない。
 * 受け取れるようにすると、山札とレーンの中身を事前に知ることができてしまい、
 * §8「レーンの中身を隠す理由」が崩れる。
 */
import { Hono } from "hono";
import { z } from "zod";
import { DEFAULT_BALANCE, type Balance } from "../game/balance.js";
import { autoEventChooser } from "../game/chooser.js";
import { isCoinCard } from "../game/deck.js";
import { endRound, endTurn } from "../game/progress.js";
import { createRng, type Rng } from "../game/rng.js";
import { resolveInsertionRound, type InsertionRoundResult } from "../game/round.js";
import type { GameState } from "../game/setup.js";
import { roomBody } from "../room/body.js";
import { playCpuTurns } from "../room/cpu.js";
import {
  createRoom,
  generateRoomCode,
  joinRoom,
  removeCpu,
  startGame,
  type Room,
} from "../room/room.js";
import { RoomConflictError, type RoomStore, type StoredRoom } from "../room/store.js";
import {
  forbidden,
  messageOf,
  roomConflict,
  roomNotFound,
  unauthorized,
  unprocessable,
  validationError,
} from "./errors.js";

export type RoomsDeps = {
  store: RoomStore;
  /** テストから乱数を固定するため。省略すると毎回異なる */
  seed?: number;
  config?: Balance;
  now?: () => number;
  /**
   * 状態が変わったことを繋いでいる全員へ知らせる（docs/realtime.md §6 / #15）。
   *
   * マスクしていない `Room` をそのまま渡す。誰向けにどこまで見せるかは接続ごとに
   * 違うので、削るのは配信側（`realtime/hub.ts`）の責務。
   *
   * 省略すると配信しない。その場合でもクライアントはポーリングで追える。
   */
  publish?: (room: Room) => Promise<void>;
};

const nameSchema = z.object({
  name: z.string().min(1).max(20),
  isCpu: z.boolean().optional(),
});

const insertSchema = z.object({
  laneIndex: z.number().int(),
  handIndexes: z.array(z.number().int()).min(1),
});

/** Authorization: Bearer <token> から取り出す */
function tokenOf(header: string | undefined): string | null {
  const match = /^Bearer (.+)$/.exec(header ?? "");
  return match?.[1] ?? null;
}

/** 投入ラウンドの結果のうち、クライアントへ返してよいもの */
type InsertResultBody = {
  /** レーンごとの判定。既定のルールでは1件だけ */
  lanes: { laneIndex: number; roll: number; outcome: string; target: number }[];
  gainedPoints: number;
  busted: boolean;
  canContinue: boolean;
  events: InsertionRoundResult["events"];
  jackpot: InsertionRoundResult["jackpot"];
};

/**
 * 落下したカードそのものは返さない。
 *
 * 落ちた枚数と点数は分かるが、何が落ちたかは滞留とレーンの中身を推測する材料に
 * なるため、得点だけを返す（docs/spec.md §8）。
 */
function insertResultBody(result: InsertionRoundResult): InsertResultBody {
  return {
    lanes: result.lanes.map(({ laneIndex, roll, outcome, target }) => ({
      laneIndex,
      roll,
      outcome,
      target,
    })),
    gainedPoints: result.gainedPoints,
    busted: result.busted,
    canContinue: result.canContinue,
    events: result.events,
    jackpot: result.jackpot,
  };
}

/** ルール違反（エンジンや room.ts が投げる Error）を 422 に変換する */
function asUnprocessable<T>(action: () => T): T {
  try {
    return action();
  } catch (error) {
    throw unprocessable(messageOf(error));
  }
}

export function createRoomsRoute(deps: RoomsDeps) {
  const config = deps.config ?? DEFAULT_BALANCE;
  const now = deps.now ?? (() => Date.now());
  // シードを固定したいのはテストだけ。既定は毎回異なる乱数を使う
  let nextSeed = deps.seed;
  const rngFor = (): Rng => createRng(nextSeed === undefined ? Date.now() : nextSeed++);

  const app = new Hono();

  /** ルームを版つきで読む。書き込みはこの版を条件にする */
  const load = async (code: string): Promise<StoredRoom> => {
    const stored = await deps.store.get(code);
    if (stored === null) {
      throw roomNotFound(code);
    }
    return stored;
  };

  /**
   * 保存して、繋いでいる全員へ知らせる。
   *
   * 書き込みは読んだときの版を条件にする（#78）。先に別の更新が入っていたら 409 を返し、
   * クライアントに状態を取り直させる。手番制のいま同時に届くのはロビーへの参加くらいなので、
   * サーバー側ではやり直さない（同時投入を入れる #80 で読み直して解決し直す形にする）。
   *
   * 配信に失敗してもアクションは成功のまま返す。取りこぼしはポーリングが拾うので、
   * 通知が届かなかったことを理由に手番を巻き戻すほうがはるかに悪い。
   * 書き込めなかったときは配信しない（配る新しい状態が無い）。
   */
  const persist = async (room: Room, write: Promise<void>): Promise<void> => {
    try {
      await write;
    } catch (error) {
      if (error instanceof RoomConflictError) {
        throw roomConflict(error.message);
      }
      throw error;
    }
    await deps.publish?.(room).catch(() => undefined);
  };

  /** 提示されたトークンがこのルームのものか確かめ、プレイヤーを返す */
  const authenticate = (room: Room, header: string | undefined) => {
    const token = tokenOf(header);
    if (token === null) {
      throw unauthorized();
    }
    const player = room.players.find((p) => p.token === token);
    if (player === undefined) {
      throw forbidden("このルームのトークンではない");
    }
    return player;
  };

  const parseJoin = async (body: unknown) => {
    const parsed = nameSchema.safeParse(body);
    if (!parsed.success) {
      throw validationError("表示名は 1〜20 文字で指定する");
    }
    return parsed.data;
  };

  // ルーム作成。作成者がそのまま1人目として参加する
  app.post("/", async (c) => {
    const { name, isCpu } = await parseJoin(await c.req.json().catch(() => null));

    const code = generateRoomCode(rngFor());
    const token = crypto.randomUUID();
    const room = joinRoom(createRoom(code, now()), { name, token, isCpu: isCpu ?? false }, now());
    await persist(room, deps.store.create(room));

    return c.json({ code, playerId: "p1", token }, 201);
  });

  // 参加
  app.post("/:code/players", async (c) => {
    const code = c.req.param("code");
    const { name, isCpu } = await parseJoin(await c.req.json().catch(() => null));
    const { room, rev } = await load(code);

    const token = crypto.randomUUID();
    const joined = asUnprocessable(() =>
      joinRoom(room, { name, token, isCpu: isCpu ?? false }, now())
    );
    await persist(joined, deps.store.update(joined, rev));

    const player = joined.players[joined.players.length - 1];
    return c.json({ playerId: player?.id, token }, 201);
  });

  // CPU の削除（ロビーのみ）
  app.delete("/:code/players/:id", async (c) => {
    const { room, rev } = await load(c.req.param("code"));
    const player = authenticate(room, c.req.header("Authorization"));

    const removed = asUnprocessable(() => removeCpu(room, c.req.param("id"), now()));
    await persist(removed, deps.store.update(removed, rev));

    return c.json(roomBody(removed, player.id));
  });

  // 開始
  app.post("/:code/start", async (c) => {
    const { room, rev } = await load(c.req.param("code"));
    const player = authenticate(room, c.req.header("Authorization"));

    const started = asUnprocessable(() => startGame(room, rngFor(), config, now()));
    // 先頭が CPU なら、人間の手番になるまで自動で進める（#16）
    const advanced = playCpuTurns(started, rngFor(), now());
    await persist(advanced, deps.store.update(advanced, rev));

    return c.json(roomBody(advanced, player.id));
  });

  /** 手番プレイヤー本人であることを確かめ、ゲームの状態を返す */
  const requireTurn = (room: Room, header: string | undefined) => {
    const player = authenticate(room, header);
    if (room.game === null) {
      throw unprocessable("ゲームがまだ開始していない");
    }
    if (room.game.players[room.game.currentPlayerIndex]?.id !== player.id) {
      throw unprocessable("いまは手番ではない");
    }
    return { player, game: room.game };
  };

  /**
   * 手番を終えて次へ回す。ラウンドが終わればラウンド終了処理も行う（§3）。
   *
   * ゲーム終了は endRound が判定する。
   */
  const finishTurn = (game: GameState, rng: Rng): GameState => {
    const turn = endTurn(game);
    return turn.roundEnded ? endRound(turn.state, rng, autoEventChooser).state : turn.state;
  };

  // 投入。続けられなくなったら、その場で手番を終えて次へ回す
  app.post("/:code/turns/insert", async (c) => {
    const { room, rev } = await load(c.req.param("code"));
    const { player, game } = requireTurn(room, c.req.header("Authorization"));

    const parsed = insertSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      throw validationError("laneIndex と handIndexes（1つ以上の整数）が必要");
    }

    const rng = rngFor();
    const result = asUnprocessable(() =>
      resolveInsertionRound(
        game,
        [{ laneIndex: parsed.data.laneIndex, handIndexes: parsed.data.handIndexes }],
        autoEventChooser,
        rng
      )
    );

    const next = result.canContinue ? result.state : finishTurn(result.state, rng);
    const saved = playCpuTurns({ ...room, game: next, updatedAt: now() }, rngFor(), now());
    await persist(saved, deps.store.update(saved, rev));

    return c.json({ ...roomBody(saved, player.id), result: insertResultBody(result) });
  });

  // やめる。未確定得点を確定して手番を終える（§3）
  app.post("/:code/turns/stop", async (c) => {
    const { room, rev } = await load(c.req.param("code"));
    const { player, game } = requireTurn(room, c.req.header("Authorization"));

    // パスはできない。投入できる札がない場合だけ、投入せずに終えられる
    const hand = game.players.flatMap((p, i) => (i === game.currentPlayerIndex ? p.hand : []));
    if (game.insertionRoundsThisTurn === 0 && hand.some(isCoinCard)) {
      throw unprocessable("この手番はまだ1回も投入していない（パスはできない）");
    }

    const ended: Room = { ...room, game: finishTurn(game, rngFor()), updatedAt: now() };
    const saved = playCpuTurns(ended, rngFor(), now());
    await persist(saved, deps.store.update(saved, rev));

    return c.json(roomBody(saved, player.id));
  });

  // 状態取得。トークンを渡さなければ観戦者として扱う
  app.get("/:code", async (c) => {
    const { room } = await load(c.req.param("code"));
    const token = tokenOf(c.req.header("Authorization"));
    const viewer = room.players.find((p) => p.token === token);

    return c.json(roomBody(room, viewer?.id ?? ""));
  });

  return app;
}
