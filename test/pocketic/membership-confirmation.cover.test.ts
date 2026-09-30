import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type {
  MembershipConfirmation,
  MembershipConfirmationApplicantView,
  MembershipConfirmationState,
  _SERVICE,
} from "../../src/frontend/src/declarations/backend.did";
import {
  BACKEND_WASM,
  adminIdentity,
  registerApprovedContributor,
} from "./lane-helpers";

// ---------------------------------------------------------------------------
// Onboarding Phase 1D — MembershipConfirmation trusted-relative confirmation
// (real-canister cover), reconciled to the confirmation-dispute change.
//
// The accepted behavior is a persistent, family-scoped confirmation record that
// lets an existing trusted relative vouch for a `#Pending` FamilyMembership,
// with a lightweight confirmation state that tracks resolution WITHOUT
// duplicating `FamilyMembership.status`:
//
//   - `confirmPendingMembership` derives the caller, the confirmer person, and
//     the qualifying relationship server-side. It rejects a confirmer with no
//     `#Active` membership in the family, a confirmer with no qualifying
//     confirmed relationship, self-confirmation, and an anonymous caller. One
//     confirmer holds at most one decision per membership (a repeat call safely
//     updates it in place).
//   - A `#Pending` membership with at least one `#Confirmed` and no `#Disputed`
//     activates through the existing secure activation path and reads
//     `#ApprovedByRelative`.
//   - A second qualifying trusted relative may submit `#Disputed` against an
//     `#ApprovedByRelative` `#Active` membership: the dispute is recorded, the
//     membership transitions `#Active` -> `#Suspended`, and the state reads
//     `#StewardReviewRequired`. A `#Disputed` against a `#Pending` membership
//     leaves it `#Pending` and escalates.
//   - `resolveMembershipConfirmation` is Steward-of-family only. `#Approve`
//     activates a `#Pending` membership and restores a confirmation-suspended
//     membership to `#Active`; `#Reject` leaves the membership non-`#Active`
//     with a persisted resolved rejection; `#NeedsMoreInformation` keeps the
//     case open at `#StewardReviewRequired`. A single dispute never deletes the
//     pending membership.
//   - The read model is split: `getMyMembershipConfirmationState` returns a
//     redacted applicant view (no confirmer account principal, no sensitive
//     relationship context), and `getMembershipConfirmationStateForSteward`
//     returns the full family-scoped record.
//   - Two-family isolation: a Family A member cannot confirm a Family B
//     membership, a Family A relationship cannot satisfy a Family B
//     confirmation, a Steward of A cannot resolve B, and confirmations in A
//     never appear in B.
//
// The frontend suite mocks the actor and has no principals at all, so none of
// this is visible there. This file installs the app's own compiled wasm and
// drives the real public API.
//
// Seeding note: the canister is shared across the tests in this file (installing
// it replays the whole migration chain and is the lane's most expensive
// operation). Every test therefore creates its OWN profiles through
// `createMyselfForFamily` and its own deterministic identities, so no test can
// collide with another's membership or relationship state. The confirmer and
// pending persons are real profiles in the family, which is what lets the
// Steward add the qualifying confirmed relationship between them.
//
// Coverage limits this file cannot close (recorded in the episode):
//
//   - There is no public endpoint that creates a Steward of a non-default
//     family (`claimSteward` writes `familyId = "norwood"`), so the
//     "Family A Steward resolves Family A" direction cannot be bootstrapped
//     through the public API. The cross-family assertions below drive the
//     denial direction (a Norwood Steward cannot resolve Family A, a Family A
//     member cannot confirm Norwood) plus the family-scoped read boundary.
//   - The migration across a real upgrade lives in the sibling upgrade tests.
//   - The `#AlreadyDecided` error variant is declared but the accepted behavior
//     is a safe in-place update, so the duplicate path is asserted as an update
//     rather than a rejection.
//   - The `#ActivationFailed` path is asserted for consistency (no
//     `#ApprovedByRelative`, membership unchanged) but the underlying
//     activation failure is not forced through the public API, so the rollback
//     branch itself is not driven end-to-end.
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

interface Seeded {
  actor: _SERVICE;
  canisterId: ReturnType<typeof createIdentity>["getPrincipal"];
}

// Installing a canister replays the whole migration chain and is the lane's most
// expensive operation, so this file shares ONE canister across its tests. Every
// test creates its own profiles and its own deterministic identities, and every
// read is family-scoped, so the tests do not interfere.
let shared: Seeded | undefined;

/** The shared canister, installed once on first use. */
async function setup(): Promise<Seeded> {
  if (shared === undefined) {
    const setupResult = await pic!.setupCanister<_SERVICE>({
      idlFactory,
      wasm: BACKEND_WASM,
    });
    shared = { actor: setupResult.actor, canisterId: setupResult.canisterId };
    // ADMIN becomes the Norwood Family Steward; CONTRIBUTOR becomes an approved
    // claimed Norwood member. The confirmation tests below use their own fresh
    // identities, so this bootstrap only establishes the Steward.
    await registerApprovedContributor(shared.actor);
  }
  return shared;
}

/** A minimal valid founder input. */
function founderInput(firstName: string, lastName: string) {
  return {
    firstName,
    lastName,
    middleName: [] as [] | [string],
    suffix: [] as [] | [string],
    preferredName: [] as [] | [string],
    birthDate: [] as [] | [string],
    birthYear: [] as [] | [string],
    birthplace: [] as [] | [string],
    currentLocation: [] as [] | [string],
  };
}

/** Unwraps a `Result` read, failing the test on an unexpected `#err`. */
function ok<T>(result: { ok: T } | { err: unknown }): T {
  if (!("ok" in result)) {
    throw new Error(`expected #ok, got ${JSON.stringify(result)}`);
  }
  return result.ok;
}

