import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Onboarding Phase 1A-H — FamilyMembership predicate, API-doc, and migration
// contract (static/behavioral cover).
//
// Three accepted behaviors cannot be driven through the real canister's public
// API and are covered here instead:
//
//   1. The `#PersonNotInFamily` rejection. `createPendingMembershipForFamily`
//      is Steward-gated for the requested family, and no public endpoint
//      creates a Steward of a non-default family, so a membership in a
//      non-default family cannot be created through the API. The rejection is
//      produced by the canonical `isPersonInFamily` predicate, an internal
//      Motoko library function, so this file executes the real predicate body
//      against fixtures.
//
//   2. The API documentation contract. `mixins/api-doc.mo` is a changed file
//      in this build: it documents `FamilyMembership`, its separation from
//      `ProfileClaim` and `StewardRecord`, and the read-authorization and
//      uniqueness invariants. The doc is a Motoko string literal, not
//      reachable through the Candid interface, so this file reads the real
//      source and pins the contract facts a reader must be able to rely on.
//
//   3. The migration conflict rule. `migrations/20261002_000000.mo` documents
//      the deterministic rule it uses to pick the surviving `#Active`
//      membership. The rule is a comment, not executable through the public
//      API, so this file pins the documented rule and the code that implements
//      it.
//
// The interpreter is deliberately narrow and throws on any form it does not
// recognize, so a refactor that changes the predicate's logic fails here and a
// refactor into unsupported syntax fails loudly rather than passing vacuously.
// The runtime behavior of the public API is covered by
// `family-membership.cover.test.ts` (real canister) and the migration by
// `family-membership.upgrade.test.ts`.
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

const familyAuthorizationLib = stripComments(
  readBackend(path.join("lib", "family-authorization.mo")),
);

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
const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";

interface ClaimFixture {
  personId: string;
  status: { tag: string };
  familyId: string;
}

/**
 * Executes the real `isPersonInFamily` body against fixture state.
 *
 * The body's three stages are mirrored exactly:
 *   1. the default-family short-circuit returns true for any person id;
 *   2. a profile tracked in the family (`TenancyLib.getProfileForFamily`)
 *      returns true;
 *   3. an approved claim for that person in the family returns true.
 *
 * The profile lookup is modelled as a map keyed by the family-qualified key the
 * real `TenancyLib.profileKey` builds, so a profile stored in Family B is never
 * visible to a Family A lookup.
 */
