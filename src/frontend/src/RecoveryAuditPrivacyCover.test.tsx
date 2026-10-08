import "@testing-library/jest-dom/vitest";
import {
  type RecoveryAuditView,
  type RecoveryRequest,
  RecoveryStatus,
  RecoveryType,
} from "@/backend";
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
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecoveryHistorySection } from "./components/RecoveryHistorySection";
import { toRecoveryAuditEntryView } from "./hooks/useRecoveryStatus";
import { FamilyStewardRecoveryReviewsPage } from "./pages/FamilyStewardRecoveryReviewsPage";

// ---------------------------------------------------------------------------
// Phase 4D-H1 — public recovery-audit read privacy (frontend cover).
//
// The accepted behavior this file asserts, through the real React components
// with a typed local actor mock:
//
//   1. The Recovery History section renders ONLY the safe backend projection
//      (`actionLabel`, `actorDisplayLabel`, `affectedDisplayNames`,
//      `timestamp`) — the plain-language action, the actor label, the affected
//      display names, and the timestamp.
//   2. No raw account principal, raw person id, recovery request id, internal
//      audit id, family id, membership id, Steward id, or free-text summary is
//      rendered.
//   3. The section no longer performs profile lookups to translate audit ids:
//      the backend resolves the display labels, so the component renders the
//      projection directly.
//   4. An unauthorized caller receives no audit history (the backend read
//      rejects; the section renders a neutral error state with Retry).
//   5. The requester sees their own safe audit history.
//   6. An authorized Steward sees safe family audit history.
//   7. `toRecoveryAuditEntryView` is a pure field mapping that drops every raw
//      identifier.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract; the real canister behavior is
// covered by the PocketIC lane (recovery-audit-privacy.cover.test.ts). See
// coverageLimits.
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";
const STEWARD_ACCOUNT = "ryjl3-tyaaa-aaaaa-aaaba-cai";
const OTHER_ACCOUNT = "rrkah-fqaaa-aaaaa-aaaaq-cai";
const FAMILY_A = "test-family-a";