/**
 * Renders a Candid value for an error message without tripping over `bigint`
 * fields (`JSON.stringify` throws on a bigint).
 */
function describe(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
}

interface ConfirmationCase {
  /** The confirmer's identity (holds an #Active membership in the family). */
  confirmer: ReturnType<typeof createIdentity>;
  /** The pending membership's own account. */
  pendingAccount: ReturnType<typeof createIdentity>;
  /** The pending membership id. */
  membershipId: bigint;
  /** The confirmer's personId in the family. */
  confirmerPersonId: string;
  /** The pending person's personId in the family. */
  pendingPersonId: string;
}

/**
 * Creates a fresh profile in `familyId` for `identity` via
 * `createMyselfForFamily` and returns its personId. The profile is a real
 * family profile, which is what lets the Steward add a confirmed relationship
 * involving it.
 */
async function createProfile(
  actor: _SERVICE,
  identity: ReturnType<typeof createIdentity>,
  familyId: string,
  name: string,
): Promise<string> {
  actor.setIdentity(identity);
  const created = ok(await actor.createMyselfForFamily(familyId, name));
  return created.personId;
}

/**
 * Seeds a confirmation case in `familyId`:
 *
 *   1. a `#Pending` membership for a fresh account linked to a fresh pending
 *      profile;
 *   2. an `#Active` membership for a fresh confirmer identity linked to a fresh
 *      confirmer profile;
 *   3. a `#Confirmed` relationship between the two people.
 *
 * All three are created by the family Steward (ADMIN for Norwood). Every test
 * passes a distinct `seed` so its identities and profiles never collide with
 * another test's on the shared canister.
 */
async function seedConfirmationCase(
  actor: _SERVICE,
  familyId: string,
  seed: string,
  relationshipType: { Sibling: null } | { Parent: null } = { Sibling: null },
): Promise<ConfirmationCase> {
  const confirmer = createIdentity(`confirmation-confirmer-${seed}`);
  const pendingAccount = createIdentity(`confirmation-pending-${seed}`);

  const confirmerPersonId = await createProfile(
    actor,
    confirmer,
    familyId,
    `Confirmer ${seed}`,
  );
  const pendingPersonId = await createProfile(
    actor,
    pendingAccount,
    familyId,
    `Pending ${seed}`,
  );

  actor.setIdentity(adminIdentity);
  const pending = ok(
    await actor.createPendingMembershipForFamily(
      familyId,
      pendingAccount.getPrincipal(),
      pendingPersonId,
    ),
  );
  const confirmerMembership = ok(
    await actor.createPendingMembershipForFamily(
      familyId,
      confirmer.getPrincipal(),
      confirmerPersonId,
    ),
  );
  ok(await actor.activateMembershipForFamily(familyId, confirmerMembership.id));

  const relationship = await actor.addRelationshipForFamily(
    familyId,
    confirmerPersonId,
    pendingPersonId,
    relationshipType,
  );
  expect("ok" in relationship).toBe(true);

  return {
    confirmer,
    pendingAccount,
    membershipId: pending.id,
    confirmerPersonId,
    pendingPersonId,
  };
}

/**
 * Adds a second qualifying confirmer (an `#Active` membership plus a confirmed
 * relationship to `pendingPersonId`) and returns its identity.
 */
async function addSecondConfirmer(
  actor: _SERVICE,
  familyId: string,
  seed: string,
  pendingPersonId: string,
  relationshipType: { Sibling: null } | { Parent: null } = { Parent: null },
): Promise<ReturnType<typeof createIdentity>> {
  const secondConfirmer = createIdentity(`confirmation-second-${seed}`);
  const secondPersonId = await createProfile(
    actor,
    secondConfirmer,
    familyId,
    `Second ${seed}`,
  );
  actor.setIdentity(adminIdentity);
  const secondMembership = ok(
    await actor.createPendingMembershipForFamily(
      familyId,
      secondConfirmer.getPrincipal(),
      secondPersonId,
    ),
  );
  ok(await actor.activateMembershipForFamily(familyId, secondMembership.id));
  ok(
    await actor.addRelationshipForFamily(
      familyId,
      secondPersonId,
      pendingPersonId,
      relationshipType,
    ),
  );
  return secondConfirmer;
}

/** Reads the FULL Steward confirmation state tuple as the given identity. */
async function readStewardState(
  actor: _SERVICE,
  identity: ReturnType<typeof createIdentity>,
  familyId: string,
  membershipId: bigint,
): Promise<[MembershipConfirmationState, MembershipConfirmation[], unknown]> {
  actor.setIdentity(identity);
  return ok(await actor.getMembershipConfirmationStateForSteward(familyId, membershipId));
}

/** Reads the REDACTED applicant view as the given identity. */
async function readApplicantView(
  actor: _SERVICE,
  identity: ReturnType<typeof createIdentity>,
  familyId: string,
  membershipId: bigint,
): Promise<MembershipConfirmationApplicantView> {
  actor.setIdentity(identity);
  return ok(await actor.getMyMembershipConfirmationState(familyId, membershipId));
}

/** The membership status for `membershipId` in `familyId`, read as the Steward. */
async function membershipStatus(
  actor: _SERVICE,
  familyId: string,
  membershipId: bigint,
): Promise<unknown> {
  actor.setIdentity(adminIdentity);
  const memberships = ok(await actor.listFamilyMembersForFamily(familyId));
  const membership = memberships.find((m) => m.id === membershipId);
  if (membership === undefined) {
    throw new Error(`membership ${membershipId.toString()} not found in ${familyId}`);
  }
  return membership.status;
}

// ---------------------------------------------------------------------------
// (1) EMPTY STATE — a pending membership with no decisions reads
//     #AwaitingConfirmation and exposes no decisions or resolution.
// ---------------------------------------------------------------------------

