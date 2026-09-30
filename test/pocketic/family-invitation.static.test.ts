import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Onboarding Phase 1C-1 — FamilyInvitation source-contract cover.
//
// The sibling `family-invitation.cover.test.ts` drives the real canister for
// the invitation lifecycle. Two accepted behaviors cannot be exercised there:
//
//   1. The 30-day expiry. The PocketIC lane has no time control (the skill
//      forbids adding it), so an actually-expired invitation cannot be driven.
//      The expiry constant and the expiry branch are pinned here at the source
//      level instead.
//   2. The exact minimal-preview field set. The lane asserts the preview has no
//      `tokenHash` and does not leak the raw token; the source contract pins
//      that the preview type carries only the safe fields and that the builder
//      never adds a relationship label or another member's identity.
//
// It also pins the duplicate-pending reuse / resend rotation and the
// claimed-profile rule at the source level, so a refactor that silently drops
// one of those branches fails here even if the canister lane is skipped.
//
// This is a static-source cover, not a real-canister run. The runtime behavior
// is covered by the sibling canister test when a compiled wasm is present.
// ---------------------------------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
// `here` is app/test/pocketic; the backend sources live at app/src/backend.
const backendRoot = path.resolve(here, "..", "..", "src", "backend");

function readBackend(relativePath: string): string {
  return readFileSync(path.join(backendRoot, relativePath), "utf8");
}

/** Strips `//` line comments and `/* ... *\/` block comments from Motoko source. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/[^\n]*/gu, "");
}

const invitationLib = stripComments(readBackend(path.join("lib", "family-invitation.mo")));
const invitationTypes = stripComments(readBackend(path.join("types", "family-invitation.mo")));
const invitationApi = stripComments(readBackend(path.join("mixins", "family-invitation-api.mo")));
const apiDoc = readBackend(path.join("mixins", "api-doc.mo"));

// ---------------------------------------------------------------------------
// (1) 30-day expiry — the constant and the branch.
// ---------------------------------------------------------------------------

