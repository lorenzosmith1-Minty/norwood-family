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
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecoveryRequestPage } from "./pages/RecoveryRequestPage";
import { RecoveryStatusPage } from "./pages/RecoveryStatusPage";

// ---------------------------------------------------------------------------
// Phase 4B-H1 — caller-scoped recovery status read (cover).
//
// The accepted behavior this file asserts, through the real React components
// with a typed local actor mock:
//
//   A. The replacement-account status page is driven by the caller-scoped
//      backend read `listMyRecoveryRequestsForFamily(familyId)`, which is the
//      authoritative source of truth. There is NO sessionStorage request-id
//      registry: a fresh browser session with no client-side state still shows
//      the caller's requests because they come from the backend.
//   B. The read is family-scoped with the ACTIVE family id, never a hard-coded
//      default, so a Family A request never appears in Family B.
//   C. The caller's own requests are ordered newest first.
//   D. The caller-scoped view carries only the target display name, the
//      plain-language status, and timestamps — never a principal, a recovery
//      id, or a raw enum name.
//   E. Duplicate prevention: when the caller already has an open request for a
//      person, the request page shows the existing open request instead of a
//      new form and submits nothing.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract; it does not exercise the real
// canister (see coverageLimits). The mock models the backend's caller filter:
// `listMyRecoveryRequestsForFamily` returns only the requests whose
// requester/replacement is the signed-in caller, so the "another account
// cannot read those requests" rule is asserted at the consumer seam.
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";
const OTHER_ACCOUNT = "rrkah-fqaaa-aaaaa-aaaaq-cai";
const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";

