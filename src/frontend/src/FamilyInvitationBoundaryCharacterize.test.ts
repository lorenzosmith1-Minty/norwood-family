import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Characterization baseline for the Phase 1C-1 FamilyInvitation addition.
//
// The requested change ADDS a new backend model — `FamilyInvitation` — and a
// public invitation surface (`createFamilyInvitation`,
// `createFoundingStewardInvitation`, `validateFamilyInvitationToken`,
// `acceptFamilyInvitation`, `declineFamilyInvitation`, `cancelFamilyInvitation`,
// `resendFamilyInvitation`). Adding that surface is exactly the change under
// way, so this file deliberately does NOT freeze the invitation API's own
// behavior, its stubs, or its absence.
//
// What it protects is the EXISTING behavior the invitation addition must not
// disturb. The requirement is explicit: existing Norwood family tenancy,
// membership, family creation, founding-steward, ProfileClaim, and Steward
// behavior must remain unchanged. The invitation work touches `main.mo` (new
// stable collections, a new mixin include, and — if it follows the pattern of
// every prior phase — a new OQL entity), the migration chain, and the API doc,
// so those are the seams where an unrelated regression can hide:
//
//   A. The pre-existing stable collections keep their exact names and types.
//      A refactor that renames, retypes, or drops one while wiring in
//      `invitations`/`invitationState` breaks every existing record.
//   B. The pre-existing OQL entities keep their names, sources, and
//      controller-only restrictions. The invitation entity, if added, must not
//      displace or reshape an existing one.
//   C. The pre-existing public mixin includes keep their exact argument lists,
//      so the invitation mixin cannot silently rewire an existing endpoint's
//      dependencies.
//   D. The invitation model is a TRANSPORT record, separate from PersonProfile,
//      ProfileClaim, FamilyMembership, StewardRecord, and
//      FoundingStewardNomination, and acceptance grants no Steward authority.
//   E. The invitation migration is a no-op for existing data: it introduces only
//      the two new stable fields and never reads, reseeds, or resets the
//      pre-existing collections or the default Norwood family.
//
// This is a static-source characterization, not a real-canister run: the
// PocketIC lane cannot drive the backend without a compiled wasm, and the
// frontend suite mocks the actor. The real canister's existing behavior is
// covered by the PocketIC lane when a compiled wasm is present (see the
// episode's coverageLimits).
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

const mainSource = stripComments(readBackend("main.mo"));
// The separation prose lives in `///` doc comments, so the raw source is kept
// alongside the comment-stripped form used for code assertions.
const invitationTypesRaw = readBackend(
  path.join("types", "family-invitation.mo"),
);
const invitationTypes = stripComments(invitationTypesRaw);
const invitationMigration = readBackend(
  path.join("migrations", "20261005_000000.mo"),
);
const invitationApi = stripComments(
  readBackend(path.join("mixins", "family-invitation-api.mo")),
);

// ---------------------------------------------------------------------------
// A. The pre-existing stable collections are unchanged.
//
// The invitation addition declares two new stable fields. Every collection that
// existed before it must keep its exact name and type, because a rename or a
// retype silently invalidates the persisted state of every existing record.
// ---------------------------------------------------------------------------

describe("pre-existing stable collections are unchanged (compatibility baseline)", () => {
  it("keeps the family, profile, claim, membership, and Steward collections", () => {
    for (const declaration of [
      "let families : Map.Map<FamilyTypes.FamilyId, FamilyTypes.Family>;",
      "let profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>;",
      "let claims : List.List<OwnershipTypes.ProfileClaim>;",
      "let memberships : List.List<MembershipTypes.FamilyMembership>;",
      "let stewards : List.List<GovernanceTypes.StewardRecord>;",
    ]) {
      expect(mainSource).toContain(declaration);
    }
  });

  it("keeps the family-creation and founding-Steward stable state", () => {
    for (const declaration of [
      "let familyCreationIdempotency : Map.Map<Text, Text>;",
      "let familyCreationState : { var nextFamilyNonce : Nat };",
      "let foundingStewardStates : Map.Map<Text, FoundingStewardTypes.FoundingStewardState>;",
      "let foundingStewardNominations : List.List<FoundingStewardTypes.FoundingStewardNomination>;",
      "let foundingStewardState : { var nextNominationId : Nat };",
    ]) {
      expect(mainSource).toContain(declaration);
    }
  });

  it("adds the invitation collections as new fields without replacing an existing one", () => {
    // The two new stable fields are present and distinct from every
    // pre-existing collection.
    expect(mainSource).toContain(
      "let invitations : List.List<FamilyInvitationTypes.FamilyInvitation>;",
    );
    expect(mainSource).toContain(
      "let invitationState : { var nextInvitationId : Nat };",
    );
    // The invitation list is a separate collection, not a reuse of memberships
    // or nominations.
    expect(mainSource).not.toContain(
      "let invitations : List.List<MembershipTypes.FamilyMembership>;",
    );
    expect(mainSource).not.toContain(
      "let invitations : List.List<FoundingStewardTypes.FoundingStewardNomination>;",
    );
  });
});