it("answers an empty confirmation state without trapping", async () => {
  const { actor } = await setup();
  const seeded = await seedConfirmationCase(actor, NORWOOD, "empty-state");

  const [state, decisions, resolution] = await readStewardState(
    actor,
    adminIdentity,
    NORWOOD,
    seeded.membershipId,
  );
  expect(state).toEqual({ AwaitingConfirmation: null });
  expect(decisions).toEqual([]);
  expect(resolution).toEqual([]);

  // The confirmer has not decided yet.
  actor.setIdentity(seeded.confirmer);
  expect(ok(await actor.getMyConfirmationForMembership(NORWOOD, seeded.membershipId))).toEqual([]);
});

// ---------------------------------------------------------------------------
// (2) CONFIRMED — one valid #Confirmed activates through the existing path.
// ---------------------------------------------------------------------------

it("activates a #Pending membership on one valid #Confirmed decision", async () => {
  const { actor } = await setup();
  const seeded = await seedConfirmationCase(actor, NORWOOD, "confirmed-activates");

  actor.setIdentity(seeded.confirmer);
  const record = ok(
    await actor.confirmPendingMembership(NORWOOD, seeded.membershipId, { Confirmed: null }),
  );

  // The record derives the confirmer identity and the pending person
  // server-side; the caller cannot spoof either.
  expect(record.familyId).toBe(NORWOOD);
  expect(record.membershipId).toBe(seeded.membershipId);
  expect(record.pendingPersonId).toBe(seeded.pendingPersonId);
  expect(record.confirmerAccountId).toEqual(seeded.confirmer.getPrincipal());
  expect(record.confirmerPersonId).toBe(seeded.confirmerPersonId);
  expect(record.decision).toEqual({ Confirmed: null });
  expect(record.relationshipId).toHaveLength(1);

  // The membership is now #Active through the existing activation path, and the
  // confirmation state reads #ApprovedByRelative.
  expect(await membershipStatus(actor, NORWOOD, seeded.membershipId)).toEqual({ Active: null });
  const [state, decisions] = await readStewardState(
    actor,
    adminIdentity,
    NORWOOD,
    seeded.membershipId,
  );
  expect(state).toEqual({ ApprovedByRelative: null });
  expect(decisions).toHaveLength(1);
  expect(decisions[0].id).toBe(record.id);
});

// ---------------------------------------------------------------------------
// (3) DISPUTE — a #Disputed against a #Pending membership leaves it #Pending
//     and escalates.
// ---------------------------------------------------------------------------

it("leaves the membership #Pending and escalates on a #Disputed decision", async () => {
  const { actor } = await setup();
  const seeded = await seedConfirmationCase(actor, NORWOOD, "disputed-pending");

  actor.setIdentity(seeded.confirmer);
  ok(await actor.confirmPendingMembership(NORWOOD, seeded.membershipId, { Disputed: null }));

  expect(await membershipStatus(actor, NORWOOD, seeded.membershipId)).toEqual({ Pending: null });
  const [state] = await readStewardState(actor, adminIdentity, NORWOOD, seeded.membershipId);
  expect(state).toEqual({ StewardReviewRequired: null });
});

it("escalates when a #Confirmed and a #Disputed decision conflict", async () => {
  const { actor } = await setup();
  const seeded = await seedConfirmationCase(actor, NORWOOD, "conflict");

  // A second confirmer with an Active membership and a qualifying relationship.
  const secondConfirmer = await addSecondConfirmer(
    actor,
    NORWOOD,
    "conflict-second",
    seeded.pendingPersonId,
  );

  actor.setIdentity(seeded.confirmer);
  ok(await actor.confirmPendingMembership(NORWOOD, seeded.membershipId, { Confirmed: null }));

  actor.setIdentity(secondConfirmer);
  ok(await actor.confirmPendingMembership(NORWOOD, seeded.membershipId, { Disputed: null }));

  // The first #Confirmed activated the membership, so the later #Disputed is a
  // post-activation dispute: it suspends the relative-activated membership and
  // escalates to the Steward.
  expect(await membershipStatus(actor, NORWOOD, seeded.membershipId)).toEqual({ Suspended: null });
  const [state, decisions] = await readStewardState(
    actor,
    adminIdentity,
    NORWOOD,
    seeded.membershipId,
  );
  expect(state).toEqual({ StewardReviewRequired: null });
  expect(decisions).toHaveLength(2);
});

// ---------------------------------------------------------------------------
// (3b) DISPUTE AFTER ACTIVATION — a second qualifying relative disputes an
//      #ApprovedByRelative #Active membership: the dispute is recorded, the
//      membership moves #Active -> #Suspended, and the state reads
//      #StewardReviewRequired.
// ---------------------------------------------------------------------------

it("suspends a relative-activated membership when a second relative disputes it", async () => {
  const { actor } = await setup();
  const seeded = await seedConfirmationCase(actor, NORWOOD, "post-activation-dispute");

  // The first relative confirms, activating the membership.
  actor.setIdentity(seeded.confirmer);
  ok(await actor.confirmPendingMembership(NORWOOD, seeded.membershipId, { Confirmed: null }));
  expect(await membershipStatus(actor, NORWOOD, seeded.membershipId)).toEqual({ Active: null });

  // A second qualifying relative disputes the now-Active membership.
  const secondConfirmer = await addSecondConfirmer(
    actor,
    NORWOOD,
    "post-activation-dispute-second",
    seeded.pendingPersonId,
  );
  actor.setIdentity(secondConfirmer);
  const dispute = ok(
    await actor.confirmPendingMembership(NORWOOD, seeded.membershipId, { Disputed: null }),
  );
  expect(dispute.decision).toEqual({ Disputed: null });

  // The membership is suspended and the case is escalated to the Steward.
  expect(await membershipStatus(actor, NORWOOD, seeded.membershipId)).toEqual({
    Suspended: null,
  });
  const [state, decisions] = await readStewardState(
    actor,
    adminIdentity,
    NORWOOD,
    seeded.membershipId,
  );
  expect(state).toEqual({ StewardReviewRequired: null });
  // Both decisions are preserved: the original confirmation and the dispute.
  expect(decisions).toHaveLength(2);
});

