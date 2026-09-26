import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Tenancy 1C governance API-doc contract (static cover).
//
// `mixins/api-doc.mo` is a changed file in this build: its Family Governance
// section was rewritten to document the canonical family-scoped mutation paths
// and to mark the legacy no-`familyId` forms as TEMPORARY compatibility
// wrappers. The API doc is the public contract surface a consumer reads, so a
// doc that still advertises the legacy forms as canonical — or that drops the
// family-scoping guarantee — misleads every caller even though the backend
// compiles and behaves correctly.
//
// The doc is a Motoko string literal, not reachable through the canister's
// Candid interface in a way the PocketIC lane can assert on without a compiled
// wasm, so this static cover reads the real source and pins the accepted
// contract:
//
//   1. The three canonical `*ForFamily` methods are documented with `familyId`
//      as their first argument.
//   2. The three legacy forms are documented as TEMPORARY Tenancy 1C
//      compatibility wrappers delegating with the default family id.
//   3. The section states the family-scoping guarantee: a Steward of one family
//      can never promote, activate, or relate a member of another family, and
//      every created record is stamped with the requested `familyId`.
//
// It deliberately does NOT assert the exact prose, only the contract facts a
// reader must be able to rely on. The runtime behavior those facts describe is
// covered by `governance-family-scope.cover.test.ts` (real canister) and the
// default-family baseline by `governance-default-family.characterize.test.ts`.
// ---------------------------------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, "..", "..", "src", "backend");

const apiDoc = readFileSync(path.join(backendRoot, "mixins", "api-doc.mo"), "utf8");

/** The Family Governance section, from its heading to the next `### ` heading. */
function familyGovernanceSection(source: string): string {
  const start = source.indexOf("### Family Governance");
  if (start === -1) {
    throw new Error("Family Governance section not found in api-doc.mo");
  }
  const end = source.indexOf("\n### ", start + 1);
  return end === -1 ? source.slice(start) : source.slice(start, end);
}

const section = familyGovernanceSection(apiDoc);

describe("governance API doc: canonical family-scoped paths", () => {
  it("documents each canonical method with familyId as its first argument", () => {
    expect(section).toContain(
      "`promoteToStewardForFamily(familyId : Text, personId : Text)",
    );
    expect(section).toContain(
      "`activateSuccessorForFamily(familyId : Text, personId : Text)",
    );
    expect(section).toContain(
      "`addRelationshipForFamily(familyId : Text, fromPersonId : Text, toPersonId : Text, relationshipType : RelationshipType)",
    );
  });

  it("states the family-scoping guarantee for the canonical paths", () => {
    // A Steward of one family can never act on another family's member, and
    // every record is stamped with the requested family id. The accepted change
    // adds `designateSuccessorForFamily` to the canonical set, so the guarantee
    // sentence names designation alongside promotion, activation, and relation.
    expect(section).toContain("A Steward of one");
    expect(section).toContain(
      "family can never promote, designate, activate, or relate a member of another",
    );
    expect(section).toContain("stamped with");
    expect(section).toContain("familyId");
  });
});

describe("governance API doc: legacy wrappers are documented as temporary", () => {
  it("marks the three legacy forms as TEMPORARY Tenancy 1C compatibility wrappers", () => {
    expect(section).toContain("TEMPORARY Tenancy 1C compatibility");
    // Each legacy form is named as a wrapper for its canonical counterpart.
    expect(section).toContain("`promoteToSteward(personId : Text)");
    expect(section).toContain("`activateSuccessor(personId : Text)");
    expect(section).toContain("`addRelationship(fromPersonId : Text");
  });

  it("documents that the wrappers delegate with the default family id", () => {
    // The default family id the wrappers delegate with is named in the section.
    expect(section).toContain("norwood");
    // Each legacy entry points at its canonical counterpart.
    expect(section).toContain("`promoteToStewardForFamily`");
    expect(section).toContain("`activateSuccessorForFamily`");
    expect(section).toContain("`addRelationshipForFamily`");
  });

  it("does not present the legacy forms as the canonical paths", () => {
    // The canonical-paths sentence must name the *ForFamily forms, not the
    // legacy ones, so a reader is not told the deprecated surface is canonical.
    const canonicalSentence = section.slice(
      section.indexOf("The canonical governance mutation paths"),
      section.indexOf("The legacy no-`familyId` forms"),
    );
    expect(canonicalSentence).toContain("promoteToStewardForFamily");
    expect(canonicalSentence).toContain("activateSuccessorForFamily");
    expect(canonicalSentence).toContain("addRelationshipForFamily");
    expect(canonicalSentence).not.toContain("`promoteToSteward`");
    expect(canonicalSentence).not.toContain("`activateSuccessor`");
    expect(canonicalSentence).not.toContain("`addRelationship`");
  });
});
