import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ConflictResolutionAction,
  EvidenceLabel,
  type FindingContent,
  FindingType,
  SourceType,
} from "@/backend";
import { DEFAULT_FAMILY_ID, FamilyProvider } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  researchAuditInvalidation,
  researchCandidatesInvalidation,
  researchConflictsInvalidation,
  researchFindingsInvalidation,
  researchQueueInvalidation,
  researchRelationshipProposalsInvalidation,
  researchSourcesInvalidation,
  useApproveSource,
  useCreateFinding,
  useCreateNewPersonCandidate,
  useCreateRelationshipProposal,
  useCreateSource,
  useCreateSourceWithUpload,
  useResolveConflict,
} from "./hooks/useResearchIntake";

// ---------------------------------------------------------------------------
// Cover for the family-specific Research-domain cache-invalidation change.
//
// The requested change routes every Research mutation hook through the
// family-aware helpers in `hooks/useResearchIntake.ts` so that a mutation
// performed while one family is active invalidates ONLY that family's Research
// caches. Before the change the hooks invalidated bare cross-family prefixes
// (`["research","sources"]`, `["research","findings"]`,
// `["research","candidates"]`, `["research","relationshipProposals"]`,
// `["research","conflicts"]`, `["research","queue"]`, `["research","audit"]`),
// which also marked every other family's Research caches stale.
//
// This file asserts the accepted behavior:
//
//   1. Helper contract: all seven helpers are family-exact in both branches.
//      The default family targets only the exact two-element read key; a
//      non-default family keeps the bare prefix but narrows it with a predicate
//      that admits only the active family's keys (family id at index 2).
//
//   2. Non-default isolation, asserted behaviorally through the real mutation
//      hooks: with Family A active, a mutation invalidates Family A's seven
//      Research caches and leaves Family B's and the default family's caches
//      untouched.
//
//   3. Default-family exactness: with the default family active, a mutation
//      invalidates the exact default read keys and leaves Family A's and
//      Family B's Research caches untouched.
//
//   4. Static source audit: no production Research invalidation in
//      `useResearchIntake.ts` passes a bare cross-family prefix to
//      `invalidateQueries` for the seven Research domains.
//
// This is component/integration coverage over a typed local actor mock; it does
// not exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");
const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";

