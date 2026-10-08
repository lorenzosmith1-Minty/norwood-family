import "@testing-library/jest-dom/vitest";
import {
  type ArchiveItem,
  ArchiveItemClassification,
  ArchiveItemStatus,
  ArchiveItemType,
  ClaimStatus,
  LivingStatus,
  type PersonProfile,
  PrivacyLevel,
  SourceStatus,
} from "@/backend";
import { ExternalBlob } from "@caffeineai/object-storage";
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
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import App from "./App";
import { FamilyStewardHubPage } from "./pages/FamilyStewardHubPage";

// ---------------------------------------------------------------------------
// Phase 5B — "Download my data" / "Download family archive": adjacent-behavior
// characterization.
//
// The download feature does not exist yet. This file deliberately does NOT
// assert any download action, export hook, filename, or Preparing/Download
// started/Export failed state: those are the change under construction, and
// characterizing them now would freeze a design that has not been accepted.
//
// What it protects is the ADJACENT working behavior the download feature must
// reuse and must not break:
//
//   A. The profile ownership/claim card on My Profile. The "Download my data"
//      action is inserted INSIDE this card and must be visible only to the
//      signed-in owner. The card's existing owner/non-owner gating is the seam
//      that decides that visibility, so it is pinned here: an owner sees the
//      owner affordances, and a non-owner viewing a claimed profile sees the
//      owned-by-another message and no owner-only action.
//   B. The Family Steward hub. The "Download family archive" card is inserted
//      into this hub and must be visible only to an active Steward. The hub's
//      existing Steward gate (grid for a Steward, unauthorized state for a
//      non-Steward) and its existing option cards are pinned here so the new
//      card cannot displace or weaken them.
//   C. The existing ephemeral client-side download helper. The export download
//      reuses the same Blob + URL.createObjectURL + anchor.download + click +
//      URL.revokeObjectURL pattern already used by the archive "Download
//      Original" action. That pattern is pinned here so the export download can
//      reuse it without a regression in the existing archive download.
//
// This is component/integration coverage through the real React components with
// a typed local actor mock. It does NOT exercise the real canister: the PocketIC
// lane is the only place backend runtime behavior is observed, and it is
// recorded in the episode's coverageLimits. The frontend suite mocks the actor,
// so no backend runtime behavior is visible here.
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const OWNER = "rrkah-fqaaa-aaaaa-aaaaq-cai";
const OTHER_USER = "rno2w-sqaaa-aaaaa-aaacq-cai";

const {
  mockActor,
  resetState,
  setAuthenticated,
  setSteward,
  setCurrentPrincipal,
  getAuthenticated,
  getSteward,
  getCurrentPrincipal,
  seedProfile,
  seedApprovedArchive,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isSteward = false;
  let currentPrincipal = "aaaaa-aa";
  let profiles: Record<string, PersonProfile> = {};
  let archiveItems: ArchiveItem[] = [];
  let nextArchiveId = 0n;

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
      return (
        Object.values(profiles).find(
          (p) => p.claimedByUserId?.toString() === currentPrincipal,
        ) ?? null
      );
    },
    async getMyProfileClaim(): Promise<null> {
      return null;
    },
    async getPersonProfile(personId: string): Promise<PersonProfile | null> {
      return profiles[personId] ?? null;
    },
    async getPersonProfileForFamily(
      _familyId: string,
      personId: string,
    ): Promise<PersonProfile | null> {
      return profiles[personId] ?? null;
    },
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
    async listRecoveryRequestsForFamily() {
      return { __kind__: "ok", ok: [] };
    },
    async listApprovedArchiveItems(): Promise<ArchiveItem[]> {
      return archiveItems.filter(
        (i) => i.status === ArchiveItemStatus.Approved,
      );
    },
    async searchArchiveItems(): Promise<ArchiveItem[]> {
      return archiveItems.filter(
        (i) => i.status === ArchiveItemStatus.Approved,
      );
    },
  };

  return {
    mockActor,
    resetState: () => {
      isAuthenticated = false;
      isSteward = false;
      currentPrincipal = "aaaaa-aa";
      profiles = {};
      archiveItems = [];
      nextArchiveId = 0n;
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    setSteward: (v: boolean) => {
      isSteward = v;
    },
    setCurrentPrincipal: (p: string) => {
      currentPrincipal = p;
    },
    getAuthenticated: () => isAuthenticated,
    getSteward: () => isSteward,
    getCurrentPrincipal: () => currentPrincipal,
    seedProfile: (profile: PersonProfile) => {
      profiles = { ...profiles, [profile.personId]: profile };
    },
    seedApprovedArchive: (overrides: Partial<ArchiveItem> = {}) => {
      const item: ArchiveItem = {
        id: nextArchiveId++,
        title: "A family letter",
        description: "A letter from 1924.",
        itemType: ArchiveItemType.Document,
        blob: ExternalBlob.fromBytes(
          new Uint8Array([1, 2, 3]),
          "text/plain",
          "letter.txt",
        ),
        era: "1924",
        year: 1924n,
        tags: ["letters"],
        relatedMemberIds: ["julia"],
        relatedBranchId: "branch-1",
        sourceStatus: SourceStatus.Original,
        privacyLevel: PrivacyLevel.FamilyOnly,
        classification: ArchiveItemClassification.Standard,
        status: ArchiveItemStatus.Approved,
        createdAt: 1_700_000_000_000_000_000n,
        contributor: Principal.fromText("aaaaa-aa"),
        familyId: "norwood",
        ...overrides,
      };
      archiveItems = [...archiveItems, item];
      return item;
    },
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
  window.history.replaceState(null, "", "/");
});

