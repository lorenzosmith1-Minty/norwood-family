import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Principal } from "@icp-sdk/core/principal";
import { describe, expect, it } from "vitest";

import {
  AuditActionType,
  type AuditEntry,
  ClaimStatus,
  type FamilyMembership,
  LivingStatus,
  MembershipError,
  MembershipStatus,
  type PersonProfile,
  type ProfileClaim,
  ProfileClaimStatus,
  type StewardRecord,
  StewardRoleStatus,
} from "@/backend";

// ---------------------------------------------------------------------------
// Characterization baseline for the Phase 4A Account/Steward Recovery change.
//
// The requested change ADDS a family-scoped recovery data model (backend +
// types only): recovery requests, verification, Steward approval with
// self-approval prevention, quorum for a sole-Steward family, atomic ownership
// transfer, idempotency/replay safety, and recovery audit history. It is
// additive: no existing Norwood feature may change, and the migration must not
// reseed or destroy existing data.
//
// This file deliberately does NOT freeze the absence of recovery endpoints, and
// it does NOT assert anything about the new recovery behavior, which does not
// exist yet. What it protects is the EXISTING ownership / membership / Steward /
// audit behavior that the additive recovery path must not disturb:
//
//   A. The existing claim -> ownership path. `requestClaimForFamily` creates a
//      pending claim on an EXISTING profile; `approveClaimForFamily` marks that
//      SAME profile claimed and associates it with the requester. It never
//      creates a second PersonProfile. Recovery's "no duplicate Person" rule
//      must preserve this shape.
//   B. The at-most-one-active-owner-per-person invariant. The membership lib
//      rejects a second `#Active` membership for an already-owned person in the
//      same family with `#ProfileAlreadyOwned`. Recovery's "no duplicate
//      membership" rule must preserve this invariant.
//   C. The canonical family-scoped Steward authority. Recovery's self-approval
//      prevention and Steward-approval rules build on
//      `isActiveStewardForFamily`; that predicate must stay the single source of
//      Steward authority and must never consult the platform admin role.
//   D. The existing audit vocabulary. Recovery audit history is additive; the
//      existing `AuditActionType` variants and the `AuditEntry` shape must
//      remain, so existing audit reads keep working.
//   E. The typed consumer contract for the existing ownership / membership /
//      Steward records, so a bindgen regeneration for the recovery types cannot
//      silently reshape the records the rest of the app already consumes.
//
// This is a static-source + typed consumer-contract characterization, not a
// real-canister run: the PocketIC lane cannot drive the backend without a
// compiled wasm (it skips with `no_backend_wasm` in this build), and the
// frontend suite mocks the actor. The real canister's runtime behavior is
// recorded in the episode's coverageLimits.
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

/** The body of a named `func`, from its signature to the closing `};`. */
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`func ${name}(`);
  if (start === -1) {
    throw new Error(`function ${name} not found`);
  }
  const end = source.indexOf("\n  };", start);
  if (end === -1) {
    throw new Error(`end of function ${name} not found`);
  }
  return source.slice(start, end);
}

const ownershipLib = stripComments(
  readBackend(path.join("lib", "ownership.mo")),
);
const membershipLib = stripComments(
  readBackend(path.join("lib", "family-membership.mo")),
);
const stewardAuthorityLib = stripComments(
  readBackend(path.join("lib", "steward-authority.mo")),
);
const governanceTypes = stripComments(
  readBackend(path.join("types", "governance.mo")),
);

// ---------------------------------------------------------------------------
// A. The existing claim -> ownership path never creates a duplicate Person.
// ---------------------------------------------------------------------------

describe("existing claim -> ownership path (recovery-adjacent baseline)", () => {
  it("requestClaimForFamily creates a pending claim on an existing profile, never a new profile", () => {
    const body = functionBody(ownershipLib, "requestClaimForFamily");
    // The claim targets a profile that must already exist in the family; a
    // missing profile is rejected rather than created.
    expect(body).toContain("getProfileForFamily(profiles, familyId, personId)");
    expect(body).toContain("#err(#ProfileNotFound)");
    // The claim starts pending and is appended to the claims list; no profile
    // is written by the request path.
    expect(body).toContain("status = #Pending");
    expect(body).toContain("claims.add(claim)");
    expect(body).not.toContain("putProfileForFamily");
  });

  it("approveClaimForFamily marks the SAME existing profile claimed, never creating a second Person", () => {
    const body = functionBody(ownershipLib, "approveClaimForFamily");
    // The profile is resolved from the claim's personId in the family, then
    // updated in place under the same family-qualified key.
    expect(body).toContain(
      "getProfileForFamily(profiles, familyId, claim.personId)",
    );
    expect(body).toContain("claimStatus = #Claimed");
    expect(body).toContain("claimedByUserId = ?claim.requestingUserId");
    expect(body).toContain(
      "TenancyLib.putProfileForFamily(profiles, familyId, updatedProfile)",
    );
    // The updated profile keeps the original personId and familyId: approval
    // transfers ownership of the existing Person, it does not mint a new one.
    expect(body).toContain("personId = profile.personId");
    expect(body).toContain("familyId = profile.familyId");
    // No new profile is appended to the map under a different key.
    expect(body).not.toContain("profiles.add(");
  });

  it("createMyselfForFamily derives a family-unique person id rather than reusing a bare name", () => {
    const body = functionBody(ownershipLib, "createMyselfForFamily");
    // The id is derived and suffixed until unused within the family, so two
    // people with the same name in one family never collide.
    expect(body).toContain("nextPersonId(profiles, familyId, name)");
    const helper = functionBody(ownershipLib, "nextPersonId");
    expect(helper).toContain("getProfileForFamily(profiles, familyId, id)");
    expect(helper).toContain("suffix += 1");
  });
});

