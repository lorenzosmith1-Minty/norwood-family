import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Default-family compatibility baseline for the family-scoped single-Steward
// warning change.
//
// The requested change makes the single-Steward continuity warning
// family-scoped: it must count only Steward records belonging to the requested
// family. The accepted criterion is that the legacy default-family warning call
// and its bare query key remain unchanged for Norwood.
//
// This file freezes the default-family backend behavior the change must
// preserve, at the source level, so the family fork cannot silently change it:
//
//   1. The legacy `getSingleStewardWarning()` endpoint gates on the canonical
//      active-Steward authority check (not the platform admin role) and
//      delegates to the governance domain lib, so the default-family outcome is
//      decided in exactly one place.
//   2. The warning counts only `#Active` Steward records and returns the
//      warning when exactly one remains, else null — the default-family
//      semantics the wrapper path must keep producing.
//
// It deliberately does NOT assert the absence of a `familyId` parameter or the
// absence of a `*ForFamily` variant: adding those is exactly the change under
// way. It also does not assert two-family isolation, which is the new behavior
// the change introduces rather than existing behavior to protect.
//
// This is a static-source characterization, not a real-canister run: the
// PocketIC lane cannot drive the internal library function without a compiled
// wasm, and the frontend suite mocks the actor. The real canister's
// default-family warning behavior is covered by the PocketIC lane when a
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

describe("default-family single-Steward warning (compatibility baseline)", () => {
  // The accepted change makes the warning family-scoped: the counting logic now
  // lives in the canonical `getSingleStewardWarningForFamily`, and the legacy
  // `getSingleStewardWarning` is a thin `DEFAULT_FAMILY_ID` wrapper. The
  // default-family outcome is unchanged — it is decided by the canonical
  // function with the default family id — so these assertions follow the
  // counting logic to its new home and pin the wrapper's delegation.

  it("the legacy wrapper delegates to the canonical function with the default family id", () => {
    const body = functionBody(governance, "getSingleStewardWarning");
    expect(body).toContain("getSingleStewardWarningForFamily(");
    expect(body).toContain("FamilyTypes.DEFAULT_FAMILY_ID");
  });

  it("counts only ACTIVE Steward records of the requested family", () => {
    const body = functionBody(governance, "getSingleStewardWarningForFamily");
    // The warning is driven by the active Steward count; a removed or otherwise
    // non-active record must not count toward it.
    expect(body).toContain("s.roleStatus == #Active");
    expect(body).toContain("s.familyId == familyId");
  });

  it("returns the warning when exactly one active Steward remains", () => {
    const body = functionBody(governance, "getSingleStewardWarningForFamily");
    expect(body).toContain("active.size() == 1");
    expect(body).toContain("Only one Family Steward remains.");
  });

  it("returns null when the active Steward count is not exactly one", () => {
    const body = functionBody(governance, "getSingleStewardWarningForFamily");
    // The else branch is the null result, so zero or multiple active Stewards
    // produce no warning.
    expect(body).toContain("null;");
  });
});

describe("default-family single-Steward warning endpoint (compatibility baseline)", () => {
  it("the getSingleStewardWarning endpoint gates on the canonical active-Steward authority check", () => {
    const body = functionBody(governanceApi, "getSingleStewardWarning");
    // The gate is the canonical active-Steward check, not the platform admin
    // role.
    expect(body).toContain(
      "StewardAuthorityLib.isActiveSteward(stewards, caller)",
    );
    expect(body).not.toContain("isAdmin");
    expect(body).not.toContain("accessControl");
  });

  it("the getSingleStewardWarning endpoint delegates to the governance domain lib", () => {
    const body = functionBody(governanceApi, "getSingleStewardWarning");
    // The endpoint performs the authority gate and then returns the domain
    // operation's result directly, so the default-family outcome is decided in
    // exactly one place.
    expect(body).toContain("GovernanceLib.getSingleStewardWarning(stewards)");
  });
});
