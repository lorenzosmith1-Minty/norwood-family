import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  LivingStatus,
  type PersonProfile,
  type ProfileClaim,
  type RelationshipRequest,
  type Report,
} from "@/backend";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  configure,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { FamilyStewardHubPage } from "./pages/FamilyStewardHubPage";

// ---------------------------------------------------------------------------
// Characterization baseline for the ADJACENT working behavior that the Phase
// 4B "Recover my Norwood profile" UI must NOT disturb.
//
// The requested change adds a recovery entry point to the app shell navigation,
// a self-service recovery request surface, and a recovery-review surface inside
// the Family Steward hub. None of those exist yet, so this file deliberately
// does NOT characterize them.
//
// What it protects is the existing shell and Steward-hub behavior the new
// surfaces are added alongside and must reuse rather than displace:
//
//   A. The Family Steward hub keeps rendering every existing option card and
//      each card keeps routing to its own handler. The new recovery-review
//      surface is added to this same grid, so a regression here would silently
//      drop or mis-route an existing steward area.
//   B. The app shell keeps every existing navigation entry and keeps its
//      permission gating: the public links are always present, the Family
//      Steward link is Steward-only, and the Message Board link is
//      approved-member-only. The new recovery entry point is added to this same
//      header, so a regression here would displace or leak an existing link.
//   C. The app shell keeps routing its existing views: navigating to the
//      Archive, Notifications, and Family Steward hub still renders those
//      existing pages. The new recovery view is added to the same view router,
//      so a regression here would break an existing route.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract; it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";
const STEWARD_ACCOUNT = "ryjl3-tyaaa-aaaaa-aaaba-cai";

const {
  mockActor,
  resetState,
  setAuthenticated,
  setSteward,
  setMyProfile,
  getAuthenticated,
  getCurrentPrincipal,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isSteward = false;
  let myProfile: PersonProfile | null = null;

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return isSteward;
    },
    async isCallerSteward(): Promise<boolean> {
      return isSteward;
    },
    async hasActiveSteward(): Promise<boolean> {
      return true;
    },
    async getMyProfile(): Promise<PersonProfile | null> {
      return myProfile;
    },
    async getMyProfileClaim(_personId: string): Promise<ProfileClaim | null> {
      return null;
    },
    async getPersonProfile(_personId: string): Promise<PersonProfile | null> {
      return null;
    },
    // Steward hub data sources. Empty is the correct empty-state read.
    async listProfileClaims(): Promise<ProfileClaim[]> {
      return [];
    },
    async listRelationshipRequests(): Promise<RelationshipRequest[]> {
      return [];
    },
    async listReports(): Promise<Report[]> {
      return [];
    },
    async listPendingArchiveItems(): Promise<unknown[]> {
      return [];
    },
    async getReviewQueue() {
      return { pending: 0n, needsResearch: 0n, conflicting: 0n };
    },
    async listMembershipConfirmationReviewsForSteward() {
      return { __kind__: "ok", ok: [] };
    },
    async listNotifications(): Promise<unknown[]> {
      return [];
    },
  };

  return {
    mockActor,
    resetState: () => {
      isAuthenticated = false;
      isSteward = false;
      myProfile = null;
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    setSteward: (v: boolean) => {
      isSteward = v;
    },
    setMyProfile: (p: PersonProfile | null) => {
      myProfile = p;
    },
    getAuthenticated: () => isAuthenticated,
    getCurrentPrincipal: () => (isSteward ? STEWARD_ACCOUNT : ACCOUNT),
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: getAuthenticated(),
    login: () => {},
    clear: () => {},
    identity: getAuthenticated()
      ? { getPrincipal: () => Principal.fromText(getCurrentPrincipal()) }
      : null,
    isInitializing: false,
    isLoggingIn: false,
    isLoginError: false,
    loginError: null,
  }),
}));

afterEach(cleanup);
beforeEach(() => {
  resetState();
  sessionStorage.clear();
});

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

interface HubHandlers {
  onBack: ReturnType<typeof vi.fn>;
  onOpenReview: ReturnType<typeof vi.fn>;
  onOpenPendingContributions: ReturnType<typeof vi.fn>;
  onOpenGovernance: ReturnType<typeof vi.fn>;
  onOpenResearchIntake: ReturnType<typeof vi.fn>;
  onOpenHiddenPosts: ReturnType<typeof vi.fn>;
  onOpenMembershipReviews: ReturnType<typeof vi.fn>;
}

function renderHub(): HubHandlers {
  const handlers: HubHandlers = {
    onBack: vi.fn(),
    onOpenReview: vi.fn(),
    onOpenPendingContributions: vi.fn(),
    onOpenGovernance: vi.fn(),
    onOpenResearchIntake: vi.fn(),
    onOpenHiddenPosts: vi.fn(),
    onOpenMembershipReviews: vi.fn(),
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <FamilyStewardHubPage {...handlers} />
    </QueryClientProvider>,
  );
  return handlers;
}

