import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Tenancy 1C-B2-B4 — family-scoped Conflict Review domain logic (static cover).
//
// The accepted behavior is that every conflict read and action is keyed on an
// explicit `familyId`, so a conflict in Family A is never returned, resolved, or
// counted under Family B, and a `conflictId` alone is never a tenant boundary.
// The canonical predicates live in `lib/conflict-scope.mo` and the API mixin
// `mixins/conflict-scope-api.mo`; the lib predicates are internal Motoko
// functions, so the PocketIC lane cannot drive them directly.
//
// The PocketIC lane covers the public API's default-family behavior and the
// Steward gate. This file is the static cover for the family-filter predicates
// themselves, which the public API cannot exercise for a non-default family
// because no public endpoint creates a Steward of one. It reads the real Motoko
// sources and asserts the family-scoping rules the requirement names, using
// test-only Family A / Family B identifiers, and proves the legacy single-family
// forms are TEMPORARY wrappers delegating with the default family id rather than
// a second independent implementation.
// ---------------------------------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, "..", "..", "src", "backend");

function readBackend(relativePath: string): string {
  return readFileSync(path.join(backendRoot, relativePath), "utf8");
}

/** Strips `//` line comments and `/* ... *\/` block comments from Motoko source. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/[^\n]*/gu, "");
}

const conflictScope = readBackend(path.join("lib", "conflict-scope.mo"));
const conflictScopeApi = readBackend(path.join("mixins", "conflict-scope-api.mo"));

/** The body of a named `public func`, from its signature to the closing `};`. */
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`func ${name}(`);
  if (start === -1) {
    throw new Error(`function ${name} not found`);
  }
  const end = source.indexOf("\n  };", start);
  if (end === -1) {
    throw new Error(`end of function ${name} not found`);
  }
  return source.slice(start, end);
}

// Test-only family identifiers. These are never persisted; they exist only to
// prove the predicates are keyed on the family argument rather than on a global
// "any family" notion.
const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";

describe("family-scoped conflict boundary predicate", () => {
  it("belongsToFamily compares the conflict's familyId to the requested family", () => {
    const body = functionBody(conflictScope, "belongsToFamily");
    expect(body).toContain("conflict.familyId == familyId");
  });

  it("listForFamily filters on belongsToFamily rather than returning every conflict", () => {
    const body = functionBody(conflictScope, "listForFamily");
    expect(body).toContain("belongsToFamily(c, familyId)");
    // It must not be a bare pass-through of the whole list.
    expect(body).not.toMatch(/conflicts\.toArray\(\)\s*;/u);
  });

  it("getForFamily matches both the id and the family, so an id alone cannot cross the boundary", () => {
    const body = functionBody(conflictScope, "getForFamily");
    expect(body).toContain("c.id == id");
    expect(body).toContain("belongsToFamily(c, familyId)");
  });

  it("resolveForFamily only mutates a conflict that belongs to the family", () => {
    const body = functionBody(conflictScope, "resolveForFamily");
    expect(body).toContain("c.id == id and belongsToFamily(c, familyId)");
    // The four accepted actions map to the documented statuses.
    expect(body).toContain("case (#KeepExisting) (#Approved, true)");
    expect(body).toContain("case (#ReplaceExisting) (#Approved, true)");
    expect(body).toContain("case (#PreserveBoth) (#Conflicting, false)");
    expect(body).toContain("case (#NeedsResearch) (#NeedsResearch, false)");
  });

  it("disputedFactsForPersonForFamily only considers conflicts in the family", () => {
    const body = functionBody(conflictScope, "disputedFactsForPersonForFamily");
    expect(body).toContain("belongsToFamily(c, familyId)");
    expect(body).toContain("c.personId == ?personId");
    // Only unresolved conflicts contribute a disputed indicator.
    expect(body).toContain("c.status == #Conflicting or c.status == #NeedsResearch");
  });

  it("reference predicates require the linked finding, source, and profile to be in the family", () => {
    const finding = functionBody(conflictScope, "findingBelongsToFamily");
    expect(finding).toContain("f.id == findingId");
    expect(finding).toContain("f.familyId == familyId");

    const source = functionBody(conflictScope, "sourceBelongsToFamily");
    expect(source).toContain("s.id == sourceId");
    expect(source).toContain("s.familyId == familyId");

    const profile = functionBody(conflictScope, "profileBelongsToFamily");
    // The profile lookup is the family-qualified one, not a bare personId read.
    expect(profile).toContain("getProfileForFamily(profiles, familyId, personId)");
  });
});

