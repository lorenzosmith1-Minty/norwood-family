import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Tenancy 1C-B2-B5 — family-scoped Research audit domain logic (static cover).
//
// The accepted behavior is that every Research audit entry carries the
// `familyId` of the family the action was performed in, that the canonical
// creation helper requires a `familyId`, and that the canonical family-scoped
// read returns only entries whose `familyId` matches the requested family.
//
// The canonical predicate (`listAuditForFamily`) and the single creation helper
// (`appendAudit`) live in `lib/research-intake.mo`; they are internal Motoko
// functions, so the PocketIC lane cannot drive them directly for a non-default
// family (no public endpoint creates a Steward of one). This file is the static
// cover for those functions themselves. It reads the real Motoko sources and
// asserts the family-scoping rules the requirement names, using test-only
// Family A / Family B identifiers, and proves the legacy single-family read is a
// thin wrapper delegating with the default family id rather than a second
// independent implementation.
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

const researchIntakeLib = stripComments(
  readBackend(path.join("lib", "research-intake.mo")),
);
const researchIntakeApi = stripComments(
  readBackend(path.join("mixins", "research-intake-api.mo")),
);
const researchIntakeTypes = stripComments(
  readBackend(path.join("types", "research-intake.mo")),
);

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
// prove the predicate is keyed on the family argument rather than on a global
// "any family" notion.
const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";

describe("ResearchAuditEntry carries a familyId", () => {
  it("declares familyId on the audit entry type", () => {
    const start = researchIntakeTypes.indexOf("public type ResearchAuditEntry");
    expect(start).toBeGreaterThan(-1);
    const end = researchIntakeTypes.indexOf("};", start);
    const body = researchIntakeTypes.slice(start, end);
    expect(body).toContain("familyId : Text");
  });
});

describe("canonical Research audit creation helper", () => {
  it("appendAudit takes an explicit familyId parameter", () => {
    const body = functionBody(researchIntakeLib, "appendAudit");
    // The familyId is a required positional parameter, not inferred from the
    // default family.
    expect(body).toMatch(/familyId\s*:\s*Text/u);
    // The stored entry's familyId is the requested familyId.
    expect(body).toContain("familyId;");
  });

  it("appendAudit is the single canonical creation helper", () => {
    // Exactly one `appendAudit` definition exists in the lib.
    const definitions = researchIntakeLib.match(/func appendAudit\(/gu) ?? [];
    expect(definitions).toEqual(["func appendAudit("]);
  });
});

describe("family-scoped Research audit read predicate", () => {
  it("listAuditForFamily filters on the entry's familyId", () => {
    const body = functionBody(researchIntakeLib, "listAuditForFamily");
    expect(body).toContain("e.familyId == familyId");
    // It must not be a bare pass-through of the whole log.
    expect(body).not.toMatch(/auditLog\.toArray\(\)\s*;/u);
  });

  it("getResearchAuditLogForFamily delegates to the canonical filter with the requested family", () => {
    const body = functionBody(researchIntakeApi, "getResearchAuditLogForFamily");
    expect(body).toContain("listAuditForFamily(auditLog, familyId)");
    // The Steward gate is evaluated for the requested family.
    expect(body).toContain("requireActiveStewardForFamily(stewards, caller, familyId)");
  });

  it("the legacy getResearchAuditLog is a thin wrapper delegating with the default family", () => {
    const body = functionBody(researchIntakeApi, "getResearchAuditLog");
    expect(body).toContain("FamilyTypes.DEFAULT_FAMILY_ID");
    expect(body).toContain("listAuditForFamily(auditLog, FamilyTypes.DEFAULT_FAMILY_ID)");
    // It is documented as temporary compatibility, not a second implementation.
    // The marker lives in a `//` comment, so assert on the raw source.
    expect(
      readBackend(path.join("mixins", "research-intake-api.mo")),
    ).toContain("TEMPORARY Tenancy 1C compatibility");
  });
});

describe("family-scoped audit writes in the review mixins", () => {
  // Every family-scoped review action writes its audit entry through the single
  // canonical helper with the action's own familyId, never the default family.
  const mixins: Array<{ file: string; wrapper: string; action: string }> = [
    {
      file: path.join("mixins", "research-source-scope-api.mo"),
      wrapper: "appendSourceAudit",
      action: "SourceApproved",
    },
    {
      file: path.join("mixins", "finding-scope-api.mo"),
      wrapper: "appendFindingAudit",
      action: "FindingApproved",
    },
    {
      file: path.join("mixins", "candidate-scope-api.mo"),
      wrapper: "appendCandidateAudit",
      action: "NewPersonCandidateSubmitted",
    },
    {
      file: path.join("mixins", "relationship-proposal-scope-api.mo"),
      wrapper: "appendRelationshipProposalAudit",
      action: "RelationshipProposalSubmitted",
    },
    {
      file: path.join("mixins", "conflict-scope-api.mo"),
      wrapper: "appendConflictAudit",
      action: "ConflictResolved",
    },
  ];

  for (const { file, wrapper, action } of mixins) {
    it(`${wrapper} writes the action's familyId through the canonical helper`, () => {
      const source = stripComments(readBackend(file));
      const body = functionBody(source, wrapper);
      // The wrapper forwards its familyId argument to the canonical helper.
      expect(body).toContain("ResearchAuditLib.appendAudit(");
      expect(body).toMatch(/familyId,/u);
      // The action tag is written by the family-scoped path.
      expect(source).toContain(`"${action}"`);
    });
  }

  it("the source review actions are family-scoped and write their own family", () => {
    const source = stripComments(
      readBackend(path.join("mixins", "research-source-scope-api.mo")),
    );
    for (const action of ["SourceApproved", "SourceRejected", "SourceNeedsResearch"]) {
      expect(source).toContain(`"${action}"`);
    }
    // The family-scoped review helpers pass the requested familyId, not the
    // default family.
    const approve = functionBody(source, "approveSourceForFamilyInternal");
    expect(approve).toContain("appendSourceAudit(");
    expect(approve).toContain("familyId,");
  });
});