function claimedProfile(): PersonProfile {
  return {
    familyId: "norwood",
    personId: "lorenzoSmithJr",
    name: "Lorenzo Smith Jr.",
    livingStatus: LivingStatus.Living,
    claimStatus: ClaimStatus.Claimed,
    claimedByUserId: Principal.fromText(ACCOUNT),
    preferredName: "Waxx Minty",
    story: undefined,
    occupation: undefined,
    birthInfo: undefined,
    timeline: undefined,
    privacySettings: undefined,
  };
}

// ---------------------------------------------------------------------------
// A. The Family Steward hub keeps routing every existing option card.
// ---------------------------------------------------------------------------

describe("Family Steward hub: existing option-card routing (characterization)", () => {
  it("routes each existing option card to its own handler", async () => {
    const user = userEvent.setup();
    setAuthenticated(true);
    setSteward(true);
    const handlers = renderHub();

    await screen.findByTestId("steward_hub.grid");

    // Each card is clicked in turn and must invoke its own handler. Several
    // cards intentionally share a handler (the governance group), so the
    // assertion tracks the per-handler call count as it increments rather than
    // requiring exactly one call overall.
    const routes: Array<[string, keyof HubHandlers]> = [
      ["steward_hub.research_intake_option", "onOpenResearchIntake"],
      ["steward_hub.review_option", "onOpenReview"],
      ["steward_hub.membership_reviews_option", "onOpenMembershipReviews"],
      ["steward_hub.pending_option", "onOpenPendingContributions"],
      ["steward_hub.governance_option", "onOpenGovernance"],
      ["steward_hub.stewards_option", "onOpenGovernance"],
      ["steward_hub.duplicates_option", "onOpenGovernance"],
      ["steward_hub.relationships_option", "onOpenGovernance"],
      ["steward_hub.archived_option", "onOpenGovernance"],
      ["steward_hub.audit_option", "onOpenGovernance"],
      ["steward_hub.reported_option", "onOpenReview"],
      ["steward_hub.hidden_posts_option", "onOpenHiddenPosts"],
    ];

    const expectedCounts = new Map<keyof HubHandlers, number>();
    for (const [ocid, handler] of routes) {
      const before = expectedCounts.get(handler) ?? 0;
      const card = screen.getByTestId(ocid);
      await user.click(card);
      expectedCounts.set(handler, before + 1);
      expect(handlers[handler]).toHaveBeenCalledTimes(before + 1);
    }

    // No card routed to a handler it does not own.
    expect(handlers.onBack).not.toHaveBeenCalled();
  });

  it("keeps the hub gated to Stewards (no grid for a non-Steward)", async () => {
    setAuthenticated(true);
    setSteward(false);
    renderHub();

    expect(
      await screen.findByTestId("steward_hub.unauthorized_state"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("steward_hub.grid")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// B. The app shell keeps every existing navigation entry and its gating.
// ---------------------------------------------------------------------------

describe("app shell: existing navigation entries (characterization)", () => {
  it("keeps every public navigation entry for a signed-out visitor", () => {
    setAuthenticated(false);
    renderApp();

    for (const label of [
      "Explore Family",
      "Heritage Branch",
      "Family Archive",
      "Family History",
      "Add Myself",
      "Notifications",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    // Steward and Message Board entries are permission-gated and absent.
    expect(
      screen.queryByRole("button", { name: /Family Steward/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Message Board" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the Steward entry Steward-only and the Message Board entry approved-member-only", async () => {
    setAuthenticated(true);
    setSteward(false);
    setMyProfile(claimedProfile());
    renderApp();

    // An approved member sees the Message Board entry but not the Steward entry.
    expect(
      await screen.findByRole("button", { name: "Message Board" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Family Steward/ }),
    ).not.toBeInTheDocument();
  });

  it("shows the Steward entry to a signed-in Steward alongside the public links", async () => {
    setAuthenticated(true);
    setSteward(true);
    renderApp();

    expect(
      await screen.findByRole("button", { name: /Family Steward/ }),
    ).toBeInTheDocument();
    for (const label of [
      "Explore Family",
      "Heritage Branch",
      "Family Archive",
      "Family History",
      "Notifications",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });
});

// ---------------------------------------------------------------------------
// C. The app shell keeps routing its existing views.
// ---------------------------------------------------------------------------

describe("app shell: existing view routing (characterization)", () => {
  it("routes the Family Archive nav entry to the Archive page", async () => {
    const user = userEvent.setup();
    setAuthenticated(true);
    setSteward(false);
    renderApp();

    await user.click(
      await screen.findByRole("button", { name: "Family Archive" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Our Family Archive" }),
    ).toBeInTheDocument();
  });

  it("routes the Notifications nav entry to the Notifications page", async () => {
    const user = userEvent.setup();
    setAuthenticated(true);
    setSteward(false);
    renderApp();

    await user.click(
      await screen.findByRole("button", { name: "Notifications" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Notifications" }),
    ).toBeInTheDocument();
  });

  it("routes the Steward nav entry to the Family Steward hub for a Steward", async () => {
    const user = userEvent.setup();
    setAuthenticated(true);
    setSteward(true);
    renderApp();

    await user.click(
      await screen.findByRole("button", { name: /Family Steward/ }),
    );

    expect(await screen.findByTestId("steward_hub.grid")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("steward_hub.grid")).getByTestId(
        "steward_hub.review_option",
      ),
    ).toBeInTheDocument();
  });
});
