import "@testing-library/jest-dom/vitest";
import {
  type EligibleMembershipConfirmationView,
  MembershipConfirmationState,
  SimpleRelationshipType,
} from "@/backend";
import { DEFAULT_FAMILY_ID, FamilyProvider } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  configure,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationsPage } from "./pages/NotificationsPage";

// ---------------------------------------------------------------------------
// Cover for the READ-ONLY states of the trusted-relative confirmation request
// card, and for the eligibility gate on the Notifications surface.
//
// The accepted change makes the card gate its Confirm / Dispute actions on the
// canonical eligible view's derived `confirmationState`. Only
// `#AwaitingConfirmation` is actionable; every other state renders a calm,
// read-only presentation with NO confirmation buttons, using the shared plain
// family-facing label for that state:
//
//   * `#ApprovedByRelative`  -> "Confirmed by a family member"
//   * `#RejectedByRelative`  -> "Disputed"
//   * `#StewardReviewRequired` -> "Needs Steward review"
//   * `#ResolvedBySteward`   -> "Reviewed by a Family Steward"
//
// The Notifications surface discovers requests through the canonical,
// family-scoped `useMyEligibleMembershipConfirmations` query, which the backend
// only populates for a viewer eligible under the existing trusted-relative
// rules. A viewer who is not eligible therefore receives an empty list and sees
// no confirmation actions at all.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract; it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const OWNER = Principal.fromText("aaaaa-aa");

const { mockActor, calls, resetCalls, setEligibleConfirmations } = vi.hoisted(
  () => {
    const calls: {
      confirmPendingMembership: unknown[][];
      getMyConfirmationForMembership: unknown[][];
      getProfilePhotoForFamily: unknown[][];
      listMyEligibleMembershipConfirmationsForFamily: unknown[][];
      listNotifications: unknown[][];
    } = {
      confirmPendingMembership: [],
      getMyConfirmationForMembership: [],
      getProfilePhotoForFamily: [],
      listMyEligibleMembershipConfirmationsForFamily: [],
      listNotifications: [],
    };

    let eligibleConfirmations: unknown[] = [];

    const mockActor = {
      async confirmPendingMembership(...args: unknown[]): Promise<unknown> {
        calls.confirmPendingMembership.push(args);
        return { __kind__: "ok", ok: null };
      },
      async getMyConfirmationForMembership(
        ...args: unknown[]
      ): Promise<unknown> {
        calls.getMyConfirmationForMembership.push(args);
        return { __kind__: "ok", ok: null };
      },
      async getProfilePhotoForFamily(...args: unknown[]): Promise<unknown> {
        calls.getProfilePhotoForFamily.push(args);
        return null;
      },
      async listMyEligibleMembershipConfirmationsForFamily(
        ...args: unknown[]
      ): Promise<unknown> {
        calls.listMyEligibleMembershipConfirmationsForFamily.push(args);
        return { __kind__: "ok", ok: eligibleConfirmations };
      },
      async listNotifications(...args: unknown[]): Promise<unknown> {
        calls.listNotifications.push(args);
        return [];
      },
    };

    return {
      mockActor,
      calls,
      resetCalls: () => {
        for (const key of Object.keys(calls) as Array<keyof typeof calls>) {
          calls[key].length = 0;
        }
        eligibleConfirmations = [];
      },
      setEligibleConfirmations: (value: unknown[]) => {
        eligibleConfirmations = value;
      },
    };
  },
);

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: true,
    login: () => {},
    clear: () => {},
    identity: { getPrincipal: () => OWNER },
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

afterEach(cleanup);
beforeEach(resetCalls);

function makeEligibleConfirmation(
  overrides: Partial<EligibleMembershipConfirmationView> = {},
): EligibleMembershipConfirmationView {
  return {
    familyId: DEFAULT_FAMILY_ID,
    membershipId: 3n,
    pendingPersonId: "hudson",
    displayName: "Hudson Norwood",
    profilePhoto: undefined,
    birthYear: undefined,
    simpleRelationship: SimpleRelationshipType.Sibling,
    confirmationState: MembershipConfirmationState.AwaitingConfirmation,
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <FamilyProvider familyId={DEFAULT_FAMILY_ID}>
        <NotificationsPage />
      </FamilyProvider>
    </QueryClientProvider>,
  );
}

