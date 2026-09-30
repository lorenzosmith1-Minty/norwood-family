import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Default-family compatibility baseline for the family-scoped Steward removal
// change.
//
// The requested change adds family scoping to Steward removal: a canonical
// `removeStewardForFamily(familyId, stewardAccountId)` becomes the path that
// filters the target Steward record by `familyId`, and the existing
// `removeSteward(stewardAccountId)` is reduced to a thin wrapper delegating to
// the default Norwood family. The accepted criterion is that the existing
// default Norwood Steward removal behavior is unchanged.
//
// This file freezes exactly that default-family behavior, at the source level,
// so the wrapper refactor cannot silently change it. It reads the real Motoko
// sources and asserts:
//
//   1. The removal domain operation resolves the target by `stewardAccountId`
//      AND `#Active` status, returning `#err(#NotSteward)` when no active
//      Steward matches — the same lookup the default-family wrapper path must
//      keep performing.
//   2. It refuses to remove the last active Steward (`#err(#LastSteward)`),
//      counting the active Stewards before mutating anything.
//   3. It marks the matched record `#Removed` (a status change, not a delete)
//      through `replaceSteward`, so the roster keeps the record.
//   4. It appends a `#StewardRemoved` audit entry stamped with the removed
//      record's `familyId`, so the default-family removal is audited under
//      Norwood exactly as before.
//   5. The public endpoint gates on the canonical active-Steward authority
//      check and delegates to the governance domain lib, so the wrapper path
//      keeps the same authorization and the same single implementation.
//
// The accepted change moved the domain logic into the canonical
// `removeStewardForFamily` and reduced `removeSteward` to a thin
// `DEFAULT_FAMILY_ID` wrapper. The default-family behavior is therefore frozen
// on the canonical function (which the wrapper delegates to), and the wrapper
// itself is asserted to be a pure delegation with no duplicated business logic.
// This preserves the original intent — the default Norwood removal outcome is
// unchanged — while matching the accepted structure.
//
// It deliberately does NOT assert the absence of a `familyId` parameter or the
// absence of a `*ForFamily` variant: adding those is exactly the change under
// way. It also does not assert two-family isolation, which is the new behavior
// the change introduces rather than existing behavior to protect.
//
// This is a static-source characterization, not a real-canister run: the
// PocketIC lane cannot drive the internal library function without a compiled
// wasm, and the frontend suite mocks the actor. The real canister's
// default-family removal behavior is covered by the PocketIC lane when a
// compiled wasm is present (see coverageLimits).
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

describe("default-family Steward removal (compatibility baseline)", () => {
  it("removeStewardForFamily resolves the target by stewardAccountId and ACTIVE status", () => {
    const body = functionBody(governance, "removeStewardForFamily");
    // The lookup matches the requested account id and only an ACTIVE record;
    // a removed or nonexistent account is not a removal target.
    expect(body).toContain("s.stewardAccountId == stewardAccountId");
    expect(body).toContain("s.roleStatus == #Active");
  });

  it("removeStewardForFamily returns #err(#NotSteward) when no active Steward matches", () => {
    const body = functionBody(governance, "removeStewardForFamily");
    expect(body).toContain("#err(#NotSteward)");
  });

  it("removeStewardForFamily refuses to remove the last active Steward", () => {
    const body = functionBody(governance, "removeStewardForFamily");
    // The active Stewards are counted and a single remaining Steward is
    // refused before any mutation.
    expect(body).toContain("roleStatus == #Active");
    expect(body).toContain("active.size() <= 1");
    expect(body).toContain("#err(#LastSteward)");
  });

  it("removeStewardForFamily marks the matched record #Removed rather than deleting it", () => {
    const body = functionBody(governance, "removeStewardForFamily");
    // The record is updated in place with a #Removed status and written back
    // through replaceSteward, so the roster keeps the record.
    expect(body).toContain("roleStatus = #Removed");
    expect(body).toContain("replaceSteward(stewards, updated)");
  });

  it("removeStewardForFamily records a StewardRemoved audit entry stamped with the target familyId", () => {
    const body = functionBody(governance, "removeStewardForFamily");
    // The audit entry is stamped with the requested familyId, so a default-family
    // removal is audited under Norwood exactly as before.
    expect(body).toContain("#StewardRemoved");
    expect(body).toContain("appendAudit(auditLog, familyId, #StewardRemoved");
  });

  it("removeStewardForFamily returns #ok(()) on a successful removal", () => {
    const body = functionBody(governance, "removeStewardForFamily");
    expect(body).toContain("#ok(())");
  });

  it("removeSteward is a thin DEFAULT_FAMILY_ID wrapper delegating to removeStewardForFamily", () => {
    const body = functionBody(governance, "removeSteward");
    // The wrapper carries no business logic of its own: it delegates to the
    // canonical family-scoped function with the default family id.
    expect(body).toContain("removeStewardForFamily(");
    expect(body).toContain("FamilyTypes.DEFAULT_FAMILY_ID");
    // None of the domain logic is duplicated in the wrapper.
    expect(body).not.toContain("#err(#NotSteward)");
    expect(body).not.toContain("#err(#LastSteward)");
    expect(body).not.toContain("roleStatus = #Removed");
    expect(body).not.toContain("#StewardRemoved");
  });
});

describe("default-family Steward removal endpoint (compatibility baseline)", () => {
  it("the removeSteward endpoint gates on the canonical active-Steward authority check", () => {
    const body = functionBody(governanceApi, "removeSteward");
    // The gate is the canonical active-Steward check, not the platform admin
    // role.
    expect(body).toContain(
      "StewardAuthorityLib.isActiveSteward(stewards, caller)",
    );
    expect(body).not.toContain("isAdmin");
    expect(body).not.toContain("accessControl");
  });

  it("the removeSteward endpoint delegates to the governance domain lib", () => {
    expect(functionBody(governanceApi, "removeSteward")).toContain(
      "GovernanceLib.removeSteward(",
    );
  });

  it("the removeSteward endpoint returns the domain result unchanged", () => {
    const body = functionBody(governanceApi, "removeSteward");
    // The endpoint performs the authority gate and then returns the domain
    // operation's result directly, so the default-family outcome is decided in
    // exactly one place.
    expect(body).toContain(
      "GovernanceLib.removeSteward(stewards, auditLog, stewardAccountId, caller)",
    );
  });
});
