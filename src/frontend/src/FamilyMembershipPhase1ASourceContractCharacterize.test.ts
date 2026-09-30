import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Characterization baseline for the FamilyMembership Phase 1A model and its
// OQL exposure (the preserved half).
//
// The requested change intentionally alters two things, and this file
// deliberately does NOT freeze either of them:
//
//   1. `activateMembershipForFamily` stops trusting the caller-supplied
//      `approvedBy` argument and records the authenticated caller instead. The
//      current three-argument signature is therefore NOT asserted here.
//   2. The five membership read APIs gain authorization gates and change their
//      return shapes (raw value -> `Result`). Their current ungated return
//      shapes are NOT asserted here.
//
// What this file protects is the Phase 1A model that must survive the change,
// at the source level, so a rewrite of the membership library or mixin cannot
// silently reshape it:
//
//   A. `types/family-membership.mo` — the `FamilyMembership` record's ten
//      fields and their types, the four `MembershipStatus` variants, the eight
//      `MembershipError` variants, and the flattened `MembershipRow` shape.
//   B. `main.mo` — the OQL `familyMembership` entity registration: its name,
//      its `membershipRows` source, its `.controllerOnly()` restriction, and
//      its ten payload fields.
//   C. `mixins/api-doc.mo` — the documented separation of `FamilyMembership`
//      from `ProfileClaim` and `StewardRecord`, the family-scoping invariant,
//      and the idempotent migration backfill.
//
// The sibling `FamilyMembershipPhase1AContractCharacterize.test.ts` freezes the
// same vocabulary through the generated frontend bindings; this file freezes the
// Motoko definitions those bindings are generated from, plus the OQL surface the
// bindings cannot see. Neither exercises the real canister: the backend PocketIC
// lane is the only place the membership API's runtime behavior is observed, and
// it is recorded in the episode's coverageLimits.
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

/**
 * The body of a named `public type`, from its `= {` to the matching closing
 * `};`. Throws when the type is absent so a rename fails loudly rather than
 * passing vacuously.
 */
function typeBody(source: string, name: string): string {
  const start = source.indexOf(`public type ${name} = {`);
  if (start === -1) {
    throw new Error(`type ${name} not found`);
  }
  const end = source.indexOf("\n  };", start);
  if (end === -1) {
    throw new Error(`end of type ${name} not found`);
  }
  return source.slice(start, end);
}

/** The field names declared in a Motoko record type body, in source order. */
function fieldNames(body: string): string[] {
  return [...body.matchAll(/^\s*([A-Za-z][A-Za-z0-9]*)\s*:/gmu)].map(
    (match) => match[1],
  );
}