const {
  mockActor,
  calls,
  resetState,
  setAuthenticated,
  setSteward,
  setAudit,
  setAuditOutcome,
  setRecoveryRequests,
  getAuthenticated,
  getSteward,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isSteward = false;
  let audit: RecoveryAuditView[] = [];
  // The outcome the backend returns for the authorized audit read. The mock
  // models the backend's authorization gate: an unauthorized caller gets an
  // `#err` (the hook rejects), never another party's history.
  let auditOutcome: "ok" | "unauthorized" | "notFound" = "ok";
  let recoveryRequests: RecoveryRequest[] = [];
  const calls = {
    listAuthorizedRecoveryAuditForFamily: [] as unknown[][],
    listRecoveryRequestsForFamily: [] as unknown[][],
  };

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
    // The authorized audit read. The mock models the backend's authorization
    // gate: only a permitted caller receives the safe projection.
    async listAuthorizedRecoveryAuditForFamily(
      ...args: unknown[]
    ): Promise<
      | { __kind__: "ok"; ok: RecoveryAuditView[] }
      | { __kind__: "err"; err: string }
    > {
      calls.listAuthorizedRecoveryAuditForFamily.push(args);
      if (auditOutcome === "unauthorized") {
        return { __kind__: "err", err: "NotAuthorized" };
      }
      if (auditOutcome === "notFound") {
        return { __kind__: "err", err: "RequestNotFound" };
      }
      return { __kind__: "ok", ok: audit };
    },
    async listRecoveryRequestsForFamily(
      ...args: unknown[]
    ): Promise<{ __kind__: "ok"; ok: RecoveryRequest[] }> {
      calls.listRecoveryRequestsForFamily.push(args);
      return { __kind__: "ok", ok: recoveryRequests };
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
      isSteward = false;
      audit = [];
      auditOutcome = "ok";
      recoveryRequests = [];
      for (const key of Object.keys(calls) as Array<keyof typeof calls>) {
        calls[key].length = 0;
      }
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    setSteward: (v: boolean) => {
      isSteward = v;
    },
    setAudit: (a: RecoveryAuditView[]) => {
      audit = a;
    },
    setAuditOutcome: (o: "ok" | "unauthorized" | "notFound") => {
      auditOutcome = o;
    },
    setRecoveryRequests: (r: RecoveryRequest[]) => {
      recoveryRequests = r;
    },
    getAuthenticated: () => isAuthenticated,
    getSteward: () => isSteward,
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: getAuthenticated(),
    login: () => {},
    clear: () => {},
    identity: getAuthenticated()
      ? {
          getPrincipal: () =>
            Principal.fromText(getSteward() ? STEWARD_ACCOUNT : ACCOUNT),
        }
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
    accountId: getAuthenticated()
      ? getSteward()
        ? STEWARD_ACCOUNT
        : ACCOUNT
      : undefined,
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

function auditView(
  overrides: Partial<RecoveryAuditView> = {},
): RecoveryAuditView {
  return {
    actionLabel: "Recovery requested",
    actorDisplayLabel: "You",
    affectedDisplayNames: ["Clayton Norwood"],
    timestamp: 1_700_000_000_000_000_000n,
    ...overrides,
  };
}

function recoveryRequest(
  overrides: Partial<RecoveryRequest> = {},
): RecoveryRequest {
  return {
    familyId: "norwood",
    id: 7n,
    recoveryType: RecoveryType.AccountRecovery,
    personId: "clayton",
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

function renderWithFamily(node: ReactNode, familyId = FAMILY_A) {
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
// 1-3. The section renders only the safe projection.
// ---------------------------------------------------------------------------

describe("recovery history renders only the safe projection (cover)", () => {
  it("renders the action label, actor label, affected names, and timestamp", async () => {
    setAuthenticated(true);
    setAudit([
      auditView({
        actionLabel: "Profile ownership transferred",
        actorDisplayLabel: "Family Steward",
        affectedDisplayNames: ["Clayton Norwood", "Lula Mae Norwood"],
      }),
    ]);

    renderWithFamily(<RecoveryHistorySection recoveryId={7n} />);

    const item = await screen.findByTestId("recovery_history.item.0");
    expect(
      within(item).getByText("Profile ownership transferred"),
    ).toBeInTheDocument();
    expect(
      within(item).getByText(
        /By Family Steward · Affecting Clayton Norwood, Lula Mae Norwood/,
      ),
    ).toBeInTheDocument();
    // The timestamp is rendered as a human date, not the raw nanosecond value.
    expect(item.textContent).not.toContain("1700000000000000000");
  });

  it("renders a neutral actor label and affected fallback without raw ids", async () => {
    setAuthenticated(true);
    setAudit([
      auditView({
        actionLabel: "Verification recorded",
        actorDisplayLabel: "Family member",
        affectedDisplayNames: [],
      }),
    ]);

    renderWithFamily(<RecoveryHistorySection recoveryId={7n} />);

    const item = await screen.findByTestId("recovery_history.item.0");
    expect(within(item).getByText(/By Family member/)).toBeInTheDocument();
    expect(
      within(item).getByText(/Affecting A family member/),
    ).toBeInTheDocument();
  });

  it("never renders a principal, raw person id, recovery id, audit id, family id, or summary", async () => {
    setAuthenticated(true);
    setAudit([
      auditView({
        actionLabel: "Recovery resolved",
        actorDisplayLabel: "You",
        affectedDisplayNames: ["Clayton Norwood"],
      }),
    ]);

    renderWithFamily(<RecoveryHistorySection recoveryId={987654321n} />);

    await screen.findByTestId("recovery_history.item.0");
    const body = document.body.textContent ?? "";
    expect(body).not.toContain(ACCOUNT);
    expect(body).not.toContain(OTHER_ACCOUNT);
    expect(body).not.toContain(STEWARD_ACCOUNT);
    expect(body).not.toContain("987654321");
    expect(body).not.toContain("norwood");
    expect(body).not.toContain("clayton");
    expect(body).not.toContain("RequestCreated");
    expect(body).not.toContain("Recovery request created");
  });

  it("shows a neutral empty state when there is no history", async () => {
    setAuthenticated(true);
    setAudit([]);

    renderWithFamily(<RecoveryHistorySection recoveryId={7n} />);

    expect(
      await screen.findByTestId("recovery_history.empty_state"),
    ).toHaveTextContent("No recovery activity has been recorded yet.");
  });
});

// ---------------------------------------------------------------------------
// 4. An unauthorized caller receives no audit history.
// ---------------------------------------------------------------------------

describe("unauthorized caller receives no audit history (cover)", () => {
  it("renders a neutral error state with Retry when the read is denied", async () => {
    setAuthenticated(true);
    setAuditOutcome("unauthorized");

    renderWithFamily(<RecoveryHistorySection recoveryId={7n} />);

    const error = await screen.findByTestId("recovery_history.error_state");
    expect(error).toBeInTheDocument();
    expect(
      within(error).getByTestId("recovery_history.retry_button"),
    ).toBeInTheDocument();
    // The error tag itself is never surfaced.
    expect(document.body.textContent).not.toContain("NotAuthorized");
    expect(
      screen.queryByTestId("recovery_history.list"),
    ).not.toBeInTheDocument();
  });

  it("renders the neutral error state when the request is not found", async () => {
    setAuthenticated(true);
    setAuditOutcome("notFound");

    renderWithFamily(<RecoveryHistorySection recoveryId={7n} />);

    expect(
      await screen.findByTestId("recovery_history.error_state"),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("RequestNotFound");
  });
});

// ---------------------------------------------------------------------------
// 5-6. Requester and Steward see safe history through the review page.
// ---------------------------------------------------------------------------

describe("requester and Steward see safe audit history (cover)", () => {
  it("renders the requester's own safe history on the review page", async () => {
    setAuthenticated(true);
    setSteward(true);
    setRecoveryRequests([
      recoveryRequest({
        id: 11n,
        replacementAccountId: Principal.fromText(OTHER_ACCOUNT),
      }),
    ]);
    setAudit([
      auditView({
        actionLabel: "Recovery requested",
        actorDisplayLabel: "You",
        affectedDisplayNames: ["Clayton Norwood"],
      }),
    ]);

    renderWithFamily(<FamilyStewardRecoveryReviewsPage onBack={() => {}} />);

    const item = await screen.findByTestId("recovery_history.item.0");
    expect(within(item).getByText("Recovery requested")).toBeInTheDocument();
    expect(within(item).getByText(/By You/)).toBeInTheDocument();
    // The read is family-scoped with the ACTIVE family id.
    await waitFor(() => {
      expect(calls.listAuthorizedRecoveryAuditForFamily).toEqual([
        [FAMILY_A, 11n],
      ]);
    });
  });

  it("renders safe family history for an authorized Steward", async () => {
    setAuthenticated(true);
    setSteward(true);
    setRecoveryRequests([
      recoveryRequest({
        id: 12n,
        replacementAccountId: Principal.fromText(OTHER_ACCOUNT),
      }),
    ]);
    setAudit([
      auditView({
        actionLabel: "Steward decision recorded",
        actorDisplayLabel: "Family Steward",
        affectedDisplayNames: ["Clayton Norwood"],
      }),
    ]);

    renderWithFamily(<FamilyStewardRecoveryReviewsPage onBack={() => {}} />);

    const item = await screen.findByTestId("recovery_history.item.0");
    expect(
      within(item).getByText("Steward decision recorded"),
    ).toBeInTheDocument();
    expect(within(item).getByText(/By Family Steward/)).toBeInTheDocument();
    const body = document.body.textContent ?? "";
    expect(body).not.toContain(OTHER_ACCOUNT);
    expect(body).not.toContain("12");
  });
});

// ---------------------------------------------------------------------------
// 7. The projection is a pure field mapping that drops raw identifiers.
// ---------------------------------------------------------------------------

describe("toRecoveryAuditEntryView drops raw identifiers (cover)", () => {
  it("maps only the four safe fields", () => {
    const view = auditView({
      actionLabel: "Recovery resolved",
      actorDisplayLabel: "Family member",
      affectedDisplayNames: ["Clayton Norwood"],
      timestamp: 42n,
    });

    const entry = toRecoveryAuditEntryView(view);

    expect(entry).toEqual({
      actionLabel: "Recovery resolved",
      actorName: "Family member",
      affectedNames: ["Clayton Norwood"],
      timestamp: 42n,
    });
    expect(Object.keys(entry).sort()).toEqual([
      "actionLabel",
      "actorName",
      "affectedNames",
      "timestamp",
    ]);
  });
});
