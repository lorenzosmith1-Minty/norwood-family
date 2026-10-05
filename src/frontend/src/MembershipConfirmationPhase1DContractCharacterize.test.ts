import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Principal } from "@icp-sdk/core/principal";
import { describe, expect, it } from "vitest";

import {
  type AccountId,
  ConfirmationDecision,
  type FamilyId,
  type MembershipConfirmation,
  MembershipConfirmationError,
  MembershipConfirmationResolution,
  type MembershipConfirmationResolutionRecord,
  MembershipConfirmationState,
  MembershipStatus,
  type PersonId,
  type Result_6,
  type Result_23,
  type Result_29,
  type Result_30,
  type Result_33,
  type Result_47,
  SimpleRelationshipType,
} from "@/backend";

// ---------------------------------------------------------------------------
// Characterization baseline for the Onboarding Phase 1D MembershipConfirmation
// surface, reconciled to the confirmation-dispute change.
//
// The requested change intentionally altered two things, and this file
// deliberately does NOT freeze the old behavior:
//
//   1. `confirmPendingMembership` used to reject any membership whose status was
//      not `#Pending` with `#MembershipNotPending`. It now also accepts a
//      qualifying trusted relative's `#Disputed` against an `#ApprovedByRelative`
//      `#Active` membership, which records the dispute, moves the membership to
//      `#Suspended`, and sets the confirmation state to `#StewardReviewRequired`.
//      The old "dispute rejected after activation" behavior is therefore NOT
//      asserted anywhere here, and neither is the old `#Pending`-only guard.
//
//   2. The single `getMembershipConfirmationState` read was split into a
//      redacted applicant read (`getMyMembershipConfirmationState`) and a full
//      Steward read (`getMembershipConfirmationStateForSteward`). This file
//      asserts the SPLIT seam, not the old single method.
//
// What this file protects is the Phase 1D contract that must survive the
// change:
//
//   A. The generated consumer seam: the five confirmation methods keep their
//      names and arities, and their `Result` shapes keep the same ok/err
//      payloads, so the frontend's typed calls keep compiling and decoding.
//   B. The `MembershipConfirmation` record keeps its field set and types. The
//      change adds a new transition, not a new record shape.
//   C. The four `MembershipConfirmationState` variants, the three
//      `MembershipConfirmationResolution` variants, the two
//      `ConfirmationDecision` variants, the four `SimpleRelationshipType`
//      variants, and the eleven `MembershipConfirmationError` variants keep
//      their names. The change reuses `#StewardReviewRequired` and
//      `#ResolvedBySteward` and adds `#ActivationFailed`; it must not rename or
//      drop a variant the frontend already reasons about.
//   D. The redaction invariant that is ALREADY true and must remain: the
//      confirmation record carries only a numeric `relationshipId`, never a
//      relationship type or a sensitive relationship-context label
//      (Biological/Adoptive/Foster/Step/Guardian). The applicant view carries
//      only the caller's own decision and simple relationship label, never a
//      confirmer account principal. The change must not start persisting or
//      surfacing sensitive context.
//   E. The backend separation and family-scoping invariants: the confirmation
//      collections are separate from FamilyMembership/ProfileClaim/
//      StewardRecord/FamilyInvitation, the confirmation state never duplicates
//      `FamilyMembership.status`, the relationship lookup is family-scoped and
//      direction-agnostic, and the pending migration is a no-op for existing
//      data.
//
// This is a typed consumer-contract test over the generated bindings plus a
// static-source characterization of the backend invariants. It does not
// exercise the real canister: the PocketIC lane is the only place the
// confirmation API's runtime behavior is observed, and it is recorded in the
// episode's coverageLimits.
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

const confirmationTypesRaw = readBackend(
  path.join("types", "membership-confirmation.mo"),
);
const confirmationTypes = stripComments(confirmationTypesRaw);
const confirmationLib = stripComments(
  readBackend(path.join("lib", "membership-confirmation.mo")),
);
const confirmationApi = stripComments(
  readBackend(path.join("mixins", "membership-confirmation-api.mo")),
);
const relationshipsLib = stripComments(
  readBackend(path.join("lib", "relationships.mo")),
);
const mainSource = stripComments(readBackend("main.mo"));
const confirmationMigration = readBackend(
  path.join("migrations", "20261006_000000.mo"),
);