describe("confirmation request card: read-only states (cover)", () => {
  const readOnlyCases: Array<{
    state: MembershipConfirmationState;
    title: string;
    body: string;
  }> = [
    {
      state: MembershipConfirmationState.ApprovedByRelative,
      title: "Confirmed by a family member",
      body: "Another family member has already confirmed this connection.",
    },
    {
      state: MembershipConfirmationState.RejectedByRelative,
      title: "Disputed",
      body: "A family member did not confirm this connection. A Family Steward will review it.",
    },
    {
      state: MembershipConfirmationState.StewardReviewRequired,
      title: "Needs Steward review",
      body: "A Family Steward will review this connection.",
    },
    {
      state: MembershipConfirmationState.ResolvedBySteward,
      title: "Reviewed by a Family Steward",
      body: "A Family Steward has already reviewed this connection.",
    },
  ];

  for (const { state, title, body } of readOnlyCases) {
    it(`renders the read-only state for ${state} with no confirmation buttons`, async () => {
      setEligibleConfirmations([
        makeEligibleConfirmation({ confirmationState: state }),
      ]);

      renderPage();

      expect(await screen.findByText(title)).toBeInTheDocument();
      expect(screen.getByText(body)).toBeInTheDocument();
      // No actionable card and no Confirm / Dispute actions.
      expect(screen.queryByTestId("confirmation.request_card")).toBeNull();
      expect(screen.queryByTestId("confirmation.confirm_button")).toBeNull();
      expect(screen.queryByTestId("confirmation.dispute_button")).toBeNull();
    });
  }

  it("does not submit any decision when a read-only state is rendered", async () => {
    setEligibleConfirmations([
      makeEligibleConfirmation({
        confirmationState: MembershipConfirmationState.ApprovedByRelative,
      }),
    ]);

    renderPage();

    await screen.findByText("Confirmed by a family member");
    expect(calls.confirmPendingMembership).toEqual([]);
  });

  it("still renders the actionable card for #AwaitingConfirmation", async () => {
    setEligibleConfirmations([
      makeEligibleConfirmation({
        confirmationState: MembershipConfirmationState.AwaitingConfirmation,
      }),
    ]);

    renderPage();

    expect(
      await screen.findByTestId("confirmation.request_card"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("confirmation.confirm_button"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("confirmation.dispute_button"),
    ).toBeInTheDocument();
  });
});

describe("confirmation request surface: eligibility gate (cover)", () => {
  it("shows no confirmation actions to a viewer who is not an eligible trusted relative", async () => {
    // The backend only populates the canonical eligible query for an eligible
    // viewer; an ineligible viewer receives an empty list.
    setEligibleConfirmations([]);

    renderPage();

    await waitFor(() =>
      expect(calls.listMyEligibleMembershipConfirmationsForFamily).toEqual([
        [DEFAULT_FAMILY_ID],
      ]),
    );
    expect(screen.queryByTestId("confirmation.request_section")).toBeNull();
    expect(screen.queryByTestId("confirmation.request_card")).toBeNull();
    expect(screen.queryByTestId("confirmation.confirm_button")).toBeNull();
    expect(screen.queryByTestId("confirmation.dispute_button")).toBeNull();
  });

  it("renders the actionable card for an eligible viewer with a pending request", async () => {
    setEligibleConfirmations([
      makeEligibleConfirmation({
        confirmationState: MembershipConfirmationState.AwaitingConfirmation,
      }),
    ]);

    renderPage();

    expect(
      await screen.findByTestId("confirmation.request_section"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("confirmation.confirm_button"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("confirmation.dispute_button"),
    ).toBeInTheDocument();
  });
});

describe("confirmation request card: read-only state does not leak private context (cover)", () => {
  it("never surfaces technical identifiers in a read-only state", async () => {
    setEligibleConfirmations([
      makeEligibleConfirmation({
        confirmationState: MembershipConfirmationState.StewardReviewRequired,
      }),
    ]);

    renderPage();

    await screen.findByText("Needs Steward review");
    const text = document.body.textContent ?? "";
    for (const leaked of [
      "confirmationState",
      "membershipId",
      "pendingPersonId",
      "StewardReviewRequired",
    ]) {
      expect(text).not.toContain(leaked);
    }
  });
});
