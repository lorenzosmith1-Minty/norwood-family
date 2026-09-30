import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";
import {
  BACKEND_WASM,
  adminIdentity,
  contributorIdentity,
  registerApprovedContributor,
} from "./lane-helpers";

// ---------------------------------------------------------------------------
// Tenancy 1C — family-scoped Governance Audit History read (real-canister
// cover).
//
// The accepted change makes `listAuditHistoryForFamily(familyId)` the canonical
// read: it returns only the governance audit entries stamped with `familyId`
// and is gated on an active Steward of that family. The legacy
// `listAuditHistory()` is reduced to a thin DEFAULT_FAMILY_ID wrapper.
//
// The frontend suite mocks the actor and has no principals, so the per-caller
// authorization and the family filter can only be asserted here. This file
// installs the app's own compiled wasm and drives the real public API. It
// asserts:
//
//   1. The Norwood Steward's `listAuditHistoryForFamily(NORWOOD)` returns only
//      Norwood entries and agrees with the legacy `listAuditHistory()`.
//   2. A Family A governance action (a removal request) never leaks into the
//      Norwood audit history, in either the family-scoped or the legacy read.
//   3. The Norwood Steward is denied the Family A and Family B reads: Steward
//      authority is per-family.
//   4. An approved Family A member who is not a Steward is denied the Family A
//      read: membership is not Steward authority.
//   5. An anonymous caller is denied the family-scoped read.
//
// Coverage limit this file cannot close: there is no public endpoint that
// creates a Steward of a non-default family (`claimSteward` and
// `promoteToSteward` both write `familyId = "norwood"`, and
// `promoteToStewardForFamily` requires the caller to already be an active
// Steward of the supplied family). A Family A Steward therefore cannot be
// bootstrapped through the public API, so the positive "Family A Steward reads
// Family A history" direction cannot be driven here; the Family A/B reads are
// always denied. The boundary is driven in the direction the API supports: the
// Norwood Steward's Norwood read must never return a Family A entry, and the
// Norwood Steward is denied on the Family A/B reads. The internal
// `isActiveStewardForFamily` predicate is covered by the sibling
// `family-scoped-authorization.behavior.test.ts`.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";
const NORWOOD = "norwood";

const STEWARD_MARKER =
  "Unauthorized: Only Family Stewards can view audit history";

let pic: PocketIc | undefined;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
});

afterAll(async () => {
  await pic?.tearDown();
});

// MEMBER_A becomes an approved member of the test-only Family A by creating a
// profile in it.
const memberAIdentity = createIdentity("audit-history-family-a-seed");

interface Seeded {
  actor: _SERVICE;
  canisterId: ReturnType<typeof createIdentity>["getPrincipal"];
  /** The personId of MEMBER_A's profile in Family A. */
  familyAPersonId: string;
}

/**
 * A fresh canister with the Norwood Steward bootstrapped, an approved Norwood
 * contributor, and MEMBER_A approved in the test-only Family A. Each test seeds
 * its own canister so no test depends on the order another ran in.
 */
async function setupFamilies(): Promise<Seeded> {
  const setup = await pic!.setupCanister<_SERVICE>({
    idlFactory,
    wasm: BACKEND_WASM,
  });
  const actor = setup.actor;

  await registerApprovedContributor(actor);

  actor.setIdentity(memberAIdentity);
  await actor._initialize_access_control();
  const createdA = await actor.createMyselfForFamily(FAMILY_A, "Family A Member");
  if (!("ok" in createdA)) {
    throw new Error("createMyselfForFamily did not create a Family A profile");
  }

  return {
    actor,
    canisterId: setup.canisterId,
    familyAPersonId: createdA.ok.personId,
  };
}

/**
 * Creates a Norwood governance audit entry: the Norwood Steward promotes the
 * approved claimed `clayton` profile to Steward, appending a `#StewardPromoted`
 * entry stamped with `familyId = "norwood"`.
 */
async function createNorwoodGovernanceEntry(actor: _SERVICE): Promise<void> {
  actor.setIdentity(adminIdentity);
  const promoted = await actor.promoteToStewardForFamily(NORWOOD, "clayton");
  expect("ok" in promoted).toBe(true);
}

/**
 * Creates a Family A governance audit entry: MEMBER_A requests removal of their
 * own Family A profile, appending a `#ProfileRemovalRequested` entry stamped
 * with `familyId = "test-family-a"`.
 */
