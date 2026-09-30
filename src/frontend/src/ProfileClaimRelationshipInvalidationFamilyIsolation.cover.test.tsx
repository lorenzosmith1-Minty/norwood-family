import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  myProfileClaimInvalidation,
  myProfileInvalidation,
  personProfileInvalidation,
  profileClaimsInvalidation,
  useApproveProfileClaim,
  useCreateMyself,
  useRejectProfileClaim,
  useRequestProfileClaim,
  useUpdateOwnProfile,
} from "./hooks/useProfileClaims";
import {
  confirmedRelationshipsInvalidation,
  myRelationshipRequestsInvalidation,
  relationshipRequestsInvalidation,
  useApproveRelationshipRequest,
  useProposeRelationship,
  useRejectRelationshipRequest,
  useSetRelationshipRequestPending,
} from "./hooks/useRelationshipRequests";

// ---------------------------------------------------------------------------
// Cover for the family-exact Profile Claim / Relationship Request
// cache-invalidation change in `hooks/useProfileClaims.ts` and
// `hooks/useRelationshipRequests.ts`.
//
// The requested change replaces the bare cross-family invalidation prefixes for
// the seven key families `profileClaims`, `personProfile`, `myProfileClaim`,
// `myProfile`, `relationshipRequests`, `confirmedRelationships`, and
// `myRelationshipRequests` with family-exact filters built from the active
// `familyScopedId`, so a claim or relationship mutation performed while one
// family is active invalidates ONLY that family's caches. Before the change a
// bare prefix also matched every other family's family-appended key and marked
// it stale.
//
// This file asserts the accepted behavior:
//
//   1. Helper contract: all seven helpers are family-exact in both branches.
//      The default family targets only the exact default read key shape
//      (narrowed with a `queryKey.length` predicate where the bare prefix would
//      otherwise match a non-default key); a non-default family keeps the bare
//      prefix but narrows it with a predicate that admits only the active
//      family's keys (family id at index 1).
//
//   2. Non-default isolation, asserted behaviorally through the real mutation
//      hooks: with Family A active, each claim mutation path (request, approve,
//      reject, create-myself, update-own-profile) invalidates Family A's claim
//      and profile caches and leaves Family B's and the default family's caches
//      untouched; each relationship mutation path (propose, approve, reject,
//      set-pending) invalidates Family A's relationship caches and leaves
//      Family B's and the default family's caches untouched.
//
//   3. Default-family exactness: with the default family active, a mutation
//      invalidates the exact default read keys and leaves Family A's and
//      Family B's caches untouched.
//
//   4. Static source audit: no production claim/relationship invalidation in
//      the two hook files passes a bare cross-family prefix to
//      `invalidateQueries`.
//
// This is component/integration coverage over a typed local actor mock; it does
// not exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");
const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";

