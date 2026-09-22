import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  LivingStatus,
  type PersonProfile,
  RelationshipStatus,
  RelationshipType,
} from "@/backend";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFamilyAccess } from "./hooks/useFamilyAccess";
import { usePersonClaimStatus } from "./hooks/useProfileClaims";
import {
  FAMILY_GRAPH,
  getClosestRelatives,
  getSiblingIds,
  overlayConfirmedRelationships,
} from "./types/family";

// ---------------------------------------------------------------------------
// Characterization baseline for the family-scoped profile/claim/relationship/
// photo change.
//
// The requested change gives the profile, claim, relationship, and photo
// endpoints explicit familyId parameters and family-scoped authorization. The
// observable DEFAULT-FAMILY behavior (familyId = "norwood") must NOT change:
// a profile read still reports the same claim signal, the family tree still
// derives the same relatives from the same confirmed relationships, and the
// approved-member gate still resolves the same access decision.
//
// This file freezes three default-family seams that the existing
// characterization files do not cover:
//
//   1. usePersonClaimStatus — the profile-read "Already claimed" signal the Add
//      Myself match cards consume. It must keep reading the profile through the
//      same public method and keep exposing only the generic claimed/unclaimed
//      boolean (never the owner principal).
//   2. The family-tree derivation (overlayConfirmedRelationships +
//      getClosestRelatives + getSiblingIds) — the "tree" behavior the
//      acceptance criterion names. A confirmed relationship still maps onto the
//      same graph edges, and the closest-relatives grouping is unchanged.
//   3. useFamilyAccess — the approved-family-member gate. A caller whose own
//      profile is CLAIMED is an approved member; a pending/unclaimed caller is
//      not; a signed-out caller is never an approved member and never loading.
//
// It deliberately does NOT freeze the absence of a familyId argument: adding
// one is exactly the change under way. The default-family value the backend
// resolves for these calls is covered by the PocketIC lane, which drives the
// real canister.
//
// This is component/integration coverage over a typed local actor mock; it does
// not exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai");

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: { getPersonProfile: unknown[][]; getMyProfile: unknown[][] } = {
    getPersonProfile: [],
    getMyProfile: [],
  };

  const mockActor = {
    async getPersonProfile(...args: unknown[]): Promise<unknown> {
      calls.getPersonProfile.push(args);
      return null;
    },
    async getMyProfile(...args: unknown[]): Promise<unknown> {
      calls.getMyProfile.push(args);
      return null;
    },
  };

  return {
    mockActor,
    calls,
    resetCalls: () => {
      calls.getPersonProfile.length = 0;
      calls.getMyProfile.length = 0;
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
    isLoginError: false,
    loginError: null,
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

afterEach(cleanup);
beforeEach(resetCalls);

function makeProfile(overrides: Partial<PersonProfile> = {}): PersonProfile {
  return {
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
    ...overrides,
  };
}

describe("usePersonClaimStatus: default-family profile-read signal (characterization)", () => {
  it("reads the profile through getPersonProfile(personId) and reports claimed", async () => {
    mockActor.getPersonProfile = vi.fn(async (...args: unknown[]) => {
      calls.getPersonProfile.push(args);
      return makeProfile({
        claimStatus: ClaimStatus.Claimed,
        claimedByUserId: OWNER,
      });
    });

    const { result } = renderHook(() => usePersonClaimStatus("clayton"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The hook identifies the person by personId; the default family is the
    // backend's concern, not an argument the hook supplies.
    expect(calls.getPersonProfile).toEqual([["clayton"]]);
    expect(result.current.data).toEqual({ isClaimed: true });
  });

  it("reports unclaimed for an unclaimed profile", async () => {
    mockActor.getPersonProfile = vi.fn(async (...args: unknown[]) => {
      calls.getPersonProfile.push(args);
      return makeProfile({ claimStatus: ClaimStatus.Unclaimed });
    });

    const { result } = renderHook(() => usePersonClaimStatus("clayton"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ isClaimed: false });
  });

  it("exposes only the generic claimed signal, never the owner principal", async () => {
    mockActor.getPersonProfile = vi.fn(async () =>
      makeProfile({
        claimStatus: ClaimStatus.Claimed,
        claimedByUserId: OWNER,
      }),
    );

    const { result } = renderHook(() => usePersonClaimStatus("clayton"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The selected shape is exactly { isClaimed } — no owner identity leaks to
    // the non-admin match-card surface.
    expect(result.current.data).toEqual({ isClaimed: true });
    expect(Object.keys(result.current.data ?? {})).toEqual(["isClaimed"]);
  });

  it("reports unclaimed when the profile does not exist", async () => {
    mockActor.getPersonProfile = vi.fn(async () => null);

    const { result } = renderHook(() => usePersonClaimStatus("nobody"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ isClaimed: false });
  });
});

describe("family-tree derivation: default-family confirmed relationships (characterization)", () => {
  it("maps a confirmed SpousePartner relationship onto both spouses' edges", () => {
    const graph = overlayConfirmedRelationships(FAMILY_GRAPH, [
      {
        familyId: "norwood",
        id: 1n,
        fromPersonId: "clayton",
        toPersonId: "erma",
        relationshipType: RelationshipType.SpousePartner,
        status: RelationshipStatus.Confirmed,
      },
    ]);

    expect(graph.clayton.spouses).toContain("erma");
    expect(graph.erma.spouses).toContain("clayton");
  });

  it("maps a confirmed Parent relationship onto the child's father/mother slot", () => {
    const graph = overlayConfirmedRelationships(FAMILY_GRAPH, [
      {
        familyId: "norwood",
        id: 2n,
        fromPersonId: "new-person",
        toPersonId: "clayton",
        relationshipType: RelationshipType.Parent,
        status: RelationshipStatus.Confirmed,
      },
    ]);

    // 'Parent' means the selected existing member (to) is the new person's
    // parent, so the new person fills a parent slot.
    expect(graph["new-person"].father ?? graph["new-person"].mother).toBe(
      "clayton",
    );
  });

  it("maps a confirmed Child relationship onto the parent's children edge", () => {
    const graph = overlayConfirmedRelationships(FAMILY_GRAPH, [
      {
        familyId: "norwood",
        id: 3n,
        fromPersonId: "clayton",
        toPersonId: "new-child",
        relationshipType: RelationshipType.Child,
        status: RelationshipStatus.Confirmed,
      },
    ]);

    expect(graph.clayton.children).toContain("new-child");
  });

  it("ignores a non-Confirmed relationship so the shared graph never reflects it", () => {
    const graph = overlayConfirmedRelationships(FAMILY_GRAPH, [
      {
        familyId: "norwood",
        id: 4n,
        fromPersonId: "clayton",
        toPersonId: "pending-person",
        relationshipType: RelationshipType.SpousePartner,
        status: RelationshipStatus.Pending,
      },
    ]);

    expect(graph.clayton.spouses).not.toContain("pending-person");
    expect(graph["pending-person"]).toBeUndefined();
  });

  it("does not mutate the base graph", () => {
    const before = JSON.stringify(FAMILY_GRAPH);
    overlayConfirmedRelationships(FAMILY_GRAPH, [
      {
        familyId: "norwood",
        id: 5n,
        fromPersonId: "clayton",
        toPersonId: "erma",
        relationshipType: RelationshipType.SpousePartner,
        status: RelationshipStatus.Confirmed,
      },
    ]);
    expect(JSON.stringify(FAMILY_GRAPH)).toBe(before);
  });

  it("groups the closest relatives of the default focus person unchanged", () => {
    const relatives = getClosestRelatives("clayton");

    expect(relatives.father.map((r) => r.personId)).toEqual(["isaiah"]);
    expect(relatives.mother.map((r) => r.personId)).toEqual(["julia"]);
    expect(relatives.spouse.map((r) => r.personId)).toEqual(["hudson", "erma"]);
    expect(relatives.children).toHaveLength(14);
    // Siblings are derived from shared parents, not stored as edges.
    expect(relatives.siblings.map((r) => r.personId)).toContain("isaiah-jr");
  });

  it("derives siblings from shared parents and excludes the person themselves", () => {
    const siblings = getSiblingIds("clayton");
    expect(siblings).toContain("isaiah-jr");
    expect(siblings).not.toContain("clayton");
  });

  it("returns empty relations for an unknown person", () => {
    const relatives = getClosestRelatives("does-not-exist");
    expect(relatives).toEqual({
      father: [],
      mother: [],
      spouse: [],
      siblings: [],
      children: [],
    });
  });
});

describe("useFamilyAccess: default-family approved-member gate (characterization)", () => {
  it("treats a caller whose own profile is CLAIMED as an approved member", async () => {
    mockActor.getMyProfile = vi.fn(async (...args: unknown[]) => {
      calls.getMyProfile.push(args);
      return makeProfile({
        personId: "self",
        claimStatus: ClaimStatus.Claimed,
        claimedByUserId: OWNER,
      });
    });

    const { result } = renderHook(() => useFamilyAccess(), { wrapper });

    await waitFor(() =>
      expect(result.current.isApprovedFamilyMember).toBe(true),
    );
    expect(result.current.isLoading).toBe(false);
    // The gate resolves the caller's own profile through getMyProfile() with no
    // familyId argument — the default-family call the change must preserve.
    expect(calls.getMyProfile).toEqual([[]]);
  });

  it("does not treat a caller with only a pending (unclaimed) profile as an approved member", async () => {
    mockActor.getMyProfile = vi.fn(async () =>
      makeProfile({
        personId: "self",
        claimStatus: ClaimStatus.Unclaimed,
      }),
    );

    const { result } = renderHook(() => useFamilyAccess(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isApprovedFamilyMember).toBe(false);
  });

  it("does not treat a caller with no profile as an approved member", async () => {
    mockActor.getMyProfile = vi.fn(async () => null);

    const { result } = renderHook(() => useFamilyAccess(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isApprovedFamilyMember).toBe(false);
  });
});
