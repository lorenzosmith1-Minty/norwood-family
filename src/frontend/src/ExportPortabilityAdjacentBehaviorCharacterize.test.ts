import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { AccountId, FamilyId, PersonId } from "@/backend";

// ---------------------------------------------------------------------------
// Phase 5A — portable export: adjacent-behavior characterization.
//
// The export feature does not exist yet. This file deliberately does NOT assert
// any export type, endpoint, envelope, or serialization: those are the change
// under construction, and characterizing them now would freeze a design that
// has not been accepted. What it protects is the ADJACENT working behavior the
// export implementation must reuse and must not break:
//
//   A. The canonical family-scoping authorization seams still exist and are the
//      single source of authority. An export that reuses them inherits the
//      family boundary; an export that reimplements authorization would drift
//      from these predicates, so their presence and shape are pinned here.
//   B. The privacy invariants the export must respect are still enforced at the
//      source: the invite `tokenHash` is never exposed through the OQL row
//      projection, and the recovery caller-facing views still omit raw account
//      principals and internal ids. An export that serializes these records must
//      not resurrect a secret that the read surfaces already withhold.
//   C. The family-scoped read endpoints the export will draw from are still
//      present on the generated service interface (the consumer seam), and the
//      existing type modules still declare the records export will classify.
//   D. The existing type modules remain intact and additive: the export types
//      are fitted to them, not a rewrite of them.
//
// This is a static-source + typed consumer-contract characterization. It does
// NOT exercise the real canister: the PocketIC lane is the only place backend
// runtime behavior is observed, and it is recorded in the episode's
// coverageLimits. The frontend suite mocks the actor, so no backend runtime
// behavior is visible here.
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

const stewardAuthority = stripComments(
  readBackend(path.join("lib", "steward-authority.mo")),
);
const familyAuthorization = stripComments(
  readBackend(path.join("lib", "family-authorization.mo")),
);
const tenancyLib = stripComments(readBackend(path.join("lib", "tenancy.mo")));
const invitationLib = stripComments(
  readBackend(path.join("lib", "family-invitation.mo")),
);
const invitationTypes = stripComments(
  readBackend(path.join("types", "family-invitation.mo")),
);
const recoveryTypes = stripComments(
  readBackend(path.join("types", "recovery.mo")),
);
const ownershipTypes = stripComments(
  readBackend(path.join("types", "ownership.mo")),
);
const archiveTypes = stripComments(
  readBackend(path.join("types", "archive.mo")),
);
const familyHistoryTypes = stripComments(
  readBackend(path.join("types", "family-history.mo")),
);
const accountIdentityTypes = stripComments(
  readBackend(path.join("types", "account-identity.mo")),
);

// ---------------------------------------------------------------------------
// A. The canonical family-scoping authorization seams still exist.
//
// The export must classify and serialize per family. These are the predicates
// every family-scoped surface already authorizes through; an export that
// reuses them cannot cross the family boundary, and one that reimplements
// authorization would no longer be pinned by these assertions.
// ---------------------------------------------------------------------------

describe("canonical family-scoping authorization seams (characterization)", () => {
  it("keeps the active-Steward predicate family-scoped", () => {
    expect(stewardAuthority).toContain("public func isActiveStewardForFamily(");
    // The predicate compares the record's own familyId against the requested
    // family, so a Steward of one family is never a Steward of another.
    expect(stewardAuthority).toContain("s.familyId == familyId");
    expect(stewardAuthority).toContain("s.roleStatus == #Active");
  });

  it("keeps the approved-member predicate family-scoped and Steward-inclusive", () => {
    expect(familyAuthorization).toContain(
      "public func isApprovedFamilyMemberForFamily(",
    );
    // An active Steward of the family is an approved member without a claim.
    expect(familyAuthorization).toContain("isStewardForFamily(");
    // The claim arm is gated on the claim's own family.
    expect(familyAuthorization).toContain("c.familyId == familyId");
  });

  it("keeps the require* gates that trap for anonymous and unauthorized callers", () => {
    expect(familyAuthorization).toContain(
      "public func requireApprovedFamilyMemberForFamily(",
    );
    expect(familyAuthorization).toContain(
      "public func requireActiveStewardForFamily(",
    );
    // Anonymous callers are rejected before the membership/Steward predicate.
    expect(familyAuthorization).toContain("caller.isAnonymous()");
  });

  it("keeps the family-qualified profile lookup the export must read through", () => {
    // A bare personId is never assumed globally unique: the family-qualified
    // key is the only safe way to resolve a profile across families.
    expect(tenancyLib).toContain("public func getProfileForFamily(");
    expect(tenancyLib).toContain("public func putProfileForFamily(");
    expect(tenancyLib).toContain("familyPersonKey(");
  });
});

