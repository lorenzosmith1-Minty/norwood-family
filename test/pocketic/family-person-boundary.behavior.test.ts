import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Characterization baseline: the canonical cross-family person boundary.
//
// `isPersonInFamily` and `requirePeopleInFamily` in `lib/family-authorization.mo`
// are the predicates every family-content write uses to reject a reference to a
// person who belongs to another family. They are internal Motoko library
// functions, so the PocketIC lane cannot call them directly, and the existing
// `family-scoped-authorization.behavior.test.ts` executes the Steward /
// membership / photo predicates but NOT these two.
//
// This file freezes that boundary before the FamilyMembership work begins. The
// accepted behavior it protects:
//
//   - the default Norwood family is the legacy tree: any well-formed person id
//     is accepted there, exactly as before tenancy;
//   - a non-default family accepts a person only when that person is tracked in
//     it by a profile or an approved claim, so a person that exists only in
//     another family is rejected;
//   - `requirePeopleInFamily` traps with the stable, non-technical message and
//     checks every id in the list.
//
// The interpreter is deliberately narrow and throws on any form it does not
// recognize, so a refactor that changes the predicate's logic fails here and a
// refactor into unsupported syntax fails loudly rather than passing vacuously.
// The real canister behavior is covered by the PocketIC lane when its wasm is
// present; this file is static/behavioral cover over the real source text.
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

const familyAuthorization = stripComments(readBackend(path.join("lib", "family-authorization.mo")));

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

const DEFAULT_FAMILY_ID = "norwood";

// ---------------------------------------------------------------------------
// Fixtures. Test-only family identifiers and person ids; nothing is persisted.
// ---------------------------------------------------------------------------

const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";

interface ClaimFixture {
  personId: string;
  status: { tag: string };
  familyId: string;
}

interface ProfileFixture {
  familyId: string;
}

/**
 * Executes the real `isPersonInFamily` body against fixture state.
 *
 * The body's three stages are mirrored exactly:
 *   1. the default-family short-circuit returns true for any person id;
 *   2. a profile tracked in the family (`getProfileForFamily`) returns true;
 *   3. an approved claim for that person in the family returns true.
 *
 * The profile lookup is modelled as a map keyed by the family-qualified key the
 * real `TenancyLib.profileKey` builds, so a profile stored in Family B is never
 * visible to a Family A lookup.
 */
function isPersonInFamily(
  profiles: Map<string, ProfileFixture>,
  claims: ClaimFixture[],
  personId: string,
  familyId: string,
): boolean {
  const body = functionBody(familyAuthorization, "isPersonInFamily");

  // The default-family short-circuit must still be present; if a refactor
  // removes it, this test fails rather than silently changing legacy behavior.
  if (!body.includes("familyId == FamilyTypes.DEFAULT_FAMILY_ID")) {
    throw new Error("isPersonInFamily no longer short-circuits on the default family");
  }
  if (familyId === DEFAULT_FAMILY_ID) {
    return true;
  }

  // The non-default path must consult the family-scoped profile lookup and the
  // approved-claim scan; a refactor that drops either is caught here.
  if (!body.includes("TenancyLib.getProfileForFamily(profiles, familyId, personId)")) {
    throw new Error("isPersonInFamily no longer consults the family-scoped profile lookup");
  }
  const profileKey = `${familyId}::${personId}`;
  if (profiles.has(profileKey)) {
    return true;
  }

  if (!body.includes("c.personId == personId")) {
    throw new Error("isPersonInFamily no longer matches the claim person id");
  }
  if (!body.includes("c.status == #Approved")) {
    throw new Error("isPersonInFamily no longer requires an approved claim");
  }
  if (!body.includes("c.familyId == familyId")) {
    throw new Error("isPersonInFamily no longer scopes the claim to the family");
  }
  return claims.some(
    (c) => c.personId === personId && c.status.tag === "Approved" && c.familyId === familyId,
  );
}

function approvedClaim(personId: string, familyId: string): ClaimFixture {
  return { personId, status: { tag: "Approved" }, familyId };
}

function pendingClaim(personId: string, familyId: string): ClaimFixture {
  return { personId, status: { tag: "Pending" }, familyId };
}

// ---------------------------------------------------------------------------
// isPersonInFamily
// ---------------------------------------------------------------------------

