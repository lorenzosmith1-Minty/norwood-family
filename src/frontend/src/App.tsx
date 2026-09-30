import { TreePine } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { MembershipStatus } from "./backend";
import { ClaimStewardControl } from "./components/ClaimStewardControl";
import { Layout } from "./components/Layout";
import { LoginSurface } from "./components/LoginSurface";
import { MembershipInactiveShell } from "./components/MembershipInactiveShell";
import { MembershipPendingShell } from "./components/MembershipPendingShell";
import PendingContributionsBadge from "./components/PendingContributionsBadge";
import { useAuth } from "./hooks/useAuth";
import { resolveCanonicalPersonProfile } from "./hooks/useCanonicalPerson";
import { useMyMembershipStatus } from "./hooks/useMyMembershipStatus";
import { useNavbarIdentity } from "./hooks/useNavbarIdentity";
import { usePersonProfile } from "./hooks/useProfileClaims";
import { useIsSteward } from "./hooks/useStewardAuthority";
import { isInvitePath, parseInviteToken } from "./lib/inviteRoute";
import {
  clearInviteToken,
  clearOriginatingView,
  loadInviteToken,
  loadOriginatingView,
  saveOriginatingView,
} from "./lib/originatingView";
import { AddMyselfPage } from "./pages/AddMyselfPage";
import { AdminApprovalPage } from "./pages/AdminApprovalPage";
import { ArchiveContributionPage } from "./pages/ArchiveContributionPage";
import { ArchiveDetailPage } from "./pages/ArchiveDetailPage";
import { ArchivePage } from "./pages/ArchivePage";
import { BoardPostComposer } from "./pages/BoardPostComposer";
import { BoardPostPage } from "./pages/BoardPostPage";
import { ConversationPage } from "./pages/ConversationPage";
import ExploreFamilyPage from "./pages/ExploreFamilyPage";
import { FamilyHistoryHubPage } from "./pages/FamilyHistoryHubPage";
import { FamilyStewardGovernancePage } from "./pages/FamilyStewardGovernancePage";
import { FamilyStewardHubPage } from "./pages/FamilyStewardHubPage";
import { FamilyStewardMembershipReviewsPage } from "./pages/FamilyStewardMembershipReviewsPage";
import { FamilyStewardReviewPage } from "./pages/FamilyStewardReviewPage";
import HeritageBranchPage from "./pages/HeritageBranchPage";
import { HiddenPostsPage } from "./pages/HiddenPostsPage";
import { HomePage } from "./pages/HomePage";
import { InboxPage } from "./pages/InboxPage";
import { InviteRedemptionPage } from "./pages/InviteRedemptionPage";
import { MessageBoardHubPage } from "./pages/MessageBoardHubPage";
import { MessageBoardPage } from "./pages/MessageBoardPage";
import { MysteriesPage } from "./pages/MysteriesPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import {
  PersonProfilePage,
  backendProfileToPersonProfile,
  profiles,
} from "./pages/PersonProfilePage";
import { ProfileEditPage } from "./pages/ProfileEditPage";
import { RecipeContributePage } from "./pages/RecipeContributePage";
import { RecipeDetailPage } from "./pages/RecipeDetailPage";
import { RecipesPage } from "./pages/RecipesPage";
import { ResearchConflictReviewPage } from "./pages/ResearchConflictReviewPage";
import { ResearchIntakePage } from "./pages/ResearchIntakePage";
import { ResearchReviewQueuePage } from "./pages/ResearchReviewQueuePage";
import { StoriesPage } from "./pages/StoriesPage";
import { TimelinePage } from "./pages/TimelinePage";
import { VideoContributePage } from "./pages/VideoContributePage";
import { VideoDetailPage } from "./pages/VideoDetailPage";
import { VideosPage } from "./pages/VideosPage";
import type { MediaKind } from "./types/archive";
import { ClaimStatus, resolveMyProfileRoute } from "./types/ownership";

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
  | "videos"
  | "video-detail"
  | "video-contribute"
  | "add-myself"
  | "steward-review"
  | "governance"
  | "notifications"
  | "profile-edit"
  | "sign-in"
  | "stories"
  | "mysteries"
  | "timeline"
  | "recipes"
  | "recipe-detail"
  | "recipe-contribute"
  | "board"
  | "board-post"
  | "board-compose"
  | "inbox"
  | "conversation"
  | "family-history"
  | "message-board-hub"
  | "steward-hub"
  | "membership-reviews"
  | "hidden-posts"
  | "research-intake"
  | "research-queue"
  | "research-conflict"
  | "invite";

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
  "videos",
  "video-detail",
  "video-contribute",
  "add-myself",
  "steward-review",
  "governance",
  "notifications",
  "profile-edit",
  "sign-in",
  "stories",
  "mysteries",
  "timeline",
  "recipes",
  "recipe-detail",
  "recipe-contribute",
  "board",
  "board-post",
  "board-compose",
  "inbox",
  "conversation",
  "family-history",
  "message-board-hub",
  "steward-hub",
  "membership-reviews",
  "hidden-posts",
  "research-intake",
  "research-queue",
  "research-conflict",
  "invite",
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

