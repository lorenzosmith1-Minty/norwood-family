import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Characterization baseline for the family-scoped founding-Steward onboarding
// change.
//
// The requested change ADDS a family-scoped onboarding governance state
// (Undecided / FounderAccepted / NominationPending / Transferred) and the
// founding-Steward operations that drive it: the founder accepts founding
// Stewardship for their own family, the founder nominates a PersonProfile of
// their own family as founding Steward (optionally with an email for an
// unclaimed nominee), an authenticated nominee linked to the nominated profile
// through an Active FamilyMembership accepts, and the founder cancels / the
// nominee declines a pending nomination.
//
// This file deliberately does NOT freeze the absence of that state or those
// operations: adding them is exactly the change under way. It also does not
// assert the new operations' own behavior, which does not exist yet.
//
// What it protects is the EXISTING behavior the new onboarding path must not
// disturb, at the source level, so the new code cannot silently reshape it:
//
//   A. Existing Steward authority: `isActiveStewardForFamily`,
//      `hasActiveStewardForFamily`, `claimStewardForFamily`, and the
//      promote/remove/list operations remain family-scoped, and the legacy
//      single-family wrappers still delegate to them with the default family
//      id. Authority in one family never grants authority in another.
//   B. Existing FamilyMembership: family-scoped lookups and transitions, the
//      canonical `personBelongsToFamily` predicate, and the invariant that
//      membership creation/activation writes NO StewardRecord.
//   C. Existing family creation: `createFamilyWithFounder` still creates
//      exactly the three linked records (Family + founder PersonProfile +
//      Active FamilyMembership) and still writes NO StewardRecord.
//   D. The default Norwood family constants and the default-family read
//      surface are unchanged.
//   E. The existing StewardRecord / StewardError / StewardClaimError type
//      contracts the frontend consumes are unchanged.
//
// This is a static-source characterization, not a real-canister run: the
// PocketIC lane cannot drive the backend without a compiled wasm, and the
// frontend suite mocks the actor. The real canister's behavior is covered by
// the PocketIC lane when a compiled wasm is present (see coverageLimits).
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

const stewardAuthorityLib = stripComments(
  readBackend(path.join("lib", "steward-authority.mo")),
);
const governanceLib = stripComments(
  readBackend(path.join("lib", "governance.mo")),
);
const governanceApi = stripComments(
  readBackend(path.join("mixins", "governance-api.mo")),
);
const stewardAuthorityApi = stripComments(
  readBackend(path.join("mixins", "steward-authority-api.mo")),
);
const membershipLib = stripComments(
  readBackend(path.join("lib", "family-membership.mo")),
);
const membershipApi = stripComments(
  readBackend(path.join("mixins", "family-membership-api.mo")),
);
const creationLib = stripComments(
  readBackend(path.join("lib", "family-creation.mo")),
);
const creationApi = stripComments(
  readBackend(path.join("mixins", "family-creation-api.mo")),
);
const familyTypes = stripComments(readBackend(path.join("types", "family.mo")));
const governanceTypes = stripComments(
  readBackend(path.join("types", "governance.mo")),
);
const stewardAuthorityTypes = stripComments(
  readBackend(path.join("types", "steward-authority.mo")),
);

// ---------------------------------------------------------------------------
// A. Existing Steward authority stays family-scoped.
// ---------------------------------------------------------------------------

