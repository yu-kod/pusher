/**
 * 卓上版の印刷用シートを書き出す CLI（#91）。
 *
 *   npm run print   # backend/ で実行すると tabletop/ 以下を更新する
 *
 * カードの構成（game/deck.ts）やバランス調整値（game/balance.ts）を変えたら、
 * これを回して刷り直す。台紙（tabletop/board.html）とルールブックは手書きなので、
 * 数字を変えたときはそちらも直す。
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_BALANCE } from "../game/balance.js";
import { buildTabletopKit } from "./cards.js";
import { renderCardSheets } from "./render.js";
import { renderPlayerMats, renderTracks } from "./tracks.js";

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../tabletop");

const outputs = [
  { file: "cards.html", html: renderCardSheets(buildTabletopKit()) },
  { file: "tracks.html", html: renderTracks(DEFAULT_BALANCE) },
  { file: "player-mats.html", html: renderPlayerMats() },
];

await mkdir(outDir, { recursive: true });
for (const { file, html } of outputs) {
  await writeFile(resolve(outDir, file), `${html}\n`, "utf8");
  console.log(`書き出した: ${resolve(outDir, file)}`);
}
