import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type {
  ArchiveError,
  ConflictReviewItem,
  DeleteError,
  EligibleMembershipConfirmationView,
  FamilyInvitation,
  FamilyInvitationCreateOutcome,
  FamilyInvitationError,
  FamilyInvitationPreview,
  FamilyMembership,
  InvitationRedemptionState,
  MembershipConfirmation,
  MembershipConfirmationApplicantView,
  MembershipConfirmationError,
  MembershipConfirmationResolutionRecord,
  MembershipConfirmationReviewView,
  MembershipConfirmationState,
  MembershipError,
  MergeError,
  MergeResult,
  Message,
  MessageError,
  NewPersonCandidate,
  ProfileRemovalRequest,
  ProposedFinding,
  Relationship,
  RelationshipAdminError,
  RelationshipProposal,
  RemovalError,
  ResearchError,
  Result_1,
  Result_3,
  Result_4,
  Result_5,
  Result_6,
  Result_7,
  Result_9,
  Result_11,
  Result_12,
  Result_15,
  Result_16,
  Result_17,
  Result_19,
  Result_23,
  Result_25,
  Result_29,
  Result_30,
  Result_33,
  Result_34,
  Result_35,
  Result_36,
  Result_38,
  Result_39,
  Result_40,
  Result_42,
  Result_43,
  Result_46,
  Result_47,
  SourceRecord,
  StewardError,
  StewardRecord,
  SuccessorDesignation,
} from "@/backend";

// ---------------------------------------------------------------------------
// Characterization baseline for the Phase 4A Recovery alias remap.
//
// Adding the eight family-scoped recovery endpoints to the Candid interface
// inserts new `Result` aliases into the generated bindings, which renumbers
// every `Result_N` alias that follows. The frontend consumer modules
// (`types/governance.ts`, `types/messaging.ts`, `types/research-intake.ts`,
// `hooks/useGovernance.ts`, `hooks/useResearchIntake.ts`, and the two research
// pages) import those aliases by number, so a remap that points an alias at the
// wrong underlying type would silently reshape a consumer contract while every
// runtime test still passed.
//
// This file does NOT assert anything about the new recovery behavior. It pins
// the alias -> underlying-type mapping for the EXISTING consumer seams that the
// additive recovery endpoints must not disturb. The mapping is asserted at the
// type level: `OkOf<Result_N>` / `ErrOf<Result_N>` must be exactly the expected
// domain type, or the `assertType<Equals<...>>()` call fails the type-check.
//
// The mapping is asserted through the generated `@/backend` bindings, which is
// the seam the app compiles against. It is a typed consumer-contract
// characterization, not a real-canister run: the frontend suite mocks the
// actor, and the real canister's runtime behavior is recorded in the episode's
// coverageLimits.
// ---------------------------------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));

/** The `ok` payload type of a generated `Result` alias. */
type OkOf<R> = R extends { __kind__: "ok"; ok: infer T } ? T : never;

/** The `err` payload type of a generated `Result` alias. */
type ErrOf<R> = R extends { __kind__: "err"; err: infer T } ? T : never;

/**
 * Exact type equality. `Equals<A, B>` is `true` only when A and B are the same
 * type, so a remap that points an alias at a structurally different type is
 * caught rather than silently accepted by assignability.
 */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B
  ? 1
  : 2
  ? true
  : false;

/**
 * Compile-time assertion: `assertType<true>()` type-checks, `assertType<false>()`
 * does not. The parameter is referenced so the type argument is genuinely used
 * rather than merely declared.
 */
function assertType<T extends true>(_value?: T): void {
  void _value;
}

// ---------------------------------------------------------------------------
// Governance consumer seams (hooks/useGovernance.ts, types/governance.ts).
// ---------------------------------------------------------------------------

