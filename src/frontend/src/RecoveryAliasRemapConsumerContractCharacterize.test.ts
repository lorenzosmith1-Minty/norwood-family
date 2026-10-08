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
  Result_7,
  Result_8,
  Result_9,
  Result_11,
  Result_13,
  Result_14,
  Result_17,
  Result_18,
  Result_19,
  Result_21,
  Result_27,
  Result_29,
  Result_34,
  Result_35,
  Result_38,
  Result_39,
  Result_42,
  Result_43,
  Result_45,
  Result_46,
  Result_47,
  Result_49,
  Result_50,
  Result_53,
  Result_54,
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
//
// Phase 5C inserted the media-retrieval endpoint, whose result alias is the new
// `Result_6` (`ExportMediaRetrieval` / `ExportMediaRetrievalError`). That
// additive endpoint renumbered every alias from the old `Result_6` upward by
// one; the mapping below is the post-Phase-5C numbering.
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

  it("Result_7 is the null / ArchiveError union (archive + restore profile)", () => {
    assertType<Equals<OkOf<Result_7>, null>>();
    assertType<Equals<ErrOf<Result_7>, ArchiveError>>();
    expect(true).toBe(true);
  });

  it("Result_11 is the ProfileRemovalRequest / RemovalError union", () => {
    assertType<Equals<OkOf<Result_11>, ProfileRemovalRequest>>();
    assertType<Equals<ErrOf<Result_11>, RemovalError>>();
    expect(true).toBe(true);
  });

  it("Result_13 is the null / StewardError union (remove steward)", () => {
    assertType<Equals<OkOf<Result_13>, null>>();
    assertType<Equals<ErrOf<Result_13>, StewardError>>();
    expect(true).toBe(true);
  });

  it("Result_17 is the StewardRecord / StewardError union (promote + activate successor)", () => {
    assertType<Equals<OkOf<Result_17>, StewardRecord>>();
    assertType<Equals<ErrOf<Result_17>, StewardError>>();
    expect(true).toBe(true);
  });

  it("Result_18 is the null / DeleteError union (permanently delete profile)", () => {
    assertType<Equals<OkOf<Result_18>, null>>();
    assertType<Equals<ErrOf<Result_18>, DeleteError>>();
    expect(true).toBe(true);
  });

  it("Result_19 is the null / MergeError union (not duplicate)", () => {
    assertType<Equals<OkOf<Result_19>, null>>();
    assertType<Equals<ErrOf<Result_19>, MergeError>>();
    expect(true).toBe(true);
  });

  it("Result_21 is the MergeResult / MergeError union (merge profiles)", () => {
    assertType<Equals<OkOf<Result_21>, MergeResult>>();
    assertType<Equals<ErrOf<Result_21>, MergeError>>();
    expect(true).toBe(true);
  });

  it("Result_42 is the SuccessorDesignation / StewardError union", () => {
    assertType<Equals<OkOf<Result_42>, SuccessorDesignation>>();
    assertType<Equals<ErrOf<Result_42>, StewardError>>();
    expect(true).toBe(true);
  });

  it("Result_53 is the Relationship / RelationshipAdminError union (add + correct)", () => {
    assertType<Equals<OkOf<Result_53>, Relationship>>();
    assertType<Equals<ErrOf<Result_53>, RelationshipAdminError>>();
    expect(true).toBe(true);
  });

  it("Result_14 is the null / RelationshipAdminError union (remove relationship)", () => {
    assertType<Equals<OkOf<Result_14>, null>>();
    assertType<Equals<ErrOf<Result_14>, RelationshipAdminError>>();
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Membership-confirmation consumer seams
// (MembershipConfirmationPhase1DContractCharacterize.test.ts).
// ---------------------------------------------------------------------------

describe("membership-confirmation consumer alias mapping (recovery-adjacent baseline)", () => {
  it("Result_8 is the FamilyMembership / MembershipConfirmationError union", () => {
    assertType<Equals<OkOf<Result_8>, FamilyMembership>>();
    assertType<Equals<ErrOf<Result_8>, MembershipConfirmationError>>();
    expect(true).toBe(true);
  });

  it("Result_27 is the EligibleMembershipConfirmationView[] / MembershipConfirmationError union", () => {
    assertType<Equals<OkOf<Result_27>, EligibleMembershipConfirmationView[]>>();
    assertType<Equals<ErrOf<Result_27>, MembershipConfirmationError>>();
    expect(true).toBe(true);
  });

  it("Result_29 is the MembershipConfirmationReviewView[] / MembershipConfirmationError union", () => {
    assertType<Equals<OkOf<Result_29>, MembershipConfirmationReviewView[]>>();
    assertType<Equals<ErrOf<Result_29>, MembershipConfirmationError>>();
    expect(true).toBe(true);
  });

  it("Result_34 is the MembershipConfirmationApplicantView / MembershipConfirmationError union", () => {
    assertType<Equals<OkOf<Result_34>, MembershipConfirmationApplicantView>>();
    assertType<Equals<ErrOf<Result_34>, MembershipConfirmationError>>();
    expect(true).toBe(true);
  });

  it("Result_35 is the MembershipConfirmation | null / MembershipConfirmationError union", () => {
    assertType<Equals<OkOf<Result_35>, MembershipConfirmation | null>>();
    assertType<Equals<ErrOf<Result_35>, MembershipConfirmationError>>();
    expect(true).toBe(true);
  });

  it("Result_38 is the state/decisions/resolution tuple / MembershipConfirmationError union", () => {
    assertType<
      Equals<
        OkOf<Result_38>,
        [
          MembershipConfirmationState,
          MembershipConfirmation[],
          MembershipConfirmationResolutionRecord | null,
        ]
      >
    >();
    assertType<Equals<ErrOf<Result_38>, MembershipConfirmationError>>();
    expect(true).toBe(true);
  });

  it("Result_54 is the MembershipConfirmation / MembershipConfirmationError union", () => {
    assertType<Equals<OkOf<Result_54>, MembershipConfirmation>>();
    assertType<Equals<ErrOf<Result_54>, MembershipConfirmationError>>();
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

  it("Result_39 is the InvitationRedemptionState / FamilyInvitationError union", () => {
    assertType<Equals<OkOf<Result_39>, InvitationRedemptionState>>();
    assertType<Equals<ErrOf<Result_39>, FamilyInvitationError>>();
    expect(true).toBe(true);
  });

  it("Result_43 is the FamilyInvitation / FamilyInvitationError union", () => {
    assertType<Equals<OkOf<Result_43>, FamilyInvitation>>();
    assertType<Equals<ErrOf<Result_43>, FamilyInvitationError>>();
    expect(true).toBe(true);
  });

  it("Result_49 is the FamilyInvitationCreateOutcome / FamilyInvitationError union", () => {
    assertType<Equals<OkOf<Result_49>, FamilyInvitationCreateOutcome>>();
    assertType<Equals<ErrOf<Result_49>, FamilyInvitationError>>();
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Research consumer seams (hooks/useResearchIntake.ts, research pages).
// ---------------------------------------------------------------------------

describe("research consumer alias mapping (recovery-adjacent baseline)", () => {
  it("Result_9 is the ConflictReviewItem / ResearchError union (resolve conflict)", () => {
    assertType<Equals<OkOf<Result_9>, ConflictReviewItem>>();
    assertType<Equals<ErrOf<Result_9>, ResearchError>>();
    expect(true).toBe(true);
  });

  it("Result_45 is the SourceRecord / ResearchError union (create source)", () => {
    assertType<Equals<OkOf<Result_45>, SourceRecord>>();
    assertType<Equals<ErrOf<Result_45>, ResearchError>>();
    expect(true).toBe(true);
  });

  it("Result_46 is the RelationshipProposal / ResearchError union", () => {
    assertType<Equals<OkOf<Result_46>, RelationshipProposal>>();
    assertType<Equals<ErrOf<Result_46>, ResearchError>>();
    expect(true).toBe(true);
  });

  it("Result_47 is the NewPersonCandidate / ResearchError union", () => {
    assertType<Equals<OkOf<Result_47>, NewPersonCandidate>>();
    assertType<Equals<ErrOf<Result_47>, ResearchError>>();
    expect(true).toBe(true);
  });

  it("Result_50 is the ProposedFinding / ResearchError union (create finding)", () => {
    assertType<Equals<OkOf<Result_50>, ProposedFinding>>();
    assertType<Equals<ErrOf<Result_50>, ResearchError>>();
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
