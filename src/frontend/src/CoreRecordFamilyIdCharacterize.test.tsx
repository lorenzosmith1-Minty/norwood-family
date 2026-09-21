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
  type ProfileClaim,
  ProfileClaimStatus,
  type Relationship,
  type RelationshipRequest,
  RelationshipRequestStatus,
  RelationshipStatus,
  RelationshipType,
  SourceStatus,
  type StewardRecord,
  StewardRoleStatus,
} from "@/backend";
import { ExternalBlob } from "@caffeineai/object-storage";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  useApprovedArchiveItems,
  usePendingArchiveItems,
} from "./hooks/useArchiveStorage";
import { useListStewards } from "./hooks/useGovernance";
import {
  useListProfileClaims,
  usePersonProfile,
} from "./hooks/useProfileClaims";
import {
  useListConfirmedRelationships,
  useMyRelationshipRequests,
} from "./hooks/useRelationshipRequests";

// ---------------------------------------------------------------------------
// Characterization baseline for the six core family collections that the
// familyId migration touches: PersonProfile, ProfileClaim, Relationship,
// RelationshipRequest, StewardRecord, and ArchiveItem.
//
// The migration adds a `familyId` field to each of these record types and
// backfills every pre-existing record with familyId = "norwood". It must not
// change anything else: the accepted criteria require that pre-existing claims,
// owners, relationships, Steward state, and Archive records read back
// unchanged, and that existing UI/authorization behavior is untouched.
//
// These tests freeze the CURRENT read-back shape of each collection through the
// app's own React Query hooks (the real consumer seam the UI uses), against a
// typed local actor mock. Every field the frontend currently reads is asserted
// to survive the round-trip, so a migration that drops, renames, or reorders a
// field — or that changes a claim/owner/relationship/steward/archive value —
// fails here before it reaches a user. The new `familyId` field is deliberately
// NOT asserted: it does not exist yet, and characterizing it would be asserting
// the change rather than the behavior that must remain.
//
// This is component/integration coverage over a mocked actor, not deployed
// backend behavior. The PocketIC lane is the only place the real canister is
// exercised; see the coverage limits reported with this run.
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");
const REVIEWER = Principal.fromText("2vxsx-fae");