const { mockActor, resetCalls } = vi.hoisted(() => {
  const mockActor = {
    // Legacy no-familyId endpoints.
    async requestProfileClaim(..._args: unknown[]): Promise<unknown> {
      return { __kind__: "ok", ok: {} };
    },
    async approveProfileClaim(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async rejectProfileClaim(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async createMyself(..._args: unknown[]): Promise<unknown> {
      return { __kind__: "ok", ok: {} };
    },
    async updateOwnProfile(..._args: unknown[]): Promise<unknown> {
      return { __kind__: "ok", ok: {} };
    },
    async proposeRelationship(..._args: unknown[]): Promise<unknown> {
      return { __kind__: "ok", ok: {} };
    },
    async approveRelationshipRequest(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async rejectRelationshipRequest(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async setRelationshipRequestPending(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    // Canonical family-scoped endpoints.
    async requestProfileClaimForFamily(..._args: unknown[]): Promise<unknown> {
      return { __kind__: "ok", ok: {} };
    },
    async approveProfileClaimForFamily(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async rejectProfileClaimForFamily(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async createMyselfForFamily(..._args: unknown[]): Promise<unknown> {
      return { __kind__: "ok", ok: {} };
    },
    async updateOwnProfileForFamily(..._args: unknown[]): Promise<unknown> {
      return { __kind__: "ok", ok: {} };
    },
    async proposeRelationshipForFamily(..._args: unknown[]): Promise<unknown> {
      return { __kind__: "ok", ok: {} };
    },
    async approveRelationshipRequestForFamily(
      ..._args: unknown[]
    ): Promise<unknown> {
      return null;
    },
    async rejectRelationshipRequestForFamily(
      ..._args: unknown[]
    ): Promise<unknown> {
      return null;
    },
    async setRelationshipRequestPendingForFamily(
      ..._args: unknown[]
    ): Promise<unknown> {
      return null;
    },
  };

  return {
    mockActor,
    resetCalls: () => {
      // The mock methods are stateless; the assertions are on React Query cache
      // state, so there is nothing to reset between tests.
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

// Typed fixtures keep the actor mock honest against the app's own exported
// types; they are referenced so the imports are not dead.
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

type Predicate = (query: { queryKey: readonly unknown[] }) => boolean;

function predicateOf(filter: {
  predicate?: unknown;
}): Predicate {
  return filter.predicate as Predicate;
}

// ---------------------------------------------------------------------------
// 1. Helper contract: all seven helpers are family-exact in both branches.
// ---------------------------------------------------------------------------

describe("Profile Claim invalidation helpers are family-exact in both branches (cover)", () => {
  it("profileClaimsInvalidation default branch admits only the default list shape", () => {
    const filter = profileClaimsInvalidation(undefined);
    expect(filter.queryKey).toEqual(["profileClaims"]);
    const predicate = predicateOf(filter);
    expect(predicate({ queryKey: ["profileClaims", null] })).toBe(true);
    expect(predicate({ queryKey: ["profileClaims", FAMILY_A] })).toBe(false);
    expect(predicate({ queryKey: ["profileClaims", FAMILY_B] })).toBe(false);
  });

  it("profileClaimsInvalidation non-default branch admits only the active family", () => {
    const filter = profileClaimsInvalidation(FAMILY_A);
    expect(filter.queryKey).toEqual(["profileClaims"]);
    const predicate = predicateOf(filter);
    expect(predicate({ queryKey: ["profileClaims", FAMILY_A] })).toBe(true);
    expect(predicate({ queryKey: ["profileClaims", FAMILY_B] })).toBe(false);
    expect(predicate({ queryKey: ["profileClaims", null] })).toBe(false);
  });

  it("personProfileInvalidation default branch admits only the default detail shape", () => {
    const filter = personProfileInvalidation(undefined);
    expect(filter.queryKey).toEqual(["personProfile"]);
    const predicate = predicateOf(filter);
    expect(predicate({ queryKey: ["personProfile", null, "clayton"] })).toBe(
      true,
    );
    expect(
      predicate({ queryKey: ["personProfile", FAMILY_A, "clayton"] }),
    ).toBe(false);
    expect(
      predicate({ queryKey: ["personProfile", FAMILY_B, "clayton"] }),
    ).toBe(false);
  });

  it("personProfileInvalidation non-default branch admits only the active family", () => {
    const filter = personProfileInvalidation(FAMILY_A);
    expect(filter.queryKey).toEqual(["personProfile"]);
    const predicate = predicateOf(filter);
    expect(
      predicate({ queryKey: ["personProfile", FAMILY_A, "clayton"] }),
    ).toBe(true);
    expect(
      predicate({ queryKey: ["personProfile", FAMILY_B, "clayton"] }),
    ).toBe(false);
    expect(predicate({ queryKey: ["personProfile", null, "clayton"] })).toBe(
      false,
    );
  });

  it("myProfileClaimInvalidation default branch admits only the default detail shape", () => {
    const filter = myProfileClaimInvalidation(undefined);
    expect(filter.queryKey).toEqual(["myProfileClaim"]);
    const predicate = predicateOf(filter);
    expect(predicate({ queryKey: ["myProfileClaim", null, "clayton"] })).toBe(
      true,
    );
    expect(
      predicate({ queryKey: ["myProfileClaim", FAMILY_A, "clayton"] }),
    ).toBe(false);
    expect(
      predicate({ queryKey: ["myProfileClaim", FAMILY_B, "clayton"] }),
    ).toBe(false);
  });

  it("myProfileClaimInvalidation non-default branch admits only the active family", () => {
    const filter = myProfileClaimInvalidation(FAMILY_A);
    expect(filter.queryKey).toEqual(["myProfileClaim"]);
    const predicate = predicateOf(filter);
    expect(
      predicate({ queryKey: ["myProfileClaim", FAMILY_A, "clayton"] }),
    ).toBe(true);
    expect(
      predicate({ queryKey: ["myProfileClaim", FAMILY_B, "clayton"] }),
    ).toBe(false);
    expect(predicate({ queryKey: ["myProfileClaim", null, "clayton"] })).toBe(
      false,
    );
  });

  it("myProfileInvalidation default branch admits only the default shape", () => {
    const filter = myProfileInvalidation(undefined);
    expect(filter.queryKey).toEqual(["myProfile"]);
    const predicate = predicateOf(filter);
    expect(predicate({ queryKey: ["myProfile", null] })).toBe(true);
    expect(predicate({ queryKey: ["myProfile", FAMILY_A] })).toBe(false);
    expect(predicate({ queryKey: ["myProfile", FAMILY_B] })).toBe(false);
  });

  it("myProfileInvalidation non-default branch admits only the active family", () => {
    const filter = myProfileInvalidation(FAMILY_A);
    expect(filter.queryKey).toEqual(["myProfile"]);
    const predicate = predicateOf(filter);
    expect(predicate({ queryKey: ["myProfile", FAMILY_A] })).toBe(true);
    expect(predicate({ queryKey: ["myProfile", FAMILY_B] })).toBe(false);
    expect(predicate({ queryKey: ["myProfile", null] })).toBe(false);
  });
});

describe("Relationship Request invalidation helpers are family-exact in both branches (cover)", () => {
  it("relationshipRequestsInvalidation default branch admits the default list and detail shapes", () => {
    const filter = relationshipRequestsInvalidation(undefined);
    expect(filter.queryKey).toEqual(["relationshipRequests"]);
    const predicate = predicateOf(filter);
    expect(predicate({ queryKey: ["relationshipRequests", null] })).toBe(true);
    expect(predicate({ queryKey: ["relationshipRequests", null, "13"] })).toBe(
      true,
    );
    expect(predicate({ queryKey: ["relationshipRequests", FAMILY_A] })).toBe(
      false,
    );
    expect(
      predicate({ queryKey: ["relationshipRequests", FAMILY_A, "13"] }),
    ).toBe(false);
    expect(predicate({ queryKey: ["relationshipRequests", FAMILY_B] })).toBe(
      false,
    );
  });

  it("relationshipRequestsInvalidation non-default branch admits only the active family", () => {
    const filter = relationshipRequestsInvalidation(FAMILY_A);
    expect(filter.queryKey).toEqual(["relationshipRequests"]);
    const predicate = predicateOf(filter);
    expect(predicate({ queryKey: ["relationshipRequests", FAMILY_A] })).toBe(
      true,
    );
    expect(
      predicate({ queryKey: ["relationshipRequests", FAMILY_A, "13"] }),
    ).toBe(true);
    expect(predicate({ queryKey: ["relationshipRequests", FAMILY_B] })).toBe(
      false,
    );
    expect(
      predicate({ queryKey: ["relationshipRequests", FAMILY_B, "13"] }),
    ).toBe(false);
    expect(predicate({ queryKey: ["relationshipRequests", null] })).toBe(false);
  });

  it("confirmedRelationshipsInvalidation default branch admits only the default shape", () => {
    const filter = confirmedRelationshipsInvalidation(undefined);
    expect(filter.queryKey).toEqual(["confirmedRelationships"]);
    const predicate = predicateOf(filter);
    expect(predicate({ queryKey: ["confirmedRelationships", null] })).toBe(
      true,
    );
    expect(predicate({ queryKey: ["confirmedRelationships", FAMILY_A] })).toBe(
      false,
    );
    expect(predicate({ queryKey: ["confirmedRelationships", FAMILY_B] })).toBe(
      false,
    );
  });

  it("confirmedRelationshipsInvalidation non-default branch admits only the active family", () => {
    const filter = confirmedRelationshipsInvalidation(FAMILY_A);
    expect(filter.queryKey).toEqual(["confirmedRelationships"]);
    const predicate = predicateOf(filter);
    expect(predicate({ queryKey: ["confirmedRelationships", FAMILY_A] })).toBe(
      true,
    );
    expect(predicate({ queryKey: ["confirmedRelationships", FAMILY_B] })).toBe(
      false,
    );
    expect(predicate({ queryKey: ["confirmedRelationships", null] })).toBe(
      false,
    );
  });

  it("myRelationshipRequestsInvalidation default branch admits only the default shape", () => {
    const filter = myRelationshipRequestsInvalidation(undefined);
    expect(filter.queryKey).toEqual(["myRelationshipRequests"]);
    const predicate = predicateOf(filter);
    expect(predicate({ queryKey: ["myRelationshipRequests", null] })).toBe(
      true,
    );
    expect(predicate({ queryKey: ["myRelationshipRequests", FAMILY_A] })).toBe(
      false,
    );
    expect(predicate({ queryKey: ["myRelationshipRequests", FAMILY_B] })).toBe(
      false,
    );
  });

  it("myRelationshipRequestsInvalidation non-default branch admits only the active family", () => {
    const filter = myRelationshipRequestsInvalidation(FAMILY_A);
    expect(filter.queryKey).toEqual(["myRelationshipRequests"]);
    const predicate = predicateOf(filter);
    expect(predicate({ queryKey: ["myRelationshipRequests", FAMILY_A] })).toBe(
      true,
    );
    expect(predicate({ queryKey: ["myRelationshipRequests", FAMILY_B] })).toBe(
      false,
    );
    expect(predicate({ queryKey: ["myRelationshipRequests", null] })).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Non-default family isolation, through the real mutation hooks.
// ---------------------------------------------------------------------------

/**
 * Seeds the seven claim/relationship caches for the default family, Family A,
 * and Family B so an invalidation can be observed as a state transition on each
 * key. The default family's read keys keep the family slot as `null`; a
 * non-default family appends the family id at index 1.
 */
function seedClaimRelationshipCaches(queryClient: QueryClient) {
  for (const familySlot of [null, FAMILY_A, FAMILY_B]) {
    queryClient.setQueryData(["profileClaims", familySlot], []);
    queryClient.setQueryData(["personProfile", familySlot, "clayton"], null);
    queryClient.setQueryData(["myProfileClaim", familySlot, "clayton"], null);
    queryClient.setQueryData(["myProfile", familySlot], null);
    queryClient.setQueryData(["relationshipRequests", familySlot], []);
    queryClient.setQueryData(["relationshipRequests", familySlot, "13"], null);
    queryClient.setQueryData(["confirmedRelationships", familySlot], []);
    queryClient.setQueryData(["myRelationshipRequests", familySlot], []);
  }
}

/** Reads the invalidation state of every seeded claim/relationship key. */
function readClaimRelationshipState(queryClient: QueryClient) {
  const state: Record<string, boolean> = {};
  for (const [label, familySlot] of [
    ["default", null],
    ["a", FAMILY_A],
    ["b", FAMILY_B],
  ] as const) {
    state[`${label}:claims`] = isInvalidated(queryClient, [
      "profileClaims",
      familySlot,
    ]);
    state[`${label}:personProfile`] = isInvalidated(queryClient, [
      "personProfile",
      familySlot,
      "clayton",
    ]);
    state[`${label}:myProfileClaim`] = isInvalidated(queryClient, [
      "myProfileClaim",
      familySlot,
      "clayton",
    ]);
    state[`${label}:myProfile`] = isInvalidated(queryClient, [
      "myProfile",
      familySlot,
    ]);
    state[`${label}:requests`] = isInvalidated(queryClient, [
      "relationshipRequests",
      familySlot,
    ]);
    state[`${label}:requestDetail`] = isInvalidated(queryClient, [
      "relationshipRequests",
      familySlot,
      "13",
    ]);
    state[`${label}:confirmed`] = isInvalidated(queryClient, [
      "confirmedRelationships",
      familySlot,
    ]);
    state[`${label}:myRequests`] = isInvalidated(queryClient, [
      "myRelationshipRequests",
      familySlot,
    ]);
  }
  return state;
}

describe("a Family A claim mutation invalidates only Family A's claim/profile caches (cover)", () => {
  async function runFamilyAClaimMutation(
    hook: () => { mutateAsync: (input: never) => Promise<unknown> },
    input: unknown,
  ) {
    const queryClient = makeQueryClient();
    const { result } = renderHook(hook, {
      wrapper: wrapperFor(queryClient, FAMILY_A),
    });
    seedClaimRelationshipCaches(queryClient);

    await result.current.mutateAsync(input as never);

    return readClaimRelationshipState(queryClient);
  }

  it("useRequestProfileClaim invalidates only Family A's claim and profile caches", async () => {
    const state = await runFamilyAClaimMutation(
      () => useRequestProfileClaim(FAMILY_A) as never,
      "clayton",
    );
    expect(state["a:claims"]).toBe(true);
    expect(state["a:personProfile"]).toBe(true);
    expect(state["a:myProfileClaim"]).toBe(true);
    expect(state["a:myProfile"]).toBe(true);
    // Family B and the default family are untouched.
    expect(state["b:claims"]).toBe(false);
    expect(state["b:personProfile"]).toBe(false);
    expect(state["b:myProfileClaim"]).toBe(false);
    expect(state["b:myProfile"]).toBe(false);
    expect(state["default:claims"]).toBe(false);
    expect(state["default:personProfile"]).toBe(false);
    expect(state["default:myProfileClaim"]).toBe(false);
    expect(state["default:myProfile"]).toBe(false);
  });

  it("useApproveProfileClaim invalidates only Family A's claim and profile caches", async () => {
    const state = await runFamilyAClaimMutation(
      () => useApproveProfileClaim(FAMILY_A) as never,
      7n,
    );
    expect(state["a:claims"]).toBe(true);
    expect(state["a:personProfile"]).toBe(true);
    expect(state["a:myProfileClaim"]).toBe(true);
    expect(state["a:myProfile"]).toBe(true);
    expect(state["b:claims"]).toBe(false);
    expect(state["b:personProfile"]).toBe(false);
    expect(state["b:myProfileClaim"]).toBe(false);
    expect(state["b:myProfile"]).toBe(false);
    expect(state["default:claims"]).toBe(false);
    expect(state["default:personProfile"]).toBe(false);
    expect(state["default:myProfileClaim"]).toBe(false);
    expect(state["default:myProfile"]).toBe(false);
  });

  it("useRejectProfileClaim invalidates only Family A's claim and profile caches", async () => {
    const state = await runFamilyAClaimMutation(
      () => useRejectProfileClaim(FAMILY_A) as never,
      7n,
    );
    expect(state["a:claims"]).toBe(true);
    expect(state["a:personProfile"]).toBe(true);
    expect(state["a:myProfileClaim"]).toBe(true);
    expect(state["a:myProfile"]).toBe(true);
    expect(state["b:claims"]).toBe(false);
    expect(state["b:personProfile"]).toBe(false);
    expect(state["b:myProfileClaim"]).toBe(false);
    expect(state["b:myProfile"]).toBe(false);
    expect(state["default:claims"]).toBe(false);
    expect(state["default:personProfile"]).toBe(false);
    expect(state["default:myProfileClaim"]).toBe(false);
    expect(state["default:myProfile"]).toBe(false);
  });

  it("useCreateMyself invalidates only Family A's person-profile cache", async () => {
    const state = await runFamilyAClaimMutation(
      () => useCreateMyself(FAMILY_A) as never,
      "Clayton Norwood",
    );
    expect(state["a:personProfile"]).toBe(true);
    expect(state["b:personProfile"]).toBe(false);
    expect(state["default:personProfile"]).toBe(false);
    // The claim-list caches are not part of this mutation.
    expect(state["a:claims"]).toBe(false);
    expect(state["a:myProfileClaim"]).toBe(false);
    expect(state["a:myProfile"]).toBe(false);
  });

  it("useUpdateOwnProfile invalidates only Family A's claim/profile caches", async () => {
    const state = await runFamilyAClaimMutation(
      () => useUpdateOwnProfile(FAMILY_A) as never,
      { personId: "clayton", edits: { preferredName: "Clay" } },
    );
    expect(state["a:claims"]).toBe(true);
    expect(state["a:personProfile"]).toBe(true);
    expect(state["a:myProfileClaim"]).toBe(true);
    expect(state["a:myProfile"]).toBe(true);
    // The relationship caches this hook also refreshes stay family-exact.
    expect(state["a:confirmed"]).toBe(true);
    expect(state["a:myRequests"]).toBe(true);
    expect(state["b:claims"]).toBe(false);
    expect(state["b:personProfile"]).toBe(false);
    expect(state["b:myProfileClaim"]).toBe(false);
    expect(state["b:myProfile"]).toBe(false);
    expect(state["b:confirmed"]).toBe(false);
    expect(state["b:myRequests"]).toBe(false);
    expect(state["default:claims"]).toBe(false);
    expect(state["default:personProfile"]).toBe(false);
    expect(state["default:myProfileClaim"]).toBe(false);
    expect(state["default:myProfile"]).toBe(false);
    expect(state["default:confirmed"]).toBe(false);
    expect(state["default:myRequests"]).toBe(false);
  });

  it("a Family B claim mutation invalidates Family B only, not Family A", async () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useRequestProfileClaim(FAMILY_B), {
      wrapper: wrapperFor(queryClient, FAMILY_B),
    });
    seedClaimRelationshipCaches(queryClient);

    await result.current.mutateAsync("clayton");

    const state = readClaimRelationshipState(queryClient);
    expect(state["b:claims"]).toBe(true);
    expect(state["b:personProfile"]).toBe(true);
    expect(state["b:myProfileClaim"]).toBe(true);
    expect(state["b:myProfile"]).toBe(true);
    expect(state["a:claims"]).toBe(false);
    expect(state["a:personProfile"]).toBe(false);
    expect(state["a:myProfileClaim"]).toBe(false);
    expect(state["a:myProfile"]).toBe(false);
    expect(state["default:claims"]).toBe(false);
  });
});

describe("a Family A relationship mutation invalidates only Family A's relationship caches (cover)", () => {
  async function runFamilyARelationshipMutation(
    hook: () => { mutateAsync: (input: never) => Promise<unknown> },
    input: unknown,
  ) {
    const queryClient = makeQueryClient();
    const { result } = renderHook(hook, {
      wrapper: wrapperFor(queryClient, FAMILY_A),
    });
    seedClaimRelationshipCaches(queryClient);

    await result.current.mutateAsync(input as never);

    return readClaimRelationshipState(queryClient);
  }

  it("useProposeRelationship invalidates only Family A's request and my-request caches", async () => {
    const state = await runFamilyARelationshipMutation(
      () => useProposeRelationship(FAMILY_A) as never,
      {
        fromPersonId: "clayton",
        toPersonId: "erma",
        relationshipType: RelationshipType.SpousePartner,
      },
    );
    expect(state["a:requests"]).toBe(true);
    expect(state["a:myRequests"]).toBe(true);
    // Family B and the default family are untouched.
    expect(state["b:requests"]).toBe(false);
    expect(state["b:myRequests"]).toBe(false);
    expect(state["default:requests"]).toBe(false);
    expect(state["default:myRequests"]).toBe(false);
    // The confirmed graph is not part of this mutation.
    expect(state["a:confirmed"]).toBe(false);
  });

  it("useApproveRelationshipRequest invalidates only Family A's request, confirmed, and my-request caches", async () => {
    const state = await runFamilyARelationshipMutation(
      () => useApproveRelationshipRequest(FAMILY_A) as never,
      13n,
    );
    expect(state["a:requests"]).toBe(true);
    expect(state["a:confirmed"]).toBe(true);
    expect(state["a:myRequests"]).toBe(true);
    expect(state["b:requests"]).toBe(false);
    expect(state["b:confirmed"]).toBe(false);
    expect(state["b:myRequests"]).toBe(false);
    expect(state["default:requests"]).toBe(false);
    expect(state["default:confirmed"]).toBe(false);
    expect(state["default:myRequests"]).toBe(false);
  });

  it("useRejectRelationshipRequest invalidates only Family A's request and my-request caches", async () => {
    const state = await runFamilyARelationshipMutation(
      () => useRejectRelationshipRequest(FAMILY_A) as never,
      13n,
    );
    expect(state["a:requests"]).toBe(true);
    expect(state["a:myRequests"]).toBe(true);
    expect(state["b:requests"]).toBe(false);
    expect(state["b:myRequests"]).toBe(false);
    expect(state["default:requests"]).toBe(false);
    expect(state["default:myRequests"]).toBe(false);
    expect(state["a:confirmed"]).toBe(false);
  });

  it("useSetRelationshipRequestPending invalidates only Family A's request and my-request caches", async () => {
    const state = await runFamilyARelationshipMutation(
      () => useSetRelationshipRequestPending(FAMILY_A) as never,
      13n,
    );
    expect(state["a:requests"]).toBe(true);
    expect(state["a:myRequests"]).toBe(true);
    expect(state["b:requests"]).toBe(false);
    expect(state["b:myRequests"]).toBe(false);
    expect(state["default:requests"]).toBe(false);
    expect(state["default:myRequests"]).toBe(false);
    expect(state["a:confirmed"]).toBe(false);
  });

  it("a Family B relationship mutation invalidates Family B only, not Family A", async () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(
      () => useApproveRelationshipRequest(FAMILY_B),
      { wrapper: wrapperFor(queryClient, FAMILY_B) },
    );
    seedClaimRelationshipCaches(queryClient);

    await result.current.mutateAsync(13n);

    const state = readClaimRelationshipState(queryClient);
    expect(state["b:requests"]).toBe(true);
    expect(state["b:confirmed"]).toBe(true);
    expect(state["b:myRequests"]).toBe(true);
    expect(state["a:requests"]).toBe(false);
    expect(state["a:confirmed"]).toBe(false);
    expect(state["a:myRequests"]).toBe(false);
    expect(state["default:requests"]).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Default-family exactness.
// ---------------------------------------------------------------------------

describe("a default-family claim mutation does not invalidate non-default claim/profile caches (cover)", () => {
  async function runDefaultClaimMutation(
    hook: () => { mutateAsync: (input: never) => Promise<unknown> },
    input: unknown,
  ) {
    const queryClient = makeQueryClient();
    const { result } = renderHook(hook, {
      wrapper: wrapperFor(queryClient, undefined),
    });
    seedClaimRelationshipCaches(queryClient);

    await result.current.mutateAsync(input as never);

    return readClaimRelationshipState(queryClient);
  }

  it("useRequestProfileClaim invalidates the exact default claim/profile keys and no family keys", async () => {
    const state = await runDefaultClaimMutation(
      () => useRequestProfileClaim() as never,
      "clayton",
    );
    expect(state["default:claims"]).toBe(true);
    expect(state["default:personProfile"]).toBe(true);
    expect(state["default:myProfileClaim"]).toBe(true);
    expect(state["default:myProfile"]).toBe(true);
    expect(state["a:claims"]).toBe(false);
    expect(state["a:personProfile"]).toBe(false);
    expect(state["a:myProfileClaim"]).toBe(false);
    expect(state["a:myProfile"]).toBe(false);
    expect(state["b:claims"]).toBe(false);
    expect(state["b:personProfile"]).toBe(false);
    expect(state["b:myProfileClaim"]).toBe(false);
    expect(state["b:myProfile"]).toBe(false);
  });

  it("useApproveProfileClaim invalidates the exact default claim/profile keys and no family keys", async () => {
    const state = await runDefaultClaimMutation(
      () => useApproveProfileClaim() as never,
      7n,
    );
    expect(state["default:claims"]).toBe(true);
    expect(state["default:personProfile"]).toBe(true);
    expect(state["default:myProfileClaim"]).toBe(true);
    expect(state["default:myProfile"]).toBe(true);
    expect(state["a:claims"]).toBe(false);
    expect(state["a:personProfile"]).toBe(false);
    expect(state["b:claims"]).toBe(false);
    expect(state["b:personProfile"]).toBe(false);
  });

  it("useRejectProfileClaim invalidates the exact default claim/profile keys and no family keys", async () => {
    const state = await runDefaultClaimMutation(
      () => useRejectProfileClaim() as never,
      7n,
    );
    expect(state["default:claims"]).toBe(true);
    expect(state["default:personProfile"]).toBe(true);
    expect(state["default:myProfileClaim"]).toBe(true);
    expect(state["default:myProfile"]).toBe(true);
    expect(state["a:claims"]).toBe(false);
    expect(state["a:personProfile"]).toBe(false);
    expect(state["b:claims"]).toBe(false);
    expect(state["b:personProfile"]).toBe(false);
  });

  it("useUpdateOwnProfile invalidates the exact default claim/profile keys and no family keys", async () => {
    const state = await runDefaultClaimMutation(
      () => useUpdateOwnProfile() as never,
      { personId: "clayton", edits: { preferredName: "Clay" } },
    );
    expect(state["default:claims"]).toBe(true);
    expect(state["default:personProfile"]).toBe(true);
    expect(state["default:myProfileClaim"]).toBe(true);
    expect(state["default:myProfile"]).toBe(true);
    expect(state["default:confirmed"]).toBe(true);
    expect(state["default:myRequests"]).toBe(true);
    expect(state["a:claims"]).toBe(false);
    expect(state["a:personProfile"]).toBe(false);
    expect(state["a:myProfileClaim"]).toBe(false);
    expect(state["a:myProfile"]).toBe(false);
    expect(state["a:confirmed"]).toBe(false);
    expect(state["a:myRequests"]).toBe(false);
    expect(state["b:claims"]).toBe(false);
    expect(state["b:personProfile"]).toBe(false);
    expect(state["b:confirmed"]).toBe(false);
    expect(state["b:myRequests"]).toBe(false);
  });
});

describe("a default-family relationship mutation does not invalidate non-default relationship caches (cover)", () => {
  async function runDefaultRelationshipMutation(
    hook: () => { mutateAsync: (input: never) => Promise<unknown> },
    input: unknown,
  ) {
    const queryClient = makeQueryClient();
    const { result } = renderHook(hook, {
      wrapper: wrapperFor(queryClient, undefined),
    });
    seedClaimRelationshipCaches(queryClient);

    await result.current.mutateAsync(input as never);

    return readClaimRelationshipState(queryClient);
  }

  it("useProposeRelationship invalidates the exact default request keys and no family keys", async () => {
    const state = await runDefaultRelationshipMutation(
      () => useProposeRelationship() as never,
      {
        fromPersonId: "clayton",
        toPersonId: "erma",
        relationshipType: RelationshipType.SpousePartner,
      },
    );
    expect(state["default:requests"]).toBe(true);
    expect(state["default:myRequests"]).toBe(true);
    expect(state["a:requests"]).toBe(false);
    expect(state["a:myRequests"]).toBe(false);
    expect(state["b:requests"]).toBe(false);
    expect(state["b:myRequests"]).toBe(false);
  });

  it("useApproveRelationshipRequest invalidates the exact default request, confirmed, and my-request keys and no family keys", async () => {
    const state = await runDefaultRelationshipMutation(
      () => useApproveRelationshipRequest() as never,
      13n,
    );
    expect(state["default:requests"]).toBe(true);
    expect(state["default:confirmed"]).toBe(true);
    expect(state["default:myRequests"]).toBe(true);
    expect(state["a:requests"]).toBe(false);
    expect(state["a:confirmed"]).toBe(false);
    expect(state["a:myRequests"]).toBe(false);
    expect(state["b:requests"]).toBe(false);
    expect(state["b:confirmed"]).toBe(false);
    expect(state["b:myRequests"]).toBe(false);
  });

  it("useRejectRelationshipRequest invalidates the exact default request keys and no family keys", async () => {
    const state = await runDefaultRelationshipMutation(
      () => useRejectRelationshipRequest() as never,
      13n,
    );
    expect(state["default:requests"]).toBe(true);
    expect(state["default:myRequests"]).toBe(true);
    expect(state["a:requests"]).toBe(false);
    expect(state["a:myRequests"]).toBe(false);
    expect(state["b:requests"]).toBe(false);
    expect(state["b:myRequests"]).toBe(false);
  });

  it("useSetRelationshipRequestPending invalidates the exact default request keys and no family keys", async () => {
    const state = await runDefaultRelationshipMutation(
      () => useSetRelationshipRequestPending() as never,
      13n,
    );
    expect(state["default:requests"]).toBe(true);
    expect(state["default:myRequests"]).toBe(true);
    expect(state["a:requests"]).toBe(false);
    expect(state["a:myRequests"]).toBe(false);
    expect(state["b:requests"]).toBe(false);
    expect(state["b:myRequests"]).toBe(false);
  });

  it("the default family id is Norwood", () => {
    expect(DEFAULT_FAMILY_ID).toBe("norwood");
  });
});

// ---------------------------------------------------------------------------
// 4. Static source audit: no production claim/relationship invalidation uses a
//    bare cross-family prefix.
// ---------------------------------------------------------------------------

describe("no production claim/relationship invalidation uses a bare cross-family prefix (cover)", () => {
  const HOOKS_DIR = join(process.cwd(), "src", "hooks");
  const CLAIM_HOOK = "useProfileClaims.ts";
  const RELATIONSHIP_HOOK = "useRelationshipRequests.ts";

  function readHook(file: string): string {
    return readFileSync(join(HOOKS_DIR, file), "utf8");
  }

  it("audits the production claim and relationship hook files", () => {
    expect(readHook(CLAIM_HOOK).length).toBeGreaterThan(0);
    expect(readHook(RELATIONSHIP_HOOK).length).toBeGreaterThan(0);
  });

  it("no bare claim/profile queryKey is passed to invalidateQueries", () => {
    // A bare `["profileClaims"]` (etc.) prefix matches every family-appended
    // key, so it would mark another family's cache stale. The helpers build the
    // filter; the hooks must call the helper, not inline the prefix.
    const source = readHook(CLAIM_HOOK);
    const barePrefixes = [
      /invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[\s*["']profileClaims["']\s*\]\s*\}/u,
      /invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[\s*["']personProfile["']\s*\]\s*\}/u,
      /invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[\s*["']myProfileClaim["']\s*\]\s*\}/u,
      /invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[\s*["']myProfile["']\s*\]\s*\}/u,
    ];
    const offenders = barePrefixes.filter((pattern) => pattern.test(source));
    expect(offenders).toEqual([]);
  });

  it("no bare relationship queryKey is passed to invalidateQueries", () => {
    const source = readHook(RELATIONSHIP_HOOK);
    const barePrefixes = [
      /invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[\s*["']relationshipRequests["']\s*\]\s*\}/u,
      /invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[\s*["']confirmedRelationships["']\s*\]\s*\}/u,
      /invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[\s*["']myRelationshipRequests["']\s*\]\s*\}/u,
    ];
    const offenders = barePrefixes.filter((pattern) => pattern.test(source));
    expect(offenders).toEqual([]);
  });

  it("the claim mutation hooks route through the family-aware helpers", () => {
    const source = readHook(CLAIM_HOOK);
    for (const helper of [
      "profileClaimsInvalidation",
      "personProfileInvalidation",
      "myProfileClaimInvalidation",
      "myProfileInvalidation",
    ]) {
      expect(source).toContain(helper);
    }
  });

  it("the relationship mutation hooks route through the family-aware helpers", () => {
    const source = readHook(RELATIONSHIP_HOOK);
    for (const helper of [
      "relationshipRequestsInvalidation",
      "confirmedRelationshipsInvalidation",
      "myRelationshipRequestsInvalidation",
    ]) {
      expect(source).toContain(helper);
    }
  });
});

// Keep the typed fixtures referenced so the imports are not dead and the mock
// stays honest against the app's own exported types.
void seededProfile;
void seededClaim;
void seededRequest;
void seededRelationship;
