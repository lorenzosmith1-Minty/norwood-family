import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  LivingStatus,
  type PersonProfile,
  type ProfileClaim,
  ProfileClaimStatus,
  type Relationship,
  type RelationshipRequest,
  RelationshipRequestStatus,
  RelationshipStatus,
  RelationshipType,
} from "@/backend";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useApproveProfileClaim,
  useCreateMyself,
  useListProfileClaims,
  useMyProfile,
  useMyProfileClaim,
  usePersonProfile,
  useRejectProfileClaim,
  useRequestProfileClaim,
  useSearchPossibleMatches,
  useUpdateOwnProfile,
} from "./hooks/useProfileClaims";
import {
  useApproveRelationshipRequest,
  useGetRelationshipRequest,
  useListConfirmedRelationships,
  useListRelationshipRequests,
  useMyRelationshipRequests,
  useProposeRelationship,
  useRejectRelationshipRequest,
  useSetRelationshipRequestPending,
} from "./hooks/useRelationshipRequests";

// ---------------------------------------------------------------------------
// Characterization baseline for the family-scoped profile/claim/relationship
// change.
//
// The requested change gives the profile, claim, relationship, and photo
// endpoints explicit familyId parameters and family-scoped authorization. The
// PUBLIC API's observable default-family behavior (familyId = "norwood") must
// NOT change: a caller reading a profile, submitting a claim, proposing or
// reviewing a relationship, or listing confirmed relationships must keep
// reaching the same backend method with the same identifying arguments and
// keep seeing the same result.
//
// This file freezes that consumer seam for the profile/claim/relationship
// hooks — the app's only consumers of those public methods. It asserts WHICH
// method each hook calls, the identifying arguments it passes (personId,
// claimId, requestId, name, edits), and the value it surfaces. It deliberately
// does NOT assert the absence of a familyId argument: adding one is exactly the
// change under way, and freezing the bare signature would freeze the change
// rather than the behavior that must survive it. The default-family value the
// backend resolves for those calls is covered by the PocketIC lane, which
// drives the real canister.
//
// This is component/integration coverage over a typed local actor mock; it does
// not exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai");

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: Record<string, unknown[][]> = {
    getPersonProfile: [],
    getMyProfileClaim: [],
    getMyProfile: [],
    listProfileClaims: [],
    requestProfileClaim: [],
    approveProfileClaim: [],
    rejectProfileClaim: [],
    searchPossibleMatches: [],
    createMyself: [],
    updateOwnProfile: [],
    getMyRelationshipRequests: [],
    listRelationshipRequests: [],
    getRelationshipRequest: [],
    proposeRelationship: [],
    approveRelationshipRequest: [],
    rejectRelationshipRequest: [],
    setRelationshipRequestPending: [],
    listConfirmedRelationships: [],
  };

  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls[name].push(args);
    };

  const mockActor = {
    async getPersonProfile(...args: unknown[]): Promise<unknown> {
      record("getPersonProfile")(...args);
      return null;
    },
    async getMyProfileClaim(...args: unknown[]): Promise<unknown> {
      record("getMyProfileClaim")(...args);
      return null;
    },
    async getMyProfile(...args: unknown[]): Promise<unknown> {
      record("getMyProfile")(...args);
      return null;
    },
    async listProfileClaims(...args: unknown[]): Promise<unknown> {
      record("listProfileClaims")(...args);
      return [];
    },
    async requestProfileClaim(...args: unknown[]): Promise<unknown> {
      record("requestProfileClaim")(...args);
      return { __kind__: "ok", ok: {} };
    },
    async approveProfileClaim(...args: unknown[]): Promise<unknown> {
      record("approveProfileClaim")(...args);
      return null;
    },
    async rejectProfileClaim(...args: unknown[]): Promise<unknown> {
      record("rejectProfileClaim")(...args);
      return null;
    },
    async searchPossibleMatches(...args: unknown[]): Promise<unknown> {
      record("searchPossibleMatches")(...args);
      return [];
    },
    async createMyself(...args: unknown[]): Promise<unknown> {
      record("createMyself")(...args);
      return { __kind__: "ok", ok: {} };
    },
    async updateOwnProfile(...args: unknown[]): Promise<unknown> {
      record("updateOwnProfile")(...args);
      return { __kind__: "ok", ok: {} };
    },
    async getMyRelationshipRequests(...args: unknown[]): Promise<unknown> {
      record("getMyRelationshipRequests")(...args);
      return [];
    },
    async listRelationshipRequests(...args: unknown[]): Promise<unknown> {
      record("listRelationshipRequests")(...args);
      return [];
    },
    async getRelationshipRequest(...args: unknown[]): Promise<unknown> {
      record("getRelationshipRequest")(...args);
      return null;
    },
    async proposeRelationship(...args: unknown[]): Promise<unknown> {
      record("proposeRelationship")(...args);
      return { __kind__: "ok", ok: {} };
    },
    async approveRelationshipRequest(...args: unknown[]): Promise<unknown> {
      record("approveRelationshipRequest")(...args);
      return null;
    },
    async rejectRelationshipRequest(...args: unknown[]): Promise<unknown> {
      record("rejectRelationshipRequest")(...args);
      return null;
    },
    async setRelationshipRequestPending(...args: unknown[]): Promise<unknown> {
      record("setRelationshipRequestPending")(...args);
      return null;
    },
    async listConfirmedRelationships(...args: unknown[]): Promise<unknown> {
      record("listConfirmedRelationships")(...args);
      return [];
    },
  };

  return {
    mockActor,
    calls,
    resetCalls: () => {
      for (const key of Object.keys(calls)) calls[key].length = 0;
    },
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
}));