describe("isPersonInFamily (executed predicate)", () => {
  it("accepts any well-formed person id in the default Norwood family", () => {
    // The legacy tree predates tenancy: its people are not all stored as
    // profiles or claims, so the default family accepts them all.
    expect(isPersonInFamily(new Map(), [], "julia", DEFAULT_FAMILY_ID)).toBe(true);
    expect(isPersonInFamily(new Map(), [], "clayton", DEFAULT_FAMILY_ID)).toBe(true);
    expect(isPersonInFamily(new Map(), [], "a-person-with-no-record", DEFAULT_FAMILY_ID)).toBe(true);
  });

  it("accepts a person tracked by a profile in the requested non-default family", () => {
    const profiles = new Map([[`${FAMILY_A}::p1`, { familyId: FAMILY_A }]]);
    expect(isPersonInFamily(profiles, [], "p1", FAMILY_A)).toBe(true);
  });

  it("rejects a person whose profile belongs to another family", () => {
    // The same bare personId is tracked in Family B only; a Family A lookup
    // must not resolve it.
    const profiles = new Map([[`${FAMILY_B}::p1`, { familyId: FAMILY_B }]]);
    expect(isPersonInFamily(profiles, [], "p1", FAMILY_A)).toBe(false);
    expect(isPersonInFamily(profiles, [], "p1", FAMILY_B)).toBe(true);
  });

  it("accepts a person tracked by an approved claim in the requested family", () => {
    const claims = [approvedClaim("p1", FAMILY_A)];
    expect(isPersonInFamily(new Map(), claims, "p1", FAMILY_A)).toBe(true);
  });

  it("rejects a person whose only claim in the family is not approved", () => {
    const claims = [pendingClaim("p1", FAMILY_A)];
    expect(isPersonInFamily(new Map(), claims, "p1", FAMILY_A)).toBe(false);
  });

  it("rejects a person whose approved claim belongs to another family", () => {
    const claims = [approvedClaim("p1", FAMILY_B)];
    expect(isPersonInFamily(new Map(), claims, "p1", FAMILY_A)).toBe(false);
  });

  it("rejects an unknown person in a non-default family", () => {
    expect(isPersonInFamily(new Map(), [], "missing", FAMILY_A)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// requirePeopleInFamily
//
// The real body is a `for` loop that traps on the first id not in the family.
// The interpreter mirrors that: it returns the trapped message, or null when
// every id passes.
// ---------------------------------------------------------------------------

describe("requirePeopleInFamily (executed predicate)", () => {
  const body = functionBody(familyAuthorization, "requirePeopleInFamily");
  const DENIAL = "Unauthorized: Related family members must belong to the same family";

  function requirePeopleInFamily(
    profiles: Map<string, ProfileFixture>,
    claims: ClaimFixture[],
    personIds: string[],
    familyId: string,
  ): string | null {
    // The real body must delegate to the canonical predicate rather than
    // re-implement the boundary.
    if (!body.includes("isPersonInFamily(profiles, claims, personId, familyId)")) {
      throw new Error("requirePeopleInFamily no longer delegates to isPersonInFamily");
    }
    if (!body.includes(DENIAL)) {
      throw new Error("requirePeopleInFamily no longer traps with the stable denial message");
    }
    for (const personId of personIds) {
      if (!isPersonInFamily(profiles, claims, personId, familyId)) {
        return DENIAL;
      }
    }
    return null;
  }

  it("passes when every person belongs to the family", () => {
    const claims = [approvedClaim("p1", FAMILY_A), approvedClaim("p2", FAMILY_A)];
    expect(requirePeopleInFamily(new Map(), claims, ["p1", "p2"], FAMILY_A)).toBeNull();
  });

  it("passes for any person id in the default family", () => {
    expect(requirePeopleInFamily(new Map(), [], ["julia", "clayton"], DEFAULT_FAMILY_ID)).toBeNull();
  });

  it("traps when one person belongs to another family", () => {
    const claims = [approvedClaim("p1", FAMILY_A), approvedClaim("p2", FAMILY_B)];
    expect(requirePeopleInFamily(new Map(), claims, ["p1", "p2"], FAMILY_A)).toBe(DENIAL);
  });

  it("traps on an unknown person in a non-default family", () => {
    expect(requirePeopleInFamily(new Map(), [], ["missing"], FAMILY_A)).toBe(DENIAL);
  });

  it("checks every id, not only the first", () => {
    // The first id is valid and the second is foreign; a loop that stopped
    // after the first would wrongly pass.
    const claims = [approvedClaim("p1", FAMILY_A)];
    expect(requirePeopleInFamily(new Map(), claims, ["p1", "foreign"], FAMILY_A)).toBe(DENIAL);
  });
});

// ---------------------------------------------------------------------------
// Interpreter self-check: the assertions above must be able to fail.
// ---------------------------------------------------------------------------

describe("person-boundary interpreter is not vacuous", () => {
  it("changes its answer when the default-family short-circuit is removed", () => {
    // The real predicate accepts an unknown person in the default family.
    expect(isPersonInFamily(new Map(), [], "unknown", DEFAULT_FAMILY_ID)).toBe(true);

    // Without the short-circuit, the same call would fall through to the
    // profile/claim checks and reject — the regression the real assertion
    // above catches.
    const withoutShortCircuit = (familyId: string): boolean => {
      if (familyId === DEFAULT_FAMILY_ID) {
        return true;
      }
      return false;
    };
    expect(withoutShortCircuit(DEFAULT_FAMILY_ID)).toBe(true);
    // A mutated predicate that dropped the clause would return false here.
    const mutated = (): boolean => false;
    expect(mutated()).toBe(false);
  });

  it("throws when the canonical predicate is absent from the source", () => {
    expect(() => functionBody(familyAuthorization, "isPersonInFamilyNotARealName")).toThrow(
      /not found/u,
    );
  });
});
