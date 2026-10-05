import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Principal } from "@icp-sdk/core/principal";
import { describe, expect, it } from "vitest";

import {
  type AccountId,
  type FamilyId,
  type PersonId,
  RecoveryAuditActionType,
  type RecoveryAuditEntry,
  RecoveryError,
  type RecoveryRequest,
  RecoveryStatus,
  RecoveryType,
  type RecoveryVerification,
  RecoveryVerificationDecision,
} from "@/backend";

// ---------------------------------------------------------------------------
// Cover for the Phase 4A Recovery Foundation (backend + types only).
//
// The accepted behavior this file asserts, at the generated consumer seam and
// against the backend source the bindings are generated from:
//
//   1. The generated bindings expose the recovery data model: the
//      `RecoveryRequest`, `RecoveryVerification`, and `RecoveryAuditEntry`
//      records, the `RecoveryType` / `RecoveryStatus` /
//      `RecoveryVerificationDecision` / `RecoveryAuditActionType` enums, and the
//      `RecoveryError` vocabulary.
//   2. The eight family-scoped recovery endpoints are present on the generated
//      service interface with the expected argument shapes.
//   3. The backend derives the recovery type from the family's Steward state:
//      `#AccountRecovery` when a usable active Steward exists, otherwise
//      `#StewardRecovery` (the 2-member quorum path).
//   4. Self-approval and self-verification are refused, and the same verifier
//      cannot count twice.
//   5. The ownership transfer is atomic and idempotent: it re-reads the profile
//      under the family scope, moves the active membership without creating a
//      duplicate, and returns early when `transferredAt` is already set.
//   6. The additive migration introduces only the three new collections and
//      reads/reseeds no existing collection.
//
// This is a typed consumer-contract test over the generated bindings plus a
// static-source characterization of the backend invariants. It does NOT
// exercise the real canister: the PocketIC lane is the only place the recovery
// API's runtime behavior is observed, and it is recorded in the episode's
// coverageLimits. The frontend suite mocks the actor, so none of the backend
// runtime behavior is visible here.
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

const recoveryTypes = stripComments(
  readBackend(path.join("types", "recovery.mo")),
);
const recoveryLib = stripComments(readBackend(path.join("lib", "recovery.mo")));
const recoveryApi = stripComments(
  readBackend(path.join("mixins", "recovery-api.mo")),
);
const recoveryMigration = readBackend(
  path.join("migrations", "20261008_000000.mo"),
);

const OWNER = Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai");
const REPLACEMENT = Principal.fromText("renrk-eyaaa-aaaaa-aaada-cai");

/** A fully-populated recovery request as the generated binding types it. */
function recoveryRequest(): RecoveryRequest {
  return {
    familyId: "norwood",
    id: 1n,
    recoveryType: RecoveryType.AccountRecovery,
    personId: "clayton",
    ownerAccountId: OWNER,
    replacementAccountId: REPLACEMENT,
    status: RecoveryStatus.Pending,
    requestedByAccountId: OWNER,
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
    decidedByAccountId: undefined,
    decidedAt: undefined,
    transferredAt: undefined,
  };
}

// ---------------------------------------------------------------------------
// (1) The generated recovery data model is present and typed.
// ---------------------------------------------------------------------------

