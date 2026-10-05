import "@testing-library/jest-dom/vitest";
import {
  type DuplicatePair,
  type MergeConflict,
  MergeConflictStatus,
  type PersonProfile,
  type ProfileRemovalRequest,
  ProfileRemovalStatus,
  type Result_5,
  type Result_9,
  type Result_16,
  type Result_17,
  type Result_19,
} from "@/backend";
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
// Characterization baseline for the family-scoped profile-removal,
// archived-profile, and duplicate-profile governance change.
//
// The requested change makes the profile-removal, archive, and duplicate flows
// family-scoped: canonical `*ForFamily` backend endpoints plus frontend hooks
// that fork on `useFamilyScopedId()`. The accepted criterion is that the
// DEFAULT family (Norwood, `familyScopedId === undefined`) keeps its existing
// behavior exactly.
//
// This file freezes the CURRENT DEFAULT-FAMILY behavior of the hooks the change
// touches:
//
//   * useRequestProfileRemoval      -> requestProfileRemoval(personId, reason)
//   * useListProfileRemovalRequests -> listProfileRemovalRequests()
//   * useApproveProfileRemoval      -> approveProfileRemoval(requestId)
//   * useRejectProfileRemoval       -> rejectProfileRemoval(requestId)
//   * useArchiveProfile             -> archiveProfile(personId)
//   * useRestoreProfile             -> restoreProfile(personId)
//   * usePermanentlyDeleteProfile   -> permanentlyDeleteProfile(personId, confirmation)
//   * useListArchivedProfiles       -> listArchivedProfiles()
//   * useListArchivedProfileIds     -> listArchivedProfileIds()
//   * useListDuplicateCandidates    -> listDuplicateCandidates()
//   * useNotDuplicate               -> notDuplicate(personIdA, personIdB)
//   * useMergeProfiles              -> mergeProfiles(canonicalPersonId, mergedAwayPersonId)
//   * useResolveMergeConflict       -> resolveMergeConflict(conflictId, canonicalValue)
//
// For each it asserts the legacy no-familyId method name, the exact argument
// tuple, the bare `["governance", ...]` query key the read registers, and the
// invalidation surface each mutation applies. That is the seam the family fork
// must keep compatible for the default family.
//
// It deliberately does NOT assert the absence of a `familyId` argument or the
// absence of `*ForFamily` methods: adding those is exactly the change under
// way. It also does NOT freeze the legacy-only call shape for a non-default
// family, which is the behavior the change intentionally introduces. It does
// not assert two-family isolation, which is new behavior rather than existing
// behavior to protect.
//
// This is component/integration coverage over a typed local actor mock; it does
// not exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const STEWARD = Principal.fromText("2vxsx-fae");

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    requestProfileRemoval: unknown[][];
    listProfileRemovalRequests: unknown[][];
    approveProfileRemoval: unknown[][];
    rejectProfileRemoval: unknown[][];
    archiveProfile: unknown[][];
    restoreProfile: unknown[][];
    permanentlyDeleteProfile: unknown[][];
    listArchivedProfiles: unknown[][];
    listArchivedProfileIds: unknown[][];
    listDuplicateCandidates: unknown[][];
    notDuplicate: unknown[][];
    mergeProfiles: unknown[][];
    resolveMergeConflict: unknown[][];
  } = {
    requestProfileRemoval: [],
    listProfileRemovalRequests: [],
    approveProfileRemoval: [],
    rejectProfileRemoval: [],
    archiveProfile: [],
    restoreProfile: [],
    permanentlyDeleteProfile: [],
    listArchivedProfiles: [],
    listArchivedProfileIds: [],
    listDuplicateCandidates: [],
    notDuplicate: [],
    mergeProfiles: [],
    resolveMergeConflict: [],
  };

  const mockActor = {
    async requestProfileRemoval(...args: unknown[]): Promise<unknown> {
      calls.requestProfileRemoval.push(args);
      return { __kind__: "ok", ok: {} };
    },
    async listProfileRemovalRequests(...args: unknown[]): Promise<unknown> {
      calls.listProfileRemovalRequests.push(args);
      return [];
    },
    async approveProfileRemoval(...args: unknown[]): Promise<unknown> {
      calls.approveProfileRemoval.push(args);
      return null;
    },
    async rejectProfileRemoval(...args: unknown[]): Promise<unknown> {
      calls.rejectProfileRemoval.push(args);
      return null;
    },
    async archiveProfile(...args: unknown[]): Promise<unknown> {
      calls.archiveProfile.push(args);
      return { __kind__: "ok", ok: null };
    },
    async restoreProfile(...args: unknown[]): Promise<unknown> {
      calls.restoreProfile.push(args);
      return { __kind__: "ok", ok: null };
    },
    async permanentlyDeleteProfile(...args: unknown[]): Promise<unknown> {
      calls.permanentlyDeleteProfile.push(args);
      return { __kind__: "ok", ok: null };
    },
    async listArchivedProfiles(...args: unknown[]): Promise<unknown> {
      calls.listArchivedProfiles.push(args);
      return [];
    },
    async listArchivedProfileIds(...args: unknown[]): Promise<unknown> {
      calls.listArchivedProfileIds.push(args);
      return [];
    },
    async listDuplicateCandidates(...args: unknown[]): Promise<unknown> {
      calls.listDuplicateCandidates.push(args);
      return [];
    },
    async notDuplicate(...args: unknown[]): Promise<unknown> {
      calls.notDuplicate.push(args);
      return { __kind__: "ok", ok: null };
    },
    async mergeProfiles(...args: unknown[]): Promise<unknown> {
      calls.mergeProfiles.push(args);
      return {
        __kind__: "ok",
        ok: { canonicalPersonId: "", archivedPersonId: "", conflicts: [] },
      };
    },
    async resolveMergeConflict(...args: unknown[]): Promise<unknown> {
      calls.resolveMergeConflict.push(args);
      return null;
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
    identity: { getPrincipal: () => STEWARD },
    isInitializing: false,
    isLoggingIn: false,
    isLoginError: false,
    loginError: null,
  }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

afterEach(cleanup);
beforeEach(resetCalls);

function removalRequest(): ProfileRemovalRequest {
  return {
    id: 7n,
    submittedDate: 1_700_000_000_000_000_000n,
    status: ProfileRemovalStatus.Pending,
    reviewedDate: undefined,
    reviewedBy: undefined,
    personId: "julia",
    requestingUserId: STEWARD,
    familyId: "norwood",
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

function mergeConflict(): MergeConflict {
  return {
    id: 3n,
    field: "birthDate",
    status: MergeConflictStatus.Pending,
    alternateValue: "1861",
    canonicalValue: "1860",
    familyId: "norwood",
  };
}

describe("useRequestProfileRemoval: default-family consumer contract (characterization)", () => {
  it("calls requestProfileRemoval(personId, reason) with no familyId argument", async () => {
    const { result } = renderHook(() => useRequestProfileRemoval(), {
      wrapper,
    });

    result.current.mutate({ personId: "julia", reason: "Duplicate record" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The legacy method takes exactly the personId and reason; the default
    // family is the backend's concern, not an argument the hook supplies.
    expect(calls.requestProfileRemoval).toEqual([
      ["julia", "Duplicate record"],
    ]);
  });

  it("surfaces the backend result unchanged", async () => {
    const request = removalRequest();
    mockActor.requestProfileRemoval = vi.fn(async (...args: unknown[]) => {
      calls.requestProfileRemoval.push(args);
      return { __kind__: "ok", ok: request } satisfies Result_9;
    });

    const { result } = renderHook(() => useRequestProfileRemoval(), {
      wrapper,
    });
    result.current.mutate({ personId: "julia", reason: "Duplicate record" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ __kind__: "ok", ok: request });
  });

  it("invalidates the removal-request list and audit history", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useRequestProfileRemoval(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });
    result.current.mutate({ personId: "julia", reason: "Duplicate record" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(["governance", "profileRemovalRequests"]);
    expect(keys).toContainEqual(["governance", "auditHistory"]);
  });
});

describe("useListProfileRemovalRequests: default-family consumer contract (characterization)", () => {
  it("calls listProfileRemovalRequests() with no arguments", async () => {
    const { result } = renderHook(() => useListProfileRemovalRequests(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listProfileRemovalRequests).toEqual([[]]);
  });

  it("registers the legacy ['governance','profileRemovalRequests'] key for the default family", async () => {
    const { result } = renderHook(
      () => ({
        requests: useListProfileRemovalRequests(),
        client: useQueryClient(),
      }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.requests.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["governance", "profileRemovalRequests"]);
  });

  it("surfaces the removal requests the backend returns", async () => {
    const requests = [removalRequest()];
    mockActor.listProfileRemovalRequests = vi.fn(async (...args: unknown[]) => {
      calls.listProfileRemovalRequests.push(args);
      return requests;
    });

    const { result } = renderHook(() => useListProfileRemovalRequests(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(requests);
  });
});

describe("useApproveProfileRemoval: default-family consumer contract (characterization)", () => {
  it("calls approveProfileRemoval(requestId) with no familyId argument", async () => {
    const { result } = renderHook(() => useApproveProfileRemoval(), {
      wrapper,
    });

    result.current.mutate(7n);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.approveProfileRemoval).toEqual([[7n]]);
  });

  it("invalidates the removal-request list and audit history", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useApproveProfileRemoval(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });
    result.current.mutate(7n);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(["governance", "profileRemovalRequests"]);
    expect(keys).toContainEqual(["governance", "auditHistory"]);
  });
});

describe("useRejectProfileRemoval: default-family consumer contract (characterization)", () => {
  it("calls rejectProfileRemoval(requestId) with no familyId argument", async () => {
    const { result } = renderHook(() => useRejectProfileRemoval(), { wrapper });

    result.current.mutate(7n);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.rejectProfileRemoval).toEqual([[7n]]);
  });

  it("invalidates the removal-request list and audit history", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useRejectProfileRemoval(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });
    result.current.mutate(7n);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(["governance", "profileRemovalRequests"]);
    expect(keys).toContainEqual(["governance", "auditHistory"]);
  });
});

describe("useArchiveProfile: default-family consumer contract (characterization)", () => {
  it("calls archiveProfile(personId) with no familyId argument", async () => {
    const { result } = renderHook(() => useArchiveProfile(), { wrapper });

    result.current.mutate("julia");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.archiveProfile).toEqual([["julia"]]);
  });

  it("surfaces the backend result unchanged", async () => {
    mockActor.archiveProfile = vi.fn(async (...args: unknown[]) => {
      calls.archiveProfile.push(args);
      return { __kind__: "ok", ok: null } satisfies Result_5;
    });

    const { result } = renderHook(() => useArchiveProfile(), { wrapper });
    result.current.mutate("julia");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ __kind__: "ok", ok: null });
  });

  it("invalidates the archived-profile list and audit history", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useArchiveProfile(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });
    result.current.mutate("julia");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(["governance", "archivedProfiles"]);
    expect(keys).toContainEqual(["governance", "auditHistory"]);
  });
});

