import "@testing-library/jest-dom/vitest";
import {
  type DuplicatePair,
  type MergeConflict,
  MergeConflictStatus,
  type ProfileRemovalRequest,
  ProfileRemovalStatus,
  type Result_7,
  type Result_11,
  type Result_18,
  type Result_21,
} from "@/backend";
import { FamilyProvider } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useApproveProfileRemoval,
  useArchiveProfile,
  useListArchivedProfileIds,
  useListArchivedProfiles,
  useListDuplicateCandidates,
  useListProfileRemovalRequests,
  useMergeProfiles,
  useNotDuplicate,
  usePermanentlyDeleteProfile,
  useRejectProfileRemoval,
  useRequestProfileRemoval,
  useResolveMergeConflict,
  useRestoreProfile,
} from "./hooks/useGovernance";

// ---------------------------------------------------------------------------
// Cover for the family-scoped profile-removal, archived-profile, and
// duplicate-profile governance change.
//
// The removal/archive/duplicate hooks in src/frontend/src/hooks/useGovernance.ts
// fork on the centralized active family (`useFamilyScopedId()`):
//
//   * DEFAULT family (familyScopedId === undefined) -> the legacy no-familyId
//     endpoints with the existing bare ['governance', ...] keys, unchanged.
//   * NON-default family -> the canonical `*ForFamily` endpoint with the active
//     familyId as the FIRST argument, and the familyId appended to the read
//     query key so caches never collide:
//       - useRequestProfileRemoval      -> requestProfileRemovalForFamily(familyId, personId, reason)
//       - useListProfileRemovalRequests -> listProfileRemovalRequestsForFamily(familyId)
//       - useApproveProfileRemoval      -> approveProfileRemovalForFamily(familyId, requestId)
//       - useRejectProfileRemoval       -> rejectProfileRemovalForFamily(familyId, requestId)
//       - useArchiveProfile             -> archiveProfileForFamily(familyId, personId)
//       - useRestoreProfile             -> restoreProfileForFamily(familyId, personId)
//       - usePermanentlyDeleteProfile   -> permanentlyDeleteProfileForFamily(familyId, personId, confirmation)
//       - useListArchivedProfiles       -> listArchivedProfilesForFamily(familyId)
//       - useListArchivedProfileIds     -> listArchivedProfileIdsForFamily(familyId)
//       - useListDuplicateCandidates    -> listDuplicateCandidatesForFamily(familyId)
//       - useNotDuplicate               -> notDuplicateForFamily(familyId, personIdA, personIdB)
//       - useMergeProfiles              -> mergeProfilesForFamily(familyId, canonicalPersonId, mergedAwayPersonId)
//       - useResolveMergeConflict       -> resolveMergeConflictForFamily(familyId, conflictId, canonicalValue)
//
// This file pins the non-default branch (the new behavior) and re-asserts the
// default branch at the hook level. It proves the consumer contract — which
// endpoint each hook calls and with which argument tuple, and which query key
// each read registers — over a typed local actor mock. It does not exercise the
// real canister (see coverageLimits).
//
// The default-family contract is frozen separately by
// GovernanceRemovalArchiveDuplicateDefaultFamilyCharacterize; this file must not
// weaken it.
// ---------------------------------------------------------------------------

const STEWARD = Principal.fromText("2vxsx-fae");
const FAMILY_A = "family-a";
const FAMILY_B = "family-b";

