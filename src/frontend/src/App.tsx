import { useState } from "react";
import { Layout } from "./components/Layout";
import { FamilyTreePage } from "./pages/FamilyTreePage";
import { HomePage } from "./pages/HomePage";

type View = "home" | "family-tree";

export default function App() {
  const [view, setView] = useState<View>("home");

  return (
    <Layout>
      {view === "home" ? (
        <HomePage onExplore={() => setView("family-tree")} />
      ) : (
        <FamilyTreePage onBack={() => setView("home")} />
      )}
    </Layout>
  );
}
