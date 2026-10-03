import "@testing-library/jest-dom/vitest";
import {
  type PersonProfile as BackendPersonProfile,
  ClaimStatus,
  type FamilyInvitation,
  type FamilyInvitationCreated,
  FamilyInvitationError,
  InvitationStatus,
  InvitationType,
  LivingStatus,
  type ProfileClaim,
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
import { PersonProfilePage, claytonProfile } from "./pages/PersonProfilePage";

// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

// ---------------------------------------------------------------------------
// Characterization baseline for the invite DIALOG's adjacent behavior.
//
// The upcoming change narrows the invite BUTTON gating to an approved family
// member or an active Family Steward, and changes how the dialog handles a
// `Created` outcome with `created: false` (an existing Pending invitation).
//
// This file deliberately does NOT freeze the current broad button gating, nor
// the current empty-token link construction. It protects the dialog behavior
// that must survive the change, using an ACTIVE STEWARD viewer — a viewer that
// is authorized both before and after the gating change, so these assertions
// stay valid across it:
//
//   A. The dialog opens with an Email address field and a Create Invite button.
//   B. Submitting calls createFamilyInvitation(activeFamilyId, personId, email)
//      and sends null when the field is left empty.
//   C. The non-created outcomes render neutral copy with no technical error
//      tags: AlreadyMember, RelationshipNotificationRequired, and a backend
//      error tag.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend rendering contract; it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = "rrkah-fqaaa-aaaaa-aaaaq-cai";

const { mockActor, calls, resetCalls, setBackendProfile, setInviteResult } =
  vi.hoisted(() => {
    let backendProfile: unknown = null;
    let inviteResult: unknown = {
      __kind__: "err",
      err: "InvalidInput",
    };

    const calls: { createFamilyInvitation: unknown[][] } = {
      createFamilyInvitation: [],
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
      // The viewer is an active Family Steward, so the invite action is
      // authorized under both the current and the narrowed gating.
      async isCallerSteward(): Promise<boolean> {
        return true;
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
      },
      setBackendProfile: (profile: unknown) => {
        backendProfile = profile;
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

function makeCreated(
  overrides: Partial<FamilyInvitationCreated> = {},
): FamilyInvitationCreated {
  return {
    created: true,
    rawToken: "secure-token-abc",
    invitation: makeInvitation(),
    ...overrides,
  };
}

function renderProfile() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PersonProfilePage
        person={claytonProfile}
        onBack={() => {}}
        onProfilePhotoChange={() => {}}
      />
    </QueryClientProvider>,
  );
}

async function openInviteDialog() {
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Invite this family member" }),
  );
  return screen.findByTestId("profile.invite_dialog");
}

afterEach(cleanup);
beforeEach(() => {
  setBackendProfile(makeBackendProfile());
  resetCalls();
  setInviteResult({ __kind__: "err", err: FamilyInvitationError.InvalidInput });
});

describe("invite dialog opens for an authorized steward viewer (characterization)", () => {
  it("shows an Email address field and a Create Invite button", async () => {
    renderProfile();

    const dialog = await openInviteDialog();
    expect(within(dialog).getByLabelText("Email address")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Create Invite" }),
    ).toBeInTheDocument();
  });
});

describe("invite dialog submit call shape (characterization)", () => {
  it("submits the active familyId, personId, and entered email", async () => {
    const user = userEvent.setup();
    setInviteResult({
      __kind__: "ok",
      ok: { __kind__: "Created", Created: makeCreated() },
    } satisfies Result_37);
    renderProfile();

    const dialog = await openInviteDialog();
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
  });

  it("sends a null email when the field is left empty", async () => {
    const user = userEvent.setup();
    setInviteResult({
      __kind__: "ok",
      ok: { __kind__: "Created", Created: makeCreated() },
    } satisfies Result_37);
    renderProfile();

    const dialog = await openInviteDialog();
    await user.click(
      within(dialog).getByRole("button", { name: "Create Invite" }),
    );

    await waitFor(() =>
      expect(calls.createFamilyInvitation).toEqual([
        ["norwood", "clayton", null],
      ]),
    );
  });
});

describe("invite dialog non-created outcomes render neutral wording (characterization)", () => {
  async function submitInvite() {
    const user = userEvent.setup();
    renderProfile();
    const dialog = await openInviteDialog();
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