type CallLog = Record<string, unknown[][]>;

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: CallLog = {
    requestProfileRemoval: [],
    requestProfileRemovalForFamily: [],
    listProfileRemovalRequests: [],
    listProfileRemovalRequestsForFamily: [],
    approveProfileRemoval: [],
    approveProfileRemovalForFamily: [],
    rejectProfileRemoval: [],
    rejectProfileRemovalForFamily: [],
    archiveProfile: [],
    archiveProfileForFamily: [],
    restoreProfile: [],
    restoreProfileForFamily: [],
    permanentlyDeleteProfile: [],
    permanentlyDeleteProfileForFamily: [],
    listArchivedProfiles: [],
    listArchivedProfilesForFamily: [],
    listArchivedProfileIds: [],
    listArchivedProfileIdsForFamily: [],
    listDuplicateCandidates: [],
    listDuplicateCandidatesForFamily: [],
    notDuplicate: [],
    notDuplicateForFamily: [],
    mergeProfiles: [],
    mergeProfilesForFamily: [],
    resolveMergeConflict: [],
    resolveMergeConflictForFamily: [],
  };

  const mockActor = {
    async requestProfileRemoval(...args: unknown[]): Promise<unknown> {
      calls.requestProfileRemoval.push(args);
      return { __kind__: "ok", ok: {} };
    },
    async requestProfileRemovalForFamily(...args: unknown[]): Promise<unknown> {
      calls.requestProfileRemovalForFamily.push(args);
      return { __kind__: "ok", ok: {} };
    },
    async listProfileRemovalRequests(...args: unknown[]): Promise<unknown> {
      calls.listProfileRemovalRequests.push(args);
      return [];
    },
    async listProfileRemovalRequestsForFamily(
      ...args: unknown[]
    ): Promise<unknown> {
      calls.listProfileRemovalRequestsForFamily.push(args);
      return [];
    },
    async approveProfileRemoval(...args: unknown[]): Promise<unknown> {
      calls.approveProfileRemoval.push(args);
      return null;
    },
    async approveProfileRemovalForFamily(...args: unknown[]): Promise<unknown> {
      calls.approveProfileRemovalForFamily.push(args);
      return null;
    },
    async rejectProfileRemoval(...args: unknown[]): Promise<unknown> {
      calls.rejectProfileRemoval.push(args);
      return null;
    },
    async rejectProfileRemovalForFamily(...args: unknown[]): Promise<unknown> {
      calls.rejectProfileRemovalForFamily.push(args);
      return null;
    },
    async archiveProfile(...args: unknown[]): Promise<unknown> {
      calls.archiveProfile.push(args);
      return { __kind__: "ok", ok: null };
    },
    async archiveProfileForFamily(...args: unknown[]): Promise<unknown> {
      calls.archiveProfileForFamily.push(args);
      return { __kind__: "ok", ok: null };
    },
    async restoreProfile(...args: unknown[]): Promise<unknown> {
      calls.restoreProfile.push(args);
      return { __kind__: "ok", ok: null };
    },
    async restoreProfileForFamily(...args: unknown[]): Promise<unknown> {
      calls.restoreProfileForFamily.push(args);
      return { __kind__: "ok", ok: null };
    },
    async permanentlyDeleteProfile(...args: unknown[]): Promise<unknown> {
      calls.permanentlyDeleteProfile.push(args);
      return { __kind__: "ok", ok: null };
    },
    async permanentlyDeleteProfileForFamily(
      ...args: unknown[]
    ): Promise<unknown> {
      calls.permanentlyDeleteProfileForFamily.push(args);
      return { __kind__: "ok", ok: null };
    },
    async listArchivedProfiles(...args: unknown[]): Promise<unknown> {
      calls.listArchivedProfiles.push(args);
      return [];
    },
    async listArchivedProfilesForFamily(...args: unknown[]): Promise<unknown> {
      calls.listArchivedProfilesForFamily.push(args);
      return [];
    },
    async listArchivedProfileIds(...args: unknown[]): Promise<unknown> {
      calls.listArchivedProfileIds.push(args);
      return [];
    },
    async listArchivedProfileIdsForFamily(
      ...args: unknown[]
    ): Promise<unknown> {
      calls.listArchivedProfileIdsForFamily.push(args);
      return [];
    },
    async listDuplicateCandidates(...args: unknown[]): Promise<unknown> {
      calls.listDuplicateCandidates.push(args);
      return [];
    },
    async listDuplicateCandidatesForFamily(
      ...args: unknown[]
    ): Promise<unknown> {
      calls.listDuplicateCandidatesForFamily.push(args);
      return [];
    },
    async notDuplicate(...args: unknown[]): Promise<unknown> {
      calls.notDuplicate.push(args);
      return { __kind__: "ok", ok: null };
    },
    async notDuplicateForFamily(...args: unknown[]): Promise<unknown> {
      calls.notDuplicateForFamily.push(args);
      return { __kind__: "ok", ok: null };
    },
    async mergeProfiles(...args: unknown[]): Promise<unknown> {
      calls.mergeProfiles.push(args);
      return {
        __kind__: "ok",
        ok: { canonicalPersonId: "", archivedPersonId: "", conflicts: [] },
      };
    },
    async mergeProfilesForFamily(...args: unknown[]): Promise<unknown> {
      calls.mergeProfilesForFamily.push(args);
      return {
        __kind__: "ok",
        ok: { canonicalPersonId: "", archivedPersonId: "", conflicts: [] },
      };
    },
    async resolveMergeConflict(...args: unknown[]): Promise<unknown> {
      calls.resolveMergeConflict.push(args);
      return null;
    },
    async resolveMergeConflictForFamily(...args: unknown[]): Promise<unknown> {
      calls.resolveMergeConflictForFamily.push(args);
      return null;
    },
  };

  return {
    mockActor,
    calls,
    resetCalls: () => {
      for (const key of Object.keys(calls)) {
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
    identity: { getPrincipal: () => STEWARD },
    isInitializing: false,
    isLoggingIn: false,
    isLoginError: false,
    loginError: null,
  }),
}));

afterEach(cleanup);
beforeEach(resetCalls);

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