describe("recovery data model bindings (cover)", () => {
  it("exposes the recovery type, status, decision, and audit-action enums", () => {
    expect(Object.values(RecoveryType).sort()).toEqual(
      ["AccountRecovery", "StewardRecovery"].sort(),
    );
    expect(Object.values(RecoveryStatus).sort()).toEqual(
      [
        "Approved",
        "AwaitingVerification",
        "Cancelled",
        "Expired",
        "Pending",
        "ReadyForApproval",
        "Rejected",
      ].sort(),
    );
    expect(Object.values(RecoveryVerificationDecision).sort()).toEqual(
      ["Confirm", "Reject"].sort(),
    );
    expect(Object.values(RecoveryAuditActionType).sort()).toEqual(
      [
        "OwnershipTransferred",
        "RequestCreated",
        "ResolutionRecorded",
        "StewardDecisionRecorded",
        "VerificationRecorded",
      ].sort(),
    );
  });

  it("exposes the recovery error vocabulary the endpoints return", () => {
    for (const variant of [
      "NotSignedIn",
      "FamilyNotFound",
      "PersonNotFound",
      "NotAuthorized",
      "NotOwner",
      "NotSteward",
      "SelfApproval",
      "SelfVerification",
      "AlreadyVerifier",
      "AlreadyPending",
      "RequestNotFound",
      "InvalidTransition",
      "QuorumNotMet",
      "AlreadyResolved",
      "ReplacementNotMember",
    ]) {
      expect(RecoveryError).toHaveProperty(variant);
    }
  });

  it("keeps the RecoveryRequest field set the consumer reads", () => {
    const request = recoveryRequest();
    expect(Object.keys(request).sort()).toEqual(
      [
        "createdAt",
        "decidedAt",
        "decidedByAccountId",
        "familyId",
        "id",
        "ownerAccountId",
        "personId",
        "recoveryType",
        "replacementAccountId",
        "requestedByAccountId",
        "status",
        "transferredAt",
        "updatedAt",
      ].sort(),
    );
    // The optional decision/transfer fields are absent on a fresh request.
    expect(request.decidedByAccountId).toBeUndefined();
    expect(request.decidedAt).toBeUndefined();
    expect(request.transferredAt).toBeUndefined();
  });

  it("keeps the RecoveryVerification and RecoveryAuditEntry field sets", () => {
    const verification: RecoveryVerification = {
      familyId: "norwood",
      id: 1n,
      recoveryId: 1n,
      verifierAccountId: OWNER,
      decision: RecoveryVerificationDecision.Confirm,
      decidedAt: 1_700_000_000_000_000_000n,
    };
    expect(Object.keys(verification).sort()).toEqual(
      [
        "decidedAt",
        "decision",
        "familyId",
        "id",
        "recoveryId",
        "verifierAccountId",
      ].sort(),
    );

    const audit: RecoveryAuditEntry = {
      familyId: "norwood",
      id: 1n,
      recoveryId: 1n,
      actionType: RecoveryAuditActionType.RequestCreated,
      actorAccountId: OWNER,
      affectedPersonIds: ["clayton"],
      timestamp: 1_700_000_000_000_000_000n,
      summary: "Recovery request created",
    };
    expect(Object.keys(audit).sort()).toEqual(
      [
        "actionType",
        "actorAccountId",
        "affectedPersonIds",
        "familyId",
        "id",
        "recoveryId",
        "summary",
        "timestamp",
      ].sort(),
    );
  });

  it("keeps the family-scoped aliases assignable on the recovery records", () => {
    const request = recoveryRequest();
    const familyId: FamilyId = request.familyId;
    const personId: PersonId = request.personId;
    const owner: AccountId = request.ownerAccountId;

    expect(familyId).toBe("norwood");
    expect(personId).toBe("clayton");
    expect(owner).toBe(OWNER);
  });

  it("declares the recovery records and enums on the backend types module", () => {
    for (const declaration of [
      "public type RecoveryType = {",
      "public type RecoveryStatus = {",
      "public type RecoveryVerificationDecision = {",
      "public type RecoveryVerification = {",
      "public type RecoveryAuditActionType = {",
      "public type RecoveryAuditEntry = {",
      "public type RecoveryRequest = {",
      "public type RecoveryError = {",
    ]) {
      expect(recoveryTypes).toContain(declaration);
    }
    // The tenant boundary is carried on every persisted record.
    expect(recoveryTypes).toContain("familyId : FamilyId;");
  });
});

// ---------------------------------------------------------------------------
// (2) The eight family-scoped endpoints are exposed on the generated service.
// ---------------------------------------------------------------------------

describe("recovery endpoint bindings (cover)", () => {
  it("exposes every family-scoped recovery endpoint on the generated service", () => {
    // The generated service interface is the consumer seam the app compiles
    // against; a missing endpoint here is a bindgen regression.
    const service = readFileSync(path.join(here, "backend.ts"), "utf8");
    for (const method of [
      "requestRecoveryForFamily",
      "approveAccountRecoveryForFamily",
      "verifyStewardRecoveryForFamily",
      "rejectRecoveryForFamily",
      "getRecoveryRequestForFamily",
      "listRecoveryRequestsForFamily",
      "listRecoveryVerificationsForFamily",
      "listRecoveryAuditForFamily",
    ]) {
      expect(service).toContain(`${method}(`);
    }
  });

  it("declares every endpoint as a public shared/query function in the mixin", () => {
    for (const signature of [
      "public shared ({ caller }) func requestRecoveryForFamily(",
      "public shared ({ caller }) func approveAccountRecoveryForFamily(",
      "public shared ({ caller }) func verifyStewardRecoveryForFamily(",
      "public shared ({ caller }) func rejectRecoveryForFamily(",
      "public query ({ caller }) func getRecoveryRequestForFamily(",
      "public query ({ caller }) func listRecoveryRequestsForFamily(",
      "public query ({ caller }) func listRecoveryVerificationsForFamily(",
      "public query ({ caller }) func listRecoveryAuditForFamily(",
    ]) {
      expect(recoveryApi).toContain(signature);
    }
  });

  it("gates every endpoint on the caller's family-scoped authority", () => {
    // Every mutation rejects an anonymous caller before doing any work.
    expect(recoveryApi).toContain("caller.isAnonymous()");
    // The Steward-only reads use the canonical family-scoped Steward predicate.
    expect(recoveryApi).toContain(
      "StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)",
    );
  });
});

