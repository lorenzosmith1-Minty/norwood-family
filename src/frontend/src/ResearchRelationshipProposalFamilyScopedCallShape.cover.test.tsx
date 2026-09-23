import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import type { RelationshipProposal, SourceId } from "@/backend";
import { FamilyProvider } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useQueryClient } from "@tanstack/react-query";

import {
  useCreateRelationshipProposal,
  useListRelationshipProposals,
} from "./hooks/useResearchIntake";

// ---------------------------------------------------------------------------
// Cover for the Tenancy 1C-B2-B3-A1 frontend half of the family-scoped
// Relationship Proposal change: when a NON-default family is active, the
// proposal list and create hooks must route to the canonical `*ForFamily`
// endpoints with the explicit familyId, and the familyId must be part of the
// React Query key so caches never collide across families.
//
// The DEFAULT-family (Norwood) legacy call shapes and query keys are frozen
// separately by ResearchRelationshipProposalLegacyCallShapeCharacterize.test.tsx
// and the default-family UI journey by
// ResearchRelationshipProposalDefaultFamilyCharacterize.test.tsx; this file only
// asserts the non-default branch, so the two together pin both sides of the
// `familyScopedId === undefined` fork.
//
// This is component/integration coverage over a typed local actor mock. It
// proves the consumer contract — which endpoint each hook calls and with which
// arguments — and does not exercise the real canister; the family boundary
// itself is covered by the PocketIC lane (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");
const FAMILY_A = "test-family-a";

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    listRelationshipProposalsForFamily: unknown[][];
    createRelationshipProposalForFamily: unknown[][];
    getRelationshipProposalForFamily: unknown[][];
    listRelationshipProposals: unknown[][];
    createRelationshipProposal: unknown[][];
    getRelationshipProposal: unknown[][];
  } = {
    listRelationshipProposalsForFamily: [],
    createRelationshipProposalForFamily: [],
    getRelationshipProposalForFamily: [],
    listRelationshipProposals: [],
    createRelationshipProposal: [],
    getRelationshipProposal: [],
  };

  const mockActor = {
    async listRelationshipProposalsForFamily(
      ...args: unknown[]
    ): Promise<RelationshipProposal[]> {
      calls.listRelationshipProposalsForFamily.push(args);
      return [];
    },
    async createRelationshipProposalForFamily(
      ...args: unknown[]
    ): Promise<unknown> {
      calls.createRelationshipProposalForFamily.push(args);
      return { __kind__: "err", err: { notFound: 0n } };
    },
    async getRelationshipProposalForFamily(
      ...args: unknown[]
    ): Promise<RelationshipProposal | null> {
      calls.getRelationshipProposalForFamily.push(args);
      return null;
    },
    // The legacy endpoints must NOT be reached for a non-default family; they
    // are recorded so a regression that falls back to them is visible.
    async listRelationshipProposals(
      ...args: unknown[]
    ): Promise<RelationshipProposal[]> {
      calls.listRelationshipProposals.push(args);
      return [];
    },
    async createRelationshipProposal(...args: unknown[]): Promise<unknown> {
      calls.createRelationshipProposal.push(args);
      return { __kind__: "err", err: { notFound: 0n } };
    },
    async getRelationshipProposal(
      ...args: unknown[]
    ): Promise<RelationshipProposal | null> {
      calls.getRelationshipProposal.push(args);
      return null;
    },
    async isCallerSteward(): Promise<boolean> {
      return true;
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

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <FamilyProvider familyId={FAMILY_A}>{children}</FamilyProvider>
    </QueryClientProvider>
  );
}

afterEach(cleanup);
beforeEach(resetCalls);

