import { Route, Routes } from "react-router-dom";
import { LobbyPage } from "@/pages/LobbyPage";
import { TopPage } from "@/pages/TopPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<TopPage />} />
      <Route path="/rooms/:code" element={<LobbyPage />} />
    </Routes>
  );
}
