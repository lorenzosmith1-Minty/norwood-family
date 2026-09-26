import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Default-family compatibility baseline for the family-scoped governance change.
//
// The requested change makes `promoteToStewardForFamily`,
// `activateSuccessorForFamily`, and `addRelationshipForFamily` the canonical
// paths (each taking an explicit `familyId` and filtering every Steward and
// profile lookup by it), and reduces the existing `promoteToSteward`,
// `activateSuccessor`, and `addRelationship` to thin wrappers that delegate to
// the default Norwood family. The accepted criterion is that those wrappers
// "produce the same default-family behavior as before".
//
// This file freezes exactly that default-family behavior, at the source level,
// so the wrapper refactor cannot silently change it. It reads the real Motoko
// sources and asserts:
//
//   1. Each canonical `*ForFamily` operation carries the default-family record
//      shape and the domain guards that decide the outcome: promote/activate
//      require an approved CLAIMED member and refuse an already-active Steward;
//      activate requires a DESIGNATED successor and marks it ACTIVATED;
//      addRelationship refuses a duplicate (from, to, type) edge. The record is
//      stamped with the supplied `familyId`, so the default-family wrapper
//      produces the same `familyId = "norwood"` record as before.
//   2. Each legacy operation is a thin wrapper that delegates to its canonical
//      `*ForFamily` counterpart with `FamilyTypes.DEFAULT_FAMILY_ID` — the
//      default-family behavior the wrappers must keep producing.
//   3. The public endpoints gate on the canonical Steward authority check and
//      delegate to the domain lib, so the wrapper path keeps the same
//      authorization and the same single implementation.
//
// It deliberately does NOT assert the absence of a `familyId` parameter or the
// absence of `*ForFamily` variants: adding those is exactly the change under
// way. It also does not assert two-family isolation, which is the new behavior
// the change introduces rather than existing behavior to protect.
//
// The `*ForFamily` variants are internal library functions and public endpoints
// that the PocketIC lane cannot drive without a compiled wasm; this static
// cover is the only place the current default-family source semantics are
// pinned. The real canister's default-family behavior is covered by the
// PocketIC lane when a compiled wasm is present (see coverageLimits).
// ---------------------------------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, "..", "..", "src", "backend");

function readBackend(relativePath: string): string {
  return readFileSync(path.join(backendRoot, relativePath), "utf8");
}

const governance = readBackend(path.join("lib", "governance.mo"));
const governanceApi = readBackend(path.join("mixins", "governance-api.mo"));

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

describe("default-family Steward promotion (compatibility baseline)", () => {
  it("promoteToStewardForFamily writes a StewardRecord stamped with the supplied familyId", () => {
    const body = functionBody(governance, "promoteToStewardForFamily");
    // The record the default-family wrapper path must keep producing carries
    // the supplied family id, an ACTIVE role, and the promoted owner's account.
    expect(body).toContain("familyId;");
    expect(body).toContain("roleStatus = #Active");
    expect(body).toContain("stewardAccountId = ownerId");
  });

  it("promoteToStewardForFamily requires an approved CLAIMED member and refuses an existing active Steward in that family", () => {
    const body = functionBody(governance, "promoteToStewardForFamily");
    // Only a profile whose claim is #Claimed can be promoted.
    expect(body).toContain("profile.claimStatus != #Claimed");
    expect(body).toContain("#err(#NotApprovedClaimedMember)");
    // A person already holding an ACTIVE Steward record in the same family is
    // refused; the duplicate check is filtered by familyId.
    expect(body).toContain("s.roleStatus == #Active");
    expect(body).toContain("s.familyId == familyId");
    expect(body).toContain("#err(#AlreadySteward)");
  });

  it("promoteToStewardForFamily records a StewardPromoted audit entry", () => {
    const body = functionBody(governance, "promoteToStewardForFamily");
    expect(body).toContain("#StewardPromoted");
  });

  it("promoteToSteward delegates to promoteToStewardForFamily with the default family id", () => {
    const body = functionBody(governance, "promoteToSteward");
    expect(body).toContain("promoteToStewardForFamily(");
    expect(body).toContain("FamilyTypes.DEFAULT_FAMILY_ID");
  });
});