it("rejects a dispute against a Steward-approved final membership", async () => {
  const { actor } = await setup();
  const seeded = await seedConfirmationCase(actor, NORWOOD, "steward-approved-final");

  // The Steward activates the membership directly (not via relative
  // confirmation), so the case is not #ApprovedByRelative.
  actor.setIdentity(adminIdentity);
  ok(await actor.activateMembershipForFamily(NORWOOD, seeded.membershipId));

  actor.setIdentity(seeded.confirmer);
  await expect(
    actor.confirmPendingMembership(NORWOOD, seeded.membershipId, { Disputed: null }),
  ).resolves.toEqual({ err: { MembershipNotPending: null } });

  // The membership is untouched.
  expect(await membershipStatus(actor, NORWOOD, seeded.membershipId)).toEqual({ Active: null });
});

it("rejects a dispute against an unrelated #Suspended membership", async () => {
  const { actor } = await setup();
  const seeded = await seedConfirmationCase(actor, NORWOOD, "unrelated-suspended");

  // Activate then suspend directly as the Steward: the suspension did not
  // originate from a confirmation dispute, so the case is not challengeable.
  actor.setIdentity(adminIdentity);
  ok(await actor.activateMembershipForFamily(NORWOOD, seeded.membershipId));
  ok(await actor.suspendMembershipForFamily(NORWOOD, seeded.membershipId));

  actor.setIdentity(seeded.confirmer);
  await expect(
    actor.confirmPendingMembership(NORWOOD, seeded.membershipId, { Disputed: null }),
  ).resolves.toEqual({ err: { MembershipNotPending: null } });

  expect(await membershipStatus(actor, NORWOOD, seeded.membershipId)).toEqual({
    Suspended: null,
  });
});

it("rejects a dispute against a #Left membership", async () => {
  const { actor } = await setup();
  const seeded = await seedConfirmationCase(actor, NORWOOD, "left-membership");

  actor.setIdentity(adminIdentity);
  ok(await actor.activateMembershipForFamily(NORWOOD, seeded.membershipId));
  ok(await actor.leaveFamilyMembership(NORWOOD, seeded.membershipId));

  actor.setIdentity(seeded.confirmer);
  await expect(
    actor.confirmPendingMembership(NORWOOD, seeded.membershipId, { Disputed: null }),
  ).resolves.toEqual({ err: { MembershipNotPending: null } });

  expect(await membershipStatus(actor, NORWOOD, seeded.membershipId)).toEqual({ Left: null });
});

// ---------------------------------------------------------------------------
// (4) REJECTIONS — self, no membership, no relationship, non-pending, anon.
// ---------------------------------------------------------------------------

it("rejects self-confirmation", async () => {
  const { actor } = await setup();
  // The confirmer's own person is the pending person: a distinct account holds
  // an #Active membership for the SAME personId as the pending membership.
  const pendingAccount = createIdentity("confirmation-self-pending");
  const selfConfirmer = createIdentity("confirmation-self-confirmer");
  const selfPersonId = await createProfile(actor, selfConfirmer, NORWOOD, "Self Confirmer");

  actor.setIdentity(adminIdentity);
  const pending = ok(
    await actor.createPendingMembershipForFamily(
      NORWOOD,
      pendingAccount.getPrincipal(),
      selfPersonId,
    ),
  );
  const selfMembership = ok(
    await actor.createPendingMembershipForFamily(
      NORWOOD,
      selfConfirmer.getPrincipal(),
      selfPersonId,
    ),
  );
  ok(await actor.activateMembershipForFamily(NORWOOD, selfMembership.id));

  actor.setIdentity(selfConfirmer);
  await expect(
    actor.confirmPendingMembership(NORWOOD, pending.id, { Confirmed: null }),
  ).resolves.toEqual({ err: { SelfConfirmation: null } });
});

it("rejects a confirmer with no #Active membership in the family", async () => {
  const { actor } = await setup();
  const seeded = await seedConfirmationCase(actor, NORWOOD, "no-active-membership");

  // A signed-in identity with no membership anywhere.
  const outsider = createIdentity("confirmation-outsider-seed");
  actor.setIdentity(outsider);
  await actor._initialize_access_control();
  await expect(
    actor.confirmPendingMembership(NORWOOD, seeded.membershipId, { Confirmed: null }),
  ).resolves.toEqual({ err: { NoActiveMembership: null } });
});

it("rejects a confirmer with no qualifying confirmed relationship", async () => {
  const { actor } = await setup();
  // The confirmer holds an #Active membership but there is no relationship to
  // the pending person.
  const confirmer = createIdentity("confirmation-norel-confirmer");
  const pendingAccount = createIdentity("confirmation-norel-pending");
  const confirmerPersonId = await createProfile(
    actor,
    confirmer,
    NORWOOD,
    "No Relationship Confirmer",
  );
  const pendingPersonId = await createProfile(
    actor,
    pendingAccount,
    NORWOOD,
    "No Relationship Pending",
  );

  actor.setIdentity(adminIdentity);
  const pending = ok(
    await actor.createPendingMembershipForFamily(
      NORWOOD,
      pendingAccount.getPrincipal(),
      pendingPersonId,
    ),
  );
  const confirmerMembership = ok(
    await actor.createPendingMembershipForFamily(
      NORWOOD,
      confirmer.getPrincipal(),
      confirmerPersonId,
    ),
  );
  ok(await actor.activateMembershipForFamily(NORWOOD, confirmerMembership.id));

  actor.setIdentity(confirmer);
  await expect(
    actor.confirmPendingMembership(NORWOOD, pending.id, { Confirmed: null }),
  ).resolves.toEqual({ err: { NoQualifyingRelationship: null } });
});

