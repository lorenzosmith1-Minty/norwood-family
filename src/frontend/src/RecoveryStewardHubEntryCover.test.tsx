import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  LivingStatus,
  type MyRecoveryRequestView,
  type PersonProfile,
  type RecoveryRequest,
  RecoveryStatus,
  RecoveryType,
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
import { RecoveryStatusPage } from "./pages/RecoveryStatusPage";

// ---------------------------------------------------------------------------
// Phase 4B — Steward-hub recovery entry point and status error state (cover).
//
// The accepted behavior this file asserts, through the real React components
// with a typed local actor mock:
//
//   1. An active Family Steward sees a "Recovery Reviews" option inside the
//      Family Steward hub, and the card routes to its own handler. The existing
//      RecoveryUiCover.test.tsx renders the review PAGE directly and the
//      adjacent characterization file renders the hub WITHOUT the recovery
//      handler, so neither exercises the hub entry point the requirement names.
//   2. The app shell wires the hub's recovery card to the recovery-reviews
//      view: a Steward who opens the hub and clicks the card lands on the
//      Recovery Reviews surface.
//   3. The hub's recovery count badge reflects the canonical Steward queue
//      (ordinary Account Recovery requests awaiting a decision) and is absent
//      when nothing awaits a decision.
//   4. The replacement-account status page renders a neutral error state with a
//      Retry action and never surfaces a technical error tag.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract; it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";
const STEWARD_ACCOUNT = "ryjl3-tyaaa-aaaaa-aaaba-cai";
const OTHER_ACCOUNT = "rrkah-fqaaa-aaaaa-aaaaq-cai";

const {
  mockActor,
  resetState,
  setAuthenticated,
  setSteward,
  setMyProfile,
  setRecoveryRequests,
  setListOutcome,
  getAuthenticated,
  getSteward,
  getCurrentPrincipal,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isSteward = false;
  let myProfile: PersonProfile | null = null;
  let recoveryRequests: RecoveryRequest[] = [];
  let listOutcome: "ok" | "err" = "ok";

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
    async getMyProfileClaim(): Promise<null> {
      return null;
    },
    async getPersonProfileForFamily(
      _familyId: string,
      personId: string,
    ): Promise<PersonProfile | null> {
      return {
        familyId: "norwood",
        personId,
        name: personId === "lula-mae" ? "Lula Mae Norwood" : "Clayton Norwood",
        livingStatus: LivingStatus.Living,
        claimStatus: ClaimStatus.Claimed,
        claimedByUserId: Principal.fromText(OTHER_ACCOUNT),
      };
    },
    async getPersonProfile(): Promise<PersonProfile | null> {
      return null;
    },
    async listRecoveryRequestsForFamily(): Promise<
      | { __kind__: "ok"; ok: RecoveryRequest[] }
      | { __kind__: "err"; err: string }
    > {
      if (listOutcome === "err") {
        return { __kind__: "err", err: "NotAuthorized" };
      }
      return { __kind__: "ok", ok: recoveryRequests };
    },
    // The caller-scoped status read. The status page consumes this endpoint,
    // not the Steward-only family list.
    async listMyRecoveryRequestsForFamily(): Promise<
      | { __kind__: "ok"; ok: MyRecoveryRequestView[] }
      | { __kind__: "err"; err: string }
    > {
      if (listOutcome === "err") {
        return { __kind__: "err", err: "NotAuthorized" };
      }
      return { __kind__: "ok", ok: [] };
    },
    // Steward hub data sources (empty is the correct empty-state read).
    async listProfileClaims(): Promise<unknown[]> {
      return [];
    },
    async listRelationshipRequests(): Promise<unknown[]> {
      return [];
    },
    async listReports(): Promise<unknown[]> {
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
      recoveryRequests = [];
      listOutcome = "ok";
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
    setRecoveryRequests: (r: RecoveryRequest[]) => {
      recoveryRequests = r;
    },
    setListOutcome: (o: "ok" | "err") => {
      listOutcome = o;
    },
    getAuthenticated: () => isAuthenticated,
    getSteward: () => isSteward,
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

vi.mock("./hooks/useAuth", () => ({
  useAuth: () => ({
    isAuthenticated: getAuthenticated(),
    isInitializing: false,
    accountId: getAuthenticated() ? getCurrentPrincipal() : undefined,
    signOut: () => {},
  }),
}));

vi.mock("./hooks/useStewardAuthority", () => ({
  useIsSteward: () => ({
    data: getAuthenticated() && getSteward(),
    isLoading: false,
  }),
  useHasActiveSteward: () => ({ data: true, isLoading: false }),
  useClaimSteward: () => ({ mutate: () => {}, isPending: false }),
}));

afterEach(cleanup);
beforeEach(() => {
  resetState();
  sessionStorage.clear();
});

function recoveryRequest(
  overrides: Partial<RecoveryRequest> = {},
): RecoveryRequest {
  return {
    familyId: "norwood",
    id: 7n,
    recoveryType: RecoveryType.AccountRecovery,
    personId: "lula-mae",
    ownerAccountId: Principal.fromText(OTHER_ACCOUNT),
    replacementAccountId: Principal.fromText(ACCOUNT),
    status: RecoveryStatus.Pending,
    requestedByAccountId: Principal.fromText(ACCOUNT),
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
    decidedByAccountId: undefined,
    decidedAt: undefined,
    transferredAt: undefined,
    ...overrides,
  };
}

function claimedProfile(): PersonProfile {
  return {
    familyId: "norwood",
    personId: "lula-mae",
    name: "Lula Mae Norwood",
    livingStatus: LivingStatus.Living,
    claimStatus: ClaimStatus.Claimed,
    claimedByUserId: Principal.fromText(ACCOUNT),
  };
}

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
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
  onOpenRecoveryReviews: ReturnType<typeof vi.fn>;
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
    onOpenRecoveryReviews: vi.fn(),
  };
  renderWithClient(<FamilyStewardHubPage {...handlers} />);
  return handlers;
}