describe("existing Steward authority is family-scoped (compatibility baseline)", () => {
  it("isActiveStewardForFamily requires an ACTIVE record in the requested family", () => {
    const body = functionBody(stewardAuthorityLib, "isActiveStewardForFamily");
    // The caller must match an ACTIVE record whose familyId equals the request.
    expect(body).toContain("s.stewardAccountId == caller");
    expect(body).toContain("s.roleStatus == #Active");
    expect(body).toContain("s.familyId == familyId");
    // The platform admin role is never consulted.
    expect(body).not.toContain("isAdmin");
    expect(body).not.toContain("accessControl");
  });

  it("hasActiveStewardForFamily counts only ACTIVE records of the requested family", () => {
    const body = functionBody(stewardAuthorityLib, "hasActiveStewardForFamily");
    expect(body).toContain("s.roleStatus == #Active");
    expect(body).toContain("s.familyId == familyId");
  });

  it("claimStewardForFamily refuses anonymous callers and an already-active family", () => {
    const body = functionBody(stewardAuthorityLib, "claimStewardForFamily");
    expect(body).toContain("caller.isAnonymous()");
    expect(body).toContain("#err(#NotSignedIn)");
    // The one-time bootstrap is per-family: it refuses once THAT family has an
    // active Steward, and distinguishes the incumbent from another caller.
    expect(body).toContain("hasActiveStewardForFamily(stewards, familyId)");
    expect(body).toContain("#err(#AlreadySteward)");
    expect(body).toContain("#err(#StewardAlreadyExists)");
    // The created record is ACTIVE and stamped with the requested family.
    expect(body).toContain("roleStatus = #Active");
    expect(body).toContain("familyId;");
  });

  it("the legacy single-family Steward helpers delegate to the family-scoped ones with the default family id", () => {
    for (const [legacy, canonical] of [
      ["isActiveSteward", "isActiveStewardForFamily"],
      ["hasActiveSteward", "hasActiveStewardForFamily"],
      ["claimSteward", "claimStewardForFamily"],
    ] as const) {
      const body = functionBody(stewardAuthorityLib, legacy);
      expect(body).toContain(`${canonical}(`);
      expect(body).toContain("FamilyTypes.DEFAULT_FAMILY_ID");
    }
  });

  it("promoteToStewardForFamily resolves the profile in the family and refuses a duplicate active Steward there", () => {
    const body = functionBody(governanceLib, "promoteToStewardForFamily");
    // The target profile is resolved through the family-qualified lookup.
    expect(body).toContain(
      "TenancyLib.getProfileForFamily(profiles, familyId, personId)",
    );
    expect(body).toContain("profile.claimStatus != #Claimed");
    expect(body).toContain("#err(#NotApprovedClaimedMember)");
    // The duplicate check is filtered by familyId.
    expect(body).toContain("s.roleStatus == #Active");
    expect(body).toContain("s.familyId == familyId");
    expect(body).toContain("#err(#AlreadySteward)");
    // The new record is stamped with the requested family.
    expect(body).toContain("familyId;");
    expect(body).toContain("roleStatus = #Active");
  });

  it("removeStewardForFamily matches on account AND family and never removes the last Steward of that family", () => {
    const body = functionBody(governanceLib, "removeStewardForFamily");
    expect(body).toContain("s.stewardAccountId == stewardAccountId");
    expect(body).toContain("s.familyId == familyId");
    expect(body).toContain("#err(#NotSteward)");
    // The last-Steward guard counts only active stewards of the same family.
    expect(body).toContain(
      "s.roleStatus == #Active and s.familyId == familyId",
    );
    expect(body).toContain("#err(#LastSteward)");
  });

  it("listStewardsForFamily returns only records stamped with the requested family", () => {
    const body = functionBody(governanceLib, "listStewardsForFamily");
    expect(body).toContain("s.familyId == familyId");
  });

  it("the legacy promote/remove/list helpers delegate to the family-scoped ones with the default family id", () => {
    for (const [legacy, canonical] of [
      ["promoteToSteward", "promoteToStewardForFamily"],
      ["removeSteward", "removeStewardForFamily"],
      ["listStewards", "listStewardsForFamily"],
    ] as const) {
      const body = functionBody(governanceLib, legacy);
      expect(body).toContain(`${canonical}(`);
      expect(body).toContain("FamilyTypes.DEFAULT_FAMILY_ID");
    }
  });

  it("the public Steward endpoints gate on the canonical family-scoped check, never the platform admin role", () => {
    for (const name of [
      "listStewardsForFamily",
      "promoteToStewardForFamily",
      "removeStewardForFamily",
      "listStewardIdentitiesForFamily",
      "listEligibleStewardCandidatesForFamily",
    ]) {
      const body = functionBody(governanceApi, name);
      expect(body).toContain(
        "StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)",
      );
      expect(body).not.toContain("isAdmin");
      expect(body).not.toContain("accessControl");
    }
  });

  it("the legacy public Steward endpoints gate on the canonical single-family check", () => {
    for (const name of [
      "listStewards",
      "promoteToSteward",
      "removeSteward",
      "listStewardIdentities",
      "listEligibleStewardCandidates",
    ]) {
      const body = functionBody(governanceApi, name);
      expect(body).toContain(
        "StewardAuthorityLib.isActiveSteward(stewards, caller)",
      );
      expect(body).not.toContain("isAdmin");
      expect(body).not.toContain("accessControl");
    }
  });

  it("the Steward-authority public endpoints keep their default-family bootstrap semantics", () => {
    // isCallerSteward / hasActiveSteward / claimSteward remain the default-family
    // bootstrap surface the existing frontend consumes.
    expect(functionBody(stewardAuthorityApi, "isCallerSteward")).toContain(
      "StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, FamilyTypes.DEFAULT_FAMILY_ID)",
    );
    expect(functionBody(stewardAuthorityApi, "hasActiveSteward")).toContain(
      "StewardAuthorityLib.hasActiveStewardForFamily(stewards, FamilyTypes.DEFAULT_FAMILY_ID)",
    );
    expect(functionBody(stewardAuthorityApi, "claimSteward")).toContain(
      "StewardAuthorityLib.claimStewardForFamily(stewards, auditLog, caller, FamilyTypes.DEFAULT_FAMILY_ID)",
    );
  });
});

