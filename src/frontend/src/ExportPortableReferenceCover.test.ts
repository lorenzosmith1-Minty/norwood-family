import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Phase 5A-H1 — portable export reference hardening (focused verification).
//
// The accepted Phase 5A-H1 requirement is that every reference emitted by an
// export is EXPORT-LOCAL: generated specifically for the export (for example
// `person-1`, `membership-1`, `relationship-1`, `archive-1`, `story-1`,
// `source-1`, `recipe-1`, `media-1`, `recovery-1`) and carrying NO raw internal
// identifier — not the family id, person id, membership id, relationship id,
// archive item id, story id, source id, recipe id, or recovery request id.
//
// The real-canister PocketIC lane (test/pocketic/export.cover.test.ts) is the
// primary place backend runtime behavior is observed. This file is the focused
// portable-reference verification that runs in the gated frontend suite: it
// pins the reference-construction contract in the export library source and the
// typed consumer seam, so a regression that reintroduces a raw internal id into
// a portable reference fails here even when no replica is available.
//
// This is a static-source + typed consumer-contract test. It does NOT exercise
// the real canister; the PocketIC lane is the only place backend runtime
// behavior is observed, and it is recorded in the episode's coverageLimits.
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

const exportLib = stripComments(readBackend(path.join("lib", "export.mo")));
const exportTypes = stripComments(readBackend(path.join("types", "export.mo")));

/**
 * Extracts the `portableId = <expr>` expression from a reference helper. The
 * record literal closes with `}`, so the expression is everything between the
 * `=` and the closing brace.
 */
function portableIdExpression(functionName: string): string {
  const start = exportLib.indexOf(`public func ${functionName}(`);
  expect(start, `${functionName} must exist in lib/export.mo`).toBeGreaterThan(
    -1,
  );
  const end = exportLib.indexOf("\n  };", start);
  const body = exportLib.slice(start, end === -1 ? undefined : end);
  const match = /portableId\s*=\s*([^}]+)\}/u.exec(body);
  expect(match, `${functionName} must build a portableId`).not.toBeNull();
  return (match as RegExpExecArray)[1].trim();
}

/**
 * The body of a top-level `public func <name>(` declaration, up to the next
 * top-level declaration. Comments are already stripped, so a comment marker
 * cannot be used as the boundary.
 */
function publicFunctionBody(name: string): string {
  const start = exportLib.indexOf(`public func ${name}(`);
  expect(start, `${name} must exist in lib/export.mo`).toBeGreaterThan(-1);
  const end = exportLib.indexOf("\n  public func ", start + 1);
  return exportLib.slice(start, end === -1 ? undefined : end);
}

/**
 * The body of a top-level `func <name>(` declaration (public or private), up to
 * the next top-level declaration. Comments are already stripped, so a comment
 * marker cannot be used as the boundary.
 */
function functionBody(name: string): string {
  const start = exportLib.indexOf(`func ${name}(`);
  expect(start, `${name} must exist in lib/export.mo`).toBeGreaterThan(-1);
  const privateEnd = exportLib.indexOf("\n  func ", start + 1);
  const publicEnd = exportLib.indexOf("\n  public func ", start + 1);
  const boundary = [privateEnd, publicEnd]
    .filter((index) => index !== -1)
    .sort((a, b) => a - b)[0];
  return exportLib.slice(start, boundary === undefined ? undefined : boundary);
}

/**
 * The raw internal identifiers a portable reference must never embed. Each
 * helper is checked against the identifiers it could plausibly leak.
 *
 * The export-local rewrite routes every helper through `assignRef`, which
 * returns the token stored in the export-local table. The helper body must not
 * build the portable id from the raw id; the raw id may appear only as the
 * lookup key passed to `assignRef`.
 */
const REFERENCE_HELPERS: Array<{ helper: string; forbidden: string[] }> = [
  { helper: "personRef", forbidden: ["personId", "familyId"] },
  { helper: "membershipRef", forbidden: ["membershipId", "familyId"] },
  { helper: "relationshipRef", forbidden: ["relationshipId", "familyId"] },
  { helper: "archiveItemRef", forbidden: ["archiveItemId", "familyId"] },
  { helper: "storyRef", forbidden: ["storyId", "familyId"] },
  { helper: "sourceRef", forbidden: ["sourceId", "familyId"] },
  { helper: "recipeRef", forbidden: ["recipeId", "familyId"] },
  { helper: "mediaRef", forbidden: ["archiveItemId", "familyId"] },
  { helper: "recoveryStatusRef", forbidden: ["recoveryId", "familyId"] },
];

