import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Cover for the FamilyInvitation secure-token change.
//
// The accepted change replaces the deterministic invite-token generator with IC
// secure randomness, makes the duplicate-pending lookup expiry-aware, gives a
// resend a fresh expiry, tightens acceptance's membership reuse to a
// same-personId `#Pending` membership, and widens the claimed-profile rule to
// `claimedByUserId` / canonical approved ownership.
//
// The sibling `FamilyInvitationSecureTokenAdjacentBehaviorCharacterize.test.ts`
// protects the ADJACENT behavior the change must leave intact. This file covers
// the change itself, at the source level, because the PocketIC lane cannot drive
// the backend without a compiled wasm and the frontend suite mocks the actor.
// The real canister's behavior is covered by the PocketIC lane when a compiled
// wasm is present (see the episode's coverageLimits).
//
// What is asserted here:
//
//   1. Token entropy comes from IC secure randomness (`raw_rand`), never from
//      caller principal, invitation id, timestamp, familyId, personId, or email.
//   2. The persisted value is a SHA-256 digest; the weak modulo-1_000_000_007
//      polynomial hash is gone from the invitation path.
//   3. The duplicate-pending lookup ignores an invitation whose
//      `expiresAt <= now`.
//   4. An expired record is transitioned to `#Expired` (preserved, never
//      deleted) before a fresh create, and a resend of an already-expired
//      invitation returns `#Expired`.
//   5. Acceptance reuses the caller's membership only when it is `#Pending` and
//      its `personId` equals the invitation's; otherwise `#AlreadyMember` and
//      the invitation stays `#Pending`.
//   6. The claimed-profile rule treats `claimedByUserId` / an approved claim as
//      already owned, reusing the family-scoped ownership helper.
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

