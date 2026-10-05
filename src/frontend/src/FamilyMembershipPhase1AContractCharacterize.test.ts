import { Principal } from "@icp-sdk/core/principal";
import { describe, expect, it } from "vitest";

import {
  type FamilyMembership,
  MembershipError,
  MembershipStatus,
  type Result_3,
} from "@/backend";
import { isFamilyMembershipDenial } from "./lib/fileValidation";

// ---------------------------------------------------------------------------
// Characterization baseline for the FamilyMembership Phase 1A public API
// surface (the stable half).
//
// The requested change intentionally alters two things, and this file
// deliberately does NOT freeze either of them:
//
//   1. `activateMembershipForFamily` stops trusting the caller-supplied
//      `approvedBy` argument and records the authenticated caller instead. The
//      current three-argument signature is therefore NOT asserted here.
//   2. The five membership read APIs gain authorization gates and change their
//      return shapes (raw value -> `Result`). Their current ungated return
//      shapes are NOT asserted here.
//
// What this file protects is the Phase 1A contract that must survive the
// change: the `FamilyMembership` record's field set, the four lifecycle status
// variants, the eight `MembershipError` variants, and the frontend's
// `isFamilyMembershipDenial` helper — the app's only consumer of membership
// denial semantics. A refactor that renames a field, drops a status, or
// renumbers the error variants fails here before it reaches a user.
//
// This is a typed consumer-contract test over the generated bindings and a
// pure helper. It does not exercise the real canister: the backend PocketIC
// lane is the only place the membership API's runtime behavior is observed,
// and it is recorded in the episode's coverageLimits.
// ---------------------------------------------------------------------------

const ACCOUNT = Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai");

/** A fully-populated membership record, built from the app's own exported type. */
function activeMembership(): FamilyMembership {
  return {
    id: 1n,
    familyId: "norwood",
    accountId: ACCOUNT,
    personId: "julia",
    status: MembershipStatus.Active,
    joinedAt: 1_700_000_000_000_000_000n,
    approvedBy: ACCOUNT,
    approvedAt: 1_700_000_000_000_000_000n,
    createdAt: 1_699_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
  };
}

describe("FamilyMembership Phase 1A record contract (characterization)", () => {
  it("carries the ten specified fields with their stable types", () => {
    const membership = activeMembership();

    // The field set is the Phase 1A contract. `joinedAt`/`approvedBy`/
    // `approvedAt` are optional (unset until activation); the rest are always
    // present.
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

    expect(typeof membership.id).toBe("bigint");
    expect(typeof membership.familyId).toBe("string");
    expect(typeof membership.personId).toBe("string");
    expect(typeof membership.createdAt).toBe("bigint");
    expect(typeof membership.updatedAt).toBe("bigint");
    expect(membership.accountId).toBe(ACCOUNT);
  });

  it("allows the approval fields to be absent on a #Pending record", () => {
    const pending: FamilyMembership = {
      ...activeMembership(),
      status: MembershipStatus.Pending,
      joinedAt: undefined,
      approvedBy: undefined,
      approvedAt: undefined,
    };

    expect(pending.joinedAt).toBeUndefined();
    expect(pending.approvedBy).toBeUndefined();
    expect(pending.approvedAt).toBeUndefined();
    expect(pending.status).toBe(MembershipStatus.Pending);
  });

  it("exposes exactly the four lifecycle status variants", () => {
    // The four statuses are the Phase 1A lifecycle. A refactor that adds or
    // removes one changes the membership state machine and must fail here.
    expect(Object.values(MembershipStatus).sort()).toEqual(
      ["Active", "Left", "Pending", "Suspended"].sort(),
    );
    expect(MembershipStatus.Pending).toBe("Pending");
    expect(MembershipStatus.Active).toBe("Active");
    expect(MembershipStatus.Suspended).toBe("Suspended");
    expect(MembershipStatus.Left).toBe("Left");
  });

  it("exposes exactly the eight membership error variants", () => {
    // The error variants are the stable denial vocabulary the frontend and the
    // Steward UX reason about. The authorization change adds gates that reuse
    // these variants; it must not rename or drop any of them.
    expect(Object.values(MembershipError).sort()).toEqual(
      [
        "AlreadyMember",
        "FamilyNotFound",
        "InvalidTransition",
        "MembershipNotFound",
        "NotAuthorized",
        "NotSignedIn",
        "PersonNotInFamily",
        "ProfileAlreadyOwned",
      ].sort(),
    );
  });

  it("types the membership Result as an ok/err union over the record and error", () => {
    const ok: Result_3 = { __kind__: "ok", ok: activeMembership() };
    const err: Result_3 = {
      __kind__: "err",
      err: MembershipError.NotAuthorized,
    };

    expect(ok.__kind__).toBe("ok");
    expect(ok.ok.status).toBe(MembershipStatus.Active);
    expect(err.__kind__).toBe("err");
    expect(err.err).toBe(MembershipError.NotAuthorized);
  });
});

describe("isFamilyMembershipDenial: stable denial detection (characterization)", () => {
  it("recognizes the current trapped membership-required message", () => {
    expect(
      isFamilyMembershipDenial(
        new Error(
          "Family membership required. Claim your family profile and wait for Family Steward approval before contributing family content.",
        ),
      ),
    ).toBe(true);
  });

  it("recognizes the older trapped wording", () => {
    expect(
      isFamilyMembershipDenial(
        new Error(
          "Unauthorized: Only approved family members can contribute family content",
        ),
      ),
    ).toBe(true);
  });

  it("recognizes the returned #notAuthorized variant and its #err wrapper", () => {
    expect(isFamilyMembershipDenial({ notAuthorized: null })).toBe(true);
    expect(isFamilyMembershipDenial({ err: { notAuthorized: null } })).toBe(
      true,
    );
  });

  it("does not treat an unrelated error as a membership denial", () => {
    expect(isFamilyMembershipDenial(new Error("Network request failed"))).toBe(
      false,
    );
    expect(isFamilyMembershipDenial({ err: { notFound: 1n } })).toBe(false);
    expect(isFamilyMembershipDenial(null)).toBe(false);
    expect(isFamilyMembershipDenial(undefined)).toBe(false);
  });
});
