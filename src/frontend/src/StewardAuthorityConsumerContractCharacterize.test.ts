import { Principal } from "@icp-sdk/core/principal";
import { describe, expect, it } from "vitest";

import {
  StewardClaimError,
  StewardError,
  type StewardRecord,
  StewardRoleStatus,
} from "@/backend";
import { STEWARD_ROLE_STATUS_LABELS } from "./types/governance";

// ---------------------------------------------------------------------------
// Characterization baseline for the existing Steward authority consumer
// contract.
//
// The requested change ADDS a family-scoped founding-Steward onboarding state
// and its operations. It must not reshape the existing Steward authority
// surface the frontend already consumes: the generated `StewardRecord` record,
// the `StewardRoleStatus` lifecycle, the `StewardError` / `StewardClaimError`
// denial vocabulary, and the `STEWARD_ROLE_STATUS_LABELS` display helper.
//
// This file deliberately does NOT freeze the absence of the new onboarding
// state or its operations: adding them is exactly the change under way. It
// freezes only the existing typed contract a refactor could silently renumber
// or rename.
//
// This is a typed consumer-contract test over the generated bindings and a pure
// helper. It does not exercise the real canister: the backend PocketIC lane is
// the only place the Steward authority runtime behavior is observed, and it is
// recorded in the episode's coverageLimits.
// ---------------------------------------------------------------------------

const ACCOUNT = Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai");

/** A fully-populated StewardRecord, built from the app's own exported type. */
function activeSteward(): StewardRecord {
  return {
    familyId: "norwood",
    stewardAccountId: ACCOUNT,
    roleStatus: StewardRoleStatus.Active,
    successorPriority: 1n,
    assignedBy: ACCOUNT,
    assignedAt: 1_700_000_000_000_000_000n,
    founding: false,
  };
}

describe("StewardRecord consumer contract (characterization)", () => {
  it("carries the seven specified fields with their stable types", () => {
    const steward = activeSteward();

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

    expect(typeof steward.familyId).toBe("string");
    expect(steward.stewardAccountId).toBe(ACCOUNT);
    expect(steward.assignedBy).toBe(ACCOUNT);
    expect(typeof steward.assignedAt).toBe("bigint");
    expect(steward.successorPriority).toBe(1n);
    // The accepted change adds the `founding` role-context flag; it never
    // changes authority, so a non-founding record carries `false`.
    expect(steward.founding).toBe(false);
  });

  it("allows the successor priority to be absent", () => {
    const steward: StewardRecord = {
      ...activeSteward(),
      successorPriority: undefined,
    };
    expect(steward.successorPriority).toBeUndefined();
  });

  it("exposes exactly the two role-status variants", () => {
    expect(Object.values(StewardRoleStatus).sort()).toEqual(
      ["Active", "Removed"].sort(),
    );
    expect(StewardRoleStatus.Active).toBe("Active");
    expect(StewardRoleStatus.Removed).toBe("Removed");
  });

  it("labels both role statuses for display", () => {
    expect(STEWARD_ROLE_STATUS_LABELS[StewardRoleStatus.Active]).toBe("Active");
    expect(STEWARD_ROLE_STATUS_LABELS[StewardRoleStatus.Removed]).toBe(
      "Removed",
    );
  });
});

describe("Steward denial vocabulary (characterization)", () => {
  it("exposes exactly the seven StewardError variants", () => {
    expect(Object.values(StewardError).sort()).toEqual(
      [
        "AlreadyDesignated",
        "AlreadySteward",
        "LastSteward",
        "NotApprovedClaimedMember",
        "NotDesignated",
        "NotSignedIn",
        "NotSteward",
      ].sort(),
    );
  });

  it("exposes exactly the three StewardClaimError variants", () => {
    expect(Object.values(StewardClaimError).sort()).toEqual(
      ["AlreadySteward", "NotSignedIn", "StewardAlreadyExists"].sort(),
    );
  });
});