// ---------------------------------------------------------------------------
// B. The privacy invariants the export must respect are still enforced.
//
// These are the secrets the read surfaces already withhold. An export that
// serializes the underlying records must not reintroduce them.
// ---------------------------------------------------------------------------

describe("privacy invariants the export must not resurrect (characterization)", () => {
  it("never exposes the invite token hash through the OQL row projection", () => {
    // The persisted record carries the digest, but the row projection that
    // feeds OQL deliberately omits it.
    expect(invitationTypes).toContain("tokenHash : Text;");
    expect(invitationTypes).toContain("public type FamilyInvitationRow = {");
    const rowStart = invitationTypes.indexOf(
      "public type FamilyInvitationRow = {",
    );
    const rowEnd = invitationTypes.indexOf("};", rowStart);
    const row = invitationTypes.slice(rowStart, rowEnd);
    expect(row).not.toContain("tokenHash");

    // The builder that produces the rows also never copies the hash. Slice the
    // function body up to the next top-level declaration (comments are already
    // stripped, so a comment marker cannot be used as the boundary).
    const rowsStart = invitationLib.indexOf("public func invitationRows(");
    expect(rowsStart).toBeGreaterThan(-1);
    const nextDecl = invitationLib.indexOf("\n  func ", rowsStart + 1);
    const rowsBody = invitationLib.slice(
      rowsStart,
      nextDecl === -1 ? undefined : nextDecl,
    );
    expect(rowsBody).not.toContain("tokenHash");
  });

  it("keeps the recovery caller-facing views free of raw principals and internal ids", () => {
    // MyRecoveryRequestView is the minimum caller-facing projection: display
    // name, status, timestamps, and optional quorum counts only.
    const viewStart = recoveryTypes.indexOf(
      "public type MyRecoveryRequestView = {",
    );
    expect(viewStart).toBeGreaterThan(-1);
    const viewEnd = recoveryTypes.indexOf("};", viewStart);
    const view = recoveryTypes.slice(viewStart, viewEnd);
    for (const forbidden of [
      "ownerAccountId",
      "replacementAccountId",
      "requestedByAccountId",
      "recoveryId",
      "familyId",
      "personId",
    ]) {
      expect(view).not.toContain(forbidden);
    }

    // RecoveryAuditView is the family-safe audit projection: labels and a
    // timestamp, never the raw actor principal or affected person ids.
    const auditStart = recoveryTypes.indexOf(
      "public type RecoveryAuditView = {",
    );
    expect(auditStart).toBeGreaterThan(-1);
    const auditEnd = recoveryTypes.indexOf("};", auditStart);
    const audit = recoveryTypes.slice(auditStart, auditEnd);
    for (const forbidden of [
      "actorAccountId",
      "affectedPersonIds",
      "recoveryId",
      "familyId",
      "id :",
    ]) {
      expect(audit).not.toContain(forbidden);
    }
  });

  it("keeps account authentication data limited to provider booleans", () => {
    // The account row exposes only which providers are bound; there is no
    // password, token, or credential field anywhere in the account model.
    const rowStart = accountIdentityTypes.indexOf("public type AccountRow = {");
    expect(rowStart).toBeGreaterThan(-1);
    const rowEnd = accountIdentityTypes.indexOf("};", rowStart);
    const row = accountIdentityTypes.slice(rowStart, rowEnd);
    expect(row).toContain("google : Bool;");
    expect(row).toContain("apple : Bool;");
    for (const forbidden of [
      "password",
      "token",
      "secret",
      "credential",
      "hash",
    ]) {
      expect(row.toLowerCase()).not.toContain(forbidden);
    }
  });
});

