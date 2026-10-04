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
  type PersonId,
  type Result_19,
  type Result_28,
  SimpleRelationshipType,
} from "@/backend";

// ---------------------------------------------------------------------------
// Characterization baseline for the ADJACENT working behavior that the new
// family-scoped Steward review query
// (`listMembershipConfirmationReviewsForSteward(familyId)`) must NOT disturb.
//
// The requested change adds a new Steward-authorized, family-scoped read that
// returns only UNRESOLVED cases requiring Steward review, with privacy-safe
// fields. That method does not exist yet, so this file deliberately does NOT
// characterize it. What it protects is the existing behavior the new query is
// built on and must reuse rather than reimplement:
//
//   A. The existing Steward read (`getMembershipConfirmationStateForSteward`)
//      keeps its Steward-of-family gate and its family scoping. The new query
//      shares that authorization seam, so a regression here would silently
//      widen or narrow the new query's audience too.
//   B. The confirmation state derivation keeps `#StewardReviewRequired` as the
//      UNRESOLVED state and `#ResolvedBySteward` as the resolved state. The new
//      query's "unresolved only" filter depends on that classification, so it
//      must not drift.
//   C. The existing privacy-safe view (`EligibleMembershipConfirmationView`)
//      carries no account principal and no sensitive relationship context. The
//      new query's privacy-safe fields must follow the same rule.
//   D. The `MembershipConfirmation` record and the confirmation API keep their
//      family-scoping and redaction invariants: the record carries only a
//      numeric `relationshipId`, never a relationship type or a sensitive
//      relationship-context label (Biological/Adoptive/Foster/Step/Guardian).
//   E. The generated consumer seam keeps the existing confirmation methods and
//      their Result shapes, so the frontend's typed calls keep compiling.
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

const confirmationTypes = stripComments(
  readBackend(path.join("types", "membership-confirmation.mo")),
);
const confirmationLib = stripComments(
  readBackend(path.join("lib", "membership-confirmation.mo")),
);
const confirmationApi = stripComments(
  readBackend(path.join("mixins", "membership-confirmation-api.mo")),
);
const stewardAuthorityLib = stripComments(
  readBackend(path.join("lib", "steward-authority.mo")),
);
const mainSource = stripComments(readBackend("main.mo"));

const CONFIRMER = Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai");