const randomLib = stripComments(readBackend(path.join("lib", "random.mo")));
const invitationLib = stripComments(
  readBackend(path.join("lib", "family-invitation.mo")),
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
// (1) Token entropy comes from IC secure randomness.
// ---------------------------------------------------------------------------

describe("invite tokens come from IC secure randomness", () => {
  it("draws 256 bits (32 bytes) from the management canister raw_rand", () => {
    expect(randomLib).toContain("public let TOKEN_ENTROPY_BYTES : Nat = 32;");
    // `mo:core/Random.blob` is the management canister `raw_rand` binding.
    expect(randomLib).toContain('import Random "mo:core/Random";');
    expect(randomLib).toContain("await Random.blob()");
  });

  it("generates the token from the random bytes and never from caller/record data", () => {
    const start = randomLib.indexOf("public func generateToken(");
    expect(start).toBeGreaterThan(-1);
    const end = randomLib.indexOf("public func digestToken(", start);
    const body = randomLib.slice(start, end);
    expect(body).toContain("Random.blob()");
    // The generator takes no caller/record input at all, so it cannot derive
    // entropy from a principal, id, timestamp, familyId, personId, or email.
    expect(body).not.toContain("Principal");
    expect(body).not.toContain("Time.now");
    expect(body).not.toContain("familyId");
    expect(body).not.toContain("personId");
    expect(body).not.toContain("email");
  });

  it("encodes the token URL-safe", () => {
    // The URL-safe alphabet uses `-` and `_` rather than `+` and `/`.
    expect(randomLib).toContain(
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_",
    );
  });

  it("the invitation library generates tokens through the secure facility", () => {
    expect(invitationLib).toContain("await RandomLib.generateToken()");
  });
});

// ---------------------------------------------------------------------------
// (2) The persisted value is a SHA-256 digest; the weak hash is gone.
// ---------------------------------------------------------------------------

describe("the persisted token value is a SHA-256 digest", () => {
  it("digestToken returns the SHA-256 digest of the token's UTF-8 bytes", () => {
    const start = randomLib.indexOf("public func digestToken(");
    expect(start).toBeGreaterThan(-1);
    const end = randomLib.indexOf("func base64UrlEncode(", start);
    const body = randomLib.slice(start, end);
    expect(body).toContain("sha256(rawToken.encodeUtf8())");
  });

  it("implements SHA-256 with the FIPS 180-4 round constants", () => {
    expect(randomLib).toContain("public func sha256(message : Blob) : Blob");
    // The first round constant and the initial hash value are the standard
    // SHA-256 constants, so this is a real SHA-256 and not a placeholder.
    expect(randomLib).toContain("0x428a2f98");
    expect(randomLib).toContain("0x6a09e667");
  });

  it("never uses the weak modulo-1_000_000_007 polynomial hash for invitations", () => {
    expect(invitationLib).not.toContain("1_000_000_007");
    expect(invitationLib).not.toContain("hashToken(");
    expect(randomLib).not.toContain("1_000_000_007");
  });

  it("stores and resolves by the digest only", () => {
    expect(invitationLib).toContain(
      "tokenHash = RandomLib.digestToken(rawToken);",
    );
    expect(invitationLib).toContain(
      "getInvitationByTokenHash(invitations, RandomLib.digestToken(rawToken))",
    );
  });

  it("never logs the raw token", () => {
    // The raw token is returned once and never written to a log. The backend
    // has no logging primitive at all, so the strongest source-level guarantee
    // is that neither the token facility nor the invitation library calls one,
    // and that no logging call is handed the raw token.
    for (const source of [randomLib, invitationLib]) {
      expect(source).not.toContain("Debug.print");
      expect(source).not.toContain("Debug.todo");
    }
    expect(invitationLib).not.toMatch(/\bprint\s*\(/u);
    expect(randomLib).not.toMatch(/\bprint\s*\(/u);
  });
});

// ---------------------------------------------------------------------------
// (3) The duplicate-pending lookup is expiry-aware.
// ---------------------------------------------------------------------------

describe("the duplicate-pending lookup is expiry-aware", () => {
  it("ignores an invitation whose expiresAt <= now", () => {
    const start = invitationLib.indexOf(
      "public func getPendingInvitationForTarget(",
    );
    expect(start).toBeGreaterThan(-1);
    const end = invitationLib.indexOf(
      "public func hasActiveMembershipOwnerForPerson(",
      start,
    );
    const body = invitationLib.slice(start, end);
    expect(body).toContain("i.status == #Pending");
    expect(body).toContain("i.expiresAt > now");
  });
});

// ---------------------------------------------------------------------------
// (4) Expired records are preserved and transitioned, never deleted.
// ---------------------------------------------------------------------------

describe("expired invitations are preserved and transitioned", () => {
  it("transitions an expired #Pending record to #Expired without deleting it", () => {
    const start = invitationLib.indexOf("func expireStaleInvitations(");
    expect(start).toBeGreaterThan(-1);
    const end = invitationLib.indexOf("func isProfileClaimedForFamily(", start);
    const body = invitationLib.slice(start, end);
    expect(body).toContain("i.status == #Pending");
    expect(body).toContain("i.expiresAt <= now");
    expect(body).toContain("status = #Expired;");
    // The record is replaced in place, never removed.
    expect(body).toContain("replaceInvitation(invitations, expired);");
    expect(body).not.toContain("invitations.remove(");
  });

  it("creates a fresh invitation with a new token and a fresh expiry after expiry", () => {
    const start = invitationLib.indexOf("func createInvitation(");
    expect(start).toBeGreaterThan(-1);
    const end = invitationLib.indexOf("func isInviterAuthorized(", start);
    const body = invitationLib.slice(start, end);
    // Expired records are transitioned before the fresh create.
    expect(body).toContain(
      "expireStaleInvitations(invitations, familyId, personId, invitationType)",
    );
    expect(body).toContain("await RandomLib.generateToken()");
    expect(body).toContain("expiresAt = now + DEFAULT_INVITATION_TTL_NS;");
  });

  it("returns #Expired from resend for an already-expired invitation", () => {
    const body = libFunctionBody("resendFamilyInvitation", "invitationRows");
    expect(body).toContain("expireStaleInvitations(");
    expect(body).toContain("return #err(#Expired)");
  });
});

// ---------------------------------------------------------------------------
// (5) Acceptance reuses only a same-personId #Pending membership.
// ---------------------------------------------------------------------------

describe("acceptance reuses only a same-personId #Pending membership", () => {
  it("rejects a different-personId or non-#Pending membership with #AlreadyMember", () => {
    const body = libFunctionBody(
      "acceptFamilyInvitation",
      "declineFamilyInvitation",
    );
    expect(body).toContain(
      "FamilyMembershipLib.getMembershipForFamily(memberships, invitation.familyId, caller)",
    );
    expect(body).toContain(
      "existing.status != #Pending or existing.personId != invitation.personId",
    );
    expect(body).toContain("return #err(#AlreadyMember)");
  });

  it("leaves the invitation #Pending on that rejection (no status write before the guard)", () => {
    const body = libFunctionBody(
      "acceptFamilyInvitation",
      "declineFamilyInvitation",
    );
    const guard = body.indexOf(
      "existing.status != #Pending or existing.personId != invitation.personId",
    );
    const accepted = body.indexOf("status = #Accepted;");
    expect(guard).toBeGreaterThan(-1);
    expect(accepted).toBeGreaterThan(guard);
  });
});

// ---------------------------------------------------------------------------
// (6) The claimed-profile rule reuses the family-scoped ownership helper.
// ---------------------------------------------------------------------------

describe("the claimed-profile rule treats legacy ownership as claimed", () => {
  it("treats claimedByUserId or an approved claim as already owned", () => {
    const start = invitationLib.indexOf("func isProfileClaimedForFamily(");
    expect(start).toBeGreaterThan(-1);
    const end = invitationLib.indexOf("func invitationTypeText(", start);
    const body = invitationLib.slice(start, end);
    // Reuses the family-scoped profile lookup rather than duplicating it.
    expect(body).toContain(
      "TenancyLib.getProfileForFamily(profiles, familyId, personId)",
    );
    expect(body).toContain("profile.claimedByUserId != null");
    expect(body).toContain("c.status == #Approved");
  });

  it("rejects create and accept for a legacy-claimed profile with #AlreadyMember", () => {
    const createStart = invitationLib.indexOf("func createInvitation(");
    const createEnd = invitationLib.indexOf(
      "func isInviterAuthorized(",
      createStart,
    );
    const createBody = invitationLib.slice(createStart, createEnd);
    expect(createBody).toContain(
      "isProfileClaimedForFamily(profiles, claims, familyId, personId)",
    );
    expect(createBody).toContain("return #ok(#AlreadyMember);");

    const acceptBody = libFunctionBody(
      "acceptFamilyInvitation",
      "declineFamilyInvitation",
    );
    expect(acceptBody).toContain(
      "isProfileClaimedForFamily(profiles, claims, invitation.familyId, invitation.personId)",
    );
    expect(acceptBody).toContain("return #err(#AlreadyMember)");
  });
});