describe("useRestoreProfile: default-family consumer contract (characterization)", () => {
  it("calls restoreProfile(personId) with no familyId argument", async () => {
    const { result } = renderHook(() => useRestoreProfile(), { wrapper });

    result.current.mutate("julia");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.restoreProfile).toEqual([["julia"]]);
  });

  it("invalidates the archived-profile list and audit history", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useRestoreProfile(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });
    result.current.mutate("julia");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(["governance", "archivedProfiles"]);
    expect(keys).toContainEqual(["governance", "auditHistory"]);
  });
});

describe("usePermanentlyDeleteProfile: default-family consumer contract (characterization)", () => {
  it("calls permanentlyDeleteProfile(personId, confirmation) with no familyId argument", async () => {
    const { result } = renderHook(() => usePermanentlyDeleteProfile(), {
      wrapper,
    });

    result.current.mutate({ personId: "julia", confirmation: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.permanentlyDeleteProfile).toEqual([["julia", true]]);
  });

  it("surfaces the backend result unchanged", async () => {
    mockActor.permanentlyDeleteProfile = vi.fn(async (...args: unknown[]) => {
      calls.permanentlyDeleteProfile.push(args);
      return { __kind__: "ok", ok: null } satisfies Result_16;
    });

    const { result } = renderHook(() => usePermanentlyDeleteProfile(), {
      wrapper,
    });
    result.current.mutate({ personId: "julia", confirmation: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ __kind__: "ok", ok: null });
  });

  it("invalidates the archived-profile list and audit history", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => usePermanentlyDeleteProfile(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });
    result.current.mutate({ personId: "julia", confirmation: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(["governance", "archivedProfiles"]);
    expect(keys).toContainEqual(["governance", "auditHistory"]);
  });
});

describe("useListArchivedProfiles: default-family consumer contract (characterization)", () => {
  it("calls listArchivedProfiles() with no arguments", async () => {
    const { result } = renderHook(() => useListArchivedProfiles(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listArchivedProfiles).toEqual([[]]);
  });

  it("registers the legacy ['governance','archivedProfiles'] key for the default family", async () => {
    const { result } = renderHook(
      () => ({
        archived: useListArchivedProfiles(),
        client: useQueryClient(),
      }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.archived.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["governance", "archivedProfiles"]);
  });

  it("surfaces the archived profiles the backend returns", async () => {
    const profiles = [{ personId: "julia" } as PersonProfile];
    mockActor.listArchivedProfiles = vi.fn(async (...args: unknown[]) => {
      calls.listArchivedProfiles.push(args);
      return profiles;
    });

    const { result } = renderHook(() => useListArchivedProfiles(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(profiles);
  });
});

describe("useListArchivedProfileIds: default-family consumer contract (characterization)", () => {
  it("calls listArchivedProfileIds() with no arguments", async () => {
    const { result } = renderHook(() => useListArchivedProfileIds(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listArchivedProfileIds).toEqual([[]]);
  });

  it("registers the legacy ['governance','archivedProfileIds'] key for the default family", async () => {
    const { result } = renderHook(
      () => ({
        ids: useListArchivedProfileIds(),
        client: useQueryClient(),
      }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.ids.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["governance", "archivedProfileIds"]);
  });

  it("surfaces the archived person ids the backend returns", async () => {
    mockActor.listArchivedProfileIds = vi.fn(async (...args: unknown[]) => {
      calls.listArchivedProfileIds.push(args);
      return ["julia", "clayton"];
    });

    const { result } = renderHook(() => useListArchivedProfileIds(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(["julia", "clayton"]);
  });
});

describe("useListDuplicateCandidates: default-family consumer contract (characterization)", () => {
  it("calls listDuplicateCandidates() with no arguments", async () => {
    const { result } = renderHook(() => useListDuplicateCandidates(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listDuplicateCandidates).toEqual([[]]);
  });

  it("registers the legacy ['governance','duplicateCandidates'] key for the default family", async () => {
    const { result } = renderHook(
      () => ({
        candidates: useListDuplicateCandidates(),
        client: useQueryClient(),
      }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.candidates.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["governance", "duplicateCandidates"]);
  });

  it("surfaces the duplicate pairs the backend returns", async () => {
    const pairs = [duplicatePair()];
    mockActor.listDuplicateCandidates = vi.fn(async (...args: unknown[]) => {
      calls.listDuplicateCandidates.push(args);
      return pairs;
    });

    const { result } = renderHook(() => useListDuplicateCandidates(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(pairs);
  });
});

describe("useNotDuplicate: default-family consumer contract (characterization)", () => {
  it("calls notDuplicate(personIdA, personIdB) in that order with no familyId argument", async () => {
    const { result } = renderHook(() => useNotDuplicate(), { wrapper });

    result.current.mutate({ personIdA: "julia", personIdB: "julia-dup" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.notDuplicate).toEqual([["julia", "julia-dup"]]);
  });

  it("surfaces the backend result unchanged", async () => {
    mockActor.notDuplicate = vi.fn(async (...args: unknown[]) => {
      calls.notDuplicate.push(args);
      return { __kind__: "ok", ok: null } satisfies Result_17;
    });

    const { result } = renderHook(() => useNotDuplicate(), { wrapper });
    result.current.mutate({ personIdA: "julia", personIdB: "julia-dup" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ __kind__: "ok", ok: null });
  });

  it("invalidates the duplicate-candidate list", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useNotDuplicate(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });
    result.current.mutate({ personIdA: "julia", personIdB: "julia-dup" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(["governance", "duplicateCandidates"]);
  });
});

describe("useMergeProfiles: default-family consumer contract (characterization)", () => {
  it("calls mergeProfiles(canonicalPersonId, mergedAwayPersonId) in that order with no familyId argument", async () => {
    const { result } = renderHook(() => useMergeProfiles(), { wrapper });

    result.current.mutate({
      canonicalPersonId: "julia",
      mergedAwayPersonId: "julia-dup",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.mergeProfiles).toEqual([["julia", "julia-dup"]]);
  });

  it("surfaces the backend result unchanged", async () => {
    const mergeResult = {
      canonicalPersonId: "julia",
      archivedPersonId: "julia-dup",
      conflicts: [mergeConflict()],
    };
    mockActor.mergeProfiles = vi.fn(async (...args: unknown[]) => {
      calls.mergeProfiles.push(args);
      return { __kind__: "ok", ok: mergeResult } satisfies Result_19;
    });

    const { result } = renderHook(() => useMergeProfiles(), { wrapper });
    result.current.mutate({
      canonicalPersonId: "julia",
      mergedAwayPersonId: "julia-dup",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ __kind__: "ok", ok: mergeResult });
  });

  it("invalidates the duplicate-candidate list and audit history", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useMergeProfiles(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });
    result.current.mutate({
      canonicalPersonId: "julia",
      mergedAwayPersonId: "julia-dup",
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(["governance", "duplicateCandidates"]);
    expect(keys).toContainEqual(["governance", "auditHistory"]);
  });
});

describe("useResolveMergeConflict: default-family consumer contract (characterization)", () => {
  it("calls resolveMergeConflict(conflictId, canonicalValue) in that order with no familyId argument", async () => {
    const { result } = renderHook(() => useResolveMergeConflict(), { wrapper });

    result.current.mutate({ conflictId: 3n, canonicalValue: "1860" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.resolveMergeConflict).toEqual([[3n, "1860"]]);
  });

  it("surfaces the backend result unchanged", async () => {
    const conflict = mergeConflict();
    mockActor.resolveMergeConflict = vi.fn(async (...args: unknown[]) => {
      calls.resolveMergeConflict.push(args);
      return conflict;
    });

    const { result } = renderHook(() => useResolveMergeConflict(), { wrapper });
    result.current.mutate({ conflictId: 3n, canonicalValue: "1860" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(conflict);
  });

  it("invalidates the duplicate-candidate list and audit history", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useResolveMergeConflict(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });
    result.current.mutate({ conflictId: 3n, canonicalValue: "1860" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(["governance", "duplicateCandidates"]);
    expect(keys).toContainEqual(["governance", "auditHistory"]);
  });
});
