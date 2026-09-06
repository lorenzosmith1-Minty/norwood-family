import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  LivingStatus,
  type Notification,
  NotificationType,
  type PersonProfile,
  type ProfileClaim,
  type Relationship,
  type RelationshipRequest,
  RelationshipStatus,
  RelationshipType,
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
import { AddMyselfPage } from "./pages/AddMyselfPage";
import { FamilyStewardReviewPage } from "./pages/FamilyStewardReviewPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { ProfileEditPage } from "./pages/ProfileEditPage";

// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

// Distinct, valid ICP principal strings used to stand in for different users.
const USER_1 = "2vxsx-fae";
const OWNER = "rrkah-fqaaa-aaaaa-aaaaq-cai";
const STEWARD = "ryjl3-tyaaa-aaaaa-aaaba-cai";
const CLAIMANT = "r7inp-6aaaa-aaaaa-aaabq-cai";
const NEW_USER = "rkp4c-7iaaa-aaaaa-aaaca-cai";
const OTHER_USER = "rno2w-sqaaa-aaaaa-aaacq-cai";

// ---------------------------------------------------------------------------
// A stateful in-memory actor standing in for the real backend so the profile
// ownership, claim, add-myself, relationship-verification, steward-review, and
// notifications journeys can be exercised end to end without a canister. It
// implements the methods the app's hooks call and keeps the same invariants the
// real backend enforces (deceased never claimable, one owner per claimed
// profile, pending claims/requests until a steward approves).
// ---------------------------------------------------------------------------
const {
  mockActor,
  resetState,
  setAuthenticated,
  setAdmin,
  getAuthenticated,
  setCurrentPrincipal,
  getCurrentPrincipal,
  seedClaim,
  seedRequest,
  seedNotification,
  seedProfile,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isAdmin = false;
  let currentPrincipal = "aaaaa-aa";
  let profiles: Record<string, PersonProfile> = {};
  let claims: ProfileClaim[] = [];
  let requests: RelationshipRequest[] = [];
  let confirmed: Relationship[] = [];
  let notifications: Notification[] = [];
  let nextClaimId = 1n;
  let nextRequestId = 1n;
  let nextRelId = 1n;
  let nextNotifId = 1n;

  const principal = () => Principal.fromText(currentPrincipal);

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return isAdmin;
    },
    async getPersonProfile(personId: string): Promise<PersonProfile | null> {
      return profiles[personId] ?? null;
    },
    async getMyProfileClaim(personId: string): Promise<ProfileClaim | null> {
      return (
        claims.find(
          (c) =>
            c.personId === personId &&
            c.requestingUserId.toString() === currentPrincipal,
        ) ?? null
      );
    },
    async listProfileClaims(): Promise<ProfileClaim[]> {
      return [...claims];
    },
    async requestProfileClaim(
      personId: string,
    ): Promise<
      { __kind__: "ok"; ok: ProfileClaim } | { __kind__: "err"; err: string }
    > {
      const profile = profiles[personId];
      if (!profile) return { __kind__: "err", err: "ProfileNotFound" };
      if (profile.livingStatus === LivingStatus.Deceased)
        return { __kind__: "err", err: "DeceasedProfile" };
      if (profile.claimStatus === ClaimStatus.Claimed)
        return { __kind__: "err", err: "AlreadyClaimed" };
      const claim: ProfileClaim = {
        id: nextClaimId++,
        personId,
        requestingUserId: principal(),
        status: "Pending",
        submittedDate: 1_700_000_000_000_000_000n,
      };
      claims = [...claims, claim];
      notifications = [
        ...notifications,
        {
          id: nextNotifId++,
          recipient: principal(),
          notificationType: NotificationType.ProfileClaimRequested,
          message: `Your claim for profile ${personId} is pending Family Steward review.`,
          createdAt: 1_700_000_000_000_000_000n,
          read: false,
        },
      ];
      return { __kind__: "ok", ok: claim };
    },
    async approveProfileClaim(claimId: bigint): Promise<ProfileClaim | null> {
      const claim = claims.find(
        (c) => c.id === claimId && c.status === "Pending",
      );
      if (!claim) return null;
      const updated: ProfileClaim = {
        ...claim,
        status: "Approved",
        reviewedBy: principal(),
        reviewedDate: 1_700_000_000_000_000_000n,
      };
      claims = claims.map((c) => (c.id === claimId ? updated : c));
      const profile = profiles[claim.personId];
      if (profile) {
        profiles = {
          ...profiles,
          [claim.personId]: {
            ...profile,
            claimStatus: ClaimStatus.Claimed,
            claimedByUserId: claim.requestingUserId,
          },
        };
      }
      notifications = [
        ...notifications,
        {
          id: nextNotifId++,
          recipient: claim.requestingUserId,
          notificationType: NotificationType.ProfileClaimReviewed,
          message: `Your claim for profile ${claim.personId} was approved.`,
          createdAt: 1_700_000_000_000_000_000n,
          read: false,
        },
      ];
      return updated;
    },
    async rejectProfileClaim(claimId: bigint): Promise<ProfileClaim | null> {
      const claim = claims.find(
        (c) => c.id === claimId && c.status === "Pending",
      );
      if (!claim) return null;
      const updated: ProfileClaim = {
        ...claim,
        status: "Rejected",
        reviewedBy: principal(),
        reviewedDate: 1_700_000_000_000_000_000n,
      };
      claims = claims.map((c) => (c.id === claimId ? updated : c));
      notifications = [
        ...notifications,
        {
          id: nextNotifId++,
          recipient: claim.requestingUserId,
          notificationType: NotificationType.ProfileClaimReviewed,
          message: `Your claim for profile ${claim.personId} was rejected.`,
          createdAt: 1_700_000_000_000_000_000n,
          read: false,
        },
      ];
      return updated;
    },
    async searchPossibleMatches(
      name: string,
    ): Promise<{ name: string; personId: string; parents: string[] }[]> {
      const term = name.toLowerCase();
      return Object.values(profiles)
        .filter((p) => p.name.toLowerCase().includes(term))
        .map((p) => ({ name: p.name, personId: p.personId, parents: [] }));
    },
    async createMyself(
      name: string,
    ): Promise<
      { __kind__: "ok"; ok: PersonProfile } | { __kind__: "err"; err: string }
    > {
      const personId = currentPrincipal;
      const profile: PersonProfile = {
        personId,
        name,
        livingStatus: LivingStatus.Living,
        claimStatus: ClaimStatus.Claimed,
        claimedByUserId: principal(),
        preferredName: undefined,
        story: undefined,
        occupation: undefined,
        birthInfo: undefined,
        timeline: undefined,
        privacySettings: undefined,
      };
      profiles = { ...profiles, [personId]: profile };
      return { __kind__: "ok", ok: profile };
    },
    async proposeRelationship(
      fromPersonId: string,
      toPersonId: string,
      relationshipType: RelationshipType,
    ): Promise<
      | { __kind__: "ok"; ok: RelationshipRequest }
      | { __kind__: "err"; err: string }
    > {
      const request: RelationshipRequest = {
        id: nextRequestId++,
        requestingPersonId: fromPersonId,
        relatedPersonId: toPersonId,
        proposedRelationship: relationshipType,
        status: "Pending",
        submittedDate: 1_700_000_000_000_000_000n,
      };
      requests = [...requests, request];
      notifications = [
        ...notifications,
        {
          id: nextNotifId++,
          recipient: principal(),
          notificationType: NotificationType.RelationshipRequested,
          message:
            "Your relationship request is pending Family Steward review.",
          createdAt: 1_700_000_000_000_000_000n,
          read: false,
        },
      ];
      return { __kind__: "ok", ok: request };
    },
    async listRelationshipRequests(): Promise<RelationshipRequest[]> {
      return [...requests];
    },
    async getRelationshipRequest(
      id: bigint,
    ): Promise<RelationshipRequest | null> {
      return requests.find((r) => r.id === id) ?? null;
    },
    async approveRelationshipRequest(
      requestId: bigint,
    ): Promise<RelationshipRequest | null> {
      const request = requests.find(
        (r) => r.id === requestId && r.status === "Pending",
      );
      if (!request) return null;
      const updated: RelationshipRequest = {
        ...request,
        status: "Approved",
        reviewer: principal(),
        reviewedDate: 1_700_000_000_000_000_000n,
      };
      requests = requests.map((r) => (r.id === requestId ? updated : r));
      confirmed = [
        ...confirmed,
        {
          id: nextRelId++,
          fromPersonId: request.requestingPersonId,
          toPersonId: request.relatedPersonId,
          relationshipType: request.proposedRelationship,
          status: RelationshipStatus.Confirmed,
        },
      ];
      return updated;
    },
    async rejectRelationshipRequest(
      requestId: bigint,
    ): Promise<RelationshipRequest | null> {
      const request = requests.find(
        (r) => r.id === requestId && r.status === "Pending",
      );
      if (!request) return null;
      const updated: RelationshipRequest = {
        ...request,
        status: "Rejected",
        reviewer: principal(),
        reviewedDate: 1_700_000_000_000_000_000n,
      };
      requests = requests.map((r) => (r.id === requestId ? updated : r));
      return updated;
    },
    async setRelationshipRequestPending(
      requestId: bigint,
    ): Promise<RelationshipRequest | null> {
      const request = requests.find((r) => r.id === requestId);
      if (!request) return null;
      const updated: RelationshipRequest = { ...request, status: "Pending" };
      requests = requests.map((r) => (r.id === requestId ? updated : r));
      return updated;
    },
    async listConfirmedRelationships(): Promise<Relationship[]> {
      return [...confirmed];
    },
    async updateOwnProfile(
      personId: string,
      edits: {
        preferredName?: string;
        story?: string;
        occupation?: string;
        birthInfo?: string;
        timeline?: string[];
        privacySettings?: string;
      },
    ): Promise<
      { __kind__: "ok"; ok: PersonProfile } | { __kind__: "err"; err: string }
    > {
      const profile = profiles[personId];
      if (!profile) return { __kind__: "err", err: "ProfileNotFound" };
      if (profile.claimedByUserId?.toString() !== currentPrincipal)
        return { __kind__: "err", err: "NotOwner" };
      if (profile.livingStatus === LivingStatus.Deceased)
        return { __kind__: "err", err: "DeceasedProfile" };
      const updated: PersonProfile = {
        ...profile,
        preferredName: edits.preferredName ?? profile.preferredName,
        story: edits.story ?? profile.story,
        occupation: edits.occupation ?? profile.occupation,
        birthInfo: edits.birthInfo ?? profile.birthInfo,
        timeline: edits.timeline ?? profile.timeline,
        privacySettings: edits.privacySettings ?? profile.privacySettings,
      };
      profiles = { ...profiles, [personId]: updated };
      return { __kind__: "ok", ok: updated };
    },
    async listNotifications(): Promise<Notification[]> {
      return notifications.filter(
        (n) => n.recipient.toString() === currentPrincipal,
      );
    },
    async markNotificationRead(id: bigint): Promise<Notification | null> {
      const found = notifications.find(
        (n) => n.id === id && n.recipient.toString() === currentPrincipal,
      );
      if (!found) return null;
      const updated = { ...found, read: true };
      notifications = notifications.map((n) => (n.id === id ? updated : n));
      return updated;
    },
  };

  return {
    mockActor,
    resetState: () => {
      isAuthenticated = false;
      isAdmin = false;
      currentPrincipal = "aaaaa-aa";
      profiles = {};
      claims = [];
      requests = [];
      confirmed = [];
      notifications = [];
      nextClaimId = 1n;
      nextRequestId = 1n;
      nextRelId = 1n;
      nextNotifId = 1n;
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    setAdmin: (v: boolean) => {
      isAdmin = v;
    },
    getAuthenticated: () => isAuthenticated,
    setCurrentPrincipal: (p: string) => {
      currentPrincipal = p;
    },
    getCurrentPrincipal: () => currentPrincipal,
    seedClaim: (claim: ProfileClaim) => {
      claims = [...claims, claim];
    },
    seedRequest: (request: RelationshipRequest) => {
      requests = [...requests, request];
    },
    seedNotification: (notification: Notification) => {
      notifications = [...notifications, notification];
    },
    seedProfile: (profile: PersonProfile) => {
      profiles = { ...profiles, [profile.personId]: profile };
    },
  };
});