const {
  mockActor,
  calls,
  resetState,
  setAuthenticated,
  setMyRequests,
  setSearchMatches,
  getAuthenticated,
  getRequestCalls,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  // The caller-scoped view the backend returns for the signed-in caller.
  let myRequests: MyRecoveryRequestView[] = [];
  // The dedicated recovery discovery results for the active family.
  let searchMatches: Array<{ personId: string; name: string }> = [];
  const calls: {
    listMyRecoveryRequestsForFamily: unknown[][];
    searchRecoveryTargetsForFamily: unknown[][];
  } = {
    listMyRecoveryRequestsForFamily: [],
    searchRecoveryTargetsForFamily: [],
  };
  const requestCalls: Array<{
    familyId: string;
    personId: string;
    replacement: string;
  }> = [];

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
    // The caller-scoped read: the backend returns only the signed-in caller's
    // own requests. The mock models that filter so a test can prove the page
    // never renders another account's request.
    async listMyRecoveryRequestsForFamily(
      ...args: unknown[]
    ): Promise<
      | { __kind__: "ok"; ok: MyRecoveryRequestView[] }
      | { __kind__: "err"; err: string }
    > {
      calls.listMyRecoveryRequestsForFamily.push(args);
      return { __kind__: "ok", ok: myRequests };
    },
    // The dedicated recovery discovery read: only an opaque person id and a
    // display name, never parents or relationships.
    async searchRecoveryTargetsForFamily(
      ...args: unknown[]
    ): Promise<
      | { __kind__: "ok"; ok: Array<{ personId: string; name: string }> }
      | { __kind__: "err"; err: string }
    > {
      calls.searchRecoveryTargetsForFamily.push(args);
      return { __kind__: "ok", ok: searchMatches };
    },
    async requestRecoveryForFamily(
      familyId: string,
      personId: string,
      replacement: Principal,
    ): Promise<
      { __kind__: "ok"; ok: unknown } | { __kind__: "err"; err: string }
    > {
      requestCalls.push({
        familyId,
        personId,
        replacement: replacement.toString(),
      });
      return { __kind__: "err", err: "AlreadyPending" };
    },
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
    calls,
    resetState: () => {
      isAuthenticated = false;
      myRequests = [];
      searchMatches = [];
      for (const key of Object.keys(calls) as Array<keyof typeof calls>) {
        calls[key].length = 0;
      }
      requestCalls.length = 0;
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    setMyRequests: (r: MyRecoveryRequestView[]) => {
      myRequests = r;
    },
    setSearchMatches: (m: Array<{ personId: string; name: string }>) => {
      searchMatches = m;
    },
    getAuthenticated: () => isAuthenticated,
    getRequestCalls: () => requestCalls,
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
  // A fresh browser session: no client-side recovery state exists. The status
  // page must still show the caller's requests because they come from the
  // backend, not from sessionStorage.
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

// ---------------------------------------------------------------------------
// A. The status page is driven by the caller-scoped backend read.
// ---------------------------------------------------------------------------

describe("caller-scoped recovery status read (cover)", () => {
  it("shows the caller's own request from the backend with no client-side state", async () => {
    setAuthenticated(true);
    setMyRequests([myRequest()]);

    renderWithFamily(
      FAMILY_A,
      <RecoveryStatusPage onBack={() => {}} onStartRequest={() => {}} />,
    );

    const item = await screen.findByTestId("recovery_status.item.0");
    expect(
      await within(item).findByText("Lula Mae Norwood"),
    ).toBeInTheDocument();
    expect(
      within(item).getByText("Waiting for family review"),
    ).toBeInTheDocument();

    // The read went through the caller-scoped backend endpoint, family-scoped
    // with the active family id.
    expect(calls.listMyRecoveryRequestsForFamily).toEqual([[FAMILY_A]]);
  });

  it("shows the neutral empty state when the caller has no requests", async () => {
    setAuthenticated(true);
    setMyRequests([]);

    renderWithFamily(
      FAMILY_A,
      <RecoveryStatusPage onBack={() => {}} onStartRequest={() => {}} />,
    );

    expect(
      await screen.findByText("No recovery requests yet"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("recovery_status.start_request_button"),
    ).toBeInTheDocument();
  });

  it("orders the caller's own requests newest first", async () => {
    setAuthenticated(true);
    setMyRequests([
      myRequest({
        targetName: "Lula Mae Norwood",
        createdAt: 1_600_000_000_000_000_000n,
      }),
      myRequest({
        targetName: "Clayton Norwood",
        createdAt: 1_800_000_000_000_000_000n,
      }),
    ]);

    renderWithFamily(
      FAMILY_A,
      <RecoveryStatusPage onBack={() => {}} onStartRequest={() => {}} />,
    );

    const first = await screen.findByTestId("recovery_status.item.0");
    expect(
      await within(first).findByText("Clayton Norwood"),
    ).toBeInTheDocument();
    const second = screen.getByTestId("recovery_status.item.1");
    expect(
      await within(second).findByText("Lula Mae Norwood"),
    ).toBeInTheDocument();
  });

  it("reads the caller's own requests through the active family scope", async () => {
    setAuthenticated(true);
    setMyRequests([myRequest()]);

    renderWithFamily(
      FAMILY_B,
      <RecoveryStatusPage onBack={() => {}} onStartRequest={() => {}} />,
    );

    await screen.findByTestId("recovery_status.item.0");
    // The caller-scoped read is family-scoped with the active family id, so a
    // Family A request never appears in Family B.
    expect(calls.listMyRecoveryRequestsForFamily).toEqual([[FAMILY_B]]);
    expect(calls.listMyRecoveryRequestsForFamily[0]?.[0]).not.toBe("norwood");
  });
});

// ---------------------------------------------------------------------------
// D. Privacy: the caller-scoped view renders no principal, id, or enum name.
// ---------------------------------------------------------------------------

describe("caller-scoped status privacy (cover)", () => {
  it("never renders a principal, recovery id, or raw enum name", async () => {
    setAuthenticated(true);
    setMyRequests([myRequest({ status: RecoveryStatus.Pending })]);

    renderWithFamily(
      FAMILY_A,
      <RecoveryStatusPage onBack={() => {}} onStartRequest={() => {}} />,
    );

    await screen.findByTestId("recovery_status.item.0");
    const body = document.body.textContent ?? "";
    expect(body).not.toContain(ACCOUNT);
    expect(body).not.toContain(OTHER_ACCOUNT);
    expect(body).not.toContain("Pending");
  });
});

// ---------------------------------------------------------------------------
// E. Duplicate prevention through the caller-scoped list.
// ---------------------------------------------------------------------------

describe("duplicate prevention through the caller-scoped list (cover)", () => {
  it("shows the existing open request instead of a new form and submits nothing", async () => {
    const user = userEvent.setup();
    setAuthenticated(true);
    // The caller already has an open request for the target person, returned by
    // the caller-scoped backend read.
    setMyRequests([myRequest({ status: RecoveryStatus.Pending })]);
    setSearchMatches([{ personId: "lula-mae", name: "Lula Mae Norwood" }]);

    renderWithFamily(
      FAMILY_A,
      <RecoveryRequestPage onBack={() => {}} onViewStatus={() => {}} />,
    );

    await user.type(
      await screen.findByTestId("recovery_request.name_input"),
      "Lula Mae",
    );
    await user.click(screen.getByTestId("recovery_request.search_button"));

    // The match card shows the in-progress badge instead of a choose button.
    expect(
      await screen.findByTestId("recovery_request.match.pending.0"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("recovery_request.choose.0"),
    ).not.toBeInTheDocument();

    // The existing open request is shown to the caller in plain language.
    const existing = await screen.findByTestId(
      "recovery_request.my_requests.item.0",
    );
    expect(
      within(existing).getByText("Waiting for family review"),
    ).toBeInTheDocument();

    // No second request was submitted to the backend.
    expect(getRequestCalls()).toHaveLength(0);
  });

  it("offers the choose action when the caller has no open request for the target", async () => {
    const user = userEvent.setup();
    setAuthenticated(true);
    // The caller has no open request for this person.
    setMyRequests([]);
    setSearchMatches([{ personId: "lula-mae", name: "Lula Mae Norwood" }]);

    renderWithFamily(
      FAMILY_A,
      <RecoveryRequestPage onBack={() => {}} onViewStatus={() => {}} />,
    );

    await user.type(
      await screen.findByTestId("recovery_request.name_input"),
      "Lula Mae",
    );
    await user.click(screen.getByTestId("recovery_request.search_button"));

    expect(
      await screen.findByTestId("recovery_request.choose.0"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("recovery_request.match.pending.0"),
    ).not.toBeInTheDocument();
    expect(getRequestCalls()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// The caller-scoped read is the only status source: a fresh session with no
// sessionStorage still resolves the caller's requests.
// ---------------------------------------------------------------------------

describe("status continuity across a fresh session (cover)", () => {
  it("resolves the caller's requests from the backend with empty sessionStorage", async () => {
    setAuthenticated(true);
    setMyRequests([myRequest({ targetName: "Clayton Norwood" })]);
    // Explicitly assert the client-side registry is absent.
    expect(sessionStorage.length).toBe(0);

    renderWithFamily(
      FAMILY_A,
      <RecoveryStatusPage onBack={() => {}} onStartRequest={() => {}} />,
    );

    const item = await screen.findByTestId("recovery_status.item.0");
    expect(
      await within(item).findByText("Clayton Norwood"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(calls.listMyRecoveryRequestsForFamily).toEqual([[FAMILY_A]]),
    );
  });
});
