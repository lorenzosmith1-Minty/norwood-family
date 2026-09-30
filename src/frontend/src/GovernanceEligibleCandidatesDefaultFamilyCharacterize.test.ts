import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Default-family compatibility baseline for the family-scoped eligible-Steward
// candidate read.
//
// The requested change makes the eligible-candidate read family-scoped: the
// backend gains `listEligibleStewardCandidatesForFamily(familyId)` and reduces
// the legacy `listEligibleStewardCandidates()` to a thin DEFAULT_FAMILY_ID
// wrapper; the frontend hook forks on `useFamilyScopedId()`.
//
// This file freezes the default-family backend behavior the change must
// preserve, at the source level, so the family fork cannot silently change it:
//
//   1. The legacy `listEligibleStewardCandidates()` endpoint gates on the
//      canonical active-Steward authority check (not the platform admin role)
//      and delegates to the governance domain lib, so the default-family
//      outcome is decided in exactly one place.
//   2. The eligibility predicate is unchanged: a candidate is a living,
//      CLAIMED profile linked to a valid account, not archived, and not already
//      an active Steward.
//
// It deliberately does NOT assert the absence of a `familyId` parameter or the
// absence of a `*ForFamily` variant: adding those is exactly the change under
// way. It also does not assert two-family isolation, which is the new behavior
// the change introduces rather than existing behavior to protect.
//
// This is a static-source characterization, not a real-canister run: the
// PocketIC lane cannot drive the internal library function without a compiled
// wasm, and the frontend suite mocks the actor. The real canister's
// default-family candidate behavior is covered by the PocketIC lane when a
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

describe("default-family eligible-Steward candidates (compatibility baseline)", () => {
  it("the eligibility predicate keeps its living/claimed/linked/not-archived/not-steward semantics", () => {
    // The legacy `listEligibleStewardCandidates` is now a thin DEFAULT_FAMILY_ID
    // wrapper, so the eligibility predicate lives in the canonical
    // `listEligibleStewardCandidatesForFamily` body. The default-family outcome
    // is decided there, and the wrapper delegates to it.
    const body = functionBody(
      governance,
      "listEligibleStewardCandidatesForFamily",
    );
    // A candidate must be living, have a CLAIMED profile, be linked to a valid
    // account, not be archived, and not already be an active Steward of the
    // requested family.
    expect(body).toContain("profile.livingStatus == #Living");
    expect(body).toContain("profile.claimStatus == #Claimed");
    expect(body).toContain("profile.claimedByUserId != null");
    expect(body).toContain("archived.any(");
    expect(body).toContain(
      "isActiveStewardAccountForFamily(stewards, profile.claimedByUserId, familyId)",
    );
  });

  it("builds each candidate identity from the profile", () => {
    const body = functionBody(
      governance,
      "listEligibleStewardCandidatesForFamily",
    );
    expect(body).toContain("buildIdentity(profile)");
  });

  it("the legacy listEligibleStewardCandidates wrapper delegates to the family-scoped read with DEFAULT_FAMILY_ID", () => {
    const body = functionBody(governance, "listEligibleStewardCandidates");
    expect(body).toContain(
      "listEligibleStewardCandidatesForFamily(stewards, profiles, archivedProfiles, FamilyTypes.DEFAULT_FAMILY_ID)",
    );
  });
});

describe("default-family eligible-Steward candidates endpoint (compatibility baseline)", () => {
  it("the listEligibleStewardCandidates endpoint gates on the canonical active-Steward authority check", () => {
    const body = functionBody(governanceApi, "listEligibleStewardCandidates");
    // The gate is the canonical active-Steward check, not the platform admin
    // role.
    expect(body).toContain(
      "StewardAuthorityLib.isActiveSteward(stewards, caller)",
    );
    expect(body).not.toContain("isAdmin");
    expect(body).not.toContain("accessControl");
  });

  it("the listEligibleStewardCandidates endpoint delegates to the governance domain lib", () => {
    const body = functionBody(governanceApi, "listEligibleStewardCandidates");
    // The endpoint performs the authority gate and then returns the domain
    // operation's result directly, so the default-family outcome is decided in
    // exactly one place.
    expect(body).toContain(
      "GovernanceLib.listEligibleStewardCandidates(stewards, profiles, archivedProfiles)",
    );
  });
});
