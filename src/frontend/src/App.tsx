import { useCallback, useEffect, useState } from "react";
import { Layout } from "./components/Layout";
import { LoginSurface } from "./components/LoginSurface";
import { useIsAdmin } from "./hooks/useArchiveStorage";
import { useAuth } from "./hooks/useAuth";
import { useNavbarIdentity } from "./hooks/useNavbarIdentity";
import { usePersonProfile } from "./hooks/useProfileClaims";
import {
  clearOriginatingView,
  loadOriginatingView,
  saveOriginatingView,
} from "./lib/originatingView";
import { AddMyselfPage } from "./pages/AddMyselfPage";
import { AdminApprovalPage } from "./pages/AdminApprovalPage";
import { ArchiveContributionPage } from "./pages/ArchiveContributionPage";
import { ArchiveDetailPage } from "./pages/ArchiveDetailPage";
import { ArchivePage } from "./pages/ArchivePage";
import ExploreFamilyPage from "./pages/ExploreFamilyPage";
import { FamilyStewardReviewPage } from "./pages/FamilyStewardReviewPage";
import HeritageBranchPage from "./pages/HeritageBranchPage";
import { HomePage } from "./pages/HomePage";
import { NotificationsPage } from "./pages/NotificationsPage";
import {
  PersonProfilePage,
  backendProfileToPersonProfile,
  profiles,
} from "./pages/PersonProfilePage";
import { ProfileEditPage } from "./pages/ProfileEditPage";

type View =
  | "home"
  | "family-tree"
  | "heritage-branch"
  | "profile"
  | "my-profile"
  | "archive-contribute"
  | "admin-approval"
  | "archive"
  | "archive-detail"
  | "add-myself"
  | "steward-review"
  | "notifications"
  | "profile-edit"
  | "sign-in";

const VALID_VIEWS: readonly View[] = [
  "home",
  "family-tree",
  "heritage-branch",
  "profile",
  "my-profile",
  "archive-contribute",
  "admin-approval",
  "archive",
  "archive-detail",
  "add-myself",
  "steward-review",
  "notifications",
  "profile-edit",
  "sign-in",
];

function isView(value: string): value is View {
  return (VALID_VIEWS as readonly string[]).includes(value);
}

/**
 * Loading state shown while a non-static person id (a graph-only node or a
 * createMyself profile keyed by the caller's principal) is resolved from the
 * backend. A valid personId must never fall back to another person's profile
 * or render an empty page, so we wait for the backend profile before mounting
 * the profile page.
 */
function ProfileLoadingState() {
  return (
    <div
      data-ocid="profile.loading_state"
      className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center gap-4 px-6 py-24 text-center"
    >
      <div className="h-24 w-24 animate-pulse rounded-2xl bg-muted" />
      <div className="h-5 w-48 animate-pulse rounded-full bg-muted" />
      <div className="h-4 w-64 animate-pulse rounded-full bg-muted" />
      <p className="text-sm text-muted-foreground">Loading profile…</p>
    </div>
  );
}

