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
import { DEFAULT_FAMILY_ID, FamilyProvider } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useApproveProfileClaim,
  useCreateMyself,
  useListProfileClaims,
  useMyProfile,
  useMyProfileClaim,
  usePersonClaimStatus,
  usePersonProfile,
  useRejectProfileClaim,
  useRequestProfileClaim,
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
// Characterization baseline for the family-exact Profile Claim / Relationship
// Request cache-invalidation change.
//
// The requested change replaces the bare cross-family invalidation prefixes in
// `hooks/useProfileClaims.ts` and `hooks/useRelationshipRequests.ts` for the
// seven key families `profileClaims`, `personProfile`, `myProfileClaim`,
// `myProfile`, `relationshipRequests`, `confirmedRelationships`, and
// `myRelationshipRequests` with family-exact filters built from the active
// `familyScopedId`. Before the change a bare prefix also matched every other
// family's family-appended key and marked it stale.
//
// This file deliberately does NOT freeze the bare-prefix invalidations: those
// are the defect being fixed, and pinning them would make the accepted change
// fail. It freezes the surrounding behavior the change must leave untouched:
//
//   1. Mutation call shapes: the default family keeps the legacy no-familyId
//      endpoint call, and a non-default family keeps the `*ForFamily` call with
//      the familyId as the first positional argument. The invalidation change
//      must not alter which endpoint a mutation calls or with which arguments.
//
//   2. Read query-key shapes: the default family keeps the legacy keys with a
//      `null` family slot and a non-default family keeps the family-appended
//      keys. The family-exact invalidation filters can only refresh the right
//      cache if these keys stay exactly as they are.
//
//   3. Family-scoped adjacent invalidation: the claim and relationship
//      mutations already route their Notification and Pending-Contributions
//      invalidation through `notificationInvalidation(familyScopedId)` and
//      `pendingContributionsCountInvalidation(familyScopedId)`. That
//      family-scoped behavior must remain: a Family A mutation refreshes Family
//      A's Notification and pending-count caches and leaves Family B's
//      untouched.
//
//   4. Family-exact photo invalidation in `useUpdateOwnProfile`: the photo and
//      profile-photo keys are already scoped to the edited person and family.
//      The change must not broaden them.
//
//   5. A mutation still invalidates its own claim/relationship cache: asserted
//      behaviorally against the exact read keys, without pinning the filter
//      shape, so the family-exact fix is free to change the filter while a
//      regression that drops the invalidation entirely still fails.
//
// This is component/integration coverage over a typed local actor mock; it does
// not exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");
const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    // Legacy no-familyId endpoints.
    getPersonProfile: unknown[][];
    getMyProfileClaim: unknown[][];
    getMyProfile: unknown[][];
    listProfileClaims: unknown[][];
    requestProfileClaim: unknown[][];
    approveProfileClaim: unknown[][];
    rejectProfileClaim: unknown[][];
    createMyself: unknown[][];
    updateOwnProfile: unknown[][];
    getMyRelationshipRequests: unknown[][];
    listRelationshipRequests: unknown[][];
    getRelationshipRequest: unknown[][];
    proposeRelationship: unknown[][];
    approveRelationshipRequest: unknown[][];
    rejectRelationshipRequest: unknown[][];
    setRelationshipRequestPending: unknown[][];
    listConfirmedRelationships: unknown[][];
    // Canonical family-scoped endpoints.
    getPersonProfileForFamily: unknown[][];
    getMyProfileClaimForFamily: unknown[][];
    getMyProfileForFamily: unknown[][];
    listProfileClaimsForFamily: unknown[][];
    requestProfileClaimForFamily: unknown[][];
    approveProfileClaimForFamily: unknown[][];
    rejectProfileClaimForFamily: unknown[][];
    createMyselfForFamily: unknown[][];
    updateOwnProfileForFamily: unknown[][];
    getMyRelationshipRequestsForFamily: unknown[][];
    listRelationshipRequestsForFamily: unknown[][];
    getRelationshipRequestForFamily: unknown[][];
    proposeRelationshipForFamily: unknown[][];
    approveRelationshipRequestForFamily: unknown[][];
    rejectRelationshipRequestForFamily: unknown[][];
    setRelationshipRequestPendingForFamily: unknown[][];
    listConfirmedRelationshipsForFamily: unknown[][];
  } = {
    getPersonProfile: [],
    getMyProfileClaim: [],
    getMyProfile: [],
    listProfileClaims: [],
    requestProfileClaim: [],
    approveProfileClaim: [],
    rejectProfileClaim: [],
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
    getPersonProfileForFamily: [],
    getMyProfileClaimForFamily: [],
    getMyProfileForFamily: [],
    listProfileClaimsForFamily: [],
    requestProfileClaimForFamily: [],
    approveProfileClaimForFamily: [],
    rejectProfileClaimForFamily: [],
    createMyselfForFamily: [],
    updateOwnProfileForFamily: [],
    getMyRelationshipRequestsForFamily: [],
    listRelationshipRequestsForFamily: [],
    getRelationshipRequestForFamily: [],
    proposeRelationshipForFamily: [],
    approveRelationshipRequestForFamily: [],
    rejectRelationshipRequestForFamily: [],
    setRelationshipRequestPendingForFamily: [],
    listConfirmedRelationshipsForFamily: [],
  };

  const record =
    (name: keyof typeof calls) =>
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
    async getPersonProfileForFamily(...args: unknown[]): Promise<unknown> {
      record("getPersonProfileForFamily")(...args);
      return null;
    },
    async getMyProfileClaimForFamily(...args: unknown[]): Promise<unknown> {
      record("getMyProfileClaimForFamily")(...args);
      return null;
    },
    async getMyProfileForFamily(...args: unknown[]): Promise<unknown> {
      record("getMyProfileForFamily")(...args);
      return null;
    },
    async listProfileClaimsForFamily(...args: unknown[]): Promise<unknown> {
      record("listProfileClaimsForFamily")(...args);
      return [];
    },
    async requestProfileClaimForFamily(...args: unknown[]): Promise<unknown> {
      record("requestProfileClaimForFamily")(...args);
      return { __kind__: "ok", ok: {} };
    },
    async approveProfileClaimForFamily(...args: unknown[]): Promise<unknown> {
      record("approveProfileClaimForFamily")(...args);
      return null;
    },
    async rejectProfileClaimForFamily(...args: unknown[]): Promise<unknown> {
      record("rejectProfileClaimForFamily")(...args);
      return null;
    },
    async createMyselfForFamily(...args: unknown[]): Promise<unknown> {
      record("createMyselfForFamily")(...args);
      return { __kind__: "ok", ok: {} };
    },
    async updateOwnProfileForFamily(...args: unknown[]): Promise<unknown> {
      record("updateOwnProfileForFamily")(...args);
      return { __kind__: "ok", ok: {} };
    },
    async getMyRelationshipRequestsForFamily(
      ...args: unknown[]
    ): Promise<unknown> {
      record("getMyRelationshipRequestsForFamily")(...args);
      return [];
    },
    async listRelationshipRequestsForFamily(
      ...args: unknown[]
    ): Promise<unknown> {
      record("listRelationshipRequestsForFamily")(...args);
      return [];
    },
    async getRelationshipRequestForFamily(
      ...args: unknown[]
    ): Promise<unknown> {
      record("getRelationshipRequestForFamily")(...args);
      return null;
    },
    async proposeRelationshipForFamily(...args: unknown[]): Promise<unknown> {
      record("proposeRelationshipForFamily")(...args);
      return { __kind__: "ok", ok: {} };
    },
    async approveRelationshipRequestForFamily(
      ...args: unknown[]
    ): Promise<unknown> {
      record("approveRelationshipRequestForFamily")(...args);
      return null;
    },
    async rejectRelationshipRequestForFamily(
      ...args: unknown[]
    ): Promise<unknown> {
      record("rejectRelationshipRequestForFamily")(...args);
      return null;
    },
    async setRelationshipRequestPendingForFamily(
      ...args: unknown[]
    ): Promise<unknown> {
      record("setRelationshipRequestPendingForFamily")(...args);
      return null;
    },
    async listConfirmedRelationshipsForFamily(
      ...args: unknown[]
    ): Promise<unknown> {
      record("listConfirmedRelationshipsForFamily")(...args);
      return [];
    },
  };

  return {
    mockActor,
    calls,
    resetCalls: () => {
      for (const key of Object.keys(calls) as Array<keyof typeof calls>) {
        calls[key].length = 0;
      }
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
beforeEach(resetCalls);

const seededProfile: PersonProfile = {
  familyId: DEFAULT_FAMILY_ID,
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
  familyId: DEFAULT_FAMILY_ID,
  id: 7n,
  personId: "clayton",
  requestingUserId: OWNER,
  status: ProfileClaimStatus.Pending,
  submittedDate: 1_700_000_000_000_000_000n,
};

const seededRequest: RelationshipRequest = {
  familyId: DEFAULT_FAMILY_ID,
  id: 13n,
  requestingPersonId: "clayton",
  relatedPersonId: "erma",
  proposedRelationship: RelationshipType.SpousePartner,
  status: RelationshipRequestStatus.Pending,
  submittedDate: 1_700_000_200_000_000_000n,
};

const seededRelationship: Relationship = {
  familyId: DEFAULT_FAMILY_ID,
  id: 11n,
  fromPersonId: "clayton",
  toPersonId: "erma",
  relationshipType: RelationshipType.SpousePartner,
  status: RelationshipStatus.Confirmed,
};

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrapperFor(queryClient: QueryClient, familyId?: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <FamilyProvider familyId={familyId}>{children}</FamilyProvider>
      </QueryClientProvider>
    );
  };
}

