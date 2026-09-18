import { describe, expect, it } from "vitest";
import { buildTabletopKit, type KitSection } from "./cards.js";
import { CARDS_PER_SHEET, escapeHtml, paginate, renderCardSheets } from "./render.js";

describe("paginate", () => {
  it("指定した枚数ごとに分ける", () => {
    expect(paginate([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("空なら1枚も刷らない", () => {
    expect(paginate([], 9)).toEqual([]);
  });
});

describe("escapeHtml", () => {
  it("HTML として解釈される文字を実体参照にする", () => {
    expect(escapeHtml(`<b>"押し出し" & 'ボール'</b>`)).toBe(
      "&lt;b&gt;&quot;押し出し&quot; &amp; &#39;ボール&#39;&lt;/b&gt;"
    );
  });
});

describe("renderCardSheets", () => {
  const sections: KitSection[] = [
    { title: "テスト束", description: "説明", cards: [{ kind: "coin", coins: 2 }] },
  ];

  it("A4 の印刷指定を持つ1つの HTML を返す", () => {
    const html = renderCardSheets(sections);

    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('lang="ja"');
    expect(html).toContain("size: A4");
  });

  it("束の名前と説明をシートに載せる", () => {
    const html = renderCardSheets(sections);

    expect(html).toContain("テスト束");
    expect(html).toContain("説明");
  });

  it("カードの内容を刷る", () => {
    const html = renderCardSheets(sections);

    expect(html).toContain("目標値 ＝ このコイン数 ＋ 滞留の枚数");
  });

  it("束ごとにページを分け、1ページに CARDS_PER_SHEET 枚まで載せる", () => {
    const html = renderCardSheets([
      {
        title: "A",
        description: "",
        cards: Array(CARDS_PER_SHEET + 1).fill({ kind: "ball", points: 10 }),
      },
      { title: "B", description: "", cards: [{ kind: "ball", points: 10 }] },
    ]);

    expect(html.match(/class="sheet"/g)).toHaveLength(3);
  });

  it("席の色をカードの縁に出す", () => {
    const html = renderCardSheets([
      { title: "席", description: "", cards: [{ kind: "seat", seat: 0 }] },
    ]);

    expect(html).toContain("--edge: #c0392b");
  });

  it("卓上版一式をそのまま刷れる", () => {
    const html = renderCardSheets(buildTabletopKit());

    // メインデッキ90枚 + ボール札3枚 + 各自5枚×4人 = 113枚
    expect(html.match(/class="card /g)).toHaveLength(113);
  });
});
