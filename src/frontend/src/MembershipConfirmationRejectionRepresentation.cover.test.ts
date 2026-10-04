import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Principal } from "@icp-sdk/core/principal";
import { describe, expect, it } from "vitest";

import {
  type AccountId,
  ConfirmationDecision,
  type MembershipConfirmation,
  MembershipConfirmationState,
} from "@/backend";

// ---------------------------------------------------------------------------
// Cover for the confirmation-dispute change (Onboarding Phase 1D-A): a
// standalone trusted-relative rejection/dispute gets an explicit, persisted
// representation distinct from the Steward-resolution state.
//
// The accepted behavior this file asserts:
//
//   1. `MembershipConfirmationState` exposes `#RejectedByRelative` as a state
//      distinct from `#ResolvedBySteward` and `#StewardReviewRequired`.
//   2. The `MembershipConfirmation` record carries the explicit persisted
//      rejection fields `rejectedByAccountId` / `rejectedAt`, and they are
//      optional so a `#Confirmed` record can omit them.
//   3. The state derivation maps a standalone `#Disputed` (no `#Confirmed`) to
//      `#RejectedByRelative`, a `#Disputed` + `#Confirmed` conflict to
//      `#StewardReviewRequired`, and a persisted Steward resolution to
//      `#ResolvedBySteward` — so a relative rejection is never conflated with a
//      Steward outcome.
//   4. The submit path persists the rejection fields on a `#Disputed` decision
//      and clears them on a `#Confirmed` decision.
//   5. The additive migration backfills a `#Disputed` record with its own
//      confirmer account and `updatedAt`, and leaves a `#Confirmed` record
//      `null`/`null`, without reading or reseeding any other collection.
//
// This is a typed consumer-contract test over the generated bindings plus a
// static-source characterization of the backend invariants. It does NOT
// exercise the real canister: the PocketIC lane is the only place the
// confirmation API's runtime behavior is observed, and it is recorded in the
// episode's coverageLimits. The frontend suite mocks the actor, so none of the
// backend runtime behavior is visible here.
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

const confirmationTypes = stripComments(
  readBackend(path.join("types", "membership-confirmation.mo")),
);
const confirmationLib = stripComments(
  readBackend(path.join("lib", "membership-confirmation.mo")),
);
const rejectionMigration = readBackend(
  path.join("migrations", "20261007_000000.mo"),
);

const CONFIRMER = Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai");

/** A fully-populated `#Disputed` confirmation record with its rejection fields. */
function disputedRecord(): MembershipConfirmation {
  return {
    id: 7n,
    familyId: "norwood",
    membershipId: 3n,
    pendingPersonId: "hudson",
    confirmerAccountId: CONFIRMER,
    confirmerPersonId: "clayton",
    decision: ConfirmationDecision.Disputed,
    relationshipId: 11n,
    rejectedByAccountId: CONFIRMER,
    rejectedAt: 1_700_000_000_000_000_000n,
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
  };
}

// ---------------------------------------------------------------------------
// (1) The new state variant is present and distinct.
// ---------------------------------------------------------------------------

describe("standalone rejection state (cover)", () => {
  it("exposes #RejectedByRelative distinct from the Steward states", () => {
    expect(MembershipConfirmationState.RejectedByRelative).toBe(
      "RejectedByRelative",
    );
    expect(MembershipConfirmationState.RejectedByRelative).not.toBe(
      MembershipConfirmationState.ResolvedBySteward,
    );
    expect(MembershipConfirmationState.RejectedByRelative).not.toBe(
      MembershipConfirmationState.StewardReviewRequired,
    );
  });

  it("declares #RejectedByRelative on the backend state type", () => {
    const start = confirmationTypes.indexOf(
      "public type MembershipConfirmationState = {",
    );
    expect(start).toBeGreaterThan(-1);
    const end = confirmationTypes.indexOf("};", start);
    const state = confirmationTypes.slice(start, end);

    expect(state).toContain("#RejectedByRelative;");
    // The pre-existing variants survive alongside it.
    expect(state).toContain("#AwaitingConfirmation;");
    expect(state).toContain("#ApprovedByRelative;");
    expect(state).toContain("#StewardReviewRequired;");
    expect(state).toContain("#ResolvedBySteward;");
  });
});

// ---------------------------------------------------------------------------
// (2) The record carries the explicit persisted rejection representation.
// ---------------------------------------------------------------------------

describe("explicit persisted rejection representation (cover)", () => {
  it("carries rejectedByAccountId and rejectedAt on a #Disputed record", () => {
    const record = disputedRecord();

    expect(record.rejectedByAccountId).toBe(CONFIRMER);
    expect(record.rejectedAt).toBe(1_700_000_000_000_000_000n);
    expect(record.decision).toBe(ConfirmationDecision.Disputed);
  });

  it("allows a #Confirmed record to omit the rejection fields", () => {
    const confirmed: MembershipConfirmation = {
      ...disputedRecord(),
      decision: ConfirmationDecision.Confirmed,
      rejectedByAccountId: undefined,
      rejectedAt: undefined,
    };

    expect(confirmed.rejectedByAccountId).toBeUndefined();
    expect(confirmed.rejectedAt).toBeUndefined();
  });

  it("declares the rejection fields on the backend record type", () => {
    const start = confirmationTypes.indexOf(
      "public type MembershipConfirmation = {",
    );
    expect(start).toBeGreaterThan(-1);
    const end = confirmationTypes.indexOf("};", start);
    const record = confirmationTypes.slice(start, end);

    expect(record).toContain("rejectedByAccountId : ?AccountId;");
    expect(record).toContain("rejectedAt : ?Int;");
  });
});

