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
// Onboarding Phase 1A-H — FamilyMembership approval, privacy, and invariants
// (real-canister cover).
//
// The accepted behavior is that `FamilyMembership` is a persistent
// account-to-family record with the four status values, that the canonical
// family-scoped lookups never cross a family boundary, that creation and the
// lifecycle transitions enforce the documented invariants, that activation is
// never self-service and records the REAL authenticated caller as `approvedBy`,
// and that every membership read is gated on the caller being the target
// account or an active Steward of the requested family with uniform,
// non-leaking denials.
//
// The frontend suite mocks the actor and has no principals at all, so none of
// this is visible there. This file installs the app's own compiled wasm and
// drives the real public API.
//
// Coverage limits this file cannot close (recorded in the episode):
//
//   - There is no public endpoint that creates a Steward of a non-default
//     family (`claimSteward` writes `familyId = "norwood"`), and every
//     membership mutation is Steward-gated for the requested family. A
//     membership in a non-default family therefore cannot be created through
//     the public API, so the cross-family isolation assertions below drive the
//     *lookup* boundary (a Norwood membership is invisible under Family A)
//     rather than two live memberships.
//   - The `#PersonNotInFamily` rejection is only reachable for a non-default
//     family (the default family accepts any well-formed person id), and that
//     path needs a Steward of that family, so it is covered by the sibling
//     `family-membership.static.test.ts` over the real predicate source.
//   - The migration backfill across a real upgrade lives in
//     `family-membership.upgrade.test.ts`.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

const NORWOOD = "norwood";
const FAMILY_A = "test-family-a";

let pic: PocketIc | undefined;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
});

afterAll(async () => {
  await pic?.tearDown();
});

// A separate identity that becomes an approved member of the test-only family
// A. `createMyselfForFamily` writes an APPROVED claim for the caller in that
// family, which is the only public path to non-default-family membership. It
// does not confer Steward authority.
const memberAIdentity = createIdentity("membership-family-a-seed");

// A signed-in identity with no membership and no Steward role anywhere. Used as
// the "non-existent target" in the non-leaking-denial test: it must be a
// DIFFERENT account from the caller, because the self clause of every read
// authorizes the caller to read its own (empty) membership, which would make the
// denial comparison vacuous.
const strangerIdentity = createIdentity("membership-stranger-seed");

interface Seeded {
  actor: _SERVICE;
  canisterId: ReturnType<typeof createIdentity>["getPrincipal"];
}

/**
 * A fresh canister with the Norwood Steward bootstrapped and an approved
 * Norwood contributor. Each test seeds its own canister so no test depends on
 * the order another ran in.
 */
async function setup(): Promise<Seeded> {
  const setupResult = await pic!.setupCanister<_SERVICE>({
    idlFactory,
    wasm: BACKEND_WASM,
  });
  const actor = setupResult.actor;
  await registerApprovedContributor(actor);
  return { actor, canisterId: setupResult.canisterId };
}

/** A fresh canister with MEMBER_A also approved in the test-only family A. */
async function setupWithFamilyA(): Promise<Seeded> {
  const seeded = await setup();
  seeded.actor.setIdentity(memberAIdentity);
  await seeded.actor._initialize_access_control();
  const createdA = await seeded.actor.createMyselfForFamily(
    FAMILY_A,
    "Family A Member",
  );
  expect("ok" in createdA).toBe(true);
  return seeded;
}

/** Unwraps a `Result` read, failing the test on an unexpected `#err`. */
function ok<T>(result: { ok: T } | { err: unknown }): T {
  if (!("ok" in result)) {
    throw new Error(`expected #ok, got ${JSON.stringify(result)}`);
  }
  return result.ok;
}

// ---------------------------------------------------------------------------
// (1) Empty-state reads resolve instead of trapping, and the four status
//     values are the only ones the record carries.
// ---------------------------------------------------------------------------

