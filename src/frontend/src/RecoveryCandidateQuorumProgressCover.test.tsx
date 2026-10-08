import "@testing-library/jest-dom/vitest";
import { type MyRecoveryRequestView, RecoveryStatus } from "@/backend";
import { FamilyProvider } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  configure,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecoveryStatusPage } from "./pages/RecoveryStatusPage";

// ---------------------------------------------------------------------------
// Phase 4C-H1 — candidate Steward Recovery quorum progress (cover).
//
// The accepted behavior this file asserts, through the real React component
// with a typed local actor mock:
//
//   A. The caller's own Steward Recovery request carries backend-derived
//      `confirmationsReceived` / `confirmationsRequired`, and the candidate
//      status page renders the plain-language progress line
//      "N of 2 family confirmations received" for 0, 1, and 2 confirmations.
//   B. The existing plain-language recovery status and review-stage line still
//      render alongside the new progress line.
//   C. An ordinary Account Recovery request carries no quorum fields and shows
//      no quorum progress line.
//   D. The candidate page stays read-only: no verifier controls, and no
//      verifier identity, principal, membership id, Steward id, recovery id, or
//      audit detail.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract; it does not exercise the real
// canister (see coverageLimits). The mock models the backend's caller filter:
// `listMyRecoveryRequestsForFamily` returns only the signed-in caller's own
// requests, and the quorum counts are supplied by the backend view exactly as
// the real projection computes them.
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";
const OTHER_ACCOUNT = "rrkah-fqaaa-aaaaa-aaaaq-cai";
const STEWARD_ACCOUNT = "ryjl3-tyaaa-aaaaa-aaaba-cai";
const FAMILY_A = "test-family-a";

const {
  mockActor,
  resetState,
  setAuthenticated,
  setMyRequests,
  getAuthenticated,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let myRequests: MyRecoveryRequestView[] = [];
  const calls = {
    listMyRecoveryRequestsForFamily: [] as unknown[][],
  };

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return false;
    },
    async isCallerSteward(): Promise<boolean> {
      return false;
    },
    async hasActiveSteward(): Promise<boolean> {
      return true;
    },
    async getMyProfile(): Promise<null> {
      return null;
    },
    async getMyProfileClaim(): Promise<null> {
      return null;
    },
    async getPersonProfileForFamily(): Promise<null> {
      return null;
    },
    async getPersonProfile(): Promise<null> {
      return null;
    },
    // The caller-scoped status read the candidate page consumes. The mock
    // models the backend's caller filter: it returns only the signed-in
    // caller's own requests, with the quorum counts the backend derived.
    async listMyRecoveryRequestsForFamily(
      ...args: unknown[]
    ): Promise<
      | { __kind__: "ok"; ok: MyRecoveryRequestView[] }
      | { __kind__: "err"; err: string }
    > {
      calls.listMyRecoveryRequestsForFamily.push(args);
      return { __kind__: "ok", ok: myRequests };
    },
    async listNotifications(): Promise<unknown[]> {
      return [];
    },
  };

  return {
    mockActor,
    calls,
    resetState: () => {
      isAuthenticated = false;
      myRequests = [];
      calls.listMyRecoveryRequestsForFamily.length = 0;
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    setMyRequests: (r: MyRecoveryRequestView[]) => {
      myRequests = r;
    },
    getAuthenticated: () => isAuthenticated,
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: getAuthenticated(),
    login: () => {},
    clear: () => {},
    identity: getAuthenticated()
      ? { getPrincipal: () => Principal.fromText(ACCOUNT) }
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
    accountId: getAuthenticated() ? ACCOUNT : undefined,
    signOut: () => {},
  }),
}));

vi.mock("./hooks/useStewardAuthority", () => ({
  useIsSteward: () => ({ data: false, isLoading: false }),
  useHasActiveSteward: () => ({ data: true, isLoading: false }),
  useClaimSteward: () => ({ mutate: () => {}, isPending: false }),
}));

afterEach(cleanup);
beforeEach(() => {
  resetState();
  sessionStorage.clear();
});

/**
 * A Steward Recovery request as the backend's caller-scoped view returns it:
 * the quorum counts are present (the backend populates them only for
 * `#StewardRecovery`).
 */
function stewardRequest(
  received: bigint,
  overrides: Partial<MyRecoveryRequestView> = {},
): MyRecoveryRequestView {
  return {
    targetName: "Lula Mae Norwood",
    status: RecoveryStatus.AwaitingVerification,
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
    confirmationsReceived: received,
    confirmationsRequired: 2n,
    ...overrides,
  };
}

/**
 * An ordinary Account Recovery request as the backend's caller-scoped view
 * returns it: both quorum fields are absent (the backend leaves them null for
 * `#AccountRecovery`).
 */
function accountRequest(
  overrides: Partial<MyRecoveryRequestView> = {},
): MyRecoveryRequestView {
  return {
    targetName: "Clayton Norwood",
    status: RecoveryStatus.Pending,
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
    ...overrides,
  };
}

