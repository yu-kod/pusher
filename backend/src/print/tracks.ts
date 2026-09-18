/**
 * 卓上版のトラック類と個人マット（#91）。
 *
 * ラウンド数やジャックポットの閾値は `game/balance.ts` から取る。紙に刷る数字を
 * 調整値と別に持たないことで、バランスを変えたら刷り直すだけで済むようにする。
 */
import type { Balance } from "../game/balance.js";
import { LANE_NAMES, SEATS } from "./cards.js";
import { escapeHtml } from "./render.js";

/** 得点トラックの上限。1人あたりの最終得点は60点前後（docs/spec.md §7） */
export const SCORE_TRACK_MAX = 99;

/** 未確定得点トラックの上限。降りる時点の平均は 6.2点（docs/spec.md §7） */
export const PENDING_TRACK_MAX = 39;

const BASE_STYLE = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif;
    color: #1b1b1b;
    background: #efefef;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet {
    width: 210mm;
    height: 297mm;
    padding: 12mm;
    margin: 0 auto 6mm;
    background: #fff;
  }
  .sheet-head {
    display: flex;
    justify-content: space-between;
    font-size: 3.4mm;
    color: #666;
    margin-bottom: 4mm;
  }
  h2 { font-size: 4.4mm; margin: 0 0 1.5mm; }
  .hint { font-size: 3mm; color: #555; margin: 0 0 2.5mm; line-height: 1.5; }
  .cell {
    border: 0.25mm solid #aaa;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 3.2mm;
    color: #333;
  }
  @media print {
    body { background: #fff; }
    .sheet { margin: 0; page-break-after: always; }
    .sheet:last-child { page-break-after: auto; }
  }
`;

function cells(count: number, label: (index: number) => string, className: string): string {
  return Array.from(
    { length: count },
    (_, index) => `<div class="cell ${className}">${escapeHtml(label(index))}</div>`
  ).join("");
}

function htmlDocument(title: string, style: string, body: string): string {
  return [
    "<!doctype html>",
    '<html lang="ja">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    `<style>${BASE_STYLE}${style}</style>`,
    "</head>",
    `<body>${body}</body>`,
    "</html>",
  ].join("\n");
}

const TRACKS_STYLE = `
  .score-track { display: grid; grid-template-columns: repeat(10, 18.6mm); margin-bottom: 6mm; }
  .score-track .cell { height: 10mm; }
  .score-track .cell:nth-child(10n + 1) { background: #f1f1f1; font-weight: 700; }
  .row { display: flex; gap: 8mm; margin-bottom: 6mm; }
  .round-track { display: grid; grid-template-columns: repeat(13, 8.6mm); }
  .round-track .cell { height: 11mm; }
  .jp-track { display: grid; grid-template-columns: repeat(6, 10mm); }
  .jp-track .cell { height: 11mm; }
  .jp-track .cell:last-child { background: #fdf0d5; font-weight: 700; }
  .priority { display: grid; grid-template-columns: repeat(4, 44mm); gap: 3mm; }
  .priority-slot {
    height: 44mm;
    border: 0.4mm dashed #888;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 2mm;
    font-size: 3.2mm;
    color: #555;
  }
  .priority-slot b { font-size: 5mm; color: #222; }
  .markers { display: flex; flex-wrap: wrap; gap: 3mm; }
  .marker {
    width: 13mm;
    height: 13mm;
    border: 0.3mm dashed #999;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2.6mm;
    color: #fff;
  }
`;

function markers(): string {
  const seatMarkers = SEATS.flatMap((seat) =>
    Array.from(
      { length: 2 },
      () => `<div class="marker" style="background: ${seat.color}">${escapeHtml(seat.name)}</div>`
    )
  );
  const others = [
    `<div class="marker" style="background: #333">JP</div>`,
    `<div class="marker" style="background: #333">JP</div>`,
    `<div class="marker" style="background: #777">R</div>`,
    `<div class="marker" style="background: #777">R</div>`,
  ];

  return [...seatMarkers, ...others].join("");
}

/** トラック一式（得点・ジャックポット・ラウンド・先行権・マーカー） */
export function renderTracks(balance: Balance): string {
  const body = [
    '<section class="sheet">',
    '<div class="sheet-head"><span>トラック</span><span>PUSHER TABLE 卓上版</span></div>',

    "<h2>得点トラック</h2>",
    `<p class="hint">各自のマーカーを置いて進める。ジャックポットの点数も黒いマーカーで同じトラックに置く。${SCORE_TRACK_MAX}点を超えたら一周させ、マーカーをもう1つ脇に置いて「+${SCORE_TRACK_MAX + 1}点」の印にする。</p>`,
    `<div class="score-track">${cells(SCORE_TRACK_MAX + 1, (i) => String(i), "score")}</div>`,

    '<div class="row">',
    "<div>",
    "<h2>ラウンド</h2>",
    `<p class="hint">${balance.maxRounds}ラウンドでゲーム終了。</p>`,
    `<div class="round-track">${cells(balance.maxRounds, (i) => String(i + 1), "round")}</div>`,
    "</div>",
    "<div>",
    "<h2>JPカウンター</h2>",
    `<p class="hint">横穴が出るたびに1つ進む。${balance.jackpotThreshold}に達したら JP判定。</p>`,
    `<div class="jp-track">${cells(balance.jackpotThreshold + 1, (i) => String(i), "jp")}</div>`,
    "</div>",
    "</div>",

    "<h2>先行権の列</h2>",
    '<p class="hint">降りた人から順に、自分のプレイヤーカードを左から置いていく。この並びが次のラウンドの解決順になる。横穴や手札切れで抜けた人は、自分から降りた人より後ろに置く。</p>',
    '<div class="priority">',
    SEATS.map(
      (_seat, index) =>
        `<div class="priority-slot"><b>${index + 1}番目</b><span>プレイヤーカードを置く</span></div>`
    ).join(""),
    "</div>",

    '<h2 style="margin-top: 6mm">マーカー（切り取って使う）</h2>',
    '<p class="hint">各色2つずつ（得点用と未確定得点用）。JP はジャックポットの点数、R はラウンド。</p>',
    `<div class="markers">${markers()}</div>`,
    "</section>",
  ].join("");

  return htmlDocument("PUSHER TABLE 卓上版 トラック", TRACKS_STYLE, body);
}

const MATS_STYLE = `
  .mat {
    height: 128mm;
    border: 0.4mm solid #333;
    padding: 4mm;
    margin-bottom: 6mm;
  }
  .mat-head { display: flex; align-items: baseline; gap: 3mm; margin-bottom: 2mm; }
  .mat-head b { font-size: 6mm; }
  .mat-head span { font-size: 3mm; color: #555; }
  .pending-track { display: grid; grid-template-columns: repeat(20, 8.8mm); margin-bottom: 3mm; }
  .pending-track .cell { height: 8mm; font-size: 2.8mm; }
  .pending-track .cell:nth-child(10n + 1) { background: #f1f1f1; font-weight: 700; }
  .slots { display: flex; gap: 4mm; }
  .declare-slot {
    width: 64mm;
    height: 84mm;
    border: 0.4mm dashed #888;
    padding: 2mm;
    font-size: 3.1mm;
    color: #555;
  }
  .declare-slot b { display: block; font-size: 3.8mm; color: #222; margin-bottom: 1mm; }
`;

function mat(seat: (typeof SEATS)[number]): string {
  return [
    '<div class="mat">',
    `<div class="mat-head"><b style="color: ${seat.color}">${escapeHtml(seat.name)}</b>`,
    "<span>未確定得点は、降りるまで自分の得点にならない。横穴を踏むと全部ジャックポットへ移る。</span></div>",
    `<div class="pending-track">${cells(PENDING_TRACK_MAX + 1, (i) => String(i), "pending")}</div>`,
    '<div class="slots">',
    `<div class="declare-slot"><b>宣言：レーン</b>${escapeHtml(LANE_NAMES.join("・"))}のどれか1枚、または「降りる」を伏せて置く</div>`,
    '<div class="declare-slot"><b>宣言：投入するカード</b>手札から1枚を伏せて置く。全員が伏せ終わったら一斉に開く</div>',
    "</div>",
    "</div>",
  ].join("");
}

/** 個人マット。A4 1枚に2人ぶん */
export function renderPlayerMats(): string {
  const pages: string[] = [];
  for (let i = 0; i < SEATS.length; i += 2) {
    const body = SEATS.slice(i, i + 2)
      .map(mat)
      .join("");
    pages.push(
      [
        '<section class="sheet">',
        '<div class="sheet-head"><span>個人マット</span><span>PUSHER TABLE 卓上版</span></div>',
        body,
        "</section>",
      ].join("")
    );
  }

  return htmlDocument("PUSHER TABLE 卓上版 個人マット", MATS_STYLE, pages.join(""));
}