// ---------------------------------------------------------------------------
// required_check_1..4, 6 — every portable reference is export-local and carries
// no raw internal identifier (including the raw family id).
// ---------------------------------------------------------------------------

describe("export-local portable references (Phase 5A-H1)", () => {
  it("builds every reference helper from an export-local id, not a raw internal id", () => {
    for (const { helper, forbidden } of REFERENCE_HELPERS) {
      const expression = portableIdExpression(helper);
      for (const raw of forbidden) {
        expect(
          expression,
          `${helper} must not embed the raw internal identifier "${raw}"`,
        ).not.toContain(raw);
      }
    }
  });

  it("never embeds the raw family id in any record reference", () => {
    // required_check_6: the serialized export must contain no raw family id in
    // record references. Every helper is checked, so a new helper that copies
    // the family id into its portableId fails here.
    for (const { helper } of REFERENCE_HELPERS) {
      expect(
        portableIdExpression(helper),
        `${helper} must not embed the raw family id`,
      ).not.toContain("familyId");
    }
  });

  it("does not fall back to the family-qualified raw person key", () => {
    // The pre-hardening construction was `TenancyLib.personKey(familyId,
    // personId)`, which embeds both the raw family id and the raw person id.
    // The hardened reference must not use it.
    expect(exportLib).not.toContain("TenancyLib.personKey(familyId, personId)");
  });

  it("does not fall back to a family-prefixed composite raw id", () => {
    // The pre-hardening construction for every non-person reference was
    // `familyId # "::<kind>::" # <rawId>.toText()`. None may remain.
    for (const kind of [
      "membership",
      "relationship",
      "archive",
      "story",
      "source",
      "recipe",
      "media",
      "recovery",
    ]) {
      expect(
        exportLib,
        `no reference may embed the raw family id via "::${kind}::"`,
      ).not.toContain(`familyId # "::${kind}::"`);
    }
  });
});

// ---------------------------------------------------------------------------
// Export-local reference tables — the accepted Phase 5A-H1 mechanism.
//
// The accepted change replaces the deterministic internal-id encoding with
// per-export reference tables that map an internal id to a sequential token
// (`person-1`, `person-2`, `membership-1`, …). The internal id is only a lookup
// key; the token is what is serialized. These assertions pin the mechanism
// itself, so a regression that reintroduces an encoding/hash of the raw id, or
// that assigns a fresh token each time the same record appears, fails here.
// ---------------------------------------------------------------------------