it("answers every membership read on an empty state without trapping", async () => {
  const { actor } = await setup();

  // A fresh canister has no memberships: the migration backfill only creates
  // one per approved default-family ProfileClaim, and none exists yet. The
  // reads are made as the contributor, who is the target account for the
  // self-scoped reads and an approved member for the family read.
  actor.setIdentity(contributorIdentity);
  expect(
    ok(await actor.getMembershipForFamily(NORWOOD, contributorIdentity.getPrincipal())),
  ).toEqual([]);
  expect(ok(await actor.getMyMembershipForFamily(NORWOOD))).toEqual([]);
  expect(
    ok(await actor.listMembershipsForAccount(contributorIdentity.getPrincipal())),
  ).toEqual([]);
  expect(ok(await actor.listFamilyMembersForFamily(NORWOOD))).toEqual([]);
  expect(
    ok(await actor.hasActiveMembershipForFamily(NORWOOD, contributorIdentity.getPrincipal())),
  ).toBe(false);
});

// ---------------------------------------------------------------------------
// (2) Creation persists a #Pending record with every specified field, and a
//     pending membership grants no active access.
// ---------------------------------------------------------------------------

it("creates a #Pending membership with all specified fields and no active access", async () => {
  const { actor } = await setup();
  const account = contributorIdentity.getPrincipal();

  actor.setIdentity(adminIdentity);
  const created = await actor.createPendingMembershipForFamily(
    NORWOOD,
    account,
    "julia",
  );
  expect("ok" in created).toBe(true);
  const membership = (created as { ok: { id: bigint } }).ok;

  // The record carries every specified field. `joinedAt`/`approvedBy`/
  // `approvedAt` are unset until activation; `createdAt`/`updatedAt` are set.
  expect(membership).toMatchObject({
    familyId: NORWOOD,
    accountId: account,
    personId: "julia",
    status: { Pending: null },
    joinedAt: [],
    approvedBy: [],
    approvedAt: [],
  });
  expect(membership.id).toEqual(expect.any(BigInt));
  expect(membership.createdAt).toEqual(expect.any(BigInt));
  expect(membership.updatedAt).toEqual(expect.any(BigInt));

  // A pending membership grants no active access.
  expect(
    ok(await actor.hasActiveMembershipForFamily(NORWOOD, account)),
  ).toBe(false);

  // The canonical lookups return the same record. `listMembershipsForAccount`
  // is self-only, so it is read as the account itself.
  const byFamily = ok(await actor.getMembershipForFamily(NORWOOD, account));
  expect(byFamily).toHaveLength(1);
  expect(byFamily[0]).toEqual(membership);
  const listed = ok(await actor.listFamilyMembersForFamily(NORWOOD));
  expect(listed.find((m) => m.id === membership.id)).toEqual(membership);
  actor.setIdentity(contributorIdentity);
  const forAccount = ok(await actor.listMembershipsForAccount(account));
  expect(forAccount.find((m) => m.id === membership.id)).toEqual(membership);
});

// ---------------------------------------------------------------------------
// (3) Activation is Steward-only: a non-Steward and an anonymous caller are
//     rejected, and the membership stays #Pending.
// ---------------------------------------------------------------------------

it("rejects direct self-activation by a non-Steward and leaves the membership #Pending", async () => {
  const { actor } = await setup();
  const account = contributorIdentity.getPrincipal();

  actor.setIdentity(adminIdentity);
  const created = await actor.createPendingMembershipForFamily(
    NORWOOD,
    account,
    "julia",
  );
  const membershipId = (created as { ok: { id: bigint } }).ok.id;

  // The account itself cannot activate its own membership.
  actor.setIdentity(contributorIdentity);
  await expect(
    actor.activateMembershipForFamily(NORWOOD, membershipId),
  ).resolves.toEqual({ err: { NotAuthorized: null } });

  // The membership is still #Pending and still grants no active access.
  actor.setIdentity(adminIdentity);
  const stillPending = ok(await actor.getMembershipForFamily(NORWOOD, account));
  expect(stillPending[0].status).toEqual({ Pending: null });
  expect(
    ok(await actor.hasActiveMembershipForFamily(NORWOOD, account)),
  ).toBe(false);
});