// ---------------------------------------------------------------------------
// B. The at-most-one-active-owner-per-person membership invariant.
// ---------------------------------------------------------------------------

describe("membership ownership invariant (recovery-adjacent baseline)", () => {
  it("hasActiveOwnerForPersonInFamily is family-scoped and requires #Active", () => {
    const body = functionBody(membershipLib, "hasActiveOwnerForPersonInFamily");
    expect(body).toContain("m.familyId == familyId");
    expect(body).toContain("m.personId == personId");
    expect(body).toContain("m.status == #Active");
  });

  it("createPendingMembershipForFamily rejects a second active owner of the same person", () => {
    const body = functionBody(
      membershipLib,
      "createPendingMembershipForFamily",
    );
    expect(body).toContain(
      "hasActiveOwnerForPersonInFamily(memberships, familyId, personId)",
    );
    expect(body).toContain("#err(#ProfileAlreadyOwned)");
  });

  it("activateMembershipForFamily re-checks the active-owner invariant before activating", () => {
    const body = functionBody(membershipLib, "activateMembershipForFamily");
    expect(body).toContain(
      "hasActiveOwnerForPersonInFamily(memberships, familyId, membership.personId)",
    );
    expect(body).toContain("#err(#ProfileAlreadyOwned)");
    // Activation is a status transition on the existing record, not a new
    // membership: the id is preserved.
    expect(body).toContain("id = membership.id");
    expect(body).toContain("status = #Active");
  });
});

// ---------------------------------------------------------------------------
// C. The canonical family-scoped Steward authority.
// ---------------------------------------------------------------------------

describe("canonical Steward authority (recovery-adjacent baseline)", () => {
  it("isActiveStewardForFamily requires the caller, #Active, and the matching familyId", () => {
    const body = functionBody(stewardAuthorityLib, "isActiveStewardForFamily");
    expect(body).toContain("s.stewardAccountId == caller");
    expect(body).toContain("s.roleStatus == #Active");
    expect(body).toContain("s.familyId == familyId");
    // The platform admin role is never Steward authority.
    expect(body).not.toContain("isAdmin");
    expect(body).not.toContain("accessControl");
  });

  it("hasActiveStewardForFamily is keyed on the family, not on any active Steward anywhere", () => {
    const body = functionBody(stewardAuthorityLib, "hasActiveStewardForFamily");
    expect(body).toContain("s.roleStatus == #Active");
    expect(body).toContain("s.familyId == familyId");
  });

  it("keeps the legacy Steward helpers as temporary default-family wrappers", () => {
    const legacy = functionBody(stewardAuthorityLib, "isActiveSteward");
    expect(legacy).toContain("isActiveStewardForFamily");
    expect(legacy).toContain("FamilyTypes.DEFAULT_FAMILY_ID");
  });
});

// ---------------------------------------------------------------------------
// D. The existing audit vocabulary is preserved (recovery audit is additive).
// ---------------------------------------------------------------------------

describe("existing audit vocabulary (recovery-adjacent baseline)", () => {
  it("keeps every existing AuditActionType variant", () => {
    // Recovery adds new audit actions; it must not remove or rename the
    // existing ones, or existing audit history reads break.
    for (const variant of [
      "ClaimApproved",
      "ClaimRejected",
      "RelationshipRequestApproved",
      "RelationshipRequestRejected",
      "RelationshipRequestPending",
      "StewardPromoted",
      "StewardRemoved",
      "SuccessorDesignated",
      "SuccessorActivated",
      "ProfileArchived",
      "ProfileRestored",
      "ProfilePermanentlyDeleted",
      "ProfileRemovalRequested",
      "ProfileRemovalReviewed",
      "DuplicateMerged",
      "RelationshipAdded",
      "RelationshipRemoved",
      "RelationshipTypeCorrected",
      "BoardPostArchived",
      "BoardPostRestored",
      "BoardReplyRemoved",
    ]) {
      expect(AuditActionType).toHaveProperty(variant);
    }
  });

  it("keeps the AuditEntry shape the audit reads depend on", () => {
    const entry: AuditEntry = {
      id: 1n,
      familyId: "norwood",
      actionType: AuditActionType.ClaimApproved,
      actorAccountId: Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai"),
      affectedPersonIds: ["julia"],
      timestamp: 1_700_000_000_000_000_000n,
      summary: "Approved a profile claim for julia",
    };
    expect(Object.keys(entry).sort()).toEqual(
      [
        "actionType",
        "actorAccountId",
        "affectedPersonIds",
        "familyId",
        "id",
        "summary",
        "timestamp",
      ].sort(),
    );
  });

  it("the governance AuditEntry type still carries the family boundary and actor", () => {
    // The Motoko record is the source of truth for the generated binding.
    expect(governanceTypes).toContain("public type AuditEntry = {");
    expect(governanceTypes).toContain("familyId : Text;");
    expect(governanceTypes).toContain("actionType : AuditActionType;");
    expect(governanceTypes).toContain("actorAccountId : Principal;");
    expect(governanceTypes).toContain("affectedPersonIds : [PersonId];");
    expect(governanceTypes).toContain("timestamp : Int;");
    expect(governanceTypes).toContain("summary : Text;");
  });
});