it("rejects confirming a membership that is not #Pending", async () => {
  const { actor } = await setup();
  const seeded = await seedConfirmationCase(actor, NORWOOD, "not-pending");

  // Activate the membership first through the Steward path.
  actor.setIdentity(adminIdentity);
  ok(await actor.activateMembershipForFamily(NORWOOD, seeded.membershipId));

  actor.setIdentity(seeded.confirmer);
  await expect(
    actor.confirmPendingMembership(NORWOOD, seeded.membershipId, { Confirmed: null }),
  ).resolves.toEqual({ err: { MembershipNotPending: null } });
});

it("rejects an anonymous caller from confirming", async () => {
  const { actor, canisterId } = await setup();
  const seeded = await seedConfirmationCase(actor, NORWOOD, "anonymous-confirm");

  const anonymous = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  await expect(
    anonymous.confirmPendingMembership(NORWOOD, seeded.membershipId, { Confirmed: null }),
  ).resolves.toEqual({ err: { NotSignedIn: null } });
});

// ---------------------------------------------------------------------------
// (5) DUPLICATE — one confirmer holds at most one decision per membership; a
//     repeat call safely updates it in place.
// ---------------------------------------------------------------------------

it("safely updates a confirmer's existing decision in place", async () => {
  const { actor } = await setup();
  const seeded = await seedConfirmationCase(actor, NORWOOD, "duplicate-decision");

  actor.setIdentity(seeded.confirmer);
  const first = ok(
    await actor.confirmPendingMembership(NORWOOD, seeded.membershipId, { Confirmed: null }),
  );
  const second = ok(
    await actor.confirmPendingMembership(NORWOOD, seeded.membershipId, { Disputed: null }),
  );

  // The same record is updated, not duplicated.
  expect(second.id).toBe(first.id);
  expect(second.decision).toEqual({ Disputed: null });
  expect(second.createdAt).toBe(first.createdAt);

  const [state, decisions] = await readStewardState(
    actor,
    adminIdentity,
    NORWOOD,
    seeded.membershipId,
  );
  expect(decisions).toHaveLength(1);
  expect(state).toEqual({ StewardReviewRequired: null });
  // The first #Confirmed activated the membership; the in-place update to
  // #Disputed is a post-activation dispute, so the membership is suspended.
  expect(await membershipStatus(actor, NORWOOD, seeded.membershipId)).toEqual({ Suspended: null });
});

// ---------------------------------------------------------------------------
// (6) STEWARD RESOLUTION — Approve activates, Reject preserves Pending with a
//     resolved rejection, NeedsMoreInformation keeps the case open.
// ---------------------------------------------------------------------------

/** Seeds an escalated case (a single #Disputed) and returns it. */
async function seedEscalatedCase(
  actor: _SERVICE,
  seed: string,
): Promise<ConfirmationCase> {
  const seeded = await seedConfirmationCase(actor, NORWOOD, seed);
  actor.setIdentity(seeded.confirmer);
  ok(await actor.confirmPendingMembership(NORWOOD, seeded.membershipId, { Disputed: null }));
  return seeded;
}

it("Steward #Approve activates the membership and records a resolution", async () => {
  const { actor } = await setup();
  const seeded = await seedEscalatedCase(actor, "approve-pending");

  actor.setIdentity(adminIdentity);
  const resolved = ok(
    await actor.resolveMembershipConfirmation(NORWOOD, seeded.membershipId, { Approve: null }),
  );
  expect(resolved.status).toEqual({ Active: null });

  const [state, , resolution] = await readStewardState(
    actor,
    adminIdentity,
    NORWOOD,
    seeded.membershipId,
  );
  expect(state).toEqual({ ResolvedBySteward: null });
  // The Steward read returns the resolution as a Candid optional, which the
  // declarations decode to `[] | [record]`.
  expect(resolution).toHaveLength(1);
  expect(resolution[0]).toMatchObject({
    familyId: NORWOOD,
    membershipId: seeded.membershipId,
    resolution: { Approve: null },
    resolvedByAccountId: adminIdentity.getPrincipal(),
  });
});

it("Steward #Approve restores a confirmation-suspended membership to #Active", async () => {
  const { actor } = await setup();
  const seeded = await seedConfirmationCase(actor, NORWOOD, "approve-suspended");

  // Relative confirmation activates, then a second relative disputes it,
  // suspending the membership.
  actor.setIdentity(seeded.confirmer);
  ok(await actor.confirmPendingMembership(NORWOOD, seeded.membershipId, { Confirmed: null }));
  const secondConfirmer = await addSecondConfirmer(
    actor,
    NORWOOD,
    "approve-suspended-second",
    seeded.pendingPersonId,
  );
  actor.setIdentity(secondConfirmer);
  ok(await actor.confirmPendingMembership(NORWOOD, seeded.membershipId, { Disputed: null }));
  expect(await membershipStatus(actor, NORWOOD, seeded.membershipId)).toEqual({
    Suspended: null,
  });

  // The Steward approves the dispute, restoring the membership to #Active.
  actor.setIdentity(adminIdentity);
  const resolved = ok(
    await actor.resolveMembershipConfirmation(NORWOOD, seeded.membershipId, { Approve: null }),
  );
  expect(resolved.status).toEqual({ Active: null });
  expect(await membershipStatus(actor, NORWOOD, seeded.membershipId)).toEqual({ Active: null });

  const [state] = await readStewardState(actor, adminIdentity, NORWOOD, seeded.membershipId);
  expect(state).toEqual({ ResolvedBySteward: null });
});