it("rejects an anonymous caller from every membership mutation", async () => {
  const { actor, canisterId } = await setup();

  // A fresh actor with no identity set is anonymous.
  const anonymous = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  await expect(
    anonymous.createPendingMembershipForFamily(
      NORWOOD,
      contributorIdentity.getPrincipal(),
      "julia",
    ),
  ).resolves.toEqual({ err: { NotSignedIn: null } });
  await expect(
    anonymous.activateMembershipForFamily(NORWOOD, 1n),
  ).resolves.toEqual({ err: { NotSignedIn: null } });
  await expect(
    anonymous.leaveFamilyMembership(NORWOOD, 1n),
  ).resolves.toEqual({ err: { NotSignedIn: null } });
  await expect(
    anonymous.suspendMembershipForFamily(NORWOOD, 1n),
  ).resolves.toEqual({ err: { NotSignedIn: null } });
});

// ---------------------------------------------------------------------------
// (4) Pending -> Active succeeds only through the authorized Steward path, and
//     the activated record carries joinedAt/approvedBy/approvedAt.
// ---------------------------------------------------------------------------

it("activates a #Pending membership through the Steward path and sets the approval fields", async () => {
  const { actor } = await setup();
  const account = contributorIdentity.getPrincipal();

  actor.setIdentity(adminIdentity);
  const created = await actor.createPendingMembershipForFamily(
    NORWOOD,
    account,
    "julia",
  );
  const membershipId = (created as { ok: { id: bigint } }).ok.id;

  const activated = await actor.activateMembershipForFamily(
    NORWOOD,
    membershipId,
  );
  expect("ok" in activated).toBe(true);
  const active = (activated as { ok: Record<string, unknown> }).ok;
  expect(active).toMatchObject({
    id: membershipId,
    familyId: NORWOOD,
    accountId: account,
    personId: "julia",
    status: { Active: null },
    approvedBy: [adminIdentity.getPrincipal()],
  });
  expect(active.joinedAt).toHaveLength(1);
  expect(active.approvedAt).toHaveLength(1);

  // The active membership now satisfies the active-access predicate.
  expect(
    ok(await actor.hasActiveMembershipForFamily(NORWOOD, account)),
  ).toBe(true);

  // Activating an already-active membership is an invalid transition.
  await expect(
    actor.activateMembershipForFamily(NORWOOD, membershipId),
  ).resolves.toEqual({ err: { InvalidTransition: null } });
});

// ---------------------------------------------------------------------------
// (5) Approval identity: the persisted approvedBy is the real authenticated
//     caller, never a caller-supplied identity. The canonical signature is
//     two-argument, so there is no approver argument to spoof; this test pins
//     that the stored approver is the Steward who called, and that a different
//     signed-in caller cannot cause anyone else to be recorded.
// ---------------------------------------------------------------------------

it("records the real authenticated Steward as approvedBy, never another principal", async () => {
  const { actor } = await setup();
  const account = contributorIdentity.getPrincipal();

  actor.setIdentity(adminIdentity);
  const created = await actor.createPendingMembershipForFamily(
    NORWOOD,
    account,
    "julia",
  );
  const membershipId = (created as { ok: { id: bigint } }).ok.id;

  // The Steward activates. The stored approver is the Steward's own principal,
  // not the member's and not any other identity.
  const activated = await actor.activateMembershipForFamily(NORWOOD, membershipId);
  const active = (activated as { ok: { approvedBy: unknown[] } }).ok;
  expect(active.approvedBy).toEqual([adminIdentity.getPrincipal()]);
  expect(active.approvedBy).not.toEqual([contributorIdentity.getPrincipal()]);
  expect(active.approvedBy).not.toEqual([memberAIdentity.getPrincipal()]);
});

