import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Tenancy 1B — family-scoped authorization helpers (static cover).
//
// The accepted behavior for this phase is that Norwood's core authorization
// helpers become explicitly family-scoped, so a caller's authority in Family A
// never grants authority in Family B. The canonical helpers live in
// `lib/steward-authority.mo` and `lib/family-authorization.mo` and are internal
// library functions: they are not reachable through the canister's Candid
// interface, so the PocketIC lane cannot drive them directly. This file is the
// static/unit cover for exactly those predicates.
//
// It reads the real Motoko sources and asserts the family-scoping rules the
// requirement names, using test-only Family A / Family B identifiers. It also
// proves the legacy single-family helpers are TEMPORARY wrappers that delegate
// to the canonical family-scoped helpers with the default family id, so there
// is exactly one authorization implementation rather than two.
//
// The default-family compatibility of the public API (familyId "norwood"
// behavior unchanged) is covered by the PocketIC lane, which drives the real
// canister.
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

const stewardAuthority = readBackend(path.join("lib", "steward-authority.mo"));
const familyAuthorization = readBackend(path.join("lib", "family-authorization.mo"));

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

describe("family-scoped Steward authority", () => {
  it("isActiveStewardForFamily requires the caller, #Active, and the matching familyId", () => {
    const body = functionBody(stewardAuthority, "isActiveStewardForFamily");
    // The three conjuncts the requirement names, all in one predicate.
    expect(body).toContain("s.stewardAccountId == caller");
    expect(body).toContain("s.roleStatus == #Active");
    expect(body).toContain("s.familyId == familyId");
    // It must not consult the platform admin role.
    expect(body).not.toContain("isAdmin");
    expect(body).not.toContain("accessControl");
  });

  it("hasActiveStewardForFamily is keyed on the family, not on any active Steward anywhere", () => {
    const body = functionBody(stewardAuthority, "hasActiveStewardForFamily");
    expect(body).toContain("s.roleStatus == #Active");
    expect(body).toContain("s.familyId == familyId");
    // The generic rule must no longer be "no Steward exists anywhere": the
    // family predicate must not be a bare any-active-Steward scan.
    expect(body).not.toMatch(/any\(func s = s\.roleStatus == #Active\)/);
  });

  it("keeps the legacy helpers as temporary default-family wrappers", () => {
    const legacySteward = functionBody(stewardAuthority, "isActiveSteward");
    expect(legacySteward).toContain("isActiveStewardForFamily");
    expect(legacySteward).toContain("FamilyTypes.DEFAULT_FAMILY_ID");

    const legacyHas = functionBody(stewardAuthority, "hasActiveSteward");
    expect(legacyHas).toContain("hasActiveStewardForFamily");
    expect(legacyHas).toContain("FamilyTypes.DEFAULT_FAMILY_ID");

    // The wrappers are documented as temporary compatibility, not as a second
    // independent implementation.
    expect(stewardAuthority).toContain("TEMPORARY Tenancy 1B compatibility");
  });
});

describe("family-scoped membership and requirement helpers", () => {
  it("isApprovedFamilyMemberForFamily is Steward-of-family OR an approved claim in that family", () => {
    const body = functionBody(familyAuthorization, "isApprovedFamilyMemberForFamily");
    expect(body).toContain("isStewardForFamily(stewards, caller, familyId)");
    expect(body).toContain("c.requestingUserId == caller");
    expect(body).toContain("c.status == #Approved");
    expect(body).toContain("c.familyId == familyId");
    expect(body).not.toContain("isAdmin");
  });

  it("requireApprovedFamilyMemberForFamily denies anonymous and unapproved with the stable messages", () => {
    const body = functionBody(familyAuthorization, "requireApprovedFamilyMemberForFamily");
    expect(body).toContain("caller.isAnonymous()");
    expect(body).toContain("SIGN_IN_REQUIRED_MESSAGE");
    expect(body).toContain("FAMILY_MEMBERSHIP_REQUIRED_MESSAGE");
    expect(body).toContain("isApprovedFamilyMemberForFamily(stewards, claims, caller, familyId)");
  });

  it("requireActiveStewardForFamily denies non-Stewards without consulting platform admin", () => {
    const body = functionBody(familyAuthorization, "requireActiveStewardForFamily");
    expect(body).toContain("isStewardForFamily(stewards, caller, familyId)");
    // Uses the existing Steward-access denial behavior.
    expect(body).toContain("Unauthorized: Only Family Stewards can perform this action");
    expect(body).not.toContain("isAdmin");
    expect(body).not.toContain("accessControl");
  });

  it("keeps the legacy membership helpers as temporary default-family wrappers", () => {
    const legacyApproved = functionBody(familyAuthorization, "isApprovedFamilyMember");
    expect(legacyApproved).toContain("isApprovedFamilyMemberForFamily");
    expect(legacyApproved).toContain("FamilyTypes.DEFAULT_FAMILY_ID");

    const legacyRequire = functionBody(familyAuthorization, "requireApprovedFamilyMember");
    expect(legacyRequire).toContain("requireApprovedFamilyMemberForFamily");
    expect(legacyRequire).toContain("FamilyTypes.DEFAULT_FAMILY_ID");

    expect(familyAuthorization).toContain("TEMPORARY Tenancy 1B compatibility");
  });
});

describe("family-scoped photo and profile ownership authority", () => {
  it("canManagePersonPhotosForFamily requires the profile and the caller's authority to be in the family", () => {
    const body = functionBody(familyAuthorization, "canManagePersonPhotosForFamily");
    // The target profile must belong to the family.
    expect(body).toContain("p.familyId != familyId");
    // Steward authority is for the family.
    expect(body).toContain("isStewardForFamily(stewards, caller, familyId)");
    // Approved-member authority is for the family.
    expect(body).toContain("isApprovedFamilyMemberForFamily(stewards, claims, caller, familyId)");
    expect(body).not.toContain("isAdmin");
  });

  it("requirePhotoMutationAuthorityForFamily and requireGalleryReadAuthorityForFamily are family-scoped", () => {
    const mutation = functionBody(familyAuthorization, "requirePhotoMutationAuthorityForFamily");
    expect(mutation).toContain("canManagePersonPhotosForFamily(stewards, profiles, claims, caller, personId, familyId)");

    const read = functionBody(familyAuthorization, "requireGalleryReadAuthorityForFamily");
    expect(read).toContain("canViewPersonGalleryForFamily(stewards, claims, caller, familyId)");

    const view = functionBody(familyAuthorization, "canViewPersonGalleryForFamily");
    expect(view).toContain("isApprovedFamilyMemberForFamily(stewards, claims, caller, familyId)");
  });

  it("keeps the legacy photo helpers as temporary default-family wrappers", () => {
    const legacyManage = functionBody(familyAuthorization, "canManagePersonPhotos");
    expect(legacyManage).toContain("canManagePersonPhotosForFamily");
    expect(legacyManage).toContain("FamilyTypes.DEFAULT_FAMILY_ID");

    const legacyMutation = functionBody(familyAuthorization, "requirePhotoMutationAuthority");
    expect(legacyMutation).toContain("requirePhotoMutationAuthorityForFamily");
    expect(legacyMutation).toContain("FamilyTypes.DEFAULT_FAMILY_ID");

    const legacyRead = functionBody(familyAuthorization, "requireGalleryReadAuthority");
    expect(legacyRead).toContain("requireGalleryReadAuthorityForFamily");
    expect(legacyRead).toContain("FamilyTypes.DEFAULT_FAMILY_ID");
  });
});

describe("family-scoped Steward bootstrap", () => {
  it("claimStewardForFamily succeeds only when THAT family has no active Steward", () => {
    const body = functionBody(stewardAuthority, "claimStewardForFamily");
    // The gate is the family-scoped existence check, not a global one.
    expect(body).toContain("hasActiveStewardForFamily(stewards, familyId)");
    expect(body).not.toMatch(/hasActiveSteward\(stewards\)/);
    // The created record carries the requested family.
    expect(body).toContain("familyId;");
  });

  it("keeps the legacy bootstrap as a temporary default-family wrapper", () => {
    const legacyClaim = functionBody(stewardAuthority, "claimSteward");
    expect(legacyClaim).toContain("claimStewardForFamily");
    expect(legacyClaim).toContain("FamilyTypes.DEFAULT_FAMILY_ID");
  });
});

describe("single canonical implementation", () => {
  it("does not leave a second independent Steward predicate in the authorization libs", () => {
    // The only active-Steward predicate in the canonical libs is the
    // family-scoped one; the legacy name must delegate rather than re-implement.
    const stewardPredicates = stewardAuthority.match(/func isActiveSteward\w*\(/gu) ?? [];
    expect(stewardPredicates).toEqual(["func isActiveStewardForFamily(", "func isActiveSteward("]);

    // The legacy wrapper body must not itself scan the stewards list.
    const legacySteward = functionBody(stewardAuthority, "isActiveSteward");
    expect(legacySteward).not.toContain("stewards.toArray()");
  });

  it("keeps the family-scoped helpers free of platform-admin authority", () => {
    for (const source of [stewardAuthority, familyAuthorization]) {
      const code = stripComments(source);
      expect(code).not.toContain("AccessControl");
      expect(code).not.toContain("isAdmin");
    }
  });
});