// Replace the provider seam with the in-memory actor and a controllable
// authentication state. The real useActor/useInternetIdentity depend on an
// InternetIdentityProvider, which is not needed for a deterministic test.
vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: getAuthenticated(),
    login: () => {},
    identity: getAuthenticated()
      ? { getPrincipal: () => Principal.fromText(getCurrentPrincipal()) }
      : null,
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

afterEach(cleanup);
beforeEach(() => {
  resetState();
  // The Add Myself flow persists its entered state to sessionStorage so a
  // full-page auth redirect (Google / Apple one-click sign-in) restores the
  // exact flow. Clear it between tests so each test starts at the name step.
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

function renderPage(node: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>,
  );
}

// Seed a living, unclaimed profile for a family member so the claim flow can be
// exercised. The backend tracks ownership/lifecycle state; display content lives
// in the frontend profiles record.
function seedLivingUnclaimed(personId: string, name: string) {
  const profile: PersonProfile = {
    personId,
    name,
    livingStatus: LivingStatus.Living,
    claimStatus: ClaimStatus.Unclaimed,
    claimedByUserId: undefined,
    preferredName: undefined,
    story: undefined,
    occupation: undefined,
    birthInfo: undefined,
    timeline: undefined,
    privacySettings: undefined,
  };
  seedProfile(profile);
  mockActor.getPersonProfile = async (id: string) =>
    id === personId ? profile : null;
}

function seedDeceased(personId: string, name: string) {
  const profile: PersonProfile = {
    personId,
    name,
    livingStatus: LivingStatus.Deceased,
    claimStatus: ClaimStatus.Unclaimed,
    claimedByUserId: undefined,
    preferredName: undefined,
    story: undefined,
    occupation: undefined,
    birthInfo: undefined,
    timeline: undefined,
    privacySettings: undefined,
  };
  seedProfile(profile);
  mockActor.getPersonProfile = async (id: string) =>
    id === personId ? profile : null;
}

async function openProfile(
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp,
) {
  await user.click(screen.getByRole("button", { name: "Explore the Family" }));
  if (!name.test("Julia")) {
    await user.click(screen.getByRole("button", { name }));
  }
  await user.click(screen.getByRole("button", { name: "View Profile" }));
}

describe("Profile claim flow", () => {
  it("shows a 'This is Me' action for an unclaimed living profile and creates a pending claim when selected", async () => {
    seedLivingUnclaimed("clayton", "Clayton Norwood");
    setAuthenticated(true);
    setCurrentPrincipal(USER_1);
    const user = userEvent.setup();
    renderApp();

    await openProfile(user, /Clayton Norwood/);

    // The claim section offers the "This is Me" action.
    const claimSection = screen.getByTestId("profile.claim_section");
    expect(
      within(claimSection).getByText(
        "Is this you? Claim this profile to manage your personal details.",
      ),
    ).toBeInTheDocument();
    const thisIsMe = within(claimSection).getByRole("button", {
      name: "This is Me",
    });
    await user.click(thisIsMe);

    // A pending claim is created for the signed-in user (the backend records it
    // without granting ownership until a Family Steward approves).
    const created = await mockActor.getMyProfileClaim("clayton");
    expect(created).not.toBeNull();
    expect(created?.status).toBe("Pending");
    expect(created?.requestingUserId.toString()).toBe(USER_1);
  });

  it("shows a pending state on the claim button when the user already has a pending claim", async () => {
    seedLivingUnclaimed("clayton", "Clayton Norwood");
    seedClaim({
      id: 1n,
      personId: "clayton",
      requestingUserId: Principal.fromText(USER_1),
      status: "Pending",
      submittedDate: 1_700_000_000_000_000_000n,
    });
    setAuthenticated(true);
    setCurrentPrincipal(USER_1);
    const user = userEvent.setup();
    renderApp();

    await openProfile(user, /Clayton Norwood/);

    // The claim button reflects the pending claim instead of offering "This is Me".
    // The accepted requirement shows the pending state as "Profile claim pending".
    const claimSection = screen.getByTestId("profile.claim_section");
    expect(
      await within(claimSection).findByText("Profile claim pending"),
    ).toBeInTheDocument();
    expect(
      within(claimSection).queryByRole("button", { name: "This is Me" }),
    ).not.toBeInTheDocument();
  });

  it("never shows a claim action for a deceased profile", async () => {
    // Julia is deceased in the seeded backend data.
    seedDeceased("julia", "Julia “Julie” Norwood");
    setAuthenticated(true);
    setCurrentPrincipal(USER_1);
    const user = userEvent.setup();
    renderApp();

    await openProfile(user, /Julia/);

    const claimSection = screen.getByTestId("profile.claim_section");
    expect(
      within(claimSection).getByText("This profile is not claimable."),
    ).toBeInTheDocument();
    expect(
      within(claimSection).queryByRole("button", { name: "This is Me" }),
    ).not.toBeInTheDocument();
  });

  it("shows the owner's edit entry on a claimed profile owned by the signed-in user", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    mockActor.getPersonProfile = async (id: string) =>
      id === "clayton"
        ? {
            personId: "clayton",
            name: "Clayton Norwood",
            livingStatus: LivingStatus.Living,
            claimStatus: ClaimStatus.Claimed,
            claimedByUserId: Principal.fromText(OWNER),
            preferredName: undefined,
            story: undefined,
            occupation: undefined,
            birthInfo: undefined,
            timeline: undefined,
            privacySettings: undefined,
          }
        : null;
    const user = userEvent.setup();
    renderApp();

    await openProfile(user, /Clayton Norwood/);

    const claimSection = screen.getByTestId("profile.claim_section");
    expect(
      within(claimSection).getByText(
        "You own this profile. You can edit your personal details.",
      ),
    ).toBeInTheDocument();
    expect(
      within(claimSection).getByRole("button", { name: "Edit My Profile" }),
    ).toBeInTheDocument();
  });
});