describe("export-local reference tables (Phase 5A-H1)", () => {
  it("declares a reference table for every record kind", () => {
    const start = exportTypes.indexOf("public type RefTables = {");
    // RefTables is declared in the library, not the types module.
    const libStart = exportLib.indexOf("public type RefTables = {");
    expect(
      libStart,
      "RefTables must be declared in lib/export.mo",
    ).toBeGreaterThan(-1);
    const end = exportLib.indexOf("};", libStart);
    const tables = exportLib.slice(libStart, end);
    for (const table of [
      "persons",
      "memberships",
      "relationships",
      "archiveItems",
      "stories",
      "sources",
      "recipes",
      "media",
      "recoveryStatuses",
    ]) {
      expect(tables, `RefTables must declare ${table}`).toContain(`${table} :`);
    }
    // The types module does not own the table type.
    expect(start).toBe(-1);
  });

  it("assigns sequential tokens from the table size and reuses an existing token", () => {
    const body = functionBody("assignRef");
    // The token is `prefix # "-" # n`, where n is one greater than the number
    // of records already assigned in this table (starting at 1).
    expect(body).toContain('prefix # "-" # (table.size() + 1).toText()');
    // A raw id that already has a token returns the existing token unchanged,
    // so every reference to the same internal record within one export resolves
    // to the same portable id.
    expect(body).toContain("switch (table.get(rawId))");
    expect(body).toContain("case (?existing) { existing }");
    expect(body).toContain("table.add(rawId, token)");
  });

  it("routes every reference helper through the export-local table", () => {
    // Each helper must call `assignRef` with its own table and a prefix, rather
    // than deriving the portable id from the raw id.
    const expected: Array<{ helper: string; table: string; prefix: string }> = [
      { helper: "personRef", table: "tables.persons", prefix: '"person"' },
      {
        helper: "membershipRef",
        table: "tables.memberships",
        prefix: '"membership"',
      },
      {
        helper: "relationshipRef",
        table: "tables.relationships",
        prefix: '"relationship"',
      },
      {
        helper: "archiveItemRef",
        table: "tables.archiveItems",
        prefix: '"archive"',
      },
      { helper: "storyRef", table: "tables.stories", prefix: '"story"' },
      { helper: "sourceRef", table: "tables.sources", prefix: '"source"' },
      { helper: "recipeRef", table: "tables.recipes", prefix: '"recipe"' },
      { helper: "mediaRef", table: "tables.media", prefix: '"media"' },
      {
        helper: "recoveryStatusRef",
        table: "tables.recoveryStatuses",
        prefix: '"recovery"',
      },
    ];
    for (const { helper, table, prefix } of expected) {
      const body = publicFunctionBody(helper);
      expect(body, `${helper} must assign from ${table}`).toContain(
        `assignRef(${table}, ${prefix},`,
      );
    }
  });

  it("removes the deterministic internal-id encoding entirely", () => {
    // The accepted requirement removes encodeId/encodeNat and any hash or
    // encoding of a raw backend id. None may remain anywhere in the library.
    for (const forbidden of [
      "encodeId",
      "encodeNat",
      "base36",
      "base-36",
      "hash",
      "sha256",
      "crc",
    ]) {
      expect(
        exportLib.toLowerCase(),
        `lib/export.mo must not contain "${forbidden}"`,
      ).not.toContain(forbidden.toLowerCase());
    }
  });

  it("builds the export-local tables once per export and seeds persons first", () => {
    // MyData: the caller's own person is assigned first so it is always
    // person-1, and the same tables object is threaded through every projection.
    const myData = publicFunctionBody("buildMyDataExport");
    expect(myData).toContain("let tables = emptyRefTables();");
    expect(myData).toContain("ignore personRef(tables, familyId, personId);");
    expect(myData).toContain("projectPerson(tables, familyId, profile)");

    // FamilyArchive: every family person is assigned before any projection, so
    // every person reference resolves to the same person-N.
    const archive = publicFunctionBody("buildFamilyArchiveExport");
    expect(archive).toContain("let tables = emptyRefTables();");
    expect(archive).toContain(
      "ignore personRef(tables, familyId, p.personId);",
    );
    expect(archive).toContain("projectPerson(tables, familyId, p)");
  });
});

// ---------------------------------------------------------------------------
// required_check_3 — relationship endpoints resolve to exported person refs.
// ---------------------------------------------------------------------------

describe("relationship reference integrity (Phase 5A-H1)", () => {
  it("resolves both relationship endpoints through the person reference helper", () => {
    const body = publicFunctionBody("projectRelationship");

    // Both endpoints must be built by the same `personRef` helper the Person
    // records use, so a relationship points at the same export-local Person
    // reference as that person's own record.
    expect(body).toContain(
      "fromPersonRef = personRef(tables, familyId, relationship.fromPersonId)",
    );
    expect(body).toContain(
      "toPersonRef = personRef(tables, familyId, relationship.toPersonId)",
    );
  });

  it("keeps the relationship's own reference export-local", () => {
    expect(portableIdExpression("relationshipRef")).not.toContain(
      "relationshipId",
    );
  });
});

// ---------------------------------------------------------------------------
// required_check_4 — archive/story/source/recipe/media references are
// export-local and internally consistent.
// ---------------------------------------------------------------------------