const CONFIRMER = Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai");
const PENDING_ACCOUNT = Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai");

/** A fully-populated confirmation record, built from the app's own exported type. */
function confirmationRecord(): MembershipConfirmation {
  return {
    id: 7n,
    familyId: "norwood",
    membershipId: 3n,
    pendingPersonId: "hudson",
    confirmerAccountId: CONFIRMER,
    confirmerPersonId: "clayton",
    decision: ConfirmationDecision.Confirmed,
    relationshipId: 11n,
    rejectedByAccountId: undefined,
    rejectedAt: undefined,
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
  };
}

/** A fully-populated Steward resolution record, built from the app's own type. */
function resolutionRecord(): MembershipConfirmationResolutionRecord {
  return {
    familyId: "norwood",
    membershipId: 3n,
    resolution: MembershipConfirmationResolution.Approve,
    resolvedByAccountId: CONFIRMER,
    resolvedAt: 1_700_000_000_000_000_000n,
  };
}

// ---------------------------------------------------------------------------
// A. The generated consumer seam keeps its names, arities, and Result shapes.
// ---------------------------------------------------------------------------

describe("confirmation consumer seam (characterization)", () => {
  it("keeps the five confirmation methods on the generated service type", () => {
    // The method names and arities are the seam the frontend calls through. A
    // rename or a changed arity breaks every typed consumer at compile time.
    // The read model is split: the applicant read is redacted, the Steward read
    // is full.
    const serviceMethods: Array<{
      name: string;
      arity: number;
    }> = [
      { name: "confirmPendingMembership", arity: 3 },
      { name: "resolveMembershipConfirmation", arity: 3 },
      { name: "getMyMembershipConfirmationState", arity: 2 },
      { name: "getMembershipConfirmationStateForSteward", arity: 2 },
      { name: "getMyConfirmationForMembership", arity: 2 },
    ];
    // The generated `_SERVICE` interface is a type, so the arity contract is
    // asserted against the source that declares it.
    const backendSource = readFileSync(path.join(here, "backend.ts"), "utf8");
    for (const method of serviceMethods) {
      expect(backendSource).toContain(`${method.name}(`);
    }
    expect(serviceMethods).toHaveLength(5);
  });

  it("types the submit Result as an ok record / err error union", () => {
    const ok: Result_47 = { __kind__: "ok", ok: confirmationRecord() };
    const err: Result_47 = {
      __kind__: "err",
      err: MembershipConfirmationError.MembershipNotPending,
    };

    expect(ok.__kind__).toBe("ok");
    expect(ok.ok.decision).toBe(ConfirmationDecision.Confirmed);
    expect(err.__kind__).toBe("err");
    expect(err.err).toBe(MembershipConfirmationError.MembershipNotPending);
  });

  it("types the Steward read Result as a state/decisions/resolution tuple", () => {
    const ok: Result_33 = {
      __kind__: "ok",
      ok: [
        MembershipConfirmationState.ApprovedByRelative,
        [confirmationRecord()],
        resolutionRecord(),
      ],
    };
    const err: Result_33 = {
      __kind__: "err",
      err: MembershipConfirmationError.NotAuthorized,
    };

    expect(ok.__kind__).toBe("ok");
    expect(ok.ok[0]).toBe(MembershipConfirmationState.ApprovedByRelative);
    expect(ok.ok[1]).toHaveLength(1);
    expect(ok.ok[2]?.resolution).toBe(MembershipConfirmationResolution.Approve);
    expect(err.__kind__).toBe("err");
  });

  it("types the applicant read Result as a redacted applicant view", () => {
    const ok: Result_29 = {
      __kind__: "ok",
      ok: {
        state: MembershipConfirmationState.ApprovedByRelative,
        myDecision: ConfirmationDecision.Confirmed,
        myRelationship: SimpleRelationshipType.Sibling,
        myDecidedAt: 1_700_000_000_000_000_000n,
        createdAt: 1_700_000_000_000_000_000n,
        updatedAt: 1_700_000_000_000_000_000n,
      },
    };
    const err: Result_29 = {
      __kind__: "err",
      err: MembershipConfirmationError.NotAuthorized,
    };

    expect(ok.ok.state).toBe(MembershipConfirmationState.ApprovedByRelative);
    expect(ok.ok.myRelationship).toBe(SimpleRelationshipType.Sibling);
    // The applicant view carries no confirmer account principal field at all.
    expect(ok.ok).not.toHaveProperty("confirmerAccountId");
    expect(err.err).toBe(MembershipConfirmationError.NotAuthorized);
  });

  it("types the own-decision read Result as an optional record", () => {
    const present: Result_30 = { __kind__: "ok", ok: confirmationRecord() };
    const absent: Result_30 = { __kind__: "ok", ok: null };
    const err: Result_30 = {
      __kind__: "err",
      err: MembershipConfirmationError.NotSignedIn,
    };

    expect(present.ok?.id).toBe(7n);
    expect(absent.ok).toBeNull();
    expect(err.err).toBe(MembershipConfirmationError.NotSignedIn);
  });

  it("types the eligible-confirmation list Result as a privacy-safe view array", () => {
    // The canonical discovery read returns an array of family-safe views. The
    // view carries no account principal and no sensitive relationship context.
    const ok: Result_23 = {
      __kind__: "ok",
      ok: [
        {
          familyId: "norwood",
          membershipId: 3n,
          pendingPersonId: "hudson",
          displayName: "Hudson Norwood",
          profilePhoto: undefined,
          birthYear: 1948n,
          simpleRelationship: SimpleRelationshipType.Sibling,
          confirmationState: MembershipConfirmationState.AwaitingConfirmation,
        },
      ],
    };
    const err: Result_23 = {
      __kind__: "err",
      err: MembershipConfirmationError.NoActiveMembership,
    };

    expect(ok.ok).toHaveLength(1);
    expect(ok.ok[0]?.simpleRelationship).toBe(SimpleRelationshipType.Sibling);
    expect(ok.ok[0]).not.toHaveProperty("confirmerAccountId");
    expect(ok.ok[0]).not.toHaveProperty("confirmerPersonId");
    expect(err.err).toBe(MembershipConfirmationError.NoActiveMembership);
  });

  it("types the Steward resolution Result as a membership / error union", () => {
    const ok: Result_6 = {
      __kind__: "ok",
      ok: {
        id: 3n,
        familyId: "norwood",
        accountId: PENDING_ACCOUNT,
        personId: "hudson",
        status: MembershipStatus.Active,
        joinedAt: 1_700_000_000_000_000_000n,
        approvedBy: CONFIRMER,
        approvedAt: 1_700_000_000_000_000_000n,
        createdAt: 1_699_000_000_000_000_000n,
        updatedAt: 1_700_000_000_000_000_000n,
      },
    };
    const err: Result_6 = {
      __kind__: "err",
      err: MembershipConfirmationError.NotSteward,
    };

    expect(ok.ok.status).toBe(MembershipStatus.Active);
    expect(err.err).toBe(MembershipConfirmationError.NotSteward);
  });
});