it("Steward #Reject leaves the membership not Active with a resolved rejection", async () => {
  const { actor } = await setup();
  const seeded = await seedEscalatedCase(actor, "reject-pending");

  actor.setIdentity(adminIdentity);
  const resolved = ok(
    await actor.resolveMembershipConfirmation(NORWOOD, seeded.membershipId, { Reject: null }),
  );
  // There is no #Rejected membership status: the membership stays #Pending.
  expect(resolved.status).toEqual({ Pending: null });

  const [state, , resolution] = await readStewardState(
    actor,
    adminIdentity,
    NORWOOD,
    seeded.membershipId,
  );
  expect(state).toEqual({ ResolvedBySteward: null });
  expect(resolution).toHaveLength(1);
  expect(resolution[0]).toMatchObject({ resolution: { Reject: null } });

  // The pending membership is never deleted.
  expect(await membershipStatus(actor, NORWOOD, seeded.membershipId)).toEqual({ Pending: null });
});

it("Steward #Reject leaves a confirmation-suspended membership non-Active", async () => {
  const { actor } = await setup();
  const seeded = await seedConfirmationCase(actor, NORWOOD, "reject-suspended");

  actor.setIdentity(seeded.confirmer);
  ok(await actor.confirmPendingMembership(NORWOOD, seeded.membershipId, { Confirmed: null }));
  const secondConfirmer = await addSecondConfirmer(
    actor,
    NORWOOD,
    "reject-suspended-second",
    seeded.pendingPersonId,
  );
  actor.setIdentity(secondConfirmer);
  ok(await actor.confirmPendingMembership(NORWOOD, seeded.membershipId, { Disputed: null }));

  actor.setIdentity(adminIdentity);
  const resolved = ok(
    await actor.resolveMembershipConfirmation(NORWOOD, seeded.membershipId, { Reject: null }),
  );
  expect(resolved.status).toEqual({ Suspended: null });

  const [state, , resolution] = await readStewardState(
    actor,
    adminIdentity,
    NORWOOD,
    seeded.membershipId,
  );
  expect(state).toEqual({ ResolvedBySteward: null });
  expect(resolution).toHaveLength(1);
  expect(resolution[0]).toMatchObject({ resolution: { Reject: null } });
  expect(await membershipStatus(actor, NORWOOD, seeded.membershipId)).toEqual({
    Suspended: null,
  });
});

it("Steward #NeedsMoreInformation keeps the case open and records no resolution", async () => {
  const { actor } = await setup();
  const seeded = await seedEscalatedCase(actor, "needs-more-info-pending");

  actor.setIdentity(adminIdentity);
  const resolved = ok(
    await actor.resolveMembershipConfirmation(NORWOOD, seeded.membershipId, {
      NeedsMoreInformation: null,
    }),
  );
  expect(resolved.status).toEqual({ Pending: null });

  const [state, , resolution] = await readStewardState(
    actor,
    adminIdentity,
    NORWOOD,
    seeded.membershipId,
  );
  expect(state).toEqual({ StewardReviewRequired: null });
  expect(resolution).toEqual([]);
});

it("Steward #NeedsMoreInformation leaves a disputed membership non-Active", async () => {
  const { actor } = await setup();
  const seeded = await seedConfirmationCase(actor, NORWOOD, "needs-more-info-suspended");

  actor.setIdentity(seeded.confirmer);
  ok(await actor.confirmPendingMembership(NORWOOD, seeded.membershipId, { Confirmed: null }));
  const secondConfirmer = await addSecondConfirmer(
    actor,
    NORWOOD,
    "needs-more-info-suspended-second",
    seeded.pendingPersonId,
  );
  actor.setIdentity(secondConfirmer);
  ok(await actor.confirmPendingMembership(NORWOOD, seeded.membershipId, { Disputed: null }));

  actor.setIdentity(adminIdentity);
  const resolved = ok(
    await actor.resolveMembershipConfirmation(NORWOOD, seeded.membershipId, {
      NeedsMoreInformation: null,
    }),
  );
  expect(resolved.status).toEqual({ Suspended: null });

  const [state, , resolution] = await readStewardState(
    actor,
    adminIdentity,
    NORWOOD,
    seeded.membershipId,
  );
  expect(state).toEqual({ StewardReviewRequired: null });
  expect(resolution).toEqual([]);
  expect(await membershipStatus(actor, NORWOOD, seeded.membershipId)).toEqual({
    Suspended: null,
  });
});

it("rejects a non-Steward from resolving a confirmation case", async () => {
  const { actor } = await setup();
  const seeded = await seedEscalatedCase(actor, "non-steward-resolve");

  // The confirmer is an approved member but not a Steward.
  actor.setIdentity(seeded.confirmer);
  await expect(
    actor.resolveMembershipConfirmation(NORWOOD, seeded.membershipId, { Approve: null }),
  ).resolves.toEqual({ err: { NotSteward: null } });

  // The membership is untouched.
  expect(await membershipStatus(actor, NORWOOD, seeded.membershipId)).toEqual({ Pending: null });
});

// ---------------------------------------------------------------------------
// (7) READ GATING AND REDACTION — the applicant read is own-account only and
//     redacted; the Steward read is Steward-only and full.
// ---------------------------------------------------------------------------

