import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Characterization baseline for the family-creation change.
//
// The requested change ADDS a new backend operation,
// `createFamilyWithFounder(displayName, founderProfileInput)`, which creates a
// new Family, the founder's first PersonProfile inside it, and an Active
// FamilyMembership linking the authenticated caller to that founder profile —
// all in one transaction, with no StewardRecord.
//
// This file deliberately does NOT freeze the absence of a family-creation
// endpoint, and it does NOT assert that `createFamilyWithFounder` is missing:
// adding that endpoint is exactly the change under way. It also does not assert
// the new operation's own behavior, which does not exist yet.
//
// What it protects is the EXISTING behavior the new operation must not disturb,
// at the source level, so the new code path cannot silently reshape it:
//
//   A. The default-family read surface: `getFamily` is a read-only lookup that
//      never creates a family, and `ensureDefaultFamily` is idempotent — it
//      creates the default family only when missing and never duplicates,
//      overwrites, or resets it. The 20260921_000000.mo migration seeds exactly
//      one `norwood` family.
//   B. The existing profile-creation primitive `createMyselfForFamily`: it
//      rejects an anonymous caller, scopes ownership to the requested family,
//      writes a claimed profile plus an approved claim, and — the invariant the
//      new operation must preserve — writes NO StewardRecord.
//   C. The existing membership-creation primitives: they are family-scoped and
//      write NO StewardRecord.
//   D. The existing family-scoped API surface (`getFamily`,
//      `createMyselfForFamily`, the membership endpoints) stays present and
//      delegates to the domain libs, so the new operation composes existing
//      primitives rather than replacing them.
//
// This is a static-source characterization, not a real-canister run: the
// PocketIC lane cannot drive the backend without a compiled wasm, and the
// frontend suite mocks the actor. The real canister's default-family reads and
// family-scoped API behavior are covered by the PocketIC lane when a compiled
// wasm is present (see the episode's coverageLimits).
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

const familyLib = stripComments(readBackend(path.join("lib", "family.mo")));
const familyApi = stripComments(
  readBackend(path.join("mixins", "family-api.mo")),
);
const ownershipLib = stripComments(
  readBackend(path.join("lib", "ownership.mo")),
);
const ownershipApi = stripComments(
  readBackend(path.join("mixins", "ownership-api.mo")),
);
const membershipLib = stripComments(
  readBackend(path.join("lib", "family-membership.mo")),
);
const membershipApi = stripComments(
  readBackend(path.join("mixins", "family-membership-api.mo")),
);
const migration = readBackend(path.join("migrations", "20260921_000000.mo"));

// ---------------------------------------------------------------------------
// A. The default-family read surface is read-only and idempotent.
// ---------------------------------------------------------------------------

