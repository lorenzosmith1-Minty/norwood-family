import { useState } from "react";
import { Layout } from "./components/Layout";
import { FamilyTreePage } from "./pages/FamilyTreePage";
import { HomePage } from "./pages/HomePage";
import { PersonProfilePage } from "./pages/PersonProfilePage";

type View = "home" | "family-tree" | "profile";

export default function App() {
  const [view, setView] = useState<View>("home");

  return (
    <Layout>
      {view === "home" ? (
        <HomePage onExplore={() => setView("family-tree")} />
      ) : view === "family-tree" ? (
        <FamilyTreePage
          onBack={() => setView("home")}
          onOpenProfile={() => setView("profile")}
        />
      ) : (
        <PersonProfilePage onBack={() => setView("family-tree")} />
      )}
    </Layout>
  );
}