beforeAll(() => {
  // jsdom does not implement URL.createObjectURL, which ExternalBlob.fromBytes
  // and the archive download helper rely on. Provide a deterministic stand-in.
  let counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${counter++}`);
  URL.revokeObjectURL = vi.fn();
});

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

function renderApp() {
  return renderWithClient(<App />);
}

function claimedProfile(
  personId: string,
  name: string,
  owner: string,
): PersonProfile {
  return {
    familyId: "norwood",
    personId,
    name,
    livingStatus: LivingStatus.Living,
    claimStatus: ClaimStatus.Claimed,
    claimedByUserId: Principal.fromText(owner),
    preferredName: undefined,
    story: undefined,
    occupation: undefined,
    birthInfo: undefined,
    timeline: undefined,
    privacySettings: undefined,
  };
}

/** Opens a person's profile page through the Explore Family gate. */
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

// ---------------------------------------------------------------------------
// A. The profile ownership/claim card keeps its owner/non-owner gating.
//
// The "Download my data" action is inserted inside this card and is visible
// only to the signed-in owner. These assertions pin the existing gating the
// new action must respect: the owner sees the owner affordances, and a
// non-owner viewing a claimed profile sees the owned-by-another message and no
// owner-only action.
// ---------------------------------------------------------------------------

describe("profile ownership/claim card gating (characterization)", () => {
  it("shows the owner affordances to the signed-in owner of a claimed profile", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    // The signed-in caller must hold an approved claim to pass the Explore
    // Family gate and reach the profile page.
    seedProfile(claimedProfile("self", "Self Norwood", OWNER));
    seedProfile(claimedProfile("clayton", "Clayton Norwood", OWNER));
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

  it("shows no owner-only action to a non-owner viewing a claimed profile", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(OTHER_USER);
    // The signed-in caller holds an approved claim (to pass the Explore Family
    // gate) but does NOT own Clayton's profile.
    seedProfile(claimedProfile("self", "Self Norwood", OTHER_USER));
    seedProfile(claimedProfile("clayton", "Clayton Norwood", OWNER));
    const user = userEvent.setup();
    renderApp();

    await openProfile(user, /Clayton Norwood/);

    const claimSection = screen.getByTestId("profile.claim_section");
    expect(
      within(claimSection).getByText(
        "This profile is owned by a family member.",
      ),
    ).toBeInTheDocument();
    // A non-owner must never see the owner-only edit affordance.
    expect(
      within(claimSection).queryByRole("button", { name: "Edit My Profile" }),
    ).not.toBeInTheDocument();
    expect(
      within(claimSection).queryByText(
        "You own this profile. You can edit your personal details.",
      ),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// B. The Family Steward hub keeps its Steward gate and existing option cards.
//
// The "Download family archive" card is inserted into this hub and is visible
// only to an active Steward. These assertions pin the existing gate and the
// existing cards so the new card cannot displace or weaken them.
// ---------------------------------------------------------------------------

interface HubHandlers {
  onBack: ReturnType<typeof vi.fn>;
  onOpenReview: ReturnType<typeof vi.fn>;
  onOpenPendingContributions: ReturnType<typeof vi.fn>;
  onOpenGovernance: ReturnType<typeof vi.fn>;
  onOpenResearchIntake: ReturnType<typeof vi.fn>;
  onOpenHiddenPosts: ReturnType<typeof vi.fn>;
  onOpenMembershipReviews: ReturnType<typeof vi.fn>;
  onOpenRecoveryReviews: ReturnType<typeof vi.fn>;
}

function renderHub(): HubHandlers {
  const handlers: HubHandlers = {
    onBack: vi.fn(),
    onOpenReview: vi.fn(),
    onOpenPendingContributions: vi.fn(),
    onOpenGovernance: vi.fn(),
    onOpenResearchIntake: vi.fn(),
    onOpenHiddenPosts: vi.fn(),
    onOpenMembershipReviews: vi.fn(),
    onOpenRecoveryReviews: vi.fn(),
  };
  renderWithClient(<FamilyStewardHubPage {...handlers} />);
  return handlers;
}

describe("Family Steward hub gating and existing cards (characterization)", () => {
  it("renders the hub grid with its existing option cards for an active Steward", async () => {
    setAuthenticated(true);
    setSteward(true);
    renderHub();

    expect(await screen.findByTestId("steward_hub.grid")).toBeInTheDocument();
    for (const ocid of [
      "steward_hub.research_intake_option",
      "steward_hub.review_option",
      "steward_hub.membership_reviews_option",
      "steward_hub.recovery_reviews_option",
      "steward_hub.pending_option",
      "steward_hub.governance_option",
      "steward_hub.stewards_option",
      "steward_hub.duplicates_option",
      "steward_hub.relationships_option",
      "steward_hub.archived_option",
      "steward_hub.audit_option",
      "steward_hub.reported_option",
      "steward_hub.hidden_posts_option",
    ]) {
      expect(screen.getByTestId(ocid)).toBeInTheDocument();
    }
  });

  it("renders the unauthorized state and no hub grid for a non-Steward", async () => {
    setAuthenticated(true);
    setSteward(false);
    renderHub();

    expect(
      await screen.findByTestId("steward_hub.unauthorized_state"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("steward_hub.grid")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// C. The existing ephemeral client-side download helper is preserved.
//
// The export download reuses the same Blob + URL.createObjectURL +
// anchor.download + click + URL.revokeObjectURL pattern already used by the
// archive "Download Original" action. This pins that pattern so the export
// download can reuse it without regressing the existing archive download.
// ---------------------------------------------------------------------------

describe("existing client-side download helper (characterization)", () => {
  it("downloads an archive document through an ephemeral object URL", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    seedProfile(claimedProfile("self", "Self Norwood", OWNER));
    seedApprovedArchive({
      title: "A family letter",
      itemType: ArchiveItemType.Document,
    });

    const createObjectURL = vi.mocked(URL.createObjectURL);
    const revokeObjectURL = vi.mocked(URL.revokeObjectURL);
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();

    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "Family Archive" }));
    await screen.findByRole("heading", { name: "Our Family Archive" });
    await user.click(screen.getByRole("button", { name: /A family letter/ }));

    const download = await screen.findByRole("button", {
      name: "Download Original",
    });
    await user.click(download);

    // The download is ephemeral: an object URL is created for the bytes and
    // revoked once the anchor has been clicked, so nothing is persisted.
    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledTimes(1);
    });
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith(
      createObjectURL.mock.results[0]?.value,
    );
  });
});