// ---------------------------------------------------------------------------
// B. Existing FamilyMembership stays family-scoped and writes no StewardRecord.
// ---------------------------------------------------------------------------

describe("existing FamilyMembership is family-scoped (compatibility baseline)", () => {
  it("getMembershipForFamily matches on both familyId and accountId", () => {
    const body = functionBody(membershipLib, "getMembershipForFamily");
    expect(body).toContain("m.familyId == familyId");
    expect(body).toContain("m.accountId == accountId");
  });

  it("hasActiveMembershipForFamily requires an ACTIVE membership in the requested family", () => {
    const body = functionBody(membershipLib, "hasActiveMembershipForFamily");
    expect(body).toContain("m.familyId == familyId");
    expect(body).toContain("m.accountId == accountId");
    expect(body).toContain("m.status == #Active");
  });

  it("getMembershipByIdForFamily never resolves an id from another family", () => {
    const body = functionBody(membershipLib, "getMembershipByIdForFamily");
    expect(body).toContain("m.familyId == familyId");
    expect(body).toContain("m.id == membershipId");
  });

  it("createPendingMembershipForFamily is family-scoped and writes no StewardRecord", () => {
    const body = functionBody(
      membershipLib,
      "createPendingMembershipForFamily",
    );
    expect(body).toContain(
      "personBelongsToFamily(profiles, claims, personId, familyId)",
    );
    expect(body).toContain("#err(#PersonNotInFamily)");
    expect(body).toContain(
      "getMembershipForFamily(memberships, familyId, accountId)",
    );
    expect(body).toContain("#err(#AlreadyMember)");
    expect(body).toContain("status = #Pending");
    expect(body).toContain("familyId;");
    expect(body).not.toContain("stewards");
    expect(body).not.toContain("StewardRecord");
  });

  it("activateMembershipForFamily records the real caller and writes no StewardRecord", () => {
    const body = functionBody(membershipLib, "activateMembershipForFamily");
    expect(body).toContain(
      "getMembershipByIdForFamily(memberships, familyId, membershipId)",
    );
    expect(body).toContain("membership.status != #Pending");
    expect(body).toContain("approvedBy = ?approvedBy");
    expect(body).toContain("status = #Active");
    expect(body).not.toContain("stewards");
    expect(body).not.toContain("StewardRecord");
  });

  it("personBelongsToFamily delegates to the canonical family person predicate", () => {
    const body = functionBody(membershipLib, "personBelongsToFamily");
    expect(body).toContain(
      "FamilyAuthorizationLib.isPersonInFamily(profiles, claims, personId, familyId)",
    );
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
// C. Existing family creation still creates exactly three records, no Steward.
// ---------------------------------------------------------------------------

describe("existing family creation is unchanged (compatibility baseline)", () => {
  it("createFamilyWithFounder writes the Family, the founder profile, and the membership", () => {
    const body = functionBody(creationLib, "createFamilyWithFounder");
    expect(body).toContain("families.add(familyId, family)");
    expect(body).toContain(
      "TenancyLib.putProfileForFamily(profiles, familyId, profile)",
    );
    expect(body).toContain("memberships.add(membership)");
    expect(body).toContain("status = #Active");
    expect(body).toContain("accountId = caller");
  });

  it("createFamilyWithFounder still writes no StewardRecord", () => {
    const body = functionBody(creationLib, "createFamilyWithFounder");
    expect(body).not.toContain("stewards");
    expect(body).not.toContain("StewardRecord");
    expect(body).not.toContain("claimSteward");
  });

  it("the create-family endpoint still rejects anonymous callers before delegating", () => {
    const body = functionBody(creationApi, "createFamilyWithFounder");
    const anonymousGuard = body.indexOf("caller.isAnonymous()");
    const delegate = body.indexOf("FamilyCreationLib.createFamilyWithFounder(");
    expect(anonymousGuard).toBeGreaterThan(-1);
    expect(delegate).toBeGreaterThan(-1);
    expect(anonymousGuard).toBeLessThan(delegate);
    expect(body).toContain("#err(#NotSignedIn)");
  });

  it("the create-family endpoint still takes no account/principal parameter", () => {
    const signature = creationApi.slice(
      creationApi.indexOf("func createFamilyWithFounder("),
      creationApi.indexOf(
        ") : async Result.Result<CreationTypes.FamilyCreationResult",
      ),
    );
    expect(signature).toContain("displayName : Text");
    expect(signature).toContain("input : CreationTypes.FounderProfileInput");
    expect(signature).toContain("idempotencyKey : Text");
    expect(signature).not.toMatch(/accountId\s*:/u);
    expect(signature).not.toMatch(/founder\s*:\s*Principal/u);
    expect(signature).not.toMatch(/principal\s*:/iu);
  });
});

// ---------------------------------------------------------------------------
// D. The default Norwood family constants and read surface are unchanged.
// ---------------------------------------------------------------------------

describe("default Norwood family is unchanged (compatibility baseline)", () => {
  it("keeps the stable default family id and display name", () => {
    expect(familyTypes).toContain(
      'public let DEFAULT_FAMILY_ID : FamilyId = "norwood";',
    );
    expect(familyTypes).toContain(
      'public let DEFAULT_FAMILY_DISPLAY_NAME : Text = "Norwood";',
    );
  });

  it("keeps the family-qualified person key form", () => {
    const body = functionBody(familyTypes, "familyPersonKey");
    expect(body).toContain('familyId # "::" # personId');
  });
});

// ---------------------------------------------------------------------------
// E. The existing Steward type contracts the frontend consumes are unchanged.
// ---------------------------------------------------------------------------

describe("existing Steward type contracts (compatibility baseline)", () => {
  it("StewardRecord keeps its six fields", () => {
    const record = governanceTypes.slice(
      governanceTypes.indexOf("public type StewardRecord = {"),
      governanceTypes.indexOf(
        "};",
        governanceTypes.indexOf("public type StewardRecord = {"),
      ),
    );
    for (const field of [
      "familyId : Text;",
      "stewardAccountId : Principal;",
      "roleStatus : StewardRoleStatus;",
      "successorPriority : ?Nat;",
      "assignedBy : Principal;",
      "assignedAt : Int;",
    ]) {
      expect(record).toContain(field);
    }
  });

  it("StewardRoleStatus keeps exactly Active and Removed", () => {
    const status = governanceTypes.slice(
      governanceTypes.indexOf("public type StewardRoleStatus = {"),
      governanceTypes.indexOf(
        "};",
        governanceTypes.indexOf("public type StewardRoleStatus = {"),
      ),
    );
    expect(status).toContain("#Active;");
    expect(status).toContain("#Removed;");
  });

  it("StewardError keeps its seven variants", () => {
    const error = governanceTypes.slice(
      governanceTypes.indexOf("public type StewardError = {"),
      governanceTypes.indexOf(
        "};",
        governanceTypes.indexOf("public type StewardError = {"),
      ),
    );
    for (const variant of [
      "#NotSignedIn;",
      "#NotSteward;",
      "#NotApprovedClaimedMember;",
      "#LastSteward;",
      "#AlreadySteward;",
      "#NotDesignated;",
      "#AlreadyDesignated;",
    ]) {
      expect(error).toContain(variant);
    }
  });

  it("StewardClaimError keeps its three variants and StewardClaimResult its three fields", () => {
    const error = stewardAuthorityTypes.slice(
      stewardAuthorityTypes.indexOf("public type StewardClaimError = {"),
      stewardAuthorityTypes.indexOf(
        "};",
        stewardAuthorityTypes.indexOf("public type StewardClaimError = {"),
      ),
    );
    for (const variant of [
      "#NotSignedIn;",
      "#StewardAlreadyExists;",
      "#AlreadySteward;",
    ]) {
      expect(error).toContain(variant);
    }
    const result = stewardAuthorityTypes.slice(
      stewardAuthorityTypes.indexOf("public type StewardClaimResult = {"),
      stewardAuthorityTypes.indexOf(
        "};",
        stewardAuthorityTypes.indexOf("public type StewardClaimResult = {"),
      ),
    );
    for (const field of [
      "stewardAccountId : Principal;",
      "claimedBy : Principal;",
      "claimedAt : Int;",
    ]) {
      expect(result).toContain(field);
    }
  });
});