describe("Add Myself to This Family flow", () => {
  it("asks for a name, searches for matches, and creates a minimal profile when no match exists", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(NEW_USER);
    const user = userEvent.setup();
    const onBack = vi.fn();
    const onOpenProfile = vi.fn();
    renderPage(<AddMyselfPage onBack={onBack} onOpenProfile={onOpenProfile} />);

    // Step 1: enter a name and search.
    await user.type(
      screen.getByTestId("add_myself.name_input"),
      "Jordan Norwood",
    );
    await user.click(screen.getByTestId("add_myself.search_button"));

    // No match exists, so the empty state offers to create a profile.
    expect(
      await screen.findByText(/No one named “Jordan Norwood” found/),
    ).toBeInTheDocument();
    await user.click(screen.getByTestId("add_myself.create_button"));

    // The connect step appears, requiring a connection to an existing member.
    expect(
      await screen.findByText("Who connects you to this family?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("New profile — not yet part of the family tree."),
    ).toBeInTheDocument();
  });

  it("shows possible matches with the person's name and parents when a match exists", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(USER_1);
    mockActor.searchPossibleMatches = async () => [
      {
        name: "Clayton Norwood",
        personId: "clayton",
        parents: ["Julia Norwood", "Isaiah Norwood"],
      },
    ];
    const user = userEvent.setup();
    renderPage(<AddMyselfPage onBack={() => {}} onOpenProfile={() => {}} />);

    await user.type(screen.getByTestId("add_myself.name_input"), "Clayton");
    await user.click(screen.getByTestId("add_myself.search_button"));

    // The match card shows the name and parents.
    expect(await screen.findByText("Clayton Norwood")).toBeInTheDocument();
    expect(
      screen.getByText("Child of Julia Norwood and Isaiah Norwood"),
    ).toBeInTheDocument();
  });
});

