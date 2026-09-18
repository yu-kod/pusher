/**
 * カードシートの HTML を組み立てる（#91）。
 *
 * ブラウザの「印刷」から A4 にそのまま刷れる1枚の HTML を返す純粋関数。
 * 画像もフォントも外部から読まないので、ファイル1つ持ち歩けば印刷できる。
 */
import { cardFace, type CardFace, type KitSection, type PrintCard } from "./cards.js";

/** カードの大きさ（mm）。市販スリーブに入る標準サイズ */
export const CARD_WIDTH_MM = 63;
export const CARD_HEIGHT_MM = 88;

/** A4 1枚に載るカードの枚数（3列 × 3行） */
export const CARDS_PER_SHEET = 9;

/** 指定した枚数ごとにページへ分ける */
export function paginate<T>(items: readonly T[], perPage: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += perPage) {
    pages.push(items.slice(i, i + perPage));
  }
  return pages;
}

/** HTML として解釈される文字を実体参照にする */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STYLE = `
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
    padding: 13.5mm 10.5mm;
    margin: 0 auto 6mm;
    background: #fff;
  }
  .sheet-head {
    height: 6mm;
    font-size: 3.2mm;
    color: #666;
    display: flex;
    justify-content: space-between;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, ${CARD_WIDTH_MM}mm);
    grid-template-rows: repeat(3, ${CARD_HEIGHT_MM}mm);
  }
  .card {
    --edge: #8a8a8a;
    border: 0.3mm dashed #bbb;
    padding: 4mm 3.5mm;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .card::before {
    content: "";
    display: block;
    height: 1.6mm;
    margin: -4mm -3.5mm 2.5mm;
    background: var(--edge);
  }
  .card-title { font-size: 3.2mm; letter-spacing: 0.4mm; color: #666; }
  .card-figure { font-weight: 700; line-height: 1.1; margin: 1.5mm 0 2.5mm; }
  .coin .card-figure, .ball .card-figure { font-size: 24mm; text-align: center; margin: 3mm 0; }
  .event .card-figure, .seat .card-figure { font-size: 8mm; }
  .card-body { font-size: 3.3mm; line-height: 1.55; flex: 1; }
  .card-note {
    font-size: 2.9mm;
    line-height: 1.4;
    color: #555;
    border-top: 0.2mm solid #ddd;
    padding-top: 1.5mm;
  }
  .coin { --edge: #2f6f4f; }
  .event { --edge: #7d4f9e; }
  .ball { --edge: #d08a1d; }
  @media print {
    body { background: #fff; }
    .sheet { margin: 0; page-break-after: always; }
    .sheet:last-child { page-break-after: auto; }
  }
`;

function renderCard(card: PrintCard): string {
  const face: CardFace = cardFace(card);
  const style = face.color === undefined ? "" : ` style="--edge: ${face.color}"`;

  return [
    `<div class="card ${face.tone}"${style}>`,
    `<div class="card-title">${escapeHtml(face.title)}</div>`,
    `<div class="card-figure">${escapeHtml(face.figure)}</div>`,
    `<div class="card-body">${escapeHtml(face.body)}</div>`,
    `<div class="card-note">${escapeHtml(face.note)}</div>`,
    `</div>`,
  ].join("");
}

function renderSheet(
  section: KitSection,
  cards: readonly PrintCard[],
  page: number,
  pages: number
): string {
  const head = `${escapeHtml(section.title)}（${page} / ${pages}）&#12288;${escapeHtml(section.description)}`;
  return [
    `<section class="sheet">`,
    `<div class="sheet-head"><span>${head}</span><span>PUSHER TABLE 卓上版</span></div>`,
    `<div class="grid">${cards.map(renderCard).join("")}</div>`,
    `</section>`,
  ].join("");
}

/** 束ごとにページを分けてカードシートを組み立てる */
export function renderCardSheets(sections: readonly KitSection[]): string {
  const sheets = sections
    .map((section) => {
      const pages = paginate(section.cards, CARDS_PER_SHEET);
      return pages
        .map((cards, index) => renderSheet(section, cards, index + 1, pages.length))
        .join("");
    })
    .join("");

  return [
    "<!doctype html>",
    '<html lang="ja">',
    "<head>",
    '<meta charset="utf-8">',
    "<title>PUSHER TABLE 卓上版 カードシート</title>",
    `<style>${STYLE}</style>`,
    "</head>",
    `<body>${sheets}</body>`,
    "</html>",
  ].join("\n");
}