/** A fully-populated confirmation record, built from the app's own exported type. */
function confirmationRecord(): MembershipConfirmation {
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
// A. The existing Steward read keeps its Steward-of-family gate and scoping.
// ---------------------------------------------------------------------------

describe("existing Steward confirmation read authorization (characterization)", () => {
  it("keeps the Steward read gated on active Steward authority for the family", () => {
    const start = confirmationApi.indexOf(
      "public query ({ caller }) func getMembershipConfirmationStateForSteward(",
    );
    expect(start).toBeGreaterThan(-1);
    const end = confirmationApi.indexOf(
      "public query ({ caller }) func",
      start + 1,
    );
    expect(end).toBeGreaterThan(start);
    const stewardRead = confirmationApi.slice(start, end);

    // Anonymous callers are denied before the Steward predicate is consulted.
    expect(stewardRead).toContain("caller.isAnonymous()");
    expect(stewardRead).toContain("#NotSignedIn");
    // The gate is the canonical family-scoped active-Steward check, never the
    // platform admin role.
    expect(stewardRead).toContain(
      "StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)",
    );
    expect(stewardRead).toContain("#NotAuthorized");
    expect(stewardRead).not.toContain("isCallerAdmin");
  });

  it("keeps the canonical active-Steward predicate family-scoped", () => {
    const start = stewardAuthorityLib.indexOf(
      "public func isActiveStewardForFamily(",
    );
    expect(start).toBeGreaterThan(-1);
    const end = stewardAuthorityLib.indexOf("};", start);
    const predicate = stewardAuthorityLib.slice(start, end);

    // Authority in one family never grants authority in another: the record's
    // own familyId must equal the requested familyId.
    expect(predicate).toContain("s.stewardAccountId == caller");
    expect(predicate).toContain("s.roleStatus == #Active");
    expect(predicate).toContain("s.familyId == familyId");
  });

  it("keeps the Steward read family-scoped to the requested family", () => {
    const start = confirmationApi.indexOf(
      "public query ({ caller }) func getMembershipConfirmationStateForSteward(",
    );
    const end = confirmationApi.indexOf(
      "public query ({ caller }) func",
      start + 1,
    );
    const stewardRead = confirmationApi.slice(start, end);

    // The membership must belong to the requested family, and the decisions and
    // resolution are read through the family-scoped library helpers.
    expect(stewardRead).toContain(
      "MembershipLib.getMembershipByIdForFamily(memberships, familyId, membershipId)",
    );
    expect(stewardRead).toContain(
      "ConfirmationLib.listConfirmationsForMembership(confirmations, familyId, membershipId)",
    );
    expect(stewardRead).toContain(
      "ConfirmationLib.getResolutionForFamily(resolutions, familyId, membershipId)",
    );
  });
});

// ---------------------------------------------------------------------------
// B. The state derivation keeps #StewardReviewRequired unresolved and
//    #ResolvedBySteward resolved.
// ---------------------------------------------------------------------------

describe("confirmation state classification (characterization)", () => {
  it("keeps #StewardReviewRequired and #ResolvedBySteward as distinct states", () => {
    // The new query's "unresolved only" filter depends on this classification:
    // a case at #StewardReviewRequired is open, a case at #ResolvedBySteward is
    // closed. Both variants must remain present and distinct.
    expect(MembershipConfirmationState.StewardReviewRequired).toBe(
      "StewardReviewRequired",
    );
    expect(MembershipConfirmationState.ResolvedBySteward).toBe(
      "ResolvedBySteward",
    );
    expect(MembershipConfirmationState.StewardReviewRequired).not.toBe(
      MembershipConfirmationState.ResolvedBySteward,
    );
  });

  it("derives #ResolvedBySteward from a persisted Steward resolution", () => {
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

    // A persisted #Approve or #Reject resolution yields #ResolvedBySteward.
    expect(stateFn).toContain("#Approve");
    expect(stateFn).toContain("#Reject");
    expect(stateFn).toContain("#ResolvedBySteward");
    // #NeedsMoreInformation writes no record, so the case stays open.
    expect(stateFn).toContain("#NeedsMoreInformation");
    // A dispute (with or without a confirmation) escalates to Steward review.
    expect(stateFn).toContain("#StewardReviewRequired");
    expect(stateFn).toContain("hasDisputed");
  });

  it("keeps the state derived, never duplicating membership status", () => {
    const start = confirmationLib.indexOf(
      "public func confirmationStateForMembership(",
    );
    const end = confirmationLib.indexOf(
      "public func submitConfirmationForFamily(",
      start,
    );
    const stateFn = confirmationLib.slice(start, end);

    // The state is derived from confirmation records and resolutions only.
    expect(stateFn).not.toContain("membership.status");
    expect(stateFn).not.toContain("FamilyMembership");
  });
});

// ---------------------------------------------------------------------------
// C. The existing privacy-safe view carries no account principal and no
//    sensitive relationship context.
// ---------------------------------------------------------------------------

describe("privacy-safe confirmation view (characterization)", () => {
  it("declares the eligible view without an account principal or sensitive context", () => {
    const start = confirmationTypes.indexOf(
      "public type EligibleMembershipConfirmationView = {",
    );
    expect(start).toBeGreaterThan(-1);
    const end = confirmationTypes.indexOf("};", start);
    const view = confirmationTypes.slice(start, end);

    // The view carries the family-safe fields the confirmation card needs.
    expect(view).toContain("familyId : FamilyId;");
    expect(view).toContain("membershipId : Nat;");
    expect(view).toContain("pendingPersonId : PersonId;");
    expect(view).toContain("displayName : Text;");
    expect(view).toContain("simpleRelationship : SimpleRelationshipType;");
    expect(view).toContain("confirmationState : MembershipConfirmationState;");
    // It never carries an applicant or confirmer account principal.
    expect(view).not.toMatch(/\bconfirmerAccountId\s*:/u);
    expect(view).not.toMatch(/\bconfirmerPersonId\s*:/u);
    expect(view).not.toMatch(/\baccountId\s*:/u);
    // It never carries sensitive relationship context.
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

  it("types the eligible view with no account principal field at runtime", () => {
    const view: Result_19 = {
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
          confirmationState: MembershipConfirmationState.StewardReviewRequired,
        },
      ],
    };

    expect(view.ok).toHaveLength(1);
    expect(view.ok[0]?.confirmationState).toBe(
      MembershipConfirmationState.StewardReviewRequired,
    );
    expect(view.ok[0]).not.toHaveProperty("confirmerAccountId");
    expect(view.ok[0]).not.toHaveProperty("confirmerPersonId");
    expect(view.ok[0]).not.toHaveProperty("accountId");
  });
});

// ---------------------------------------------------------------------------
// D. The record and API keep their family-scoping and redaction invariants.
// ---------------------------------------------------------------------------

describe("confirmation record redaction invariant (characterization)", () => {
  it("stores only a numeric relationshipId, never a relationship type or label", () => {
    const record = confirmationRecord();

    expect(typeof record.relationshipId).toBe("bigint");
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

  it("keeps the confirmation collections separate from the other stable state", () => {
    expect(mainSource).toContain(
      "let confirmations : List.List<MembershipConfirmationTypes.MembershipConfirmation>;",
    );
    expect(mainSource).toContain(
      "let stewardResolutions : List.List<MembershipConfirmationTypes.MembershipConfirmationResolutionRecord>;",
    );
    expect(mainSource).toContain(
      "include MembershipConfirmationApi(confirmations, stewardResolutions, memberships, profiles, claims, confirmedRelationships, stewards);",
    );
  });
});

// ---------------------------------------------------------------------------
// E. The generated consumer seam keeps the existing confirmation methods.
// ---------------------------------------------------------------------------

describe("confirmation consumer seam (characterization)", () => {
  it("keeps the existing confirmation methods on the generated service type", () => {
    const serviceMethods = [
      "confirmPendingMembership",
      "resolveMembershipConfirmation",
      "getMyMembershipConfirmationState",
      "getMembershipConfirmationStateForSteward",
      "getMyConfirmationForMembership",
      "listMyEligibleMembershipConfirmationsForFamily",
    ];
    const backendSource = readFileSync(path.join(here, "backend.ts"), "utf8");
    for (const method of serviceMethods) {
      expect(backendSource).toContain(`${method}(`);
    }
  });

  it("types the Steward read Result as a state/decisions/resolution tuple", () => {
    const ok: Result_28 = {
      __kind__: "ok",
      ok: [
        MembershipConfirmationState.StewardReviewRequired,
        [confirmationRecord()],
        resolutionRecord(),
      ],
    };
    const err: Result_28 = {
      __kind__: "err",
      err: MembershipConfirmationError.NotAuthorized,
    };

    expect(ok.ok[0]).toBe(MembershipConfirmationState.StewardReviewRequired);
    expect(ok.ok[1]).toHaveLength(1);
    expect(ok.ok[2]?.resolution).toBe(MembershipConfirmationResolution.Approve);
    expect(err.err).toBe(MembershipConfirmationError.NotAuthorized);
  });

  it("keeps the confirmation error vocabulary the frontend reasons about", () => {
    // The new query reuses the existing error variants; it must not rename or
    // drop one the frontend already handles.
    for (const variant of [
      "NotSignedIn",
      "NotAuthorized",
      "NotSteward",
      "MembershipNotFound",
    ]) {
      expect(
        Object.prototype.hasOwnProperty.call(
          MembershipConfirmationError,
          variant,
        ),
      ).toBe(true);
    }
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
