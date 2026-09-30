import "@testing-library/jest-dom/vitest";
import {
  ConflictResolutionAction,
  EvidenceLabel,
  type FindingContent,
  FindingType,
  type SourceRecord,
  SourceType,
} from "@/backend";
import { DEFAULT_FAMILY_ID, FamilyProvider } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useApproveSource,
  useCreateFinding,
  useCreateNewPersonCandidate,
  useCreateRelationshipProposal,
  useCreateSource,
  useResolveConflict,
} from "./hooks/useResearchIntake";

// ---------------------------------------------------------------------------
// Characterization baseline for the Research-domain cache-invalidation
// family-scoping change.
//
// The requested change makes the Research mutation hooks invalidate only the
// ACTIVE family's Research caches. Today every mutation in
// `useResearchIntake` issues BARE cross-family prefix invalidations
// (`["research","sources"]`, `["research","findings"]`,
// `["research","candidates"]`, `["research","relationshipProposals"]`,
// `["research","conflicts"]`, `["research","queue"]`, `["research","audit"]`),
// which also marks every other family's caches stale. That bare cross-family
// invalidation is the defect being fixed, so this file deliberately does NOT
// freeze the filter shape.
//
// What it freezes instead is the adjacent working behavior the change must
// preserve: with the DEFAULT (Norwood) family active, each Research mutation
// still refreshes the default-family Research caches the read hooks register.
// It is asserted behaviorally — seed the exact key a read hook registers, run
// the mutation, observe that query is invalidated — so it holds whether the
// default-family filter stays a bare prefix or becomes an exact key.
//
// The exact default-family Research read keys frozen here are the ones the read
// hooks register today:
//   ["research","sources"]                 (useListSources)
//   ["research","findings"]                (useListFindings)
//   ["research","candidates"]              (useListNewPersonCandidates)
//   ["research","relationshipProposals"]   (useListRelationshipProposals)
//   ["research","conflicts"]               (useListConflictReviewItems)
//   ["research","queue"]                   (useGetReviewQueue)
//   ["research","audit"]                   (useGetResearchAuditLog)
//
// The non-default half of the new behavior (a Family A mutation must NOT
// invalidate Family B's caches) is the change under way and is not
// characterized here.
//
// This is component/integration coverage over a typed local actor mock; it does
// not exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");