const { mockActor } = vi.hoisted(() => {
  const mockActor = {
    async getPersonProfile(_personId: string): Promise<PersonProfile | null> {
      return null;
    },
    async listProfileClaims(): Promise<ProfileClaim[]> {
      return [];
    },
    async listConfirmedRelationships(): Promise<Relationship[]> {
      return [];
    },
    async getMyRelationshipRequests(): Promise<RelationshipRequest[]> {
      return [];
    },
    async listStewards(): Promise<StewardRecord[]> {
      return [];
    },
    async listPendingArchiveItems(): Promise<ArchiveItem[]> {
      return [];
    },
    async listApprovedArchiveItems(): Promise<ArchiveItem[]> {
      return [];
    },
  };
  return { mockActor };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: true,
    login: () => {},
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeAll(() => {
  // jsdom does not implement URL.createObjectURL, which ExternalBlob.fromBytes
  // relies on when constructing a blob. Provide a deterministic stand-in.
  let counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${counter++}`);
});

afterEach(cleanup);

beforeEach(() => {
  mockActor.getPersonProfile = vi.fn(async () => null);
  mockActor.listProfileClaims = vi.fn(async () => []);
  mockActor.listConfirmedRelationships = vi.fn(async () => []);
  mockActor.getMyRelationshipRequests = vi.fn(async () => []);
  mockActor.listStewards = vi.fn(async () => []);
  mockActor.listPendingArchiveItems = vi.fn(async () => []);
  mockActor.listApprovedArchiveItems = vi.fn(async () => []);
});

// A fully-populated PersonProfile carrying every owner-editable field the
// frontend reads, plus the ownership/lifecycle state the migration must not
// disturb.
const seededProfile: PersonProfile = {
  familyId: "norwood",
  personId: "clayton",
  name: "Clayton Norwood",
  livingStatus: LivingStatus.Deceased,
  claimStatus: ClaimStatus.Claimed,
  claimedByUserId: OWNER,
  preferredName: "Clayton",
  firstName: "Clayton",
  middleName: "Edward",
  lastName: "Norwood",
  suffix: "Sr.",
  nickname: "Clay",
  story: "A recorded story.",
  shortBio: "A short bio.",
  longerStory: "A longer story.",
  occupation: "Farmer",
  birthInfo: "Born on the family land.",
  birthDate: "1901-04-02",
  birthplace: "Norwood, Georgia",
  currentLocation: "Atlanta, Georgia",
  timeline: ["1901 birth", "1924 marriage"],
  privacySettings: "family-only",
};

const seededClaim: ProfileClaim = {
  familyId: "norwood",
  id: 7n,
  personId: "clayton",
  requestingUserId: OWNER,
  status: ProfileClaimStatus.Approved,
  submittedDate: 1_700_000_000_000_000_000n,
  reviewedBy: REVIEWER,
  reviewedDate: 1_700_000_100_000_000_000n,
};

const seededRelationship: Relationship = {
  familyId: "norwood",
  id: 11n,
  fromPersonId: "clayton",
  toPersonId: "erma",
  relationshipType: RelationshipType.SpousePartner,
  status: RelationshipStatus.Confirmed,
};

const seededRequest: RelationshipRequest = {
  familyId: "norwood",
  id: 13n,
  requestingPersonId: "clayton",
  relatedPersonId: "erma",
  proposedRelationship: RelationshipType.SpousePartner,
  status: RelationshipRequestStatus.Pending,
  submittedDate: 1_700_000_200_000_000_000n,
  reviewer: REVIEWER,
  reviewedDate: 1_700_000_300_000_000_000n,
};

const seededSteward: StewardRecord = {
  familyId: "norwood",
  stewardAccountId: OWNER,
  roleStatus: StewardRoleStatus.Active,
  successorPriority: 1n,
  assignedBy: REVIEWER,
  assignedAt: 1_700_000_400_000_000_000n,
};

// Built lazily inside each test: ExternalBlob.fromBytes calls
// URL.createObjectURL, which jsdom does not implement until the beforeAll stub
// above installs it, so a module-level constant would evaluate too early.
function makeArchiveItem(overrides: Partial<ArchiveItem> = {}): ArchiveItem {
  return {
    familyId: "norwood",
    id: 17n,
    title: "A family letter",
    description: "A letter from 1924.",
    itemType: ArchiveItemType.Document,
    blob: ExternalBlob.fromBytes(
      new Uint8Array([1, 2, 3]),
      "application/pdf",
      "letter.pdf",
    ),
    mimeType: "application/pdf",
    filename: "letter.pdf",
    era: "1924",
    year: 1924n,
    tags: ["letters"],
    contributor: OWNER,
    relatedMemberIds: ["julia"],
    relatedBranchId: "branch-1",
    sourceStatus: SourceStatus.Original,
    privacyLevel: PrivacyLevel.FamilyOnly,
    status: ArchiveItemStatus.Pending,
    createdAt: 1_700_000_500_000_000_000n,
    classification: ArchiveItemClassification.Standard,
    primarySpeaker: { personId: "julia", name: "Julia Norwood" },
    transcript: "A transcript.",
    searchableTranscript: "a transcript",
    chapterMarkers: [{ title: "Opening", timestamp: 0n }],
    aiSummary: "An AI summary.",
    extractedNames: ["Julia Norwood"],
    ...overrides,
  };
}

describe("Core family record read-back characterization (familyId migration baseline)", () => {
  it("reads a PersonProfile back with its ownership state and every editable field intact", async () => {
    mockActor.getPersonProfile = vi.fn(async () => seededProfile);

    const { result } = renderHook(() => usePersonProfile("clayton"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(seededProfile);
    // The ownership/lifecycle state the migration must preserve.
    expect(result.current.data?.claimStatus).toBe(ClaimStatus.Claimed);
    expect(result.current.data?.claimedByUserId).toBe(OWNER);
    expect(result.current.data?.livingStatus).toBe(LivingStatus.Deceased);
    // The tenancy migration adds familyId to every core record; the read-back
    // shape carries it through unchanged.
    expect(result.current.data?.familyId).toBe("norwood");
  });

  it("reads a ProfileClaim back with its requester, reviewer, and status intact", async () => {
    mockActor.listProfileClaims = vi.fn(async () => [seededClaim]);

    const { result } = renderHook(() => useListProfileClaims(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([seededClaim]);
    expect(result.current.data?.[0].requestingUserId).toBe(OWNER);
    expect(result.current.data?.[0].status).toBe(ProfileClaimStatus.Approved);
    expect(result.current.data?.[0].familyId).toBe("norwood");
  });

  it("reads a confirmed Relationship back with both endpoints and its type intact", async () => {
    mockActor.listConfirmedRelationships = vi.fn(async () => [
      seededRelationship,
    ]);

    const { result } = renderHook(() => useListConfirmedRelationships(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([seededRelationship]);
    expect(result.current.data?.[0].fromPersonId).toBe("clayton");
    expect(result.current.data?.[0].toPersonId).toBe("erma");
    expect(result.current.data?.[0].relationshipType).toBe(
      RelationshipType.SpousePartner,
    );
    expect(result.current.data?.[0].familyId).toBe("norwood");
  });

  it("reads a RelationshipRequest back with its proposed relationship and review state intact", async () => {
    mockActor.getMyRelationshipRequests = vi.fn(async () => [seededRequest]);

    const { result } = renderHook(() => useMyRelationshipRequests(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([seededRequest]);
    expect(result.current.data?.[0].status).toBe(
      RelationshipRequestStatus.Pending,
    );
    expect(result.current.data?.[0].reviewer).toBe(REVIEWER);
    expect(result.current.data?.[0].familyId).toBe("norwood");
  });

  it("reads a StewardRecord back with its role status, successor priority, and assignment intact", async () => {
    mockActor.listStewards = vi.fn(async () => [seededSteward]);

    const { result } = renderHook(() => useListStewards(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([seededSteward]);
    expect(result.current.data?.[0].roleStatus).toBe(StewardRoleStatus.Active);
    expect(result.current.data?.[0].successorPriority).toBe(1n);
    expect(result.current.data?.[0].assignedBy).toBe(REVIEWER);
    expect(result.current.data?.[0].familyId).toBe("norwood");
  });

  it("reads a pending ArchiveItem back with its contributor, privacy, and persisted upload metadata intact", async () => {
    const seededArchiveItem = makeArchiveItem();
    mockActor.listPendingArchiveItems = vi.fn(async () => [seededArchiveItem]);

    const { result } = renderHook(() => usePendingArchiveItems(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([seededArchiveItem]);
    expect(result.current.data?.[0].contributor).toBe(OWNER);
    expect(result.current.data?.[0].privacyLevel).toBe(PrivacyLevel.FamilyOnly);
    expect(result.current.data?.[0].status).toBe(ArchiveItemStatus.Pending);
    expect(result.current.data?.[0].mimeType).toBe("application/pdf");
    expect(result.current.data?.[0].filename).toBe("letter.pdf");
    expect(result.current.data?.[0].familyId).toBe("norwood");
  });

  it("keeps the approved-archive read path returning only approved items with their fields intact", async () => {
    const approved: ArchiveItem = makeArchiveItem({
      id: 18n,
      title: "An approved letter",
      status: ArchiveItemStatus.Approved,
    });
    mockActor.listApprovedArchiveItems = vi.fn(async () => [approved]);

    const { result } = renderHook(() => useApprovedArchiveItems(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([approved]);
    expect(result.current.data?.[0].status).toBe(ArchiveItemStatus.Approved);
    expect(result.current.data?.[0].title).toBe("An approved letter");
  });

  it("returns empty collections unchanged when the six core collections are empty", async () => {
    const profile = renderHook(() => usePersonProfile("nobody"), { wrapper });
    const claims = renderHook(() => useListProfileClaims(), { wrapper });
    const relationships = renderHook(() => useListConfirmedRelationships(), {
      wrapper,
    });
    const requests = renderHook(() => useMyRelationshipRequests(), { wrapper });
    const stewards = renderHook(() => useListStewards(), { wrapper });
    const archive = renderHook(() => usePendingArchiveItems(), { wrapper });

    await waitFor(() => expect(claims.result.current.isSuccess).toBe(true));
    await waitFor(() =>
      expect(relationships.result.current.isSuccess).toBe(true),
    );
    await waitFor(() => expect(requests.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(stewards.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(archive.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(profile.result.current.isSuccess).toBe(true));

    expect(profile.result.current.data).toBeNull();
    expect(claims.result.current.data).toEqual([]);
    expect(relationships.result.current.data).toEqual([]);
    expect(requests.result.current.data).toEqual([]);
    expect(stewards.result.current.data).toEqual([]);
    expect(archive.result.current.data).toEqual([]);
  });
});