it("does not let a non-Steward cause approvedBy to be recorded as anyone", async () => {
  const { actor } = await setup();
  const account = contributorIdentity.getPrincipal();

  actor.setIdentity(adminIdentity);
  const created = await actor.createPendingMembershipForFamily(
    NORWOOD,
    account,
    "julia",
  );
  const membershipId = (created as { ok: { id: bigint } }).ok.id;

  // A signed-in non-Steward (the member itself) is denied, and no approver is
  // recorded: the membership stays #Pending with approvedBy unset.
  actor.setIdentity(contributorIdentity);
  await expect(
    actor.activateMembershipForFamily(NORWOOD, membershipId),
  ).resolves.toEqual({ err: { NotAuthorized: null } });

  actor.setIdentity(adminIdentity);
  const stillPending = ok(await actor.getMembershipForFamily(NORWOOD, account));
  expect(stillPending[0].status).toEqual({ Pending: null });
  expect(stillPending[0].approvedBy).toEqual([]);
  expect(stillPending[0].approvedAt).toEqual([]);
});

// ---------------------------------------------------------------------------
// (6) Invariants: a duplicate membership for the same account+family is
//     rejected, and a second #Active membership for an already-owned person
//     profile in the same family is rejected.
// ---------------------------------------------------------------------------

it("rejects a duplicate membership for the same account in the same family", async () => {
  const { actor } = await setup();
  const account = contributorIdentity.getPrincipal();

  actor.setIdentity(adminIdentity);
  const first = await actor.createPendingMembershipForFamily(
    NORWOOD,
    account,
    "julia",
  );
  expect("ok" in first).toBe(true);

  const second = await actor.createPendingMembershipForFamily(
    NORWOOD,
    account,
    "clayton",
  );
  expect(second).toEqual({ err: { AlreadyMember: null } });
});

it("rejects a second #Active membership for an already-owned person profile in the same family", async () => {
  const { actor } = await setup();
  const owner = contributorIdentity.getPrincipal();
  const other = memberAIdentity.getPrincipal();

  actor.setIdentity(adminIdentity);
  const first = await actor.createPendingMembershipForFamily(
    NORWOOD,
    owner,
    "julia",
  );
  const firstId = (first as { ok: { id: bigint } }).ok.id;
  await actor.activateMembershipForFamily(NORWOOD, firstId);

  // A different account cannot claim the same person profile in the same
  // family while an #Active membership owns it.
  const second = await actor.createPendingMembershipForFamily(
    NORWOOD,
    other,
    "julia",
  );
  expect(second).toEqual({ err: { ProfileAlreadyOwned: null } });
});

// ---------------------------------------------------------------------------
// (7) Active -> Suspended and Active -> Left transitions succeed, and every
//     inactive status returns false from hasActiveMembershipForFamily.
// ---------------------------------------------------------------------------

it("suspends an #Active membership and revokes active access", async () => {
  const { actor } = await setup();
  const account = contributorIdentity.getPrincipal();

  actor.setIdentity(adminIdentity);
  const created = await actor.createPendingMembershipForFamily(
    NORWOOD,
    account,
    "julia",
  );
  const membershipId = (created as { ok: { id: bigint } }).ok.id;
  await actor.activateMembershipForFamily(NORWOOD, membershipId);

  const suspended = await actor.suspendMembershipForFamily(NORWOOD, membershipId);
  expect(suspended).toEqual({
    ok: expect.objectContaining({ id: membershipId, status: { Suspended: null } }),
  });
  expect(
    ok(await actor.hasActiveMembershipForFamily(NORWOOD, account)),
  ).toBe(false);

  // Suspending a non-active membership is an invalid transition.
  await expect(
    actor.suspendMembershipForFamily(NORWOOD, membershipId),
  ).resolves.toEqual({ err: { InvalidTransition: null } });
});