it("denies an unrelated signed-in caller and an anonymous caller on the state read", async () => {
  const { actor, canisterId } = await setup();
  const seeded = await seedConfirmationCase(actor, NORWOOD, "read-gating");

  const outsider = createIdentity("confirmation-read-outsider");
  actor.setIdentity(outsider);
  await actor._initialize_access_control();
  await expect(
    actor.getMyMembershipConfirmationState(NORWOOD, seeded.membershipId),
  ).resolves.toEqual({ err: { NotAuthorized: null } });
  await expect(
    actor.getMembershipConfirmationStateForSteward(NORWOOD, seeded.membershipId),
  ).resolves.toEqual({ err: { NotAuthorized: null } });

  const anonymous = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  await expect(
    anonymous.getMyMembershipConfirmationState(NORWOOD, seeded.membershipId),
  ).resolves.toEqual({ err: { NotSignedIn: null } });
  await expect(
    anonymous.getMembershipConfirmationStateForSteward(NORWOOD, seeded.membershipId),
  ).resolves.toEqual({ err: { NotSignedIn: null } });
  await expect(
    anonymous.getMyConfirmationForMembership(NORWOOD, seeded.membershipId),
  ).resolves.toEqual({ err: { NotSignedIn: null } });

  // The pending membership's own account and the Steward may read.
  const ownView = await readApplicantView(actor, seeded.pendingAccount, NORWOOD, seeded.membershipId);
  expect(ownView.state).toEqual({ AwaitingConfirmation: null });
  const [stewardState] = await readStewardState(actor, adminIdentity, NORWOOD, seeded.membershipId);
  expect(stewardState).toEqual({ AwaitingConfirmation: null });
});

it("returns a redacted applicant view with no confirmer principal or sensitive context", async () => {
  const { actor } = await setup();
  const seeded = await seedConfirmationCase(actor, NORWOOD, "redacted-view");

  actor.setIdentity(seeded.confirmer);
  ok(await actor.confirmPendingMembership(NORWOOD, seeded.membershipId, { Confirmed: null }));

  // The applicant (the pending membership's own account) reads the redacted view.
  const view = await readApplicantView(actor, seeded.pendingAccount, NORWOOD, seeded.membershipId);
  expect(view.state).toEqual({ ApprovedByRelative: null });
  // The applicant has not decided, so its own decision fields are absent
  // (Candid optionals decode to `[]` in the declarations' shape).
  expect(view.myDecision).toEqual([]);
  expect(view.myRelationship).toEqual([]);

  // The view carries no confirmer account principal and no sensitive context.
  const serialized = describe(view);
  expect(serialized).not.toContain(seeded.confirmer.getPrincipal().toText());
  for (const sensitive of ["Biological", "Adoptive", "Foster", "Step", "Guardian"]) {
    expect(serialized).not.toContain(sensitive);
  }
  expect(view).not.toHaveProperty("confirmerAccountId");
  expect(view).not.toHaveProperty("confirmerPersonId");
  expect(view).not.toHaveProperty("decisions");

  // The Steward read still returns the full family-scoped record.
  const [state, decisions] = await readStewardState(
    actor,
    adminIdentity,
    NORWOOD,
    seeded.membershipId,
  );
  expect(state).toEqual({ ApprovedByRelative: null });
  expect(decisions).toHaveLength(1);
  expect(decisions[0].confirmerAccountId).toEqual(seeded.confirmer.getPrincipal());
});

it("shows the caller its own decision and simple relationship label", async () => {
  const { actor } = await setup();
  const seeded = await seedConfirmationCase(actor, NORWOOD, "own-decision");

  actor.setIdentity(seeded.confirmer);
  ok(await actor.confirmPendingMembership(NORWOOD, seeded.membershipId, { Confirmed: null }));

  // The confirmer is not the membership's own account, so the applicant read is
  // denied for it; its own decision is available through the own-decision read.
  const own = ok(await actor.getMyConfirmationForMembership(NORWOOD, seeded.membershipId));
  expect(own).toHaveLength(1);
  expect(own[0].decision).toEqual({ Confirmed: null });
  expect(own[0].confirmerPersonId).toBe(seeded.confirmerPersonId);
});

// ---------------------------------------------------------------------------
// (8) FOUNDING-STEWARD — a nominee activated by confirmation keeps the
//     nomination and gains no Steward authority.
// ---------------------------------------------------------------------------

it("activates a FoundingSteward nominee by confirmation without granting Steward authority", async () => {
  const { actor } = await setup();

  // A fresh family whose founder accepts founding Stewardship.
  const founder = createIdentity("confirmation-founding-founder");
  actor.setIdentity(founder);
  const created = ok(
    await actor.createFamilyWithFounder(
      "Confirmation Founding",
      founderInput("Fam", "Founder"),
      "confirmation-founding-key",
    ),
  );
  const familyId = created.family.id;
  ok(await actor.acceptFoundingStewardship(familyId));

  // The nominee is a profile in the family with NO membership yet.
  const nominee = createIdentity("confirmation-founding-nominee");
  const nomineePersonId = await createProfile(actor, nominee, familyId, "Founding Nominee");

  // The founder nominates the nominee.
  actor.setIdentity(founder);
  const nominated = ok(
    await actor.nominateFoundingSteward(familyId, nomineePersonId, []),
  );
  expect(nominated.state).toEqual({ NominationPending: null });

  // A trusted relative with an Active membership and a confirmed relationship
  // confirms the nominee's pending membership.
  const relative = createIdentity("confirmation-founding-relative");
  const relativePersonId = await createProfile(actor, relative, familyId, "Founding Relative");
  actor.setIdentity(founder);
  const relativeMembership = ok(
    await actor.createPendingMembershipForFamily(
      familyId,
      relative.getPrincipal(),
      relativePersonId,
    ),
  );
  ok(await actor.activateMembershipForFamily(familyId, relativeMembership.id));
  ok(
    await actor.addRelationshipForFamily(
      familyId,
      relativePersonId,
      nomineePersonId,
      { Sibling: null },
    ),
  );

  // The nominee's membership is created #Pending by the founder, then confirmed.
  const nomineeMembership = ok(
    await actor.createPendingMembershipForFamily(
      familyId,
      nominee.getPrincipal(),
      nomineePersonId,
    ),
  );
  actor.setIdentity(relative);
  ok(
    await actor.confirmPendingMembership(familyId, nomineeMembership.id, { Confirmed: null }),
  );

  // The nominee is now an #Active member.
  actor.setIdentity(founder);
  const memberships = ok(await actor.listFamilyMembersForFamily(familyId));
  const nomineeRecord = memberships.find((m) => m.id === nomineeMembership.id);
  expect(nomineeRecord?.status).toEqual({ Active: null });

  // The nomination is intact and the nominee gained no Steward authority.
  const status = ok(await actor.getFoundingStewardStatusForFamily(familyId));
  expect(status.state).toEqual({ NominationPending: null });
  const stewards = await actor.listStewardsForFamily(familyId);
  expect(
    stewards.some(
      (s) =>
        "Active" in s.roleStatus &&
        s.stewardAccountId.toText() === nominee.getPrincipal().toText(),
    ),
  ).toBe(false);
});

