import { useCallback, useState } from "react";
import { Layout } from "./components/Layout";
import { useIsAdmin } from "./hooks/useArchiveStorage";
import { AdminApprovalPage } from "./pages/AdminApprovalPage";
import { ArchiveContributionPage } from "./pages/ArchiveContributionPage";
import { ArchiveDetailPage } from "./pages/ArchiveDetailPage";
import { ArchivePage } from "./pages/ArchivePage";
import { FamilyTreePage } from "./pages/FamilyTreePage";
import { HeritageBranchPage } from "./pages/HeritageBranchPage";
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
  const [exploredPersonId, setExploredPersonId] = useState<string | null>(null);
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

  return (
    <Layout
      isAdmin={isAdmin}
      onAdminClick={() => setView("admin-approval")}
      onArchiveClick={() => setView("archive")}
      onBranchClick={() => setView("heritage-branch")}
    >
      {view === "home" ? (
        <HomePage
          onExplore={() => setView("family-tree")}
          onAddToHistory={() => setView("archive-contribute")}
          onOpenArchive={() => setView("archive")}
          onOpenBranch={() => setView("heritage-branch")}
        />
      ) : view === "family-tree" ? (
        <FamilyTreePage
          onBack={() => setView("home")}
          onOpenProfile={(id) => {
            setExploredPersonId(id);
            setProfileId(id);
            setView("profile");
          }}
          profilePhotos={profilePhotos}
          initialExpandedPersonId={exploredPersonId ?? undefined}
        />
      ) : view === "heritage-branch" ? (
        <HeritageBranchPage
          onBack={() => setView("family-tree")}
          onOpenProfile={(id) => {
            setProfileId(id);
            setView("profile");
          }}
          profilePhotos={profilePhotos}
        />
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