// ---------------------------------------------------------------------------
// B. The pre-existing OQL entities are unchanged.
//
// Every prior phase that added a model also added an OQL entity. The invitation
// entity, if added, must sit alongside the existing ones rather than displace
// or reshape them. The existing entities' names, sources, and controller-only
// restrictions are the contract.
// ---------------------------------------------------------------------------

describe("pre-existing OQL entities are unchanged (compatibility baseline)", () => {
  it("keeps the family, membership, and Steward entity registrations", () => {
    expect(mainSource).toContain("OQL.Entity.manual<FamilyTypes.Family>(");
    expect(mainSource).toContain(
      "OQL.Entity.manual<MembershipTypes.MembershipRow>(",
    );
    expect(mainSource).toContain(
      "OQL.Entity.manual<GovernanceTypes.StewardRecord>(",
    );
  });

  it("keeps the familyMembership entity sourced from the canonical projection and controller-only", () => {
    const entityStart = mainSource.indexOf(
      "OQL.Entity.manual<MembershipTypes.MembershipRow>(",
    );
    expect(entityStart).toBeGreaterThan(-1);
    const entityEnd = mainSource.indexOf(".build(),", entityStart);
    expect(entityEnd).toBeGreaterThan(entityStart);
    const entity = mainSource.slice(entityStart, entityEnd);
    expect(entity).toContain(
      "FamilyMembershipLib.membershipRows(memberships).values()",
    );
    expect(entity).toContain(".controllerOnly()");
  });

  it("keeps the founding-Steward entity registrations", () => {
    expect(mainSource).toContain(
      "OQL.Entity.manual<(Text, FoundingStewardTypes.FoundingStewardState)>(",
    );
    expect(mainSource).toContain(
      "OQL.Entity.manual<FoundingStewardTypes.FoundingStewardNomination>(",
    );
  });
});

// ---------------------------------------------------------------------------
// C. The pre-existing public mixin includes are unchanged.
//
// The invitation mixin is added to the actor's include list. Every existing
// include must keep its exact argument list, so the new mixin cannot silently
// rewire an existing endpoint's dependencies.
// ---------------------------------------------------------------------------

describe("pre-existing public mixin includes are unchanged (compatibility baseline)", () => {
  it("keeps the family, membership, creation, and founding-Steward includes", () => {
    for (const include of [
      "include FamilyApi(families);",
      "include FamilyMembershipApi(memberships, profiles, claims, stewards);",
      "include FamilyCreationApi(families, profiles, memberships, familyCreationIdempotency, familyCreationState);",
      "include FoundingStewardApi(families, foundingStewardStates, foundingStewardNominations, foundingStewardState, stewards, memberships, profiles, claims);",
    ]) {
      expect(mainSource).toContain(include);
    }
  });

  it("keeps the ownership, governance, and Steward-authority includes", () => {
    expect(mainSource).toContain(
      "include OwnershipApi(accessControlState, profiles, claims, confirmedRelationships, relationshipRequests, notifications, auditLog, stewards);",
    );
    expect(mainSource).toContain(
      "include StewardAuthorityApi(accessControlState, stewards, auditLog);",
    );
    expect(mainSource).toContain("include GovernanceApi(");
  });

  it("adds the invitation mixin as a new include without replacing an existing one", () => {
    expect(mainSource).toContain("include FamilyInvitationApi(");
    // The invitation mixin is wired to the invitation collections, not to a
    // pre-existing collection under a new name.
    expect(mainSource).toContain(
      "include FamilyInvitationApi(invitations, invitationState,",
    );
  });
});

// ---------------------------------------------------------------------------
// D. The invitation model is a separate transport record.
//
// The accepted separation invariant: FamilyInvitation is distinct from
// PersonProfile, ProfileClaim, FamilyMembership, StewardRecord, and
// FoundingStewardNomination, and acceptance never grants Steward authority.
// ---------------------------------------------------------------------------