it("lets the member leave an #Active membership and revokes active access", async () => {
  const { actor } = await setup();
  const account = contributorIdentity.getPrincipal();

  actor.setIdentity(adminIdentity);
  const created = await actor.createPendingMembershipForFamily(
    NORWOOD,
    account,
    "julia",
  );
  const membershipId = (created as { ok: { id: bigint } }).ok.id;
  await actor.activateMembershipForFamily(NORWOOD, membershipId);

  // The membership's own account may leave it.
  actor.setIdentity(contributorIdentity);
  const left = await actor.leaveFamilyMembership(NORWOOD, membershipId);
  expect(left).toEqual({
    ok: expect.objectContaining({ id: membershipId, status: { Left: null } }),
  });
  expect(
    ok(await actor.hasActiveMembershipForFamily(NORWOOD, account)),
  ).toBe(false);

  // Leaving a non-active membership is an invalid transition.
  await expect(
    actor.leaveFamilyMembership(NORWOOD, membershipId),
  ).resolves.toEqual({ err: { InvalidTransition: null } });
});

it("lets an active Steward mark a member's membership Left", async () => {
  const { actor } = await setup();
  const account = contributorIdentity.getPrincipal();

  actor.setIdentity(adminIdentity);
  const created = await actor.createPendingMembershipForFamily(
    NORWOOD,
    account,
    "julia",
  );
  const membershipId = (created as { ok: { id: bigint } }).ok.id;
  await actor.activateMembershipForFamily(NORWOOD, membershipId);

  // The Steward (not the member) records the leave.
  const left = await actor.leaveFamilyMembership(NORWOOD, membershipId);
  expect(left).toEqual({
    ok: expect.objectContaining({ id: membershipId, status: { Left: null } }),
  });
});

it("returns false from hasActiveMembershipForFamily for Pending, Suspended, and Left", async () => {
  const { actor } = await setup();
  const account = contributorIdentity.getPrincipal();

  actor.setIdentity(adminIdentity);
  const created = await actor.createPendingMembershipForFamily(
    NORWOOD,
    account,
    "julia",
  );
  const membershipId = (created as { ok: { id: bigint } }).ok.id;

  // Pending.
  expect(
    ok(await actor.hasActiveMembershipForFamily(NORWOOD, account)),
  ).toBe(false);

  // Active.
  await actor.activateMembershipForFamily(NORWOOD, membershipId);
  expect(
    ok(await actor.hasActiveMembershipForFamily(NORWOOD, account)),
  ).toBe(true);

  // Suspended.
  await actor.suspendMembershipForFamily(NORWOOD, membershipId);
  expect(
    ok(await actor.hasActiveMembershipForFamily(NORWOOD, account)),
  ).toBe(false);

  // Left.
  await actor.activateMembershipForFamily(NORWOOD, membershipId);
  actor.setIdentity(contributorIdentity);
  await actor.leaveFamilyMembership(NORWOOD, membershipId);
  expect(
    ok(await actor.hasActiveMembershipForFamily(NORWOOD, account)),
  ).toBe(false);
});

// ---------------------------------------------------------------------------
// (8) Family scoping: a membership in one family grants no access in another,
//     and a membership id from another family never resolves.
// ---------------------------------------------------------------------------