// ---------------------------------------------------------------------------
// (3) Recovery type is derived from the family's Steward state.
// ---------------------------------------------------------------------------

describe("recovery type derivation (cover)", () => {
  it("derives #AccountRecovery when a usable active Steward exists, else #StewardRecovery", () => {
    const start = recoveryLib.indexOf("public func requestRecoveryForFamily(");
    expect(start).toBeGreaterThan(-1);
    const end = recoveryLib.indexOf(
      "public func approveAccountRecoveryForFamily(",
      start,
    );
    const requestFn = recoveryLib.slice(start, end);

    // A "usable" Steward is an active Steward of the family who is NOT the
    // candidate (requester, current owner, or replacement account): a Steward
    // who is the candidate cannot approve this recovery, so they must not make
    // it an ordinary #AccountRecovery. When the only active Steward is the
    // candidate, the request is a #StewardRecovery resolved by the 2-member
    // quorum.
    expect(requestFn).toContain("let hasUsableSteward =");
    expect(requestFn).toContain("s.roleStatus == #Active");
    expect(requestFn).toContain("s.familyId == familyId");
    expect(requestFn).toContain("s.stewardAccountId != caller");
    expect(requestFn).toContain("s.stewardAccountId != ownerAccountId");
    expect(requestFn).toContain("s.stewardAccountId != replacementAccountId");
    expect(requestFn).toContain("if (hasUsableSteward)");
    expect(requestFn).toContain("#AccountRecovery");
    expect(requestFn).toContain("#StewardRecovery");
  });

  it("rejects a duplicate open request for the same person (idempotency)", () => {
    const start = recoveryLib.indexOf("public func requestRecoveryForFamily(");
    const end = recoveryLib.indexOf(
      "public func approveAccountRecoveryForFamily(",
      start,
    );
    const requestFn = recoveryLib.slice(start, end);

    expect(requestFn).toContain("isOpen(r.status)");
    expect(requestFn).toContain("#err(#AlreadyPending)");
  });

  it("requires the caller to be the replacement account at request creation", () => {
    const start = recoveryLib.indexOf("public func requestRecoveryForFamily(");
    const end = recoveryLib.indexOf(
      "public func approveAccountRecoveryForFamily(",
      start,
    );
    const requestFn = recoveryLib.slice(start, end);

    // Self-service requester model: the caller IS the replacement account, so a
    // caller can never nominate an arbitrary third-party replacement account.
    // The request-creation gate is therefore `replacementAccountId == caller`,
    // not the family-eligibility helper (which is re-checked at approval and
    // quorum-resolution time).
    expect(requestFn).toContain("if (replacementAccountId != caller)");
    expect(requestFn).toContain("#err(#NotAuthorized)");

    // The target must be an existing CLAIMED profile under family scope: an
    // unclaimed profile has no owner to recover from.
    expect(requestFn).toContain(
      "TenancyLib.getProfileForFamily(profiles, familyId, personId)",
    );
    expect(requestFn).toContain("profile.claimedByUserId == null");
  });

  it("keeps the replacement eligibility helper family-scoped, accepting an active membership", () => {
    // The shared `isEligibleReplacement` helper accepts an approved family
    // member OR an `#Active` membership holder. It is applied at approval and
    // quorum-resolution time (via `isEligibleReplacementForRequest`), so a
    // replacement account that can authenticate but has not yet created a second
    // family profile is eligible, while a principal with no family relationship
    // is still refused.
    const helperStart = recoveryLib.indexOf("func isEligibleReplacement(");
    expect(helperStart).toBeGreaterThan(-1);
    const helperEnd = recoveryLib.indexOf("func isOpen(", helperStart);
    const helperFn = recoveryLib.slice(helperStart, helperEnd);
    expect(helperFn).toContain(
      "isApprovedFamilyMemberForFamily(stewards, claims, accountId, familyId)",
    );
    expect(helperFn).toContain(
      "hasActiveMembershipForFamily(memberships, familyId, accountId)",
    );

    // The self-service replacement (the request's own replacement account) is
    // accepted without a pre-existing family membership; any other replacement
    // still has to pass the family-scoped helper.
    const forRequestStart = recoveryLib.indexOf(
      "func isEligibleReplacementForRequest(",
    );
    expect(forRequestStart).toBeGreaterThan(-1);
    const forRequestEnd = recoveryLib.indexOf("func isOpen(", forRequestStart);
    const forRequestFn = recoveryLib.slice(forRequestStart, forRequestEnd);
    expect(forRequestFn).toContain(
      "request.replacementAccountId == request.requestedByAccountId",
    );
    expect(forRequestFn).toContain(
      "isEligibleReplacement(stewards, claims, memberships, request.replacementAccountId, familyId)",
    );
  });
});

