import { Route, Routes } from "react-router-dom";
import { LobbyPage } from "@/pages/LobbyPage";
import { PusherPage } from "@/pages/PusherPage";
import { TopPage } from "@/pages/TopPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<TopPage />} />
      <Route path="/rooms/:code" element={<LobbyPage />} />
      {/* プッシャー台の手触りを確かめる試作（#77） */}
      <Route path="/pusher" element={<PusherPage />} />
    </Routes>
  );
}