it("does not leak a Norwood membership into another family's lookups", async () => {
  const { actor } = await setupWithFamilyA();
  const account = contributorIdentity.getPrincipal();

  actor.setIdentity(adminIdentity);
  const created = await actor.createPendingMembershipForFamily(
    NORWOOD,
    account,
    "julia",
  );
  const membershipId = (created as { ok: { id: bigint } }).ok.id;
  await actor.activateMembershipForFamily(NORWOOD, membershipId);

  // The account is Active in Norwood.
  expect(
    ok(await actor.hasActiveMembershipForFamily(NORWOOD, account)),
  ).toBe(true);

  // memberA is an approved member of Family A (via createMyselfForFamily) but
  // holds no FamilyMembership record there, and the Norwood membership is not
  // visible under Family A. The Family A reads are made as memberA, who is
  // authorized for that family.
  actor.setIdentity(memberAIdentity);
  expect(ok(await actor.getMyMembershipForFamily(FAMILY_A))).toEqual([]);
  expect(
    ok(await actor.hasActiveMembershipForFamily(FAMILY_A, memberAIdentity.getPrincipal())),
  ).toBe(false);
  const familyAMembers = ok(await actor.listFamilyMembersForFamily(FAMILY_A));
  expect(familyAMembers.every((m) => m.familyId === FAMILY_A)).toBe(true);
  expect(familyAMembers.find((m) => m.id === membershipId)).toBeUndefined();

  // The Norwood membership is still the only one the account holds.
  // `listMembershipsForAccount` is self-only, so it is read as the account.
  actor.setIdentity(contributorIdentity);
  const forAccount = ok(await actor.listMembershipsForAccount(account));
  expect(forAccount).toHaveLength(1);
  expect(forAccount[0]).toMatchObject({ familyId: NORWOOD, status: { Active: null } });
});

it("does not resolve a membership id under the wrong family", async () => {
  const { actor } = await setupWithFamilyA();
  const account = contributorIdentity.getPrincipal();

  actor.setIdentity(adminIdentity);
  const created = await actor.createPendingMembershipForFamily(
    NORWOOD,
    account,
    "julia",
  );
  const membershipId = (created as { ok: { id: bigint } }).ok.id;

  // The Norwood Steward is not a Steward of Family A, so the authority check
  // denies before the membership lookup is even consulted. The Norwood
  // membership id therefore never resolves under Family A.
  await expect(
    actor.activateMembershipForFamily(FAMILY_A, membershipId),
  ).resolves.toEqual({ err: { NotAuthorized: null } });
  await expect(
    actor.suspendMembershipForFamily(FAMILY_A, membershipId),
  ).resolves.toEqual({ err: { NotAuthorized: null } });

  // The Norwood membership is untouched.
  const norwood = ok(await actor.getMembershipForFamily(NORWOOD, account));
  expect(norwood[0].status).toEqual({ Pending: null });
});

// ---------------------------------------------------------------------------
// (9) getMyMembershipForFamily is caller-scoped: it returns the caller's own
//     membership and never another account's.
// ---------------------------------------------------------------------------

it("returns the caller's own membership from getMyMembershipForFamily", async () => {
  const { actor } = await setup();
  const account = contributorIdentity.getPrincipal();

  actor.setIdentity(adminIdentity);
  const created = await actor.createPendingMembershipForFamily(
    NORWOOD,
    account,
    "julia",
  );
  const membershipId = (created as { ok: { id: bigint } }).ok.id;

  // The account sees its own membership.
  actor.setIdentity(contributorIdentity);
  const mine = ok(await actor.getMyMembershipForFamily(NORWOOD));
  expect(mine).toHaveLength(1);
  expect(mine[0]).toMatchObject({ id: membershipId, accountId: account });

  // A different caller sees none.
  actor.setIdentity(memberAIdentity);
  expect(ok(await actor.getMyMembershipForFamily(NORWOOD))).toEqual([]);
});

// ---------------------------------------------------------------------------
// (10) Privacy: a signed-in caller who is neither the target account nor an
//      active Steward of the family is denied on every read, and the denial is
//      uniform and non-leaking.
// ---------------------------------------------------------------------------