function isInvalidated(queryClient: QueryClient, key: unknown[]): boolean {
  return queryClient.getQueryState(key)?.isInvalidated === true;
}

// ---------------------------------------------------------------------------
// 1. Mutation call shapes are unchanged by the invalidation change.
// ---------------------------------------------------------------------------

describe("Profile claim mutation call shapes stay unchanged (characterization)", () => {
  it("the default family keeps the legacy no-familyId claim mutation calls", async () => {
    const queryClient = makeQueryClient();
    const wrapper = wrapperFor(queryClient, undefined);

    const request = renderHook(() => useRequestProfileClaim(), { wrapper });
    await request.result.current.mutateAsync("clayton");

    const approve = renderHook(() => useApproveProfileClaim(), { wrapper });
    await approve.result.current.mutateAsync(7n);

    const reject = renderHook(() => useRejectProfileClaim(), { wrapper });
    await reject.result.current.mutateAsync(7n);

    const create = renderHook(() => useCreateMyself(), { wrapper });
    await create.result.current.mutateAsync("Clayton Norwood");

    const update = renderHook(() => useUpdateOwnProfile(), { wrapper });
    await update.result.current.mutateAsync({
      personId: "clayton",
      edits: { preferredName: "Clay" },
    });

    expect(calls.requestProfileClaim).toEqual([["clayton"]]);
    expect(calls.approveProfileClaim).toEqual([[7n]]);
    expect(calls.rejectProfileClaim).toEqual([[7n]]);
    expect(calls.createMyself).toEqual([["Clayton Norwood"]]);
    expect(calls.updateOwnProfile).toEqual([
      ["clayton", { preferredName: "Clay" }],
    ]);
    // The default branch never routes to a *ForFamily endpoint.
    expect(calls.requestProfileClaimForFamily).toEqual([]);
    expect(calls.approveProfileClaimForFamily).toEqual([]);
    expect(calls.rejectProfileClaimForFamily).toEqual([]);
    expect(calls.createMyselfForFamily).toEqual([]);
    expect(calls.updateOwnProfileForFamily).toEqual([]);
  });

  it("a non-default family keeps the *ForFamily claim mutation calls with the familyId first", async () => {
    const queryClient = makeQueryClient();
    const wrapper = wrapperFor(queryClient, FAMILY_A);

    const request = renderHook(() => useRequestProfileClaim(FAMILY_A), {
      wrapper,
    });
    await request.result.current.mutateAsync("clayton");

    const approve = renderHook(() => useApproveProfileClaim(FAMILY_A), {
      wrapper,
    });
    await approve.result.current.mutateAsync(7n);

    const reject = renderHook(() => useRejectProfileClaim(FAMILY_A), {
      wrapper,
    });
    await reject.result.current.mutateAsync(7n);

    const create = renderHook(() => useCreateMyself(FAMILY_A), { wrapper });
    await create.result.current.mutateAsync("Clayton Norwood");

    const update = renderHook(() => useUpdateOwnProfile(FAMILY_A), { wrapper });
    await update.result.current.mutateAsync({
      personId: "clayton",
      edits: { preferredName: "Clay" },
    });

    expect(calls.requestProfileClaimForFamily).toEqual([[FAMILY_A, "clayton"]]);
    expect(calls.approveProfileClaimForFamily).toEqual([[FAMILY_A, 7n]]);
    expect(calls.rejectProfileClaimForFamily).toEqual([[FAMILY_A, 7n]]);
    expect(calls.createMyselfForFamily).toEqual([
      [FAMILY_A, "Clayton Norwood"],
    ]);
    expect(calls.updateOwnProfileForFamily).toEqual([
      [FAMILY_A, "clayton", { preferredName: "Clay" }],
    ]);
    // The non-default branch never falls back to the legacy endpoints.
    expect(calls.requestProfileClaim).toEqual([]);
    expect(calls.approveProfileClaim).toEqual([]);
    expect(calls.rejectProfileClaim).toEqual([]);
    expect(calls.createMyself).toEqual([]);
    expect(calls.updateOwnProfile).toEqual([]);
  });
});

