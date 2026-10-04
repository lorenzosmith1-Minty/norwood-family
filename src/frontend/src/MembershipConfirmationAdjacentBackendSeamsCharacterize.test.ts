import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { MembershipConfirmationError } from "@/backend";

// ---------------------------------------------------------------------------
// Characterization baseline for the ADJACENT backend seams that the
// membership-confirmation model change must NOT disturb.
//
// The requested change reworks the confirmation model: a pending membership
// carries a confirmation status with outcomes Pending / Confirmed /
// Rejected-Disputed / NeedsStewardReview, a standalone rejection/dispute gets
// an explicit representation, and confirm/reject become concurrency-safe. That
// is exactly the behavior under change, so this file deliberately does NOT
// freeze:
//
//   * the `ConfirmationDecision` or `MembershipConfirmationState` variant names
//     or their string values — the change renames/reshapes them;
//   * the `#Disputed` -> `#StewardReviewRequired` derivation — the standalone
//     rejection representation is what changes;
//   * the confirmation record's exact field set — the change may add fields;
//   * the concurrency behavior of confirm/reject — it does not exist yet.
//
// What it protects is the existing behavior the acceptance criteria name as
// unchanged ("existing invitation, authentication, notification, and
// profile-claiming behavior continues to work") plus the confirmation
// AUTHORIZATION and FAMILY-SCOPING seams that are adjacent to, but distinct
// from, the changing representation:
//
//   A. The pre-existing stable collections keep their exact names and types.
//      A refactor that renames, retypes, or drops one while reworking the
//      confirmation state breaks every existing record.
//   B. The pre-existing public mixin includes keep their exact argument lists,
//      so the confirmation rework cannot silently rewire an existing endpoint's
//      dependencies.
//   C. The confirmation authorization seam is preserved: anonymous callers,
//      callers with no active membership, self-confirmation, and callers with
//      no qualifying relationship are all rejected. The decision/state values
//      may change; these rules must not.
//   D. Every confirmation lookup stays family-scoped: a confirmation,
//      relationship, or membership in one family never satisfies another.
//   E. The adjacent public methods (invitation, notification, profile-claiming)
//      remain on the generated consumer service type, so the frontend's typed
//      calls keep compiling.
//
// This is a static-source + typed consumer-contract characterization. The
// PocketIC lane is the only place the confirmation API's runtime behavior is
// observed, and it is recorded in the episode's coverageLimits; the frontend
// suite mocks the actor, so none of the backend behavior is visible there.
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
const confirmationLib = stripComments(
  readBackend(path.join("lib", "membership-confirmation.mo")),
);
const confirmationApi = stripComments(
  readBackend(path.join("mixins", "membership-confirmation-api.mo")),
);

/**
 * The body of a `public func <name>(` block, up to the next top-level
 * `public func` (or the end of the module). Slicing to the next declaration
 * rather than the first `};` is required because a function body contains
 * nested `};` terminators (e.g. the anonymous-caller guard) long before the
 * function's own end.
 */
function functionBody(source: string, signature: string): string {
  const start = source.indexOf(signature);
  expect(start).toBeGreaterThan(-1);
  const next = source.indexOf("public ", start + signature.length);
  const end = next === -1 ? source.length : next;
  return source.slice(start, end);
}

// ---------------------------------------------------------------------------
// A. The pre-existing stable collections are unchanged.
//
// The confirmation rework may add or reshape confirmation state, but every
// collection that existed before it must keep its exact name and type: a
// rename or retype silently invalidates the persisted state of every existing
// record.
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

  it("keeps the invitation and notification stable state", () => {
    for (const declaration of [
      "let invitations : List.List<FamilyInvitationTypes.FamilyInvitation>;",
      "let invitationState : { var nextInvitationId : Nat };",
      "let notifications : List.List<OwnershipTypes.Notification>;",
    ]) {
      expect(mainSource).toContain(declaration);
    }
  });

  it("keeps the confirmation collections as their own stable fields", () => {
    // The confirmation rework may change the record's shape, but the two
    // collections stay distinct stable fields rather than being folded into
    // memberships or another pre-existing collection.
    expect(mainSource).toContain(
      "let confirmations : List.List<MembershipConfirmationTypes.MembershipConfirmation>;",
    );
    expect(mainSource).toContain(
      "let stewardResolutions : List.List<MembershipConfirmationTypes.MembershipConfirmationResolutionRecord>;",
    );
    expect(mainSource).not.toContain(
      "let confirmations : List.List<MembershipTypes.FamilyMembership>;",
    );
  });
});

// ---------------------------------------------------------------------------
// B. The pre-existing public mixin includes are unchanged.
//
// The confirmation mixin is already wired. Every existing include must keep its
// exact argument list, so the rework cannot silently rewire an existing
// endpoint's dependencies.
// ---------------------------------------------------------------------------

describe("pre-existing public mixin includes are unchanged (compatibility baseline)", () => {
  it("keeps the invitation, notification, and profile-claiming includes", () => {
    for (const include of [
      "include FamilyInvitationApi(invitations, invitationState, families, profiles, claims, memberships, stewards, foundingStewardNominations);",
      "include NotificationsScopeApi(notifications);",
      "include ClaimPersistenceApi(profiles, claims);",
      "include OwnershipApi(accessControlState, profiles, claims, confirmedRelationships, relationshipRequests, notifications, auditLog, stewards);",
    ]) {
      expect(mainSource).toContain(include);
    }
  });

  it("keeps the confirmation mixin wired to the confirmation collections", () => {
    expect(mainSource).toContain(
      "include MembershipConfirmationApi(confirmations, stewardResolutions, memberships, profiles, claims, confirmedRelationships, stewards);",
    );
  });
});