describe("Research relationship-proposal list hook: non-default family routes to *ForFamily (cover)", () => {
  it("useListRelationshipProposals calls listRelationshipProposalsForFamily(familyId) and not the legacy list", async () => {
    const { result } = renderHook(() => useListRelationshipProposals(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listRelationshipProposalsForFamily).toEqual([[FAMILY_A]]);
    expect(calls.listRelationshipProposals).toEqual([]);
  });
});

describe("Research relationship-proposal create hook: non-default family routes to *ForFamily (cover)", () => {
  it("useCreateRelationshipProposal calls createRelationshipProposalForFamily(familyId, fromPersonId, toPersonId, relationshipType, sourceId)", async () => {
    const { result } = renderHook(() => useCreateRelationshipProposal(), {
      wrapper,
    });

    await result.current.mutateAsync({
      fromPersonId: "clayton",
      toPersonId: "julia",
      relationshipType: "Father",
      sourceId: 1n as SourceId,
    });

    // The familyId is the first positional argument; the remaining four mirror
    // the legacy createRelationshipProposal order.
    expect(calls.createRelationshipProposalForFamily).toEqual([
      [FAMILY_A, "clayton", "julia", "Father", 1n],
    ]);
    expect(calls.createRelationshipProposal).toEqual([]);
  });
});

describe("Research relationship-proposal hooks: non-default family React Query keys are family-qualified (cover)", () => {
  // The familyId must be part of the key so a Family A cache entry can never be
  // served to a Family B render. The default-family legacy key is frozen by the
  // characterization file.
  function keyProbe() {
    const queryClient = useQueryClient();
    return queryClient;
  }

  it("useListRelationshipProposals registers ['research','relationshipProposals',familyId]", async () => {
    const { result } = renderHook(
      () => ({ list: useListRelationshipProposals(), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual([
      "research",
      "relationshipProposals",
      FAMILY_A,
    ]);
    // The legacy default-family key must not be registered for a non-default
    // family.
    expect(keys).not.toContainEqual(["research", "relationshipProposals"]);
  });
});

describe("Relationship Proposal frontend path: no hard-coded family name (cover)", () => {
  // The active family must flow through the centralized FamilyContext module
  // (the one place the literal is allowed). A proposal source file that
  // hard-codes "norwood" would bypass the active-family seam and pin the
  // proposal UI to the default family regardless of context.
  const PROPOSAL_PATH_FILES = [
    "src/hooks/useResearchIntake.ts",
    "src/pages/ResearchIntakePage.tsx",
    "src/pages/ResearchReviewQueuePage.tsx",
  ];

  it("does not hard-code the family name in any proposal frontend source file", () => {
    for (const relative of PROPOSAL_PATH_FILES) {
      const source = readFileSync(`${process.cwd()}/${relative}`, "utf8");
      expect(
        source,
        `${relative} must not hard-code the family name`,
      ).not.toMatch(/["']norwood["']/);
    }
  });

  it("keeps the family-name literal in the centralized FamilyContext module", () => {
    const contextSource = readFileSync(
      `${process.cwd()}/src/context/FamilyContext.tsx`,
      "utf8",
    );
    expect(contextSource).toMatch(/DEFAULT_FAMILY_ID\s*=\s*["']norwood["']/);
  });
});

describe("Relationship Proposal direct lookup: family-scoped endpoint only (cover)", () => {
  // The frontend has no surface that performs a direct single-proposal lookup
  // today (the proposal UI lists and creates only). The canonical lookup is
  // `getRelationshipProposalForFamily(familyId, proposalId)`; the legacy
  // unscoped `getRelationshipProposal` must not exist as a frontend path. This
  // static scan proves no proposal frontend source file calls an unscoped
  // lookup, so if one is added later it must use the family-scoped form.
  const PROPOSAL_PATH_FILES = [
    "src/hooks/useResearchIntake.ts",
    "src/pages/ResearchIntakePage.tsx",
    "src/pages/ResearchReviewQueuePage.tsx",
  ];

  it("never calls the legacy unscoped getRelationshipProposal from a proposal frontend file", () => {
    for (const relative of PROPOSAL_PATH_FILES) {
      const source = readFileSync(`${process.cwd()}/${relative}`, "utf8");
      // Match a call to the unscoped lookup but not the `*ForFamily` variant.
      expect(
        source,
        `${relative} must not call the unscoped getRelationshipProposal`,
      ).not.toMatch(/getRelationshipProposal\s*\(/);
    }
  });

  it("exposes the family-scoped lookup on the generated actor interface", () => {
    const backendTypes = readFileSync(
      `${process.cwd()}/src/backend.d.ts`,
      "utf8",
    );
    expect(backendTypes).toMatch(
      /getRelationshipProposalForFamily\(familyId: FamilyId, proposalId: bigint\)/,
    );
  });
});