// ---------------------------------------------------------------------------
// E. The typed consumer contract for the existing records.
// ---------------------------------------------------------------------------

describe("existing ownership / membership / Steward record contract (characterization)", () => {
  it("keeps the PersonProfile field set the app consumes", () => {
    const profile: PersonProfile = {
      familyId: "norwood",
      personId: "julia",
      name: "Julia Norwood",
      livingStatus: LivingStatus.Living,
      claimStatus: ClaimStatus.Unclaimed,
      claimedByUserId: undefined,
      preferredName: undefined,
      firstName: undefined,
      middleName: undefined,
      lastName: undefined,
      suffix: undefined,
      nickname: undefined,
      story: undefined,
      shortBio: undefined,
      longerStory: undefined,
      occupation: undefined,
      birthInfo: undefined,
      birthDate: undefined,
      birthplace: undefined,
      currentLocation: undefined,
      timeline: undefined,
      privacySettings: undefined,
    };
    expect(Object.keys(profile).sort()).toEqual(
      [
        "birthDate",
        "birthInfo",
        "birthplace",
        "claimStatus",
        "claimedByUserId",
        "currentLocation",
        "familyId",
        "firstName",
        "lastName",
        "livingStatus",
        "longerStory",
        "middleName",
        "name",
        "nickname",
        "occupation",
        "personId",
        "preferredName",
        "privacySettings",
        "shortBio",
        "story",
        "suffix",
        "timeline",
      ].sort(),
    );
  });

  it("keeps the ProfileClaim field set and the three claim statuses", () => {
    const claim: ProfileClaim = {
      familyId: "norwood",
      id: 1n,
      personId: "julia",
      requestingUserId: Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai"),
      status: ProfileClaimStatus.Pending,
      submittedDate: 1_700_000_000_000_000_000n,
      reviewedBy: undefined,
      reviewedDate: undefined,
    };
    expect(Object.keys(claim).sort()).toEqual(
      [
        "familyId",
        "id",
        "personId",
        "requestingUserId",
        "reviewedBy",
        "reviewedDate",
        "status",
        "submittedDate",
      ].sort(),
    );
    expect(Object.values(ProfileClaimStatus).sort()).toEqual(
      ["Approved", "Pending", "Rejected"].sort(),
    );
  });

  it("keeps the FamilyMembership field set and the four lifecycle statuses", () => {
    const membership: FamilyMembership = {
      id: 1n,
      familyId: "norwood",
      accountId: Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai"),
      personId: "julia",
      status: MembershipStatus.Active,
      joinedAt: 1_700_000_000_000_000_000n,
      approvedBy: Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai"),
      approvedAt: 1_700_000_000_000_000_000n,
      createdAt: 1_699_000_000_000_000_000n,
      updatedAt: 1_700_000_000_000_000_000n,
    };
    expect(Object.keys(membership).sort()).toEqual(
      [
        "accountId",
        "approvedAt",
        "approvedBy",
        "createdAt",
        "familyId",
        "id",
        "joinedAt",
        "personId",
        "status",
        "updatedAt",
      ].sort(),
    );
    expect(Object.values(MembershipStatus).sort()).toEqual(
      ["Active", "Left", "Pending", "Suspended"].sort(),
    );
  });

  it("keeps the ProfileAlreadyOwned membership error the duplicate-owner rule returns", () => {
    // Recovery's "no duplicate membership" rule reuses this denial vocabulary;
    // it must not be renamed or dropped.
    expect(MembershipError.ProfileAlreadyOwned).toBe("ProfileAlreadyOwned");
    expect(MembershipError.AlreadyMember).toBe("AlreadyMember");
  });

  it("keeps the StewardRecord field set and the two role statuses", () => {
    const steward: StewardRecord = {
      familyId: "norwood",
      stewardAccountId: Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai"),
      roleStatus: StewardRoleStatus.Active,
      successorPriority: undefined,
      assignedBy: Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai"),
      assignedAt: 1_700_000_000_000_000_000n,
      founding: false,
    };
    expect(Object.keys(steward).sort()).toEqual(
      [
        "assignedAt",
        "assignedBy",
        "familyId",
        "founding",
        "roleStatus",
        "stewardAccountId",
        "successorPriority",
      ].sort(),
    );
    expect(Object.values(StewardRoleStatus).sort()).toEqual(
      ["Active", "Removed"].sort(),
    );
  });
});