describe("default-family successor activation (compatibility baseline)", () => {
  it("activateSuccessorForFamily writes a StewardRecord stamped with the supplied familyId", () => {
    const body = functionBody(governance, "activateSuccessorForFamily");
    expect(body).toContain("familyId;");
    expect(body).toContain("roleStatus = #Active");
    // The activated steward carries the designation's priority.
    expect(body).toContain("successorPriority = ?designation.priority");
  });

  it("activateSuccessorForFamily requires a DESIGNATED successor and an approved CLAIMED member", () => {
    const body = functionBody(governance, "activateSuccessorForFamily");
    // Only a #Designated successor can be activated.
    expect(body).toContain("s.status == #Designated");
    expect(body).toContain("#err(#NotDesignated)");
    // The linked profile must still be an approved claimed member.
    expect(body).toContain("profile.claimStatus != #Claimed");
    expect(body).toContain("#err(#NotApprovedClaimedMember)");
    // An already-active Steward in the same family is refused.
    expect(body).toContain("s.familyId == familyId");
    expect(body).toContain("#err(#AlreadySteward)");
  });

  it("activateSuccessorForFamily marks the designation ACTIVATED and records the audit entry", () => {
    const body = functionBody(governance, "activateSuccessorForFamily");
    expect(body).toContain("status = #Activated");
    expect(body).toContain("#SuccessorActivated");
  });

  it("activateSuccessor delegates to activateSuccessorForFamily with the default family id", () => {
    const body = functionBody(governance, "activateSuccessor");
    expect(body).toContain("activateSuccessorForFamily(");
    expect(body).toContain("FamilyTypes.DEFAULT_FAMILY_ID");
  });
});

describe("default-family relationship administration (compatibility baseline)", () => {
  it("addRelationshipForFamily writes a Relationship stamped with the supplied familyId", () => {
    const body = functionBody(governance, "addRelationshipForFamily");
    expect(body).toContain("familyId;");
    // The confirmed edge carries both endpoints and the requested type.
    expect(body).toContain("fromPersonId;");
    expect(body).toContain("toPersonId;");
    expect(body).toContain("relationshipType;");
    expect(body).toContain("status = #Confirmed");
  });

  it("addRelationshipForFamily refuses a duplicate (from, to, type) edge in the same family", () => {
    const body = functionBody(governance, "addRelationshipForFamily");
    expect(body).toContain("r.familyId == familyId");
    expect(body).toContain("r.fromPersonId == fromPersonId");
    expect(body).toContain("r.toPersonId == toPersonId");
    expect(body).toContain("r.relationshipType == relationshipType");
    expect(body).toContain("#err(#DuplicateRelationship)");
  });

  it("addRelationshipForFamily records a RelationshipAdded audit entry", () => {
    const body = functionBody(governance, "addRelationshipForFamily");
    expect(body).toContain("#RelationshipAdded");
  });

  it("addRelationship delegates to addRelationshipForFamily with the default family id", () => {
    const body = functionBody(governance, "addRelationship");
    expect(body).toContain("addRelationshipForFamily(");
    expect(body).toContain("FamilyTypes.DEFAULT_FAMILY_ID");
  });
});

describe("default-family governance endpoint authorization (compatibility baseline)", () => {
  it("the three legacy endpoints gate on the canonical Steward authority check", () => {
    for (const name of [
      "promoteToSteward",
      "activateSuccessor",
      "addRelationship",
    ]) {
      const body = functionBody(governanceApi, name);
      // The gate is the canonical active-Steward check, not the platform admin
      // role.
      expect(body).toContain("StewardAuthorityLib.isActiveSteward(stewards, caller)");
      expect(body).not.toContain("isAdmin");
      expect(body).not.toContain("accessControl");
    }
  });

  it("the three canonical endpoints gate on the family-scoped Steward authority check", () => {
    for (const name of [
      "promoteToStewardForFamily",
      "activateSuccessorForFamily",
      "addRelationshipForFamily",
    ]) {
      const body = functionBody(governanceApi, name);
      expect(body).toContain(
        "StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)",
      );
      expect(body).not.toContain("isAdmin");
      expect(body).not.toContain("accessControl");
    }
  });

  it("the three legacy endpoints delegate to the governance domain lib", () => {
    expect(functionBody(governanceApi, "promoteToSteward")).toContain(
      "GovernanceLib.promoteToSteward(",
    );
    expect(functionBody(governanceApi, "activateSuccessor")).toContain(
      "GovernanceLib.activateSuccessor(",
    );
    expect(functionBody(governanceApi, "addRelationship")).toContain(
      "GovernanceLib.addRelationship(",
    );
  });

  it("the three canonical endpoints delegate to the governance domain lib", () => {
    expect(functionBody(governanceApi, "promoteToStewardForFamily")).toContain(
      "GovernanceLib.promoteToStewardForFamily(",
    );
    expect(functionBody(governanceApi, "activateSuccessorForFamily")).toContain(
      "GovernanceLib.activateSuccessorForFamily(",
    );
    expect(functionBody(governanceApi, "addRelationshipForFamily")).toContain(
      "GovernanceLib.addRelationshipForFamily(",
    );
  });

  it("keeps a single implementation of each operation in the lib", () => {
    // Exactly one canonical definition of each operation exists; the legacy
    // wrapper must delegate rather than add a second independent body.
    for (const name of [
      "promoteToSteward",
      "activateSuccessor",
      "addRelationship",
    ]) {
      const definitions = governance.match(
        new RegExp(`func ${name}\\w*\\(`, "gu"),
      );
      expect(definitions).toEqual([
        `func ${name}ForFamily(`,
        `func ${name}(`,
      ]);
    }
  });
});
