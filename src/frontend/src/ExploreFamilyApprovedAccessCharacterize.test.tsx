import "@testing-library/jest-dom/vitest";
import {
  type ArchiveItem,
  ArchiveItemClassification,
  ArchiveItemStatus,
  ArchiveItemType,
  ClaimStatus,
  LivingStatus,
  type Notification,
  type PersonProfile,
  PrivacyLevel,
  type ProfileClaim,
  type Relationship,
  SourceStatus,
} from "@/backend";
import { ExternalBlob } from "@caffeineai/object-storage";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
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

// Characterization baseline for the approved-family-access gating change.
//
// The upcoming build gates Explore Family and Heritage Branch behind approved
// family access (guests without an approved claim see a no-access state instead
// of the family graph) and enforces archive privacy levels server-side. Those
// are the behaviors being changed, so the guest-sees-graph and
// all-approved-items-returned behaviors are deliberately NOT frozen here.
//
// What IS frozen is the approved-member path that must survive both changes:
//
//  1. A signed-in approved member (a caller whose getMyProfile resolves a
//     CLAIMED profile) still sees the full Explore Family graph.
//  2. That same approved member still sees the Heritage Branch overview.
//  3. That same approved member still sees approved archive items in the
//     Family Archive browse view.
//
// The generated components use data-ocid for test ids.
const OWNER = "rrkah-fqaaa-aaaaa-aaaaq-cai";

const {
  mockActor,
  resetState,
  setAuthenticated,
  setCurrentPrincipal,
  getAuthenticated,
  getCurrentPrincipal,
  seedProfile,
  seedApprovedItem,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let currentPrincipal = "aaaaa-aa";
  let profiles: Record<string, PersonProfile> = {};
  let approvedItems: ArchiveItem[] = [];

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return false;
    },
    async getPersonProfile(personId: string): Promise<PersonProfile | null> {
      return profiles[personId] ?? null;
    },
    async getMyProfile(): Promise<PersonProfile | null> {
      const owned = Object.values(profiles).find(
        (p) => p.claimedByUserId?.toString() === currentPrincipal,
      );
      return owned ?? null;
    },
    async getMyProfileClaim(_personId: string): Promise<ProfileClaim | null> {
      return null;
    },
    async listConfirmedRelationships(): Promise<Relationship[]> {
      return [];
    },
    async listNotifications(): Promise<Notification[]> {
      return [];
    },
    async listArchivedProfileIds(): Promise<string[]> {
      return [];
    },
    async listApprovedArchiveItems(): Promise<ArchiveItem[]> {
      return approvedItems;
    },
    async searchArchiveItems(filter: {
      searchTerm: [] | [string] | undefined;
      tags: string[];
      itemType: [] | [ArchiveItemType] | undefined;
      relatedMemberId: [] | [string] | undefined;
      era: [] | [string] | undefined;
    }): Promise<ArchiveItem[]> {
      const query = ((filter.searchTerm ?? [])[0] ?? "").toLowerCase();
      const tags = filter.tags.map((t) => t.toLowerCase());
      return approvedItems.filter(
        (i) =>
          (query === "" || i.title.toLowerCase().includes(query)) &&
          (tags.length === 0 ||
            tags.every((t) =>
              i.tags.some((tag) => tag.toLowerCase().includes(t)),
            )),
      );
    },
  };

  return {
    mockActor,
    resetState: () => {
      isAuthenticated = false;
      currentPrincipal = "aaaaa-aa";
      profiles = {};
      approvedItems = [];
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    setCurrentPrincipal: (p: string) => {
      currentPrincipal = p;
    },
    getAuthenticated: () => isAuthenticated,
    getCurrentPrincipal: () => currentPrincipal,
    seedProfile: (profile: PersonProfile) => {
      profiles = { ...profiles, [profile.personId]: profile };
    },
    seedApprovedItem: (overrides: Partial<ArchiveItem> = {}) => {
      const item: ArchiveItem = {
        familyId: "norwood",
        id: BigInt(approvedItems.length),
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
        ...overrides,
      };
      approvedItems = [...approvedItems, item];
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

afterEach(cleanup);
beforeAll(() => {
  // jsdom does not implement URL.createObjectURL, which ExternalBlob.fromBytes
  // relies on when constructing a blob. Provide a deterministic stand-in.
  let counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${counter++}`);
});
beforeEach(() => {
  resetState();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
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

// Seed a CLAIMED living profile owned by the signed-in caller, so getMyProfile
// resolves an approved/owned profile — the approved-family-access signal.
function seedApprovedMember(personId: string, name: string) {
  const profile: PersonProfile = {
    familyId: "norwood",
    personId,
    name,
    livingStatus: LivingStatus.Living,
    claimStatus: ClaimStatus.Claimed,
    claimedByUserId: Principal.fromText(OWNER),
    preferredName: undefined,
    story: undefined,
    occupation: undefined,
    birthInfo: undefined,
    timeline: undefined,
    privacySettings: undefined,
  };
  seedProfile(profile);
}

async function openExploreFamily(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Explore the Family" }));
}

async function openHeritageBranch(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Heritage Branch" }));
}

async function openArchive(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Family Archive" }));
  await screen.findByRole("heading", { name: "Our Family Archive" });
}

describe("Approved family member access characterization", () => {
  it("shows the full Explore Family graph to an approved member", async () => {
    seedApprovedMember("clayton", "Clayton Norwood");
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    const user = userEvent.setup();
    renderApp();

    await openExploreFamily(user);

    // The founding couple renders as the default focus.
    expect(screen.getByText("Julia “Julie” Norwood")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Isaiah Norwood Spouse/ }),
    ).toBeInTheDocument();

    // The founding couple's children render as navigable child cards.
    for (const name of [
      "Clayton Norwood Child",
      "isaiah-jr Child",
      "edward Child",
      "hattie Child",
      "pinkie Child",
      "louise Child",
      "lillie Child",
      "lula-e Child",
    ]) {
      expect(
        screen.getByRole("button", { name: new RegExp(name) }),
      ).toBeInTheDocument();
    }
  });

  it("shows the Heritage Branch overview to an approved member", async () => {
    seedApprovedMember("clayton", "Clayton Norwood");
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    const user = userEvent.setup();
    renderApp();

    await openHeritageBranch(user);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Heritage Branch View",
    );
    for (const title of [
      "Founding Couple",
      "Lula Mae + Versie Family Unit",
      "Clayton Branch",
      "Smith Branch",
      "Versie's Maternal / Adams Line",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
  });

  it("shows approved archive items in the browse view to an approved member", async () => {
    seedApprovedMember("clayton", "Clayton Norwood");
    seedApprovedItem({
      title: "Wedding portrait",
      itemType: ArchiveItemType.Photo,
    });
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    const user = userEvent.setup();
    renderApp();

    await openArchive(user);

    const list = screen.getByRole("list");
    expect(within(list).getByText("Wedding portrait")).toBeInTheDocument();
  });
});
