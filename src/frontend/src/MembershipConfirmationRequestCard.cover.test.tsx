import "@testing-library/jest-dom/vitest";
import {
  ConfirmationDecision,
  type MembershipConfirmation,
  MembershipConfirmationError,
  MembershipStatus,
  type PersonProfile,
  SimpleRelationshipType,
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
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MembershipConfirmationRequestCard } from "./components/MembershipConfirmationRequestCard";

// ---------------------------------------------------------------------------
// Cover for the trusted-relative confirmation REQUEST card.
//
// The accepted change surfaces a confirmation request through the existing
// Notifications surface (no new global navigation section). The card:
//
//   1. asks "Can you confirm this family connection?" and shows only the
//      pending person's display name, their profile photo when one exists, their
//      birth year only when already visible, and the simple relationship to the
//      confirmer (Parent, Child, Sibling, or Spouse / Partner);
//   2. submits a #Confirmed decision through the family-scoped confirmation API
//      for "Yes, I know this person" and a #Disputed decision for "I don't think
//      this is correct", with neutral wording and no accusatory language;
//   3. disables both actions and shows a calm in-progress state while a decision
//      is submitting;
//   4. renders the correct result state: "Connection confirmed" + "[Name] can
//      now join the family." on activation, an accurate further-review state,
//      the neutral dispute state, and the neutral "This request no longer needs
//      your confirmation." state when the case changed before the user acted;
//   5. never surfaces backend membership details, sensitive relationship
//      context, private notes, or technical identifiers.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract; it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const OWNER = Principal.fromText("aaaaa-aa");
const FAMILY_A = "test-family-a";

const {
  mockActor,
  calls,
  resetCalls,
  restoreActor,
  setConfirmResult,
  setMyDecision,
  setMemberships,
} = vi.hoisted(() => {
  const calls: {
    confirmPendingMembership: unknown[][];
    getMyConfirmationForMembership: unknown[][];
    getProfilePhotoForFamily: unknown[][];
    listFamilyMembersForFamily: unknown[][];
  } = {
    confirmPendingMembership: [],
    getMyConfirmationForMembership: [],
    getProfilePhotoForFamily: [],
    listFamilyMembersForFamily: [],
  };

  // The confirmation record is built lazily by the test body (which runs
  // after module initialization), so the hoisted block never touches a
  // module-level import such as Principal.
  let confirmResult: unknown = null;
  let myDecision: unknown = { __kind__: "ok", ok: null };
  // The resulting membership state the hook re-reads after a #Confirmed
  // submission to tell an activation apart from a case that stayed at Steward
  // review. Default: an empty list, so the hook falls back to reporting the
  // confirmation as an activation.
  let memberships: unknown = { __kind__: "ok", ok: [] };

  const mockActor = {
    async confirmPendingMembership(...args: unknown[]): Promise<unknown> {
      calls.confirmPendingMembership.push(args);
      return confirmResult;
    },
    async getMyConfirmationForMembership(...args: unknown[]): Promise<unknown> {
      calls.getMyConfirmationForMembership.push(args);
      return myDecision;
    },
    async getProfilePhotoForFamily(...args: unknown[]): Promise<unknown> {
      calls.getProfilePhotoForFamily.push(args);
      return null;
    },
    async listFamilyMembersForFamily(...args: unknown[]): Promise<unknown> {
      calls.listFamilyMembersForFamily.push(args);
      return memberships;
    },
  };

  // A test may replace `confirmPendingMembership` with a deferred mock to
  // observe the in-progress state. `restoreActor` puts the original
  // implementation back so the override never leaks into a later test.
  const originalConfirm = mockActor.confirmPendingMembership;
  const restoreActor = () => {
    mockActor.confirmPendingMembership = originalConfirm;
  };

  return {
    mockActor,
    calls,
    restoreActor,
    resetCalls: () => {
      for (const key of Object.keys(calls) as Array<keyof typeof calls>) {
        calls[key].length = 0;
      }
      confirmResult = null;
      myDecision = { __kind__: "ok", ok: null };
      memberships = { __kind__: "ok", ok: [] };
    },
    setConfirmResult: (value: unknown) => {
      confirmResult = value;
    },
    setMyDecision: (value: unknown) => {
      myDecision = value;
    },
    setMemberships: (value: unknown) => {
      memberships = value;
    },
  };
});

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
beforeEach(() => {
  restoreActor();
  resetCalls();
  // Default: a #Confirmed submission activates the membership.
  setConfirmResult({
    __kind__: "ok",
    ok: makeConfirmation(ConfirmationDecision.Confirmed),
  });
});

function makeProfile(overrides: Partial<PersonProfile> = {}): PersonProfile {
  return {
    personId: "hudson",
    name: "Hudson Norwood",
    familyId: FAMILY_A,
    claimStatus: "Unclaimed" as PersonProfile["claimStatus"],
    livingStatus: "Living" as PersonProfile["livingStatus"],
    ...overrides,
  };
}

