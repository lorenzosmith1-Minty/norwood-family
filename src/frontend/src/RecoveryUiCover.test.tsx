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
import { FamilyStewardRecoveryReviewsPage } from "./pages/FamilyStewardRecoveryReviewsPage";
import { RecoveryRequestPage } from "./pages/RecoveryRequestPage";
import { RecoveryStatusPage } from "./pages/RecoveryStatusPage";

// ---------------------------------------------------------------------------
// Phase 4B — "Recover my Norwood profile" UI cover.
//
// The accepted behavior this file asserts, through the real React components
// with a typed local actor mock:
//
//   1. The app shell offers the recovery entry point to a signed-in caller and
//      routes it to the recovery request page; a signed-out visitor is not
//      offered it.
//   2. The recovery request page identifies the target Person/Profile BY NAME
//      ONLY — there is no field to nominate an arbitrary third-party account.
//   3. Submitting a request calls the backend with the signed-in caller as the
//      replacement account.
//   4. After submission the replacement account sees a Pending state that
//      explains family/Steward approval is required and grants no access.
//   5. A second request while one is open is prevented and the existing open
//      request is shown instead of a new form.
//   6. The replacement account can track its own request status in plain
//      language across Pending, Awaiting family/Steward review, Approved,
//      Rejected, Cancelled, and Expired.
//   7. An active Family Steward sees ordinary Account Recovery requests in the
//      recovery-review surface; a non-Steward sees the unauthorized state.
//   8. A Steward viewing their own request does not see Approve/Reject.
//   9. Approving resolves the request to a read-only approved state with the
//      controls removed; rejecting resolves it to a read-only rejected state
//      with no family access implied.
//  10. A Steward with no actionable requests sees a neutral empty state.
//  11. No account principals, internal membership ids, recovery ids, or private
//      family data are rendered.
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
  setMyRequests,
  setSearchMatches,
  getAuthenticated,
  getSteward,
  getCurrentPrincipal,
  getRequestCalls,
  getApproveCalls,
  getRejectCalls,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isSteward = false;
  let myProfile: PersonProfile | null = null;
  let recoveryRequests: RecoveryRequest[] = [];
  // The caller-scoped view the backend returns for the signed-in caller.
  let myRequests: MyRecoveryRequestView[] = [];
  // The dedicated recovery discovery results for the active family.
  let searchMatches: Array<{ personId: string; name: string }> = [];
  let requestOutcome: "created" | "alreadyPending" | "error" = "created";
  let approveOutcome: "approved" | "alreadySettled" | "error" = "approved";
  let rejectOutcome: "rejected" | "alreadySettled" | "error" = "rejected";
  const requestCalls: Array<{
    familyId: string;
    personId: string;
    replacement: string;
  }> = [];
  const approveCalls: Array<{ familyId: string; recoveryId: bigint }> = [];
  const rejectCalls: Array<{ familyId: string; recoveryId: bigint }> = [];

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
    async listRecoveryRequestsForFamily(): Promise<{
      __kind__: "ok";
      ok: RecoveryRequest[];
    }> {
      return { __kind__: "ok", ok: recoveryRequests };
    },
    // The caller-scoped read: the backend returns only the signed-in caller's
    // own requests, projected to the family-safe view.
    async listMyRecoveryRequestsForFamily(): Promise<{
      __kind__: "ok";
      ok: MyRecoveryRequestView[];
    }> {
      return { __kind__: "ok", ok: myRequests };
    },
    // The dedicated recovery discovery read: only an opaque person id and a
    // display name, never parents or relationships.
    async searchRecoveryTargetsForFamily(): Promise<{
      __kind__: "ok";
      ok: Array<{ personId: string; name: string }>;
    }> {
      return { __kind__: "ok", ok: searchMatches };
    },
    async requestRecoveryForFamily(
      familyId: string,
      personId: string,
      replacement: Principal,
    ): Promise<
      { __kind__: "ok"; ok: RecoveryRequest } | { __kind__: "err"; err: string }
    > {
      requestCalls.push({
        familyId,
        personId,
        replacement: replacement.toString(),
      });
      if (requestOutcome === "error") {
        return { __kind__: "err", err: "NotAuthorized" };
      }
      if (requestOutcome === "alreadyPending") {
        return { __kind__: "err", err: "AlreadyPending" };
      }
      const created = recoveryRequest({ personId });
      // Persist the created request so the invalidated list read returns it,
      // exactly as the real backend would.
      recoveryRequests = [...recoveryRequests, created];
      return { __kind__: "ok", ok: created };
    },
    async approveAccountRecoveryForFamily(
      familyId: string,
      recoveryId: bigint,
    ): Promise<
      { __kind__: "ok"; ok: RecoveryRequest } | { __kind__: "err"; err: string }
    > {
      approveCalls.push({ familyId, recoveryId });
      if (approveOutcome === "error") {
        return { __kind__: "err", err: "NotSteward" };
      }
      if (approveOutcome === "alreadySettled") {
        return { __kind__: "err", err: "AlreadyResolved" };
      }
      return {
        __kind__: "ok",
        ok: recoveryRequest({ status: RecoveryStatus.Approved }),
      };
    },
    async rejectRecoveryForFamily(
      familyId: string,
      recoveryId: bigint,
    ): Promise<
      { __kind__: "ok"; ok: RecoveryRequest } | { __kind__: "err"; err: string }
    > {
      rejectCalls.push({ familyId, recoveryId });
      if (rejectOutcome === "error") {
        return { __kind__: "err", err: "NotSteward" };
      }
      if (rejectOutcome === "alreadySettled") {
        return { __kind__: "err", err: "AlreadyResolved" };
      }
      return {
        __kind__: "ok",
        ok: recoveryRequest({ status: RecoveryStatus.Rejected }),
      };
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
      myRequests = [];
      searchMatches = [];
      requestOutcome = "created";
      approveOutcome = "approved";
      rejectOutcome = "rejected";
      requestCalls.length = 0;
      approveCalls.length = 0;
      rejectCalls.length = 0;
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
    setMyRequests: (r: MyRecoveryRequestView[]) => {
      myRequests = r;
    },
    setSearchMatches: (m: Array<{ personId: string; name: string }>) => {
      searchMatches = m;
    },
    setRequestOutcome: (o: "created" | "alreadyPending" | "error") => {
      requestOutcome = o;
    },
    setApproveOutcome: (o: "approved" | "alreadySettled" | "error") => {
      approveOutcome = o;
    },
    setRejectOutcome: (o: "rejected" | "alreadySettled" | "error") => {
      rejectOutcome = o;
    },
    getAuthenticated: () => isAuthenticated,
    getSteward: () => isSteward,
    getCurrentPrincipal: () => (isSteward ? STEWARD_ACCOUNT : ACCOUNT),
    getRequestCalls: () => requestCalls,
    getApproveCalls: () => approveCalls,
    getRejectCalls: () => rejectCalls,
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

// ---------------------------------------------------------------------------
// 1. App shell entry point.
// ---------------------------------------------------------------------------

describe("app shell recovery entry point (cover)", () => {
  it("offers the recovery entry point to a signed-in caller and routes to the request page", async () => {
    const user = userEvent.setup();
    setAuthenticated(true);
    setSteward(false);
    setMyProfile(claimedProfile());
    renderWithClient(<App />);

    const entry = await screen.findByRole("button", {
      name: "Recover my profile",
    });
    await user.click(entry);

    expect(
      await screen.findByRole("heading", {
        name: "Recover my Norwood profile",
      }),
    ).toBeInTheDocument();
  });

  it("does not offer the recovery entry point to a signed-out visitor", () => {
    setAuthenticated(false);
    renderWithClient(<App />);

    expect(
      screen.queryByRole("button", { name: "Recover my profile" }),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2-5. Recovery request page: name-only, self-service, Pending, duplicate.
// ---------------------------------------------------------------------------

describe("recovery request page (cover)", () => {
  it("identifies the profile by name only and offers no third-party account field", async () => {
    const user = userEvent.setup();
    setAuthenticated(true);
    // The dedicated recovery discovery read returns only an opaque person id
    // and a display name.
    setSearchMatches([{ personId: "lula-mae", name: "Lula Mae Norwood" }]);
    renderWithClient(
      <RecoveryRequestPage onBack={() => {}} onViewStatus={() => {}} />,
    );

    const nameInput = await screen.findByTestId("recovery_request.name_input");
    expect(nameInput).toBeInTheDocument();
    // The only input on the identify step is the person's name. There is no
    // field to nominate an arbitrary replacement account.
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(
      screen.queryByLabelText(/account|principal|replacement/i),
    ).not.toBeInTheDocument();

    await user.type(nameInput, "Lula Mae");
    await user.click(screen.getByTestId("recovery_request.search_button"));

    // The dedicated recovery discovery read resolves the name to a match card
    // that shows only the display name and a "This is my profile" action.
    expect(
      await screen.findByTestId("recovery_request.match_list"),
    ).toBeInTheDocument();
    expect(screen.getByText("Lula Mae Norwood")).toBeInTheDocument();
    expect(screen.getByTestId("recovery_request.choose.0")).toHaveTextContent(
      "This is my profile",
    );
  });

  it("submits with the signed-in caller as the replacement account and shows a Pending state", async () => {
    const user = userEvent.setup();
    setAuthenticated(true);
    setSearchMatches([{ personId: "lula-mae", name: "Lula Mae Norwood" }]);
    renderWithClient(
      <RecoveryRequestPage onBack={() => {}} onViewStatus={() => {}} />,
    );

    await user.type(
      await screen.findByTestId("recovery_request.name_input"),
      "Lula Mae",
    );
    await user.click(screen.getByTestId("recovery_request.search_button"));
    await user.click(await screen.findByTestId("recovery_request.choose.0"));
    await user.click(screen.getByTestId("recovery_request.submit_button"));

    const pending = await screen.findByTestId("recovery_request.pending_state");
    expect(pending).toBeInTheDocument();
    expect(within(pending).getByText(/in progress/i)).toBeInTheDocument();
    expect(within(pending).getByText(/family Steward/i)).toBeInTheDocument();
    // No access is granted while pending.
    expect(
      within(pending).getByText(/doesn.t give you family membership/i),
    ).toBeInTheDocument();

    // The backend was called with the signed-in caller as the replacement.
    const calls = getRequestCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].replacement).toBe(ACCOUNT);
    expect(calls[0].personId).toBe("lula-mae");
  });

  it("prevents a duplicate submission and shows the existing open request", async () => {
    const user = userEvent.setup();
    setAuthenticated(true);
    // The caller-scoped backend read already returns an open request for the
    // target person.
    setMyRequests([
      {
        targetName: "Lula Mae Norwood",
        status: RecoveryStatus.Pending,
        createdAt: 1_700_000_000_000_000_000n,
        updatedAt: 1_700_000_000_000_000_000n,
      },
    ]);
    setSearchMatches([{ personId: "lula-mae", name: "Lula Mae Norwood" }]);
    renderWithClient(
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

    // The existing open request is shown to the caller in plain language, so
    // they can see it is already in progress rather than starting a new one.
    const existing = await screen.findByTestId(
      "recovery_request.my_requests.item.0",
    );
    expect(
      within(existing).getByText("Waiting for family review"),
    ).toBeInTheDocument();

    // No second request was submitted to the backend.
    expect(getRequestCalls()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Replacement-account status tracking in plain language.
// ---------------------------------------------------------------------------

describe("recovery status page (cover)", () => {
  const cases: Array<[RecoveryStatus, string]> = [
    [RecoveryStatus.Pending, "Waiting for family review"],
    [RecoveryStatus.AwaitingVerification, "Waiting for family review"],
    [RecoveryStatus.ReadyForApproval, "Waiting for family review"],
    [RecoveryStatus.Approved, "Access restored"],
    [RecoveryStatus.Rejected, "Not approved"],
    [RecoveryStatus.Cancelled, "Withdrawn"],
    [RecoveryStatus.Expired, "Expired"],
  ];

  it.each(cases)(
    "renders %s in plain language as %s",
    async (status, label) => {
      setAuthenticated(true);
      setMyRequests([
        {
          targetName: "Lula Mae Norwood",
          status,
          createdAt: 1_700_000_000_000_000_000n,
          updatedAt: 1_700_000_000_000_000_000n,
        },
      ]);
      renderWithClient(
        <RecoveryStatusPage onBack={() => {}} onStartRequest={() => {}} />,
      );

      const item = await screen.findByTestId("recovery_status.item.0");
      expect(within(item).getByText(label)).toBeInTheDocument();
      // The raw enum name is never rendered. (For Expired the plain-language
      // label happens to equal the enum name, so only the differing cases are
      // asserted here.)
      if (label !== status) {
        expect(within(item).queryByText(status)).not.toBeInTheDocument();
      }
    },
  );

  it("shows a neutral empty state with a start action when there are no requests", async () => {
    setAuthenticated(true);
    setMyRequests([]);
    renderWithClient(
      <RecoveryStatusPage onBack={() => {}} onStartRequest={() => {}} />,
    );

    expect(
      await screen.findByText("No recovery requests yet"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("recovery_status.start_request_button"),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 7-10. Steward recovery-review surface.
// ---------------------------------------------------------------------------

describe("steward recovery reviews page (cover)", () => {
  it("shows the unauthorized state to a non-Steward", async () => {
    setAuthenticated(true);
    setSteward(false);
    renderWithClient(<FamilyStewardRecoveryReviewsPage onBack={() => {}} />);

    expect(
      await screen.findByTestId("recovery_reviews.unauthorized_state"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("recovery_reviews.panel"),
    ).not.toBeInTheDocument();
  });

  it("lists ordinary Account Recovery requests awaiting decision for a Steward", async () => {
    setAuthenticated(true);
    setSteward(true);
    setRecoveryRequests([
      recoveryRequest({
        id: 11n,
        personId: "lula-mae",
        replacementAccountId: Principal.fromText(OTHER_ACCOUNT),
      }),
    ]);
    renderWithClient(<FamilyStewardRecoveryReviewsPage onBack={() => {}} />);

    const item = await screen.findByTestId("recovery_reviews.request_item.1");
    expect(
      await within(item).findByText("Lula Mae Norwood"),
    ).toBeInTheDocument();
    expect(
      within(item).getByTestId("recovery_reviews.approve_button.1"),
    ).toBeInTheDocument();
    expect(
      within(item).getByTestId("recovery_reviews.reject_button.1"),
    ).toBeInTheDocument();
  });

  it("hides Approve/Reject for the Steward's own request", async () => {
    setAuthenticated(true);
    setSteward(true);
    // The replacement account is the signed-in Steward.
    setRecoveryRequests([
      recoveryRequest({
        id: 12n,
        replacementAccountId: Principal.fromText(STEWARD_ACCOUNT),
      }),
    ]);
    renderWithClient(<FamilyStewardRecoveryReviewsPage onBack={() => {}} />);

    const item = await screen.findByTestId("recovery_reviews.request_item.1");
    expect(
      within(item).getByTestId("recovery_reviews.own_request_note.1"),
    ).toBeInTheDocument();
    expect(
      within(item).queryByTestId("recovery_reviews.approve_button.1"),
    ).not.toBeInTheDocument();
    expect(
      within(item).queryByTestId("recovery_reviews.reject_button.1"),
    ).not.toBeInTheDocument();
  });

  it("resolves to a read-only approved state with the controls removed", async () => {
    const user = userEvent.setup();
    setAuthenticated(true);
    setSteward(true);
    setRecoveryRequests([
      recoveryRequest({
        id: 13n,
        replacementAccountId: Principal.fromText(OTHER_ACCOUNT),
      }),
    ]);
    renderWithClient(<FamilyStewardRecoveryReviewsPage onBack={() => {}} />);

    await user.click(
      await screen.findByTestId("recovery_reviews.approve_button.1"),
    );
    await user.click(
      await screen.findByTestId("recovery_reviews.confirm_submit_button.1"),
    );

    const result = await screen.findByTestId(
      "recovery_reviews.request_result.1",
    );
    expect(within(result).getByText("Access restored")).toBeInTheDocument();
    expect(
      screen.queryByTestId("recovery_reviews.approve_button.1"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("recovery_reviews.reject_button.1"),
    ).not.toBeInTheDocument();
    expect(getApproveCalls()).toEqual([
      { familyId: "norwood", recoveryId: 13n },
    ]);
  });

  it("resolves to a read-only rejected state with no family access implied", async () => {
    const user = userEvent.setup();
    setAuthenticated(true);
    setSteward(true);
    setRecoveryRequests([
      recoveryRequest({
        id: 14n,
        replacementAccountId: Principal.fromText(OTHER_ACCOUNT),
      }),
    ]);
    renderWithClient(<FamilyStewardRecoveryReviewsPage onBack={() => {}} />);

    await user.click(
      await screen.findByTestId("recovery_reviews.reject_button.1"),
    );
    await user.click(
      await screen.findByTestId("recovery_reviews.confirm_submit_button.1"),
    );

    const result = await screen.findByTestId(
      "recovery_reviews.request_result.1",
    );
    expect(
      within(result).getByText("Request not approved"),
    ).toBeInTheDocument();
    expect(
      within(result).getByText(/No family access was granted/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("recovery_reviews.approve_button.1"),
    ).not.toBeInTheDocument();
    expect(getRejectCalls()).toEqual([
      { familyId: "norwood", recoveryId: 14n },
    ]);
  });

  it("shows a neutral empty state when no requests await a decision", async () => {
    setAuthenticated(true);
    setSteward(true);
    setRecoveryRequests([]);
    renderWithClient(<FamilyStewardRecoveryReviewsPage onBack={() => {}} />);

    expect(
      await screen.findByText("Nothing needs a decision"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("recovery_reviews.list"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 11. Privacy: no principals, internal ids, or recovery ids are rendered.
// ---------------------------------------------------------------------------

describe("recovery UI privacy (cover)", () => {
  it("never renders an account principal or internal recovery id", async () => {
    setAuthenticated(true);
    setSteward(true);
    setRecoveryRequests([
      recoveryRequest({
        id: 987654321n,
        replacementAccountId: Principal.fromText(OTHER_ACCOUNT),
      }),
    ]);
    renderWithClient(<FamilyStewardRecoveryReviewsPage onBack={() => {}} />);

    await screen.findByTestId("recovery_reviews.request_item.1");
    const body = document.body.textContent ?? "";
    expect(body).not.toContain(OTHER_ACCOUNT);
    expect(body).not.toContain(ACCOUNT);
    expect(body).not.toContain("987654321");
    expect(body).not.toContain("AccountRecovery");
    expect(body).not.toContain("Pending");
  });

  it("never renders a principal or recovery id on the replacement status page", async () => {
    setAuthenticated(true);
    setMyRequests([
      {
        targetName: "Lula Mae Norwood",
        status: RecoveryStatus.Pending,
        createdAt: 1_700_000_000_000_000_000n,
        updatedAt: 1_700_000_000_000_000_000n,
      },
    ]);
    renderWithClient(
      <RecoveryStatusPage onBack={() => {}} onStartRequest={() => {}} />,
    );

    await screen.findByTestId("recovery_status.item.0");
    const body = document.body.textContent ?? "";
    expect(body).not.toContain(OTHER_ACCOUNT);
    expect(body).not.toContain(ACCOUNT);
    expect(body).not.toContain("Pending");
  });
});
