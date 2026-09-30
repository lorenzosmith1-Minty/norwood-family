import "@testing-library/jest-dom/vitest";
import type { InvalidateQueryFilters } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  governanceAuditHistoryInvalidation,
  relationshipListInvalidation,
  relationshipPersonInvalidation,
} from "./hooks/useGovernance";

// ---------------------------------------------------------------------------
// Characterization baseline for the family-scoped direct relationship-governance
// change.
//
// The requested change adds canonical `listPersonRelationshipsForFamily`,
// `removeRelationshipForFamily`, and `correctRelationshipTypeForFamily`
// endpoints and makes `useListPersonRelationships`, `useRemoveRelationship`, and
// `useCorrectRelationshipType` fork on `useFamilyScopedId()`: the default family
// keeps the legacy no-familyId call, a non-default family routes to the
// `*ForFamily` endpoint. The accepted criteria are that the default-family
// wrappers "preserve current Norwood behavior" and that the
// relationship-governance query/cache keys stay family-separated.
//
// This file freezes the family-aware invalidation helpers exported by
// src/frontend/src/hooks/useGovernance.ts — the exact seam the change touches.
// Those helpers are already family-exact; the change must not broaden them:
//
//   * The DEFAULT branch (`familyScopedId === undefined`) must keep returning
//     the exact legacy bare filter with NO predicate, so the recorded
//     invalidation shape for Norwood is byte-for-byte unchanged.
//   * A NON-default branch must keep the bare prefix (so the recorded filter
//     shape is unchanged) but narrow it with a predicate that admits only the
//     active family's keys, never a bare cross-family prefix.
//
// The relationship read key carries the person id at index 2 and the family id
// at index 3 (`["governance","relationships",personId,familyScopedId]`), so the
// non-default list predicate must narrow on `queryKey[3]` — not `queryKey[2]`,
// which is the person id. This file pins that index explicitly.
//
// It deliberately does NOT assert the legacy-only call shape for a non-default
// family, which is the behavior the change intentionally replaces. It also does
// not assert two-family isolation of the hooks themselves, which is new
// behavior rather than existing behavior to protect.
//
// These are pure functions of `familyScopedId`, asserted directly against
// representative query keys; no actor or canister is involved.
// ---------------------------------------------------------------------------

type Predicate = (query: { queryKey: unknown[] }) => boolean;

function predicateOf(filters: InvalidateQueryFilters): Predicate {
  expect(typeof filters.predicate).toBe("function");
  // The predicate's real parameter is React Query's `Query`; the helper only
  // reads `queryKey`, so narrow through `unknown` to the shape under test.
  return filters.predicate as unknown as Predicate;
}

describe("relationshipListInvalidation: default-family branch (characterization)", () => {
  it("returns the exact legacy bare prefix with no predicate", () => {
    const filters = relationshipListInvalidation(undefined);
    // The default family's recorded filter shape must stay exactly
    // `{ queryKey: ["governance","relationships"] }` — no predicate added.
    expect(filters).toEqual({ queryKey: ["governance", "relationships"] });
    expect(filters.predicate).toBeUndefined();
  });
});

describe("relationshipListInvalidation: non-default branch stays family-exact (characterization)", () => {
  it("keeps the bare prefix and narrows on the family slot at index 3", () => {
    const filters = relationshipListInvalidation("family-a");
    expect(filters.queryKey).toEqual(["governance", "relationships"]);
    const predicate = predicateOf(filters);

    // The active family's keys are admitted.
    expect(
      predicate({
        queryKey: ["governance", "relationships", "clayton", "family-a"],
      }),
    ).toBe(true);
    expect(
      predicate({
        queryKey: ["governance", "relationships", "erma", "family-a"],
      }),
    ).toBe(true);

    // Another family's key for the same person is never matched.
    expect(
      predicate({
        queryKey: ["governance", "relationships", "clayton", "family-b"],
      }),
    ).toBe(false);
    // A default-family key (no family slot) is never matched.
    expect(
      predicate({ queryKey: ["governance", "relationships", "clayton"] }),
    ).toBe(false);
  });
});

describe("relationshipPersonInvalidation: default-family branch (characterization)", () => {
  it("returns the exact legacy ['governance','relationships',personId] key", () => {
    const filters = relationshipPersonInvalidation(undefined, "clayton");
    expect(filters).toEqual({
      queryKey: ["governance", "relationships", "clayton"],
    });
    expect(filters.predicate).toBeUndefined();
  });
});

describe("relationshipPersonInvalidation: non-default branch stays family-exact (characterization)", () => {
  it("targets the family-appended key for the active family only", () => {
    const filters = relationshipPersonInvalidation("family-a", "clayton");
    expect(filters).toEqual({
      queryKey: ["governance", "relationships", "clayton", "family-a"],
    });
    // The exact-key form carries no predicate; the family slot is part of the
    // key itself, so another family's key cannot match it.
    expect(filters.predicate).toBeUndefined();
  });
});

describe("governanceAuditHistoryInvalidation: default-family branch (characterization)", () => {
  it("keeps the bare audit-history key and narrows it to the exact two-element shape", () => {
    // The accepted change makes the default branch family-exact: the recorded
    // key stays the bare ['governance','auditHistory'] key, but it now carries
    // a predicate that admits only the exact two-element key, so a
    // default-family invalidation never reaches a family-appended audit cache.
    const filters = governanceAuditHistoryInvalidation(undefined);
    expect(filters.queryKey).toEqual(["governance", "auditHistory"]);
    const predicate = predicateOf(filters);

    expect(predicate({ queryKey: ["governance", "auditHistory"] })).toBe(true);
    expect(
      predicate({ queryKey: ["governance", "auditHistory", "family-a"] }),
    ).toBe(false);
  });
});

describe("governanceAuditHistoryInvalidation: non-default branch stays family-exact (characterization)", () => {
  it("targets the family-appended audit-history key for the active family only", () => {
    // The accepted change gives the non-default branch its own family-appended
    // key, so Family A's invalidation cannot reach Family B's audit cache.
    const filters = governanceAuditHistoryInvalidation("family-a");
    expect(filters).toEqual({
      queryKey: ["governance", "auditHistory", "family-a"],
    });
    // The exact-key form carries no predicate; the family slot is part of the
    // key itself, so another family's key cannot match it.
    expect(filters.predicate).toBeUndefined();
  });
});