function makeConfirmation(
  decision: ConfirmationDecision,
): MembershipConfirmation {
  return {
    id: 1n,
    familyId: "norwood",
    membershipId: 3n,
    pendingPersonId: "hudson",
    confirmerAccountId: OWNER,
    confirmerPersonId: "clayton",
    decision,
    relationshipId: 11n,
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
  };
}

function renderCard(props: {
  membershipId?: bigint;
  pendingPersonId?: string;
  pendingProfile?: PersonProfile | null;
  relationship?: SimpleRelationshipType | null;
  onResolved?: () => void;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <FamilyProvider familyId={FAMILY_A}>
        <MembershipConfirmationRequestCard
          membershipId={props.membershipId ?? 3n}
          pendingPersonId={props.pendingPersonId ?? "hudson"}
          pendingProfile={props.pendingProfile ?? makeProfile()}
          relationship={props.relationship ?? null}
          onResolved={props.onResolved}
        />
      </FamilyProvider>
    </QueryClientProvider>,
  );
}

describe("confirmation request card: family-safe content (cover)", () => {
  it("asks the confirmation question and shows the pending person's display name", async () => {
    renderCard({});

    expect(
      await screen.findByText("Can you confirm this family connection?"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Hudson Norwood/)).toBeInTheDocument();
  });

  it("shows the simple relationship label when the surface supplies it", async () => {
    renderCard({ relationship: SimpleRelationshipType.Sibling });

    expect(await screen.findByText("Sibling")).toBeInTheDocument();
  });

  it("renders the Spouse or Partner label for SpousePartner", async () => {
    renderCard({ relationship: SimpleRelationshipType.SpousePartner });

    expect(await screen.findByText("Spouse or Partner")).toBeInTheDocument();
  });

  it("shows the birth year only when the profile already carries one", async () => {
    renderCard({ pendingProfile: makeProfile({ birthDate: "1948-03-02" }) });

    expect(await screen.findByText(/Born 1948/)).toBeInTheDocument();
  });

  it("omits the birth year when the profile carries none", async () => {
    renderCard({ pendingProfile: makeProfile() });

    await screen.findByText("Can you confirm this family connection?");
    expect(screen.queryByText(/Born/)).toBeNull();
  });

  it("never renders sensitive relationship context or technical identifiers", async () => {
    renderCard({ relationship: SimpleRelationshipType.Parent });

    await screen.findByText("Can you confirm this family connection?");
    const text = document.body.textContent ?? "";
    for (const sensitive of [
      "Biological",
      "Adoptive",
      "Foster",
      "Step",
      "Guardian",
      "relationshipId",
      "confirmerAccountId",
      "membershipId",
    ]) {
      expect(text).not.toContain(sensitive);
    }
  });
});