// ---------------------------------------------------------------------------
// (3) The state derivation distinguishes a standalone rejection from a
//     conflict and from a Steward resolution.
// ---------------------------------------------------------------------------

describe("rejection state derivation (cover)", () => {
  it("maps a standalone #Disputed to #RejectedByRelative", () => {
    const start = confirmationLib.indexOf(
      "public func confirmationStateForMembership(",
    );
    expect(start).toBeGreaterThan(-1);
    const end = confirmationLib.indexOf(
      "public func submitConfirmationForFamily(",
      start,
    );
    const stateFn = confirmationLib.slice(start, end);

    // A standalone dispute (hasDisputed and not hasConfirmed) returns
    // #RejectedByRelative, not #StewardReviewRequired.
    expect(stateFn).toContain("if (hasDisputed)");
    expect(stateFn).toContain("#RejectedByRelative");
    // The conflict branch still escalates.
    expect(stateFn).toContain("if (hasDisputed and hasConfirmed)");
    expect(stateFn).toContain("#StewardReviewRequired");
    // A persisted Steward resolution still wins.
    expect(stateFn).toContain("#ResolvedBySteward");
  });

  it("keeps the standalone-rejection branch after the conflict branch", () => {
    const start = confirmationLib.indexOf(
      "public func confirmationStateForMembership(",
    );
    const end = confirmationLib.indexOf(
      "public func submitConfirmationForFamily(",
      start,
    );
    const stateFn = confirmationLib.slice(start, end);

    // The conflict check must precede the standalone-dispute check, or a
    // conflicting case would be misclassified as a standalone rejection.
    const conflictIndex = stateFn.indexOf("hasDisputed and hasConfirmed");
    const standaloneIndex = stateFn.indexOf("if (hasDisputed)");
    expect(conflictIndex).toBeGreaterThan(-1);
    expect(standaloneIndex).toBeGreaterThan(conflictIndex);
  });
});

// ---------------------------------------------------------------------------
// (4) The submit path persists and clears the rejection fields.
// ---------------------------------------------------------------------------

describe("rejection persistence on submit (cover)", () => {
  it("sets the rejection fields on #Disputed and clears them on #Confirmed", () => {
    const start = confirmationLib.indexOf(
      "public func submitConfirmationForFamily(",
    );
    expect(start).toBeGreaterThan(-1);
    const end = confirmationLib.indexOf(
      "public func resolveConfirmationForFamily(",
      start,
    );
    const submitFn = confirmationLib.slice(start, end);

    // The rejection fields are derived from the decision, never caller-supplied.
    expect(submitFn).toContain("rejectedByAccountId =");
    expect(submitFn).toContain("rejectedAt =");
    expect(submitFn).toContain("case (#Disputed) ?caller");
    expect(submitFn).toContain("case (#Confirmed) null");
  });
});

// ---------------------------------------------------------------------------
// (5) The additive migration backfills the rejection representation.
// ---------------------------------------------------------------------------

describe("rejection migration (cover)", () => {
  it("backfills a #Disputed record and leaves a #Confirmed record null", () => {
    expect(rejectionMigration).toContain("rejectedByAccountId : ?Principal;");
    expect(rejectionMigration).toContain("rejectedAt : ?Int;");
    expect(rejectionMigration).toContain(
      "case (#Disputed) ?c.confirmerAccountId",
    );
    expect(rejectionMigration).toContain("case (#Disputed) ?c.updatedAt");
    expect(rejectionMigration).toContain("case (#Confirmed) null");
  });

  it("is additive only and does not read or reseed other collections", () => {
    const body = stripComments(rejectionMigration);
    // Only the confirmations list is declared and mapped.
    expect(body).toContain(
      "confirmations : List.List<OldMembershipConfirmation>",
    );
    expect(body).toContain(
      "confirmations : List.List<NewMembershipConfirmation>",
    );
    // No other stable collection is touched.
    expect(body).not.toContain("norwood");
    expect(body).not.toContain("families");
    expect(body).not.toContain("memberships");
    expect(body).not.toContain("stewards");
    expect(body).not.toContain("profiles");
    expect(body).not.toContain("claims");
    expect(body).not.toContain("invitations");
    expect(body).not.toContain("notifications");
  });

  it("keeps the pre-existing confirmation fields through the migration", () => {
    // The migration copies every pre-existing field, so no confirmation data is
    // dropped by the additive change.
    for (const field of [
      "id = c.id;",
      "familyId = c.familyId;",
      "membershipId = c.membershipId;",
      "pendingPersonId = c.pendingPersonId;",
      "confirmerAccountId = c.confirmerAccountId;",
      "confirmerPersonId = c.confirmerPersonId;",
      "decision = c.decision;",
      "relationshipId = c.relationshipId;",
      "createdAt = c.createdAt;",
      "updatedAt = c.updatedAt;",
    ]) {
      expect(rejectionMigration).toContain(field);
    }
  });
});

// ---------------------------------------------------------------------------
// (6) The generated consumer seam exposes the new state and record fields.
// ---------------------------------------------------------------------------

describe("rejection consumer seam (cover)", () => {
  it("keeps the record's rejection fields assignable to the exported aliases", () => {
    const record = disputedRecord();
    const rejectedBy: AccountId | undefined = record.rejectedByAccountId;
    const rejectedAt: bigint | undefined = record.rejectedAt;

    expect(rejectedBy).toBe(CONFIRMER);
    expect(rejectedAt).toBe(1_700_000_000_000_000_000n);
  });
});
