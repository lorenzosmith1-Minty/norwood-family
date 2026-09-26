import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Tenancy 1C — canonical non-upload Research Source creation (static cover).
//
// The accepted behavior is that `createSourceForFamily` is the canonical
// family-scoped non-upload Source creation path and never relies on the default
// family, while the legacy `createSource` is a thin default-family compatibility
// wrapper delegating to the same internal implementation.
//
// The public API cannot bootstrap a Steward of a non-default family, so the
// positive Family A direction is driven through the approved-member path in the
// sibling `research-source-create-for-family.cover.test.ts`. This file is the
// static cover for the canonical path's family wiring itself: it reads the real
// Motoko source and asserts that the canonical endpoint threads the requested
// `familyId` (never `DEFAULT_FAMILY_ID`) into the stored record, the audit
// entry, and the notification, and that the legacy wrapper is a thin
// delegation with the default family rather than a second implementation.
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

const apiSource = readBackend(path.join("mixins", "research-intake-api.mo"));
const api = stripComments(apiSource);

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

describe("canonical createSourceForFamily is family-scoped", () => {
  it("takes an explicit familyId parameter", () => {
    const body = functionBody(api, "createSourceForFamily");
    expect(body).toMatch(/familyId\s*:\s*FamilyTypes\.FamilyId/u);
  });

  it("never references DEFAULT_FAMILY_ID", () => {
    const body = functionBody(api, "createSourceForFamily");
    expect(body).not.toContain("DEFAULT_FAMILY_ID");
  });

  it("delegates to the internal implementation with the requested familyId", () => {
    const body = functionBody(api, "createSourceForFamily");
    expect(body).toContain("createSourceForFamilyInternal(familyId,");
  });
});

describe("createSourceForFamilyInternal threads familyId through every write", () => {
  const body = functionBody(api, "createSourceForFamilyInternal");

  it("authorizes the caller for the requested family", () => {
    expect(body).toContain(
      "isApprovedFamilyMemberForFamily(stewards, claims, caller, familyId)",
    );
  });

  it("stores the requested familyId on the SourceRecord", () => {
    // The familyId argument is passed positionally into the canonical creation
    // helper, which stores it on the record.
    expect(body).toContain("ResearchLib.createSource(");
    expect(body).toMatch(/familyId,\s*\n\s*cleanTitle,/u);
  });

  it("writes the audit entry to the requested familyId", () => {
    expect(body).toContain("ResearchLib.appendAudit(");
    expect(body).toMatch(/familyId,\s*\n\s*"SourceCreated"/u);
  });

  it("scopes the notification to the requested familyId", () => {
    expect(body).toContain("addResearchNotification(familyId,");
  });

  it("validates a linked Archive item against the requested familyId", () => {
    expect(body).toContain("ArchiveLib.belongsToFamily(it, familyId)");
  });

  it("never references DEFAULT_FAMILY_ID", () => {
    expect(body).not.toContain("DEFAULT_FAMILY_ID");
  });
});

describe("legacy createSource is a thin default-family wrapper", () => {
  it("delegates to the canonical internal implementation with the default family", () => {
    const body = functionBody(api, "createSource");
    expect(body).toContain(
      "createSourceForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID,",
    );
  });

  it("contains no duplicated business logic", () => {
    const body = functionBody(api, "createSource");
    // The wrapper must not re-implement authorization, storage, audit, or
    // notification; it only delegates.
    expect(body).not.toContain("isApprovedFamilyMemberForFamily");
    expect(body).not.toContain("ResearchLib.createSource(");
    expect(body).not.toContain("ResearchLib.appendAudit(");
    expect(body).not.toContain("addResearchNotification(");
  });

  it("is documented as temporary compatibility", () => {
    // The marker lives in a `//` comment, so assert on the raw source.
    expect(apiSource).toContain("TEMPORARY Tenancy 1C compatibility");
  });
});
