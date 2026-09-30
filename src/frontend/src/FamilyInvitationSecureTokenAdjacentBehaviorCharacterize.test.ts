import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Characterization baseline for the FamilyInvitation secure-token change.
//
// The requested change replaces the deterministic invite-token generator with
// IC secure randomness, makes the duplicate-pending lookup expiry-aware, gives
// a resend a fresh expiry, tightens acceptance's membership reuse to a
// same-personId `#Pending` membership, and widens the claimed-profile rule to
// `claimedByUserId` / canonical approved ownership.
//
// Those five behaviors are exactly what the change is FOR, so this file
// deliberately does NOT freeze them. What it protects is the ADJACENT
// FamilyInvitation behavior the change must leave intact:
//
//   A. The public API surface: the same seven endpoints with the same
//      signatures, wired to the same stable collections.
//   B. Token secrecy: only a digest is persisted, the raw token is returned
//      once, and the OQL row never exposes the digest.
//   C. Token resolution: a wrong/unknown/empty token never resolves, and a
//      non-`#Pending` invitation can never be validated or accepted.
//   D. Authority: anonymous callers are rejected, unauthorized callers are
//      rejected, and authority is checked before the target's family
//      membership.
//   E. Family scoping: an invitation id from another family never resolves,
//      and a target outside the family is rejected.
//   F. Acceptance establishes onboarding only: at most a `#Pending`
//      membership, never Steward authority, and never auto-activation.
//   G. The `#AlreadyMember` rule for a target with an active membership owner.
//   H. The founding-Steward invitation links to the existing nomination and
//      grants no Steward authority at creation.
//   I. The migration is a no-op for existing data and the default Norwood
//      family is untouched.
//
// This is a static-source characterization, not a real-canister run: the
// PocketIC lane cannot drive the backend without a compiled wasm, and the
// frontend suite mocks the actor. The real canister's behavior is covered by
// the PocketIC lane when a compiled wasm is present (see the episode's
// coverageLimits).
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

const invitationLib = stripComments(
  readBackend(path.join("lib", "family-invitation.mo")),
);
const invitationTypes = stripComments(
  readBackend(path.join("types", "family-invitation.mo")),
);
const invitationApi = stripComments(
  readBackend(path.join("mixins", "family-invitation-api.mo")),
);
const mainSource = stripComments(readBackend("main.mo"));
const invitationMigration = readBackend(
  path.join("migrations", "20261005_000000.mo"),
);

