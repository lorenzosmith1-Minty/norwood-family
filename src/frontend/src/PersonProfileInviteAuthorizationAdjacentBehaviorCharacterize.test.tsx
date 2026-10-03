import "@testing-library/jest-dom/vitest";
import {
  type PersonProfile as BackendPersonProfile,
  ClaimStatus,
  type FamilyMembership,
  LivingStatus,
  MembershipStatus,
  type ProfileClaim,
} from "@/backend";
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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PersonProfilePage,
  claytonProfile,
  juliaProfile,
} from "./pages/PersonProfilePage";

// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

// ---------------------------------------------------------------------------
// Characterization baseline for the Person Profile invite action's
// AUTHORIZATION-ADJACENT behavior, taken before the invite gate is narrowed.
//
// The upcoming change adds a new condition to `canInvite`: the signed-in
// viewer must be an approved member of the active family OR an active Family
// Steward, in addition to the existing requirements (living profile,
// unclaimable/claimable, not owned by another account). It also changes how the
// dialog handles a `Created` outcome with `created: false` (an existing Pending
// invitation) so it no longer builds a link from an empty rawToken.
//
// This file deliberately does NOT freeze the current broad gating (a signed-in
// viewer who is neither an approved member nor a Steward currently sees the
// button — that is exactly the behavior being changed), nor the current
// empty-token link construction. It protects the behavior that must survive the
// change, using viewers that are authorized BOTH before and after the gate
// change:
//
//   A. An approved member of the active family (Active membership) keeps seeing
//      the invite action on a living, unclaimed profile.
//   B. An active Family Steward keeps seeing the invite action on a living,
//      unclaimed profile.
//   C. The pre-existing profile requirements still hide the action: a deceased
//      profile, a profile claimed by another account, and a profile owned by
//      the signed-in caller.
//   D. The dialog's non-created outcomes (AlreadyMember,
//      RelationshipNotificationRequired, and a backend error tag) still render
//      neutral copy with no technical tag.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend rendering contract; it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = "rrkah-fqaaa-aaaaa-aaaaq-cai";
const OTHER_USER = "rno2w-sqaaa-aaaaa-aaacq-cai";

