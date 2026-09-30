import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";
import {
  BACKEND_WASM,
  adminIdentity,
  memberAIdentity,
  memberBIdentity,
} from "./lane-helpers";

// ---------------------------------------------------------------------------
// Claim-notification reconciliation family scoping (real-canister cover).
//
// The accepted behavior is that the claim-notification reconciliation path is
// family-scoped: `reconcileClaimNotificationsForFamily(familyId, claimId)`
// requires approved-member authorization for `familyId`, locates the claim with
// a family-qualified lookup, and reconciles only notifications tied to that
// claim in the same family. A `claimId` alone never crosses the family
// boundary, and the legacy `reconcileClaimNotifications(claimId)` remains a
// thin DEFAULT_FAMILY_ID ("norwood") wrapper with unchanged behavior.
//
// Test-only families: `test-family-a` and `test-family-b`. There is no
// family-creation endpoint, and the family-scoped endpoints accept an arbitrary
// familyId, so a caller becomes an approved member of a family by creating a
// profile in it (`createMyselfForFamily` writes an APPROVED claim for the
// caller in that family). That is the only public path to non-default-family
// membership.
//
// Coverage limits this file cannot close, stated plainly:
//
//   * There is no public endpoint that creates a Steward of a non-default
//     family (`claimSteward` writes `familyId = "norwood"`), so the
//     Steward-gated reconcile path can only be driven in Norwood.
//   * A `#ProfileClaimRequested` notification is produced by
//     `requestClaimForFamily`, which requires an unclaimed living profile in
//     the family. A non-default family's only profile is created already
//     claimed by `createMyselfForFamily`, so a second member cannot request a
//     claim there. The family boundary is therefore asserted through the
//     approved-claim records and the notification read state that the
//     reconciliation path must leave untouched, not through a second
//     `#ProfileClaimRequested` notification in a non-default family.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";
const NORWOOD = "norwood";

let pic: PocketIc | undefined;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
});

afterAll(async () => {
  await pic?.tearDown();
});

interface Seeded {
  actor: _SERVICE;
  claimAId: bigint;
  claimBId: bigint;
}

/**
 * A fresh canister with the Norwood Steward bootstrapped and MEMBER_A /
 * MEMBER_B approved in their respective test-only families. Each test seeds its
 * own canister so no test depends on the order another ran in.
 *
 * `createMyselfForFamily` returns the created profile and writes an APPROVED
 * claim for the caller in that family; the claim id is read back from the
 * caller's own claim list.
 */
async function setupFamilies(): Promise<Seeded> {
  const setup = await pic!.setupCanister<_SERVICE>({
    idlFactory,
    wasm: BACKEND_WASM,
  });
  const actor = setup.actor;

  // ADMIN becomes the Norwood Family Steward. Steward authority is the
  // canonical active-Steward record, not the platform admin role: the first
  // caller to _initialize_access_control is #admin but must still claim the
  // Steward role explicitly.
  actor.setIdentity(adminIdentity);
  await actor._initialize_access_control();
  await actor.claimSteward();

  actor.setIdentity(memberAIdentity);
  await actor._initialize_access_control();
  const createdA = await actor.createMyselfForFamily(FAMILY_A, "Family A Member");
  expect("ok" in createdA).toBe(true);
  if (!("ok" in createdA)) {
    throw new Error("Family A profile was not created");
  }
  const claimA = await actor.getMyProfileClaimForFamily(
    FAMILY_A,
    createdA.ok.personId,
  );
  if (claimA.length === 0) {
    throw new Error("Family A claim was not created");
  }

  actor.setIdentity(memberBIdentity);
  await actor._initialize_access_control();
  const createdB = await actor.createMyselfForFamily(FAMILY_B, "Family B Member");
  expect("ok" in createdB).toBe(true);
  if (!("ok" in createdB)) {
    throw new Error("Family B profile was not created");
  }
  const claimB = await actor.getMyProfileClaimForFamily(
    FAMILY_B,
    createdB.ok.personId,
  );
  if (claimB.length === 0) {
    throw new Error("Family B claim was not created");
  }

  return { actor, claimAId: claimA[0].id, claimBId: claimB[0].id };
}

// ---------------------------------------------------------------------------
// (1) A member of Family A cannot reconcile a Family B claim by id alone.
// ---------------------------------------------------------------------------

it("does not reconcile a Family B claim when a Family A member passes the Family B claim id under Family A", async () => {
  const { actor, claimBId } = await setupFamilies();

  // MEMBER_A is an approved member of Family A only. Passing the Family B claim
  // id under Family A must not find the claim: the family-qualified lookup
  // rejects it, so nothing is reconciled.
  actor.setIdentity(memberAIdentity);
  const reconciled = await actor.reconcileClaimNotificationsForFamily(
    FAMILY_A,
    claimBId,
  );
  expect(reconciled).toBe(0n);

  // MEMBER_B's Family B notification read state is unchanged.
  actor.setIdentity(memberBIdentity);
  const familyB = await actor.listNotificationsForFamily(FAMILY_B);
  expect(familyB.length).toBeGreaterThan(0);
  expect(familyB.every((n) => n.read === false)).toBe(true);
});