it("denies an unrelated signed-in caller on every membership read", async () => {
  const { actor } = await setup();
  const account = contributorIdentity.getPrincipal();

  actor.setIdentity(adminIdentity);
  const created = await actor.createPendingMembershipForFamily(
    NORWOOD,
    account,
    "julia",
  );
  const membershipId = (created as { ok: { id: bigint } }).ok.id;
  await actor.activateMembershipForFamily(NORWOOD, membershipId);

  // memberA is signed in but is neither the target account nor a Steward of
  // Norwood.
  actor.setIdentity(memberAIdentity);
  await expect(
    actor.getMembershipForFamily(NORWOOD, account),
  ).resolves.toEqual({ err: { NotAuthorized: null } });
  await expect(
    actor.listMembershipsForAccount(account),
  ).resolves.toEqual({ err: { NotAuthorized: null } });
  await expect(
    actor.hasActiveMembershipForFamily(NORWOOD, account),
  ).resolves.toEqual({ err: { NotAuthorized: null } });
  await expect(
    actor.listFamilyMembersForFamily(NORWOOD),
  ).resolves.toEqual({ err: { NotAuthorized: null } });
});

it("denies an anonymous caller on every membership read", async () => {
  const { actor, canisterId } = await setup();
  const account = contributorIdentity.getPrincipal();

  actor.setIdentity(adminIdentity);
  await actor.createPendingMembershipForFamily(NORWOOD, account, "julia");

  const anonymous = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  await expect(
    anonymous.getMembershipForFamily(NORWOOD, account),
  ).resolves.toEqual({ err: { NotSignedIn: null } });
  await expect(
    anonymous.getMyMembershipForFamily(NORWOOD),
  ).resolves.toEqual({ err: { NotSignedIn: null } });
  await expect(
    anonymous.listMembershipsForAccount(account),
  ).resolves.toEqual({ err: { NotSignedIn: null } });
  await expect(
    anonymous.listFamilyMembersForFamily(NORWOOD),
  ).resolves.toEqual({ err: { NotSignedIn: null } });
  await expect(
    anonymous.hasActiveMembershipForFamily(NORWOOD, account),
  ).resolves.toEqual({ err: { NotSignedIn: null } });
});

it("returns the same denial for a target in another family as for a non-existent target", async () => {
  const { actor } = await setupWithFamilyA();
  const account = contributorIdentity.getPrincipal();

  actor.setIdentity(adminIdentity);
  const created = await actor.createPendingMembershipForFamily(
    NORWOOD,
    account,
    "julia",
  );
  const membershipId = (created as { ok: { id: bigint } }).ok.id;
  await actor.activateMembershipForFamily(NORWOOD, membershipId);

  // memberA is an approved member of Family A but not a Steward of Norwood.
  actor.setIdentity(memberAIdentity);
  const realTarget = await actor.getMembershipForFamily(NORWOOD, account);
  const nonExistentTarget = await actor.getMembershipForFamily(
    NORWOOD,
    strangerIdentity.getPrincipal(),
  );

  // Both denials are identical, so the caller cannot tell whether the target
  // account is a member of another family. The non-existent target is a
  // different account from the caller, so the self clause cannot authorize it.
  expect(realTarget).toEqual({ err: { NotAuthorized: null } });
  expect(nonExistentTarget).toEqual(realTarget);
});

it("lets an active Steward read another account's membership in the same family", async () => {
  const { actor } = await setup();
  const account = contributorIdentity.getPrincipal();

  actor.setIdentity(adminIdentity);
  const created = await actor.createPendingMembershipForFamily(
    NORWOOD,
    account,
    "julia",
  );
  const membershipId = (created as { ok: { id: bigint } }).ok.id;

  // The Steward may inspect the target account's membership in Norwood.
  const byFamily = ok(await actor.getMembershipForFamily(NORWOOD, account));
  expect(byFamily).toHaveLength(1);
  expect(byFamily[0]).toMatchObject({ id: membershipId, accountId: account });
  expect(
    ok(await actor.hasActiveMembershipForFamily(NORWOOD, account)),
  ).toBe(false);
});