// ---------------------------------------------------------------------------
// (9) TWO-FAMILY ISOLATION — a confirmation in A never satisfies or appears in B.
// ---------------------------------------------------------------------------

it("does not let a Family A member confirm a Norwood membership", async () => {
  const { actor } = await setup();
  const seeded = await seedConfirmationCase(actor, NORWOOD, "family-a-confirm");

  // A Family A member: `createMyselfForFamily` writes an APPROVED claim for the
  // caller in that family, which is the public path to non-default-family
  // membership. It confers no Norwood membership.
  const memberA = createIdentity("confirmation-family-a-member");
  actor.setIdentity(memberA);
  await actor._initialize_access_control();
  ok(await actor.createMyselfForFamily(FAMILY_A, "Family A Member"));

  await expect(
    actor.confirmPendingMembership(NORWOOD, seeded.membershipId, { Confirmed: null }),
  ).resolves.toEqual({ err: { NoActiveMembership: null } });

  // The Norwood membership is untouched.
  expect(await membershipStatus(actor, NORWOOD, seeded.membershipId)).toEqual({ Pending: null });
});

it("does not let a Norwood Steward resolve a Family A membership", async () => {
  const { actor } = await setup();

  // A Family A founder creates a family and a pending membership in it.
  const founderA = createIdentity("confirmation-family-a-founder");
  actor.setIdentity(founderA);
  const createdA = ok(
    await actor.createFamilyWithFounder(
      "Confirmation Family A",
      founderInput("Fam", "A"),
      "confirmation-family-a-key",
    ),
  );
  const familyA = createdA.family.id;
  ok(await actor.acceptFoundingStewardship(familyA));

  const memberA = createIdentity("confirmation-family-a-pending");
  const profileA = await createProfile(actor, memberA, familyA, "Family A Pending");
  actor.setIdentity(founderA);
  const pendingA = ok(
    await actor.createPendingMembershipForFamily(familyA, memberA.getPrincipal(), profileA),
  );

  // The Norwood Steward is not a Steward of Family A, so resolution is denied.
  actor.setIdentity(adminIdentity);
  await expect(
    actor.resolveMembershipConfirmation(familyA, pendingA.id, { Approve: null }),
  ).resolves.toEqual({ err: { NotSteward: null } });

  // The Family A membership is untouched.
  actor.setIdentity(founderA);
  const membershipsA = ok(await actor.listFamilyMembersForFamily(familyA));
  expect(membershipsA.find((m) => m.id === pendingA.id)?.status).toEqual({ Pending: null });
});

it("does not surface a Norwood confirmation under another family", async () => {
  const { actor } = await setup();
  const seeded = await seedConfirmationCase(actor, NORWOOD, "cross-family-read");

  actor.setIdentity(seeded.confirmer);
  ok(await actor.confirmPendingMembership(NORWOOD, seeded.membershipId, { Confirmed: null }));

  // The Norwood Steward reads the same membership id under Family A: the
  // Steward gate is evaluated against the requested family first, so the
  // Norwood Steward is not authorized there and nothing leaks.
  actor.setIdentity(adminIdentity);
  await expect(
    actor.getMembershipConfirmationStateForSteward(FAMILY_A, seeded.membershipId),
  ).resolves.toEqual({ err: { NotAuthorized: null } });

  // The Norwood confirmation is still readable under Norwood.
  const [state, decisions] = await readStewardState(
    actor,
    adminIdentity,
    NORWOOD,
    seeded.membershipId,
  );
  expect(state).toEqual({ ApprovedByRelative: null });
  expect(decisions).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// (10) NO SENSITIVE CONTEXT — the confirmation surface exposes only simple
//      relationship labels, never Biological/Adoptive/Foster/Step/Guardian.
// ---------------------------------------------------------------------------

it("never surfaces sensitive relationship context on the confirmation surface", async () => {
  const { actor } = await setup();
  const seeded = await seedConfirmationCase(actor, NORWOOD, "sensitive-context");

  actor.setIdentity(seeded.confirmer);
  const record = ok(
    await actor.confirmPendingMembership(NORWOOD, seeded.membershipId, { Confirmed: null }),
  );
  const [state, decisions, resolution] = await readStewardState(
    actor,
    adminIdentity,
    NORWOOD,
    seeded.membershipId,
  );

  const serialized = describe({ record, state, decisions, resolution });
  for (const sensitive of ["Biological", "Adoptive", "Foster", "Step", "Guardian"]) {
    expect(serialized).not.toContain(sensitive);
  }
  // The record carries only the simple relationship id, not a label.
  expect(record).not.toHaveProperty("relationshipType");
  expect(record).not.toHaveProperty("relationshipLabel");
});
