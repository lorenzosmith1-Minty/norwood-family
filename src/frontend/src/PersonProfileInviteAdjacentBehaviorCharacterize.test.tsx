import "@testing-library/jest-dom/vitest";
import {
  type PersonProfile as BackendPersonProfile,
  ClaimStatus,
  LivingStatus,
  type ProfileClaim,
  ProfileClaimStatus,
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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PersonProfilePage,
  claytonProfile,
  juliaProfile,
} from "./pages/PersonProfilePage";

// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

// ---------------------------------------------------------------------------
// Characterization baseline for the Person Profile claim section, taken before
// the "Invite this family member" action is added.
//
// The upcoming build adds an invite action to the claim section for a signed-in
// authorized family user viewing a LIVING and UNCLAIMED profile, plus a dialog
// that calls createFamilyInvitation. That addition is the intentional change and
// is deliberately NOT frozen here.
//
// What this file protects is the EXISTING claim-section behavior the invite
// addition must not disturb. The invite action lands in the same branch region
// as the claim/ownership states, so a careless edit could reorder or replace
// them. The invariants:
//
//   A. A living, unclaimed profile still offers the "This is Me" claim action
//      with its existing copy.
//   B. A deceased profile still shows "This profile is not claimable." and no
//      claim action.
//   C. A profile claimed by another account still shows "This profile is owned
//      by a family member." and no claim action.
//   D. A profile owned by the signed-in caller still shows the owner copy and
//      the "Edit My Profile" action.
//   E. The Message button stays driven by the backend canMessagePerson result,
//      independent of the invite action.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend rendering contract; it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = "rrkah-fqaaa-aaaaa-aaaaq-cai";
const OTHER_USER = "rno2w-sqaaa-aaaaa-aaacq-cai";

const { mockActor, setBackendProfile, setCanMessage, setSteward } = vi.hoisted(
  () => {
    let backendProfile: unknown = null;
    let canMessage = false;
    let steward = false;

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
        return canMessage;
      },
      async isCallerSteward(): Promise<boolean> {
        return steward;
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
    };

    return {
      mockActor,
      setBackendProfile: (profile: unknown) => {
        backendProfile = profile;
      },
      setCanMessage: (value: boolean) => {
        canMessage = value;
      },
      setSteward: (value: boolean) => {
        steward = value;
      },
    };
  },
);

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

function renderProfile(person = claytonProfile) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
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
  setCanMessage(false);
  setSteward(false);
});

describe("Person Profile claim section adjacent behavior (characterization)", () => {
  it("keeps the 'This is Me' claim action on a living, unclaimed profile", async () => {
    setBackendProfile(makeBackendProfile());
    renderProfile();

    const claimSection = await screen.findByTestId("profile.claim_section");
    expect(
      await within(claimSection).findByText(
        "Is this you? Claim this profile to manage your personal details.",
      ),
    ).toBeInTheDocument();
    expect(
      within(claimSection).getByRole("button", { name: "This is Me" }),
    ).toBeInTheDocument();
  });

  it("keeps the not-claimable state on a deceased profile", async () => {
    setBackendProfile(
      makeBackendProfile({
        personId: "julia",
        name: "Julia “Julie” Norwood",
        livingStatus: LivingStatus.Deceased,
      }),
    );
    renderProfile(juliaProfile);

    const claimSection = await screen.findByTestId("profile.claim_section");
    expect(
      await within(claimSection).findByText("This profile is not claimable."),
    ).toBeInTheDocument();
    expect(
      within(claimSection).queryByRole("button", { name: "This is Me" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the owned-by-a-family-member state on a profile claimed by another account", async () => {
    setBackendProfile(
      makeBackendProfile({
        claimStatus: ClaimStatus.Claimed,
        claimedByUserId: Principal.fromText(OTHER_USER),
      }),
    );
    renderProfile();

    const claimSection = await screen.findByTestId("profile.claim_section");
    expect(
      await within(claimSection).findByText(
        "This profile is owned by a family member.",
      ),
    ).toBeInTheDocument();
    expect(
      within(claimSection).queryByRole("button", { name: "This is Me" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the owner edit entry on a profile owned by the signed-in caller", async () => {
    setBackendProfile(
      makeBackendProfile({
        claimStatus: ClaimStatus.Claimed,
        claimedByUserId: Principal.fromText(OWNER),
      }),
    );
    renderProfile();

    const claimSection = await screen.findByTestId("profile.claim_section");
    expect(
      await within(claimSection).findByText(
        "You own this profile. You can edit your personal details.",
      ),
    ).toBeInTheDocument();
    expect(
      within(claimSection).getByRole("button", { name: "Edit My Profile" }),
    ).toBeInTheDocument();
  });

  it("keeps the pending-claim state when the caller already has a pending claim", async () => {
    setBackendProfile(makeBackendProfile());
    mockActor.getMyProfileClaim = async () => ({
      familyId: "norwood",
      id: 1n,
      personId: "clayton",
      requestingUserId: Principal.fromText(OWNER),
      status: ProfileClaimStatus.Pending,
      submittedDate: 1_700_000_000_000_000_000n,
    });
    renderProfile();

    const claimSection = await screen.findByTestId("profile.claim_section");
    expect(
      await within(claimSection).findByText("Pending claim"),
    ).toBeInTheDocument();
    expect(
      within(claimSection).getByText(
        "Your claim to this profile is awaiting Family Steward review.",
      ),
    ).toBeInTheDocument();
    expect(
      within(claimSection).queryByRole("button", { name: "This is Me" }),
    ).not.toBeInTheDocument();
  });
});

describe("Person Profile Message button gating stays backend-driven (characterization)", () => {
  it("shows the Message button only when the backend confirms the viewer may message", async () => {
    setBackendProfile(
      makeBackendProfile({
        claimStatus: ClaimStatus.Claimed,
        claimedByUserId: Principal.fromText(OTHER_USER),
      }),
    );
    setCanMessage(true);
    renderProfile();

    expect(
      await screen.findByTestId("profile.message_button"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Message" })).toBeInTheDocument();
  });

  it("hides the Message button when the backend says the viewer may not message", async () => {
    setBackendProfile(makeBackendProfile());
    setCanMessage(false);
    renderProfile();

    // The profile still renders, but no Message button appears.
    expect(
      await screen.findByRole("heading", { level: 1 }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByTestId("profile.message_button"),
      ).not.toBeInTheDocument(),
    );
  });
});