function renderWithFamily(familyId: string, node: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <FamilyProvider familyId={familyId}>{node}</FamilyProvider>
    </QueryClientProvider>,
  );
}

function renderStatusPage() {
  return renderWithFamily(
    FAMILY_A,
    <RecoveryStatusPage onBack={() => {}} onStartRequest={() => {}} />,
  );
}

// ---------------------------------------------------------------------------
// A. The candidate's Steward Recovery request shows the quorum progress line.
// ---------------------------------------------------------------------------

describe("candidate Steward Recovery quorum progress (cover)", () => {
  it("shows '0 of 2 family confirmations received' when no confirmations exist", async () => {
    setAuthenticated(true);
    setMyRequests([stewardRequest(0n)]);

    renderStatusPage();

    const item = await screen.findByTestId("recovery_status.item.0");
    const quorum = within(item).getByTestId("recovery_status.quorum.0");
    expect(quorum).toHaveTextContent("0 of 2 family confirmations received");
  });

  it("shows '1 of 2 family confirmations received' after one confirmation", async () => {
    setAuthenticated(true);
    setMyRequests([stewardRequest(1n)]);

    renderStatusPage();

    const item = await screen.findByTestId("recovery_status.item.0");
    const quorum = within(item).getByTestId("recovery_status.quorum.0");
    expect(quorum).toHaveTextContent("1 of 2 family confirmations received");
  });

  it("shows '2 of 2 family confirmations received' after two confirmations", async () => {
    setAuthenticated(true);
    setMyRequests([stewardRequest(2n)]);

    renderStatusPage();

    const item = await screen.findByTestId("recovery_status.item.0");
    const quorum = within(item).getByTestId("recovery_status.quorum.0");
    expect(quorum).toHaveTextContent("2 of 2 family confirmations received");
  });

  it("renders the existing plain-language status and stage line alongside the progress line", async () => {
    setAuthenticated(true);
    setMyRequests([stewardRequest(1n)]);

    renderStatusPage();

    const item = await screen.findByTestId("recovery_status.item.0");
    // The existing plain-language status still renders.
    expect(
      within(item).getByText("Waiting for family review"),
    ).toBeInTheDocument();
    // The existing review-stage line still renders.
    expect(
      within(item).getByTestId("recovery_status.stage.0"),
    ).toHaveTextContent("Family members are confirming your request.");
    // And the new quorum progress line renders alongside them.
    expect(
      within(item).getByTestId("recovery_status.quorum.0"),
    ).toHaveTextContent("1 of 2 family confirmations received");
  });
});

// ---------------------------------------------------------------------------
// C. An ordinary Account Recovery request shows no quorum progress line.
// ---------------------------------------------------------------------------

describe("ordinary Account Recovery has no quorum line (cover)", () => {
  it("does not render a quorum progress line when the backend omits the counts", async () => {
    setAuthenticated(true);
    setMyRequests([accountRequest()]);

    renderStatusPage();

    const item = await screen.findByTestId("recovery_status.item.0");
    expect(
      within(item).queryByTestId("recovery_status.quorum.0"),
    ).not.toBeInTheDocument();
    expect(item.textContent ?? "").not.toMatch(
      /\d+\s+of\s+\d+\s+family\s+confirmations?\s+received/i,
    );
  });

  it("does not render a quorum line when only one of the two counts is present", async () => {
    setAuthenticated(true);
    // A defensive case: the page gates on BOTH optional fields being present,
    // so a partial view never fabricates a progress number.
    setMyRequests([accountRequest({ confirmationsReceived: 1n })]);

    renderStatusPage();

    const item = await screen.findByTestId("recovery_status.item.0");
    expect(
      within(item).queryByTestId("recovery_status.quorum.0"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// D. The candidate surface stays read-only and private.
// ---------------------------------------------------------------------------

describe("candidate quorum surface read-only and privacy (cover)", () => {
  it("renders no verifier controls for the candidate", async () => {
    setAuthenticated(true);
    setMyRequests([stewardRequest(1n)]);

    renderStatusPage();

    await screen.findByTestId("recovery_status.item.0");
    expect(
      screen.queryByRole("button", { name: /confirm/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /dispute/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("recovery_verification.confirm_button"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("recovery_verification.dispute_button"),
    ).not.toBeInTheDocument();
  });

  it("never renders a principal, membership id, Steward id, recovery id, or audit detail", async () => {
    setAuthenticated(true);
    setMyRequests([stewardRequest(2n)]);

    renderStatusPage();

    await screen.findByTestId("recovery_status.item.0");
    const body = document.body.textContent ?? "";
    expect(body).not.toContain(ACCOUNT);
    expect(body).not.toContain(OTHER_ACCOUNT);
    expect(body).not.toContain(STEWARD_ACCOUNT);
    expect(body).not.toContain("membershipId");
    expect(body).not.toContain("stewardAccountId");
    expect(body).not.toContain("recoveryId");
    expect(body).not.toContain("verifierAccountId");
    expect(body).not.toContain("audit");
    // No raw enum names.
    expect(body).not.toContain("AwaitingVerification");
    expect(body).not.toContain("StewardRecovery");
  });
});
