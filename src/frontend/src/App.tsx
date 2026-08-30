import { useState } from "react";
import { Layout } from "./components/Layout";
import { FamilyTreePage } from "./pages/FamilyTreePage";
import { HomePage } from "./pages/HomePage";
import { PersonProfilePage, profiles } from "./pages/PersonProfilePage";

type View = "home" | "family-tree" | "profile";

export default function App() {
  const [view, setView] = useState<View>("home");
  const [profileId, setProfileId] = useState<string>("julia");

  const profile = profiles[profileId] ?? profiles.julia;

  return (
    <Layout>
      {view === "home" ? (
        <HomePage onExplore={() => setView("family-tree")} />
      ) : view === "family-tree" ? (
        <FamilyTreePage
          onBack={() => setView("home")}
          onOpenProfile={(id) => {
            setProfileId(id);
            setView("profile");
          }}
        />
      ) : (
        <PersonProfilePage
          person={profile}
          onBack={() => setView("family-tree")}
        />
      )}
    </Layout>
  );
}
