/**
 * プッシャー台の試作だけを、単体で開けるように書き出すための入口。
 *
 * 本体（`src/features/pusher/`）をそのまま読み込むので、ここにロジックは置かない。
 * `npm run build:demo` で `demo-dist/` に出力し、リポジトリを持っていない人へ
 * 手触りを確かめてもらうのに使う。
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PusherPage } from "../src/pages/PusherPage";
import "./styles.css";

const root = document.getElementById("root");
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <MemoryRouter>
        <Routes>
          <Route path="*" element={<PusherPage />} />
        </Routes>
      </MemoryRouter>
    </StrictMode>
  );
}
