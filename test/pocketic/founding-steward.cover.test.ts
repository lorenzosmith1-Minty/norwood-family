import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type {
  FoundingStewardStatus,
  StewardRecord,
  _SERVICE,
} from "../../src/frontend/src/declarations/backend.did";
import { BACKEND_WASM } from "./lane-helpers";

// ---------------------------------------------------------------------------
// Onboarding Phase 1B-2 — founding-Steward decision (real-canister cover).
//
// The accepted behavior is a family-scoped onboarding governance state machine
// layered on top of the existing StewardRecord authority:
//
//   - A family creator accepts founding Stewardship for their OWN family,
//     creating exactly one active StewardRecord (founding = true) and moving
//     the state to #FounderAccepted. Acceptance is idempotent.
//   - The founder may nominate a PersonProfile belonging to their own family.
//     While the nomination is #Pending the founder holds a temporary founding
//     StewardRecord and retains full authority; the nominee is not yet Steward.
//   - An authenticated nominee whose account owns the nominated profile and
//     holds an #Active FamilyMembership in that family may accept, becoming an
//     active Steward (founding = false) while the founder remains a Steward.
//   - The founder may cancel and the nominee may decline; either way the founder
//     remains Steward and a later nomination can be created.
//   - Authority never crosses families: a founder of Family A cannot accept or
//     nominate for Family B, and a Family A nomination never touches Family B
//     Steward records.
//   - At no point in the flow does a family have zero active Stewards.
//
// The frontend suite mocks the actor and has no principals at all, so none of
// this is visible there. This file installs the app's own compiled wasm and
// drives the real public API.
//
// Coverage limits this file cannot close (recorded in the episode):
//
//   - The `#NomineeNotActiveMember` branch for an UNCLAIMED nominee (a profile
//     with no owning account) is not exercised: every nominee here is created
//     through `createMyselfForFamily`, which always claims the profile. The
//     unclaimed-nominee + email path is a UI/email-delivery concern that is out
//     of scope for this build.
//   - The migration across a real upgrade lives in the sibling upgrade tests.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

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
  canisterId: ReturnType<typeof createIdentity>["getPrincipal"];
}

// Installing a canister replays the whole migration chain and is the lane's most
// expensive operation, so this file shares ONE canister across its tests. Every
// test uses its own deterministic identities and its own freshly created family,
// and every read is family-scoped, so the tests do not interfere. The one
// exception is the Norwood test, which bootstraps the default-family Steward;
// that only adds a Norwood record and never touches another family's roster.
let shared: Seeded | undefined;

/** The shared canister, installed once on first use. */
async function setup(): Promise<Seeded> {
  if (shared === undefined) {
    const setupResult = await pic!.setupCanister<_SERVICE>({
      idlFactory,
      wasm: BACKEND_WASM,
    });
    shared = { actor: setupResult.actor, canisterId: setupResult.canisterId };
  }
  return shared;
}