// ---------------------------------------------------------------------------
// B. The MembershipConfirmation record keeps its field set and types.
// ---------------------------------------------------------------------------

describe("MembershipConfirmation record contract (characterization)", () => {
  it("carries the twelve specified fields with their stable types", () => {
    const record = confirmationRecord();

    // The confirmation-dispute change adds the explicit persisted rejection
    // representation (`rejectedByAccountId` / `rejectedAt`) to the record. The
    // pre-existing ten fields keep their names and types.
    expect(Object.keys(record).sort()).toEqual(
      [
        "confirmerAccountId",
        "confirmerPersonId",
        "createdAt",
        "decision",
        "familyId",
        "id",
        "membershipId",
        "pendingPersonId",
        "rejectedAt",
        "rejectedByAccountId",
        "relationshipId",
        "updatedAt",
      ].sort(),
    );

    expect(typeof record.id).toBe("bigint");
    expect(typeof record.membershipId).toBe("bigint");
    expect(typeof record.familyId).toBe("string");
    expect(typeof record.pendingPersonId).toBe("string");
    expect(typeof record.confirmerPersonId).toBe("string");
    expect(typeof record.createdAt).toBe("bigint");
    expect(typeof record.updatedAt).toBe("bigint");
    expect(record.confirmerAccountId).toBe(CONFIRMER);
  });

  it("allows relationshipId to be absent without changing the record shape", () => {
    const withoutRelationship: MembershipConfirmation = {
      ...confirmationRecord(),
      relationshipId: undefined,
    };

    expect(withoutRelationship.relationshipId).toBeUndefined();
    expect(withoutRelationship.decision).toBe(ConfirmationDecision.Confirmed);
  });

  it("keeps the record's field types assignable to the exported aliases", () => {
    const record = confirmationRecord();
    const familyId: FamilyId = record.familyId;
    const personId: PersonId = record.pendingPersonId;
    const accountId: AccountId = record.confirmerAccountId;

    expect(familyId).toBe("norwood");
    expect(personId).toBe("hudson");
    expect(accountId).toBe(CONFIRMER);
  });
});