describe("Relationship request mutation call shapes stay unchanged (characterization)", () => {
  it("the default family keeps the legacy no-familyId relationship mutation calls", async () => {
    const queryClient = makeQueryClient();
    const wrapper = wrapperFor(queryClient, undefined);

    const propose = renderHook(() => useProposeRelationship(), { wrapper });
    await propose.result.current.mutateAsync({
      fromPersonId: "clayton",
      toPersonId: "erma",
      relationshipType: RelationshipType.SpousePartner,
    });

    const approve = renderHook(() => useApproveRelationshipRequest(), {
      wrapper,
    });
    await approve.result.current.mutateAsync(13n);

    const reject = renderHook(() => useRejectRelationshipRequest(), {
      wrapper,
    });
    await reject.result.current.mutateAsync(13n);

    const pending = renderHook(() => useSetRelationshipRequestPending(), {
      wrapper,
    });
    await pending.result.current.mutateAsync(13n);

    expect(calls.proposeRelationship).toEqual([
      ["clayton", "erma", RelationshipType.SpousePartner],
    ]);
    expect(calls.approveRelationshipRequest).toEqual([[13n]]);
    expect(calls.rejectRelationshipRequest).toEqual([[13n]]);
    expect(calls.setRelationshipRequestPending).toEqual([[13n]]);
    // The default branch never routes to a *ForFamily endpoint.
    expect(calls.proposeRelationshipForFamily).toEqual([]);
    expect(calls.approveRelationshipRequestForFamily).toEqual([]);
    expect(calls.rejectRelationshipRequestForFamily).toEqual([]);
    expect(calls.setRelationshipRequestPendingForFamily).toEqual([]);
  });

  it("a non-default family keeps the *ForFamily relationship mutation calls with the familyId first", async () => {
    const queryClient = makeQueryClient();
    const wrapper = wrapperFor(queryClient, FAMILY_A);

    const propose = renderHook(() => useProposeRelationship(FAMILY_A), {
      wrapper,
    });
    await propose.result.current.mutateAsync({
      fromPersonId: "clayton",
      toPersonId: "erma",
      relationshipType: RelationshipType.SpousePartner,
    });

    const approve = renderHook(() => useApproveRelationshipRequest(FAMILY_A), {
      wrapper,
    });
    await approve.result.current.mutateAsync(13n);

    const reject = renderHook(() => useRejectRelationshipRequest(FAMILY_A), {
      wrapper,
    });
    await reject.result.current.mutateAsync(13n);

    const pending = renderHook(
      () => useSetRelationshipRequestPending(FAMILY_A),
      { wrapper },
    );
    await pending.result.current.mutateAsync(13n);

    expect(calls.proposeRelationshipForFamily).toEqual([
      [FAMILY_A, "clayton", "erma", RelationshipType.SpousePartner],
    ]);
    expect(calls.approveRelationshipRequestForFamily).toEqual([
      [FAMILY_A, 13n],
    ]);
    expect(calls.rejectRelationshipRequestForFamily).toEqual([[FAMILY_A, 13n]]);
    expect(calls.setRelationshipRequestPendingForFamily).toEqual([
      [FAMILY_A, 13n],
    ]);
    // The non-default branch never falls back to the legacy endpoints.
    expect(calls.proposeRelationship).toEqual([]);
    expect(calls.approveRelationshipRequest).toEqual([]);
    expect(calls.rejectRelationshipRequest).toEqual([]);
    expect(calls.setRelationshipRequestPending).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. Read query-key shapes are unchanged by the invalidation change.
// ---------------------------------------------------------------------------

describe("Profile claim read query-key shapes stay unchanged (characterization)", () => {
  it("the default family registers the legacy keys with a null family slot", async () => {
    const queryClient = makeQueryClient();
    const wrapper = wrapperFor(queryClient, undefined);

    const profile = renderHook(() => usePersonProfile("clayton"), { wrapper });
    const claimStatus = renderHook(() => usePersonClaimStatus("clayton"), {
      wrapper,
    });
    const myClaim = renderHook(() => useMyProfileClaim("clayton"), { wrapper });
    const myProfile = renderHook(() => useMyProfile(), { wrapper });
    const claims = renderHook(() => useListProfileClaims(), { wrapper });

    await waitFor(() => expect(profile.result.current.isSuccess).toBe(true));
    await waitFor(() =>
      expect(claimStatus.result.current.isSuccess).toBe(true),
    );
    await waitFor(() => expect(myClaim.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(myProfile.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(claims.result.current.isSuccess).toBe(true));

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["personProfile", null, "clayton"]);
    expect(keys).toContainEqual(["myProfileClaim", null, "clayton"]);
    expect(keys).toContainEqual(["myProfile", null]);
    expect(keys).toContainEqual(["profileClaims", null]);
  });

  it("a non-default family registers the family-appended keys", async () => {
    const queryClient = makeQueryClient();
    const wrapper = wrapperFor(queryClient, FAMILY_A);

    const profile = renderHook(
      () =>
        usePersonProfile("clayton", {
          familyId: FAMILY_A,
        }),
      { wrapper },
    );
    const claimStatus = renderHook(
      () => usePersonClaimStatus("clayton", FAMILY_A),
      { wrapper },
    );
    const myClaim = renderHook(() => useMyProfileClaim("clayton", FAMILY_A), {
      wrapper,
    });
    const myProfile = renderHook(() => useMyProfile(FAMILY_A), { wrapper });
    const claims = renderHook(() => useListProfileClaims(FAMILY_A), {
      wrapper,
    });

    await waitFor(() => expect(profile.result.current.isSuccess).toBe(true));
    await waitFor(() =>
      expect(claimStatus.result.current.isSuccess).toBe(true),
    );
    await waitFor(() => expect(myClaim.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(myProfile.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(claims.result.current.isSuccess).toBe(true));

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["personProfile", FAMILY_A, "clayton"]);
    expect(keys).toContainEqual(["myProfileClaim", FAMILY_A, "clayton"]);
    expect(keys).toContainEqual(["myProfile", FAMILY_A]);
    expect(keys).toContainEqual(["profileClaims", FAMILY_A]);
  });
});

describe("Relationship request read query-key shapes stay unchanged (characterization)", () => {
  it("the default family registers the legacy keys with a null family slot", async () => {
    const queryClient = makeQueryClient();
    const wrapper = wrapperFor(queryClient, undefined);

    const mine = renderHook(() => useMyRelationshipRequests(), { wrapper });
    const list = renderHook(() => useListRelationshipRequests(), { wrapper });
    const detail = renderHook(() => useGetRelationshipRequest(13n), {
      wrapper,
    });
    const confirmed = renderHook(() => useListConfirmedRelationships(), {
      wrapper,
    });

    await waitFor(() => expect(mine.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(detail.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(confirmed.result.current.isSuccess).toBe(true));

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["myRelationshipRequests", null]);
    expect(keys).toContainEqual(["relationshipRequests", null]);
    expect(keys).toContainEqual(["relationshipRequests", null, "13"]);
    expect(keys).toContainEqual(["confirmedRelationships", null]);
  });

  it("a non-default family registers the family-appended keys", async () => {
    const queryClient = makeQueryClient();
    const wrapper = wrapperFor(queryClient, FAMILY_A);

    const mine = renderHook(() => useMyRelationshipRequests(FAMILY_A), {
      wrapper,
    });
    const list = renderHook(() => useListRelationshipRequests(FAMILY_A), {
      wrapper,
    });
    const detail = renderHook(() => useGetRelationshipRequest(13n, FAMILY_A), {
      wrapper,
    });
    const confirmed = renderHook(
      () => useListConfirmedRelationships(FAMILY_A),
      { wrapper },
    );

    await waitFor(() => expect(mine.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(detail.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(confirmed.result.current.isSuccess).toBe(true));

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["myRelationshipRequests", FAMILY_A]);
    expect(keys).toContainEqual(["relationshipRequests", FAMILY_A]);
    expect(keys).toContainEqual(["relationshipRequests", FAMILY_A, "13"]);
    expect(keys).toContainEqual(["confirmedRelationships", FAMILY_A]);
  });
});

// ---------------------------------------------------------------------------
// 3. Family-scoped adjacent Notification / pending-count invalidation is
//    unchanged.
// ---------------------------------------------------------------------------

describe("claim mutations keep family-scoped Notification and pending-count invalidation (characterization)", () => {
  // The claim mutations already route their Notification and
  // Pending-Contributions invalidation through the family-aware helpers. The
  // family-exact change to the seven claim/relationship key families must not
  // weaken that: a Family A mutation must still refresh Family A's Notification
  // and pending-count caches and leave Family B's untouched.
  function renderWithFamilyA<T>(hook: () => T) {
    const queryClient = makeQueryClient();
    const rendered = renderHook(hook, {
      wrapper: wrapperFor(queryClient, FAMILY_A),
    });
    return { ...rendered, queryClient };
  }

  function seedAdjacentCaches(queryClient: QueryClient) {
    queryClient.setQueryData(["notifications", FAMILY_A], []);
    queryClient.setQueryData(["notifications", "unreadCount", FAMILY_A], 0);
    queryClient.setQueryData(["notifications", FAMILY_B], []);
    queryClient.setQueryData(["notifications", "unreadCount", FAMILY_B], 0);
    queryClient.setQueryData(["pendingContributionsCount", FAMILY_A], 0);
    queryClient.setQueryData(["pendingContributionsCount", FAMILY_B], 0);
  }

  function expectFamilyAAdjacentInvalidated(queryClient: QueryClient) {
    expect(
      queryClient.getQueryState(["notifications", FAMILY_A])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["notifications", "unreadCount", FAMILY_A])
        ?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["pendingContributionsCount", FAMILY_A])
        ?.isInvalidated,
    ).toBe(true);
    // Family B is untouched.
    expect(
      queryClient.getQueryState(["notifications", FAMILY_B])?.isInvalidated,
    ).toBe(false);
    expect(
      queryClient.getQueryState(["notifications", "unreadCount", FAMILY_B])
        ?.isInvalidated,
    ).toBe(false);
    expect(
      queryClient.getQueryState(["pendingContributionsCount", FAMILY_B])
        ?.isInvalidated,
    ).toBe(false);
  }

  it("useRequestProfileClaim refreshes only Family A's adjacent caches", async () => {
    const { result, queryClient } = renderWithFamilyA(() =>
      useRequestProfileClaim(FAMILY_A),
    );
    seedAdjacentCaches(queryClient);

    await result.current.mutateAsync("clayton");

    expectFamilyAAdjacentInvalidated(queryClient);
  });

  it("useApproveProfileClaim refreshes only Family A's adjacent caches", async () => {
    const { result, queryClient } = renderWithFamilyA(() =>
      useApproveProfileClaim(FAMILY_A),
    );
    seedAdjacentCaches(queryClient);

    await result.current.mutateAsync(7n);

    expectFamilyAAdjacentInvalidated(queryClient);
  });

  it("useRejectProfileClaim refreshes only Family A's adjacent caches", async () => {
    const { result, queryClient } = renderWithFamilyA(() =>
      useRejectProfileClaim(FAMILY_A),
    );
    seedAdjacentCaches(queryClient);

    await result.current.mutateAsync(7n);

    expectFamilyAAdjacentInvalidated(queryClient);
  });
});

describe("relationship mutations keep family-scoped Notification and pending-count invalidation (characterization)", () => {
  function renderWithFamilyA<T>(hook: () => T) {
    const queryClient = makeQueryClient();
    const rendered = renderHook(hook, {
      wrapper: wrapperFor(queryClient, FAMILY_A),
    });
    return { ...rendered, queryClient };
  }

  function seedAdjacentCaches(queryClient: QueryClient) {
    queryClient.setQueryData(["notifications", FAMILY_A], []);
    queryClient.setQueryData(["notifications", "unreadCount", FAMILY_A], 0);
    queryClient.setQueryData(["notifications", FAMILY_B], []);
    queryClient.setQueryData(["notifications", "unreadCount", FAMILY_B], 0);
    queryClient.setQueryData(["pendingContributionsCount", FAMILY_A], 0);
    queryClient.setQueryData(["pendingContributionsCount", FAMILY_B], 0);
  }

  function expectFamilyAAdjacentInvalidated(queryClient: QueryClient) {
    expect(
      queryClient.getQueryState(["notifications", FAMILY_A])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["notifications", "unreadCount", FAMILY_A])
        ?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["pendingContributionsCount", FAMILY_A])
        ?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["notifications", FAMILY_B])?.isInvalidated,
    ).toBe(false);
    expect(
      queryClient.getQueryState(["notifications", "unreadCount", FAMILY_B])
        ?.isInvalidated,
    ).toBe(false);
    expect(
      queryClient.getQueryState(["pendingContributionsCount", FAMILY_B])
        ?.isInvalidated,
    ).toBe(false);
  }

  it("useProposeRelationship refreshes only Family A's Notification caches", async () => {
    const { result, queryClient } = renderWithFamilyA(() =>
      useProposeRelationship(FAMILY_A),
    );
    seedAdjacentCaches(queryClient);

    await result.current.mutateAsync({
      fromPersonId: "clayton",
      toPersonId: "erma",
      relationshipType: RelationshipType.SpousePartner,
    });

    // Proposing a request notifies the other party, so the Notification caches
    // are family-scoped; it does not touch the steward pending-count badge.
    expect(
      queryClient.getQueryState(["notifications", FAMILY_A])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["notifications", "unreadCount", FAMILY_A])
        ?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["notifications", FAMILY_B])?.isInvalidated,
    ).toBe(false);
    expect(
      queryClient.getQueryState(["notifications", "unreadCount", FAMILY_B])
        ?.isInvalidated,
    ).toBe(false);
  });

  it("useApproveRelationshipRequest refreshes only Family A's adjacent caches", async () => {
    const { result, queryClient } = renderWithFamilyA(() =>
      useApproveRelationshipRequest(FAMILY_A),
    );
    seedAdjacentCaches(queryClient);

    await result.current.mutateAsync(13n);

    expectFamilyAAdjacentInvalidated(queryClient);
  });

  it("useRejectRelationshipRequest refreshes only Family A's adjacent caches", async () => {
    const { result, queryClient } = renderWithFamilyA(() =>
      useRejectRelationshipRequest(FAMILY_A),
    );
    seedAdjacentCaches(queryClient);

    await result.current.mutateAsync(13n);

    expectFamilyAAdjacentInvalidated(queryClient);
  });

  it("useSetRelationshipRequestPending refreshes only Family A's adjacent caches", async () => {
    const { result, queryClient } = renderWithFamilyA(() =>
      useSetRelationshipRequestPending(FAMILY_A),
    );
    seedAdjacentCaches(queryClient);

    await result.current.mutateAsync(13n);

    expectFamilyAAdjacentInvalidated(queryClient);
  });
});

// ---------------------------------------------------------------------------
// 4. Family-exact photo invalidation in useUpdateOwnProfile is unchanged.
// ---------------------------------------------------------------------------

describe("useUpdateOwnProfile keeps family-exact photo invalidation (characterization)", () => {
  it("a Family A edit invalidates only Family A's scoped photo keys", async () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useUpdateOwnProfile(FAMILY_A), {
      wrapper: wrapperFor(queryClient, FAMILY_A),
    });
    queryClient.setQueryData(["photos", FAMILY_A, "clayton"], []);
    queryClient.setQueryData(["profilePhoto", FAMILY_A, "clayton"], null);
    queryClient.setQueryData(["photos", FAMILY_B, "clayton"], []);
    queryClient.setQueryData(["profilePhoto", FAMILY_B, "clayton"], null);

    await result.current.mutateAsync({
      personId: "clayton",
      edits: { preferredName: "Clay" },
    });

    expect(isInvalidated(queryClient, ["photos", FAMILY_A, "clayton"])).toBe(
      true,
    );
    expect(
      isInvalidated(queryClient, ["profilePhoto", FAMILY_A, "clayton"]),
    ).toBe(true);
    expect(isInvalidated(queryClient, ["photos", FAMILY_B, "clayton"])).toBe(
      false,
    );
    expect(
      isInvalidated(queryClient, ["profilePhoto", FAMILY_B, "clayton"]),
    ).toBe(false);
  });

  it("a default-family edit invalidates only the legacy two-element photo keys", async () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useUpdateOwnProfile(), {
      wrapper: wrapperFor(queryClient, undefined),
    });
    queryClient.setQueryData(["photos", "clayton"], []);
    queryClient.setQueryData(["profilePhoto", "clayton"], null);
    queryClient.setQueryData(["photos", FAMILY_A, "clayton"], []);
    queryClient.setQueryData(["profilePhoto", FAMILY_A, "clayton"], null);

    await result.current.mutateAsync({
      personId: "clayton",
      edits: { preferredName: "Clay" },
    });

    expect(isInvalidated(queryClient, ["photos", "clayton"])).toBe(true);
    expect(isInvalidated(queryClient, ["profilePhoto", "clayton"])).toBe(true);
    expect(isInvalidated(queryClient, ["photos", FAMILY_A, "clayton"])).toBe(
      false,
    );
    expect(
      isInvalidated(queryClient, ["profilePhoto", FAMILY_A, "clayton"]),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. A mutation still invalidates its own claim/relationship cache.
// ---------------------------------------------------------------------------

describe("claim mutations still invalidate their own claim/profile caches (characterization)", () => {
  // The family-exact change alters the *filter* a mutation applies, not whether
  // it invalidates. These assertions seed the active family's read caches and
  // assert they go stale after the mutation, without pinning the exact filter
  // shape — so the family-exact fix is free to change the filter while a
  // regression that drops the invalidation entirely still fails.
  function renderWithFamilyA<T>(hook: () => T) {
    const queryClient = makeQueryClient();
    const rendered = renderHook(hook, {
      wrapper: wrapperFor(queryClient, FAMILY_A),
    });
    return { ...rendered, queryClient };
  }

  it("useRequestProfileClaim invalidates Family A's claim and profile caches", async () => {
    const { result, queryClient } = renderWithFamilyA(() =>
      useRequestProfileClaim(FAMILY_A),
    );
    queryClient.setQueryData(["profileClaims", FAMILY_A], [seededClaim]);
    queryClient.setQueryData(
      ["personProfile", FAMILY_A, "clayton"],
      seededProfile,
    );
    queryClient.setQueryData(
      ["myProfileClaim", FAMILY_A, "clayton"],
      seededClaim,
    );
    queryClient.setQueryData(["myProfile", FAMILY_A], seededProfile);

    await result.current.mutateAsync("clayton");

    expect(isInvalidated(queryClient, ["profileClaims", FAMILY_A])).toBe(true);
    expect(
      isInvalidated(queryClient, ["personProfile", FAMILY_A, "clayton"]),
    ).toBe(true);
    expect(
      isInvalidated(queryClient, ["myProfileClaim", FAMILY_A, "clayton"]),
    ).toBe(true);
    expect(isInvalidated(queryClient, ["myProfile", FAMILY_A])).toBe(true);
    // Invalidation marks the caches stale; it must not drop the typed records
    // the family-scoped read keys already hold.
    expect(
      queryClient.getQueryData(["personProfile", FAMILY_A, "clayton"]),
    ).toBe(seededProfile);
    expect(
      queryClient.getQueryData(["myProfileClaim", FAMILY_A, "clayton"]),
    ).toBe(seededClaim);
  });

  it("useApproveProfileClaim invalidates Family A's claim and profile caches", async () => {
    const { result, queryClient } = renderWithFamilyA(() =>
      useApproveProfileClaim(FAMILY_A),
    );
    queryClient.setQueryData(["profileClaims", FAMILY_A], [seededClaim]);
    queryClient.setQueryData(
      ["personProfile", FAMILY_A, "clayton"],
      seededProfile,
    );
    queryClient.setQueryData(
      ["myProfileClaim", FAMILY_A, "clayton"],
      seededClaim,
    );
    queryClient.setQueryData(["myProfile", FAMILY_A], seededProfile);

    await result.current.mutateAsync(7n);

    expect(isInvalidated(queryClient, ["profileClaims", FAMILY_A])).toBe(true);
    expect(
      isInvalidated(queryClient, ["personProfile", FAMILY_A, "clayton"]),
    ).toBe(true);
    expect(
      isInvalidated(queryClient, ["myProfileClaim", FAMILY_A, "clayton"]),
    ).toBe(true);
    expect(isInvalidated(queryClient, ["myProfile", FAMILY_A])).toBe(true);
    expect(queryClient.getQueryData(["profileClaims", FAMILY_A])).toEqual([
      seededClaim,
    ]);
  });

  it("useRejectProfileClaim invalidates Family A's claim and profile caches", async () => {
    const { result, queryClient } = renderWithFamilyA(() =>
      useRejectProfileClaim(FAMILY_A),
    );
    queryClient.setQueryData(["profileClaims", FAMILY_A], [seededClaim]);
    queryClient.setQueryData(
      ["personProfile", FAMILY_A, "clayton"],
      seededProfile,
    );
    queryClient.setQueryData(
      ["myProfileClaim", FAMILY_A, "clayton"],
      seededClaim,
    );
    queryClient.setQueryData(["myProfile", FAMILY_A], seededProfile);

    await result.current.mutateAsync(7n);

    expect(isInvalidated(queryClient, ["profileClaims", FAMILY_A])).toBe(true);
    expect(
      isInvalidated(queryClient, ["personProfile", FAMILY_A, "clayton"]),
    ).toBe(true);
    expect(
      isInvalidated(queryClient, ["myProfileClaim", FAMILY_A, "clayton"]),
    ).toBe(true);
    expect(isInvalidated(queryClient, ["myProfile", FAMILY_A])).toBe(true);
    expect(queryClient.getQueryData(["myProfile", FAMILY_A])).toBe(
      seededProfile,
    );
  });

  it("useCreateMyself invalidates Family A's person-profile cache", async () => {
    const { result, queryClient } = renderWithFamilyA(() =>
      useCreateMyself(FAMILY_A),
    );
    queryClient.setQueryData(
      ["personProfile", FAMILY_A, "clayton"],
      seededProfile,
    );

    await result.current.mutateAsync("Clayton Norwood");

    expect(
      isInvalidated(queryClient, ["personProfile", FAMILY_A, "clayton"]),
    ).toBe(true);
    expect(
      queryClient.getQueryData(["personProfile", FAMILY_A, "clayton"]),
    ).toBe(seededProfile);
  });

  it("the default family mutation invalidates the legacy claim/profile caches", async () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useRequestProfileClaim(), {
      wrapper: wrapperFor(queryClient, undefined),
    });
    queryClient.setQueryData(["profileClaims", null], [seededClaim]);
    queryClient.setQueryData(["personProfile", null, "clayton"], seededProfile);
    queryClient.setQueryData(["myProfileClaim", null, "clayton"], seededClaim);
    queryClient.setQueryData(["myProfile", null], seededProfile);

    await result.current.mutateAsync("clayton");

    expect(isInvalidated(queryClient, ["profileClaims", null])).toBe(true);
    expect(isInvalidated(queryClient, ["personProfile", null, "clayton"])).toBe(
      true,
    );
    expect(
      isInvalidated(queryClient, ["myProfileClaim", null, "clayton"]),
    ).toBe(true);
    expect(isInvalidated(queryClient, ["myProfile", null])).toBe(true);
    expect(queryClient.getQueryData(["profileClaims", null])).toEqual([
      seededClaim,
    ]);
  });
});