export default function App() {
  // Restore the originating view after a full-page Google/Apple auth redirect.
  // The view (and profile id, for a profile origin) is persisted to
  // sessionStorage before sign-in is initiated, so the app returns to the exact
  // state the user left and the Add Myself / ClaimButton auto-submit effects
  // fire automatically after the redirect remount.
  const origin = loadOriginatingView();
  const [view, setView] = useState<View>(() =>
    origin && isView(origin.view) ? origin.view : "home",
  );
  // Restore the originating profileId directly (not gated on the static
  // `profiles` record). Graph-only nodes (e.g. lorenzoSmithJr) and createMyself
  // profiles keyed by the caller's principal are not in the static record, but
  // the profile view resolves them from the backend, so gating here would
  // wrongly fall back to another person (e.g. julia) and auto-submit a claim
  // for the wrong person.
  const [profileId, setProfileId] = useState<string>(() =>
    origin?.profileId ? origin.profileId : "julia",
  );
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
  const { isAuthenticated, accountId, signOut } = useAuth();
  const {
    displayName,
    status: identityStatus,
    personId: myPersonId,
  } = useNavbarIdentity();

  const profile = profiles[profileId] ?? profiles.julia;

  // A genuinely new, account-owned profile (created via createMyself and keyed
  // by the caller's principal) or a graph-only node (e.g. lorenzoSmithJr) has
  // no entry in the static `profiles` record. When the "My Profile" or
  // "Profile" view targets such a personId, resolve the profile from the
  // backend so it renders instead of falling back to another person or an
  // empty page.
  const isStaticProfile = Boolean(profiles[profileId]);
  const { data: myBackendProfile } = usePersonProfile(profileId, {
    enabled: (view === "my-profile" || view === "profile") && !isStaticProfile,
  });
  const resolvedProfile = isStaticProfile
    ? profiles[profileId]
    : myBackendProfile
      ? backendProfileToPersonProfile(myBackendProfile)
      : undefined;

  // Restore the originating view after a full-page Google/Apple auth redirect.
  // Runs on mount and whenever authentication completes, restoring both the
  // view and profileId from the persisted origin. This handles the redirect
  // flow — where the initial view may already be 'profile' for the ClaimButton
  // profile-origin flow — and the in-app flow where the user is on the sign-in
  // view when auth completes. Restoring the profileId regardless of whether it
  // is in the static `profiles` record is essential: graph-only nodes (e.g.
  // lorenzoSmithJr) and createMyself profiles keyed by the caller's principal
  // are not in the static record, but the profile view resolves them from the
  // backend, so gating on the static record would wrongly fall back to another
  // person (e.g. julia) and auto-submit a claim for the wrong person.
  useEffect(() => {
    if (!isAuthenticated) return;
    const origin = loadOriginatingView();
    if (!origin) return;
    if (isView(origin.view)) {
      if (origin.profileId) {
        setProfileId(origin.profileId);
      }
      setView(origin.view);
    }
    clearOriginatingView();
  }, [isAuthenticated]);

  // Clear any remaining persisted originating view once it has been restored so
  // a later reload doesn't re-apply a stale view.
  useEffect(() => {
    clearOriginatingView();
  }, []);

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

  // Opens the signed-in caller's own profile ("My Profile"). Resolves to the
  // linked/pending profile when one is connected; otherwise routes to the Add
  // Myself flow so the caller can complete their profile.
  const openMyProfile = useCallback(() => {
    if (myPersonId) {
      setProfileId(myPersonId);
      setView("my-profile");
    } else {
      setView("add-myself");
    }
  }, [myPersonId]);

  return (
    <Layout
      isAdmin={isAdmin}
      isAuthenticated={isAuthenticated}
      accountId={accountId}
      identityName={displayName}
      identityStatus={identityStatus}
      onMyProfileClick={openMyProfile}
      onSignInClick={() => {
        if (view !== "sign-in") saveOriginatingView({ view });
        setView("sign-in");
      }}
      onSignOutClick={signOut}
      onAdminClick={() => setView("admin-approval")}
      onArchiveClick={() => setView("archive")}
      onBranchClick={() => setView("heritage-branch")}
      onExploreClick={() => openExploreFamily(null)}
      onStewardClick={() => setView("steward-review")}
      onNotificationsClick={() => setView("notifications")}
      onAddMyselfClick={() => setView("add-myself")}
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
        isStaticProfile || resolvedProfile ? (
          <PersonProfilePage
            person={resolvedProfile ?? profile}
            onBack={() => setView("family-tree")}
            onProfilePhotoChange={() => {}}
            onEditProfile={() => setView("profile-edit")}
          />
        ) : (
          <ProfileLoadingState />
        )
      ) : view === "my-profile" ? (
        isStaticProfile || resolvedProfile ? (
          <PersonProfilePage
            person={resolvedProfile ?? profile}
            onBack={() => setView("home")}
            onProfilePhotoChange={() => {}}
            onEditProfile={() => setView("profile-edit")}
          />
        ) : (
          // A createMyself / backend profile is still resolving. Show a loading
          // state instead of falling back to another person's profile (e.g.
          // julia) so a valid personId never flashes the wrong profile.
          <ProfileLoadingState />
        )
      ) : view === "archive-contribute" ? (
        <ArchiveContributionPage onBack={() => setView("home")} />
      ) : view === "admin-approval" ? (
        <AdminApprovalPage onBack={() => setView("home")} />
      ) : view === "steward-review" ? (
        <FamilyStewardReviewPage onBack={() => setView("home")} />
      ) : view === "add-myself" ? (
        <AddMyselfPage
          onBack={() => setView("home")}
          onOpenProfile={(id) => {
            setProfileId(id);
            setView("profile");
          }}
        />
      ) : view === "profile-edit" ? (
        <ProfileEditPage
          personId={profileId}
          onBack={() => setView("profile")}
        />
      ) : view === "notifications" ? (
        <NotificationsPage />
      ) : view === "sign-in" ? (
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-12">
          <LoginSurface />
        </div>
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
