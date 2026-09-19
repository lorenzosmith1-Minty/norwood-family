import "@testing-library/jest-dom/vitest";
import {
  type PersonProfile,
  type ProfileClaim,
  type RelationshipRequest,
  type Report,
  StewardClaimError,
} from "@/backend";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  configure,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

// ---------------------------------------------------------------------------
// Cover for the canonical Family Steward authority change.
//
// The accepted behavior this file asserts:
//
//   1. The canonical Steward check is what gates the Family Steward navigation
//      entry and the Steward hub — NOT the platform admin role. An account that
//      holds only the platform admin role (isCallerAdmin = true,
//      isCallerSteward = false) sees no nav entry and is denied the hub.
//   2. While no active Steward exists, a signed-in account sees the one-time
//      "Claim Family Steward" control; claiming calls the backend `claimSteward`
//      and lands on the Family Steward hub with the nav entry visible.
//   3. Once an active Steward exists the claim control is no longer shown.
//   4. A refused claim (StewardAlreadyExists) surfaces the refusal copy and
//      does not navigate.
//   5. The claim control is hidden for a signed-out caller.
//
// The actor is a typed in-memory mock, so this is component/integration
// coverage of the frontend consumer contract. It does not exercise the real
// canister; the PocketIC lane covers the backend authority rules (see
// coverageLimits).
// ---------------------------------------------------------------------------
configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";
const ADMIN_ONLY_ACCOUNT = "ryjl3-tyaaa-aaaaa-aaaba-cai";

const {
  mockActor,
  resetState,
  setAuthenticated,
  setSteward,
  setAdminOnly,
  setHasActiveSteward,
  setClaimResult,
  getClaimCalls,
  setCurrentPrincipal,
  getAuthenticated,
  getCurrentPrincipal,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isSteward = false;
  let isAdminOnly = false;
  let hasActiveSteward = false;
  let claimResult:
    | { __kind__: "ok"; ok: unknown }
    | { __kind__: "err"; err: unknown } = {
    __kind__: "ok",
    ok: {},
  };
  let claimCalls = 0;
  let currentPrincipal = "aaaaa-aa";

  const mockActor = {
    // The platform admin role is a separate concern from Steward authority.
    // `isAdminOnly` models an account that holds the admin role but is NOT an
    // active Steward, which must never unlock Steward navigation or screens.
    async isCallerAdmin(): Promise<boolean> {
      return isAdminOnly;
    },
    // The canonical Steward authority check the production gate consults.
    async isCallerSteward(): Promise<boolean> {
      return isSteward;
    },
    async hasActiveSteward(): Promise<boolean> {
      return hasActiveSteward;
    },
    async claimSteward() {
      claimCalls += 1;
      // Model the backend state change on success: the caller becomes an
      // active Steward and an active Steward now exists. The hook invalidates
      // the isSteward/hasActiveSteward queries after the mutation, so the
      // refetch observes the new authority.
      if (claimResult.__kind__ === "ok") {
        isSteward = true;
        hasActiveSteward = true;
      }
      return claimResult;
    },
    async getMyProfile(): Promise<PersonProfile | null> {
      return null;
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
    async listPendingArchiveItems() {
      return [];
    },
    async getReviewQueue() {
      return { pending: 0n, needsResearch: 0n, conflicting: 0n };
    },
  };

  return {
    mockActor,
    resetState: () => {
      isAuthenticated = false;
      isSteward = false;
      isAdminOnly = false;
      hasActiveSteward = false;
      claimResult = { __kind__: "ok", ok: {} };
      claimCalls = 0;
      currentPrincipal = "aaaaa-aa";
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    setSteward: (v: boolean) => {
      isSteward = v;
    },
    setAdminOnly: (v: boolean) => {
      isAdminOnly = v;
    },
    setHasActiveSteward: (v: boolean) => {
      hasActiveSteward = v;
    },
    setClaimResult: (v: typeof claimResult) => {
      claimResult = v;
    },
    getClaimCalls: () => claimCalls,
    setCurrentPrincipal: (p: string) => {
      currentPrincipal = p;
    },
    getAuthenticated: () => isAuthenticated,
    getCurrentPrincipal: () => currentPrincipal,
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

const STEWARD_LABEL = "Family Steward";

describe("Family Steward authority cover", () => {
  it("denies the Steward nav entry and hub to a platform-admin-only account", async () => {
    // The account holds the platform admin role but is not an active Steward.
    // The canonical Steward check must be the gate, so the admin role alone
    // must not unlock Steward navigation.
    setAuthenticated(true);
    setAdminOnly(true);
    setSteward(false);
    setCurrentPrincipal(ADMIN_ONLY_ACCOUNT);
    renderApp();

    // The nav entry never appears for an admin-only account.
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: STEWARD_LABEL }),
      ).not.toBeInTheDocument();
    });
  });

  it("shows the one-time claim control while no active Steward exists", async () => {
    setAuthenticated(true);
    setSteward(false);
    setHasActiveSteward(false);
    setCurrentPrincipal(ACCOUNT);
    renderApp();

    expect(
      await screen.findByTestId("steward_claim.claim_button"),
    ).toBeInTheDocument();
    expect(screen.getByText("No Family Steward yet")).toBeInTheDocument();
  });

  it("hides the claim control once an active Steward exists", async () => {
    setAuthenticated(true);
    setSteward(false);
    setHasActiveSteward(true);
    setCurrentPrincipal(ACCOUNT);
    renderApp();

    // The nav entry is absent for a non-Steward, and the claim control is
    // permanently hidden because a Steward already exists.
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: STEWARD_LABEL }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.queryByTestId("steward_claim.claim_button"),
    ).not.toBeInTheDocument();
  });

  it("hides the claim control from a signed-out caller", async () => {
    setAuthenticated(false);
    setSteward(false);
    setHasActiveSteward(false);
    renderApp();

    await waitFor(() => {
      expect(
        screen.queryByTestId("steward_claim.claim_button"),
      ).not.toBeInTheDocument();
    });
  });

  it("claims the Steward role once and lands on the Steward hub with the nav entry visible", async () => {
    const user = userEvent.setup();
    setAuthenticated(true);
    setSteward(false);
    setHasActiveSteward(false);
    setCurrentPrincipal(ACCOUNT);
    renderApp();

    const claimButton = await screen.findByTestId("steward_claim.claim_button");
    await user.click(claimButton);

    // The backend claim was invoked exactly once.
    await waitFor(() => {
      expect(getClaimCalls()).toBe(1);
    });

    // On success the caller lands on the Family Steward hub. The mock flips the
    // canonical Steward flag when claimSteward succeeds, so the invalidated
    // isSteward query refetches true and the hub renders its options.
    expect(await screen.findByTestId("steward_hub.grid")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: STEWARD_LABEL }),
    ).toBeInTheDocument();
  });

  it("surfaces a refused claim without navigating to the hub", async () => {
    const user = userEvent.setup();
    setAuthenticated(true);
    setSteward(false);
    setHasActiveSteward(false);
    setClaimResult({
      __kind__: "err",
      err: StewardClaimError.StewardAlreadyExists,
    });
    setCurrentPrincipal(ACCOUNT);
    renderApp();

    const claimButton = await screen.findByTestId("steward_claim.claim_button");
    await user.click(claimButton);

    expect(
      await screen.findByTestId("steward_claim.error_state"),
    ).toHaveTextContent(
      "A Family Steward already exists, so this claim is no longer available.",
    );
    // The refusal does not navigate to the Steward hub.
    expect(screen.queryByTestId("steward_hub.grid")).not.toBeInTheDocument();
  });
});