describe("default-family read surface (compatibility baseline)", () => {
  it("getFamily is a read-only lookup that never creates a family", () => {
    const body = functionBody(familyLib, "getFamily");
    // The lookup only reads the map; it must not add, remove, or otherwise
    // mutate the families collection.
    expect(body).toContain("families.get(familyId)");
    expect(body).not.toContain("families.add(");
    expect(body).not.toContain("families.remove(");
  });

  it("ensureDefaultFamily creates the default family only when it is missing", () => {
    const body = functionBody(familyLib, "ensureDefaultFamily");
    // The guard is the missing-family case; an existing default family is left
    // untouched (the `?` branch returns false without writing).
    expect(body).toContain("families.get(Types.DEFAULT_FAMILY_ID)");
    expect(body).toContain("case (?_) { false }");
    expect(body).toContain("families.add(Types.DEFAULT_FAMILY_ID");
    // The seeded record carries the canonical default id and display name.
    expect(body).toContain("id = Types.DEFAULT_FAMILY_ID");
    expect(body).toContain("displayName = Types.DEFAULT_FAMILY_DISPLAY_NAME");
    expect(body).toContain("status = #active");
  });

  it("the default family id and display name are the stable Norwood constants", () => {
    const familyTypes = stripComments(
      readBackend(path.join("types", "family.mo")),
    );
    expect(familyTypes).toContain(
      'public let DEFAULT_FAMILY_ID : FamilyId = "norwood";',
    );
    expect(familyTypes).toContain(
      'public let DEFAULT_FAMILY_DISPLAY_NAME : Text = "Norwood";',
    );
  });

  it("the tenancy migration seeds exactly one norwood family", () => {
    // The migration adds the default family once, with the canonical id and
    // display name; it does not loop or add a second family.
    expect(migration).toContain('let defaultFamilyId : FamilyId = "norwood";');
    expect(migration).toContain("families.add(defaultFamilyId, {");
    expect(migration).toContain('displayName = "Norwood"');
    // Exactly one `families.add(` call in the migration body.
    const addCalls = migration.match(/families\.add\(/gu) ?? [];
    expect(addCalls).toHaveLength(1);
  });

  it("the getFamily endpoint delegates to the read-only lib lookup", () => {
    const body = functionBody(familyApi, "getFamily");
    expect(body).toContain("FamilyLib.getFamily(families, familyId)");
    // The endpoint is a query and performs no authorization or mutation. The
    // `public query` prefix sits before the captured body, so it is asserted
    // against the full mixin source.
    expect(familyApi).toContain("public query func getFamily");
    expect(body).not.toContain("families.add(");
  });
});

// ---------------------------------------------------------------------------
// B. The existing profile-creation primitive and its no-Steward invariant.
// ---------------------------------------------------------------------------

describe("createMyselfForFamily profile-creation primitive (compatibility baseline)", () => {
  it("rejects an anonymous caller before creating anything", () => {
    const body = functionBody(ownershipLib, "createMyselfForFamily");
    // The anonymous guard is the first check, so an anonymous caller creates no
    // profile, claim, or notification.
    expect(body).toContain("caller.isAnonymous()");
    expect(body).toContain("#err(#NotSignedIn)");
  });

  it("scopes ownership to the requested family", () => {
    const body = functionBody(ownershipLib, "createMyselfForFamily");
    // The already-owned check is family-scoped: ownership in another family
    // does not block creation here.
    expect(body).toContain("profile.familyId == familyId");
    expect(body).toContain("profile.claimedByUserId == ?caller");
    expect(body).toContain("#err(#AlreadyOwned)");
  });

  it("writes a claimed profile and an approved claim in the requested family", () => {
    const body = functionBody(ownershipLib, "createMyselfForFamily");
    // The created profile is claimed by the caller and belongs to the family.
    expect(body).toContain("familyId;");
    expect(body).toContain("claimStatus = #Claimed");
    expect(body).toContain("claimedByUserId = ?caller");
    // The profile is stored under the family-qualified key.
    expect(body).toContain(
      "TenancyLib.putProfileForFamily(profiles, familyId, profile)",
    );
    // An approved claim is recorded for the caller in the same family.
    expect(body).toContain("status = #Approved");
    expect(body).toContain("requestingUserId = caller");
  });

  it("does NOT create a StewardRecord", () => {
    const body = functionBody(ownershipLib, "createMyselfForFamily");
    // The primitive writes profiles, claims, and notifications only. A Steward
    // record is governance authority and is never implied by profile creation.
    expect(body).not.toContain("stewards");
    expect(body).not.toContain("StewardRecord");
  });

  it("the createMyselfForFamily endpoint delegates to the ownership lib", () => {
    const body = functionBody(ownershipApi, "createMyselfForFamily");
    expect(body).toContain(
      "OwnershipLib.createMyselfForFamily(profiles, claims, notifications, familyId, name, caller)",
    );
  });
});

// ---------------------------------------------------------------------------
// C. The existing membership-creation primitives and their no-Steward
//    invariant.
// ---------------------------------------------------------------------------

describe("membership-creation primitives (compatibility baseline)", () => {
  it("createPendingMembershipForFamily is family-scoped and writes no StewardRecord", () => {
    const body = functionBody(
      membershipLib,
      "createPendingMembershipForFamily",
    );
    // The person must belong to the requested family, and the duplicate checks
    // are family-scoped.
    expect(body).toContain(
      "personBelongsToFamily(profiles, claims, personId, familyId)",
    );
    expect(body).toContain("#err(#PersonNotInFamily)");
    expect(body).toContain(
      "getMembershipForFamily(memberships, familyId, accountId)",
    );
    expect(body).toContain("#err(#AlreadyMember)");
    // The created record is #Pending and stamped with the family id.
    expect(body).toContain("status = #Pending");
    expect(body).toContain("familyId;");
    // No Steward record is written by membership creation.
    expect(body).not.toContain("stewards");
    expect(body).not.toContain("StewardRecord");
  });

  it("activateMembershipForFamily records the real caller and writes no StewardRecord", () => {
    const body = functionBody(membershipLib, "activateMembershipForFamily");
    // Activation is family-scoped, requires a #Pending record, and records the
    // authenticated approver.
    expect(body).toContain(
      "getMembershipByIdForFamily(memberships, familyId, membershipId)",
    );
    expect(body).toContain("membership.status != #Pending");
    expect(body).toContain("approvedBy = ?approvedBy");
    expect(body).toContain("status = #Active");
    // No Steward record is written by activation.
    expect(body).not.toContain("stewards");
    expect(body).not.toContain("StewardRecord");
  });

  it("the membership endpoints gate on the canonical family-scoped Steward check", () => {
    for (const name of [
      "createPendingMembershipForFamily",
      "activateMembershipForFamily",
      "suspendMembershipForFamily",
    ]) {
      const body = functionBody(membershipApi, name);
      expect(body).toContain(
        "StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)",
      );
      // The platform admin role is never consulted.
      expect(body).not.toContain("isAdmin");
      expect(body).not.toContain("accessControl");
    }
  });

  it("the membership endpoints delegate to the membership domain lib", () => {
    expect(
      functionBody(membershipApi, "createPendingMembershipForFamily"),
    ).toContain("FamilyMembershipLib.createPendingMembershipForFamily(");
    expect(
      functionBody(membershipApi, "activateMembershipForFamily"),
    ).toContain("FamilyMembershipLib.activateMembershipForFamily(");
  });
});

// ---------------------------------------------------------------------------
// D. The existing family-scoped API surface stays present.
//
// The new operation composes existing primitives; it must not remove or rename
// the endpoints the rest of the app already calls. This asserts presence, not
// the absence of the new operation.
// ---------------------------------------------------------------------------

describe("existing family-scoped API surface (compatibility baseline)", () => {
  it("keeps the family read and profile-creation endpoints", () => {
    expect(familyApi).toContain("public query func getFamily(");
    expect(ownershipApi).toContain(
      "public shared ({ caller }) func createMyselfForFamily(",
    );
  });

  it("keeps the family-scoped membership endpoints", () => {
    for (const signature of [
      "func getMembershipForFamily(",
      "func getMyMembershipForFamily(",
      "func listMembershipsForAccount(",
      "func listFamilyMembersForFamily(",
      "func hasActiveMembershipForFamily(",
      "func createPendingMembershipForFamily(",
      "func activateMembershipForFamily(",
      "func leaveFamilyMembership(",
      "func suspendMembershipForFamily(",
    ]) {
      expect(membershipApi).toContain(signature);
    }
  });

  it("keeps the family-scoped person predicate the membership invariant relies on", () => {
    const familyAuthorization = stripComments(
      readBackend(path.join("lib", "family-authorization.mo")),
    );
    const body = functionBody(familyAuthorization, "isPersonInFamily");
    // The default family accepts any well-formed person id (the legacy tree);
    // a non-default family requires a profile or an approved claim in it.
    expect(body).toContain("familyId == FamilyTypes.DEFAULT_FAMILY_ID");
    expect(body).toContain(
      "TenancyLib.getProfileForFamily(profiles, familyId, personId)",
    );
    expect(body).toContain("c.status == #Approved");
    expect(body).toContain("c.familyId == familyId");
  });
});