describe("governance consumer alias mapping (recovery-adjacent baseline)", () => {
  it("Result_3 is the FamilyMembership / MembershipError union", () => {
    assertType<Equals<OkOf<Result_3>, FamilyMembership>>();
    assertType<Equals<ErrOf<Result_3>, MembershipError>>();
    expect(true).toBe(true);
  });

  it("Result_5 is the null / ArchiveError union (archive + restore profile)", () => {
    assertType<Equals<OkOf<Result_5>, null>>();
    assertType<Equals<ErrOf<Result_5>, ArchiveError>>();
    expect(true).toBe(true);
  });

  it("Result_9 is the ProfileRemovalRequest / RemovalError union", () => {
    assertType<Equals<OkOf<Result_9>, ProfileRemovalRequest>>();
    assertType<Equals<ErrOf<Result_9>, RemovalError>>();
    expect(true).toBe(true);
  });

  it("Result_11 is the null / StewardError union (remove steward)", () => {
    assertType<Equals<OkOf<Result_11>, null>>();
    assertType<Equals<ErrOf<Result_11>, StewardError>>();
    expect(true).toBe(true);
  });

  it("Result_15 is the StewardRecord / StewardError union (promote + activate successor)", () => {
    assertType<Equals<OkOf<Result_15>, StewardRecord>>();
    assertType<Equals<ErrOf<Result_15>, StewardError>>();
    expect(true).toBe(true);
  });

  it("Result_16 is the null / DeleteError union (permanently delete profile)", () => {
    assertType<Equals<OkOf<Result_16>, null>>();
    assertType<Equals<ErrOf<Result_16>, DeleteError>>();
    expect(true).toBe(true);
  });

  it("Result_17 is the null / MergeError union (not duplicate)", () => {
    assertType<Equals<OkOf<Result_17>, null>>();
    assertType<Equals<ErrOf<Result_17>, MergeError>>();
    expect(true).toBe(true);
  });

  it("Result_19 is the MergeResult / MergeError union (merge profiles)", () => {
    assertType<Equals<OkOf<Result_19>, MergeResult>>();
    assertType<Equals<ErrOf<Result_19>, MergeError>>();
    expect(true).toBe(true);
  });

  it("Result_35 is the SuccessorDesignation / StewardError union", () => {
    assertType<Equals<OkOf<Result_35>, SuccessorDesignation>>();
    assertType<Equals<ErrOf<Result_35>, StewardError>>();
    expect(true).toBe(true);
  });

  it("Result_46 is the Relationship / RelationshipAdminError union (add + correct)", () => {
    assertType<Equals<OkOf<Result_46>, Relationship>>();
    assertType<Equals<ErrOf<Result_46>, RelationshipAdminError>>();
    expect(true).toBe(true);
  });

  it("Result_12 is the null / RelationshipAdminError union (remove relationship)", () => {
    assertType<Equals<OkOf<Result_12>, null>>();
    assertType<Equals<ErrOf<Result_12>, RelationshipAdminError>>();
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Membership-confirmation consumer seams
// (MembershipConfirmationPhase1DContractCharacterize.test.ts).
// ---------------------------------------------------------------------------

describe("membership-confirmation consumer alias mapping (recovery-adjacent baseline)", () => {
  it("Result_6 is the FamilyMembership / MembershipConfirmationError union", () => {
    assertType<Equals<OkOf<Result_6>, FamilyMembership>>();
    assertType<Equals<ErrOf<Result_6>, MembershipConfirmationError>>();
    expect(true).toBe(true);
  });

  it("Result_23 is the EligibleMembershipConfirmationView[] / MembershipConfirmationError union", () => {
    assertType<Equals<OkOf<Result_23>, EligibleMembershipConfirmationView[]>>();
    assertType<Equals<ErrOf<Result_23>, MembershipConfirmationError>>();
    expect(true).toBe(true);
  });

  it("Result_25 is the MembershipConfirmationReviewView[] / MembershipConfirmationError union", () => {
    assertType<Equals<OkOf<Result_25>, MembershipConfirmationReviewView[]>>();
    assertType<Equals<ErrOf<Result_25>, MembershipConfirmationError>>();
    expect(true).toBe(true);
  });

  it("Result_29 is the MembershipConfirmationApplicantView / MembershipConfirmationError union", () => {
    assertType<Equals<OkOf<Result_29>, MembershipConfirmationApplicantView>>();
    assertType<Equals<ErrOf<Result_29>, MembershipConfirmationError>>();
    expect(true).toBe(true);
  });

  it("Result_30 is the MembershipConfirmation | null / MembershipConfirmationError union", () => {
    assertType<Equals<OkOf<Result_30>, MembershipConfirmation | null>>();
    assertType<Equals<ErrOf<Result_30>, MembershipConfirmationError>>();
    expect(true).toBe(true);
  });

  it("Result_33 is the state/decisions/resolution tuple / MembershipConfirmationError union", () => {
    assertType<
      Equals<
        OkOf<Result_33>,
        [
          MembershipConfirmationState,
          MembershipConfirmation[],
          MembershipConfirmationResolutionRecord | null,
        ]
      >
    >();
    assertType<Equals<ErrOf<Result_33>, MembershipConfirmationError>>();
    expect(true).toBe(true);
  });

  it("Result_47 is the MembershipConfirmation / MembershipConfirmationError union", () => {
    assertType<Equals<OkOf<Result_47>, MembershipConfirmation>>();
    assertType<Equals<ErrOf<Result_47>, MembershipConfirmationError>>();
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Invitation consumer seams (InviteRedemptionCover, InvitationHookContract).
// ---------------------------------------------------------------------------

describe("invitation consumer alias mapping (recovery-adjacent baseline)", () => {
  it("Result_1 is the FamilyInvitationPreview / FamilyInvitationError union", () => {
    assertType<Equals<OkOf<Result_1>, FamilyInvitationPreview>>();
    assertType<Equals<ErrOf<Result_1>, FamilyInvitationError>>();
    expect(true).toBe(true);
  });

  it("Result_34 is the InvitationRedemptionState / FamilyInvitationError union", () => {
    assertType<Equals<OkOf<Result_34>, InvitationRedemptionState>>();
    assertType<Equals<ErrOf<Result_34>, FamilyInvitationError>>();
    expect(true).toBe(true);
  });

  it("Result_36 is the FamilyInvitation / FamilyInvitationError union", () => {
    assertType<Equals<OkOf<Result_36>, FamilyInvitation>>();
    assertType<Equals<ErrOf<Result_36>, FamilyInvitationError>>();
    expect(true).toBe(true);
  });

  it("Result_42 is the FamilyInvitationCreateOutcome / FamilyInvitationError union", () => {
    assertType<Equals<OkOf<Result_42>, FamilyInvitationCreateOutcome>>();
    assertType<Equals<ErrOf<Result_42>, FamilyInvitationError>>();
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Research consumer seams (hooks/useResearchIntake.ts, research pages).
// ---------------------------------------------------------------------------

describe("research consumer alias mapping (recovery-adjacent baseline)", () => {
  it("Result_7 is the ConflictReviewItem / ResearchError union (resolve conflict)", () => {
    assertType<Equals<OkOf<Result_7>, ConflictReviewItem>>();
    assertType<Equals<ErrOf<Result_7>, ResearchError>>();
    expect(true).toBe(true);
  });

  it("Result_38 is the SourceRecord / ResearchError union (create source)", () => {
    assertType<Equals<OkOf<Result_38>, SourceRecord>>();
    assertType<Equals<ErrOf<Result_38>, ResearchError>>();
    expect(true).toBe(true);
  });

  it("Result_39 is the RelationshipProposal / ResearchError union", () => {
    assertType<Equals<OkOf<Result_39>, RelationshipProposal>>();
    assertType<Equals<ErrOf<Result_39>, ResearchError>>();
    expect(true).toBe(true);
  });

  it("Result_40 is the NewPersonCandidate / ResearchError union", () => {
    assertType<Equals<OkOf<Result_40>, NewPersonCandidate>>();
    assertType<Equals<ErrOf<Result_40>, ResearchError>>();
    expect(true).toBe(true);
  });

  it("Result_43 is the ProposedFinding / ResearchError union (create finding)", () => {
    assertType<Equals<OkOf<Result_43>, ProposedFinding>>();
    assertType<Equals<ErrOf<Result_43>, ResearchError>>();
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Messaging consumer seam (types/messaging.ts).
// ---------------------------------------------------------------------------

describe("messaging consumer alias mapping (recovery-adjacent baseline)", () => {
  it("Result_4 is the Message / MessageError union (send message)", () => {
    assertType<Equals<OkOf<Result_4>, Message>>();
    assertType<Equals<ErrOf<Result_4>, MessageError>>();
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The recovery endpoints are additive: the existing endpoints the consumer
// seams above depend on are still present on the generated service.
// ---------------------------------------------------------------------------

describe("existing endpoints survive the additive recovery change (characterization)", () => {
  it("keeps the governance, membership, invitation, research, and messaging endpoints", () => {
    // The generated service interface is the consumer seam the app compiles
    // against. Adding recovery endpoints must not remove or rename any existing
    // endpoint, or the consumer modules above stop compiling.
    const service = readFileSync(path.join(here, "backend.ts"), "utf8");
    for (const method of [
      "promoteToSteward",
      "removeSteward",
      "designateSuccessor",
      "activateSuccessor",
      "requestProfileRemoval",
      "archiveProfile",
      "restoreProfile",
      "permanentlyDeleteProfile",
      "notDuplicate",
      "mergeProfiles",
      "addRelationship",
      "removeRelationship",
      "correctRelationshipType",
      "resolveMembershipConfirmation",
      "listMembershipConfirmationReviewsForSteward",
      "getMyMembershipConfirmationState",
      "listMyEligibleMembershipConfirmationsForFamily",
      "validateFamilyInvitationToken",
      "acceptFamilyInvitation",
      "declineFamilyInvitation",
      "createFamilyInvitation",
      "createSource",
      "createFinding",
      "createNewPersonCandidate",
      "createRelationshipProposal",
      "resolveConflict",
      "sendMessage",
    ]) {
      expect(service).toContain(`${method}(`);
    }
  });
});