describe("Family Steward review", () => {
  it("shows an unauthorized state for a non-admin", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(USER_1);
    setAdmin(false);
    renderPage(<FamilyStewardReviewPage onBack={() => {}} />);

    expect(await screen.findByText("Family Stewards only")).toBeInTheDocument();
    expect(
      screen.getByTestId("steward_review.unauthorized_state"),
    ).toBeInTheDocument();
  });

  it("lets a steward approve a pending profile claim, marking the profile claimed", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(STEWARD);
    setAdmin(true);
    // Seed a pending claim from another user.
    seedClaim({
      id: 1n,
      personId: "clayton",
      requestingUserId: Principal.fromText(CLAIMANT),
      status: "Pending",
      submittedDate: 1_700_000_000_000_000_000n,
    });
    const user = userEvent.setup();
    renderPage(<FamilyStewardReviewPage onBack={() => {}} />);

    expect(await screen.findByText("Profile Claims (1)")).toBeInTheDocument();
    await user.click(
      screen.getByTestId("steward_review.claim_approve_button.1"),
    );

    // The claim is approved and leaves the pending list, so the review area
    // returns to its empty state.
    expect(
      await screen.findByText("Nothing awaiting review"),
    ).toBeInTheDocument();
  });

  it("lets a steward reject a pending relationship request", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(STEWARD);
    setAdmin(true);
    seedRequest({
      id: 1n,
      requestingPersonId: NEW_USER,
      relatedPersonId: "clayton",
      proposedRelationship: RelationshipType.Child,
      status: "Pending",
      submittedDate: 1_700_000_000_000_000_000n,
    });
    const user = userEvent.setup();
    renderPage(<FamilyStewardReviewPage onBack={() => {}} />);

    expect(
      await screen.findByText("Relationship Requests (1)"),
    ).toBeInTheDocument();
    await user.click(
      screen.getByTestId("steward_review.request_reject_button.1"),
    );

    // The request is rejected and leaves the pending list, so the review area
    // returns to its empty state.
    expect(
      await screen.findByText("Nothing awaiting review"),
    ).toBeInTheDocument();
  });
});