describe("confirmation request card: primary actions (cover)", () => {
  it("submits a #Confirmed decision through the family-scoped API", async () => {
    const user = userEvent.setup();
    renderCard({});

    await user.click(await screen.findByTestId("confirmation.confirm_button"));

    await waitFor(() =>
      expect(calls.confirmPendingMembership).toEqual([
        [FAMILY_A, 3n, ConfirmationDecision.Confirmed],
      ]),
    );
  });

  it("submits a #Disputed decision through the family-scoped API", async () => {
    setConfirmResult({
      __kind__: "ok",
      ok: makeConfirmation(ConfirmationDecision.Disputed),
    });
    const user = userEvent.setup();
    renderCard({});

    await user.click(await screen.findByTestId("confirmation.dispute_button"));

    await waitFor(() =>
      expect(calls.confirmPendingMembership).toEqual([
        [FAMILY_A, 3n, ConfirmationDecision.Disputed],
      ]),
    );
  });

  it("uses neutral wording with no accusatory language", async () => {
    renderCard({});

    await screen.findByTestId("confirmation.confirm_button");
    const text = document.body.textContent ?? "";
    for (const accusatory of ["fraud", "fake", "imposter", "impostor"]) {
      expect(text.toLowerCase()).not.toContain(accusatory);
    }
  });

  it("disables both actions and shows an in-progress state while submitting", async () => {
    let resolveConfirm: (value: unknown) => void = () => {};
    mockActor.confirmPendingMembership = vi.fn(
      (...args: unknown[]) =>
        new Promise<unknown>((resolve) => {
          calls.confirmPendingMembership.push(args);
          resolveConfirm = resolve;
        }),
    );

    const user = userEvent.setup();
    renderCard({});

    await user.click(await screen.findByTestId("confirmation.confirm_button"));

    await waitFor(() =>
      expect(
        screen.getByTestId("confirmation.submitting_state"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByTestId("confirmation.confirm_button")).toBeDisabled();
    expect(screen.getByTestId("confirmation.dispute_button")).toBeDisabled();

    resolveConfirm({
      __kind__: "ok",
      ok: makeConfirmation(ConfirmationDecision.Confirmed),
    });
  });
});

describe("confirmation request card: result states (cover)", () => {
  it("renders 'Connection confirmed' and '[Name] can now join the family.' on activation", async () => {
    const user = userEvent.setup();
    renderCard({});

    await user.click(await screen.findByTestId("confirmation.confirm_button"));

    expect(await screen.findByText("Connection confirmed")).toBeInTheDocument();
    expect(
      screen.getByText("Hudson Norwood can now join the family."),
    ).toBeInTheDocument();
  });

  it("renders the further-review state when the backend requires review", async () => {
    // The backend echoes the SUBMITTED decision, so the echoed record cannot
    // distinguish an activation from a case that stayed at Steward review. The
    // hook derives the outcome from the resulting membership state: a
    // #Confirmed submission whose membership is still Pending (e.g. the case
    // already carried a dispute) is reported as review-required.
    setConfirmResult({
      __kind__: "ok",
      ok: makeConfirmation(ConfirmationDecision.Confirmed),
    });
    setMemberships({
      __kind__: "ok",
      ok: [
        {
          id: 3n,
          status: MembershipStatus.Pending,
          accountId: OWNER,
          createdAt: 1_700_000_000_000_000_000n,
          updatedAt: 1_700_000_000_000_000_000n,
          personId: "hudson",
          familyId: FAMILY_A,
        },
      ],
    });
    const user = userEvent.setup();
    renderCard({});

    await user.click(await screen.findByTestId("confirmation.confirm_button"));

    expect(
      await screen.findByText("This connection needs a Family Steward"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Connection confirmed")).toBeNull();
  });

  it("renders the neutral dispute state and never says the applicant was rejected", async () => {
    setConfirmResult({
      __kind__: "ok",
      ok: makeConfirmation(ConfirmationDecision.Disputed),
    });
    const user = userEvent.setup();
    renderCard({});

    await user.click(await screen.findByTestId("confirmation.dispute_button"));

    expect(
      await screen.findByText(
        "Thanks — this connection will be reviewed by a Family Steward.",
      ),
    ).toBeInTheDocument();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/rejected/i);
    expect(text).not.toMatch(/blocked/i);
  });

  it("renders the neutral no-longer-needed state when the case changed before the user acted", async () => {
    setConfirmResult({
      __kind__: "err",
      err: MembershipConfirmationError.MembershipNotPending,
    });
    const user = userEvent.setup();
    renderCard({});

    await user.click(await screen.findByTestId("confirmation.confirm_button"));

    expect(
      await screen.findByText("This request no longer needs your confirmation"),
    ).toBeInTheDocument();
    // No private reason is exposed.
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("MembershipNotPending");
    expect(text).not.toContain("AlreadyDecided");
  });

  it("collapses every case-change error to the same neutral state", async () => {
    for (const err of [
      MembershipConfirmationError.AlreadyDecided,
      MembershipConfirmationError.NoQualifyingRelationship,
      MembershipConfirmationError.MembershipNotFound,
      MembershipConfirmationError.FamilyNotFound,
      MembershipConfirmationError.NoActiveMembership,
      MembershipConfirmationError.SelfConfirmation,
      MembershipConfirmationError.ActivationFailed,
    ]) {
      cleanup();
      resetCalls();
      setConfirmResult({ __kind__: "err", err });
      const user = userEvent.setup();
      renderCard({});

      await user.click(
        await screen.findByTestId("confirmation.confirm_button"),
      );

      expect(
        await screen.findByText(
          "This request no longer needs your confirmation",
        ),
      ).toBeInTheDocument();
    }
  });

  it("surfaces a retryable error state for a non-case-change error", async () => {
    setConfirmResult({
      __kind__: "err",
      err: MembershipConfirmationError.NotAuthorized,
    });
    const user = userEvent.setup();
    renderCard({});

    await user.click(await screen.findByTestId("confirmation.confirm_button"));

    expect(
      await screen.findByText("We couldn't record your response"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("This request no longer needs your confirmation"),
    ).toBeNull();
  });

  it("settles into the caller's own recorded decision without a new submit", async () => {
    setMyDecision({
      __kind__: "ok",
      ok: makeConfirmation(ConfirmationDecision.Confirmed),
    });

    renderCard({});

    expect(await screen.findByText("Connection confirmed")).toBeInTheDocument();
    expect(calls.confirmPendingMembership).toEqual([]);
  });

  it("never surfaces backend membership details in any result state", async () => {
    const user = userEvent.setup();
    renderCard({});

    await user.click(await screen.findByTestId("confirmation.confirm_button"));
    await screen.findByText("Connection confirmed");

    const text = document.body.textContent ?? "";
    expect(text).not.toContain("relationshipId");
    expect(text).not.toContain("confirmerAccountId");
    expect(text).not.toContain("confirmerPersonId");
  });
});