describe("FamilyInvitation is a separate transport record (compatibility baseline)", () => {
  it("declares the FamilyInvitation record with its own fields", () => {
    const start = invitationTypes.indexOf("public type FamilyInvitation = {");
    expect(start).toBeGreaterThan(-1);
    const end = invitationTypes.indexOf("};", start);
    const record = invitationTypes.slice(start, end);
    for (const field of [
      "id : Nat;",
      "familyId : FamilyId;",
      "personId : PersonId;",
      "invitedEmail : ?Text;",
      "invitedByAccountId : AccountId;",
      "invitedByPersonId : ?PersonId;",
      "invitationType : InvitationType;",
      "tokenHash : Text;",
      "status : InvitationStatus;",
      "createdAt : Int;",
      "expiresAt : Int;",
      "acceptedAt : ?Int;",
      "acceptedByAccountId : ?AccountId;",
      "cancelledAt : ?Int;",
    ]) {
      expect(record).toContain(field);
    }
  });

  it("persists only the token hash, never the raw token", () => {
    // The record carries `tokenHash`; there is no `rawToken` field on the
    // persisted record. The raw token is returned once from the create result.
    const start = invitationTypes.indexOf("public type FamilyInvitation = {");
    const end = invitationTypes.indexOf("};", start);
    const record = invitationTypes.slice(start, end);
    expect(record).toContain("tokenHash : Text;");
    expect(record).not.toMatch(/\brawToken\s*:/u);
  });

  it("declares the five invitation lifecycle statuses", () => {
    const start = invitationTypes.indexOf("public type InvitationStatus = {");
    expect(start).toBeGreaterThan(-1);
    const end = invitationTypes.indexOf("};", start);
    const status = invitationTypes.slice(start, end);
    for (const variant of [
      "#Pending;",
      "#Accepted;",
      "#Declined;",
      "#Cancelled;",
      "#Expired;",
    ]) {
      expect(status).toContain(variant);
    }
  });

  it("declares the two invitation types without a Steward-authority variant", () => {
    const start = invitationTypes.indexOf("public type InvitationType = {");
    expect(start).toBeGreaterThan(-1);
    const end = invitationTypes.indexOf("};", start);
    const type = invitationTypes.slice(start, end);
    expect(type).toContain("#FamilyMember;");
    expect(type).toContain("#FoundingSteward;");
    // There is no invitation type that grants Steward authority directly.
    expect(type).not.toContain("#Steward;");
  });

  it("documents the separation from the five other onboarding/identity records", () => {
    // The separation prose is a `///` doc comment, so it is asserted against
    // the raw source rather than the comment-stripped form.
    for (const concept of [
      "`PersonProfile`",
      "`ProfileClaim`",
      "`FamilyMembership`",
      "`StewardRecord`",
      "`FoundingStewardNomination`",
    ]) {
      expect(invitationTypesRaw).toContain(concept);
    }
    // The transport-record invariant: an invitation never grants access by
    // itself, and acceptance never creates Steward authority.
    expect(invitationTypesRaw).toContain(
      "never grants family access by itself",
    );
    expect(invitationTypesRaw).toContain("never creates Steward authority");
  });

  it("the invitation API never writes a StewardRecord", () => {
    // The mixin receives the stewards collection for authorization reads only;
    // it must not construct or append a StewardRecord. The type name appears in
    // the mixin's parameter list, so the assertion targets the write paths.
    expect(invitationApi).not.toContain("stewards.add(");
    expect(invitationApi).not.toContain("claimSteward");
    expect(invitationApi).not.toContain("roleStatus = #Active");
  });
});

// ---------------------------------------------------------------------------
// E. The invitation migration is a no-op for existing data.
// ---------------------------------------------------------------------------

describe("invitation migration is a no-op for existing data (compatibility baseline)", () => {
  it("introduces only the invitation list and the invitation-id counter", () => {
    expect(invitationMigration).toContain(
      "invitations : List.List<FamilyInvitation>;",
    );
    expect(invitationMigration).toContain(
      "invitationState : { var nextInvitationId : Nat };",
    );
    expect(invitationMigration).toContain("invitations = List.empty();");
    expect(invitationMigration).toContain("nextInvitationId = 0");
  });

  it("does not read, reseed, or reset the default family or its records", () => {
    // Comments describe the no-op intent; the executable body is what must not
    // touch the pre-existing collections.
    const body = stripComments(invitationMigration);
    expect(body).not.toContain("norwood");
    expect(body).not.toContain("families");
    expect(body).not.toContain("memberships");
    expect(body).not.toContain("stewards");
    expect(body).not.toContain("profiles");
    expect(body).not.toContain("claims");
  });

  it("declares an empty OldActor so the preceding migration's state carries through", () => {
    // Subset form: the migration declares only its own new fields, so every
    // pre-existing stable collection carries through unchanged.
    expect(invitationMigration).toContain("type OldActor = {};");
  });
});