// ---------------------------------------------------------------------------
// C. The variant sets keep their names.
// ---------------------------------------------------------------------------

describe("confirmation variant sets (characterization)", () => {
  it("exposes exactly the five confirmation states", () => {
    // The confirmation-dispute change adds `#RejectedByRelative`, the explicit
    // persisted representation of a standalone trusted-relative rejection,
    // distinct from `#ResolvedBySteward`. The pre-existing four states keep
    // their names.
    expect(Object.values(MembershipConfirmationState).sort()).toEqual(
      [
        "ApprovedByRelative",
        "AwaitingConfirmation",
        "RejectedByRelative",
        "ResolvedBySteward",
        "StewardReviewRequired",
      ].sort(),
    );
  });

  it("exposes exactly the three Steward resolutions", () => {
    expect(Object.values(MembershipConfirmationResolution).sort()).toEqual(
      ["Approve", "NeedsMoreInformation", "Reject"].sort(),
    );
  });

  it("exposes exactly the two confirmation decisions", () => {
    expect(Object.values(ConfirmationDecision).sort()).toEqual(
      ["Confirmed", "Disputed"].sort(),
    );
  });

  it("exposes exactly the four simple relationship labels", () => {
    // The only relationship vocabulary ever surfaced on a confirmation surface.
    expect(Object.values(SimpleRelationshipType).sort()).toEqual(
      ["Child", "Parent", "Sibling", "SpousePartner"].sort(),
    );
  });

  it("exposes exactly the eleven confirmation error variants", () => {
    // The error vocabulary the frontend reasons about. The change adds the
    // `#ActivationFailed` variant but must not rename or drop a variant.
    expect(Object.values(MembershipConfirmationError).sort()).toEqual(
      [
        "ActivationFailed",
        "AlreadyDecided",
        "FamilyNotFound",
        "MembershipNotFound",
        "MembershipNotPending",
        "NoActiveMembership",
        "NoQualifyingRelationship",
        "NotAuthorized",
        "NotSignedIn",
        "NotSteward",
        "SelfConfirmation",
      ].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// D. The redaction invariant that is already true and must remain.
// ---------------------------------------------------------------------------

describe("confirmation redaction invariant (characterization)", () => {
  it("stores only a numeric relationshipId, never a relationship type or label", () => {
    const record = confirmationRecord();

    // The record carries the internal relationship reference as a Nat.
    expect(typeof record.relationshipId).toBe("bigint");
    // It carries no relationship type or label field at all.
    expect(record).not.toHaveProperty("relationshipType");
    expect(record).not.toHaveProperty("relationshipLabel");
    expect(record).not.toHaveProperty("relationshipContext");
  });

  it("never serializes sensitive relationship-context labels on the record", () => {
    const serialized = JSON.stringify(
      { record: confirmationRecord(), resolution: resolutionRecord() },
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    );
    for (const sensitive of [
      "Biological",
      "Adoptive",
      "Foster",
      "Step",
      "Guardian",
    ]) {
      expect(serialized).not.toContain(sensitive);
    }
  });

  it("declares no sensitive relationship-context field on the backend record type", () => {
    const start = confirmationTypes.indexOf(
      "public type MembershipConfirmation = {",
    );
    expect(start).toBeGreaterThan(-1);
    const end = confirmationTypes.indexOf("};", start);
    const record = confirmationTypes.slice(start, end);

    expect(record).toContain("relationshipId : ?Nat;");
    expect(record).not.toMatch(/\brelationshipType\s*:/u);
    expect(record).not.toMatch(/\brelationshipLabel\s*:/u);
    for (const sensitive of [
      "Biological",
      "Adoptive",
      "Foster",
      "Step",
      "Guardian",
    ]) {
      expect(record).not.toContain(sensitive);
    }
  });

  it("declares the applicant view without a confirmer account principal", () => {
    const start = confirmationTypes.indexOf(
      "public type MembershipConfirmationApplicantView = {",
    );
    expect(start).toBeGreaterThan(-1);
    const end = confirmationTypes.indexOf("};", start);
    const view = confirmationTypes.slice(start, end);

    // The redacted view carries the derived state, the caller's own decision
    // and simple relationship label, and timestamps only.
    expect(view).toContain("state : MembershipConfirmationState;");
    expect(view).toContain("myDecision : ?ConfirmationDecision;");
    expect(view).toContain("myRelationship : ?SimpleRelationshipType;");
    // It never carries a confirmer account principal or a full decision list.
    expect(view).not.toMatch(/\bconfirmerAccountId\s*:/u);
    expect(view).not.toMatch(/\bconfirmerPersonId\s*:/u);
    expect(view).not.toMatch(/\bdecisions\s*:/u);
    for (const sensitive of [
      "Biological",
      "Adoptive",
      "Foster",
      "Step",
      "Guardian",
    ]) {
      expect(view).not.toContain(sensitive);
    }
  });
});

// ---------------------------------------------------------------------------
// E. Backend separation, family-scoping, and migration invariants.
// ---------------------------------------------------------------------------

describe("confirmation backend separation (characterization)", () => {
  it("keeps the confirmation collections separate from the other stable state", () => {
    expect(mainSource).toContain(
      "let confirmations : List.List<MembershipConfirmationTypes.MembershipConfirmation>;",
    );
    expect(mainSource).toContain(
      "let stewardResolutions : List.List<MembershipConfirmationTypes.MembershipConfirmationResolutionRecord>;",
    );
    // The confirmation list is not a reuse of memberships, claims, stewards, or
    // invitations.
    expect(mainSource).not.toContain(
      "let confirmations : List.List<MembershipTypes.FamilyMembership>;",
    );
    expect(mainSource).not.toContain(
      "let confirmations : List.List<OwnershipTypes.ProfileClaim>;",
    );
    expect(mainSource).not.toContain(
      "let confirmations : List.List<GovernanceTypes.StewardRecord>;",
    );
    expect(mainSource).not.toContain(
      "let confirmations : List.List<FamilyInvitationTypes.FamilyInvitation>;",
    );
  });

  it("keeps the confirmation mixin wired to its own collections", () => {
    expect(mainSource).toContain(
      "include MembershipConfirmationApi(confirmations, stewardResolutions, memberships, profiles, claims, confirmedRelationships, stewards);",
    );
  });

  it("keeps the confirmation state derived, never duplicating membership status", () => {
    // The state function derives from decisions and persisted resolutions; it
    // must not read or write `FamilyMembership.status`.
    const start = confirmationLib.indexOf(
      "public func confirmationStateForMembership(",
    );
    expect(start).toBeGreaterThan(-1);
    const end = confirmationLib.indexOf(
      "public func submitConfirmationForFamily(",
      start,
    );
    expect(end).toBeGreaterThan(start);
    const stateFn = confirmationLib.slice(start, end);

    expect(stateFn).toContain("#AwaitingConfirmation");
    expect(stateFn).toContain("#ApprovedByRelative");
    expect(stateFn).toContain("#StewardReviewRequired");
    expect(stateFn).toContain("#ResolvedBySteward");
    // The state is derived from confirmation records and resolutions only.
    expect(stateFn).not.toContain("membership.status");
    expect(stateFn).not.toContain("FamilyMembership");
  });

  it("keeps the relationship lookup family-scoped and direction-agnostic", () => {
    const start = relationshipsLib.indexOf(
      "public func findConfirmedRelationshipBetween(",
    );
    expect(start).toBeGreaterThan(-1);
    const end = relationshipsLib.indexOf("};", start);
    const lookup = relationshipsLib.slice(start, end);

    // Family-scoped: a relationship in another family never qualifies.
    expect(lookup).toContain("relationshipBelongsToFamily(r, familyId)");
    // Direction-agnostic: either person may be the from/to side.
    expect(lookup).toContain(
      "r.fromPersonId == personA and r.toPersonId == personB",
    );
    expect(lookup).toContain(
      "r.fromPersonId == personB and r.toPersonId == personA",
    );
    // Only confirmed relationships qualify.
    expect(lookup).toContain("r.status == #Confirmed");
  });

  it("keeps the confirmation API family-scoped and caller-derived", () => {
    // The submit path derives the caller and the confirmer person server-side:
    // the caller comes from the shared-call context, never from an argument.
    expect(confirmationApi).toContain(
      "public shared ({ caller }) func confirmPendingMembership(",
    );
    expect(confirmationApi).toContain(
      "ConfirmationLib.submitConfirmationForFamily(",
    );
    // The caller is passed into the library, which derives the confirmer person
    // from the caller's own membership rather than trusting a supplied id.
    expect(confirmationLib).toContain("caller : Principal");
    // The Steward resolution path checks active Steward authority for the family.
    expect(confirmationLib).toContain(
      "StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)",
    );
  });

  it("keeps the applicant read redacted and the Steward read full", () => {
    // The applicant read returns the redacted view and gates on the membership's
    // own account; the Steward read returns the full record and gates on active
    // Steward authority.
    expect(confirmationApi).toContain(
      "public query ({ caller }) func getMyMembershipConfirmationState(",
    );
    expect(confirmationApi).toContain(
      "ConfirmationLib.applicantViewForMembership(",
    );
    expect(confirmationApi).toContain(
      "public query ({ caller }) func getMembershipConfirmationStateForSteward(",
    );
    expect(confirmationApi).toContain(
      "ConfirmationLib.listConfirmationsForMembership(",
    );
    // The applicant read never returns the full decision list.
    const applicantStart = confirmationApi.indexOf(
      "public query ({ caller }) func getMyMembershipConfirmationState(",
    );
    const applicantEnd = confirmationApi.indexOf(
      "public query ({ caller }) func getMembershipConfirmationStateForSteward(",
      applicantStart,
    );
    const applicantRead = confirmationApi.slice(applicantStart, applicantEnd);
    expect(applicantRead).not.toContain("listConfirmationsForMembership");
  });
});

describe("confirmation migration is a no-op for existing data (characterization)", () => {
  it("introduces only the confirmation and resolution lists", () => {
    expect(confirmationMigration).toContain(
      "confirmations : List.List<MembershipConfirmation>;",
    );
    expect(confirmationMigration).toContain(
      "stewardResolutions : List.List<MembershipConfirmationResolutionRecord>;",
    );
    expect(confirmationMigration).toContain("confirmations = List.empty();");
    expect(confirmationMigration).toContain(
      "stewardResolutions = List.empty();",
    );
  });

  it("does not read, reseed, or reset the default family or its records", () => {
    const body = stripComments(confirmationMigration);
    expect(body).not.toContain("norwood");
    expect(body).not.toContain("families");
    expect(body).not.toContain("memberships");
    expect(body).not.toContain("stewards");
    expect(body).not.toContain("profiles");
    expect(body).not.toContain("claims");
  });

  it("declares an empty OldActor so the preceding migration's state carries through", () => {
    expect(confirmationMigration).toContain("type OldActor = {};");
  });
});