async function createFamilyAGovernanceEntry(
  actor: _SERVICE,
  familyAPersonId: string,
): Promise<void> {
  actor.setIdentity(memberAIdentity);
  const requested = await actor.requestProfileRemovalForFamily(
    FAMILY_A,
    familyAPersonId,
    "Duplicate of another record",
  );
  expect("ok" in requested).toBe(true);
}

// ---------------------------------------------------------------------------
// (1) The Norwood read returns only Norwood entries and agrees with the legacy
//     read.
// ---------------------------------------------------------------------------

it("returns only Norwood entries from the family-scoped Norwood read", async () => {
  const { actor } = await setupFamilies();

  await createNorwoodGovernanceEntry(actor);

  actor.setIdentity(adminIdentity);
  const norwood = await actor.listAuditHistoryForFamily(NORWOOD);
  expect(norwood.length).toBeGreaterThan(0);
  expect(norwood.every((e) => e.familyId === NORWOOD)).toBe(true);
  // The declarations decode `AuditActionType` as a Candid variant object.
  expect(norwood.some((e) => "StewardPromoted" in e.actionType)).toBe(true);
});

it("keeps the legacy listAuditHistory read in agreement with the Norwood read", async () => {
  const { actor } = await setupFamilies();

  await createNorwoodGovernanceEntry(actor);

  actor.setIdentity(adminIdentity);
  const legacy = await actor.listAuditHistory();
  const norwood = await actor.listAuditHistoryForFamily(NORWOOD);

  // The legacy wrapper delegates to the default-family read, so the two return
  // the same entries in the same order.
  expect(legacy.map((e) => e.id)).toEqual(norwood.map((e) => e.id));
  expect(legacy.every((e) => e.familyId === NORWOOD)).toBe(true);
});

// ---------------------------------------------------------------------------
// (2) A Family A governance action never leaks into the Norwood history.
// ---------------------------------------------------------------------------

it("does not leak a Family A governance entry into the Norwood audit history", async () => {
  const { actor, familyAPersonId } = await setupFamilies();

  await createFamilyAGovernanceEntry(actor, familyAPersonId);
  await createNorwoodGovernanceEntry(actor);

  actor.setIdentity(adminIdentity);
  const norwood = await actor.listAuditHistoryForFamily(NORWOOD);
  // The Family A removal request is stamped with Family A, so it never appears
  // in the Norwood read.
  expect(norwood.every((e) => e.familyId === NORWOOD)).toBe(true);
  expect(
    norwood.some((e) => "ProfileRemovalRequested" in e.actionType),
  ).toBe(false);

  // The legacy read agrees: no Family A entry leaks through the wrapper.
  const legacy = await actor.listAuditHistory();
  expect(legacy.every((e) => e.familyId === NORWOOD)).toBe(true);
  expect(
    legacy.some((e) => "ProfileRemovalRequested" in e.actionType),
  ).toBe(false);
});

// ---------------------------------------------------------------------------
// (3) Cross-family read denial: Steward authority is per-family.
// ---------------------------------------------------------------------------

it("denies the Norwood Steward the Family A and Family B audit reads", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  await expect(
    actor.listAuditHistoryForFamily(FAMILY_A),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
  await expect(
    actor.listAuditHistoryForFamily(FAMILY_B),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
});

it("denies an approved Family A member the Family A audit read", async () => {
  const { actor } = await setupFamilies();

  // Approved membership is not Steward authority: the read is denied.
  actor.setIdentity(memberAIdentity);
  await expect(
    actor.listAuditHistoryForFamily(FAMILY_A),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
});

it("denies an anonymous caller the family-scoped audit read", async () => {
  const { canisterId } = await setupFamilies();

  const anonymousActor = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  await expect(
    anonymousActor.listAuditHistoryForFamily(NORWOOD),
  ).rejects.toThrow();
});

// ---------------------------------------------------------------------------
// (4) Default Norwood behavior is unchanged: the legacy read is still
//     Steward-gated and still returns the Norwood history.
// ---------------------------------------------------------------------------

it("keeps the legacy listAuditHistory read gated to Family Stewards", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(contributorIdentity);
  await expect(actor.listAuditHistory()).rejects.toThrow();

  actor.setIdentity(adminIdentity);
  await expect(actor.listAuditHistory()).resolves.toBeInstanceOf(Array);
});
