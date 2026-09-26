import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Characterization baseline for the family-scoped successor-designation change.
//
// The requested change makes a successor designation family-scoped: the backend
// `SuccessorDesignation` gains a `familyId`, `designateSuccessorForFamily` /
// `activateSuccessorForFamily` / `listSuccessorsForFamily` become the canonical
// paths, and a migration backfills every pre-existing designation to the default
// Norwood family. The accepted criterion is that legacy Norwood successor
// behavior is unchanged.
//
// This file freezes exactly that legacy default-family behavior, at the source
// level, so the family-scoping refactor cannot silently change it. It reads the
// real Motoko sources and asserts:
//
//   1. The legacy `designateSuccessor`, `activateSuccessor`, and
//      `listSuccessors` operations are thin wrappers that delegate to their
//      canonical `*ForFamily` counterpart with `FamilyTypes.DEFAULT_FAMILY_ID` —
//      the default-family behavior the wrappers must keep producing.
//   2. The legacy designation record shape is preserved: a designation still
//      carries personId, priority, assignedBy, assignedAt, and status, and the
//      legacy `designateSuccessor` still records a `#SuccessorDesignated` audit
//      entry and refuses a non-approved-claimed member and an already-active
//      Steward.
//   3. The legacy `activateSuccessor` still requires a DESIGNATED successor,
//      marks it ACTIVATED, and records the `#SuccessorActivated` audit entry.
//   4. The public legacy endpoints still gate on the canonical active-Steward
//      check (never the platform admin role) and still delegate to the
//      governance domain lib.
//
// It deliberately does NOT assert the absence of a `familyId` field or the
// absence of `*ForFamily` variants: adding those is exactly the change under
// way. It also does not assert two-family isolation, which is the new behavior
// the change introduces rather than existing behavior to protect; that is
// covered by the sibling `governance-family-scope.cover.test.ts` and
// `governance-successor-designation` cover assertions.
//
// The successor paths are internal library functions and public endpoints that
// the PocketIC lane cannot drive without a compiled wasm; this static cover is
// the only place the legacy default-family source semantics are pinned. The real
// canister's successor behavior is covered by the PocketIC lane when a compiled
// wasm is present (see coverageLimits).
// ---------------------------------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, "..", "..", "src", "backend");

function readBackend(relativePath: string): string {
  return readFileSync(path.join(backendRoot, relativePath), "utf8");
}

const governance = readBackend(path.join("lib", "governance.mo"));
const governanceApi = readBackend(path.join("mixins", "governance-api.mo"));
const governanceTypes = readBackend(path.join("types", "governance.mo"));

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

describe("legacy successor designation record shape (compatibility baseline)", () => {
  it("keeps personId, priority, assignedBy, assignedAt, and status on the designation type", () => {
    const start = governanceTypes.indexOf("public type SuccessorDesignation = {");
    expect(start).toBeGreaterThan(-1);
    const body = governanceTypes.slice(start, governanceTypes.indexOf("};", start));
    // The fields the legacy designation carried before the change must survive.
    expect(body).toContain("personId : PersonId");
    expect(body).toContain("priority : Nat");
    expect(body).toContain("assignedBy : Principal");
    expect(body).toContain("assignedAt : Int");
    expect(body).toContain("status : SuccessorStatus");
  });
});

describe("legacy designateSuccessor (compatibility baseline)", () => {
  it("delegates to designateSuccessorForFamily with the default family id", () => {
    const body = functionBody(governance, "designateSuccessor");
    expect(body).toContain("designateSuccessorForFamily(");
    expect(body).toContain("FamilyTypes.DEFAULT_FAMILY_ID");
  });

  it("still refuses a non-approved-claimed member and an already-active Steward", () => {
    const body = functionBody(governance, "designateSuccessorForFamily");
    // Only an approved claimed member of the family can be designated.
    expect(body).toContain("#err(#NotApprovedClaimedMember)");
    // A person already holding an ACTIVE Steward record in the family is refused.
    expect(body).toContain("s.roleStatus == #Active");
    expect(body).toContain("#err(#AlreadySteward)");
  });

  it("still records a SuccessorDesignated audit entry", () => {
    const body = functionBody(governance, "designateSuccessorForFamily");
    expect(body).toContain("#SuccessorDesignated");
  });
});

describe("legacy activateSuccessor (compatibility baseline)", () => {
  it("delegates to activateSuccessorForFamily with the default family id", () => {
    const body = functionBody(governance, "activateSuccessor");
    expect(body).toContain("activateSuccessorForFamily(");
    expect(body).toContain("FamilyTypes.DEFAULT_FAMILY_ID");
  });

  it("still requires a DESIGNATED successor and marks it ACTIVATED", () => {
    const body = functionBody(governance, "activateSuccessorForFamily");
    expect(body).toContain("s.status == #Designated");
    expect(body).toContain("#err(#NotDesignated)");
    expect(body).toContain("status = #Activated");
    expect(body).toContain("#SuccessorActivated");
  });

  it("still carries the designation's priority onto the activated Steward record", () => {
    const body = functionBody(governance, "activateSuccessorForFamily");
    expect(body).toContain("successorPriority = ?designation.priority");
  });
});

describe("legacy listSuccessors (compatibility baseline)", () => {
  it("delegates to listSuccessorsForFamily with the default family id", () => {
    const body = functionBody(governance, "listSuccessors");
    expect(body).toContain("listSuccessorsForFamily(");
    expect(body).toContain("FamilyTypes.DEFAULT_FAMILY_ID");
  });
});

describe("legacy successor endpoint authorization (compatibility baseline)", () => {
  it("the legacy designateSuccessor endpoint gates on the canonical active-Steward check", () => {
    const body = functionBody(governanceApi, "designateSuccessor");
    expect(body).toContain("StewardAuthorityLib.isActiveSteward(stewards, caller)");
    expect(body).not.toContain("isAdmin");
    expect(body).not.toContain("accessControl");
  });

  it("the legacy activateSuccessor endpoint gates on the canonical active-Steward check", () => {
    const body = functionBody(governanceApi, "activateSuccessor");
    expect(body).toContain("StewardAuthorityLib.isActiveSteward(stewards, caller)");
    expect(body).not.toContain("isAdmin");
    expect(body).not.toContain("accessControl");
  });

  it("the legacy listSuccessors endpoint gates on the canonical active-Steward check", () => {
    const body = functionBody(governanceApi, "listSuccessors");
    expect(body).toContain("StewardAuthorityLib.isActiveSteward(stewards, caller)");
    expect(body).not.toContain("isAdmin");
    expect(body).not.toContain("accessControl");
  });

  it("the legacy successor endpoints delegate to the governance domain lib", () => {
    expect(functionBody(governanceApi, "designateSuccessor")).toContain(
      "GovernanceLib.designateSuccessor(",
    );
    expect(functionBody(governanceApi, "activateSuccessor")).toContain(
      "GovernanceLib.activateSuccessor(",
    );
    expect(functionBody(governanceApi, "listSuccessors")).toContain(
      "GovernanceLib.listSuccessors(",
    );
  });
});