describe("Notifications", () => {
  it("lists the signed-in user's notifications and marks one as read", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(USER_1);
    seedNotification({
      id: 1n,
      recipient: Principal.fromText(USER_1),
      notificationType: NotificationType.ProfileClaimReviewed,
      message: "Your claim for profile clayton was approved.",
      createdAt: 1_700_000_000_000_000_000n,
      read: false,
    });
    const user = userEvent.setup();
    renderPage(<NotificationsPage />);

    expect(
      await screen.findByText("Your claim for profile clayton was approved."),
    ).toBeInTheDocument();
    expect(screen.getByText("1 unread")).toBeInTheDocument();

    await user.click(screen.getByTestId("notifications.mark_read_button.0"));

    // After marking read, the unread count drops and the button disappears.
    expect(await screen.findByText("You're all caught up")).toBeInTheDocument();
    expect(
      screen.queryByTestId("notifications.mark_read_button.0"),
    ).not.toBeInTheDocument();
  });

  it("shows an empty state when there are no notifications", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(USER_1);
    renderPage(<NotificationsPage />);

    expect(await screen.findByText("No notifications yet")).toBeInTheDocument();
  });
});

describe("Profile owner editing", () => {
  it("lets the owner edit approved personal-profile fields and save", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    seedProfile({
      personId: "clayton",
      name: "Clayton Norwood",
      livingStatus: LivingStatus.Living,
      claimStatus: ClaimStatus.Claimed,
      claimedByUserId: Principal.fromText(OWNER),
      preferredName: undefined,
      story: undefined,
      occupation: undefined,
      birthInfo: undefined,
      timeline: undefined,
      privacySettings: undefined,
    });
    const user = userEvent.setup();
    renderPage(<ProfileEditPage personId="clayton" onBack={() => {}} />);

    // The owner form is shown once the profile has loaded.
    expect(await screen.findByText("You own this profile")).toBeInTheDocument();

    // Edit the preferred name and save.
    await user.type(
      screen.getByTestId("profile_edit.preferred_name_input"),
      "Clay",
    );
    await user.click(screen.getByTestId("profile_edit.save_button"));

    expect(
      await screen.findByText("Your changes have been saved."),
    ).toBeInTheDocument();
  });

  it("shows a not-owner state for a signed-in non-owner", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(OTHER_USER);
    seedProfile({
      personId: "clayton",
      name: "Clayton Norwood",
      livingStatus: LivingStatus.Living,
      claimStatus: ClaimStatus.Claimed,
      claimedByUserId: Principal.fromText(OWNER),
      preferredName: undefined,
      story: undefined,
      occupation: undefined,
      birthInfo: undefined,
      timeline: undefined,
      privacySettings: undefined,
    });
    renderPage(<ProfileEditPage personId="clayton" onBack={() => {}} />);

    expect(
      await screen.findByText("You don't own this profile"),
    ).toBeInTheDocument();
  });
});