// ---------------------------------------------------------------------------
// 1. The Steward hub exposes the recovery-review entry point.
// ---------------------------------------------------------------------------

describe("Family Steward hub: recovery-review entry point (cover)", () => {
  it("shows the Recovery Reviews card to a Steward and routes it to its handler", async () => {
    const user = userEvent.setup();
    setAuthenticated(true);
    setSteward(true);
    const handlers = renderHub();

    const card = await screen.findByTestId(
      "steward_hub.recovery_reviews_option",
    );
    expect(within(card).getByText("Recovery Reviews")).toBeInTheDocument();

    await user.click(card);
    expect(handlers.onOpenRecoveryReviews).toHaveBeenCalledTimes(1);
    // The recovery card does not mis-route to another steward area.
    expect(handlers.onOpenReview).not.toHaveBeenCalled();
    expect(handlers.onOpenMembershipReviews).not.toHaveBeenCalled();
    expect(handlers.onOpenGovernance).not.toHaveBeenCalled();
  });

  it("does not render the recovery card for a non-Steward", async () => {
    setAuthenticated(true);
    setSteward(false);
    renderHub();

    expect(
      await screen.findByTestId("steward_hub.unauthorized_state"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("steward_hub.recovery_reviews_option"),
    ).not.toBeInTheDocument();
  });

  it("shows a count badge on the recovery card when requests await a decision", async () => {
    setAuthenticated(true);
    setSteward(true);
    setRecoveryRequests([
      recoveryRequest({ id: 11n }),
      recoveryRequest({ id: 12n, personId: "clayton" }),
    ]);
    renderHub();

    const card = await screen.findByTestId(
      "steward_hub.recovery_reviews_option",
    );
    expect(
      await within(card).findByTestId("steward_hub.count_badge"),
    ).toHaveTextContent("2");
  });

  it("shows no count badge on the recovery card when nothing awaits a decision", async () => {
    setAuthenticated(true);
    setSteward(true);
    setRecoveryRequests([]);
    renderHub();

    const card = await screen.findByTestId(
      "steward_hub.recovery_reviews_option",
    );
    expect(
      within(card).queryByTestId("steward_hub.count_badge"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2. The app shell wires the hub card to the recovery-reviews view.
// ---------------------------------------------------------------------------

describe("app shell: Steward hub recovery routing (cover)", () => {
  it("routes the hub Recovery Reviews card to the recovery-review surface", async () => {
    const user = userEvent.setup();
    setAuthenticated(true);
    setSteward(true);
    setMyProfile(claimedProfile());
    renderWithClient(<App />);

    // Open the Family Steward hub from the shell nav.
    await user.click(
      await screen.findByRole("button", { name: /Family Steward/ }),
    );
    await screen.findByTestId("steward_hub.grid");

    // The recovery card is present and opens the review surface.
    await user.click(screen.getByTestId("steward_hub.recovery_reviews_option"));

    expect(
      await screen.findByRole("heading", { name: "Recovery Reviews" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId("recovery_reviews.panel"),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 3. The replacement-account status page error state is neutral.
// ---------------------------------------------------------------------------

describe("recovery status page: neutral error state (cover)", () => {
  it("renders a neutral error state with Retry and no technical tag", async () => {
    setAuthenticated(true);
    // The caller-scoped status read fails, so the page renders a neutral error
    // state with a Retry action rather than surfacing the error tag.
    setListOutcome("err");
    renderWithClient(
      <RecoveryStatusPage onBack={() => {}} onStartRequest={() => {}} />,
    );

    expect(
      await screen.findByTestId("recovery_status.error_state"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("recovery_status.retry_button"),
    ).toBeInTheDocument();
    const body = document.body.textContent ?? "";
    expect(body).not.toContain("NotAuthorized");
    expect(body).not.toContain("Error");
  });
});
