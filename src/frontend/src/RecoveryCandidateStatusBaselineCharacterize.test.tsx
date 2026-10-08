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
// Characterization baseline for the Phase 4C-H1 change.
//
// The requested change will intentionally:
//
//   * add optional `confirmationsReceived` / `confirmationsRequired` fields to
//     the caller-scoped `MyRecoveryRequestView`; and
//   * add a plain-language quorum-progress line to RecoveryStatusPage for
//     Steward Recovery requests.
//
// This file deliberately does NOT freeze either of those two behaviors. It does
// not assert that the caller-scoped view lacks quorum fields, and it does not
// assert that the candidate page lacks a quorum line for a Steward Recovery
// request — both are exactly what the change is allowed to alter.
//
// What it protects is the SURROUNDING candidate-status behavior that must
// remain unchanged while the quorum line is added:
//
//   A. The candidate's own status page keeps rendering the existing
//      plain-language status and the page-local review-stage line for every
//      OPEN status (Pending, AwaitingVerification, ReadyForApproval), and the
//      resolved states keep their closed read-only note. The new quorum line is
//      inserted into this same row, so a regression here would displace or hide
//      the existing status copy.
//   B. An ordinary Account Recovery request shows NO quorum progress line. The
//      quorum line is specific to the 2-member Steward Recovery path; an
//      ordinary request must never gain a fabricated "N of M" count.
//   C. The candidate surface stays strictly read-only and private: it renders
//      no verifier controls, and no verifier identity, account principal,
//      membership id, Steward id, recovery id, or audit detail. The candidate
//      tracks their own request and never sees who verified it.
//   D. The page keeps its neutral empty state and its neutral error state with a
//      Retry action, so the added line cannot break the non-list states.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract; it does not exercise the real
// canister (see coverageLimits).
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
  setMyRequestsError,
  getAuthenticated,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let myRequests: MyRecoveryRequestView[] = [];
  let myRequestsError = false;
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
    // caller's own requests.
    async listMyRecoveryRequestsForFamily(
      ...args: unknown[]
    ): Promise<
      | { __kind__: "ok"; ok: MyRecoveryRequestView[] }
      | { __kind__: "err"; err: string }
    > {
      calls.listMyRecoveryRequestsForFamily.push(args);
      if (myRequestsError) {
        return { __kind__: "err", err: "NotAuthorized" };
      }
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
      myRequestsError = false;
      calls.listMyRecoveryRequestsForFamily.length = 0;
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    setMyRequests: (r: MyRecoveryRequestView[]) => {
      myRequests = r;
    },
    setMyRequestsError: (v: boolean) => {
      myRequestsError = v;
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

function myRequest(
  overrides: Partial<MyRecoveryRequestView> = {},
): MyRecoveryRequestView {
  return {
    targetName: "Lula Mae Norwood",
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
// A. The existing plain-language status and review-stage line still render.
// ---------------------------------------------------------------------------

describe("candidate status plain-language rendering (Phase 4C-H1 baseline)", () => {
  it("renders the existing plain-language status and stage line for a Pending request", async () => {
    setAuthenticated(true);
    setMyRequests([myRequest({ status: RecoveryStatus.Pending })]);

    renderStatusPage();

    const item = await screen.findByTestId("recovery_status.item.0");
    expect(
      await within(item).findByText("Lula Mae Norwood"),
    ).toBeInTheDocument();
    expect(
      within(item).getByText("Waiting for family review"),
    ).toBeInTheDocument();
    // The page-local review-stage line is the existing plain-language progress
    // copy the new quorum line is added alongside.
    expect(
      within(item).getByTestId("recovery_status.stage.0"),
    ).toHaveTextContent("Your request has been sent to your family.");
  });

  it("renders the existing stage line for an AwaitingVerification request", async () => {
    setAuthenticated(true);
    setMyRequests([myRequest({ status: RecoveryStatus.AwaitingVerification })]);

    renderStatusPage();

    const item = await screen.findByTestId("recovery_status.item.0");
    expect(
      within(item).getByText("Waiting for family review"),
    ).toBeInTheDocument();
    expect(
      within(item).getByTestId("recovery_status.stage.0"),
    ).toHaveTextContent("Family members are confirming your request.");
  });

  it("renders the existing stage line for a ReadyForApproval request", async () => {
    setAuthenticated(true);
    setMyRequests([myRequest({ status: RecoveryStatus.ReadyForApproval })]);

    renderStatusPage();

    const item = await screen.findByTestId("recovery_status.item.0");
    expect(
      within(item).getByText("Waiting for family review"),
    ).toBeInTheDocument();
    expect(
      within(item).getByTestId("recovery_status.stage.0"),
    ).toHaveTextContent(
      "Enough family members have confirmed. A Steward will make the final decision.",
    );
  });

  it("keeps the closed read-only note for a resolved request", async () => {
    setAuthenticated(true);
    setMyRequests([myRequest({ status: RecoveryStatus.Approved })]);

    renderStatusPage();

    const item = await screen.findByTestId("recovery_status.item.0");
    expect(within(item).getByText("Access restored")).toBeInTheDocument();
    expect(
      within(item).getByTestId("recovery_status.resolved_note.0"),
    ).toBeInTheDocument();
    // A resolved request has no open-stage line.
    expect(
      within(item).queryByTestId("recovery_status.stage.0"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// B. An ordinary Account Recovery request shows no quorum progress line.
// ---------------------------------------------------------------------------

describe("ordinary Account Recovery has no quorum line (Phase 4C-H1 baseline)", () => {
  it("does not render a quorum progress line for an ordinary open request", async () => {
    setAuthenticated(true);
    // An ordinary Account Recovery request is tracked through the same
    // caller-scoped view. The 2-member quorum line is specific to the Steward
    // Recovery path, so an ordinary request must never show a fabricated count.
    setMyRequests([myRequest({ status: RecoveryStatus.Pending })]);

    renderStatusPage();

    const item = await screen.findByTestId("recovery_status.item.0");
    expect(
      within(item).queryByTestId("recovery_status.quorum.0"),
    ).not.toBeInTheDocument();
    // No "N of M family confirmations received" text appears anywhere.
    expect(item.textContent ?? "").not.toMatch(
      /\d+\s+of\s+\d+\s+family\s+confirmations?\s+received/i,
    );
  });
});

// ---------------------------------------------------------------------------
// C. The candidate surface is read-only and private.
// ---------------------------------------------------------------------------

describe("candidate surface read-only and privacy (Phase 4C-H1 baseline)", () => {
  it("renders no verifier controls for the candidate", async () => {
    setAuthenticated(true);
    setMyRequests([myRequest({ status: RecoveryStatus.AwaitingVerification })]);

    renderStatusPage();

    await screen.findByTestId("recovery_status.item.0");
    // The candidate tracks their own request; they never verify it.
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
    setMyRequests([
      myRequest({
        targetName: "Lula Mae Norwood",
        status: RecoveryStatus.AwaitingVerification,
      }),
    ]);

    renderStatusPage();

    await screen.findByTestId("recovery_status.item.0");
    const body = document.body.textContent ?? "";
    // No account principals (the caller's own or another account's).
    expect(body).not.toContain(ACCOUNT);
    expect(body).not.toContain(OTHER_ACCOUNT);
    expect(body).not.toContain(STEWARD_ACCOUNT);
    // No internal identifiers or audit vocabulary.
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

// ---------------------------------------------------------------------------
// D. The non-list states still render.
// ---------------------------------------------------------------------------

describe("candidate status non-list states (Phase 4C-H1 baseline)", () => {
  it("keeps the neutral empty state with a start action", async () => {
    setAuthenticated(true);
    setMyRequests([]);

    renderStatusPage();

    expect(
      await screen.findByText("No recovery requests yet"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("recovery_status.start_request_button"),
    ).toBeInTheDocument();
  });

  it("keeps the neutral error state with a Retry action and no technical tag", async () => {
    setAuthenticated(true);
    setMyRequestsError(true);

    renderStatusPage();

    expect(
      await screen.findByTestId("recovery_status.error_state"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("recovery_status.retry_button"),
    ).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toContain("NotAuthorized");
  });
});