describe("archive, story, source, recipe, and media reference integrity (Phase 5A-H1)", () => {
  it("builds archive/story/recipe related-person refs through the person helper", () => {
    // Related-person lists must reuse `personRef`, so they resolve to the same
    // export-local Person references as the Person records.
    for (const helper of [
      "projectArchiveItem",
      "projectStory",
      "projectRecipe",
    ]) {
      expect(
        publicFunctionBody(helper),
        `${helper} must reuse personRef`,
      ).toContain("personRef(tables, familyId,");
    }
  });

  it("builds story related-archive refs through the archive reference helper", () => {
    expect(publicFunctionBody("projectStory")).toContain(
      "archiveItemRef(tables, familyId,",
    );
  });

  it("builds recipe linked-media refs through the media reference helper", () => {
    expect(publicFunctionBody("projectRecipe")).toContain(
      "mediaRef(tables, familyId,",
    );
  });

  it("does not expose a raw internal id through the media reference field", () => {
    // The media `reference` field must not be a Norwood-internal synthetic id
    // built from the raw family id and archive item id.
    const body = publicFunctionBody("projectMediaRef");
    expect(body).not.toContain('familyId # "::media::"');
    expect(body).not.toContain("item.id.toText()");
  });
});

// ---------------------------------------------------------------------------
// required_check_5 — MyData recovery reference carries no internal recovery id.
// ---------------------------------------------------------------------------

describe("recovery status reference (Phase 5A-H1)", () => {
  it("builds the recovery status reference without the internal recovery request id", () => {
    expect(portableIdExpression("recoveryStatusRef")).not.toContain(
      "recoveryId",
    );
  });

  it("projects the recovery status through the export-local recovery helper", () => {
    expect(publicFunctionBody("projectRecoveryStatus")).toContain(
      "recoveryStatusRef(tables, familyId,",
    );
  });
});

// ---------------------------------------------------------------------------
// required_check_7 — a Family A export contains no Family B identifiers.
//
// The family boundary is enforced by the family-scoped readers (asserted in
// ExportPortabilityCover.test.ts). This file adds the reference-level property:
// because no reference embeds a raw family id, a Family B identifier cannot
// reach a Family A export through a record reference.
// ---------------------------------------------------------------------------

describe("cross-family reference isolation (Phase 5A-H1)", () => {
  it("keeps every reference free of the raw family id, so no cross-family id can leak", () => {
    for (const { helper } of REFERENCE_HELPERS) {
      expect(
        portableIdExpression(helper),
        `${helper} must be family-independent`,
      ).not.toContain("familyId");
    }
  });
});

// ---------------------------------------------------------------------------
// required_check_8 — the export schema remains versioned and valid JSON.
// ---------------------------------------------------------------------------

describe("versioned, valid-JSON export schema (Phase 5A-H1)", () => {
  it("keeps the schema version constant and stamps it into the envelope", () => {
    expect(exportTypes).toContain(
      "public let CURRENT_EXPORT_SCHEMA_VERSION : Nat = 1;",
    );
    expect(exportLib).toContain(
      "schemaVersion = ExportTypes.CURRENT_EXPORT_SCHEMA_VERSION;",
    );
  });

  it("keeps the portable reference shape on the typed consumer seam", () => {
    // The consumer contract: a reference is a kind plus a portable id, and the
    // portable id is a plain string the export controls. The wrapper does not
    // re-export the record-ref type, so the shape is asserted structurally
    // against the serializer's own `recordRefJson` output.
    const start = exportLib.indexOf("func recordRefJson(");
    expect(start).toBeGreaterThan(-1);
    const end = exportLib.indexOf("\n  };", start);
    const body = exportLib.slice(start, end === -1 ? undefined : end);
    expect(body).toContain('"\\"kind\\":"');
    expect(body).toContain('"\\"portableId\\":"');
  });

  it("serializes the payload as a JSON object with the expected categories", () => {
    const start = exportLib.indexOf("public func serializePayload(");
    expect(start).toBeGreaterThan(-1);
    const end = exportLib.indexOf("\n  func ", start + 1);
    const body = exportLib.slice(start, end === -1 ? undefined : end);
    // The serializer emits a JSON object literal and every category key.
    expect(body).toContain('"{" #');
    for (const category of [
      "persons",
      "memberships",
      "relationships",
      "archiveItems",
      "stories",
      "sources",
      "recipes",
      "recoveryStatuses",
      "mediaManifest",
    ]) {
      expect(body).toContain(`\\"${category}\\":`);
    }
  });
});