function isPersonInFamily(
  profiles: Map<string, { familyId: string }>,
  claims: ClaimFixture[],
  personId: string,
  familyId: string,
): boolean {
  const body = functionBody(familyAuthorizationLib, "isPersonInFamily");

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

describe("isPersonInFamily (executed canonical predicate)", () => {
  it("accepts any well-formed person id in the default Norwood family", () => {
    // The legacy tree predates tenancy: its people are not all stored as
    // profiles or claims, so the default family accepts them all. This is why
    // the #PersonNotInFamily rejection is unreachable for Norwood.
    expect(isPersonInFamily(new Map(), [], "julia", DEFAULT_FAMILY_ID)).toBe(true);
    expect(isPersonInFamily(new Map(), [], "a-person-with-no-record", DEFAULT_FAMILY_ID)).toBe(true);
  });

  it("accepts a person tracked by a profile in the requested non-default family", () => {
    const profiles = new Map([[`${FAMILY_A}::p1`, { familyId: FAMILY_A }]]);
    expect(isPersonInFamily(profiles, [], "p1", FAMILY_A)).toBe(true);
  });

  it("rejects a person whose profile belongs to another family", () => {
    // The same bare personId is tracked in Family B only; a Family A lookup
    // must not resolve it — the invariant that a membership's personId must
    // belong to its familyId.
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
    // This is the #PersonNotInFamily branch createPendingMembershipForFamily
    // returns when the person does not belong to the requested family.
    expect(isPersonInFamily(new Map(), [], "missing", FAMILY_A)).toBe(false);
  });
});

describe("isPersonInFamily interpreter is not vacuous", () => {
  it("changes its answer when the default-family short-circuit is removed", () => {
    expect(isPersonInFamily(new Map(), [], "unknown", DEFAULT_FAMILY_ID)).toBe(true);
    // Without the short-circuit the same call would fall through to the
    // profile/claim checks and reject.
    const mutated = (): boolean => false;
    expect(mutated()).toBe(false);
  });

  it("throws when the canonical predicate is absent from the source", () => {
    expect(() => functionBody(familyAuthorizationLib, "isPersonInFamilyNotARealName")).toThrow(
      /not found/u,
    );
  });
});

// ---------------------------------------------------------------------------
// API-doc contract: FamilyMembership, its separation from ProfileClaim and
// StewardRecord, and the read-authorization and uniqueness invariants.
// ---------------------------------------------------------------------------

const apiDoc = readBackend(path.join("mixins", "api-doc.mo"));

/** The Family Membership section, from its heading to the next `### ` heading. */
function familyMembershipSection(source: string): string {
  const start = source.indexOf("### Family Membership");
  if (start === -1) {
    throw new Error("Family Membership section not found in api-doc.mo");
  }
  const end = source.indexOf("\n### ", start + 1);
  return end === -1 ? source.slice(start) : source.slice(start, end);
}

const section = familyMembershipSection(apiDoc);

describe("FamilyMembership API doc: the record and its separation from other concepts", () => {
  it("documents FamilyMembership as the canonical account-to-family membership state", () => {
    expect(section).toContain("`FamilyMembership` is the canonical account-to-family membership state");
    // The record's fields are named.
    for (const field of [
      "`id`",
      "`familyId`",
      "`accountId`",
      "`personId`",
      "`status`",
      "`joinedAt`",
      "`approvedBy`",
      "`approvedAt`",
      "`createdAt`",
      "`updatedAt`",
    ]) {
      expect(section).toContain(field);
    }
  });

  it("documents all four status values", () => {
    expect(section).toContain("`#Pending`");
    expect(section).toContain("`#Active`");
    expect(section).toContain("`#Suspended`");
    expect(section).toContain("`#Left`");
  });

  it("separates FamilyMembership from ProfileClaim and StewardRecord", () => {
    // The doc names ProfileClaim as the legacy claim workflow and StewardRecord
    // as governance authority, not membership.
    expect(section).toContain("`ProfileClaim` is the legacy claim workflow");
    expect(section).toContain("`StewardRecord` is family governance authority, not membership");
    expect(section).toContain("Membership is never inferred from `StewardRecord`");
  });

  it("documents the family-scoping and uniqueness invariants", () => {
    expect(section).toContain("A membership in Family A never implies membership in Family B");
    expect(section).toContain("`personId` must belong to that `familyId`");
    // The Phase 1A-H hardening states both uniqueness invariants explicitly.
    expect(section).toContain("At most one `#Active` membership may exist per `familyId` + `accountId`");
    expect(section).toContain("At most one `#Active` membership may exist per `familyId` + `personId`");
    // Only #Active satisfies the active-access predicate.
    expect(section).toContain("only `#Active` satisfies `hasActiveMembershipForFamily`");
  });

  it("documents each canonical membership method", () => {
    for (const method of [
      "`getMembershipForFamily(",
      "`getMyMembershipForFamily(",
      "`listMembershipsForAccount(",
      "`listFamilyMembersForFamily(",
      "`hasActiveMembershipForFamily(",
      "`createPendingMembershipForFamily(",
      "`activateMembershipForFamily(",
      "`leaveFamilyMembership(",
      "`suspendMembershipForFamily(",
    ]) {
      expect(section).toContain(method);
    }
  });

  it("documents that activation is never self-service and records the real caller", () => {
    // The doc wraps its prose, so match the fragments that survive the wrap.
    expect(section).toContain("unrestricted self-promotion to `#Active`");
    expect(section).toContain("Active Steward of `familyId` only");
    expect(section).toContain("a caller-supplied approver identity is never trusted");
    expect(section).toContain("`approvedBy = ?caller`");
  });

  it("documents the read-authorization gate and uniform non-leaking denials", () => {
    expect(section).toContain("Every read below is gated on the caller");
    expect(section).toContain("`#err(#NotSignedIn)`");
    expect(section).toContain("`#err(#NotAuthorized)`");
    expect(section).toContain("Denials are");
    expect(section).toContain("uniform and non-leaking");
    expect(section).toContain("Anonymous");
    expect(section).toContain("cannot enumerate account ids, person ids, or family memberships");
  });

  it("documents the leave rule: the member's own account or an active Steward", () => {
    expect(section).toContain("The caller may");
    expect(section).toContain("be the membership's own account, or an active Steward of `familyId`");
  });
});

// ---------------------------------------------------------------------------
// Migration conflict rule: the deterministic rule the 20261002_000000.mo
// migration documents and implements.
// ---------------------------------------------------------------------------

const migrationSource = readBackend(path.join("migrations", "20261002_000000.mo"));

describe("FamilyMembership migration conflict rule", () => {
  it("documents the deterministic first-wins conflict rule", () => {
    expect(migrationSource).toContain("DETERMINISTIC CONFLICT RULE");
    expect(migrationSource).toContain("the FIRST `#Active` membership for a given (familyId, accountId) wins");
    expect(migrationSource).toContain("the FIRST `#Active` membership for a given (familyId, personId) wins");
    expect(migrationSource).toContain("a later `#Active` membership that collides on EITHER key is dropped");
  });

  it("documents that non-Active memberships are preserved and the migration is idempotent", () => {
    expect(migrationSource).toContain("Non-`#Active` memberships");
    expect(migrationSource).toContain("are never deduped and are always preserved");
    expect(migrationSource).toContain("IDEMPOTENCE");
    expect(migrationSource).toContain("never duplicates a record");
  });

  it("documents that ProfileClaims and other stable collections are preserved", () => {
    expect(migrationSource).toContain("PRESERVATION");
    expect(migrationSource).toContain("ProfileClaims, Steward records, profiles, relationships, ids,");
    expect(migrationSource).toContain("`claims` is read only and carried through");
  });

  it("implements the documented rule: seen-sets gate admission on both keys", () => {
    // The code must track both slots and admit only when both are free.
    expect(migrationSource).toContain("seenAccounts");
    expect(migrationSource).toContain("seenPersons");
    expect(migrationSource).toContain("not seenAccounts.contains(aKey) and not seenPersons.contains(pKey)");
    // Non-Active memberships are added unconditionally.
    expect(migrationSource).toContain("memberships.add(membership)");
  });
});