const { mockActor, resetCalls } = vi.hoisted(() => {
  const mockActor = {
    async createSource(..._args: unknown[]): Promise<unknown> {
      return { __kind__: "err", err: { notFound: 0n } };
    },
    async createSourceForFamily(..._args: unknown[]): Promise<unknown> {
      return { __kind__: "err", err: { notFound: 0n } };
    },
    async createSourceWithUpload(..._args: unknown[]): Promise<unknown> {
      return { __kind__: "err", err: { notFound: 0n } };
    },
    async createSourceWithUploadForFamily(
      ..._args: unknown[]
    ): Promise<unknown> {
      return { __kind__: "err", err: { notFound: 0n } };
    },
    async approveSource(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async approveSourceForFamily(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async createFinding(..._args: unknown[]): Promise<unknown> {
      return { __kind__: "err", err: { notFound: 0n } };
    },
    async createFindingForFamily(..._args: unknown[]): Promise<unknown> {
      return { __kind__: "err", err: { notFound: 0n } };
    },
    async createNewPersonCandidate(..._args: unknown[]): Promise<unknown> {
      return { __kind__: "err", err: { notFound: 0n } };
    },
    async createNewPersonCandidateForFamily(
      ..._args: unknown[]
    ): Promise<unknown> {
      return { __kind__: "err", err: { notFound: 0n } };
    },
    async createRelationshipProposal(..._args: unknown[]): Promise<unknown> {
      return { __kind__: "err", err: { notFound: 0n } };
    },
    async createRelationshipProposalForFamily(
      ..._args: unknown[]
    ): Promise<unknown> {
      return { __kind__: "err", err: { notFound: 0n } };
    },
    async resolveConflict(..._args: unknown[]): Promise<unknown> {
      return { __kind__: "err", err: { notFound: 0n } };
    },
    async resolveConflictForFamily(..._args: unknown[]): Promise<unknown> {
      return { __kind__: "err", err: { notFound: 0n } };
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

/** The seven Research domains and their query-key prefixes. */
const RESEARCH_DOMAINS = [
  "sources",
  "findings",
  "candidates",
  "relationshipProposals",
  "conflicts",
  "queue",
  "audit",
] as const;

/**
 * Seeds the seven Research caches for the default family, Family A, and
 * Family B so an invalidation can be observed as a state transition on each
 * key. The default family's read key omits the family slot entirely; a
 * non-default family appends the family id at index 2.
 */
function seedResearchCaches(queryClient: QueryClient) {
  for (const domain of RESEARCH_DOMAINS) {
    queryClient.setQueryData(["research", domain], []);
    queryClient.setQueryData(["research", domain, FAMILY_A], []);
    queryClient.setQueryData(["research", domain, FAMILY_B], []);
  }
}

/** Reads the invalidation state of every seeded Research key. */
function readResearchState(queryClient: QueryClient) {
  const state: Record<string, boolean> = {};
  for (const domain of RESEARCH_DOMAINS) {
    state[`default:${domain}`] = isInvalidated(queryClient, [
      "research",
      domain,
    ]);
    state[`a:${domain}`] = isInvalidated(queryClient, [
      "research",
      domain,
      FAMILY_A,
    ]);
    state[`b:${domain}`] = isInvalidated(queryClient, [
      "research",
      domain,
      FAMILY_B,
    ]);
  }
  return state;
}

const FINDING_CONTENT: FindingContent = {
  __kind__: "PersonFact",
  PersonFact: { field: "birthDate", value: "12 March 1898", personId: "julia" },
};

const SOURCE_INPUT = {
  title: "1900 census, Norwood household",
  sourceType: SourceType.CensusCitation,
  description: "Census record listing the Norwood family.",
  archiveItemId: null,
};

const FINDING_INPUT = {
  title: "Birth date of Julia Norwood",
  evidenceLabel: EvidenceLabel.Documented,
  findingType: FindingType.PersonFact,
  content: FINDING_CONTENT,
  sourceId: 1n,
  personId: "julia",
  newPersonCandidateId: null,
};

const CANDIDATE_INPUT = {
  name: "Ada Norwood",
  details: "Named in the 1900 census.",
  sourceId: 1n,
};

const PROPOSAL_INPUT = {
  fromPersonId: "julia",
  toPersonId: "lorenzoSmithJr",
  relationshipType: "parent",
  sourceId: 1n,
};

const CONFLICT_INPUT = {
  conflictId: 1n,
  action: ConflictResolutionAction.ReplaceExisting,
  notes: "Replaced with the documented value.",
};

// ---------------------------------------------------------------------------
// Helper contract: all seven helpers are family-exact in both branches.
// ---------------------------------------------------------------------------

describe("Research invalidation helpers are family-exact in both branches (cover)", () => {
  const helpers = [
    ["researchSourcesInvalidation", researchSourcesInvalidation, "sources"],
    ["researchFindingsInvalidation", researchFindingsInvalidation, "findings"],
    [
      "researchCandidatesInvalidation",
      researchCandidatesInvalidation,
      "candidates",
    ],
    [
      "researchRelationshipProposalsInvalidation",
      researchRelationshipProposalsInvalidation,
      "relationshipProposals",
    ],
    [
      "researchConflictsInvalidation",
      researchConflictsInvalidation,
      "conflicts",
    ],
    ["researchQueueInvalidation", researchQueueInvalidation, "queue"],
    ["researchAuditInvalidation", researchAuditInvalidation, "audit"],
  ] as const;

  for (const [name, helper, domain] of helpers) {
    it(`${name} default branch targets only the exact two-element key`, () => {
      const filter = helper(undefined);
      expect(filter.queryKey).toEqual(["research", domain]);
      const predicate = filter.predicate as (query: {
        queryKey: readonly unknown[];
      }) => boolean;
      // The default branch narrows the bare prefix with a predicate admitting
      // ONLY the two-element default shape, so no non-default family's
      // three-element key can match.
      expect(predicate({ queryKey: ["research", domain] })).toBe(true);
      expect(predicate({ queryKey: ["research", domain, FAMILY_A] })).toBe(
        false,
      );
      expect(predicate({ queryKey: ["research", domain, FAMILY_B] })).toBe(
        false,
      );
    });

    it(`${name} non-default branch admits only the active family (index 2)`, () => {
      const filter = helper(FAMILY_A);
      expect(filter.queryKey).toEqual(["research", domain]);
      const predicate = filter.predicate as (query: {
        queryKey: readonly unknown[];
      }) => boolean;
      expect(predicate({ queryKey: ["research", domain, FAMILY_A] })).toBe(
        true,
      );
      expect(predicate({ queryKey: ["research", domain, FAMILY_B] })).toBe(
        false,
      );
      expect(predicate({ queryKey: ["research", domain] })).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// Non-default family isolation, through the real mutation hooks.
// ---------------------------------------------------------------------------

describe("a Family A Research mutation invalidates only Family A's Research caches (cover)", () => {
  async function runFamilyAMutation(
    hook: () => { mutateAsync: (input: never) => Promise<unknown> },
    input: unknown,
  ) {
    const queryClient = makeQueryClient();
    const { result } = renderHook(hook, {
      wrapper: wrapperFor(queryClient, FAMILY_A),
    });
    seedResearchCaches(queryClient);

    await result.current.mutateAsync(input as never);

    return readResearchState(queryClient);
  }

  it("useCreateSource invalidates only Family A sources/queue/audit", async () => {
    const state = await runFamilyAMutation(
      () => useCreateSource() as never,
      SOURCE_INPUT,
    );
    expect(state["a:sources"]).toBe(true);
    expect(state["a:queue"]).toBe(true);
    expect(state["a:audit"]).toBe(true);
    // Family B is untouched.
    expect(state["b:sources"]).toBe(false);
    expect(state["b:queue"]).toBe(false);
    expect(state["b:audit"]).toBe(false);
    // The default family is untouched.
    expect(state["default:sources"]).toBe(false);
    expect(state["default:queue"]).toBe(false);
    expect(state["default:audit"]).toBe(false);
  });

  it("useApproveSource invalidates only Family A sources/queue/audit", async () => {
    const state = await runFamilyAMutation(
      () => useApproveSource() as never,
      7n,
    );
    expect(state["a:sources"]).toBe(true);
    expect(state["a:queue"]).toBe(true);
    expect(state["a:audit"]).toBe(true);
    expect(state["b:sources"]).toBe(false);
    expect(state["b:queue"]).toBe(false);
    expect(state["b:audit"]).toBe(false);
    expect(state["default:sources"]).toBe(false);
    expect(state["default:queue"]).toBe(false);
    expect(state["default:audit"]).toBe(false);
  });

  it("useCreateFinding invalidates only Family A findings/queue/audit", async () => {
    const state = await runFamilyAMutation(
      () => useCreateFinding() as never,
      FINDING_INPUT,
    );
    expect(state["a:findings"]).toBe(true);
    expect(state["a:queue"]).toBe(true);
    expect(state["a:audit"]).toBe(true);
    expect(state["b:findings"]).toBe(false);
    expect(state["b:queue"]).toBe(false);
    expect(state["b:audit"]).toBe(false);
    expect(state["default:findings"]).toBe(false);
    expect(state["default:queue"]).toBe(false);
    expect(state["default:audit"]).toBe(false);
  });

  it("useCreateNewPersonCandidate invalidates only Family A candidates/queue/audit", async () => {
    const state = await runFamilyAMutation(
      () => useCreateNewPersonCandidate() as never,
      CANDIDATE_INPUT,
    );
    expect(state["a:candidates"]).toBe(true);
    expect(state["a:queue"]).toBe(true);
    expect(state["a:audit"]).toBe(true);
    expect(state["b:candidates"]).toBe(false);
    expect(state["b:queue"]).toBe(false);
    expect(state["b:audit"]).toBe(false);
    expect(state["default:candidates"]).toBe(false);
    expect(state["default:queue"]).toBe(false);
    expect(state["default:audit"]).toBe(false);
  });

  it("useCreateRelationshipProposal invalidates only Family A relationshipProposals/queue/audit", async () => {
    const state = await runFamilyAMutation(
      () => useCreateRelationshipProposal() as never,
      PROPOSAL_INPUT,
    );
    expect(state["a:relationshipProposals"]).toBe(true);
    expect(state["a:queue"]).toBe(true);
    expect(state["a:audit"]).toBe(true);
    expect(state["b:relationshipProposals"]).toBe(false);
    expect(state["b:queue"]).toBe(false);
    expect(state["b:audit"]).toBe(false);
    expect(state["default:relationshipProposals"]).toBe(false);
    expect(state["default:queue"]).toBe(false);
    expect(state["default:audit"]).toBe(false);
  });

  it("useResolveConflict invalidates only Family A conflicts/findings/sources/queue/audit", async () => {
    const state = await runFamilyAMutation(
      () => useResolveConflict() as never,
      CONFLICT_INPUT,
    );
    expect(state["a:conflicts"]).toBe(true);
    expect(state["a:findings"]).toBe(true);
    expect(state["a:sources"]).toBe(true);
    expect(state["a:queue"]).toBe(true);
    expect(state["a:audit"]).toBe(true);
    expect(state["b:conflicts"]).toBe(false);
    expect(state["b:findings"]).toBe(false);
    expect(state["b:sources"]).toBe(false);
    expect(state["b:queue"]).toBe(false);
    expect(state["b:audit"]).toBe(false);
    expect(state["default:conflicts"]).toBe(false);
    expect(state["default:findings"]).toBe(false);
    expect(state["default:sources"]).toBe(false);
    expect(state["default:queue"]).toBe(false);
    expect(state["default:audit"]).toBe(false);
  });

  it("a Family B mutation invalidates Family B only, not Family A", async () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useCreateSource(), {
      wrapper: wrapperFor(queryClient, FAMILY_B),
    });
    seedResearchCaches(queryClient);

    await result.current.mutateAsync(SOURCE_INPUT as never);

    const state = readResearchState(queryClient);
    expect(state["b:sources"]).toBe(true);
    expect(state["b:queue"]).toBe(true);
    expect(state["b:audit"]).toBe(true);
    expect(state["a:sources"]).toBe(false);
    expect(state["a:queue"]).toBe(false);
    expect(state["a:audit"]).toBe(false);
    expect(state["default:sources"]).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Default-family exactness.
// ---------------------------------------------------------------------------

describe("a default-family Research mutation does not invalidate non-default Research caches (cover)", () => {
  async function runDefaultMutation(
    hook: () => { mutateAsync: (input: never) => Promise<unknown> },
    input: unknown,
  ) {
    const queryClient = makeQueryClient();
    const { result } = renderHook(hook, {
      wrapper: wrapperFor(queryClient, undefined),
    });
    seedResearchCaches(queryClient);

    await result.current.mutateAsync(input as never);

    return readResearchState(queryClient);
  }

  it("useCreateSource invalidates the exact default keys and no family keys", async () => {
    const state = await runDefaultMutation(
      () => useCreateSource() as never,
      SOURCE_INPUT,
    );
    expect(state["default:sources"]).toBe(true);
    expect(state["default:queue"]).toBe(true);
    expect(state["default:audit"]).toBe(true);
    expect(state["a:sources"]).toBe(false);
    expect(state["a:queue"]).toBe(false);
    expect(state["a:audit"]).toBe(false);
    expect(state["b:sources"]).toBe(false);
    expect(state["b:queue"]).toBe(false);
    expect(state["b:audit"]).toBe(false);
  });

  it("useCreateFinding invalidates the exact default keys and no family keys", async () => {
    const state = await runDefaultMutation(
      () => useCreateFinding() as never,
      FINDING_INPUT,
    );
    expect(state["default:findings"]).toBe(true);
    expect(state["default:queue"]).toBe(true);
    expect(state["default:audit"]).toBe(true);
    expect(state["a:findings"]).toBe(false);
    expect(state["a:queue"]).toBe(false);
    expect(state["a:audit"]).toBe(false);
    expect(state["b:findings"]).toBe(false);
    expect(state["b:queue"]).toBe(false);
    expect(state["b:audit"]).toBe(false);
  });

  it("useResolveConflict invalidates the exact default keys and no family keys", async () => {
    const state = await runDefaultMutation(
      () => useResolveConflict() as never,
      CONFLICT_INPUT,
    );
    expect(state["default:conflicts"]).toBe(true);
    expect(state["default:findings"]).toBe(true);
    expect(state["default:sources"]).toBe(true);
    expect(state["default:queue"]).toBe(true);
    expect(state["default:audit"]).toBe(true);
    expect(state["a:conflicts"]).toBe(false);
    expect(state["a:findings"]).toBe(false);
    expect(state["a:sources"]).toBe(false);
    expect(state["a:queue"]).toBe(false);
    expect(state["a:audit"]).toBe(false);
    expect(state["b:conflicts"]).toBe(false);
    expect(state["b:findings"]).toBe(false);
    expect(state["b:sources"]).toBe(false);
    expect(state["b:queue"]).toBe(false);
    expect(state["b:audit"]).toBe(false);
  });

  it("the default family id is Norwood", () => {
    expect(DEFAULT_FAMILY_ID).toBe("norwood");
  });
});

// ---------------------------------------------------------------------------
// Adjacent family-scoped refreshes are preserved.
//
// The accepted change must not disturb the already-family-scoped helpers the
// Research mutations also call: the pending-contribution count, the
// Notification caches, and (for the upload path) the Archive lists. Each is
// asserted behaviorally through a real Research mutation so a regression that
// drops or de-scopes one of these refreshes fails here.
// ---------------------------------------------------------------------------

describe("Research mutations keep the adjacent family-scoped refreshes (cover)", () => {
  it("a Family A useCreateSource refreshes only Family A's pending count and notifications", async () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useCreateSource(), {
      wrapper: wrapperFor(queryClient, FAMILY_A),
    });

    // Pending-count key: ["pendingContributionsCount", familyScopedId ?? ""].
    queryClient.setQueryData(["pendingContributionsCount", FAMILY_A], 0);
    queryClient.setQueryData(["pendingContributionsCount", FAMILY_B], 0);
    queryClient.setQueryData(["pendingContributionsCount", ""], 0);
    // Notification list key: ["notifications"] default, ["notifications", id] family.
    queryClient.setQueryData(["notifications"], []);
    queryClient.setQueryData(["notifications", FAMILY_A], []);
    queryClient.setQueryData(["notifications", FAMILY_B], []);

    await result.current.mutateAsync(SOURCE_INPUT as never);

    expect(
      isInvalidated(queryClient, ["pendingContributionsCount", FAMILY_A]),
    ).toBe(true);
    expect(
      isInvalidated(queryClient, ["pendingContributionsCount", FAMILY_B]),
    ).toBe(false);
    expect(isInvalidated(queryClient, ["pendingContributionsCount", ""])).toBe(
      false,
    );
    expect(isInvalidated(queryClient, ["notifications", FAMILY_A])).toBe(true);
    expect(isInvalidated(queryClient, ["notifications", FAMILY_B])).toBe(false);
    expect(isInvalidated(queryClient, ["notifications"])).toBe(false);
  });

  it("a default-family useCreateSource refreshes only the default pending count and notifications", async () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useCreateSource(), {
      wrapper: wrapperFor(queryClient, undefined),
    });

    queryClient.setQueryData(["pendingContributionsCount", ""], 0);
    queryClient.setQueryData(["pendingContributionsCount", FAMILY_A], 0);
    queryClient.setQueryData(["notifications"], []);
    queryClient.setQueryData(["notifications", FAMILY_A], []);

    await result.current.mutateAsync(SOURCE_INPUT as never);

    expect(isInvalidated(queryClient, ["pendingContributionsCount", ""])).toBe(
      true,
    );
    expect(
      isInvalidated(queryClient, ["pendingContributionsCount", FAMILY_A]),
    ).toBe(false);
    // The default-family Notification helper keeps its legacy bare-prefix
    // filter by design (see notificationInvalidation), so this only asserts the
    // default Notification cache is still refreshed.
    expect(isInvalidated(queryClient, ["notifications"])).toBe(true);
  });

  it("a Family A useCreateSourceWithUpload refreshes only Family A's Archive lists", async () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useCreateSourceWithUpload(), {
      wrapper: wrapperFor(queryClient, FAMILY_A),
    });

    // Archive pending key: ["archive","pending",familyScopedId ?? ""].
    queryClient.setQueryData(["archive", "pending", FAMILY_A], []);
    queryClient.setQueryData(["archive", "pending", FAMILY_B], []);
    queryClient.setQueryData(["archive", "pending", ""], []);
    queryClient.setQueryData(["archive", "approved", FAMILY_A], []);
    queryClient.setQueryData(["archive", "approved", FAMILY_B], []);

    await result.current.mutateAsync({
      title: "Uploaded source",
      sourceType: SourceType.CensusCitation,
      description: "Uploaded census scan.",
      mimeType: "application/pdf",
      blob: {} as never,
      filename: "census.pdf",
      tags: [],
      era: "1900s",
      year: 1900n,
      relatedMemberIds: [],
      privacyLevel: "FamilyOnly" as never,
      classification: "Document" as never,
      primarySpeaker: null,
    } as never);

    expect(isInvalidated(queryClient, ["archive", "pending", FAMILY_A])).toBe(
      true,
    );
    expect(isInvalidated(queryClient, ["archive", "approved", FAMILY_A])).toBe(
      true,
    );
    expect(isInvalidated(queryClient, ["archive", "pending", FAMILY_B])).toBe(
      false,
    );
    expect(isInvalidated(queryClient, ["archive", "approved", FAMILY_B])).toBe(
      false,
    );
    expect(isInvalidated(queryClient, ["archive", "pending", ""])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Static source audit: no production Research invalidation uses a bare
// cross-family prefix for the seven Research domains.
// ---------------------------------------------------------------------------

describe("no production Research invalidation uses a bare cross-family prefix (cover)", () => {
  const HOOKS_DIR = join(process.cwd(), "src", "hooks");
  const RESEARCH_HOOK = "useResearchIntake.ts";

  function readResearchHook(): string {
    return readFileSync(join(HOOKS_DIR, RESEARCH_HOOK), "utf8");
  }

  it("audits the production Research hook file", () => {
    expect(readResearchHook().length).toBeGreaterThan(0);
  });

  it("no bare ['research', <domain>] queryKey is passed to invalidateQueries", () => {
    // A bare `["research","sources"]` (etc.) prefix matches every
    // family-appended key, so it would mark another family's Research cache
    // stale. The helpers build the filter; the hooks must call the helper, not
    // inline the prefix.
    const source = readResearchHook();
    const offenders: string[] = [];
    for (const domain of RESEARCH_DOMAINS) {
      const bareInvalidation = new RegExp(
        `invalidateQueries\\s*\\(\\s*\\{\\s*queryKey\\s*:\\s*\\[\\s*["']research["']\\s*,\\s*["']${domain}["']\\s*\\]\\s*\\}`,
        "u",
      );
      if (bareInvalidation.test(source)) {
        offenders.push(domain);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the Research mutation hooks route through the family-aware helpers", () => {
    const source = readResearchHook();
    for (const helper of [
      "researchSourcesInvalidation",
      "researchFindingsInvalidation",
      "researchCandidatesInvalidation",
      "researchRelationshipProposalsInvalidation",
      "researchConflictsInvalidation",
      "researchQueueInvalidation",
      "researchAuditInvalidation",
    ]) {
      expect(source).toContain(helper);
    }
  });
});