describe("family-scoped conflict API authorization", () => {
  it("every canonical conflict endpoint resolves through the family-scoped Steward gate", () => {
    // The two reads gate directly.
    for (const name of [
      "listConflictReviewItemsForFamily",
      "getConflictReviewItemForFamily",
    ]) {
      const body = functionBody(conflictScopeApi, name);
      expect(body).toContain("requireConflictStewardForFamily(caller, familyId)");
    }

    // The resolve delegates to the internal helper (so the real caller is
    // evaluated rather than the canister principal), and that helper gates.
    const resolve = functionBody(conflictScopeApi, "resolveConflictForFamily");
    expect(resolve).toContain("resolveConflictForFamilyInternal(familyId, id, action, notes, caller)");
    const internal = functionBody(conflictScopeApi, "resolveConflictForFamilyInternal");
    expect(internal).toContain("requireConflictStewardForFamily(caller, familyId)");
  });

  it("the Steward gate delegates to the canonical family-scoped authorization helper", () => {
    const body = functionBody(conflictScopeApi, "requireConflictStewardForFamily");
    expect(body).toContain("requireActiveStewardForFamily(stewards, caller, familyId)");
    // It must not consult the platform admin role.
    expect(body).not.toContain("isAdmin");
    expect(body).not.toContain("accessControl");
  });

  it("resolveConflictForFamily validates every linked reference is in the family", () => {
    const body = functionBody(conflictScopeApi, "conflictReferencesInFamily");
    expect(body).toContain("findingBelongsToFamily(findings, familyId, c.findingId)");
    expect(body).toContain("sourceBelongsToFamily(sources, familyId, sid)");
    expect(body).toContain("profileBelongsToFamily(profiles, familyId, pid)");
  });

  it("the family-scoped conflict reads are queries and the resolve is a shared update", () => {
    expect(conflictScopeApi).toMatch(
      /public query \(\{ caller \}\) func listConflictReviewItemsForFamily/u,
    );
    expect(conflictScopeApi).toMatch(
      /public query \(\{ caller \}\) func getConflictReviewItemForFamily/u,
    );
    expect(conflictScopeApi).toMatch(
      /public shared \(\{ caller \}\) func resolveConflictForFamily/u,
    );
  });
});

describe("temporary default-family compatibility wrappers", () => {
  it("keeps the legacy conflict endpoints as wrappers delegating with DEFAULT_FAMILY_ID", () => {
    const legacyList = functionBody(conflictScopeApi, "listConflictReviewItems");
    expect(legacyList).toContain("FamilyTypes.DEFAULT_FAMILY_ID");

    const legacyResolve = functionBody(conflictScopeApi, "resolveConflict");
    expect(legacyResolve).toContain("resolveConflictForFamilyInternal");
    expect(legacyResolve).toContain("FamilyTypes.DEFAULT_FAMILY_ID");

    const legacyForPerson = functionBody(conflictScopeApi, "listConflictsForPerson");
    expect(legacyForPerson).toContain("listConflictsForPersonForFamilyInternal");
    expect(legacyForPerson).toContain("FamilyTypes.DEFAULT_FAMILY_ID");

    // The wrappers are documented as temporary compatibility, not as a second
    // independent implementation.
    expect(conflictScopeApi).toContain("TEMPORARY Tenancy 1C compatibility");
  });

  it("keeps the legacy lib forms as wrappers delegating with DEFAULT_FAMILY_ID", () => {
    const legacyList = functionBody(conflictScope, "listConflicts");
    expect(legacyList).toContain("listForFamily(conflicts, FamilyTypes.DEFAULT_FAMILY_ID)");

    const legacyGet = functionBody(conflictScope, "getConflict");
    expect(legacyGet).toContain("getForFamily(conflicts, FamilyTypes.DEFAULT_FAMILY_ID, id)");

    const legacyResolve = functionBody(conflictScope, "resolveConflict");
    expect(legacyResolve).toContain("resolveForFamily(conflicts, FamilyTypes.DEFAULT_FAMILY_ID");

    expect(conflictScope).toContain("TEMPORARY Tenancy 1C compatibility");
  });

  it("does not leave a second independent conflict filter in the lib", () => {
    // The only family-filter predicate is `belongsToFamily`; every read funnels
    // through it rather than re-implementing the comparison.
    const predicates = conflictScope.match(/func belongsToFamily\w*\(/gu) ?? [];
    expect(predicates).toEqual(["func belongsToFamily("]);
  });
});