const {
  mockActor,
  resetCalls,
  setBackendProfile,
  setMembershipResult,
  setSteward,
  setInviteResult,
} = vi.hoisted(() => {
  let backendProfile: unknown = null;
  let membershipResult: unknown = { __kind__: "ok", ok: null };
  let steward = false;
  let inviteResult: unknown = { __kind__: "err", err: "InvalidInput" };

  const calls: {
    createFamilyInvitation: unknown[][];
    getMyMembershipForFamily: unknown[][];
  } = {
    createFamilyInvitation: [],
    getMyMembershipForFamily: [],
  };

  const mockActor = {
    async listPhotos(): Promise<unknown[]> {
      return [];
    },
    async getProfilePhoto(): Promise<null> {
      return null;
    },
    async getPersonProfile(): Promise<unknown> {
      return backendProfile;
    },
    async getMyProfileClaim(): Promise<ProfileClaim | null> {
      return null;
    },
    async canMessagePerson(): Promise<boolean> {
      return false;
    },
    async isCallerSteward(): Promise<boolean> {
      return steward;
    },
    async hasActiveSteward(): Promise<boolean> {
      return steward;
    },
    async getMyMembershipForFamily(...args: unknown[]): Promise<unknown> {
      calls.getMyMembershipForFamily.push(args);
      return membershipResult;
    },
    async getMyRelationshipRequests(): Promise<unknown[]> {
      return [];
    },
    async listArchivedProfileIds(): Promise<string[]> {
      return [];
    },
    async listConflictsForPerson(): Promise<unknown[]> {
      return [];
    },
    async createFamilyInvitation(...args: unknown[]): Promise<unknown> {
      calls.createFamilyInvitation.push(args);
      return inviteResult;
    },
  };

  return {
    mockActor,
    calls,
    resetCalls: () => {
      calls.createFamilyInvitation.length = 0;
      calls.getMyMembershipForFamily.length = 0;
    },
    setBackendProfile: (profile: unknown) => {
      backendProfile = profile;
    },
    setMembershipResult: (result: unknown) => {
      membershipResult = result;
    },
    setSteward: (value: boolean) => {
      steward = value;
    },
    setInviteResult: (result: unknown) => {
      inviteResult = result;
    },
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: true,
    login: () => {},
    clear: () => {},
    identity: { getPrincipal: () => Principal.fromText(OWNER) },
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

function makeBackendProfile(
  overrides: Partial<BackendPersonProfile> = {},
): BackendPersonProfile {
  return {
    familyId: "norwood",
    personId: "clayton",
    name: "Clayton Norwood",
    livingStatus: LivingStatus.Living,
    claimStatus: ClaimStatus.Unclaimed,
    claimedByUserId: undefined,
    preferredName: undefined,
    story: undefined,
    occupation: undefined,
    birthInfo: undefined,
    timeline: undefined,
    privacySettings: undefined,
    ...overrides,
  };
}

function makeMembership(
  overrides: Partial<FamilyMembership> = {},
): FamilyMembership {
  return {
    id: 7n,
    status: MembershipStatus.Active,
    accountId: Principal.fromText(OWNER),
    approvedAt: 1_700_000_000_000_000_000n,
    approvedBy: Principal.fromText(OWNER),
    createdAt: 1_700_000_000_000_000_000n,
    joinedAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
    personId: "clayton",
    familyId: "norwood",
    ...overrides,
  };
}

function renderProfile(person = claytonProfile) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PersonProfilePage
        person={person}
        onBack={() => {}}
        onProfilePhotoChange={() => {}}
      />
    </QueryClientProvider>,
  );
}

const inviteButton = () =>
  screen.queryByRole("button", { name: "Invite this family member" });

afterEach(cleanup);
beforeEach(() => {
  setBackendProfile(null);
  setMembershipResult({ __kind__: "ok", ok: null });
  setSteward(false);
  resetCalls();
  setInviteResult({ __kind__: "err", err: "InvalidInput" });
});

describe("invite action stays visible for viewers authorized before and after the gate change (characterization)", () => {
  it("keeps the invite action for an approved member of the active family", async () => {
    setBackendProfile(makeBackendProfile());
    setMembershipResult({ __kind__: "ok", ok: makeMembership() });
    renderProfile();

    expect(
      await screen.findByRole("button", {
        name: "Invite this family member",
      }),
    ).toBeInTheDocument();
  });

  it("keeps the invite action for an active Family Steward", async () => {
    setBackendProfile(makeBackendProfile());
    setSteward(true);
    renderProfile();

    expect(
      await screen.findByRole("button", {
        name: "Invite this family member",
      }),
    ).toBeInTheDocument();
  });
});

describe("pre-existing profile requirements still hide the invite action (characterization)", () => {
  it("hides the invite action for a deceased profile even for an approved member", async () => {
    setBackendProfile(
      makeBackendProfile({
        personId: "julia",
        name: "Julia “Julie” Norwood",
        livingStatus: LivingStatus.Deceased,
      }),
    );
    setMembershipResult({ __kind__: "ok", ok: makeMembership() });
    renderProfile(juliaProfile);

    await screen.findByTestId("profile.claim_section");
    await waitFor(() => expect(inviteButton()).not.toBeInTheDocument());
  });

  it("hides the invite action for a profile claimed by another account even for an approved member", async () => {
    setBackendProfile(
      makeBackendProfile({
        claimStatus: ClaimStatus.Claimed,
        claimedByUserId: Principal.fromText(OTHER_USER),
      }),
    );
    setMembershipResult({ __kind__: "ok", ok: makeMembership() });
    renderProfile();

    await screen.findByTestId("profile.claim_section");
    await waitFor(() => expect(inviteButton()).not.toBeInTheDocument());
  });

  it("hides the invite action for a profile owned by the signed-in caller even for an active Steward", async () => {
    setBackendProfile(
      makeBackendProfile({
        claimStatus: ClaimStatus.Claimed,
        claimedByUserId: Principal.fromText(OWNER),
      }),
    );
    setSteward(true);
    renderProfile();

    await screen.findByTestId("profile.claim_section");
    await waitFor(() => expect(inviteButton()).not.toBeInTheDocument());
  });
});

describe("invite dialog non-created outcomes stay neutral for an authorized viewer (characterization)", () => {
  async function submitInvite() {
    const user = userEvent.setup();
    setBackendProfile(makeBackendProfile());
    setSteward(true);
    renderProfile();
    await user.click(
      await screen.findByRole("button", {
        name: "Invite this family member",
      }),
    );
    const dialog = await screen.findByTestId("profile.invite_dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Create Invite" }),
    );
    return dialog;
  }

  it("shows neutral copy for an AlreadyMember conflict with no technical tag", async () => {
    setInviteResult({
      __kind__: "ok",
      ok: { __kind__: "AlreadyMember", AlreadyMember: null },
    });
    const dialog = await submitInvite();

    expect(
      await within(dialog).findByText(
        "This family member already has an account in the archive.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/AlreadyMember/)).toBeNull();
  });

  it("shows neutral copy when a confirmed relationship is required", async () => {
    setInviteResult({
      __kind__: "ok",
      ok: {
        __kind__: "RelationshipNotificationRequired",
        RelationshipNotificationRequired: null,
      },
    });
    const dialog = await submitInvite();

    expect(
      await within(dialog).findByText(
        "This family member needs a confirmed relationship before an invitation can be created.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByText(/RelationshipNotificationRequired/),
    ).toBeNull();
  });

  it("shows neutral copy for a backend error tag with no technical tag", async () => {
    setInviteResult({ __kind__: "err", err: "NotAuthorized" });
    const dialog = await submitInvite();

    expect(
      await within(dialog).findByText(
        "You don't have permission to invite this family member.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/NotAuthorized/)).toBeNull();
  });
});