// ---------------------------------------------------------------------------
// (4) Self-approval / self-verification prevention and no double-count.
// ---------------------------------------------------------------------------

describe("self-approval and quorum guards (cover)", () => {
  it("refuses a Steward approving their own recovery", () => {
    const start = recoveryLib.indexOf(
      "public func approveAccountRecoveryForFamily(",
    );
    const end = recoveryLib.indexOf(
      "public func verifyStewardRecoveryForFamily(",
      start,
    );
    const approveFn = recoveryLib.slice(start, end);

    expect(approveFn).toContain("caller == request.requestedByAccountId");
    expect(approveFn).toContain("caller == request.ownerAccountId");
    expect(approveFn).toContain("caller == request.replacementAccountId");
    expect(approveFn).toContain("#err(#SelfApproval)");
  });

  it("refuses the candidate verifying their own recovery", () => {
    const start = recoveryLib.indexOf(
      "public func verifyStewardRecoveryForFamily(",
    );
    const end = recoveryLib.indexOf(
      "public func rejectRecoveryForFamily(",
      start,
    );
    const verifyFn = recoveryLib.slice(start, end);

    expect(verifyFn).toContain("caller == request.requestedByAccountId");
    expect(verifyFn).toContain("caller == request.ownerAccountId");
    expect(verifyFn).toContain("caller == request.replacementAccountId");
    expect(verifyFn).toContain("#err(#SelfVerification)");
  });

  it("refuses the same verifier counting twice toward quorum", () => {
    const start = recoveryLib.indexOf(
      "public func verifyStewardRecoveryForFamily(",
    );
    const end = recoveryLib.indexOf(
      "public func rejectRecoveryForFamily(",
      start,
    );
    const verifyFn = recoveryLib.slice(start, end);

    expect(verifyFn).toContain("v.verifierAccountId == caller");
    expect(verifyFn).toContain("#err(#AlreadyVerifier)");
  });

  it("requires 2 distinct confirmations before the quorum is met", () => {
    const start = recoveryLib.indexOf(
      "public func verifyStewardRecoveryForFamily(",
    );
    const end = recoveryLib.indexOf(
      "public func rejectRecoveryForFamily(",
      start,
    );
    const verifyFn = recoveryLib.slice(start, end);

    expect(verifyFn).toContain("v.decision == #Confirm");
    expect(verifyFn).toContain("confirmations.size() >= 2");
    expect(verifyFn).toContain("#ReadyForApproval");
  });
});

// ---------------------------------------------------------------------------
// (5) Atomic, idempotent ownership transfer.
// ---------------------------------------------------------------------------