/**
 * Route-level guard for Steward-only views. The Family Steward navigation
 * entry is hidden from non-Stewards, but a direct navigation to a Steward-only
 * view must still render an unauthorized state rather than the Steward
 * controls. The individual pages also gate themselves; this guard is the
 * shared routing-level enforcement of the canonical Steward authority.
 */
function StewardOnly({
  isSteward,
  children,
}: {
  isSteward: boolean;
  children: ReactNode;
}) {
  if (isSteward) return <>{children}</>;
  return (
    <div
      data-ocid="steward.unauthorized_state"
      className="mx-auto flex w-full max-w-2xl flex-col items-center justify-center gap-3 px-6 py-24 text-center"
    >
      <p className="font-display text-xl font-semibold text-foreground">
        Steward access only
      </p>
      <p className="max-w-sm text-sm text-muted-foreground">
        This area is reserved for authorized Norwood Family Stewards. If you
        believe this is a mistake, contact a current Steward.
      </p>
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
  // The canonical invite route is `/invite/<raw-token>`. The token is the only
  // invite data in the URL and is treated as opaque. It is parsed once on mount
  // and, when the visitor is signed out, persisted through the existing
  // short-lived session mechanism so the invitation resumes automatically after
  // authentication.
  //
  // A pathname that begins with the invite route but fails canonical parsing
  // (e.g. `/invite`, `/invite/`, `/invite/<token>/extra`, or a malformed
  // percent-encoding) is NOT a valid invite link. It resolves to a null token so
  // the invite surface renders its safe invalid-link state instead of silently
  // falling through to Home.
  const [inviteToken, setInviteToken] = useState<string | null>(() => {
    const fromPath = parseInviteToken(window.location.pathname);
    if (fromPath) return fromPath;
    if (isInvitePath(window.location.pathname)) return null;
    return loadInviteToken();
  });
  const [view, setView] = useState<View>(() => {
    if (
      parseInviteToken(window.location.pathname) ||
      isInvitePath(window.location.pathname) ||
      loadInviteToken()
    ) {
      return "invite";
    }
    return origin && isView(origin.view) ? origin.view : "home";
  });
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
  // The media item currently open in the Family Videos & Oral History detail
  // view. Cleared when navigating away from the detail view.
  const [selectedMediaItemId, setSelectedMediaItemId] = useState<bigint | null>(
    null,
  );
  // Story / mystery id to open directly when navigating to those views (e.g.
  // from a timeline event link). Cleared after the page consumes it.
  const [pendingStoryId, setPendingStoryId] = useState<bigint | null>(null);
  const [pendingMysteryId, setPendingMysteryId] = useState<bigint | null>(null);
  // Last tree person the user explored (opened a profile for). Passed to the
  // Family Tree so the branch containing that person starts expanded when the
  // user returns from the profile view. In-session navigation state only.
  const [, setExploredPersonId] = useState<string | null>(null);
  // The person currently focused in the Explore Family view. When null, the
  // view falls back to its default anchor (the person marked "Me" if present).
  const [exploreFocusId, setExploreFocusId] = useState<string | null>(null);
  // Preselection carried into the add-media flow when launched from a Person
  // Profile: the profile person (as a related member and, for oral history,
  // the speaker), the media kind to start with, and where to return on back.
  // When launched from the Family Videos page this stays null (no preselection).
  const [mediaContributePreselect, setMediaContributePreselect] = useState<{
    personId: string | null;
    kind: MediaKind | null;
    speaker: string | null;
    returnView: "videos" | "profile";
  } | null>(null);
  // The recipe currently open in the Family Recipes detail view. Cleared when
  // navigating away from the detail view.
  const [selectedRecipeId, setSelectedRecipeId] = useState<bigint | null>(null);
  // The board post currently open in the Message Board detail view. Cleared
  // when navigating away from the detail view.
  const [selectedPostId, setSelectedPostId] = useState<bigint | null>(null);
  // The board post being composed/edited in the composer view. Null means a
  // new post; a value means editing that existing post.
  const [composePostId, setComposePostId] = useState<bigint | null>(null);
  // The conversation currently open in the Private Messages conversation view.
  // Cleared when navigating away from the conversation view.
  const [selectedConversationId, setSelectedConversationId] = useState<
    bigint | null
  >(null);
  // The other participant's personId when opening a conversation from a Person
  // Profile. Null when the conversation was opened from the inbox (where the
  // participant is derived from the conversation view).
  const [selectedConversationPersonId, setSelectedConversationPersonId] =
    useState<string | null>(null);
  // Preselection carried into the add-recipe flow when launched from a Person
  // Profile: the profile person (as the originating or related member) and
  // where to return on back. When launched from the Family Recipes page this
  // stays null (no preselection).
  const [recipeContributePreselect, setRecipeContributePreselect] = useState<{
    personId: string | null;
    role: "originating" | "related" | null;
    context: "recipes" | "profile";
  } | null>(null);
  const { data: isSteward = false, isLoading: isStewardLoading } =
    useIsSteward();
  const { isAuthenticated, accountId, signOut } = useAuth();
  // The signed-in caller's own membership in the ACTIVE family. This drives the
  // app-shell routing rule: a Pending membership renders the limited pending
  // shell, a Suspended membership renders the limited review shell, and a Left
  // membership renders the neutral ended shell — all instead of normal family
  // navigation. The read is family-scoped, so an account can be Active in one
  // family and Pending in another and each family resolves its own shell. The
  // read tolerates a mock actor without the method (resolves to null), so the
  // normal family shell still renders in the tester-owned App tests.
  const { membership: myMembership, isLoading: myMembershipLoading } =
    useMyMembershipStatus();
  const {
    displayName,
    status: identityStatus,
    personId: myPersonId,
    claimStatus,
    isLoading: identityLoading,
  } = useNavbarIdentity();
  // Approved family members (a linked, claimed Person Profile) may use the
  // Message Board and Private Messaging. Guests and members with no approved
  // claim are excluded from these nav links.
  const isApprovedMember = claimStatus === ClaimStatus.Claimed;
  // The Add Myself / Add Family nav position toggles on claim state: before an
  // approved claim it reads "Add Myself"; after an approved/claimed profile it
  // reads "Add Family" (which begins the family-member addition workflow).
  const hasClaimedProfile = claimStatus === ClaimStatus.Claimed;

  // Hydration gate: while the signed-in caller's account/profile/claim/steward
  // state is still resolving from the backend, we cannot yet decide
  // permission-dependent navigation. The navbar must NOT render "Add Myself"
  // for an account that owns an approved claim, nor hide authorized features
  // (Message Board, Family Steward) from incomplete state. So while any of
  // this state is still loading, the Layout shows a neutral skeleton in place
  // of the authenticated controls and only renders them once fully resolved.
  const isHydrating = isAuthenticated && (identityLoading || isStewardLoading);

  const profile = profiles[profileId] ?? profiles.julia;

  // Every profile view fetches the backend PersonProfile record for the
  // targeted personId — for BOTH static/seeded people and backend-only/new
  // people — so owner-editable edits (e.g. a preferred-name change or a new
  // story saved on a seeded profile like Lula Mae) propagate to the main
  // profile page instead of rendering the static record directly.
  const isStaticProfile = Boolean(profiles[profileId]);
  const { data: myBackendProfile } = usePersonProfile(profileId, {
    enabled: view === "my-profile" || view === "profile",
  });
  const resolvedProfile = isStaticProfile
    ? // Static/seeded person: merge the backend editable fields into the static
      // canonical display record via the single canonical read adapter. The
      // backend record wins for the fields it owns; the static canonical fills
      // the gaps. When the backend record is unavailable (still loading or
      // absent), fall back safely to the static profile.
      myBackendProfile
      ? resolveCanonicalPersonProfile(myBackendProfile, profiles[profileId])
      : profiles[profileId]
    : // Backend-only person (a createMyself profile keyed by the caller's
      // principal or a graph-only node): preserve the existing non-static path
      // through the canonical adapter with no static canonical record.
      myBackendProfile
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
  //
  // The saved origin is cleared ONLY here, after an authenticated restore has
  // actually been applied (or after it is determined unrestorable). App mount
  // alone never clears it: a signed-out visitor who started sign-in from an
  // invite link must keep the pending invitation until authentication resumes
  // it.
  useEffect(() => {
    if (!isAuthenticated) return;
    const origin = loadOriginatingView();
    if (!origin) return;
    if (!isView(origin.view)) {
      // An origin that names no known view can never be restored; drop it so a
      // stale record does not linger for the rest of the session.
      clearOriginatingView();
      return;
    }
    // The URL governs the invite route. A canonical or malformed invite path
    // already determined the invite view on mount, so a persisted invite origin
    // must not override it (and must not resurrect a stale token).
    if (origin.view === "invite" && isInvitePath(window.location.pathname)) {
      clearOriginatingView();
      return;
    }
    if (origin.profileId) {
      setProfileId(origin.profileId);
    }
    // Resume a pending invitation automatically after authentication: restore
    // the raw token so the invite view re-validates it without asking the user
    // to re-enter the invite link or code.
    if (origin.view === "invite" && origin.inviteToken) {
      setInviteToken(origin.inviteToken);
    }
    setView(origin.view);
    clearOriginatingView();
  }, [isAuthenticated]);

  // Detect the canonical invite route on mount (before/alongside the existing
  // originating-view restore). A valid `/invite/<raw-token>` path always routes
  // to the invite view; a path that begins with the invite route but fails
  // canonical parsing renders the safe invalid-invite state inside the invite
  // page rather than a blank screen or a silent fall-through to Home.
  useEffect(() => {
    const pathname = window.location.pathname;
    const fromPath = parseInviteToken(pathname);
    if (fromPath) {
      setInviteToken(fromPath);
      setView("invite");
      return;
    }
    if (isInvitePath(pathname)) {
      // Malformed invite path: no valid token, so the invite surface renders
      // its invalid-link state. Never fall through to Home.
      setInviteToken(null);
      setView("invite");
      return;
    }
    const persisted = loadInviteToken();
    if (persisted) {
      setInviteToken(persisted);
      setView("invite");
    }
  }, []);

  const openArchiveItem = useCallback((id: bigint) => {
    setSelectedArchiveItemId(id);
    setView("archive-detail");
  }, []);

  // Opens a media item's detail view from the Family Videos & Oral History
  // page or a Person Profile's Videos / Oral History section.
  const openMediaItem = useCallback((id: bigint) => {
    setSelectedMediaItemId(id);
    setView("video-detail");
  }, []);

  // Opens the add-media flow, optionally carrying a preselected person (as a
  // related member and, for oral history, the speaker) and media kind. When
  // launched from a Person Profile, back returns to that profile; from the
  // Family Videos page it returns to Videos with no preselection.
  const openMediaContribute = useCallback(
    (preselect: {
      personId: string | null;
      kind: MediaKind | null;
      speaker: string | null;
      returnView: "videos" | "profile";
    }) => {
      setMediaContributePreselect(preselect);
      setView("video-contribute");
    },
    [],
  );

  // Opens the Family Recipes browsing view.
  const openRecipes = useCallback(() => {
    setView("recipes");
  }, []);

  // Opens a recipe's detail view from the Family Recipes page or a Person
  // Profile's Family Recipes section.
  const openRecipe = useCallback((id: bigint) => {
    setSelectedRecipeId(id);
    setView("recipe-detail");
  }, []);

  // Opens the add-recipe flow, optionally carrying a preselected person (as
  // the originating or related member) and where to return on back. When
  // launched from the Family Recipes page this stays null (no preselection).
  const openRecipeContribute = useCallback(
    (preselect: {
      personId: string | null;
      role: "originating" | "related" | null;
      context: "recipes" | "profile";
    }) => {
      setRecipeContributePreselect(preselect);
      setView("recipe-contribute");
    },
    [],
  );

  // Opens a person's profile view (used by stories, mysteries, and timeline
  // person links).
  const openProfile = useCallback((id: string) => {
    setProfileId(id);
    setView("profile");
  }, []);

  // Opens the stories view focused on a specific story (used by timeline
  // story links).
  const openStory = useCallback((id: bigint) => {
    setPendingStoryId(id);
    setView("stories");
  }, []);

  // Opens the mysteries view focused on a specific mystery (used by timeline
  // mystery links).
  const openMystery = useCallback((id: bigint) => {
    setPendingMysteryId(id);
    setView("mysteries");
  }, []);

  // Opens the Explore Family view centered on a given person. Used by the
  // header "Explore Family" nav button (no focus change) and by the Heritage
  // Branch View when a person is tapped to explore.
  const openExploreFamily = useCallback((personId: string | null) => {
    setExploreFocusId(personId);
    setView("family-tree");
  }, []);

  // Opens the signed-in caller's own profile ("My Profile"). Claim-aware
  // routing: an APPROVED claim routes to the canonical owned profile, a PENDING
  // claim routes to the same canonical profile (which renders the PENDING CLAIM
  // state), and only a caller with NO claim routes to the Add Myself / matching
  // flow. A pending claim is never routed back to the "This is Me" flow.
  const openMyProfile = useCallback(() => {
    const route = resolveMyProfileRoute(claimStatus, myPersonId);
    if ((route === "owned" || route === "pending") && myPersonId) {
      setProfileId(myPersonId);
      setView("my-profile");
      return;
    }
    setView("add-myself");
  }, [claimStatus, myPersonId]);

  // ---- App-shell membership routing rule ----------------------------------
  //
  // After authentication and family-context resolution, the active family's
  // membership status decides the shell:
  //
  //   - Pending   -> the limited pending shell (branding, family name, the
  //                  applicant-safe confirmation status card, Sign out),
  //   - Suspended -> the limited "under review" shell,
  //   - Left      -> the neutral "no longer an active member" shell,
  //   - Active / none -> the normal family application.
  //
  // The rule is per-active-family: `myMembership` is read for the active family
  // only, so an account can be Active in Family A and Pending in Family B and
  // each family resolves its own shell. It holds across refresh and
  // sign-out/sign-in because the read is re-issued on every mount and the
  // membership is backend-owned, not local state.
  //
  // The invite route is exempt: the invite surface owns its own onboarding and
  // terminal states (including its own pending-membership state), so the
  // app-shell rule must not pre-empt it. The gate also waits for the membership
  // read to resolve (`myMembershipLoading`) so the normal shell never flashes
  // before a Pending/Suspended/Left membership is known.
  const membershipStatus = myMembership?.status ?? null;
  const isMembershipResolved = !myMembershipLoading;
  // While the active-family membership read is still resolving we cannot yet
  // tell a Pending/Suspended/Left member from an Active one, so we render a
  // neutral loading state instead of the normal family Layout. This is what
  // actually prevents the normal family navigation (Explore Family, Heritage
  // Branch, Archive, Message Board, ...) from flashing before a limited
  // membership is known. The invite route stays exempt and owns its own states.
  const showMembershipLoading =
    isAuthenticated && !isMembershipResolved && view !== "invite";
  const showPendingShell =
    isAuthenticated &&
    isMembershipResolved &&
    view !== "invite" &&
    membershipStatus === MembershipStatus.Pending;
  const showSuspendedShell =
    isAuthenticated &&
    isMembershipResolved &&
    view !== "invite" &&
    membershipStatus === MembershipStatus.Suspended;
  const showLeftShell =
    isAuthenticated &&
    isMembershipResolved &&
    view !== "invite" &&
    membershipStatus === MembershipStatus.Left;

  if (showMembershipLoading) {
    return (
      <div
        className="invite-screen"
        data-ocid="membership.loading_shell"
        aria-label="Loading family membership"
        aria-busy="true"
      >
        <div className="invite-card" data-ocid="membership.loading_card">
          <span className="invite-crest" aria-hidden="true">
            <TreePine className="h-7 w-7 animate-pulse" strokeWidth={1.75} />
          </span>
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Family
            </p>
            <h1 className="invite-title">Loading your family</h1>
            <p className="invite-hint">
              Checking your membership before opening the family pages.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (showPendingShell) {
    return (
      <MembershipPendingShell
        membershipId={myMembership?.id ?? null}
        membershipStatus={membershipStatus}
        onSignOut={signOut}
      />
    );
  }
  if (showSuspendedShell) {
    return <MembershipInactiveShell kind="suspended" onSignOut={signOut} />;
  }
  if (showLeftShell) {
    return <MembershipInactiveShell kind="left" onSignOut={signOut} />;
  }

  return (
    <Layout
      isSteward={isSteward}
      isAuthenticated={isAuthenticated}
      isApprovedMember={isApprovedMember}
      isHydrating={isHydrating}
      hasClaimedProfile={hasClaimedProfile}
      accountId={accountId}
      identityName={displayName}
      identityStatus={identityStatus}
      activeView={view}
      onMyProfileClick={openMyProfile}
      onSignInClick={() => {
        if (view !== "sign-in") saveOriginatingView({ view });
        setView("sign-in");
      }}
      onSignOutClick={signOut}
      onArchiveClick={() => setView("archive")}
      onBranchClick={() => setView("heritage-branch")}
      onExploreClick={() => openExploreFamily(null)}
      onHistoryClick={() => setView("family-history")}
      onAddMyselfClick={() => setView("add-myself")}
      onMessageBoardClick={() => setView("message-board-hub")}
      onStewardClick={() => setView("steward-hub")}
      onNotificationsClick={() => setView("notifications")}
    >
      <ClaimStewardControl
        isAuthenticated={isAuthenticated}
        isHydrating={isHydrating}
        onClaimed={() => setView("steward-hub")}
      />
      {view === "home" ? (
        <HomePage
          onExplore={() => openExploreFamily(null)}
          onAddToHistory={() => setView("archive-contribute")}
          onOpenBranch={() => setView("heritage-branch")}
          onOpenStories={() => {
            setPendingStoryId(null);
            setView("stories");
          }}
          onOpenMysteries={() => {
            setPendingMysteryId(null);
            setView("mysteries");
          }}
          onOpenTimeline={() => setView("timeline")}
          onOpenVideos={() => setView("videos")}
          onOpenRecipes={openRecipes}
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
          onSignIn={() => {
            saveOriginatingView({ view });
            setView("sign-in");
          }}
        />
      ) : view === "heritage-branch" ? (
        <HeritageBranchPage
          onOpenExploreFamily={openExploreFamily}
          onSignIn={() => {
            saveOriginatingView({ view });
            setView("sign-in");
          }}
        />
      ) : view === "profile" ? (
        isStaticProfile || resolvedProfile ? (
          <PersonProfilePage
            person={resolvedProfile ?? profile}
            onBack={() => setView("family-tree")}
            onProfilePhotoChange={() => {}}
            onEditProfile={() => setView("profile-edit")}
            onClaimApproved={openMyProfile}
            onOpenMediaItem={openMediaItem}
            onOpenRecipes={openRecipes}
            onOpenRecipe={openRecipe}
            onOpenConversation={(personId) => {
              setSelectedConversationPersonId(personId);
              setSelectedConversationId(null);
              setView("conversation");
            }}
            onOpenRecipeContribute={(preselect) =>
              openRecipeContribute({
                personId: preselect.personId,
                role: "originating",
                context: "profile",
              })
            }
            onOpenConflictReview={() => setView("research-conflict")}
            onAddMedia={(action) =>
              openMediaContribute({
                personId: (resolvedProfile ?? profile).id,
                kind:
                  action === "video"
                    ? "uploaded-video"
                    : action === "oral-history"
                      ? "oral-history-video"
                      : "audio-only-oral-history",
                speaker:
                  action === "oral-history"
                    ? (resolvedProfile ?? profile).id
                    : null,
                returnView: "profile",
              })
            }
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
            onClaimApproved={openMyProfile}
            onOpenMediaItem={openMediaItem}
            onOpenRecipes={openRecipes}
            onOpenRecipe={openRecipe}
            onOpenConversation={(personId) => {
              setSelectedConversationPersonId(personId);
              setSelectedConversationId(null);
              setView("conversation");
            }}
            onOpenRecipeContribute={(preselect) =>
              openRecipeContribute({
                personId: preselect.personId,
                role: "originating",
                context: "profile",
              })
            }
            onOpenConflictReview={() => setView("research-conflict")}
            onAddMedia={(action) =>
              openMediaContribute({
                personId: (resolvedProfile ?? profile).id,
                kind:
                  action === "video"
                    ? "uploaded-video"
                    : action === "oral-history"
                      ? "oral-history-video"
                      : "audio-only-oral-history",
                speaker:
                  action === "oral-history"
                    ? (resolvedProfile ?? profile).id
                    : null,
                returnView: "profile",
              })
            }
          />
        ) : (
          // A createMyself / backend profile is still resolving. Show a loading
          // state instead of falling back to another person's profile (e.g.
          // julia) so a valid personId never flashes the wrong profile.
          <ProfileLoadingState />
        )
      ) : view === "archive-contribute" ? (
        <ArchiveContributionPage
          onBack={() => setView("home")}
          onClaimProfile={() => setView("add-myself")}
        />
      ) : view === "admin-approval" ? (
        <StewardOnly isSteward={isSteward}>
          <AdminApprovalPage onBack={() => setView("home")} />
        </StewardOnly>
      ) : view === "steward-review" ? (
        <StewardOnly isSteward={isSteward}>
          <FamilyStewardReviewPage onBack={() => setView("home")} />
        </StewardOnly>
      ) : view === "membership-reviews" ? (
        <StewardOnly isSteward={isSteward}>
          <FamilyStewardMembershipReviewsPage
            onBack={() => setView("steward-hub")}
          />
        </StewardOnly>
      ) : view === "governance" ? (
        <StewardOnly isSteward={isSteward}>
          <FamilyStewardGovernancePage onBack={() => setView("home")} />
        </StewardOnly>
      ) : view === "add-myself" ? (
        <AddMyselfPage
          onBack={() => setView("home")}
          onOpenProfile={(id) => {
            setProfileId(id);
            setView("profile");
          }}
          onClaimApproved={openMyProfile}
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
      ) : view === "invite" ? (
        <InviteRedemptionPage
          rawToken={inviteToken}
          isAuthenticated={isAuthenticated}
          onSignIn={() => {
            if (inviteToken) {
              saveOriginatingView({ view: "invite", inviteToken });
            }
            setView("sign-in");
          }}
          onConsumed={() => {
            clearInviteToken();
            setInviteToken(null);
            // Remove the raw bearer token from the address bar so no consumed
            // token remains visible or shareable after returning Home. The
            // token is only ever in the URL on the invite route, so the path is
            // reset to the app root.
            if (isInvitePath(window.location.pathname)) {
              window.history.replaceState({}, "", "/");
            }
            setView("home");
          }}
        />
      ) : view === "stories" ? (
        <StoriesPage
          onBack={() => setView("home")}
          onOpenProfile={openProfile}
          initialStoryId={pendingStoryId}
        />
      ) : view === "mysteries" ? (
        <MysteriesPage
          onBack={() => setView("home")}
          onOpenProfile={openProfile}
          initialMysteryId={pendingMysteryId}
        />
      ) : view === "timeline" ? (
        <TimelinePage
          onBack={() => setView("home")}
          onOpenProfile={openProfile}
          onOpenStory={openStory}
          onOpenArchiveItem={openArchiveItem}
          onOpenMystery={openMystery}
        />
      ) : view === "archive" ? (
        <ArchivePage
          onBack={() => setView("home")}
          onOpenArchiveItem={openArchiveItem}
          onOpenVideos={() => setView("videos")}
          onOpenRecipes={openRecipes}
          onAddToArchive={() => setView("archive-contribute")}
        />
      ) : view === "videos" ? (
        <VideosPage
          onBack={() => setView("archive")}
          onOpenMediaItem={openMediaItem}
          onAddMedia={() =>
            openMediaContribute({
              personId: null,
              kind: null,
              speaker: null,
              returnView: "videos",
            })
          }
        />
      ) : view === "video-detail" ? (
        <VideoDetailPage
          itemId={selectedMediaItemId ?? 0n}
          onBack={() => setView("videos")}
          onOpenProfile={(id) => {
            setProfileId(id);
            setView("profile");
          }}
        />
      ) : view === "video-contribute" ? (
        <VideoContributePage
          onBack={() =>
            mediaContributePreselect?.returnView === "profile"
              ? setView("profile")
              : setView("videos")
          }
          onViewPendingContributions={() => setView("admin-approval")}
          initialKind={mediaContributePreselect?.kind ?? undefined}
          initialRelatedMemberIds={
            mediaContributePreselect?.personId
              ? [mediaContributePreselect.personId]
              : undefined
          }
          initialSpeakerId={mediaContributePreselect?.speaker ?? undefined}
          onClaimProfile={() => setView("add-myself")}
        />
      ) : view === "recipes" ? (
        <RecipesPage
          onBack={() => setView("home")}
          onOpenRecipe={openRecipe}
          onAddRecipe={() =>
            openRecipeContribute({
              personId: null,
              role: null,
              context: "recipes",
            })
          }
        />
      ) : view === "recipe-detail" ? (
        <RecipeDetailPage
          recipeId={selectedRecipeId ?? 0n}
          onBack={() => setView("recipes")}
          onOpenProfile={(id) => {
            setProfileId(id);
            setView("profile");
          }}
        />
      ) : view === "recipe-contribute" ? (
        <RecipeContributePage
          onBack={() =>
            recipeContributePreselect?.context === "profile"
              ? setView("profile")
              : setView("recipes")
          }
          onOpenRecipes={openRecipes}
          onClaimProfile={() => setView("add-myself")}
          preselect={
            recipeContributePreselect?.personId &&
            recipeContributePreselect.role
              ? {
                  personId: recipeContributePreselect.personId,
                  role: recipeContributePreselect.role,
                }
              : undefined
          }
        />
      ) : view === "board" ? (
        <MessageBoardPage
          onBack={() => setView("home")}
          onOpenPost={(id) => {
            setSelectedPostId(id);
            setView("board-post");
          }}
          onCompose={() => {
            setComposePostId(null);
            setView("board-compose");
          }}
          onOpenProfile={(id) => {
            setProfileId(id);
            setView("profile");
          }}
        />
      ) : view === "board-post" ? (
        <BoardPostPage
          postId={selectedPostId ?? 0n}
          onBack={() => setView("board")}
          onOpenProfile={(id) => {
            setProfileId(id);
            setView("profile");
          }}
          onEdit={() => {
            setComposePostId(selectedPostId);
            setView("board-compose");
          }}
        />
      ) : view === "board-compose" ? (
        <BoardPostComposer
          postId={composePostId}
          onBack={() =>
            composePostId !== null ? setView("board-post") : setView("board")
          }
          onOpenProfile={(id) => {
            setProfileId(id);
            setView("profile");
          }}
        />
      ) : view === "inbox" ? (
        <InboxPage
          onBack={() => setView("home")}
          onOpenConversation={(id) => {
            setSelectedConversationId(id);
            setSelectedConversationPersonId(null);
            setView("conversation");
          }}
        />
      ) : view === "conversation" ? (
        <ConversationPage
          conversationId={selectedConversationId}
          personId={selectedConversationPersonId}
          onBack={() => setView("inbox")}
          onOpenProfile={(id) => {
            setProfileId(id);
            setView("profile");
          }}
        />
      ) : view === "family-history" ? (
        <FamilyHistoryHubPage
          onBack={() => setView("home")}
          onOpenStories={() => {
            setPendingStoryId(null);
            setView("stories");
          }}
          onOpenMysteries={() => {
            setPendingMysteryId(null);
            setView("mysteries");
          }}
          onOpenTimeline={() => setView("timeline")}
        />
      ) : view === "message-board-hub" ? (
        <MessageBoardHubPage
          onBack={() => setView("home")}
          onOpenBoard={() => setView("board")}
          onOpenInbox={() => setView("inbox")}
        />
      ) : view === "steward-hub" ? (
        <StewardOnly isSteward={isSteward}>
          <FamilyStewardHubPage
            onBack={() => setView("home")}
            onOpenReview={() => setView("steward-review")}
            onOpenMembershipReviews={() => setView("membership-reviews")}
            onOpenPendingContributions={() => setView("admin-approval")}
            onOpenGovernance={() => setView("governance")}
            onOpenResearchIntake={() => setView("research-intake")}
            onOpenHiddenPosts={() => setView("hidden-posts")}
          />
        </StewardOnly>
      ) : view === "hidden-posts" ? (
        <StewardOnly isSteward={isSteward}>
          <HiddenPostsPage
            onBack={() => setView("steward-hub")}
            onOpenPost={(id) => {
              setSelectedPostId(id);
              setView("board-post");
            }}
            onOpenProfile={(id) => {
              setProfileId(id);
              setView("profile");
            }}
          />
        </StewardOnly>
      ) : view === "research-intake" ? (
        <StewardOnly isSteward={isSteward}>
          <ResearchIntakePage
            onBack={() => setView("steward-hub")}
            onOpenReviewQueue={() => setView("research-queue")}
            onOpenConflictReview={() => setView("research-conflict")}
          />
        </StewardOnly>
      ) : view === "research-queue" ? (
        <StewardOnly isSteward={isSteward}>
          <ResearchReviewQueuePage onBack={() => setView("research-intake")} />
        </StewardOnly>
      ) : view === "research-conflict" ? (
        <StewardOnly isSteward={isSteward}>
          <ResearchConflictReviewPage
            onBack={() => setView("research-intake")}
          />
        </StewardOnly>
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