/** Unwraps a `Result` read, failing the test on an unexpected `#err`. */
function ok<T>(result: { ok: T } | { err: unknown }): T {
  if (!("ok" in result)) {
    throw new Error(`expected #ok, got ${JSON.stringify(result)}`);
  }
  return result.ok;
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

/** Creates a family as `founder` and returns the created family id. */
async function createFamily(
  actor: _SERVICE,
  founder: ReturnType<typeof createIdentity>,
  displayName: string,
  key: string,
): Promise<string> {
  actor.setIdentity(founder);
  const created = ok(
    await actor.createFamilyWithFounder(displayName, founderInput("Fam", "Founder"), key),
  );
  return created.family.id;
}

/**
 * Makes `member` an #Active member of `familyId` with a claimed profile they
 * own, using the founder's Steward authority for the membership approval path.
 * The founder must already be an active Steward of `familyId`. Returns the
 * member's personId in that family.
 */
async function addActiveMember(
  actor: _SERVICE,
  founder: ReturnType<typeof createIdentity>,
  familyId: string,
  member: ReturnType<typeof createIdentity>,
  name: string,
): Promise<string> {
  actor.setIdentity(member);
  const profile = ok(await actor.createMyselfForFamily(familyId, name));

  actor.setIdentity(founder);
  const pending = ok(
    await actor.createPendingMembershipForFamily(familyId, member.getPrincipal(), profile.personId),
  );
  ok(await actor.activateMembershipForFamily(familyId, pending.id));
  return profile.personId;
}

/** The active StewardRecord for `account` in `familyId`, or undefined. */
function activeSteward(
  stewards: StewardRecord[],
  familyId: string,
  account: ReturnType<typeof createIdentity>["getPrincipal"],
): StewardRecord | undefined {
  return stewards.find(
    (s) =>
      s.familyId === familyId &&
      s.stewardAccountId.toText() === account.toText() &&
      "Active" in s.roleStatus,
  );
}

// ---------------------------------------------------------------------------
// (1) ACCEPT — the founder accepts founding Stewardship for their own family.
// ---------------------------------------------------------------------------

it("lets the founder accept founding Stewardship, creating exactly one active StewardRecord", async () => {
  const { actor } = await setup();
  const founder = createIdentity("founding-accept-seed");
  const familyId = await createFamily(actor, founder, "Accept Family", "accept-key");

  actor.setIdentity(founder);
  const status = ok(await actor.acceptFoundingStewardship(familyId));

  expect(status.familyId).toBe(familyId);
  expect(status.state).toEqual({ FounderAccepted: null });
  expect(status.activeNomination).toEqual([]);

  // Exactly one active StewardRecord exists for the family, and it is the
  // founder's, marked as a founding record.
  const stewards = await actor.listStewardsForFamily(familyId);
  const active = stewards.filter((s) => "Active" in s.roleStatus);
  expect(active).toHaveLength(1);
  expect(active[0].stewardAccountId).toEqual(founder.getPrincipal());
  expect(active[0].familyId).toBe(familyId);
  expect(active[0].founding).toBe(true);
});

it("is idempotent: a repeat accept returns the current state and creates no duplicate StewardRecord", async () => {
  const { actor } = await setup();
  const founder = createIdentity("founding-idempotent-seed");
  const familyId = await createFamily(actor, founder, "Idempotent Family", "idem-key");

  actor.setIdentity(founder);
  const first = ok(await actor.acceptFoundingStewardship(familyId));
  const second = ok(await actor.acceptFoundingStewardship(familyId));

  expect(second.state).toEqual({ FounderAccepted: null });
  expect(second.familyId).toBe(first.familyId);

  const stewards = await actor.listStewardsForFamily(familyId);
  const active = stewards.filter(
    (s) =>
      "Active" in s.roleStatus &&
      s.stewardAccountId.toText() === founder.getPrincipal().toText(),
  );
  expect(active).toHaveLength(1);
});

it("rejects a non-founder accepting Stewardship for a family they did not create", async () => {
  const { actor } = await setup();
  const founder = createIdentity("founding-notfounder-owner-seed");
  const outsider = createIdentity("founding-notfounder-outsider-seed");
  const familyId = await createFamily(actor, founder, "Not Founder Family", "nf-key");

  actor.setIdentity(outsider);
  const result = await actor.acceptFoundingStewardship(familyId);
  expect(result).toEqual({ err: { NotFounder: null } });

  // The founder accepts so the roster is readable, then proves the outsider
  // never acquired a StewardRecord.
  actor.setIdentity(founder);
  ok(await actor.acceptFoundingStewardship(familyId));
  const stewards = await actor.listStewardsForFamily(familyId);
  expect(
    stewards.some((s) => s.stewardAccountId.toText() === outsider.getPrincipal().toText()),
  ).toBe(false);
});

it("rejects an anonymous caller from accepting Stewardship", async () => {
  const { actor, canisterId } = await setup();
  const founder = createIdentity("founding-anon-owner-seed");
  const familyId = await createFamily(actor, founder, "Anon Family", "anon-key");

  const anonymous = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  const result = await anonymous.acceptFoundingStewardship(familyId);
  expect(result).toEqual({ err: { NotSignedIn: null } });
});

// ---------------------------------------------------------------------------
// (2) CROSS-FAMILY — authority never crosses families.
// ---------------------------------------------------------------------------

it("does not let Founder A accept Stewardship for Family B", async () => {
  const { actor } = await setup();
  const founderA = createIdentity("founding-cross-a-seed");
  const founderB = createIdentity("founding-cross-b-seed");

  const familyA = await createFamily(actor, founderA, "Cross Family A", "cross-a-key");
  const familyB = await createFamily(actor, founderB, "Cross Family B", "cross-b-key");

  // Founder A accepts for their own family first, so Family A has a known state.
  actor.setIdentity(founderA);
  ok(await actor.acceptFoundingStewardship(familyA));

  // The cross-family accept is rejected.
  const result = await actor.acceptFoundingStewardship(familyB);
  expect(result).toEqual({ err: { NotFounder: null } });

  // Family B's own founder accepts so the roster is readable; Founder A is not
  // in it.
  actor.setIdentity(founderB);
  ok(await actor.acceptFoundingStewardship(familyB));
  const stewardsB = await actor.listStewardsForFamily(familyB);
  expect(
    stewardsB.some((s) => s.stewardAccountId.toText() === founderA.getPrincipal().toText()),
  ).toBe(false);

  // Family A is unaffected by the failed cross-family attempt.
  actor.setIdentity(founderA);
  const statusA = ok(await actor.getFoundingStewardStatusForFamily(familyA));
  expect(statusA.state).toEqual({ FounderAccepted: null });
  expect(statusA.activeNomination).toEqual([]);
});

it("lets the same account be Steward in Family A and Family B independently", async () => {
  const { actor } = await setup();
  const account = createIdentity("founding-multi-steward-seed");

  const familyA = await createFamily(actor, account, "Multi Family A", "multi-a-key");
  const familyB = await createFamily(actor, account, "Multi Family B", "multi-b-key");

  actor.setIdentity(account);
  ok(await actor.acceptFoundingStewardship(familyA));
  ok(await actor.acceptFoundingStewardship(familyB));

  const stewardsA = await actor.listStewardsForFamily(familyA);
  const stewardsB = await actor.listStewardsForFamily(familyB);
  expect(activeSteward(stewardsA, familyA, account.getPrincipal())).toBeDefined();
  expect(activeSteward(stewardsB, familyB, account.getPrincipal())).toBeDefined();
  // Each record is stamped with its own family and never the other.
  expect(stewardsA.every((s) => s.familyId === familyA)).toBe(true);
  expect(stewardsB.every((s) => s.familyId === familyB)).toBe(true);
});

// ---------------------------------------------------------------------------
// (3) NOMINATE — the founder nominates a member of their own family.
// ---------------------------------------------------------------------------

it("lets the founder nominate a member of their own family and retains temporary Steward authority", async () => {
  const { actor } = await setup();
  const founder = createIdentity("founding-nominate-seed");
  const member = createIdentity("founding-nominate-member-seed");
  const familyId = await createFamily(actor, founder, "Nominate Family", "nominate-key");

  actor.setIdentity(founder);
  ok(await actor.acceptFoundingStewardship(familyId));
  const memberPersonId = await addActiveMember(actor, founder, familyId, member, "Nominee One");

  actor.setIdentity(founder);
  const status = ok(await actor.nominateFoundingSteward(familyId, memberPersonId, []));

  expect(status.state).toEqual({ NominationPending: null });
  expect(status.activeNomination).toHaveLength(1);
  const nomination = status.activeNomination[0];
  expect(nomination.familyId).toBe(familyId);
  expect(nomination.nomineePersonId).toBe(memberPersonId);
  expect(nomination.nomineeAccountId).toEqual([member.getPrincipal()]);
  expect(nomination.status).toEqual({ Pending: null });

  // The founder holds a temporary founding StewardRecord; the nominee is not
  // yet a Steward.
  const stewards = await actor.listStewardsForFamily(familyId);
  const founderRecord = activeSteward(stewards, familyId, founder.getPrincipal());
  expect(founderRecord).toBeDefined();
  expect(founderRecord?.founding).toBe(true);
  expect(activeSteward(stewards, familyId, member.getPrincipal())).toBeUndefined();
});

it("rejects nominating a profile that belongs to another family", async () => {
  const { actor } = await setup();
  const founderA = createIdentity("founding-nominee-cross-a-seed");
  const founderB = createIdentity("founding-nominee-cross-b-seed");
  const memberB = createIdentity("founding-nominee-cross-member-b-seed");

  const familyA = await createFamily(actor, founderA, "Nominee Cross A", "nc-a-key");
  const familyB = await createFamily(actor, founderB, "Nominee Cross B", "nc-b-key");

  actor.setIdentity(founderB);
  ok(await actor.acceptFoundingStewardship(familyB));
  const memberBPersonId = await addActiveMember(actor, founderB, familyB, memberB, "Family B Member");

  // Founder A accepts for Family A, then tries to nominate a Family B profile.
  actor.setIdentity(founderA);
  ok(await actor.acceptFoundingStewardship(familyA));
  const result = await actor.nominateFoundingSteward(familyA, memberBPersonId, []);
  expect(result).toEqual({ err: { NomineeNotInFamily: null } });

  // Family A is left with no pending nomination and no StewardRecord for the
  // Family B member.
  const status = ok(await actor.getFoundingStewardStatusForFamily(familyA));
  expect(status.state).toEqual({ FounderAccepted: null });
  expect(status.activeNomination).toEqual([]);
  const stewardsA = await actor.listStewardsForFamily(familyA);
  expect(activeSteward(stewardsA, familyA, memberB.getPrincipal())).toBeUndefined();
});

it("rejects a second pending nomination while one is already pending", async () => {
  const { actor } = await setup();
  const founder = createIdentity("founding-double-nominate-seed");
  const memberOne = createIdentity("founding-double-member-one-seed");
  const memberTwo = createIdentity("founding-double-member-two-seed");
  const familyId = await createFamily(actor, founder, "Double Nominate Family", "dn-key");

  actor.setIdentity(founder);
  ok(await actor.acceptFoundingStewardship(familyId));
  const personOne = await addActiveMember(actor, founder, familyId, memberOne, "Nominee One");
  const personTwo = await addActiveMember(actor, founder, familyId, memberTwo, "Nominee Two");

  actor.setIdentity(founder);
  ok(await actor.nominateFoundingSteward(familyId, personOne, []));
  const second = await actor.nominateFoundingSteward(familyId, personTwo, []);
  expect(second).toEqual({ err: { InvalidTransition: null } });
});

it("rejects a non-founder nominating for the family", async () => {
  const { actor } = await setup();
  const founder = createIdentity("founding-nominate-notfounder-owner-seed");
  const member = createIdentity("founding-nominate-notfounder-member-seed");
  const familyId = await createFamily(actor, founder, "Nominate Not Founder", "nnf-key");

  actor.setIdentity(founder);
  ok(await actor.acceptFoundingStewardship(familyId));
  const memberPersonId = await addActiveMember(actor, founder, familyId, member, "Nominee");

  actor.setIdentity(member);
  const result = await actor.nominateFoundingSteward(familyId, memberPersonId, []);
  expect(result).toEqual({ err: { NotFounder: null } });
});

// ---------------------------------------------------------------------------
// (4) NOMINEE ACCEPT — the nominee becomes Steward; the founder stays Steward.
// ---------------------------------------------------------------------------

it("lets an Active nominated member accept, making both the nominee and the founder active Stewards", async () => {
  const { actor } = await setup();
  const founder = createIdentity("founding-nominee-accept-seed");
  const member = createIdentity("founding-nominee-accept-member-seed");
  const familyId = await createFamily(actor, founder, "Nominee Accept Family", "na-key");

  actor.setIdentity(founder);
  ok(await actor.acceptFoundingStewardship(familyId));
  const memberPersonId = await addActiveMember(actor, founder, familyId, member, "Accepting Nominee");

  actor.setIdentity(founder);
  const nominated = ok(await actor.nominateFoundingSteward(familyId, memberPersonId, []));
  const nominationId = nominated.activeNomination[0].id;

  actor.setIdentity(member);
  const accepted = ok(await actor.acceptFoundingStewardNomination(familyId, nominationId));
  expect(accepted.state).toEqual({ Transferred: null });

  // Both the nominee and the founder are active Stewards; the nominee's record
  // is not a founding record, and the founder's is untouched.
  const stewards = await actor.listStewardsForFamily(familyId);
  const nomineeRecord = activeSteward(stewards, familyId, member.getPrincipal());
  const founderRecord = activeSteward(stewards, familyId, founder.getPrincipal());
  expect(nomineeRecord).toBeDefined();
  expect(nomineeRecord?.founding).toBe(false);
  expect(founderRecord).toBeDefined();
  expect(founderRecord?.founding).toBe(true);
});

it("rejects a nominee accepting a nomination that belongs to another family", async () => {
  const { actor } = await setup();
  const founderA = createIdentity("founding-accept-cross-a-seed");
  const founderB = createIdentity("founding-accept-cross-b-seed");
  const memberA = createIdentity("founding-accept-cross-member-a-seed");
  const memberB = createIdentity("founding-accept-cross-member-b-seed");

  const familyA = await createFamily(actor, founderA, "Accept Cross A", "ac-a-key");
  const familyB = await createFamily(actor, founderB, "Accept Cross B", "ac-b-key");

  actor.setIdentity(founderA);
  ok(await actor.acceptFoundingStewardship(familyA));
  const personA = await addActiveMember(actor, founderA, familyA, memberA, "Member A");

  actor.setIdentity(founderB);
  ok(await actor.acceptFoundingStewardship(familyB));
  await addActiveMember(actor, founderB, familyB, memberB, "Member B");

  actor.setIdentity(founderA);
  const nominated = ok(await actor.nominateFoundingSteward(familyA, personA, []));
  const nominationId = nominated.activeNomination[0].id;

  // Member B tries to accept Family A's nomination id under Family B.
  actor.setIdentity(memberB);
  const result = await actor.acceptFoundingStewardNomination(familyB, nominationId);
  expect(result).toEqual({ err: { NominationNotFound: null } });

  // Family B has no StewardRecord for Member B from the failed attempt.
  actor.setIdentity(founderB);
  const stewardsB = await actor.listStewardsForFamily(familyB);
  expect(activeSteward(stewardsB, familyB, memberB.getPrincipal())).toBeUndefined();
});

it("rejects a caller who is not the nominated account from accepting", async () => {
  const { actor } = await setup();
  const founder = createIdentity("founding-wrong-acceptor-owner-seed");
  const member = createIdentity("founding-wrong-acceptor-member-seed");
  const other = createIdentity("founding-wrong-acceptor-other-seed");
  const familyId = await createFamily(actor, founder, "Wrong Acceptor Family", "wa-key");

  actor.setIdentity(founder);
  ok(await actor.acceptFoundingStewardship(familyId));
  const memberPersonId = await addActiveMember(actor, founder, familyId, member, "Nominee");

  actor.setIdentity(founder);
  const nominated = ok(await actor.nominateFoundingSteward(familyId, memberPersonId, []));
  const nominationId = nominated.activeNomination[0].id;

  actor.setIdentity(other);
  const result = await actor.acceptFoundingStewardNomination(familyId, nominationId);
  expect(result).toEqual({ err: { NotAuthorized: null } });
});

// ---------------------------------------------------------------------------
// (5) CANCEL / DECLINE — the founder remains Steward and may nominate again.
// ---------------------------------------------------------------------------

it("lets the founder cancel a pending nomination, leaving the founder as Steward", async () => {
  const { actor } = await setup();
  const founder = createIdentity("founding-cancel-seed");
  const member = createIdentity("founding-cancel-member-seed");
  const familyId = await createFamily(actor, founder, "Cancel Family", "cancel-key");

  actor.setIdentity(founder);
  ok(await actor.acceptFoundingStewardship(familyId));
  const memberPersonId = await addActiveMember(actor, founder, familyId, member, "Cancel Nominee");

  actor.setIdentity(founder);
  const nominated = ok(await actor.nominateFoundingSteward(familyId, memberPersonId, []));
  const nominationId = nominated.activeNomination[0].id;

  const cancelled = ok(await actor.cancelFoundingStewardNomination(familyId, nominationId));
  // Cancelling returns the onboarding conversation to #Undecided: the founder
  // did not explicitly accept permanent Stewardship, so they may choose again.
  expect(cancelled.state).toEqual({ Undecided: null });
  expect(cancelled.activeNomination).toEqual([]);

  // The founder's temporary founding StewardRecord is left intact; the nominee
  // never became one.
  const stewards = await actor.listStewardsForFamily(familyId);
  const founderRecord = activeSteward(stewards, familyId, founder.getPrincipal());
  expect(founderRecord).toBeDefined();
  expect(founderRecord?.founding).toBe(true);
  expect(activeSteward(stewards, familyId, member.getPrincipal())).toBeUndefined();

  // The read agrees with the cancel result: #Undecided with no active
  // nomination, and the founder still an active Steward.
  const status = ok(await actor.getFoundingStewardStatusForFamily(familyId));
  expect(status.state).toEqual({ Undecided: null });
  expect(status.activeNomination).toEqual([]);

  // A new nomination can be created afterwards.
  const reNominated = ok(await actor.nominateFoundingSteward(familyId, memberPersonId, []));
  expect(reNominated.state).toEqual({ NominationPending: null });
  expect(reNominated.activeNomination).toHaveLength(1);
});

it("lets the nominee decline a pending nomination, leaving the founder as Steward", async () => {
  const { actor } = await setup();
  const founder = createIdentity("founding-decline-seed");
  const member = createIdentity("founding-decline-member-seed");
  const familyId = await createFamily(actor, founder, "Decline Family", "decline-key");

  actor.setIdentity(founder);
  ok(await actor.acceptFoundingStewardship(familyId));
  const memberPersonId = await addActiveMember(actor, founder, familyId, member, "Decline Nominee");

  actor.setIdentity(founder);
  const nominated = ok(await actor.nominateFoundingSteward(familyId, memberPersonId, []));
  const nominationId = nominated.activeNomination[0].id;

  actor.setIdentity(member);
  const declined = ok(await actor.declineFoundingStewardNomination(familyId, nominationId));
  // Declining returns the onboarding conversation to #Undecided: the founder
  // did not explicitly accept permanent Stewardship, so they may choose again.
  expect(declined.state).toEqual({ Undecided: null });
  expect(declined.activeNomination).toEqual([]);

  // The founder's temporary founding StewardRecord is left intact; the nominee
  // never became one.
  actor.setIdentity(founder);
  const stewards = await actor.listStewardsForFamily(familyId);
  const founderRecord = activeSteward(stewards, familyId, founder.getPrincipal());
  expect(founderRecord).toBeDefined();
  expect(founderRecord?.founding).toBe(true);
  expect(activeSteward(stewards, familyId, member.getPrincipal())).toBeUndefined();

  // The read agrees with the decline result.
  const status = ok(await actor.getFoundingStewardStatusForFamily(familyId));
  expect(status.state).toEqual({ Undecided: null });
  expect(status.activeNomination).toEqual([]);

  // The founder may nominate again after the decline.
  const reNominated = ok(await actor.nominateFoundingSteward(familyId, memberPersonId, []));
  expect(reNominated.state).toEqual({ NominationPending: null });
});

it("rejects a non-founder cancelling a pending nomination", async () => {
  const { actor } = await setup();
  const founder = createIdentity("founding-cancel-notfounder-owner-seed");
  const member = createIdentity("founding-cancel-notfounder-member-seed");
  const familyId = await createFamily(actor, founder, "Cancel Not Founder", "cnf-key");

  actor.setIdentity(founder);
  ok(await actor.acceptFoundingStewardship(familyId));
  const memberPersonId = await addActiveMember(actor, founder, familyId, member, "Nominee");

  actor.setIdentity(founder);
  const nominated = ok(await actor.nominateFoundingSteward(familyId, memberPersonId, []));
  const nominationId = nominated.activeNomination[0].id;

  actor.setIdentity(member);
  const result = await actor.cancelFoundingStewardNomination(familyId, nominationId);
  expect(result).toEqual({ err: { NotFounder: null } });
});

// ---------------------------------------------------------------------------
// (5b) ACCEPT WHILE PENDING — the founder must resolve the nomination first.
// ---------------------------------------------------------------------------

it("rejects acceptFoundingStewardship while a nomination is pending with #InvalidTransition", async () => {
  const { actor } = await setup();
  const founder = createIdentity("founding-accept-pending-seed");
  const member = createIdentity("founding-accept-pending-member-seed");
  const familyId = await createFamily(actor, founder, "Accept Pending Family", "ap-key");

  actor.setIdentity(founder);
  ok(await actor.acceptFoundingStewardship(familyId));
  const memberPersonId = await addActiveMember(actor, founder, familyId, member, "Pending Nominee");

  actor.setIdentity(founder);
  ok(await actor.nominateFoundingSteward(familyId, memberPersonId, []));

  // The founder already holds a temporary founding StewardRecord, so the
  // idempotent-active-steward branch must NOT swallow this call: the pending
  // nomination has to be resolved first.
  const result = await actor.acceptFoundingStewardship(familyId);
  expect(result).toEqual({ err: { InvalidTransition: null } });

  // The rejection changed nothing: the nomination is still pending and the
  // founder still holds exactly one active founding StewardRecord.
  const status = ok(await actor.getFoundingStewardStatusForFamily(familyId));
  expect(status.state).toEqual({ NominationPending: null });
  expect(status.activeNomination).toHaveLength(1);

  const stewards = await actor.listStewardsForFamily(familyId);
  const founderRecords = stewards.filter(
    (s) =>
      "Active" in s.roleStatus &&
      s.stewardAccountId.toText() === founder.getPrincipal().toText(),
  );
  expect(founderRecords).toHaveLength(1);
  expect(founderRecords[0].founding).toBe(true);
});

it("allows acceptFoundingStewardship again after the pending nomination is cancelled", async () => {
  const { actor } = await setup();
  const founder = createIdentity("founding-accept-after-cancel-seed");
  const member = createIdentity("founding-accept-after-cancel-member-seed");
  const familyId = await createFamily(actor, founder, "Accept After Cancel", "aac-key");

  actor.setIdentity(founder);
  ok(await actor.acceptFoundingStewardship(familyId));
  const memberPersonId = await addActiveMember(actor, founder, familyId, member, "Nominee");

  actor.setIdentity(founder);
  const nominated = ok(await actor.nominateFoundingSteward(familyId, memberPersonId, []));
  const nominationId = nominated.activeNomination[0].id;
  ok(await actor.cancelFoundingStewardNomination(familyId, nominationId));

  // With the nomination resolved the founder may accept again. The founder
  // already holds the active StewardRecord, so this is the idempotent replay:
  // it returns the current status (#Undecided, since the cancel reset it) and
  // creates no duplicate StewardRecord.
  const accepted = ok(await actor.acceptFoundingStewardship(familyId));
  expect(accepted.state).toEqual({ Undecided: null });
  expect(accepted.activeNomination).toEqual([]);

  const stewards = await actor.listStewardsForFamily(familyId);
  const founderRecords = stewards.filter(
    (s) =>
      "Active" in s.roleStatus &&
      s.stewardAccountId.toText() === founder.getPrincipal().toText(),
  );
  expect(founderRecords).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// (5c) READ CONSISTENCY — #NominationPending always carries a nomination.
// ---------------------------------------------------------------------------

it("never reports #NominationPending with a null activeNomination across the flow", async () => {
  const { actor } = await setup();
  const founder = createIdentity("founding-read-consistency-seed");
  const member = createIdentity("founding-read-consistency-member-seed");
  const familyId = await createFamily(actor, founder, "Read Consistency Family", "rc-key");

  const assertConsistent = async (label: string) => {
    const status = ok(await actor.getFoundingStewardStatusForFamily(familyId));
    if ("NominationPending" in status.state) {
      expect(
        status.activeNomination,
        `#NominationPending reported with no active nomination ${label}`,
      ).toHaveLength(1);
    }
  };

  actor.setIdentity(founder);
  await assertConsistent("before accept");
  ok(await actor.acceptFoundingStewardship(familyId));
  await assertConsistent("after accept");

  const memberPersonId = await addActiveMember(actor, founder, familyId, member, "Nominee");
  actor.setIdentity(founder);
  const nominated = ok(await actor.nominateFoundingSteward(familyId, memberPersonId, []));
  await assertConsistent("while pending");
  expect(nominated.state).toEqual({ NominationPending: null });
  expect(nominated.activeNomination).toHaveLength(1);

  const nominationId = nominated.activeNomination[0].id;
  ok(await actor.cancelFoundingStewardNomination(familyId, nominationId));
  await assertConsistent("after cancel");

  // Re-nominate and let the nominee decline: the read must stay consistent.
  const reNominated = ok(await actor.nominateFoundingSteward(familyId, memberPersonId, []));
  const reNominationId = reNominated.activeNomination[0].id;
  actor.setIdentity(member);
  ok(await actor.declineFoundingStewardNomination(familyId, reNominationId));
  actor.setIdentity(founder);
  await assertConsistent("after decline");
});

// ---------------------------------------------------------------------------
// (6) NO-ZERO-STEWARD INVARIANT — a family always has an active Steward.
// ---------------------------------------------------------------------------

it("never leaves the family with zero active Stewards across the whole flow", async () => {
  const { actor } = await setup();
  const founder = createIdentity("founding-invariant-seed");
  const member = createIdentity("founding-invariant-member-seed");
  const familyId = await createFamily(actor, founder, "Invariant Family", "invariant-key");

  actor.setIdentity(founder);
  ok(await actor.acceptFoundingStewardship(familyId));
  const memberPersonId = await addActiveMember(actor, founder, familyId, member, "Invariant Nominee");

  const assertHasActiveSteward = async (label: string) => {
    const stewards = await actor.listStewardsForFamily(familyId);
    expect(
      stewards.some((s) => "Active" in s.roleStatus),
      `family had zero active Stewards ${label}`,
    ).toBe(true);
  };

  await assertHasActiveSteward("after accept");

  const nominated = ok(await actor.nominateFoundingSteward(familyId, memberPersonId, []));
  await assertHasActiveSteward("while a nomination is pending");

  const nominationId = nominated.activeNomination[0].id;
  actor.setIdentity(member);
  ok(await actor.acceptFoundingStewardNomination(familyId, nominationId));
  await assertHasActiveSteward("after the nominee accepts");
});

// ---------------------------------------------------------------------------
// (7) NORWOOD — the default family is never initialized into onboarding state.
// ---------------------------------------------------------------------------

it("leaves the default Norwood family and its Steward records unchanged", async () => {
  const { actor } = await setup();
  const founder = createIdentity("founding-norwood-seed");

  // Bootstrap Norwood's Steward so the roster is readable, then capture it.
  const admin = createIdentity("archive-admin-seed");
  actor.setIdentity(admin);
  await actor._initialize_access_control();
  await actor.claimSteward();
  const norwoodStewardsBefore = await actor.listStewardsForFamily(NORWOOD);

  // A new family runs the full onboarding flow.
  const familyId = await createFamily(actor, founder, "Norwood Adjacent", "norwood-adj-key");
  actor.setIdentity(founder);
  ok(await actor.acceptFoundingStewardship(familyId));

  // Norwood's Steward roster is byte-for-byte unchanged, and Norwood is not
  // reported as being in an onboarding state.
  actor.setIdentity(admin);
  expect(await actor.listStewardsForFamily(NORWOOD)).toEqual(norwoodStewardsBefore);
  const norwoodStatus = ok(await actor.getFoundingStewardStatusForFamily(NORWOOD));
  expect(norwoodStatus.state).toEqual({ Undecided: null });
  expect(norwoodStatus.activeNomination).toEqual([]);
});

// ---------------------------------------------------------------------------
// (8) READ AUTHORIZATION — the status read is founder/Steward scoped.
// ---------------------------------------------------------------------------

it("denies an unrelated caller reading the onboarding status", async () => {
  const { actor } = await setup();
  const founder = createIdentity("founding-read-owner-seed");
  const outsider = createIdentity("founding-read-outsider-seed");
  const familyId = await createFamily(actor, founder, "Read Family", "read-key");

  actor.setIdentity(outsider);
  const result = await actor.getFoundingStewardStatusForFamily(familyId);
  expect(result).toEqual({ err: { NotAuthorized: null } });
});

it("reports #FamilyNotFound for an unknown family", async () => {
  const { actor } = await setup();
  const founder = createIdentity("founding-unknown-family-seed");
  actor.setIdentity(founder);

  const result = await actor.getFoundingStewardStatusForFamily("no-such-family");
  expect(result).toEqual({ err: { FamilyNotFound: null } });
});

// ---------------------------------------------------------------------------
// (9) TYPED CONTRACT — the read returns the documented status shape.
// ---------------------------------------------------------------------------

it("returns the documented FoundingStewardStatus shape from the read", async () => {
  const { actor } = await setup();
  const founder = createIdentity("founding-shape-seed");
  const familyId = await createFamily(actor, founder, "Shape Family", "shape-key");

  actor.setIdentity(founder);
  const status: FoundingStewardStatus = ok(
    await actor.getFoundingStewardStatusForFamily(familyId),
  );
  expect(status.familyId).toBe(familyId);
  expect(status.state).toEqual({ Undecided: null });
  expect(status.activeNomination).toEqual([]);
});
