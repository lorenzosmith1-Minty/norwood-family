import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Characterization baseline for the family-scoped relationship reads.
//
// Multi-Family Tenancy requires that every relationship read is scoped to the
// requested family: a relationship or relationship request carrying a different
// family id must never surface in another family's graph, even when the person
// ids are identical. `lib/relationships.mo` is the single source of that rule,
// and the frontend's shared family graph merges the confirmed relationships it
// returns.
//
// This file protects the EXISTING family-scoping behavior that must remain
// unchanged:
//
//   A. `relationshipBelongsToFamily` and `relationshipRequestBelongsToFamily`
//      match on the family id alone, so a record from another family is never
//      treated as belonging here.
//   B. `getRelationshipRequestForFamily` resolves by id AND family, so an id
//      that exists only in another family resolves to null.
//   C. `listConfirmedRelationshipsForFamily` filters to the requested family.
//   D. The legacy single-family wrappers delegate to the family-scoped reads
//      with the default Norwood family id.
//
// It deliberately does NOT characterize `findConfirmedRelationshipBetween`,
// which is an unimplemented `Debug.todo()` stub (the known relationship gap),
// nor the API-level endpoints, which the PocketIC lane exercises when a
// compiled wasm is present.
//
// This is a static-source characterization, not a real-canister run: the
// frontend suite mocks the actor, and the PocketIC lane cannot drive the
// backend without a compiled wasm (see the episode's coverageLimits).
// ---------------------------------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
// `here` is app/src/frontend/src; the backend sources live at app/src/backend.
const backendRoot = path.resolve(here, "..", "..", "backend");

function readBackend(relativePath: string): string {
  return readFileSync(path.join(backendRoot, relativePath), "utf8");
}

/** Strips `//` line comments and `/* ... *\/` block comments from Motoko source. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/[^\n]*/gu, "");
}

/** The body of a named `func`, from its signature to the closing `};`. */
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

const relationshipsLib = stripComments(
  readBackend(path.join("lib", "relationships.mo")),
);

describe("relationship family-scoping predicates (compatibility baseline)", () => {
  it("relationshipBelongsToFamily matches on the family id alone", () => {
    const body = functionBody(relationshipsLib, "relationshipBelongsToFamily");
    // The predicate is exactly the family-id comparison: a relationship from
    // another family is never treated as belonging here.
    expect(body).toContain("relationship.familyId == familyId");
  });

  it("relationshipRequestBelongsToFamily matches on the family id alone", () => {
    const body = functionBody(
      relationshipsLib,
      "relationshipRequestBelongsToFamily",
    );
    expect(body).toContain("request.familyId == familyId");
  });
});

describe("family-scoped relationship reads (compatibility baseline)", () => {
  it("getRelationshipRequestForFamily resolves by id AND family", () => {
    const body = functionBody(
      relationshipsLib,
      "getRelationshipRequestForFamily",
    );
    // Both the id and the family must match, so an id that exists only in
    // another family resolves to null.
    expect(body).toContain("r.id == id");
    expect(body).toContain("relationshipRequestBelongsToFamily(r, familyId)");
  });

  it("listConfirmedRelationshipsForFamily filters to the requested family", () => {
    const body = functionBody(
      relationshipsLib,
      "listConfirmedRelationshipsForFamily",
    );
    expect(body).toContain(
      "confirmed.toArray().filter(func r = relationshipBelongsToFamily(r, familyId))",
    );
  });
});

describe("legacy single-family relationship wrappers (compatibility baseline)", () => {
  it("getRelationshipRequest delegates to the family-scoped read with the default family id", () => {
    const body = functionBody(relationshipsLib, "getRelationshipRequest");
    expect(body).toContain("getRelationshipRequestForFamily(");
    expect(body).toContain("FamilyTypes.DEFAULT_FAMILY_ID");
  });

  it("listConfirmedRelationships delegates to the family-scoped read with the default family id", () => {
    const body = functionBody(relationshipsLib, "listConfirmedRelationships");
    expect(body).toContain("listConfirmedRelationshipsForFamily(");
    expect(body).toContain("FamilyTypes.DEFAULT_FAMILY_ID");
  });
});
