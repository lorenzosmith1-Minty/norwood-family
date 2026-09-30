import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Cover for the family-scoped Steward removal change, at the source level.
//
// The accepted change makes `removeStewardForFamily(familyId, stewardAccountId)`
// the canonical removal path:
//
//   1. The target `StewardRecord` is matched on BOTH `stewardAccountId` and
//      `familyId`, so a steward account id alone never crosses the family
//      boundary.
//   2. The last-Steward guard counts only active Stewards whose `familyId`
//      equals the target family, so another family's active Stewards never
//      satisfy this family's guard.
//   3. The removal audit entry is stamped with the target `familyId`, not
//      `DEFAULT_FAMILY_ID`.
//   4. The public `removeStewardForFamily` endpoint gates on the family-scoped
//      active-Steward authority check (`isActiveStewardForFamily`), so a caller
//      who is not an active Steward of `familyId` cannot remove a Steward in
//      that family.
//   5. The legacy `removeSteward` endpoint remains a thin wrapper delegating to
//      the canonical path with the default family id.
//
// This is a static-source cover, not a real-canister run: the PocketIC lane
// cannot drive the internal library function without a compiled wasm, and the
// frontend suite mocks the actor. The real canister's family boundary is
// covered by the PocketIC lane when a compiled wasm is present (see
// coverageLimits). The default-family behavior is frozen separately by
// GovernanceStewardRemovalDefaultFamilyCharacterize.test.ts.
// ---------------------------------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
// `here` is app/src/frontend/src; the backend sources live at app/src/backend.
const backendRoot = path.resolve(here, "..", "..", "backend");

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

describe("removeStewardForFamily is the canonical family-scoped removal path (cover)", () => {
  it("matches the target on both stewardAccountId and familyId", () => {
    const body = functionBody(governance, "removeStewardForFamily");
    // The lookup requires the family conjunct; an account id alone is not a
    // match.
    expect(body).toContain("s.stewardAccountId == stewardAccountId");
    expect(body).toContain("s.familyId == familyId");
    expect(body).toContain("s.roleStatus == #Active");
  });

  it("counts only active Stewards of the target family for the last-Steward guard", () => {
    const body = functionBody(governance, "removeStewardForFamily");
    // The guard's active set is filtered by the target family, so another
    // family's active Stewards never satisfy this family's guard.
    expect(body).toContain(
      "stewards.toArray().filter(func s = s.roleStatus == #Active and s.familyId == familyId)",
    );
    expect(body).toContain("active.size() <= 1");
    expect(body).toContain("#err(#LastSteward)");
  });

  it("stamps the removal audit entry with the target familyId, not DEFAULT_FAMILY_ID", () => {
    const body = functionBody(governance, "removeStewardForFamily");
    expect(body).toContain("appendAudit(auditLog, familyId, #StewardRemoved");
    // The canonical function never hard-codes the default family.
    expect(body).not.toContain("FamilyTypes.DEFAULT_FAMILY_ID");
  });

  it("takes familyId as an explicit parameter", () => {
    const body = functionBody(governance, "removeStewardForFamily");
    expect(body).toContain("familyId : FamilyTypes.FamilyId");
  });
});

describe("removeStewardForFamily endpoint gates on family-scoped Steward authority (cover)", () => {
  it("gates on isActiveStewardForFamily(stewards, caller, familyId)", () => {
    const body = functionBody(governanceApi, "removeStewardForFamily");
    expect(body).toContain(
      "StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)",
    );
    // The gate is not the global (family-agnostic) Steward check.
    expect(body).not.toContain("isActiveSteward(stewards, caller)");
    expect(body).not.toContain("isAdmin");
  });

  it("delegates to the canonical governance domain function with the requested familyId", () => {
    const body = functionBody(governanceApi, "removeStewardForFamily");
    expect(body).toContain(
      "GovernanceLib.removeStewardForFamily(stewards, auditLog, familyId, stewardAccountId, caller)",
    );
  });

  it("keeps the legacy removeSteward endpoint as a thin default-family wrapper", () => {
    const body = functionBody(governanceApi, "removeSteward");
    expect(body).toContain(
      "StewardAuthorityLib.isActiveSteward(stewards, caller)",
    );
    expect(body).toContain(
      "GovernanceLib.removeSteward(stewards, auditLog, stewardAccountId, caller)",
    );
    // The wrapper does not call the family-scoped endpoint directly; the
    // default-family decision lives in the domain lib's wrapper.
    expect(body).not.toContain("removeStewardForFamily");
  });
});