describe("relationship mutations still invalidate their own relationship caches (characterization)", () => {
  function renderWithFamilyA<T>(hook: () => T) {
    const queryClient = makeQueryClient();
    const rendered = renderHook(hook, {
      wrapper: wrapperFor(queryClient, FAMILY_A),
    });
    return { ...rendered, queryClient };
  }

  it("useProposeRelationship invalidates Family A's request and my-request caches", async () => {
    const { result, queryClient } = renderWithFamilyA(() =>
      useProposeRelationship(FAMILY_A),
    );
    queryClient.setQueryData(
      ["relationshipRequests", FAMILY_A],
      [seededRequest],
    );
    queryClient.setQueryData(
      ["myRelationshipRequests", FAMILY_A],
      [seededRequest],
    );

    await result.current.mutateAsync({
      fromPersonId: "clayton",
      toPersonId: "erma",
      relationshipType: RelationshipType.SpousePartner,
    });

    expect(isInvalidated(queryClient, ["relationshipRequests", FAMILY_A])).toBe(
      true,
    );
    expect(
      isInvalidated(queryClient, ["myRelationshipRequests", FAMILY_A]),
    ).toBe(true);
    expect(
      queryClient.getQueryData(["relationshipRequests", FAMILY_A]),
    ).toEqual([seededRequest]);
  });

  it("useApproveRelationshipRequest invalidates Family A's request, confirmed, and my-request caches", async () => {
    const { result, queryClient } = renderWithFamilyA(() =>
      useApproveRelationshipRequest(FAMILY_A),
    );
    queryClient.setQueryData(
      ["relationshipRequests", FAMILY_A],
      [seededRequest],
    );
    queryClient.setQueryData(
      ["confirmedRelationships", FAMILY_A],
      [seededRelationship],
    );
    queryClient.setQueryData(
      ["myRelationshipRequests", FAMILY_A],
      [seededRequest],
    );

    await result.current.mutateAsync(13n);

    expect(isInvalidated(queryClient, ["relationshipRequests", FAMILY_A])).toBe(
      true,
    );
    expect(
      isInvalidated(queryClient, ["confirmedRelationships", FAMILY_A]),
    ).toBe(true);
    expect(
      isInvalidated(queryClient, ["myRelationshipRequests", FAMILY_A]),
    ).toBe(true);
    expect(
      queryClient.getQueryData(["confirmedRelationships", FAMILY_A]),
    ).toEqual([seededRelationship]);
  });

  it("useRejectRelationshipRequest invalidates Family A's request and my-request caches", async () => {
    const { result, queryClient } = renderWithFamilyA(() =>
      useRejectRelationshipRequest(FAMILY_A),
    );
    queryClient.setQueryData(
      ["relationshipRequests", FAMILY_A],
      [seededRequest],
    );
    queryClient.setQueryData(
      ["myRelationshipRequests", FAMILY_A],
      [seededRequest],
    );

    await result.current.mutateAsync(13n);

    expect(isInvalidated(queryClient, ["relationshipRequests", FAMILY_A])).toBe(
      true,
    );
    expect(
      isInvalidated(queryClient, ["myRelationshipRequests", FAMILY_A]),
    ).toBe(true);
    expect(
      queryClient.getQueryData(["myRelationshipRequests", FAMILY_A]),
    ).toEqual([seededRequest]);
  });

  it("useSetRelationshipRequestPending invalidates Family A's request and my-request caches", async () => {
    const { result, queryClient } = renderWithFamilyA(() =>
      useSetRelationshipRequestPending(FAMILY_A),
    );
    queryClient.setQueryData(
      ["relationshipRequests", FAMILY_A],
      [seededRequest],
    );
    queryClient.setQueryData(
      ["myRelationshipRequests", FAMILY_A],
      [seededRequest],
    );

    await result.current.mutateAsync(13n);

    expect(isInvalidated(queryClient, ["relationshipRequests", FAMILY_A])).toBe(
      true,
    );
    expect(
      isInvalidated(queryClient, ["myRelationshipRequests", FAMILY_A]),
    ).toBe(true);
    expect(
      queryClient.getQueryData(["relationshipRequests", FAMILY_A]),
    ).toEqual([seededRequest]);
  });

  it("the default family mutation invalidates the legacy relationship caches", async () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useApproveRelationshipRequest(), {
      wrapper: wrapperFor(queryClient, undefined),
    });
    queryClient.setQueryData(["relationshipRequests", null], [seededRequest]);
    queryClient.setQueryData(
      ["confirmedRelationships", null],
      [seededRelationship],
    );
    queryClient.setQueryData(["myRelationshipRequests", null], [seededRequest]);

    await result.current.mutateAsync(13n);

    expect(isInvalidated(queryClient, ["relationshipRequests", null])).toBe(
      true,
    );
    expect(isInvalidated(queryClient, ["confirmedRelationships", null])).toBe(
      true,
    );
    expect(isInvalidated(queryClient, ["myRelationshipRequests", null])).toBe(
      true,
    );
    expect(queryClient.getQueryData(["confirmedRelationships", null])).toEqual([
      seededRelationship,
    ]);
  });
});

// ---------------------------------------------------------------------------
// 6. The default family id is still Norwood.
// ---------------------------------------------------------------------------

describe("profile/claim/relationship family context default (characterization)", () => {
  it("the default family id is Norwood", () => {
    expect(DEFAULT_FAMILY_ID).toBe("norwood");
  });
});