const { mockActor, resetCalls } = vi.hoisted(() => {
  const mockActor = {
    async createSource(): Promise<unknown> {
      return { __kind__: "err", err: { notFound: 0n } };
    },
    async approveSource(): Promise<SourceRecord | null> {
      return null;
    },
    async createFinding(): Promise<unknown> {
      return { __kind__: "err", err: { notFound: 0n } };
    },
    async createNewPersonCandidate(): Promise<unknown> {
      return { __kind__: "err", err: { notFound: 0n } };
    },
    async createRelationshipProposal(): Promise<unknown> {
      return { __kind__: "err", err: { notFound: 0n } };
    },
    async resolveConflict(): Promise<unknown> {
      return { __kind__: "err", err: { notFound: 0n } };
    },
  };

  return {
    mockActor,
    resetCalls: () => {
      // The mock methods are stateless; nothing to reset between tests.
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

function wrapperFor(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <FamilyProvider familyId={DEFAULT_FAMILY_ID}>{children}</FamilyProvider>
      </QueryClientProvider>
    );
  };
}

/** The exact default-family Research read keys the read hooks register. */
const DEFAULT_RESEARCH_KEYS: unknown[][] = [
  ["research", "sources"],
  ["research", "findings"],
  ["research", "candidates"],
  ["research", "relationshipProposals"],
  ["research", "conflicts"],
  ["research", "queue"],
  ["research", "audit"],
];

/**
 * A genuinely unrelated key the Research mutations do not touch, seeded so its
 * state exists. It must NOT be a Research key: the accepted change routes the
 * Research mutations through family-aware filters, and a bare Research prefix
 * would match it, so seeding a Research key here would make the non-vacuity
 * guard assert the opposite of the accepted behavior.
 */
const UNTOUCHED_KEY: unknown[] = ["board", "posts", "all"];

function seedKeys(queryClient: QueryClient, keys: unknown[][]) {
  for (const key of keys) {
    queryClient.setQueryData(key, []);
  }
}

function expectInvalidated(queryClient: QueryClient, keys: unknown[][]) {
  for (const key of keys) {
    expect(
      queryClient.getQueryState(key)?.isInvalidated,
      `expected ${JSON.stringify(key)} to be invalidated`,
    ).toBe(true);
  }
}

function renderMutation<T>(hook: () => T) {
  const queryClient = makeQueryClient();
  const rendered = renderHook(hook, { wrapper: wrapperFor(queryClient) });
  return { ...rendered, queryClient };
}

const FINDING_CONTENT: FindingContent = {
  __kind__: "PersonFact",
  PersonFact: { field: "birthDate", value: "12 March 1898", personId: "julia" },
};

describe("useCreateSource: default-family Research invalidation (characterization)", () => {
  it("refreshes the default-family sources, queue, and audit caches", async () => {
    const { result, queryClient } = renderMutation(() => useCreateSource());
    seedKeys(queryClient, DEFAULT_RESEARCH_KEYS);
    queryClient.setQueryData(UNTOUCHED_KEY, []);

    await result.current.mutateAsync({
      title: "1900 census, Norwood household",
      sourceType: SourceType.CensusCitation,
      description: "Census record listing the Norwood family.",
      archiveItemId: null,
    });

    expectInvalidated(queryClient, [
      ["research", "sources"],
      ["research", "queue"],
      ["research", "audit"],
    ]);
    // Non-vacuity guard: a key the mutation does not touch stays fresh, so the
    // assertions above are observing real invalidation rather than a default.
    expect(queryClient.getQueryState(UNTOUCHED_KEY)?.isInvalidated).toBe(false);
  });
});

describe("useApproveSource: default-family Research invalidation (characterization)", () => {
  it("refreshes the default-family sources, queue, and audit caches", async () => {
    const { result, queryClient } = renderMutation(() => useApproveSource());
    seedKeys(queryClient, DEFAULT_RESEARCH_KEYS);

    await result.current.mutateAsync(7n);

    expectInvalidated(queryClient, [
      ["research", "sources"],
      ["research", "queue"],
      ["research", "audit"],
    ]);
  });
});

describe("useCreateFinding: default-family Research invalidation (characterization)", () => {
  it("refreshes the default-family findings, queue, and audit caches", async () => {
    const { result, queryClient } = renderMutation(() => useCreateFinding());
    seedKeys(queryClient, DEFAULT_RESEARCH_KEYS);

    await result.current.mutateAsync({
      title: "Birth date of Julia Norwood",
      evidenceLabel: EvidenceLabel.Documented,
      findingType: FindingType.PersonFact,
      content: FINDING_CONTENT,
      sourceId: 1n,
      personId: "julia",
      newPersonCandidateId: null,
    });

    expectInvalidated(queryClient, [
      ["research", "findings"],
      ["research", "queue"],
      ["research", "audit"],
    ]);
  });
});

describe("useCreateNewPersonCandidate: default-family Research invalidation (characterization)", () => {
  it("refreshes the default-family candidates, queue, and audit caches", async () => {
    const { result, queryClient } = renderMutation(() =>
      useCreateNewPersonCandidate(),
    );
    seedKeys(queryClient, DEFAULT_RESEARCH_KEYS);

    await result.current.mutateAsync({
      name: "Ada Norwood",
      details: "Named in the 1900 census.",
      sourceId: 1n,
    });

    expectInvalidated(queryClient, [
      ["research", "candidates"],
      ["research", "queue"],
      ["research", "audit"],
    ]);
  });
});

describe("useCreateRelationshipProposal: default-family Research invalidation (characterization)", () => {
  it("refreshes the default-family relationship proposals, queue, and audit caches", async () => {
    const { result, queryClient } = renderMutation(() =>
      useCreateRelationshipProposal(),
    );
    seedKeys(queryClient, DEFAULT_RESEARCH_KEYS);

    await result.current.mutateAsync({
      fromPersonId: "julia",
      toPersonId: "lorenzoSmithJr",
      relationshipType: "parent",
      sourceId: 1n,
    });

    expectInvalidated(queryClient, [
      ["research", "relationshipProposals"],
      ["research", "queue"],
      ["research", "audit"],
    ]);
  });
});

describe("useResolveConflict: default-family Research invalidation (characterization)", () => {
  it("refreshes the default-family conflicts, findings, sources, queue, and audit caches", async () => {
    const { result, queryClient } = renderMutation(() => useResolveConflict());
    seedKeys(queryClient, DEFAULT_RESEARCH_KEYS);

    await result.current.mutateAsync({
      conflictId: 1n,
      action: ConflictResolutionAction.ReplaceExisting,
      notes: "Replaced with the documented value.",
    });

    expectInvalidated(queryClient, [
      ["research", "conflicts"],
      ["research", "findings"],
      ["research", "sources"],
      ["research", "queue"],
      ["research", "audit"],
    ]);
  });
});