// ---------------------------------------------------------------------------
// C. The confirmation authorization seam is preserved.
//
// The decision/state values are changing, but the authorization rules are not:
// anonymous callers, callers with no active membership, self-confirmation, and
// callers with no qualifying relationship are all rejected. The frontend's
// error vocabulary depends on these variants surviving.
// ---------------------------------------------------------------------------

describe("confirmation authorization seam (characterization)", () => {
  it("rejects an anonymous caller before any lookup", () => {
    const body = functionBody(
      confirmationLib,
      "public func submitConfirmationForFamily(",
    );
    expect(body).toContain("caller.isAnonymous()");
    expect(body).toContain("#NotSignedIn");
  });

  it("requires the confirmer to hold an #Active membership in the family", () => {
    const body = functionBody(
      confirmationLib,
      "public func submitConfirmationForFamily(",
    );
    expect(body).toContain(
      "MembershipLib.getMembershipForFamily(memberships, familyId, caller)",
    );
    expect(body).toContain("#NoActiveMembership");
    expect(body).toContain("confirmerMembership.status != #Active");
  });

  it("rejects self-confirmation", () => {
    const body = functionBody(
      confirmationLib,
      "public func submitConfirmationForFamily(",
    );
    expect(body).toContain(
      "confirmerMembership.personId == membership.personId",
    );
    expect(body).toContain("#SelfConfirmation");
  });

  it("requires a qualifying confirmed relationship in the family", () => {
    const body = functionBody(
      confirmationLib,
      "public func submitConfirmationForFamily(",
    );
    expect(body).toContain(
      "RelationshipsLib.findConfirmedRelationshipBetween(",
    );
    expect(body).toContain("#NoQualifyingRelationship");
  });

  it("keeps the error vocabulary the frontend reasons about", () => {
    // The rework reuses the existing error variants; it must not rename or drop
    // one the frontend already handles.
    for (const variant of [
      "NotSignedIn",
      "NotAuthorized",
      "NotSteward",
      "MembershipNotFound",
      "NoActiveMembership",
      "NoQualifyingRelationship",
      "SelfConfirmation",
    ]) {
      expect(
        Object.prototype.hasOwnProperty.call(
          MembershipConfirmationError,
          variant,
        ),
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// D. Every confirmation lookup stays family-scoped.
//
// A confirmation, relationship, or membership in one family never satisfies
// another. The rework must not widen a lookup to ignore the family id.
// ---------------------------------------------------------------------------

describe("confirmation family scoping (characterization)", () => {
  it("scopes the confirmation reads by familyId", () => {
    for (const signature of [
      "public func getConfirmationForFamily(",
      "public func listConfirmationsForMembership(",
      "public func getConfirmationByConfirmer(",
      "public func getResolutionForFamily(",
    ]) {
      const body = functionBody(confirmationLib, signature);
      expect(body).toContain("familyId");
    }
  });

  it("scopes the membership lookup by familyId in the submit path", () => {
    const body = functionBody(
      confirmationLib,
      "public func submitConfirmationForFamily(",
    );
    expect(body).toContain(
      "MembershipLib.getMembershipByIdForFamily(memberships, familyId, membershipId)",
    );
  });

  it("scopes the Steward read by the requested family", () => {
    const body = functionBody(
      confirmationApi,
      "public query ({ caller }) func getMembershipConfirmationStateForSteward(",
    );
    expect(body).toContain(
      "MembershipLib.getMembershipByIdForFamily(memberships, familyId, membershipId)",
    );
    expect(body).toContain(
      "ConfirmationLib.listConfirmationsForMembership(confirmations, familyId, membershipId)",
    );
  });
});

// ---------------------------------------------------------------------------
// E. The adjacent public methods remain on the generated consumer service type.
//
// The acceptance criteria name invitation, authentication, notification, and
// profile-claiming behavior as unchanged. The generated service type is the
// frontend's typed seam onto those endpoints; if the confirmation rework drops
// or renames one, the frontend's calls stop compiling.
// ---------------------------------------------------------------------------

describe("adjacent consumer seam (characterization)", () => {
  it("keeps the invitation methods on the generated service type", () => {
    const serviceMethods: string[] = [
      "createFamilyInvitation",
      "createFoundingStewardInvitation",
      "validateFamilyInvitationToken",
      "acceptFamilyInvitation",
      "declineFamilyInvitation",
      "cancelFamilyInvitation",
      "resendFamilyInvitation",
    ];
    const backendSource = readFileSync(path.join(here, "backend.ts"), "utf8");
    for (const method of serviceMethods) {
      expect(backendSource).toContain(`${method}(`);
    }
  });

  it("keeps the notification methods on the generated service type", () => {
    const backendSource = readFileSync(path.join(here, "backend.ts"), "utf8");
    for (const method of [
      "listNotificationsForFamily",
      "markNotificationReadForFamily",
      "unreadNotificationCountForFamily",
    ]) {
      expect(backendSource).toContain(`${method}(`);
    }
  });

  it("keeps the profile-claiming methods on the generated service type", () => {
    const backendSource = readFileSync(path.join(here, "backend.ts"), "utf8");
    for (const method of [
      "requestProfileClaim",
      "approveProfileClaim",
      "rejectProfileClaim",
      "requestProfileClaimForFamily",
      "approveProfileClaimForFamily",
      "rejectProfileClaimForFamily",
    ]) {
      expect(backendSource).toContain(`${method}(`);
    }
  });
});