/** The variant tags declared in a Motoko variant type body, in source order. */
function variantTags(body: string): string[] {
  return [...body.matchAll(/#([A-Za-z][A-Za-z0-9]*)/gu)].map(
    (match) => match[1],
  );
}

const membershipTypes = stripComments(
  readBackend(path.join("types", "family-membership.mo")),
);
const mainSource = stripComments(readBackend("main.mo"));
const apiDoc = readBackend(path.join("mixins", "api-doc.mo"));

// ---------------------------------------------------------------------------
// A. The FamilyMembership model in types/family-membership.mo.
// ---------------------------------------------------------------------------

describe("FamilyMembership model (source characterization)", () => {
  it("declares the ten FamilyMembership fields with their stable types", () => {
    const body = typeBody(membershipTypes, "FamilyMembership");

    expect(fieldNames(body)).toEqual([
      "id",
      "familyId",
      "accountId",
      "personId",
      "status",
      "joinedAt",
      "approvedBy",
      "approvedAt",
      "createdAt",
      "updatedAt",
    ]);

    // The field types are the Phase 1A contract: the three approval fields are
    // optional (unset until activation); the rest are always present.
    expect(body).toContain("id : Nat;");
    expect(body).toContain("familyId : FamilyId;");
    expect(body).toContain("accountId : AccountId;");
    expect(body).toContain("personId : PersonId;");
    expect(body).toContain("status : MembershipStatus;");
    expect(body).toContain("joinedAt : ?Int;");
    expect(body).toContain("approvedBy : ?Principal;");
    expect(body).toContain("approvedAt : ?Int;");
    expect(body).toContain("createdAt : Int;");
    expect(body).toContain("updatedAt : Int;");
  });

  it("declares exactly the four lifecycle status variants", () => {
    const body = typeBody(membershipTypes, "MembershipStatus");
    expect(variantTags(body)).toEqual([
      "Pending",
      "Active",
      "Suspended",
      "Left",
    ]);
  });

  it("declares exactly the eight membership error variants", () => {
    const body = typeBody(membershipTypes, "MembershipError");
    expect(variantTags(body).sort()).toEqual(
      [
        "AlreadyMember",
        "FamilyNotFound",
        "InvalidTransition",
        "MembershipNotFound",
        "NotAuthorized",
        "NotSignedIn",
        "PersonNotInFamily",
        "ProfileAlreadyOwned",
      ].sort(),
    );
  });

  it("declares the flattened MembershipRow with the ten OQL fields", () => {
    const body = typeBody(membershipTypes, "MembershipRow");

    expect(fieldNames(body)).toEqual([
      "familyId",
      "id",
      "accountId",
      "personId",
      "status",
      "joinedAt",
      "approvedBy",
      "approvedAt",
      "createdAt",
      "updatedAt",
    ]);

    // The row is the flattened, OQL-exposable view: enumerated status and the
    // optional fields are rendered as text / numeric values, never as variants
    // or options.
    expect(body).toContain("familyId : Text;");
    expect(body).toContain("id : Nat;");
    expect(body).toContain("accountId : Text;");
    expect(body).toContain("personId : Text;");
    expect(body).toContain("status : Text;");
    expect(body).toContain("joinedAt : Int;");
    expect(body).toContain("approvedBy : Text;");
    expect(body).toContain("approvedAt : Int;");
    expect(body).toContain("createdAt : Int;");
    expect(body).toContain("updatedAt : Int;");
  });

  it("keeps the FamilyId, PersonId, and AccountId aliases stable", () => {
    // The membership model is keyed by these three aliases; a rewrite that
    // inlines or renames them changes the public Candid shape.
    expect(membershipTypes).toContain("public type FamilyId = Text;");
    expect(membershipTypes).toContain("public type PersonId = Text;");
    expect(membershipTypes).toContain("public type AccountId = Principal;");
  });
});

// ---------------------------------------------------------------------------
// B. The OQL familyMembership entity registration in main.mo.
// ---------------------------------------------------------------------------

describe("OQL familyMembership entity registration (source characterization)", () => {
  it("registers the familyMembership entity over MembershipRow", () => {
    expect(mainSource).toContain(
      "OQL.Entity.manual<MembershipTypes.MembershipRow>(",
    );
    expect(mainSource).toContain('"familyMembership"');
    // The entity is sourced from the canonical membershipRows projection, so
    // the OQL view and the public API read the same records.
    expect(mainSource).toContain(
      "FamilyMembershipLib.membershipRows(memberships).values()",
    );
  });

  it("restricts the familyMembership entity to controllers", () => {
    // Membership is not public directory data: the OQL entity must stay
    // controller-only. The `.controllerOnly()` call follows the entity's
    // payload declarations.
    const entityStart = mainSource.indexOf(
      "OQL.Entity.manual<MembershipTypes.MembershipRow>(",
    );
    expect(entityStart).toBeGreaterThan(-1);
    const entityEnd = mainSource.indexOf(".build(),", entityStart);
    expect(entityEnd).toBeGreaterThan(entityStart);
    const entity = mainSource.slice(entityStart, entityEnd);
    expect(entity).toContain(".controllerOnly()");
  });

  it("exposes all ten membership fields as OQL payloads", () => {
    const entityStart = mainSource.indexOf(
      "OQL.Entity.manual<MembershipTypes.MembershipRow>(",
    );
    const entityEnd = mainSource.indexOf(".build(),", entityStart);
    const entity = mainSource.slice(entityStart, entityEnd);

    for (const field of [
      "familyId",
      "id",
      "accountId",
      "personId",
      "status",
      "joinedAt",
      "approvedBy",
      "approvedAt",
      "createdAt",
      "updatedAt",
    ]) {
      expect(entity).toContain(`.payload("${field}"`);
    }
  });
});

// ---------------------------------------------------------------------------
// C. The documented separation and invariants in mixins/api-doc.mo.
//
// Only the preserved prose is asserted. The per-method signatures in the same
// section are intentionally changing (the read APIs gain gates and `Result`
// returns; `activateMembershipForFamily` loses its `approvedBy` argument), so
// they are NOT frozen here.
// ---------------------------------------------------------------------------

/** The Family Membership section, from its heading to the next `### ` heading. */
function familyMembershipSection(source: string): string {
  const start = source.indexOf("### Family Membership");
  if (start === -1) {
    throw new Error("Family Membership section not found in api-doc.mo");
  }
  const end = source.indexOf("\n### ", start + 1);
  return end === -1 ? source.slice(start) : source.slice(start, end);
}

const section = familyMembershipSection(apiDoc);

describe("FamilyMembership API doc: preserved separation and invariants", () => {
  it("documents FamilyMembership as the canonical account-to-family membership state", () => {
    expect(section).toContain(
      "`FamilyMembership` is the canonical account-to-family membership state",
    );
  });

  it("separates FamilyMembership from ProfileClaim and StewardRecord", () => {
    expect(section).toContain("`ProfileClaim` is the legacy claim workflow");
    expect(section).toContain(
      "`StewardRecord` is family governance authority, not membership",
    );
    expect(section).toContain(
      "Membership is never inferred from `StewardRecord`",
    );
  });

  it("documents the family-scoping and ownership invariants", () => {
    expect(section).toContain(
      "A membership in Family A never implies membership in Family B",
    );
    expect(section).toContain("`personId` must belong to that `familyId`");
    // The accepted invariant wording: at most one #Active membership per
    // familyId + personId (and per familyId + accountId).
    expect(section).toContain(
      "At most one `#Active` membership may exist per `familyId` + `personId`",
    );
    expect(section).toContain(
      "At most one `#Active` membership may exist per `familyId` + `accountId`",
    );
    expect(section).toContain(
      "only `#Active` satisfies `hasActiveMembershipForFamily`",
    );
  });

  it("documents that family authorization has NOT switched to FamilyMembership", () => {
    // The protected baseline: ProfileClaim remains the authorization source for
    // this phase. A rewrite that switches authorization early fails here. The
    // doc wraps its prose, so match the fragments that survive the wrap.
    expect(section).toContain("it does NOT switch the");
    expect(section).toContain(
      "application's family authorization from approved `ProfileClaim`s to",
    );
  });

  it("documents that ProfileClaim remains for compatibility and migration is a later phase", () => {
    // The protected baseline: the claim workflow is retained and the switch to
    // FamilyMembership authorization is explicitly deferred. The doc wraps its
    // prose, so match the fragments that survive the wrap.
    expect(section).toContain(
      "`ProfileClaim` remains temporarily for compatibility",
    );
    expect(section).toContain(
      "Migration from claim-based membership checks to `FamilyMembership` is a later",
    );
  });
});
