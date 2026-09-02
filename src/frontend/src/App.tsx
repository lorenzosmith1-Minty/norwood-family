import { useCallback, useState } from "react";
import { Layout } from "./components/Layout";
import { useIsAdmin } from "./hooks/useArchiveStorage";
import { AdminApprovalPage } from "./pages/AdminApprovalPage";
import { ArchiveContributionPage } from "./pages/ArchiveContributionPage";
import { ArchiveDetailPage } from "./pages/ArchiveDetailPage";
import { ArchivePage } from "./pages/ArchivePage";
import ExploreFamilyPage from "./pages/ExploreFamilyPage";
import HeritageBranchPage from "./pages/HeritageBranchPage";
import { HomePage } from "./pages/HomePage";
import { PersonProfilePage, profiles } from "./pages/PersonProfilePage";

type View =
  | "home"
  | "family-tree"
  | "heritage-branch"
  | "profile"
  | "archive-contribute"
  | "admin-approval"
  | "archive"
  | "archive-detail";

export default function App() {
  const [view, setView] = useState<View>("home");
  const [profileId, setProfileId] = useState<string>("julia");
  const [selectedArchiveItemId, setSelectedArchiveItemId] = useState<
    bigint | null
  >(null);
  // Last tree person the user explored (opened a profile for). Passed to the
  // Family Tree so the branch containing that person starts expanded when the
  // user returns from the profile view. In-session navigation state only.
  const [, setExploredPersonId] = useState<string | null>(null);
  // The person currently focused in the Explore Family view. When null, the
  // view falls back to its default anchor (the person marked "Me" if present).
  const [exploreFocusId, setExploreFocusId] = useState<string | null>(null);
  const { data: isAdmin = false } = useIsAdmin();
  // Tracks only explicitly-set (uploaded) profile photos. Default portraits are
  // resolved by each consumer via `profilePhoto ?? person.portrait.src`, so this
  // map starts empty — seeding it with default portraits would make every card
  // render an image (including Clayton's initials placeholder).
  const [profilePhotos, setProfilePhotos] = useState<Record<string, string>>(
    () => ({}),
  );

  const profile = profiles[profileId] ?? profiles.julia;

  const handleProfilePhotoChange = useCallback(
    (personId: string, url: string | null) => {
      setProfilePhotos((current) => {
        if (url === null) {
          const next = { ...current };
          delete next[personId];
          return next;
        }
        return { ...current, [personId]: url };
      });
    },
    [],
  );

  const openArchiveItem = useCallback((id: bigint) => {
    setSelectedArchiveItemId(id);
    setView("archive-detail");
  }, []);

  // Opens the Explore Family view centered on a given person. Used by the
  // header "Explore Family" nav button (no focus change) and by the Heritage
  // Branch View when a person is tapped to explore.
  const openExploreFamily = useCallback((personId: string | null) => {
    setExploreFocusId(personId);
    setView("family-tree");
  }, []);

  return (
    <Layout
      isAdmin={isAdmin}
      onAdminClick={() => setView("admin-approval")}
      onArchiveClick={() => setView("archive")}
      onBranchClick={() => setView("heritage-branch")}
      onExploreClick={() => openExploreFamily(null)}
    >
      {view === "home" ? (
        <HomePage
          onExplore={() => openExploreFamily(null)}
          onAddToHistory={() => setView("archive-contribute")}
          onOpenArchive={() => setView("archive")}
          onOpenBranch={() => setView("heritage-branch")}
        />
      ) : view === "family-tree" ? (
        <ExploreFamilyPage
          focusPersonId={exploreFocusId}
          onSelectPerson={(id) => setExploreFocusId(id)}
          onOpenProfile={(id) => {
            setExploredPersonId(id);
            setProfileId(id);
            setView("profile");
          }}
        />
      ) : view === "heritage-branch" ? (
        <HeritageBranchPage onOpenExploreFamily={openExploreFamily} />
      ) : view === "profile" ? (
        <PersonProfilePage
          person={profile}
          onBack={() => setView("family-tree")}
          profilePhoto={profilePhotos[profile.id]}
          onProfilePhotoChange={handleProfilePhotoChange}
        />
      ) : view === "archive-contribute" ? (
        <ArchiveContributionPage onBack={() => setView("home")} />
      ) : view === "admin-approval" ? (
        <AdminApprovalPage onBack={() => setView("home")} />
      ) : view === "archive" ? (
        <ArchivePage
          onBack={() => setView("home")}
          onOpenArchiveItem={openArchiveItem}
        />
      ) : (
        <ArchiveDetailPage
          itemId={selectedArchiveItemId ?? 0n}
          onBack={() => setView("archive")}
          onOpenProfile={(id) => {
            setProfileId(id);
            setView("profile");
          }}
        />
      )}
    </Layout>
  );
}