/** Wraps the hook in a QueryClient and an explicit active family. */
function wrapperFor(familyId: string | undefined) {
  return function Wrapper({ children }: { children: ReactNode }) {
    const queryClient = makeQueryClient();
    const inner = (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return familyId === undefined ? (
      inner
    ) : (
      <FamilyProvider familyId={familyId}>{inner}</FamilyProvider>
    );
  };
}

/** Wraps the hook in a caller-supplied QueryClient and an explicit family. */
function wrapperWithClient(
  queryClient: QueryClient,
  familyId: string | undefined,
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    const inner = (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return familyId === undefined ? (
      inner
    ) : (
      <FamilyProvider familyId={familyId}>{inner}</FamilyProvider>
    );
  };
}

function keyProbe() {
  return useQueryClient();
}

function removalRequest(familyId: string): ProfileRemovalRequest {
  return {
    id: 7n,
    submittedDate: 1_700_000_000_000_000_000n,
    status: ProfileRemovalStatus.Pending,
    reviewedDate: undefined,
    reviewedBy: undefined,
    personId: "julia",
    requestingUserId: STEWARD,
    familyId,
    reason: "Duplicate of another record",
  };
}

function duplicatePair(): DuplicatePair {
  const candidate = (personId: string): DuplicatePair["candidateA"] => ({
    personId,
    name: personId,
    claimStatus: "Unclaimed",
    birthDate: "1860",
    deathDate: "1936",
    parents: [],
    spouses: [],
    children: [],
    photoCount: 0n,
    timelineCount: 0n,
    sourceCount: 0n,
    archiveLinks: [],
  });
  return { candidateA: candidate("julia"), candidateB: candidate("julia-dup") };
}

function mergeConflict(familyId: string): MergeConflict {
  return {
    id: 3n,
    field: "birthDate",
    status: MergeConflictStatus.Pending,
    alternateValue: "1861",
    canonicalValue: "1860",
    familyId,
  };
}

// ---------------------------------------------------------------------------
// Removal request: non-default family routes to the family endpoint
// ---------------------------------------------------------------------------

describe("useRequestProfileRemoval: non-default family routes to the family endpoint (cover)", () => {
  it("Family A calls requestProfileRemovalForFamily('family-a', personId, reason) and not the legacy endpoint", async () => {
    const { result } = renderHook(() => useRequestProfileRemoval(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    result.current.mutate({ personId: "julia", reason: "Duplicate record" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The active familyId is the FIRST positional argument — never hard-coded
    // to "norwood".
    expect(calls.requestProfileRemovalForFamily).toEqual([
      [FAMILY_A, "julia", "Duplicate record"],
    ]);
    expect(calls.requestProfileRemoval).toEqual([]);
  });

  it("Family B passes 'family-b' as the first argument", async () => {
    const { result } = renderHook(() => useRequestProfileRemoval(), {
      wrapper: wrapperFor(FAMILY_B),
    });

    result.current.mutate({ personId: "julia", reason: "Duplicate record" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.requestProfileRemovalForFamily).toEqual([
      [FAMILY_B, "julia", "Duplicate record"],
    ]);
    expect(calls.requestProfileRemoval).toEqual([]);
  });

  it("surfaces the backend Result unchanged for a non-default family", async () => {
    const request = removalRequest(FAMILY_A);
    const okResult: Result_11 = { __kind__: "ok", ok: request };
    mockActor.requestProfileRemovalForFamily = vi.fn(
      async (...args: unknown[]) => {
        calls.requestProfileRemovalForFamily.push(args);
        return okResult;
      },
    );

    const { result } = renderHook(() => useRequestProfileRemoval(), {
      wrapper: wrapperFor(FAMILY_A),
    });
    const returned = await result.current.mutateAsync({
      personId: "julia",
      reason: "Duplicate record",
    });

    expect(returned).toBe(okResult);
  });

  it("a non-default family invalidates only the active family's removal-request keys", async () => {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(
      ["governance", "profileRemovalRequests", FAMILY_A],
      [],
    );
    queryClient.setQueryData(
      ["governance", "profileRemovalRequests", FAMILY_B],
      [],
    );

    const { result } = renderHook(() => useRequestProfileRemoval(), {
      wrapper: wrapperWithClient(queryClient, FAMILY_A),
    });
    result.current.mutate({ personId: "julia", reason: "Duplicate record" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const isInvalidated = (key: unknown[]) =>
      queryClient.getQueryState(key)?.isInvalidated ?? false;
    expect(
      isInvalidated(["governance", "profileRemovalRequests", FAMILY_A]),
    ).toBe(true);
    expect(
      isInvalidated(["governance", "profileRemovalRequests", FAMILY_B]),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Removal request read: non-default family routes to the family endpoint
// ---------------------------------------------------------------------------

describe("useListProfileRemovalRequests: non-default family routes to the family endpoint (cover)", () => {
  it("Family A calls listProfileRemovalRequestsForFamily('family-a') and not the legacy endpoint", async () => {
    const { result } = renderHook(() => useListProfileRemovalRequests(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listProfileRemovalRequestsForFamily).toEqual([[FAMILY_A]]);
    expect(calls.listProfileRemovalRequests).toEqual([]);
  });

  it("registers ['governance','profileRemovalRequests',familyId] for a non-default family", async () => {
    const { result } = renderHook(
      () => ({
        requests: useListProfileRemovalRequests(),
        client: keyProbe(),
      }),
      { wrapper: wrapperFor(FAMILY_A) },
    );

    await waitFor(() => expect(result.current.requests.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual([
      "governance",
      "profileRemovalRequests",
      FAMILY_A,
    ]);
    // The legacy bare key must not be registered for a non-default family.
    expect(keys).not.toContainEqual(["governance", "profileRemovalRequests"]);
  });

  it("surfaces the removal requests the family endpoint returns", async () => {
    const requests = [removalRequest(FAMILY_A)];
    mockActor.listProfileRemovalRequestsForFamily = vi.fn(
      async (...args: unknown[]) => {
        calls.listProfileRemovalRequestsForFamily.push(args);
        return requests;
      },
    );

    const { result } = renderHook(() => useListProfileRemovalRequests(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(requests);
  });
});

// ---------------------------------------------------------------------------
// Approve / reject: non-default family routes to the family endpoint
// ---------------------------------------------------------------------------

describe("useApproveProfileRemoval: non-default family routes to the family endpoint (cover)", () => {
  it("Family A calls approveProfileRemovalForFamily('family-a', requestId) and not the legacy endpoint", async () => {
    const { result } = renderHook(() => useApproveProfileRemoval(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    result.current.mutate(7n);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.approveProfileRemovalForFamily).toEqual([[FAMILY_A, 7n]]);
    expect(calls.approveProfileRemoval).toEqual([]);
  });

  it("Family B passes 'family-b' as the first argument", async () => {
    const { result } = renderHook(() => useApproveProfileRemoval(), {
      wrapper: wrapperFor(FAMILY_B),
    });

    result.current.mutate(7n);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.approveProfileRemovalForFamily).toEqual([[FAMILY_B, 7n]]);
    expect(calls.approveProfileRemoval).toEqual([]);
  });

  it("a non-default family invalidates only the active family's removal-request keys", async () => {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(
      ["governance", "profileRemovalRequests", FAMILY_A],
      [],
    );
    queryClient.setQueryData(
      ["governance", "profileRemovalRequests", FAMILY_B],
      [],
    );

    const { result } = renderHook(() => useApproveProfileRemoval(), {
      wrapper: wrapperWithClient(queryClient, FAMILY_A),
    });
    result.current.mutate(7n);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const isInvalidated = (key: unknown[]) =>
      queryClient.getQueryState(key)?.isInvalidated ?? false;
    expect(
      isInvalidated(["governance", "profileRemovalRequests", FAMILY_A]),
    ).toBe(true);
    expect(
      isInvalidated(["governance", "profileRemovalRequests", FAMILY_B]),
    ).toBe(false);
  });
});

describe("useRejectProfileRemoval: non-default family routes to the family endpoint (cover)", () => {
  it("Family A calls rejectProfileRemovalForFamily('family-a', requestId) and not the legacy endpoint", async () => {
    const { result } = renderHook(() => useRejectProfileRemoval(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    result.current.mutate(7n);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.rejectProfileRemovalForFamily).toEqual([[FAMILY_A, 7n]]);
    expect(calls.rejectProfileRemoval).toEqual([]);
  });

  it("Family B passes 'family-b' as the first argument", async () => {
    const { result } = renderHook(() => useRejectProfileRemoval(), {
      wrapper: wrapperFor(FAMILY_B),
    });

    result.current.mutate(7n);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.rejectProfileRemovalForFamily).toEqual([[FAMILY_B, 7n]]);
    expect(calls.rejectProfileRemoval).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Archive / restore / permanent delete: non-default family routes to the family endpoint
// ---------------------------------------------------------------------------

describe("useArchiveProfile: non-default family routes to the family endpoint (cover)", () => {
  it("Family A calls archiveProfileForFamily('family-a', personId) and not the legacy endpoint", async () => {
    const { result } = renderHook(() => useArchiveProfile(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    result.current.mutate("julia");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.archiveProfileForFamily).toEqual([[FAMILY_A, "julia"]]);
    expect(calls.archiveProfile).toEqual([]);
  });

  it("Family B passes 'family-b' as the first argument", async () => {
    const { result } = renderHook(() => useArchiveProfile(), {
      wrapper: wrapperFor(FAMILY_B),
    });

    result.current.mutate("julia");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.archiveProfileForFamily).toEqual([[FAMILY_B, "julia"]]);
    expect(calls.archiveProfile).toEqual([]);
  });

  it("surfaces the backend Result unchanged for a non-default family", async () => {
    const okResult: Result_7 = { __kind__: "ok", ok: null };
    mockActor.archiveProfileForFamily = vi.fn(async (...args: unknown[]) => {
      calls.archiveProfileForFamily.push(args);
      return okResult;
    });

    const { result } = renderHook(() => useArchiveProfile(), {
      wrapper: wrapperFor(FAMILY_A),
    });
    const returned = await result.current.mutateAsync("julia");

    expect(returned).toBe(okResult);
  });

  it("a non-default family invalidates only the active family's archived-profile keys", async () => {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(["governance", "archivedProfiles", FAMILY_A], []);
    queryClient.setQueryData(["governance", "archivedProfiles", FAMILY_B], []);

    const { result } = renderHook(() => useArchiveProfile(), {
      wrapper: wrapperWithClient(queryClient, FAMILY_A),
    });
    result.current.mutate("julia");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const isInvalidated = (key: unknown[]) =>
      queryClient.getQueryState(key)?.isInvalidated ?? false;
    expect(isInvalidated(["governance", "archivedProfiles", FAMILY_A])).toBe(
      true,
    );
    expect(isInvalidated(["governance", "archivedProfiles", FAMILY_B])).toBe(
      false,
    );
  });
});

describe("useRestoreProfile: non-default family routes to the family endpoint (cover)", () => {
  it("Family A calls restoreProfileForFamily('family-a', personId) and not the legacy endpoint", async () => {
    const { result } = renderHook(() => useRestoreProfile(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    result.current.mutate("julia");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.restoreProfileForFamily).toEqual([[FAMILY_A, "julia"]]);
    expect(calls.restoreProfile).toEqual([]);
  });

  it("Family B passes 'family-b' as the first argument", async () => {
    const { result } = renderHook(() => useRestoreProfile(), {
      wrapper: wrapperFor(FAMILY_B),
    });

    result.current.mutate("julia");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.restoreProfileForFamily).toEqual([[FAMILY_B, "julia"]]);
    expect(calls.restoreProfile).toEqual([]);
  });
});

describe("usePermanentlyDeleteProfile: non-default family routes to the family endpoint (cover)", () => {
  it("Family A calls permanentlyDeleteProfileForFamily('family-a', personId, confirmation) and not the legacy endpoint", async () => {
    const { result } = renderHook(() => usePermanentlyDeleteProfile(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    result.current.mutate({ personId: "julia", confirmation: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.permanentlyDeleteProfileForFamily).toEqual([
      [FAMILY_A, "julia", true],
    ]);
    expect(calls.permanentlyDeleteProfile).toEqual([]);
  });

  it("Family B passes 'family-b' as the first argument", async () => {
    const { result } = renderHook(() => usePermanentlyDeleteProfile(), {
      wrapper: wrapperFor(FAMILY_B),
    });

    result.current.mutate({ personId: "julia", confirmation: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.permanentlyDeleteProfileForFamily).toEqual([
      [FAMILY_B, "julia", true],
    ]);
    expect(calls.permanentlyDeleteProfile).toEqual([]);
  });

  it("surfaces the backend Result unchanged for a non-default family", async () => {
    const okResult: Result_18 = { __kind__: "ok", ok: null };
    mockActor.permanentlyDeleteProfileForFamily = vi.fn(
      async (...args: unknown[]) => {
        calls.permanentlyDeleteProfileForFamily.push(args);
        return okResult;
      },
    );

    const { result } = renderHook(() => usePermanentlyDeleteProfile(), {
      wrapper: wrapperFor(FAMILY_A),
    });
    const returned = await result.current.mutateAsync({
      personId: "julia",
      confirmation: true,
    });

    expect(returned).toBe(okResult);
  });
});

// ---------------------------------------------------------------------------
// Archived reads: non-default family routes to the family endpoint
// ---------------------------------------------------------------------------

describe("useListArchivedProfiles: non-default family routes to the family endpoint (cover)", () => {
  it("Family A calls listArchivedProfilesForFamily('family-a') and not the legacy endpoint", async () => {
    const { result } = renderHook(() => useListArchivedProfiles(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listArchivedProfilesForFamily).toEqual([[FAMILY_A]]);
    expect(calls.listArchivedProfiles).toEqual([]);
  });

  it("registers ['governance','archivedProfiles',familyId] for a non-default family", async () => {
    const { result } = renderHook(
      () => ({
        archived: useListArchivedProfiles(),
        client: keyProbe(),
      }),
      { wrapper: wrapperFor(FAMILY_A) },
    );

    await waitFor(() => expect(result.current.archived.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["governance", "archivedProfiles", FAMILY_A]);
    expect(keys).not.toContainEqual(["governance", "archivedProfiles"]);
  });
});

describe("useListArchivedProfileIds: non-default family routes to the family endpoint (cover)", () => {
  it("Family A calls listArchivedProfileIdsForFamily('family-a') and not the legacy endpoint", async () => {
    const { result } = renderHook(() => useListArchivedProfileIds(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listArchivedProfileIdsForFamily).toEqual([[FAMILY_A]]);
    expect(calls.listArchivedProfileIds).toEqual([]);
  });

  it("registers ['governance','archivedProfileIds',familyId] for a non-default family", async () => {
    const { result } = renderHook(
      () => ({
        ids: useListArchivedProfileIds(),
        client: keyProbe(),
      }),
      { wrapper: wrapperFor(FAMILY_A) },
    );

    await waitFor(() => expect(result.current.ids.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["governance", "archivedProfileIds", FAMILY_A]);
    expect(keys).not.toContainEqual(["governance", "archivedProfileIds"]);
  });
});

// ---------------------------------------------------------------------------
// Duplicate reads and merge: non-default family routes to the family endpoint
// ---------------------------------------------------------------------------

describe("useListDuplicateCandidates: non-default family routes to the family endpoint (cover)", () => {
  it("Family A calls listDuplicateCandidatesForFamily('family-a') and not the legacy endpoint", async () => {
    const { result } = renderHook(() => useListDuplicateCandidates(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listDuplicateCandidatesForFamily).toEqual([[FAMILY_A]]);
    expect(calls.listDuplicateCandidates).toEqual([]);
  });

  it("registers ['governance','duplicateCandidates',familyId] for a non-default family", async () => {
    const { result } = renderHook(
      () => ({
        candidates: useListDuplicateCandidates(),
        client: keyProbe(),
      }),
      { wrapper: wrapperFor(FAMILY_A) },
    );

    await waitFor(() => expect(result.current.candidates.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual([
      "governance",
      "duplicateCandidates",
      FAMILY_A,
    ]);
    expect(keys).not.toContainEqual(["governance", "duplicateCandidates"]);
  });

  it("surfaces the duplicate pairs the family endpoint returns", async () => {
    const pairs = [duplicatePair()];
    mockActor.listDuplicateCandidatesForFamily = vi.fn(
      async (...args: unknown[]) => {
        calls.listDuplicateCandidatesForFamily.push(args);
        return pairs;
      },
    );

    const { result } = renderHook(() => useListDuplicateCandidates(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(pairs);
  });
});

describe("useNotDuplicate: non-default family routes to the family endpoint (cover)", () => {
  it("Family A calls notDuplicateForFamily('family-a', personIdA, personIdB) in that order and not the legacy endpoint", async () => {
    const { result } = renderHook(() => useNotDuplicate(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    result.current.mutate({ personIdA: "julia", personIdB: "julia-dup" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.notDuplicateForFamily).toEqual([
      [FAMILY_A, "julia", "julia-dup"],
    ]);
    expect(calls.notDuplicate).toEqual([]);
  });

  it("Family B passes 'family-b' as the first argument", async () => {
    const { result } = renderHook(() => useNotDuplicate(), {
      wrapper: wrapperFor(FAMILY_B),
    });

    result.current.mutate({ personIdA: "julia", personIdB: "julia-dup" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.notDuplicateForFamily).toEqual([
      [FAMILY_B, "julia", "julia-dup"],
    ]);
    expect(calls.notDuplicate).toEqual([]);
  });

  it("surfaces the backend Result unchanged for a non-default family", async () => {
    const okResult: Result_18 = { __kind__: "ok", ok: null };
    mockActor.notDuplicateForFamily = vi.fn(async (...args: unknown[]) => {
      calls.notDuplicateForFamily.push(args);
      return okResult;
    });

    const { result } = renderHook(() => useNotDuplicate(), {
      wrapper: wrapperFor(FAMILY_A),
    });
    const returned = await result.current.mutateAsync({
      personIdA: "julia",
      personIdB: "julia-dup",
    });

    expect(returned).toBe(okResult);
  });
});

describe("useMergeProfiles: non-default family routes to the family endpoint (cover)", () => {
  it("Family A calls mergeProfilesForFamily('family-a', canonicalPersonId, mergedAwayPersonId) in that order and not the legacy endpoint", async () => {
    const { result } = renderHook(() => useMergeProfiles(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    result.current.mutate({
      canonicalPersonId: "julia",
      mergedAwayPersonId: "julia-dup",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.mergeProfilesForFamily).toEqual([
      [FAMILY_A, "julia", "julia-dup"],
    ]);
    expect(calls.mergeProfiles).toEqual([]);
  });

  it("Family B passes 'family-b' as the first argument", async () => {
    const { result } = renderHook(() => useMergeProfiles(), {
      wrapper: wrapperFor(FAMILY_B),
    });

    result.current.mutate({
      canonicalPersonId: "julia",
      mergedAwayPersonId: "julia-dup",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.mergeProfilesForFamily).toEqual([
      [FAMILY_B, "julia", "julia-dup"],
    ]);
    expect(calls.mergeProfiles).toEqual([]);
  });

  it("surfaces the backend Result unchanged for a non-default family", async () => {
    const mergeResult = {
      canonicalPersonId: "julia",
      archivedPersonId: "julia-dup",
      conflicts: [mergeConflict(FAMILY_A)],
    };
    const okResult: Result_21 = { __kind__: "ok", ok: mergeResult };
    mockActor.mergeProfilesForFamily = vi.fn(async (...args: unknown[]) => {
      calls.mergeProfilesForFamily.push(args);
      return okResult;
    });

    const { result } = renderHook(() => useMergeProfiles(), {
      wrapper: wrapperFor(FAMILY_A),
    });
    const returned = await result.current.mutateAsync({
      canonicalPersonId: "julia",
      mergedAwayPersonId: "julia-dup",
    });

    expect(returned).toBe(okResult);
  });

  it("a non-default family invalidates only the active family's duplicate-candidate keys", async () => {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(
      ["governance", "duplicateCandidates", FAMILY_A],
      [],
    );
    queryClient.setQueryData(
      ["governance", "duplicateCandidates", FAMILY_B],
      [],
    );

    const { result } = renderHook(() => useMergeProfiles(), {
      wrapper: wrapperWithClient(queryClient, FAMILY_A),
    });
    result.current.mutate({
      canonicalPersonId: "julia",
      mergedAwayPersonId: "julia-dup",
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const isInvalidated = (key: unknown[]) =>
      queryClient.getQueryState(key)?.isInvalidated ?? false;
    expect(isInvalidated(["governance", "duplicateCandidates", FAMILY_A])).toBe(
      true,
    );
    expect(isInvalidated(["governance", "duplicateCandidates", FAMILY_B])).toBe(
      false,
    );
  });
});

describe("useResolveMergeConflict: non-default family routes to the family endpoint (cover)", () => {
  it("Family A calls resolveMergeConflictForFamily('family-a', conflictId, canonicalValue) in that order and not the legacy endpoint", async () => {
    const { result } = renderHook(() => useResolveMergeConflict(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    result.current.mutate({ conflictId: 3n, canonicalValue: "1860" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.resolveMergeConflictForFamily).toEqual([
      [FAMILY_A, 3n, "1860"],
    ]);
    expect(calls.resolveMergeConflict).toEqual([]);
  });

  it("Family B passes 'family-b' as the first argument", async () => {
    const { result } = renderHook(() => useResolveMergeConflict(), {
      wrapper: wrapperFor(FAMILY_B),
    });

    result.current.mutate({ conflictId: 3n, canonicalValue: "1860" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.resolveMergeConflictForFamily).toEqual([
      [FAMILY_B, 3n, "1860"],
    ]);
    expect(calls.resolveMergeConflict).toEqual([]);
  });

  it("surfaces the backend result unchanged for a non-default family", async () => {
    const conflict = mergeConflict(FAMILY_A);
    mockActor.resolveMergeConflictForFamily = vi.fn(
      async (...args: unknown[]) => {
        calls.resolveMergeConflictForFamily.push(args);
        return conflict;
      },
    );

    const { result } = renderHook(() => useResolveMergeConflict(), {
      wrapper: wrapperFor(FAMILY_A),
    });
    const returned = await result.current.mutateAsync({
      conflictId: 3n,
      canonicalValue: "1860",
    });

    expect(returned).toBe(conflict);
  });
});

// ---------------------------------------------------------------------------
// Default family keeps the exact legacy call shapes and bare keys
// ---------------------------------------------------------------------------

describe("default family keeps the legacy call shapes and bare keys (cover)", () => {
  it("with no family provider mounted, every hook uses its legacy endpoint and bare key", async () => {
    const request = renderHook(() => useRequestProfileRemoval(), {
      wrapper: wrapperFor(undefined),
    });
    request.result.current.mutate({ personId: "julia", reason: "Duplicate" });
    await waitFor(() => expect(request.result.current.isSuccess).toBe(true));

    const list = renderHook(
      () => ({
        requests: useListProfileRemovalRequests(),
        client: keyProbe(),
      }),
      { wrapper: wrapperFor(undefined) },
    );
    await waitFor(() =>
      expect(list.result.current.requests.isSuccess).toBe(true),
    );

    const approve = renderHook(() => useApproveProfileRemoval(), {
      wrapper: wrapperFor(undefined),
    });
    approve.result.current.mutate(7n);
    await waitFor(() => expect(approve.result.current.isSuccess).toBe(true));

    const reject = renderHook(() => useRejectProfileRemoval(), {
      wrapper: wrapperFor(undefined),
    });
    reject.result.current.mutate(7n);
    await waitFor(() => expect(reject.result.current.isSuccess).toBe(true));

    const archive = renderHook(() => useArchiveProfile(), {
      wrapper: wrapperFor(undefined),
    });
    archive.result.current.mutate("julia");
    await waitFor(() => expect(archive.result.current.isSuccess).toBe(true));

    const restore = renderHook(() => useRestoreProfile(), {
      wrapper: wrapperFor(undefined),
    });
    restore.result.current.mutate("julia");
    await waitFor(() => expect(restore.result.current.isSuccess).toBe(true));

    const del = renderHook(() => usePermanentlyDeleteProfile(), {
      wrapper: wrapperFor(undefined),
    });
    del.result.current.mutate({ personId: "julia", confirmation: true });
    await waitFor(() => expect(del.result.current.isSuccess).toBe(true));

    const archived = renderHook(
      () => ({
        profiles: useListArchivedProfiles(),
        ids: useListArchivedProfileIds(),
        client: keyProbe(),
      }),
      { wrapper: wrapperFor(undefined) },
    );
    await waitFor(() =>
      expect(archived.result.current.profiles.isSuccess).toBe(true),
    );
    await waitFor(() =>
      expect(archived.result.current.ids.isSuccess).toBe(true),
    );

    const duplicates = renderHook(
      () => ({
        candidates: useListDuplicateCandidates(),
        client: keyProbe(),
      }),
      { wrapper: wrapperFor(undefined) },
    );
    await waitFor(() =>
      expect(duplicates.result.current.candidates.isSuccess).toBe(true),
    );

    const notDup = renderHook(() => useNotDuplicate(), {
      wrapper: wrapperFor(undefined),
    });
    notDup.result.current.mutate({
      personIdA: "julia",
      personIdB: "julia-dup",
    });
    await waitFor(() => expect(notDup.result.current.isSuccess).toBe(true));

    const merge = renderHook(() => useMergeProfiles(), {
      wrapper: wrapperFor(undefined),
    });
    merge.result.current.mutate({
      canonicalPersonId: "julia",
      mergedAwayPersonId: "julia-dup",
    });
    await waitFor(() => expect(merge.result.current.isSuccess).toBe(true));

    const resolve = renderHook(() => useResolveMergeConflict(), {
      wrapper: wrapperFor(undefined),
    });
    resolve.result.current.mutate({ conflictId: 3n, canonicalValue: "1860" });
    await waitFor(() => expect(resolve.result.current.isSuccess).toBe(true));

    // Every legacy endpoint is called with the exact legacy argument tuple.
    expect(calls.requestProfileRemoval).toEqual([["julia", "Duplicate"]]);
    expect(calls.listProfileRemovalRequests).toEqual([[]]);
    expect(calls.approveProfileRemoval).toEqual([[7n]]);
    expect(calls.rejectProfileRemoval).toEqual([[7n]]);
    expect(calls.archiveProfile).toEqual([["julia"]]);
    expect(calls.restoreProfile).toEqual([["julia"]]);
    expect(calls.permanentlyDeleteProfile).toEqual([["julia", true]]);
    expect(calls.listArchivedProfiles).toEqual([[]]);
    expect(calls.listArchivedProfileIds).toEqual([[]]);
    expect(calls.listDuplicateCandidates).toEqual([[]]);
    expect(calls.notDuplicate).toEqual([["julia", "julia-dup"]]);
    expect(calls.mergeProfiles).toEqual([["julia", "julia-dup"]]);
    expect(calls.resolveMergeConflict).toEqual([[3n, "1860"]]);

    // No family endpoint is called for the default family.
    expect(calls.requestProfileRemovalForFamily).toEqual([]);
    expect(calls.listProfileRemovalRequestsForFamily).toEqual([]);
    expect(calls.approveProfileRemovalForFamily).toEqual([]);
    expect(calls.rejectProfileRemovalForFamily).toEqual([]);
    expect(calls.archiveProfileForFamily).toEqual([]);
    expect(calls.restoreProfileForFamily).toEqual([]);
    expect(calls.permanentlyDeleteProfileForFamily).toEqual([]);
    expect(calls.listArchivedProfilesForFamily).toEqual([]);
    expect(calls.listArchivedProfileIdsForFamily).toEqual([]);
    expect(calls.listDuplicateCandidatesForFamily).toEqual([]);
    expect(calls.notDuplicateForFamily).toEqual([]);
    expect(calls.mergeProfilesForFamily).toEqual([]);
    expect(calls.resolveMergeConflictForFamily).toEqual([]);

    // The reads register the exact legacy bare keys.
    const keys = list.result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["governance", "profileRemovalRequests"]);
    const archivedKeys = archived.result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(archivedKeys).toContainEqual(["governance", "archivedProfiles"]);
    expect(archivedKeys).toContainEqual(["governance", "archivedProfileIds"]);
    const duplicateKeys = duplicates.result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(duplicateKeys).toContainEqual(["governance", "duplicateCandidates"]);
  });

  it("with familyId 'norwood', keeps the legacy no-familyId call", async () => {
    const { result } = renderHook(() => useArchiveProfile(), {
      wrapper: wrapperFor("norwood"),
    });

    result.current.mutate("julia");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.archiveProfile).toEqual([["julia"]]);
    expect(calls.archiveProfileForFamily).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Family A and Family B do not share a cache entry for the same read
// ---------------------------------------------------------------------------

describe("family-separated caches (cover)", () => {
  it("Family A and Family B do not share an archived-profile cache entry", async () => {
    const familyA = renderHook(
      () => ({
        archived: useListArchivedProfiles(),
        client: keyProbe(),
      }),
      { wrapper: wrapperFor(FAMILY_A) },
    );
    await waitFor(() =>
      expect(familyA.result.current.archived.isSuccess).toBe(true),
    );
    const keysA = familyA.result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);

    const familyB = renderHook(
      () => ({
        archived: useListArchivedProfiles(),
        client: keyProbe(),
      }),
      { wrapper: wrapperFor(FAMILY_B) },
    );
    await waitFor(() =>
      expect(familyB.result.current.archived.isSuccess).toBe(true),
    );
    const keysB = familyB.result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);

    expect(keysA).toContainEqual(["governance", "archivedProfiles", FAMILY_A]);
    expect(keysB).toContainEqual(["governance", "archivedProfiles", FAMILY_B]);
    expect(keysA).not.toContainEqual([
      "governance",
      "archivedProfiles",
      FAMILY_B,
    ]);
    expect(keysB).not.toContainEqual([
      "governance",
      "archivedProfiles",
      FAMILY_A,
    ]);
    expect(keysA).not.toEqual(keysB);
  });
});