// ---------------------------------------------------------------------------
// C. The family-scoped read endpoints the export will draw from are present.
//
// The generated service interface is the consumer seam the app compiles
// against. The export will read the same family-scoped surfaces; a bindgen
// regression that drops one would silently change what an export can contain.
// ---------------------------------------------------------------------------

describe("family-scoped read endpoints the export draws from (characterization)", () => {
  it("keeps the family-scoped read endpoints on the generated service", () => {
    const service = readFileSync(path.join(here, "backend.ts"), "utf8");
    for (const method of [
      "getFamily(",
      "getPersonProfileForFamily(",
      "listProfileClaimsForFamily(",
      "listApprovedArchiveItemsForFamily(",
      "listStoriesForFamily(",
      "listMysteriesForFamily(",
      "listRecipesForFamily(",
      "listBoardPostsForFamily(",
      "listNotificationsForFamily(",
      "listMyRecoveryRequestsForFamily(",
    ]) {
      expect(service).toContain(method);
    }
  });

  it("keeps the family-scoped read endpoints declared in the backend mixins", () => {
    // The mixin declarations are the source the bindings are generated from.
    const mixinSources = [
      "family-api.mo",
      "ownership-api.mo",
      "archive-api.mo",
      "family-history-scope-api.mo",
      "mystery-scope-api.mo",
      "recipes-scope-api.mo",
      "board-scope-api.mo",
      "notifications-scope-api.mo",
      "recovery-api.mo",
    ]
      .map((file) => stripComments(readBackend(path.join("mixins", file))))
      .join("\n");
    for (const signature of [
      "func getFamily(",
      "func getPersonProfileForFamily(",
      "func listProfileClaimsForFamily(",
      "func listApprovedArchiveItemsForFamily(",
      "func listStoriesForFamily(",
      "func listMysteriesForFamily(",
      "func listRecipesForFamily(",
      "func listBoardPostsForFamily(",
      "func listNotificationsForFamily(",
      "func listMyRecoveryRequestsForFamily(",
    ]) {
      expect(mixinSources).toContain(signature);
    }
  });
});

// ---------------------------------------------------------------------------
// D. The existing type modules remain intact and additive.
//
// The export types are fitted to these modules. The records export will
// classify must still be declared, and the family boundary must still be
// carried on each persisted record.
// ---------------------------------------------------------------------------

describe("existing type modules the export is fitted to (characterization)", () => {
  it("keeps the family boundary on the core persisted records", () => {
    // PersonProfile, ProfileClaim, Relationship, and Notification all carry
    // familyId; the export's per-family classification depends on it.
    for (const declaration of [
      "public type PersonProfile = {",
      "public type ProfileClaim = {",
      "public type Relationship = {",
      "public type Notification = {",
    ]) {
      expect(ownershipTypes).toContain(declaration);
    }
    expect(ownershipTypes).toContain("familyId : Text;");
  });

  it("keeps the archive, family-history, and account records declared", () => {
    expect(archiveTypes).toContain("public type ArchiveItem = {");
    expect(archiveTypes).toContain("familyId : Text;");
    expect(familyHistoryTypes).toContain("public type Story = {");
    expect(familyHistoryTypes).toContain("public type Mystery = {");
    expect(familyHistoryTypes).toContain("familyId : FamilyId;");
    expect(accountIdentityTypes).toContain("public type Account = {");
  });

  it("keeps the family-scoped aliases assignable on the generated bindings", () => {
    // The generated consumer types the export will be written against.
    const familyId: FamilyId = "norwood";
    const personId: PersonId = "clayton";
    const accountId: AccountId = "2vxsx-fae" as unknown as AccountId;
    expect(familyId).toBe("norwood");
    expect(personId).toBe("clayton");
    expect(accountId).toBeDefined();
  });
});