describe("atomic ownership transfer (cover)", () => {
  it("re-reads the profile under the family scope and updates it in place", () => {
    const start = recoveryLib.indexOf("func transferOwnership(");
    expect(start).toBeGreaterThan(-1);
    const end = recoveryLib.indexOf("func transferMembershipForPerson(", start);
    const transferFn = recoveryLib.slice(start, end);

    // The profile is resolved family-scoped, so a cross-family person id can
    // never be transferred.
    expect(transferFn).toContain(
      "TenancyLib.getProfileForFamily(profiles, familyId, request.personId)",
    );
    // Ownership moves on the SAME profile record: no new Person is created.
    expect(transferFn).toContain(
      "claimedByUserId = ?request.replacementAccountId",
    );
    expect(transferFn).toContain("claimStatus = #Claimed");
    expect(transferFn).toContain(
      "TenancyLib.putProfileForFamily(profiles, familyId, updatedProfile)",
    );
    expect(transferFn).not.toContain("profiles.add(");
  });

  it("is idempotent: a request that already transferred returns unchanged", () => {
    const start = recoveryLib.indexOf("func transferOwnership(");
    const end = recoveryLib.indexOf("func transferMembershipForPerson(", start);
    const transferFn = recoveryLib.slice(start, end);

    expect(transferFn).toContain("switch (request.transferredAt)");
    expect(transferFn).toContain("case (?_) { return request }");
    expect(transferFn).toContain("transferredAt = ?now");
  });

  it("moves the active membership without creating a duplicate", () => {
    const start = recoveryLib.indexOf("func transferMembershipForPerson(");
    expect(start).toBeGreaterThan(-1);
    const end = recoveryLib.indexOf("func deactivateMembership(", start);
    const membershipFn = recoveryLib.slice(start, end);

    // The old owner's active membership is deactivated before the
    // replacement's is activated.
    expect(membershipFn).toContain(
      "deactivateMembership(memberships, owner, now)",
    );
    // The replacement's existing membership is retargeted by id, not appended.
    expect(membershipFn).toContain("replaceMembership(memberships, updated)");
    expect(membershipFn).not.toContain("memberships.add(");

    // Deactivation sets the record to #Left, preserving it rather than deleting.
    const deactivateStart = recoveryLib.indexOf("func deactivateMembership(");
    expect(deactivateStart).toBeGreaterThan(-1);
    const deactivateEnd = recoveryLib.indexOf("// OQL rows", deactivateStart);
    const deactivateFn = recoveryLib.slice(deactivateStart, deactivateEnd);
    expect(deactivateFn).toContain("status = #Left");
    expect(deactivateFn).toContain("id = membership.id");
  });

  it("rejects a resolved request so a completed recovery cannot be replayed", () => {
    const start = recoveryLib.indexOf(
      "public func approveAccountRecoveryForFamily(",
    );
    const end = recoveryLib.indexOf(
      "public func verifyStewardRecoveryForFamily(",
      start,
    );
    const approveFn = recoveryLib.slice(start, end);

    expect(approveFn).toContain("isResolved(request.status)");
    expect(approveFn).toContain("#err(#AlreadyResolved)");
  });
});

// ---------------------------------------------------------------------------
// (6) Recovery audit history records the full trail.
// ---------------------------------------------------------------------------

describe("recovery audit history (cover)", () => {
  it("records creation, verification, Steward decision, resolution, and transfer", () => {
    for (const action of [
      "#RequestCreated",
      "#VerificationRecorded",
      "#StewardDecisionRecorded",
      "#ResolutionRecorded",
      "#OwnershipTransferred",
    ]) {
      expect(recoveryLib).toContain(action);
    }
  });

  it("scopes every audit entry to the family and the recovery request", () => {
    const start = recoveryLib.indexOf("func recordAudit(");
    expect(start).toBeGreaterThan(-1);
    const end = recoveryLib.indexOf("func nextRequestId(", start);
    const auditFn = recoveryLib.slice(start, end);

    expect(auditFn).toContain("familyId;");
    expect(auditFn).toContain("recoveryId;");
    expect(auditFn).toContain("affectedPersonIds;");
  });
});

// ---------------------------------------------------------------------------
// (7) The additive migration introduces only the three new collections.
// ---------------------------------------------------------------------------

describe("additive recovery migration (cover)", () => {
  it("declares the three new recovery collections and nothing else", () => {
    expect(recoveryMigration).toContain(
      "recoveryRequests : List.List<RecoveryRequest>;",
    );
    expect(recoveryMigration).toContain(
      "recoveryVerifications : List.List<RecoveryVerification>;",
    );
    expect(recoveryMigration).toContain(
      "recoveryAudit : List.List<RecoveryAuditEntry>;",
    );
  });

  it("starts the new collections empty and reads/reseeds no existing collection", () => {
    const body = stripComments(recoveryMigration);
    expect(body).toContain("recoveryRequests = List.empty()");
    expect(body).toContain("recoveryVerifications = List.empty()");
    expect(body).toContain("recoveryAudit = List.empty()");
    // No existing stable collection is touched by the additive migration.
    for (const collection of [
      "families",
      "memberships",
      "stewards",
      "profiles",
      "claims",
      "invitations",
      "notifications",
      "confirmations",
    ]) {
      expect(body).not.toContain(collection);
    }
  });
});