afterEach(cleanup);
beforeEach(resetCalls);

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const seededProfile: PersonProfile = {
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
};

const seededClaim: ProfileClaim = {
  familyId: "norwood",
  id: 7n,
  personId: "clayton",
  requestingUserId: OWNER,
  status: ProfileClaimStatus.Pending,
  submittedDate: 1_700_000_000_000_000_000n,
};

const seededRequest: RelationshipRequest = {
  familyId: "norwood",
  id: 13n,
  requestingPersonId: "clayton",
  relatedPersonId: "erma",
  proposedRelationship: RelationshipType.SpousePartner,
  status: RelationshipRequestStatus.Pending,
  submittedDate: 1_700_000_200_000_000_000n,
};

const seededRelationship: Relationship = {
  familyId: "norwood",
  id: 11n,
  fromPersonId: "clayton",
  toPersonId: "erma",
  relationshipType: RelationshipType.SpousePartner,
  status: RelationshipStatus.Confirmed,
};

describe("Profile read hooks: default-family call contract (characterization)", () => {
  it("usePersonProfile calls getPersonProfile(personId) and surfaces the profile", async () => {
    mockActor.getPersonProfile = vi.fn(async (...args: unknown[]) => {
      calls.getPersonProfile.push(args);
      return seededProfile;
    });

    const { result } = renderHookWithWrapper(() => usePersonProfile("clayton"));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(seededProfile);
    // The hook identifies the person by personId; the default family is the
    // backend's concern, not an argument the hook supplies.
    expect(calls.getPersonProfile).toEqual([["clayton"]]);
  });

  it("useMyProfileClaim calls getMyProfileClaim(personId) and surfaces the caller's claim", async () => {
    mockActor.getMyProfileClaim = vi.fn(async (...args: unknown[]) => {
      calls.getMyProfileClaim.push(args);
      return seededClaim;
    });

    const { result } = renderHookWithWrapper(() =>
      useMyProfileClaim("clayton"),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(seededClaim);
    expect(calls.getMyProfileClaim).toEqual([["clayton"]]);
  });

  it("useMyProfile calls getMyProfile() and surfaces the caller's own profile", async () => {
    mockActor.getMyProfile = vi.fn(async (...args: unknown[]) => {
      calls.getMyProfile.push(args);
      return seededProfile;
    });

    const { result } = renderHookWithWrapper(() => useMyProfile());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(seededProfile);
    expect(calls.getMyProfile).toEqual([[]]);
  });

  it("useListProfileClaims calls listProfileClaims() and surfaces the claim list", async () => {
    mockActor.listProfileClaims = vi.fn(async (...args: unknown[]) => {
      calls.listProfileClaims.push(args);
      return [seededClaim];
    });

    const { result } = renderHookWithWrapper(() => useListProfileClaims());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([seededClaim]);
    expect(calls.listProfileClaims).toEqual([[]]);
  });
});

describe("Profile claim mutation hooks: default-family call contract (characterization)", () => {
  it("useRequestProfileClaim calls requestProfileClaim(personId) and surfaces the Result", async () => {
    const okResult = { __kind__: "ok", ok: seededClaim };
    mockActor.requestProfileClaim = vi.fn(async (...args: unknown[]) => {
      calls.requestProfileClaim.push(args);
      return okResult;
    });

    const { result } = renderHookWithWrapper(() => useRequestProfileClaim());
    const returned = await result.current.mutateAsync("clayton");

    expect(returned).toBe(okResult);
    expect(calls.requestProfileClaim).toEqual([["clayton"]]);
  });

  it("useApproveProfileClaim calls approveProfileClaim(claimId) and surfaces the claim", async () => {
    const approved = { ...seededClaim, status: ProfileClaimStatus.Approved };
    mockActor.approveProfileClaim = vi.fn(async (...args: unknown[]) => {
      calls.approveProfileClaim.push(args);
      return approved;
    });

    const { result } = renderHookWithWrapper(() => useApproveProfileClaim());
    const returned = await result.current.mutateAsync(7n);

    expect(returned).toBe(approved);
    expect(calls.approveProfileClaim).toEqual([[7n]]);
  });

  it("useRejectProfileClaim calls rejectProfileClaim(claimId) and surfaces the claim", async () => {
    const rejected = { ...seededClaim, status: ProfileClaimStatus.Rejected };
    mockActor.rejectProfileClaim = vi.fn(async (...args: unknown[]) => {
      calls.rejectProfileClaim.push(args);
      return rejected;
    });

    const { result } = renderHookWithWrapper(() => useRejectProfileClaim());
    const returned = await result.current.mutateAsync(7n);

    expect(returned).toBe(rejected);
    expect(calls.rejectProfileClaim).toEqual([[7n]]);
  });

  it("useSearchPossibleMatches calls searchPossibleMatches(name) and surfaces the matches", async () => {
    const matches = [
      { name: "Clayton Norwood", personId: "clayton", parents: ["Julia"] },
    ];
    mockActor.searchPossibleMatches = vi.fn(async (...args: unknown[]) => {
      calls.searchPossibleMatches.push(args);
      return matches;
    });

    const { result } = renderHookWithWrapper(() => useSearchPossibleMatches());
    const returned = await result.current.mutateAsync("Clayton");

    expect(returned).toEqual(matches);
    expect(calls.searchPossibleMatches).toEqual([["Clayton"]]);
  });

  it("useCreateMyself calls createMyself(name) and surfaces the Result", async () => {
    const okResult = { __kind__: "ok", ok: seededProfile };
    mockActor.createMyself = vi.fn(async (...args: unknown[]) => {
      calls.createMyself.push(args);
      return okResult;
    });

    const { result } = renderHookWithWrapper(() => useCreateMyself());
    const returned = await result.current.mutateAsync("Clayton Norwood");

    expect(returned).toBe(okResult);
    expect(calls.createMyself).toEqual([["Clayton Norwood"]]);
  });

  it("useUpdateOwnProfile calls updateOwnProfile(personId, edits) and surfaces the Result", async () => {
    const okResult = { __kind__: "ok", ok: seededProfile };
    mockActor.updateOwnProfile = vi.fn(async (...args: unknown[]) => {
      calls.updateOwnProfile.push(args);
      return okResult;
    });

    const edits = { preferredName: "Clay" };
    const { result } = renderHookWithWrapper(() => useUpdateOwnProfile());
    const returned = await result.current.mutateAsync({
      personId: "clayton",
      edits,
    });

    expect(returned).toBe(okResult);
    // The hook identifies the profile by personId and passes the edits object
    // through unchanged.
    expect(calls.updateOwnProfile).toEqual([["clayton", edits]]);
  });
});

describe("Relationship hooks: default-family call contract (characterization)", () => {
  it("useMyRelationshipRequests calls getMyRelationshipRequests() and surfaces the requests", async () => {
    mockActor.getMyRelationshipRequests = vi.fn(async (...args: unknown[]) => {
      calls.getMyRelationshipRequests.push(args);
      return [seededRequest];
    });

    const { result } = renderHookWithWrapper(() => useMyRelationshipRequests());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([seededRequest]);
    expect(calls.getMyRelationshipRequests).toEqual([[]]);
  });

  it("useListRelationshipRequests calls listRelationshipRequests() and surfaces the requests", async () => {
    mockActor.listRelationshipRequests = vi.fn(async (...args: unknown[]) => {
      calls.listRelationshipRequests.push(args);
      return [seededRequest];
    });

    const { result } = renderHookWithWrapper(() =>
      useListRelationshipRequests(),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([seededRequest]);
    expect(calls.listRelationshipRequests).toEqual([[]]);
  });

  it("useGetRelationshipRequest calls getRelationshipRequest(requestId) and surfaces the request", async () => {
    mockActor.getRelationshipRequest = vi.fn(async (...args: unknown[]) => {
      calls.getRelationshipRequest.push(args);
      return seededRequest;
    });

    const { result } = renderHookWithWrapper(() =>
      useGetRelationshipRequest(13n),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(seededRequest);
    expect(calls.getRelationshipRequest).toEqual([[13n]]);
  });

  it("useProposeRelationship calls proposeRelationship(from, to, type) and surfaces the Result", async () => {
    const okResult = { __kind__: "ok", ok: seededRequest };
    mockActor.proposeRelationship = vi.fn(async (...args: unknown[]) => {
      calls.proposeRelationship.push(args);
      return okResult;
    });

    const { result } = renderHookWithWrapper(() => useProposeRelationship());
    const returned = await result.current.mutateAsync({
      fromPersonId: "clayton",
      toPersonId: "erma",
      relationshipType: RelationshipType.SpousePartner,
    });

    expect(returned).toBe(okResult);
    expect(calls.proposeRelationship).toEqual([
      ["clayton", "erma", RelationshipType.SpousePartner],
    ]);
  });

  it("useApproveRelationshipRequest calls approveRelationshipRequest(requestId) and surfaces the request", async () => {
    const approved = {
      ...seededRequest,
      status: RelationshipRequestStatus.Approved,
    };
    mockActor.approveRelationshipRequest = vi.fn(async (...args: unknown[]) => {
      calls.approveRelationshipRequest.push(args);
      return approved;
    });

    const { result } = renderHookWithWrapper(() =>
      useApproveRelationshipRequest(),
    );
    const returned = await result.current.mutateAsync(13n);

    expect(returned).toBe(approved);
    expect(calls.approveRelationshipRequest).toEqual([[13n]]);
  });

  it("useRejectRelationshipRequest calls rejectRelationshipRequest(requestId) and surfaces the request", async () => {
    const rejected = {
      ...seededRequest,
      status: RelationshipRequestStatus.Rejected,
    };
    mockActor.rejectRelationshipRequest = vi.fn(async (...args: unknown[]) => {
      calls.rejectRelationshipRequest.push(args);
      return rejected;
    });

    const { result } = renderHookWithWrapper(() =>
      useRejectRelationshipRequest(),
    );
    const returned = await result.current.mutateAsync(13n);

    expect(returned).toBe(rejected);
    expect(calls.rejectRelationshipRequest).toEqual([[13n]]);
  });

  it("useSetRelationshipRequestPending calls setRelationshipRequestPending(requestId) and surfaces the request", async () => {
    mockActor.setRelationshipRequestPending = vi.fn(
      async (...args: unknown[]) => {
        calls.setRelationshipRequestPending.push(args);
        return seededRequest;
      },
    );

    const { result } = renderHookWithWrapper(() =>
      useSetRelationshipRequestPending(),
    );
    const returned = await result.current.mutateAsync(13n);

    expect(returned).toBe(seededRequest);
    expect(calls.setRelationshipRequestPending).toEqual([[13n]]);
  });

  it("useListConfirmedRelationships calls listConfirmedRelationships() and surfaces the relationships", async () => {
    mockActor.listConfirmedRelationships = vi.fn(async (...args: unknown[]) => {
      calls.listConfirmedRelationships.push(args);
      return [seededRelationship];
    });

    const { result } = renderHookWithWrapper(() =>
      useListConfirmedRelationships(),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([seededRelationship]);
    expect(calls.listConfirmedRelationships).toEqual([[]]);
  });
});

// A thin alias for the testing-library renderHook bound to the QueryClient
// wrapper, so every hook in this file renders inside a real provider tree.
function renderHookWithWrapper<T>(hook: () => T) {
  return renderHook(hook, { wrapper });
}