/** The body of one public library function, from its signature to the next. */
function libFunctionBody(name: string, nextName: string): string {
  const start = invitationLib.indexOf(`public func ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const end = invitationLib.indexOf(`public func ${nextName}(`, start);
  expect(end).toBeGreaterThan(start);
  return invitationLib.slice(start, end);
}

// ---------------------------------------------------------------------------
// A. The public API surface is unchanged.
//
// The change is internal to token generation, expiry handling, and acceptance
// reuse. It must not add, remove, or re-signature a public endpoint, and it
// must not rewire the mixin to a different stable collection.
// ---------------------------------------------------------------------------

describe("the FamilyInvitation public API surface is unchanged", () => {
  it("keeps all seven public endpoints with their exact signatures", () => {
    for (const signature of [
      "public shared ({ caller }) func createFamilyInvitation(",
      "public shared ({ caller }) func createFoundingStewardInvitation(",
      "public query func validateFamilyInvitationToken(",
      "public shared ({ caller }) func acceptFamilyInvitation(",
      "public shared ({ caller }) func declineFamilyInvitation(",
      "public shared ({ caller }) func cancelFamilyInvitation(",
      "public shared ({ caller }) func resendFamilyInvitation(",
    ]) {
      expect(invitationApi).toContain(signature);
    }
  });

  it("keeps the create endpoint's (familyId, personId, invitedEmail) shape", () => {
    const start = invitationApi.indexOf(
      "public shared ({ caller }) func createFamilyInvitation(",
    );
    const end = invitationApi.indexOf(
      "public shared ({ caller }) func createFoundingStewardInvitation(",
      start,
    );
    const body = invitationApi.slice(start, end);
    expect(body).toContain("familyId : Text,");
    expect(body).toContain("personId : Text,");
    expect(body).toContain("invitedEmail : ?Text,");
  });

  it("keeps the resend endpoint's (familyId, personId, invitationType) shape", () => {
    const start = invitationApi.indexOf(
      "public shared ({ caller }) func resendFamilyInvitation(",
    );
    const body = invitationApi.slice(start);
    expect(body).toContain("familyId : Text,");
    expect(body).toContain("personId : Text,");
    expect(body).toContain("invitationType : InvitationTypes.InvitationType,");
  });

  it("keeps the mixin wired to the invitation collections and the shared stable state", () => {
    expect(mainSource).toContain(
      "include FamilyInvitationApi(invitations, invitationState, families, profiles, claims, memberships, stewards, foundingStewardNominations);",
    );
  });

  it("keeps the invitation stable collections and the id counter", () => {
    expect(mainSource).toContain(
      "let invitations : List.List<FamilyInvitationTypes.FamilyInvitation>;",
    );
    expect(mainSource).toContain(
      "let invitationState : { var nextInvitationId : Nat };",
    );
  });
});

// ---------------------------------------------------------------------------
// B. Token secrecy is unchanged.
//
// The change swaps the token SOURCE, not the persistence contract: only a
// digest is stored, the raw token is returned once, and the digest is never
// exposed through the OQL row.
// ---------------------------------------------------------------------------

describe("token secrecy is unchanged", () => {
  it("persists only a token digest on the record, never a raw token field", () => {
    const start = invitationTypes.indexOf("public type FamilyInvitation = {");
    expect(start).toBeGreaterThan(-1);
    const end = invitationTypes.indexOf("};", start);
    const record = invitationTypes.slice(start, end);
    expect(record).toContain("tokenHash : Text;");
    expect(record).not.toMatch(/\brawToken\s*:/u);
  });

  it("returns the raw token exactly once from the create result", () => {
    const start = invitationTypes.indexOf(
      "public type FamilyInvitationCreated = {",
    );
    expect(start).toBeGreaterThan(-1);
    const end = invitationTypes.indexOf("};", start);
    const created = invitationTypes.slice(start, end);
    expect(created).toContain("rawToken : Text;");
    expect(created).toContain("invitation : FamilyInvitation;");
    expect(created).toContain("created : Bool;");
  });

  it("stores the digest of the generated token, not the token itself", () => {
    // The create path digests the generated raw token before storing it. The
    // accepted change replaced the weak modulo hash with the SHA-256 digest
    // facility, so the persisted value is `RandomLib.digestToken(rawToken)`.
    expect(invitationLib).toContain(
      "tokenHash = RandomLib.digestToken(rawToken);",
    );
  });

  it("never exposes the token digest through the OQL row", () => {
    const start = invitationTypes.indexOf(
      "public type FamilyInvitationRow = {",
    );
    expect(start).toBeGreaterThan(-1);
    const end = invitationTypes.indexOf("};", start);
    const row = invitationTypes.slice(start, end);
    expect(row).not.toContain("tokenHash");
    // The row builder likewise never copies the digest. Bound the body by the
    // next function rather than a comment marker, which `stripComments` removes.
    const rowsStart = invitationLib.indexOf("public func invitationRows(");
    expect(rowsStart).toBeGreaterThan(-1);
    const rowsEnd = invitationLib.indexOf("func createInvitation(", rowsStart);
    expect(rowsEnd).toBeGreaterThan(rowsStart);
    expect(invitationLib.slice(rowsStart, rowsEnd)).not.toContain("tokenHash");
  });

  it("keeps the familyInvitation OQL entity controller-only", () => {
    const start = mainSource.indexOf('"familyInvitation",');
    expect(start).toBeGreaterThan(-1);
    const end = mainSource.indexOf(".build(),", start);
    const entity = mainSource.slice(start, end);
    expect(entity).toContain(".controllerOnly()");
  });
});

// ---------------------------------------------------------------------------
// C. Token resolution is unchanged.
//
// A wrong, unknown, or empty token never resolves; a non-`#Pending`
// invitation can never be validated or accepted. The change must not weaken
// any of these.
// ---------------------------------------------------------------------------

describe("token resolution is unchanged", () => {
  it("resolves a token only by its digest and never resolves an empty token", () => {
    const start = invitationLib.indexOf("func resolveToken(");
    expect(start).toBeGreaterThan(-1);
    const end = invitationLib.indexOf("func isExpired(", start);
    const body = invitationLib.slice(start, end);
    expect(body).toContain("rawToken.size() == 0");
    // Resolution compares the stored digest of the presented token. The
    // accepted change replaced the weak modulo hash with the SHA-256 digest
    // facility, so lookup is by `RandomLib.digestToken(rawToken)`.
    expect(body).toContain(
      "getInvitationByTokenHash(invitations, RandomLib.digestToken(rawToken))",
    );
  });

  it("returns #InvalidToken from validate for a token that does not resolve", () => {
    const body = libFunctionBody(
      "validateFamilyInvitationToken",
      "acceptFamilyInvitation",
    );
    expect(body).toContain("return #err(#InvalidToken)");
  });

  it("returns #InvalidToken from validate for a non-#Pending invitation", () => {
    const body = libFunctionBody(
      "validateFamilyInvitationToken",
      "acceptFamilyInvitation",
    );
    expect(body).toContain("invitation.status != #Pending");
  });

  it("returns #InvalidTransition from accept for a non-#Pending invitation", () => {
    const body = libFunctionBody(
      "acceptFamilyInvitation",
      "declineFamilyInvitation",
    );
    expect(body).toContain("invitation.status != #Pending");
    expect(body).toContain("return #err(#InvalidTransition)");
  });

  it("returns #InvalidTransition from decline for a non-#Pending invitation", () => {
    const body = libFunctionBody(
      "declineFamilyInvitation",
      "cancelFamilyInvitation",
    );
    expect(body).toContain("invitation.status != #Pending");
    expect(body).toContain("return #err(#InvalidTransition)");
  });

  it("keeps the #Expired status variant and never deletes an expired record", () => {
    const start = invitationTypes.indexOf("public type InvitationStatus = {");
    const end = invitationTypes.indexOf("};", start);
    expect(invitationTypes.slice(start, end)).toContain("#Expired;");
    // Expiry only returns an error; the record is preserved for audit.
    expect(invitationLib).not.toContain("invitations.remove(");
  });
});

// ---------------------------------------------------------------------------
// D. Authority is unchanged.
//
// Anonymous callers are rejected, unauthorized callers are rejected, and the
// authority check precedes the target's family-membership check so an
// unauthorized caller never learns whether the target belongs to the family.
// ---------------------------------------------------------------------------

describe("invitation authority is unchanged", () => {
  it("rejects an anonymous caller on create, accept, decline, cancel, and resend", () => {
    for (const [name, next] of [
      ["acceptFamilyInvitation", "declineFamilyInvitation"],
      ["declineFamilyInvitation", "cancelFamilyInvitation"],
      ["cancelFamilyInvitation", "resendFamilyInvitation"],
      ["resendFamilyInvitation", "invitationRows"],
    ] as const) {
      const body = libFunctionBody(name, next);
      expect(body).toContain("caller.isAnonymous()");
      expect(body).toContain("return #err(#NotSignedIn)");
    }
    // The shared create path (used by both create endpoints) rejects anonymous.
    const createStart = invitationLib.indexOf("func createInvitation(");
    const createEnd = invitationLib.indexOf(
      "func isInviterAuthorized(",
      createStart,
    );
    const createBody = invitationLib.slice(createStart, createEnd);
    expect(createBody).toContain("caller.isAnonymous()");
    expect(createBody).toContain("return #err(#NotSignedIn)");
  });

  it("rejects an unauthorized caller from creating an invitation", () => {
    const createStart = invitationLib.indexOf("func createInvitation(");
    const createEnd = invitationLib.indexOf(
      "func isInviterAuthorized(",
      createStart,
    );
    const createBody = invitationLib.slice(createStart, createEnd);
    expect(createBody).toContain("isInviterAuthorized(");
    expect(createBody).toContain("return #err(#NotAuthorized)");
  });

  it("checks inviter authority before the target's family membership", () => {
    const createStart = invitationLib.indexOf("func createInvitation(");
    const createEnd = invitationLib.indexOf(
      "func isInviterAuthorized(",
      createStart,
    );
    const createBody = invitationLib.slice(createStart, createEnd);
    const authority = createBody.indexOf("isInviterAuthorized(");
    const familyCheck = createBody.indexOf("isPersonInFamily(");
    expect(authority).toBeGreaterThan(-1);
    expect(familyCheck).toBeGreaterThan(-1);
    expect(authority).toBeLessThan(familyCheck);
  });

  it("requires the same authority for resend as for create", () => {
    const body = libFunctionBody("resendFamilyInvitation", "invitationRows");
    expect(body).toContain("isInviterAuthorized(");
    expect(body).toContain("return #err(#NotAuthorized)");
  });

  it("lets only the inviter or an active Steward cancel", () => {
    const body = libFunctionBody(
      "cancelFamilyInvitation",
      "resendFamilyInvitation",
    );
    expect(body).toContain("invitation.invitedByAccountId != caller");
    expect(body).toContain("isActiveStewardForFamily(");
    expect(body).toContain("return #err(#NotAuthorized)");
  });
});

// ---------------------------------------------------------------------------
// E. Family scoping is unchanged.
//
// An invitation id from another family never resolves, and a target outside
// the family is rejected. The change must not loosen either boundary.
// ---------------------------------------------------------------------------

describe("family scoping is unchanged", () => {
  it("resolves an invitation id only within its own family", () => {
    const start = invitationLib.indexOf("public func getInvitationForFamily(");
    expect(start).toBeGreaterThan(-1);
    const end = invitationLib.indexOf(
      "public func getInvitationByTokenHash(",
      start,
    );
    const body = invitationLib.slice(start, end);
    expect(body).toContain("i.familyId == familyId and i.id == invitationId");
  });

  it("rejects a target profile that does not belong to the family", () => {
    const createStart = invitationLib.indexOf("func createInvitation(");
    const createEnd = invitationLib.indexOf(
      "func isInviterAuthorized(",
      createStart,
    );
    const createBody = invitationLib.slice(createStart, createEnd);
    expect(createBody).toContain(
      "isPersonInFamily(profiles, claims, personId, familyId)",
    );
    expect(createBody).toContain("return #err(#PersonNotInFamily)");
  });

  it("rejects a create for a family that does not exist", () => {
    const createStart = invitationLib.indexOf("func createInvitation(");
    const createEnd = invitationLib.indexOf(
      "func isInviterAuthorized(",
      createStart,
    );
    const createBody = invitationLib.slice(createStart, createEnd);
    expect(createBody).toContain("families.get(familyId) == null");
    expect(createBody).toContain("return #err(#FamilyNotFound)");
  });
});

// ---------------------------------------------------------------------------
// F. Acceptance establishes onboarding only.
//
// The change tightens WHICH membership acceptance may reuse; it must not turn
// acceptance into an activation or a Steward grant.
// ---------------------------------------------------------------------------

describe("acceptance establishes onboarding only", () => {
  it("creates or reuses a #Pending membership and never auto-activates", () => {
    const body = libFunctionBody(
      "acceptFamilyInvitation",
      "declineFamilyInvitation",
    );
    expect(body).toContain("ensurePendingMembership(");
    expect(body).not.toContain("activateMembershipForFamily");
    expect(body).not.toContain("stewards.add(");
  });

  it("marks the invitation #Accepted only after the membership step succeeds", () => {
    const body = libFunctionBody(
      "acceptFamilyInvitation",
      "declineFamilyInvitation",
    );
    const membership = body.indexOf("ensurePendingMembership(");
    const accepted = body.indexOf("status = #Accepted;");
    expect(membership).toBeGreaterThan(-1);
    expect(accepted).toBeGreaterThan(membership);
  });

  it("the invitation mixin never writes a StewardRecord", () => {
    expect(invitationApi).not.toContain("stewards.add(");
    expect(invitationApi).not.toContain("claimSteward");
  });
});

// ---------------------------------------------------------------------------
// G. The #AlreadyMember rule for an active membership owner is unchanged.
// ---------------------------------------------------------------------------

describe("the active-membership-owner rule is unchanged", () => {
  it("returns #AlreadyMember for a target with an active membership owner", () => {
    const createStart = invitationLib.indexOf("func createInvitation(");
    const createEnd = invitationLib.indexOf(
      "func isInviterAuthorized(",
      createStart,
    );
    const createBody = invitationLib.slice(createStart, createEnd);
    expect(createBody).toContain("hasActiveMembershipOwnerForPerson(");
    expect(createBody).toContain("return #ok(#AlreadyMember);");
  });

  it("rejects acceptance when the target already has an active membership owner", () => {
    const body = libFunctionBody(
      "acceptFamilyInvitation",
      "declineFamilyInvitation",
    );
    expect(body).toContain("hasActiveMembershipOwnerForPerson(");
    expect(body).toContain("return #err(#AlreadyMember)");
  });
});

// ---------------------------------------------------------------------------
// H. The founding-Steward invitation is unchanged.
//
// It links to the existing nomination and grants no Steward authority at
// creation; the nominee still becomes Steward only through the existing
// authenticated acceptance rule.
// ---------------------------------------------------------------------------

describe("the founding-Steward invitation is unchanged", () => {
  it("requires an existing pending nomination for the family and nominee", () => {
    const start = invitationLib.indexOf(
      "public func createFoundingStewardInvitation(",
    );
    expect(start).toBeGreaterThan(-1);
    const end = invitationLib.indexOf(
      "public func validateFamilyInvitationToken(",
      start,
    );
    const body = invitationLib.slice(start, end);
    expect(body).toContain(
      "findPendingNomination(nominations, familyId, personId)",
    );
    expect(body).toContain("return #err(#NominationNotFound)");
    expect(body).toContain("return #err(#NomineeMismatch)");
  });

  it("authorizes only the founder or an active Steward of the family", () => {
    const start = invitationLib.indexOf(
      "public func createFoundingStewardInvitation(",
    );
    const end = invitationLib.indexOf(
      "public func validateFamilyInvitationToken(",
      start,
    );
    const body = invitationLib.slice(start, end);
    expect(body).toContain("isFounderOfFamily(families, caller, familyId)");
    expect(body).toContain(
      "isActiveStewardForFamily(stewards, caller, familyId)",
    );
    expect(body).toContain("return #err(#NotAuthorized)");
  });

  it("keeps the #FoundingSteward invitation type distinct from #FamilyMember", () => {
    const start = invitationTypes.indexOf("public type InvitationType = {");
    const end = invitationTypes.indexOf("};", start);
    const type = invitationTypes.slice(start, end);
    expect(type).toContain("#FamilyMember;");
    expect(type).toContain("#FoundingSteward;");
    expect(type).not.toContain("#Steward;");
  });
});

// ---------------------------------------------------------------------------
// I. The migration is a no-op for existing data.
//
// The change is internal to the invitation library; it must not alter the
// migration's additive shape or touch the default Norwood family.
// ---------------------------------------------------------------------------

describe("the invitation migration remains a no-op for existing data", () => {
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
    const body = stripComments(invitationMigration);
    expect(body).not.toContain("norwood");
    expect(body).not.toContain("families");
    expect(body).not.toContain("memberships");
    expect(body).not.toContain("stewards");
    expect(body).not.toContain("profiles");
    expect(body).not.toContain("claims");
  });

  it("declares an empty OldActor so the preceding migration's state carries through", () => {
    expect(invitationMigration).toContain("type OldActor = {};");
  });
});