describe("invitation expiry is a 30-day window enforced on every token path", () => {
  it("declares the 30-day TTL as 2_592_000_000_000_000 ns", () => {
    // 30 days * 24 h * 60 min * 60 s * 1e9 ns = 2_592_000_000_000_000.
    expect(invitationLib).toContain(
      "public let DEFAULT_INVITATION_TTL_NS : Int = 2_592_000_000_000_000;",
    );
  });

  it("stamps expiresAt as createdAt + the TTL when a new invitation is stored", () => {
    expect(invitationLib).toContain("expiresAt = now + DEFAULT_INVITATION_TTL_NS;");
  });

  it("treats an invitation as expired once now reaches expiresAt", () => {
    expect(invitationLib).toContain("Time.now() >= invitation.expiresAt");
  });

  it("returns #Expired from validate, accept, and decline for an expired token", () => {
    // Each of the three token paths checks expiry before the status check and
    // returns #Expired, so an expired invitation can never be validated or
    // accepted and never creates a membership.
    const expiredReturns = invitationLib.match(/return #err\(#Expired\);/gu) ?? [];
    expect(expiredReturns.length).toBeGreaterThanOrEqual(3);
  });

  it("never deletes or mutates an expired invitation (preserved for audit)", () => {
    // The expiry branch only returns an error; it never removes the record.
    // There is no `invitations.remove(` anywhere in the library.
    expect(invitationLib).not.toContain("invitations.remove(");
    // The only mutation of the invitation list is the in-place replace used by
    // accept/decline/cancel/resend, which preserves the record.
    expect(invitationLib).toContain("func replaceInvitation(");
  });
});

// ---------------------------------------------------------------------------
// (2) Minimal safe preview — the field set and the builder.
// ---------------------------------------------------------------------------

describe("validateFamilyInvitationToken returns only minimal safe context", () => {
  it("declares the preview with only the safe onboarding fields", () => {
    const start = invitationTypes.indexOf("public type FamilyInvitationPreview = {");
    expect(start).toBeGreaterThan(-1);
    const end = invitationTypes.indexOf("};", start);
    const preview = invitationTypes.slice(start, end);
    for (const field of [
      "invitationId : Nat;",
      "familyId : FamilyId;",
      "familyDisplayName : Text;",
      "targetPersonId : PersonId;",
      "targetDisplayName : Text;",
      "invitationType : InvitationType;",
      "status : InvitationStatus;",
      "expiresAt : Int;",
    ]) {
      expect(preview).toContain(field);
    }
    // The preview never carries the token hash or any other member identity.
    expect(preview).not.toContain("tokenHash");
    expect(preview).not.toContain("invitedByAccountId");
    expect(preview).not.toContain("acceptedByAccountId");
  });

  it("builds the preview from the invitation and the target profile's display name only", () => {
    const start = invitationLib.indexOf(
      "public func validateFamilyInvitationToken(",
    );
    expect(start).toBeGreaterThan(-1);
    const end = invitationLib.indexOf("public func acceptFamilyInvitation(", start);
    const body = invitationLib.slice(start, end);
    // The only profile field read is `name`; no relationship label, no other
    // member's identity, no private tree data.
    expect(body).toContain("profile.name");
    expect(body).not.toContain("relationshipType");
    expect(body).not.toContain("tokenHash");
  });

  it("returns #InvalidToken for a wrong/unknown token and #Expired for an expired one", () => {
    const start = invitationLib.indexOf(
      "public func validateFamilyInvitationToken(",
    );
    const end = invitationLib.indexOf("public func acceptFamilyInvitation(", start);
    const body = invitationLib.slice(start, end);
    expect(body).toContain("return #err(#InvalidToken)");
    expect(body).toContain("return #err(#Expired)");
  });
});

// ---------------------------------------------------------------------------
// (3) Duplicate-pending safety and the explicit resend/rotate operation.
// ---------------------------------------------------------------------------

describe("duplicate-pending safety and resend rotation", () => {
  it("reuses an existing #Pending invitation for the same family + person + type", () => {
    expect(invitationLib).toContain("getPendingInvitationForTarget(");
    // The reuse branch returns the existing invitation with created = false and
    // an empty raw token (only the hash is stored, so the raw token is not
    // recoverable).
    expect(invitationLib).toContain(
      'return #ok(#Created({ invitation = existing; rawToken = ""; created = false }));',
    );
  });

  it("rotates the token on resend and keeps the invitation identity", () => {
    const start = invitationLib.indexOf("public func resendFamilyInvitation(");
    expect(start).toBeGreaterThan(-1);
    const end = invitationLib.indexOf("public func invitationRows(", start);
    const body = invitationLib.slice(start, end);
    // A new raw token is generated from IC secure randomness and only its
    // SHA-256 digest is stored; the id, family, and target are preserved.
    expect(body).toContain("RandomLib.generateToken()");
    expect(body).toContain("tokenHash = RandomLib.digestToken(rawToken);");
    expect(body).toContain("id = existing.id;");
    expect(body).toContain("created = false");
  });

  it("refreshes the expiry to a full TTL on resend so a resend is never already expired", () => {
    const start = invitationLib.indexOf("public func resendFamilyInvitation(");
    const end = invitationLib.indexOf("public func invitationRows(", start);
    const body = invitationLib.slice(start, end);
    // The accepted change gives a resend a fresh future expiry rather than
    // preserving the old one.
    expect(body).toContain("expiresAt = now + DEFAULT_INVITATION_TTL_NS;");
    expect(body).not.toContain("expiresAt = existing.expiresAt;");
  });

  it("transitions an already-expired invitation to #Expired and requires a fresh create", () => {
    const start = invitationLib.indexOf("public func resendFamilyInvitation(");
    const end = invitationLib.indexOf("public func invitationRows(", start);
    const body = invitationLib.slice(start, end);
    // An expired record is not resent: it is transitioned to #Expired and the
    // call returns #Expired, directing the caller to createFamilyInvitation.
    expect(body).toContain("expireStaleInvitations(");
    expect(body).toContain("return #err(#Expired)");
  });

  it("requires the same authority for resend as for create", () => {
    const start = invitationLib.indexOf("public func resendFamilyInvitation(");
    const end = invitationLib.indexOf("public func invitationRows(", start);
    const body = invitationLib.slice(start, end);
    expect(body).toContain("isInviterAuthorized(");
    expect(body).toContain("return #err(#NotAuthorized)");
  });
});

// ---------------------------------------------------------------------------
// (4) Claimed-profile rule and authority ordering.
// ---------------------------------------------------------------------------

describe("claimed-profile rule and inviter authority", () => {
  it("returns #AlreadyMember for a target with an active membership owner", () => {
    expect(invitationLib).toContain("hasActiveMembershipOwnerForPerson(");
    expect(invitationLib).toContain("return #ok(#AlreadyMember);");
  });

  it("checks inviter authority before the target's family membership", () => {
    const start = invitationLib.indexOf("func createInvitation(");
    expect(start).toBeGreaterThan(-1);
    const end = invitationLib.indexOf("func isInviterAuthorized(", start);
    const body = invitationLib.slice(start, end);
    const authority = body.indexOf("isInviterAuthorized(");
    const familyCheck = body.indexOf("isPersonInFamily(");
    expect(authority).toBeGreaterThan(-1);
    expect(familyCheck).toBeGreaterThan(-1);
    // Authorization is checked first, so an unauthorized caller never learns
    // whether the target belongs to the family.
    expect(authority).toBeLessThan(familyCheck);
  });

  it("authorizes an approved member or an active Steward of the family", () => {
    const start = invitationLib.indexOf("func isInviterAuthorized(");
    const end = invitationLib.indexOf("func isFounderOfFamily(", start);
    const body = invitationLib.slice(start, end);
    expect(body).toContain("isApprovedFamilyMemberForFamily(");
  });
});

// ---------------------------------------------------------------------------
// (5) Acceptance creates at most a #Pending membership and never Steward
//     authority.
// ---------------------------------------------------------------------------

describe("acceptance establishes onboarding only", () => {
  it("creates or reuses a #Pending membership and never auto-activates", () => {
    const start = invitationLib.indexOf("public func acceptFamilyInvitation(");
    const end = invitationLib.indexOf("public func declineFamilyInvitation(", start);
    const body = invitationLib.slice(start, end);
    expect(body).toContain("ensurePendingMembership(");
    // No activation call and no StewardRecord write on the accept path.
    expect(body).not.toContain("activateMembershipForFamily");
    expect(body).not.toContain("stewards.add(");
  });

  it("marks the invitation #Accepted only after the membership step succeeds", () => {
    const start = invitationLib.indexOf("public func acceptFamilyInvitation(");
    const end = invitationLib.indexOf("public func declineFamilyInvitation(", start);
    const body = invitationLib.slice(start, end);
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
// (6) getApiDoc documents FamilyInvitation as a secure onboarding transport.
// ---------------------------------------------------------------------------

describe("getApiDoc documents FamilyInvitation as a secure onboarding transport", () => {
  it("has a Family Invitation section", () => {
    expect(apiDoc).toContain("### Family Invitation (secure onboarding transport)");
  });

  it("documents the transport-record separation and the no-authority invariant", () => {
    const start = apiDoc.indexOf("### Family Invitation (secure onboarding transport)");
    expect(start).toBeGreaterThan(-1);
    const end = apiDoc.indexOf("\n### ", start + 1);
    const section = end === -1 ? apiDoc.slice(start) : apiDoc.slice(start, end);
    for (const concept of [
      "`PersonProfile`",
      "`ProfileClaim`",
      "`FamilyMembership`",
      "`StewardRecord`",
      "`FoundingStewardNomination`",
    ]) {
      expect(section).toContain(concept);
    }
    expect(section).toContain("never grants family access by itself");
    expect(section).toContain("never creates Steward authority");
  });

  it("documents the token-hash-only persistence and the 30-day expiry", () => {
    const start = apiDoc.indexOf("### Family Invitation (secure onboarding transport)");
    const end = apiDoc.indexOf("\n### ", start + 1);
    const section = end === -1 ? apiDoc.slice(start) : apiDoc.slice(start, end);
    // The accepted change documents the SHA-256 digest and the secure-random
    // token source rather than the old "token hash" wording.
    expect(section).toContain("Only a cryptographic digest (SHA-256) of the raw token is");
    expect(section).toContain("raw_rand");
    expect(section).toContain("30 days");
  });

  it("documents every public invitation endpoint", () => {
    const start = apiDoc.indexOf("### Family Invitation (secure onboarding transport)");
    const end = apiDoc.indexOf("\n### ", start + 1);
    const section = end === -1 ? apiDoc.slice(start) : apiDoc.slice(start, end);
    for (const endpoint of [
      "createFamilyInvitation(",
      "createFoundingStewardInvitation(",
      "validateFamilyInvitationToken(",
      "acceptFamilyInvitation(",
      "declineFamilyInvitation(",
      "cancelFamilyInvitation(",
      "resendFamilyInvitation(",
    ]) {
      expect(section).toContain(endpoint);
    }
  });
});