it("denies a Family A member reconciling under Family B", async () => {
  const { actor, claimBId } = await setupFamilies();

  // MEMBER_A is not an approved member of Family B, so the family-scoped
  // authorization gate denies the call outright.
  actor.setIdentity(memberAIdentity);
  await expect(
    actor.reconcileClaimNotificationsForFamily(FAMILY_B, claimBId),
  ).rejects.toThrow();

  // MEMBER_B's Family B notification read state is unchanged.
  actor.setIdentity(memberBIdentity);
  const familyB = await actor.listNotificationsForFamily(FAMILY_B);
  expect(familyB.every((n) => n.read === false)).toBe(true);
});

// ---------------------------------------------------------------------------
// (2) A member reconciles their own family's claim; only that family's
//     notifications change.
// ---------------------------------------------------------------------------

it("reconciles a Family A claim for a Family A member and leaves Family B notifications unchanged", async () => {
  const { actor, claimAId } = await setupFamilies();

  // MEMBER_A holds a Family A notification (the profile-creation
  // ProfileClaimReviewed notification). MEMBER_B holds a separate Family B
  // notification. Reconciling MEMBER_A's own Family A claim must not touch
  // MEMBER_B's Family B notification.
  actor.setIdentity(memberAIdentity);
  const reconciled = await actor.reconcileClaimNotificationsForFamily(
    FAMILY_A,
    claimAId,
  );
  // The claim is APPROVED, so the reconcile path runs; the count is 0 because
  // the profile-creation path emits ProfileClaimReviewed, not
  // ProfileClaimRequested, and reconcile only marks the latter.
  expect(reconciled).toBe(0n);

  // MEMBER_B's Family B notification is untouched and still unread.
  actor.setIdentity(memberBIdentity);
  const familyB = await actor.listNotificationsForFamily(FAMILY_B);
  expect(familyB.length).toBeGreaterThan(0);
  expect(familyB.every((n) => n.read === false)).toBe(true);
  expect(await actor.unreadNotificationCountForFamily(FAMILY_B)).toBe(
    BigInt(familyB.length),
  );
});

// ---------------------------------------------------------------------------
// (3) The same user belonging to two families gets separated reconciliation.
// ---------------------------------------------------------------------------

it("separates reconciliation for the same user in Family A and Family B", async () => {
  const { actor, claimAId, claimBId } = await setupFamilies();

  // MEMBER_A joins Family B too, so the same principal is an approved member of
  // both families and holds a claim in each.
  actor.setIdentity(memberAIdentity);
  const createdB = await actor.createMyselfForFamily(FAMILY_B, "Family A Member in B");
  expect("ok" in createdB).toBe(true);

  // Reconciling the Family A claim under Family A does not touch the Family B
  // notification, and vice versa.
  const reconciledA = await actor.reconcileClaimNotificationsForFamily(
    FAMILY_A,
    claimAId,
  );
  expect(reconciledA).toBe(0n);

  const familyBAfterA = await actor.listNotificationsForFamily(FAMILY_B);
  expect(familyBAfterA.length).toBeGreaterThan(0);
  expect(familyBAfterA.every((n) => n.read === false)).toBe(true);

  const reconciledB = await actor.reconcileClaimNotificationsForFamily(
    FAMILY_B,
    claimBId,
  );
  expect(reconciledB).toBe(0n);

  // The Family A notification is still unread after the Family B reconcile.
  const familyAAfterB = await actor.listNotificationsForFamily(FAMILY_A);
  expect(familyAAfterB.length).toBeGreaterThan(0);
  expect(familyAAfterB.every((n) => n.read === false)).toBe(true);
});

// ---------------------------------------------------------------------------
// (4) Default Norwood wrapper behavior is unchanged.
// ---------------------------------------------------------------------------

it("keeps the legacy reconcileClaimNotifications wrapper working for the default family", async () => {
  const { actor } = await setupFamilies();

  // The Norwood Steward creates a Norwood profile, which writes a Norwood
  // notification for the steward.
  actor.setIdentity(adminIdentity);
  const created = await actor.createMyselfForFamily(NORWOOD, "Norwood Steward Profile");
  expect("ok" in created).toBe(true);
  if (!("ok" in created)) {
    throw new Error("Norwood profile was not created");
  }

  const claim = await actor.getMyProfileClaimForFamily(
    NORWOOD,
    created.ok.personId,
  );
  if (claim.length === 0) {
    throw new Error("Norwood claim was not created");
  }

  // The legacy no-familyId wrapper delegates to the canonical family-scoped
  // endpoint with DEFAULT_FAMILY_ID and returns the same result.
  const legacy = await actor.reconcileClaimNotifications(claim[0].id);
  const canonical = await actor.reconcileClaimNotificationsForFamily(
    NORWOOD,
    claim[0].id,
  );
  expect(legacy).toBe(canonical);
});

it("does not let the legacy wrapper reconcile a non-default-family claim", async () => {
  const { actor, claimBId } = await setupFamilies();

  // The legacy wrapper always uses DEFAULT_FAMILY_ID, so a Family B claim id
  // passed to it is not found and nothing is reconciled. The caller must be an
  // approved Norwood member for the call to reach the lookup at all: the
  // membership gate runs first and would otherwise trap before the
  // family-qualified lookup could return 0. The Norwood Steward is such a
  // caller, and is not a member of Family B.
  actor.setIdentity(adminIdentity);
  const legacy = await actor.reconcileClaimNotifications(claimBId);
  expect(legacy).toBe(0n);

  // MEMBER_B's Family B notification read state is unchanged.
  actor.setIdentity(memberBIdentity);
  const familyB = await actor.listNotificationsForFamily(FAMILY_B);
  expect(familyB.length).toBeGreaterThan(0);
  expect(familyB.every((n) => n.read === false)).toBe(true);
});
