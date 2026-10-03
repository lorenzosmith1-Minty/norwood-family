import "@testing-library/jest-dom/vitest";
import {
  type PersonProfile as BackendPersonProfile,
  ClaimStatus,
  type FamilyInvitation,
  type FamilyInvitationCreated,
  FamilyInvitationError,
  type FamilyMembership,
  InvitationStatus,
  InvitationType,
  LivingStatus,
  MembershipStatus,
  type ProfileClaim,
  ProfileClaimStatus,
  type Result_37,
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
// Cover for the "Invite this family member" action on PersonProfilePage.
//
// Accepted behavior under test:
//   1. The invite action is limited to a signed-in viewer who is an approved
//      member of the ACTIVE family (Active membership) OR an active Family
//      Steward, in addition to the pre-existing requirements (living profile,
//      unclaimed/claimable, not owned by another account). A signed-in viewer
//      who is neither an approved member nor a Steward does NOT see it.
//   2. It is hidden for deceased profiles, profiles claimed by another account,
//      and profiles owned by the caller.
//   3. Clicking the action opens a dialog with an Email address field and a
//      Create Invite button.
//   4. Submitting calls createFamilyInvitation(activeFamilyId, personId, email)
//      and, on success, shows "Invitation created." plus the copy-link
//      affordance and never implies an email was sent.
//   5. When the backend reports an existing Pending invitation as Created with
//      created=false and an empty rawToken, the dialog shows neutral
//      existing-invitation copy and builds NO invite link from the empty token.
//   6. Backend conflict / already-member / relationship-required failures
//      render neutral wording with no technical error tags.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend rendering and consumer contract; it does not
// exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = "rrkah-fqaaa-aaaaa-aaaaq-cai";
const OTHER_USER = "rno2w-sqaaa-aaaaa-aaacq-cai";

const {
  mockActor,
  calls,
  resetCalls,
  setBackendProfile,
  setMembershipResult,
  setSteward,
  setInviteResult,
} = vi.hoisted(() => {
  let backendProfile: unknown = null;
  let membershipResult: unknown = { __kind__: "ok", ok: null };
  let steward = false;
  let inviteResult: unknown = {
    __kind__: "err",
    err: "InvalidInput",
  };

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

function makeInvitation(
  overrides: Partial<FamilyInvitation> = {},
): FamilyInvitation {
  return {
    id: 1n,
    familyId: "norwood",
    personId: "clayton",
    invitedEmail: "relative@example.com",
    invitedByAccountId: Principal.fromText(OWNER),
    invitedByPersonId: undefined,
    invitationType: InvitationType.FamilyMember,
    tokenHash: "hash",
    status: InvitationStatus.Pending,
    createdAt: 1_700_000_000_000_000_000n,
    expiresAt: 1_800_000_000_000_000_000n,
    acceptedAt: undefined,
    acceptedByAccountId: undefined,
    cancelledAt: undefined,
    ...overrides,
  };
}

function makeCreated(rawToken = "secure-token-abc"): FamilyInvitationCreated {
  return {
    created: true,
    rawToken,
    invitation: makeInvitation(),
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

afterEach(cleanup);
beforeEach(() => {
  setBackendProfile(null);
  // Default the signed-in viewer to an approved member of the active family so
  // the visibility and journey tests exercise the authorized path. Tests that
  // need a different viewer override this explicitly.
  setMembershipResult({ __kind__: "ok", ok: makeMembership() });
  setSteward(false);
  resetCalls();
  setInviteResult({ __kind__: "err", err: FamilyInvitationError.InvalidInput });
});

describe("invite action visibility (cover)", () => {
  it("shows the invite action for a living, unclaimed profile", async () => {
    setBackendProfile(makeBackendProfile());
    renderProfile();

    expect(
      await screen.findByRole("button", {
        name: "Invite this family member",
      }),
    ).toBeInTheDocument();
  });

  it("hides the invite action for a signed-in viewer who is neither an approved member nor a Steward", async () => {
    // Signed in, living, unclaimed profile — but the caller has no Active
    // membership in the active family and is not a Steward.
    setBackendProfile(makeBackendProfile());
    setMembershipResult({ __kind__: "ok", ok: null });
    setSteward(false);
    renderProfile();

    await screen.findByTestId("profile.claim_section");
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Invite this family member" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("shows the invite action for an active Family Steward with no membership", async () => {
    setBackendProfile(makeBackendProfile());
    setMembershipResult({ __kind__: "ok", ok: null });
    setSteward(true);
    renderProfile();

    expect(
      await screen.findByRole("button", {
        name: "Invite this family member",
      }),
    ).toBeInTheDocument();
  });

  it("hides the invite action for a deceased profile", async () => {
    setBackendProfile(
      makeBackendProfile({
        personId: "julia",
        name: "Julia “Julie” Norwood",
        livingStatus: LivingStatus.Deceased,
      }),
    );
    renderProfile(juliaProfile);

    // The profile renders (claim section present) but no invite action appears.
    await screen.findByTestId("profile.claim_section");
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Invite this family member" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("hides the invite action for a profile claimed by another account", async () => {
    setBackendProfile(
      makeBackendProfile({
        claimStatus: ClaimStatus.Claimed,
        claimedByUserId: Principal.fromText(OTHER_USER),
      }),
    );
    renderProfile();

    await screen.findByTestId("profile.claim_section");
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Invite this family member" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("hides the invite action for a profile owned by the signed-in caller", async () => {
    setBackendProfile(
      makeBackendProfile({
        claimStatus: ClaimStatus.Claimed,
        claimedByUserId: Principal.fromText(OWNER),
      }),
    );
    renderProfile();

    await screen.findByTestId("profile.claim_section");
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Invite this family member" }),
      ).not.toBeInTheDocument(),
    );
  });
});

describe("invite dialog and create journey (cover)", () => {
  it("opens a dialog with an Email address field and a Create Invite button", async () => {
    const user = userEvent.setup();
    setBackendProfile(makeBackendProfile());
    renderProfile();

    await user.click(
      await screen.findByRole("button", {
        name: "Invite this family member",
      }),
    );

    const dialog = await screen.findByTestId("profile.invite_dialog");
    expect(within(dialog).getByLabelText("Email address")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Create Invite" }),
    ).toBeInTheDocument();
  });

  it("submits the active familyId, personId, and entered email, then reveals a copyable secure link", async () => {
    const user = userEvent.setup();
    setBackendProfile(makeBackendProfile());
    setInviteResult({
      __kind__: "ok",
      ok: { __kind__: "Created", Created: makeCreated("secure-token-abc") },
    } satisfies Result_37);
    renderProfile();

    await user.click(
      await screen.findByRole("button", {
        name: "Invite this family member",
      }),
    );

    const dialog = await screen.findByTestId("profile.invite_dialog");
    await user.type(
      within(dialog).getByLabelText("Email address"),
      "relative@example.com",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Create Invite" }),
    );

    await waitFor(() =>
      expect(calls.createFamilyInvitation).toEqual([
        ["norwood", "clayton", "relative@example.com"],
      ]),
    );

    // Success copy is neutral and never implies an email was sent.
    expect(
      await within(dialog).findByText("Invitation created."),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Copy this secure invitation link and send it to the family member.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Copy Link" }),
    ).toBeInTheDocument();
    // The secure link carries the raw token returned by the backend.
    expect(within(dialog).getByTestId("profile.invite_link")).toHaveTextContent(
      "secure-token-abc",
    );
    // No "email sent" wording anywhere in the dialog.
    expect(within(dialog).queryByText(/email (was )?sent/i)).toBeNull();
  });

  it("sends a null email when the field is left empty", async () => {
    const user = userEvent.setup();
    setBackendProfile(makeBackendProfile());
    setInviteResult({
      __kind__: "ok",
      ok: { __kind__: "Created", Created: makeCreated() },
    } satisfies Result_37);
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

    await waitFor(() =>
      expect(calls.createFamilyInvitation).toEqual([
        ["norwood", "clayton", null],
      ]),
    );
  });

  it("shows neutral existing-invitation copy and builds no link when the backend returns created:false with an empty token", async () => {
    const user = userEvent.setup();
    setBackendProfile(makeBackendProfile());
    // The backend reports an existing Pending invitation as Created with
    // created=false and an empty rawToken.
    setInviteResult({
      __kind__: "ok",
      ok: {
        __kind__: "Created",
        Created: { ...makeCreated(""), created: false, rawToken: "" },
      },
    } satisfies Result_37);
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

    expect(
      await within(dialog).findByText(
        "An invitation already exists for this family member.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Create a fresh invitation link before sending it.",
      ),
    ).toBeInTheDocument();
    // No link is built from the empty token, and the success/copy affordances
    // are absent.
    expect(within(dialog).queryByTestId("profile.invite_link")).toBeNull();
    expect(
      within(dialog).queryByRole("button", { name: "Copy Link" }),
    ).toBeNull();
    expect(within(dialog).queryByText("Invitation created.")).toBeNull();
  });
});

describe("invite failure outcomes render neutral wording (cover)", () => {
  async function submitInvite() {
    const user = userEvent.setup();
    setBackendProfile(makeBackendProfile());
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
    } satisfies Result_37);
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
    } satisfies Result_37);
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
    setInviteResult({
      __kind__: "err",
      err: FamilyInvitationError.NotAuthorized,
    } satisfies Result_37);
    const dialog = await submitInvite();

    expect(
      await within(dialog).findByText(
        "You don't have permission to invite this family member.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/NotAuthorized/)).toBeNull();
  });

  it("shows neutral copy for an invalid email input with no technical tag", async () => {
    setInviteResult({
      __kind__: "err",
      err: FamilyInvitationError.InvalidInput,
    } satisfies Result_37);
    const dialog = await submitInvite();

    expect(
      await within(dialog).findByText(
        "Please check the email address and try again.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/InvalidInput/)).toBeNull();
  });
});
