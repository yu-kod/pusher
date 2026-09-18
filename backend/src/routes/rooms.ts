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
import { createRng, type Rng } from "../game/rng.js";
import { roomBody } from "../room/body.js";
import {
  createRoom,
  generateRoomCode,
  joinRoom,
  removeCpu,
  startGame,
  type Room,
} from "../room/room.js";
import { RoomConflictError, type RoomStore, type StoredRoom } from "../room/store.js";
import { runTick } from "../room/tick-runner.js";
import { recordDeclaration, retractDeclaration, type TickDeps } from "../room/tick-session.js";
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

/**
 * 宣言（`docs/spec.md` §3 ①）。
 *
 * `key` は冪等キー。通信が切れてクライアントが同じ宣言を再送しても、
 * 二重に処理しない（`docs/realtime.md` §8-4）。
 */
const declarationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("insert"),
    laneIndex: z.number().int(),
    handIndexes: z.array(z.number().int()).min(1),
    key: z.string().min(1),
  }),
  z.object({ kind: z.literal("withdraw"), key: z.string().min(1) }),
]);

/** Authorization: Bearer <token> から取り出す */
function tokenOf(header: string | undefined): string | null {
  const match = /^Bearer (.+)$/.exec(header ?? "");
  return match?.[1] ?? null;
}

/** エンジンが投げたルール違反を 422 に変える。メッセージはそのまま返す */
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
    // CPU がいれば、その場で宣言まで済ませる（#16）
    const advanced = runTick(started, tickDeps(), now());
    await persist(advanced, deps.store.update(advanced, rev));

    return c.json(roomBody(advanced, player.id));
  });

  /** ゲームが始まっていることを確かめ、本人・盤面・ティックを返す */
  const requirePlaying = (room: Room, header: string | undefined) => {
    const player = authenticate(room, header);
    if (room.game === null || room.tick === null) {
      throw unprocessable("ゲームがまだ開始していない");
    }
    const seat = room.game.players.findIndex((p) => p.id === player.id);
    return { player, game: room.game, tick: room.tick, seat };
  };

  const tickDeps = (): TickDeps => ({ rng: rngFor(), chooser: autoEventChooser });

  /** 進めて、CPU にも打たせて、保存して返す */
  const commit = async (room: Room, rev: number, viewerId: string) => {
    const saved = runTick(room, tickDeps(), now());
    await persist(saved, deps.store.update(saved, rev));
    return roomBody(saved, viewerId);
  };

  /**
   * パスのティック番号が、いま開いているティックと一致するか。
   *
   * 一致しなければクライアントが古い盤面を見ている。宣言を受けてしまうと、
   * 解決済みの盤面に対して決めた手が通ることになる（`docs/realtime.md` §8-4）。
   */
  const requireTick = (index: number, param: string): void => {
    if (String(index) !== param) {
      throw roomConflict(`このティックはもう閉じている: ${param}（いまは ${index}）`);
    }
  };

  // 宣言する。全員ぶんが揃えば、この場で解決まで進む（docs/realtime.md §8-2）
  app.post("/:code/ticks/:tick/declarations", async (c) => {
    const { room, rev } = await load(c.req.param("code"));
    const { player, game, tick, seat } = requirePlaying(room, c.req.header("Authorization"));
    requireTick(tick.index, c.req.param("tick"));

    const parsed = declarationSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      throw validationError("kind は insert か withdraw で、冪等キー key が必要");
    }
    const { key, ...declaration } = parsed.data;

    // 宣言が通らなければ、返るのは**宣言した本人にだけ**。「誰かの宣言が弾かれた」が
    // 他人に見えると、それ自体が手がかりになる（§8-3）
    const declared = asUnprocessable(() =>
      recordDeclaration(game, tick, { playerIndex: seat, key, declaration })
    );

    return c.json(await commit({ ...room, tick: declared, updatedAt: now() }, rev, player.id));
  });

  // 宣言を取り下げる。まだ誰にも見えていないので、締め切りまでは何度でも変えられる
  app.delete("/:code/ticks/:tick/declarations", async (c) => {
    const { room, rev } = await load(c.req.param("code"));
    const { player, tick, seat } = requirePlaying(room, c.req.header("Authorization"));
    requireTick(tick.index, c.req.param("tick"));

    const retracted = asUnprocessable(() => retractDeclaration(tick, seat));

    return c.json(await commit({ ...room, tick: retracted, updatedAt: now() }, rev, player.id));
  });

  /**
   * 締め切りを過ぎた卓の肩を叩く（docs/realtime.md §8-2）。
   *
   * サーバーに常駐タイマーは無いので、誰も操作していない卓は止まったままになる。
   * クライアントが締め切りを過ぎたら1回投げる。
   *
   * すでに次のティックへ進んでいたら、何もせず現在の状態を返す。同時に何本届いても
   * 1回しか進まないようにするため、ここはエラーにしない。
   */
  app.post("/:code/ticks/:tick/resolve", async (c) => {
    const { room, rev } = await load(c.req.param("code"));
    const { player, tick } = requirePlaying(room, c.req.header("Authorization"));
    if (String(tick.index) !== c.req.param("tick")) {
      return c.json(roomBody(room, player.id));
    }

    return c.json(await commit(room, rev, player.id));
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
