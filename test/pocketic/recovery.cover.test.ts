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
// Phase 4A — Recovery Foundation (real-canister cover).
//
// The accepted behavior this file asserts, driven against the app's own
// compiled wasm through the real public API:
//
//   1. An ordinary Account Recovery request can be created for an existing
//      family-scoped Person/Profile.
//   2. A Steward cannot approve their own recovery.
//   3. Another active Steward can approve a Steward's recovery.
//   4. Sole/last-Steward recovery requires 2 independent approved members to
//      satisfy the quorum.
//   5. The candidate cannot verify their own recovery.
//   6. The same verifier cannot count twice toward quorum.
//   7. A cross-family recovery request is rejected.
//   8. Ownership transfer is atomic: the old account loses ownership and the
//      replacement account gains it.
//   9. No duplicate Person is created.
//  10. No duplicate membership is created.
//  11. A completed recovery cannot be replayed to transfer ownership again.
//  12. Recovery audit history records creation, verification, Steward decision,
//      resolution, and transfer.
//
// The frontend suite mocks the actor and has no principals, so none of this is
// visible there. This file installs the app's own compiled wasm and drives the
// real public API.
//
// The lane shares one PocketIC sidecar across every file, and installing a
// canister replays the whole migration chain — the single most expensive
// operation in the lane. A single file that installs ~26 canisters exhausts the
// shared sidecar's pid ceiling, at which point the replica stops accepting
// connections and every later test fails with `fetch failed`. This file
// therefore keeps its canister installs to one per test, and only the tests the
// Phase 4A acceptance criteria require.
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

/**
 * A fresh canister with the Norwood Steward bootstrapped and an approved
 * contributor. After this: ADMIN is the active Norwood Steward, and CONTRIBUTOR
 * is an approved family member who owns the seeded "clayton" profile.
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

/** Unwraps a `Result` read, failing the test on an unexpected `#err`. */
function ok<T>(result: { ok: T } | { err: unknown }): T {
  if (!("ok" in result)) {
    throw new Error(`expected #ok, got ${JSON.stringify(result)}`);
  }
  return result.ok;
}

/**
 * Registers `identity` as an approved member of `familyId` by creating a
 * profile for them via `createMyselfForFamily`, which writes an `#Approved`
 * profile claim for the caller. Returns the created personId.
 *
 * This is the only public path to approved membership in a non-default family
 * (and a convenient one in Norwood), and it does not confer Steward authority.
 */
async function makeApprovedMember(
  actor: _SERVICE,
  identity: ReturnType<typeof createIdentity>,
  familyId: string,
  name: string,
): Promise<string> {
  actor.setIdentity(identity);
  await actor._initialize_access_control();
  const created = await actor.createMyselfForFamily(familyId, name);
  if (!("ok" in created)) {
    throw new Error(`createMyselfForFamily failed: ${JSON.stringify(created)}`);
  }
  return created.ok.personId;
}

/**
 * Creates a brand-new family with `founder` as its only member. The new family
 * has NO StewardRecord, so a recovery request in it is a `#StewardRecovery`
 * requiring the 2-member quorum. Returns the new family id and the founder's
 * personId.
 */
async function makeStewardlessFamily(
  actor: _SERVICE,
  founder: ReturnType<typeof createIdentity>,
  key: string,
): Promise<{ familyId: string; founderPersonId: string }> {
  actor.setIdentity(founder);
  const created = await actor.createFamilyWithFounder(
    "Quorum Family",
    {
      firstName: "Quinn",
      lastName: "Quorum",
      middleName: [],
      suffix: [],
      preferredName: [],
      birthDate: [],
      birthYear: [],
      birthplace: [],
      currentLocation: [],
    },
    key,
  );
  if (!("ok" in created)) {
    throw new Error(`createFamilyWithFounder failed: ${JSON.stringify(created)}`);
  }
  return {
    familyId: created.ok.family.id,
    founderPersonId: created.ok.founderProfile.personId,
  };
}

/** The number of profiles tracked in a family, read as the Norwood Steward. */
async function profileCount(actor: _SERVICE, familyId: string): Promise<number> {
  actor.setIdentity(adminIdentity);
  return (await actor.listProfilesForFamily(familyId)).length;
}

/** The number of memberships in a family, read as the Norwood Steward. */
async function membershipCount(actor: _SERVICE, familyId: string): Promise<number> {
  actor.setIdentity(adminIdentity);
  return ok(await actor.listFamilyMembersForFamily(familyId)).length;
}

/**
 * The number of memberships in a family, read as `identity`. Used for families
 * where the Norwood Steward is not an approved member (e.g. a stewardless
 * family), so the Steward-gated read would be denied.
 */
async function membershipCountAs(
  actor: _SERVICE,
  familyId: string,
  identity: ReturnType<typeof createIdentity>,
): Promise<number> {
  actor.setIdentity(identity);
  return ok(await actor.listFamilyMembersForFamily(familyId)).length;
}

// ---------------------------------------------------------------------------
// (1) Ordinary Account Recovery request creation.
// ---------------------------------------------------------------------------

it("creates an ordinary Account Recovery request for an existing family-scoped profile", async () => {
  const { actor } = await setup();
  const replacement = createIdentity("recovery-ordinary-replacement-seed");
  await makeApprovedMember(actor, replacement, NORWOOD, "Rita Replacement");

  // CONTRIBUTOR owns "clayton"; the replacement account requests recovery of
  // that existing profile. Under the self-service model the caller IS the
  // replacement account. A usable active Steward (ADMIN) exists, so the request
  // is an ordinary #AccountRecovery.
  actor.setIdentity(replacement);
  const created = ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      "clayton",
      replacement.getPrincipal(),
    ),
  );

  expect(created).toMatchObject({
    familyId: NORWOOD,
    personId: "clayton",
    recoveryType: { AccountRecovery: null },
    status: { Pending: null },
    ownerAccountId: contributorIdentity.getPrincipal(),
    replacementAccountId: replacement.getPrincipal(),
    requestedByAccountId: replacement.getPrincipal(),
  });
  expect(created.id).toEqual(expect.any(BigInt));
  expect(created.createdAt).toEqual(expect.any(BigInt));
  expect(created.transferredAt).toEqual([]);

  // The request is persisted and readable by its requester.
  const read = ok(await actor.getRecoveryRequestForFamily(NORWOOD, created.id));
  expect(read).toHaveLength(1);
  expect(read[0]).toEqual(created);
});

// ---------------------------------------------------------------------------
// (2) A Steward cannot approve their own recovery.
// ---------------------------------------------------------------------------

it("rejects a Steward approving their own recovery", async () => {
  const { actor } = await setup();

  // Promote CONTRIBUTOR to a second active Steward, so a usable Steward other
  // than the candidate exists and the request stays an ordinary
  // #AccountRecovery.
  actor.setIdentity(adminIdentity);
  const promoted = await actor.promoteToStewardForFamily(NORWOOD, "clayton");
  expect("ok" in promoted).toBe(true);

  // ADMIN owns their own profile; the replacement account requests recovery of
  // it. ADMIN is the candidate (current owner); CONTRIBUTOR is a usable Steward.
  const adminPersonId = await makeApprovedMember(
    actor,
    adminIdentity,
    NORWOOD,
    "Ada Admin",
  );
  const replacement = createIdentity("recovery-self-approval-replacement-seed");
  await makeApprovedMember(actor, replacement, NORWOOD, "Rhea Replacement");

  actor.setIdentity(replacement);
  const created = ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      adminPersonId,
      replacement.getPrincipal(),
    ),
  );
  expect(created.recoveryType).toEqual({ AccountRecovery: null });

  // ADMIN is a Steward AND the candidate (current owner): self-approval is
  // refused.
  actor.setIdentity(adminIdentity);
  await expect(
    actor.approveAccountRecoveryForFamily(NORWOOD, created.id),
  ).resolves.toEqual({ err: { SelfApproval: null } });

  // The request is untouched: still Pending, no transfer.
  const still = ok(await actor.getRecoveryRequestForFamily(NORWOOD, created.id));
  expect(still[0].status).toEqual({ Pending: null });
  expect(still[0].transferredAt).toEqual([]);
});

// ---------------------------------------------------------------------------
// (3) Another active Steward can approve a Steward's recovery.
// ---------------------------------------------------------------------------

it("lets another active Steward approve a Steward's recovery", async () => {
  const { actor } = await setup();

  // Promote CONTRIBUTOR (owner of "clayton") to a second active Steward.
  actor.setIdentity(adminIdentity);
  const promoted = await actor.promoteToStewardForFamily(NORWOOD, "clayton");
  expect("ok" in promoted).toBe(true);

  // ADMIN owns a profile of their own; the replacement account requests
  // recovery of it to itself.
  const adminPersonId = await makeApprovedMember(
    actor,
    adminIdentity,
    NORWOOD,
    "Ada Admin",
  );
  const replacement = createIdentity("recovery-steward-replacement-seed");
  await makeApprovedMember(actor, replacement, NORWOOD, "Rex Replacement");

  actor.setIdentity(replacement);
  const created = ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      adminPersonId,
      replacement.getPrincipal(),
    ),
  );

  // CONTRIBUTOR is now a second active Steward and is neither the requester, the
  // owner, nor the replacement, so the approval succeeds.
  actor.setIdentity(contributorIdentity);
  const approved = ok(
    await actor.approveAccountRecoveryForFamily(NORWOOD, created.id),
  );
  expect(approved.status).toEqual({ Approved: null });
  expect(approved.decidedByAccountId).toEqual([contributorIdentity.getPrincipal()]);
  expect(approved.transferredAt).toHaveLength(1);

  // Ownership moved to the replacement account on the SAME profile.
  const profile = await actor.getPersonProfileForFamily(NORWOOD, adminPersonId);
  expect(profile).toHaveLength(1);
  expect(profile[0].claimedByUserId).toEqual([replacement.getPrincipal()]);
});

// ---------------------------------------------------------------------------
// (4) Sole/last-Steward recovery requires 2 independent approved members.
// ---------------------------------------------------------------------------

it("requires 2 independent approved members to satisfy a sole-Steward recovery quorum", async () => {
  const { actor } = await setup();
  const founder = createIdentity("recovery-quorum-founder-seed");
  const { familyId, founderPersonId } = await makeStewardlessFamily(
    actor,
    founder,
    "quorum-family-key",
  );

  // Two independent approved members and a replacement account.
  const verifierOne = createIdentity("recovery-quorum-verifier-one-seed");
  const verifierTwo = createIdentity("recovery-quorum-verifier-two-seed");
  const replacement = createIdentity("recovery-quorum-replacement-seed");
  await makeApprovedMember(actor, verifierOne, familyId, "Vera One");
  await makeApprovedMember(actor, verifierTwo, familyId, "Vic Two");
  await makeApprovedMember(actor, replacement, familyId, "Rhea Replacement");

  // No usable active Steward exists in this family, so the request is a
  // #StewardRecovery requiring the 2-member quorum. The replacement account is
  // the caller.
  actor.setIdentity(replacement);
  const created = ok(
    await actor.requestRecoveryForFamily(
      familyId,
      founderPersonId,
      replacement.getPrincipal(),
    ),
  );
  expect(created.recoveryType).toEqual({ StewardRecovery: null });
  expect(created.status).toEqual({ Pending: null });

  // First confirmation: still collecting the quorum.
  actor.setIdentity(verifierOne);
  const afterFirst = ok(
    await actor.verifyStewardRecoveryForFamily(familyId, created.id, {
      Confirm: null,
    }),
  );
  expect(afterFirst.status).toEqual({ AwaitingVerification: null });

  // Second, independent confirmation satisfies the quorum and resolves the
  // request (the implementation transitions through #ReadyForApproval and then
  // performs the transfer atomically, so the persisted status is #Approved).
  actor.setIdentity(verifierTwo);
  const afterSecond = ok(
    await actor.verifyStewardRecoveryForFamily(familyId, created.id, {
      Confirm: null,
    }),
  );
  expect(afterSecond.status).toEqual({ Approved: null });
  expect(afterSecond.transferredAt).toHaveLength(1);

  // Both verifications are persisted, one per verifier.
  actor.setIdentity(replacement);
  const verifications = ok(
    await actor.listRecoveryVerificationsForFamily(familyId, created.id),
  );
  expect(verifications).toHaveLength(2);
  expect(verifications.map((v) => v.verifierAccountId)).toEqual(
    expect.arrayContaining([
      verifierOne.getPrincipal(),
      verifierTwo.getPrincipal(),
    ]),
  );
});

// ---------------------------------------------------------------------------
// (5) The candidate cannot verify their own recovery.
// ---------------------------------------------------------------------------

it("rejects the candidate verifying their own recovery", async () => {
  const { actor } = await setup();
  // A Stewardless family, so the request is a #StewardRecovery (the quorum
  // path). The candidate is an approved member via `createMyselfForFamily`,
  // which writes an #Approved profile claim and makes them the profile owner —
  // so they pass the approved-member gate and reach the self-verification check.
  const founder = createIdentity("recovery-self-verify-founder-seed");
  const { familyId } = await makeStewardlessFamily(
    actor,
    founder,
    "self-verify-family-key",
  );
  const candidate = createIdentity("recovery-self-verify-candidate-seed");
  const candidatePersonId = await makeApprovedMember(
    actor,
    candidate,
    familyId,
    "Cand Candidate",
  );
  const replacement = createIdentity("recovery-self-verify-replacement-seed");
  await makeApprovedMember(actor, replacement, familyId, "Rhea Replacement");

  actor.setIdentity(replacement);
  const created = ok(
    await actor.requestRecoveryForFamily(
      familyId,
      candidatePersonId,
      replacement.getPrincipal(),
    ),
  );

  // The candidate is the current owner: they cannot verify their own request.
  actor.setIdentity(candidate);
  await expect(
    actor.verifyStewardRecoveryForFamily(familyId, created.id, { Confirm: null }),
  ).resolves.toEqual({ err: { SelfVerification: null } });

  // No verification was recorded and the request is still Pending.
  actor.setIdentity(replacement);
  const verifications = ok(
    await actor.listRecoveryVerificationsForFamily(familyId, created.id),
  );
  expect(verifications).toEqual([]);
  const still = ok(await actor.getRecoveryRequestForFamily(familyId, created.id));
  expect(still[0].status).toEqual({ Pending: null });
});

// ---------------------------------------------------------------------------
// (6) The same verifier cannot count twice toward quorum.
// ---------------------------------------------------------------------------

it("rejects the same verifier counting twice toward quorum", async () => {
  const { actor } = await setup();
  const founder = createIdentity("recovery-double-verify-founder-seed");
  const { familyId, founderPersonId } = await makeStewardlessFamily(
    actor,
    founder,
    "double-verify-family-key",
  );
  const verifier = createIdentity("recovery-double-verify-verifier-seed");
  const replacement = createIdentity("recovery-double-verify-replacement-seed");
  await makeApprovedMember(actor, verifier, familyId, "Vera Once");
  await makeApprovedMember(actor, replacement, familyId, "Rhea Replacement");

  actor.setIdentity(replacement);
  const created = ok(
    await actor.requestRecoveryForFamily(
      familyId,
      founderPersonId,
      replacement.getPrincipal(),
    ),
  );

  // The first confirmation is recorded.
  actor.setIdentity(verifier);
  const first = ok(
    await actor.verifyStewardRecoveryForFamily(familyId, created.id, {
      Confirm: null,
    }),
  );
  expect(first.status).toEqual({ AwaitingVerification: null });

  // The same verifier's second confirmation is refused, so one account can never
  // satisfy the 2-member quorum alone.
  await expect(
    actor.verifyStewardRecoveryForFamily(familyId, created.id, { Confirm: null }),
  ).resolves.toEqual({ err: { AlreadyVerifier: null } });

  // Exactly one verification is persisted and the request has not advanced.
  // Read as the requester, who is authorized to view the request's verifications.
  actor.setIdentity(replacement);
  const verifications = ok(
    await actor.listRecoveryVerificationsForFamily(familyId, created.id),
  );
  expect(verifications).toHaveLength(1);
  const still = ok(await actor.getRecoveryRequestForFamily(familyId, created.id));
  expect(still[0].status).toEqual({ AwaitingVerification: null });
});

// ---------------------------------------------------------------------------
// (7) A cross-family recovery request is rejected.
// ---------------------------------------------------------------------------

it("rejects a cross-family recovery request and cross-family approval", async () => {
  const { actor } = await setup();

  // A second, unrelated family with its own founder and a real open request.
  const otherFounder = createIdentity("recovery-cross-family-founder-seed");
  const { familyId: otherFamilyId, founderPersonId: otherPersonId } =
    await makeStewardlessFamily(actor, otherFounder, "cross-family-key");
  const otherReplacement = createIdentity("recovery-cross-family-replacement-seed");
  await makeApprovedMember(actor, otherReplacement, otherFamilyId, "Rhea Other");

  actor.setIdentity(otherReplacement);
  const otherRequest = ok(
    await actor.requestRecoveryForFamily(
      otherFamilyId,
      otherPersonId,
      otherReplacement.getPrincipal(),
    ),
  );

  // A Norwood member requests recovery of a Norwood person id under the other
  // family. The self-service path accepts the caller as the replacement, but the
  // target must be an existing family-scoped profile: "clayton" does not exist
  // in the other family, so the request is refused with #PersonNotFound. A
  // person id from one family never resolves under another.
  actor.setIdentity(contributorIdentity);
  await expect(
    actor.requestRecoveryForFamily(
      otherFamilyId,
      "clayton",
      contributorIdentity.getPrincipal(),
    ),
  ).resolves.toEqual({ err: { PersonNotFound: null } });

  // The other family has no Steward, so its request is a #StewardRecovery and
  // the ordinary approval path is an invalid transition for it — a Norwood
  // Steward cannot reach into the other family's request at all.
  actor.setIdentity(adminIdentity);
  await expect(
    actor.approveAccountRecoveryForFamily(otherFamilyId, otherRequest.id),
  ).resolves.toEqual({ err: { InvalidTransition: null } });

  // The family-wide request list is Steward-only and family-scoped: the Norwood
  // Steward is not a Steward of the other family, so its list is denied rather
  // than returning the other family's requests.
  await expect(
    actor.listRecoveryRequestsForFamily(otherFamilyId),
  ).resolves.toEqual({ err: { NotAuthorized: null } });

  // A recovery request id from one family never resolves under another family.
  actor.setIdentity(contributorIdentity);
  const created = ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      "clayton",
      contributorIdentity.getPrincipal(),
    ),
  );
  actor.setIdentity(adminIdentity);
  const wrongFamily = ok(
    await actor.getRecoveryRequestForFamily(otherFamilyId, created.id),
  );
  expect(wrongFamily).toEqual([]);
});

// ---------------------------------------------------------------------------
// (8)-(10) Atomic ownership transfer, no duplicate Person, no duplicate
//           membership.
// ---------------------------------------------------------------------------

it("transfers ownership atomically without creating a duplicate Person or membership", async () => {
  const { actor } = await setup();
  const replacement = createIdentity("recovery-transfer-replacement-seed");
  await makeApprovedMember(actor, replacement, NORWOOD, "Rhea Replacement");

  // Snapshot the family's profile and membership counts before the recovery.
  const profilesBefore = await profileCount(actor, NORWOOD);
  const membershipsBefore = await membershipCount(actor, NORWOOD);

  // CONTRIBUTOR owns "clayton"; the replacement account requests recovery of it.
  actor.setIdentity(replacement);
  const created = ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      "clayton",
      replacement.getPrincipal(),
    ),
  );

  // ADMIN (a different Steward) approves, performing the transfer.
  actor.setIdentity(adminIdentity);
  const approved = ok(
    await actor.approveAccountRecoveryForFamily(NORWOOD, created.id),
  );
  expect(approved.status).toEqual({ Approved: null });

  // The existing profile now belongs to the replacement account; the old owner
  // no longer owns it. There is never a state where both own it.
  const profile = await actor.getPersonProfileForFamily(NORWOOD, "clayton");
  expect(profile).toHaveLength(1);
  expect(profile[0].claimedByUserId).toEqual([replacement.getPrincipal()]);
  expect(profile[0].claimedByUserId).not.toEqual([
    contributorIdentity.getPrincipal(),
  ]);
  expect(profile[0].claimStatus).toEqual({ Claimed: null });

  // No duplicate Person and no duplicate membership were created.
  expect(await profileCount(actor, NORWOOD)).toBe(profilesBefore);
  expect(await membershipCount(actor, NORWOOD)).toBe(membershipsBefore);
});

// ---------------------------------------------------------------------------
// (11) A completed recovery cannot be replayed.
// ---------------------------------------------------------------------------

it("cannot replay a completed recovery to transfer ownership again", async () => {
  const { actor } = await setup();
  const replacement = createIdentity("recovery-replay-replacement-seed");
  await makeApprovedMember(actor, replacement, NORWOOD, "Rhea Replacement");

  actor.setIdentity(replacement);
  const created = ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      "clayton",
      replacement.getPrincipal(),
    ),
  );

  actor.setIdentity(adminIdentity);
  const approved = ok(
    await actor.approveAccountRecoveryForFamily(NORWOOD, created.id),
  );
  expect(approved.status).toEqual({ Approved: null });
  const transferredAt = approved.transferredAt;

  // A second approval of the same, already-resolved request is refused.
  await expect(
    actor.approveAccountRecoveryForFamily(NORWOOD, created.id),
  ).resolves.toEqual({ err: { AlreadyResolved: null } });

  // The request is unchanged: same transfer timestamp, still Approved.
  const after = ok(await actor.getRecoveryRequestForFamily(NORWOOD, created.id));
  expect(after[0].status).toEqual({ Approved: null });
  expect(after[0].transferredAt).toEqual(transferredAt);

  // Ownership is still the replacement account's, and the old owner still does
  // not own the profile.
  const profile = await actor.getPersonProfileForFamily(NORWOOD, "clayton");
  expect(profile[0].claimedByUserId).toEqual([replacement.getPrincipal()]);
});

// ---------------------------------------------------------------------------
// (4b) Sole/last-Steward recovery when the ONLY active Steward is the
//      candidate: the request must be a #StewardRecovery (2-member quorum),
//      not an #AccountRecovery that no one can approve.
// ---------------------------------------------------------------------------

it("classifies a sole-Steward-is-the-candidate recovery as a StewardRecovery quorum", async () => {
  const { actor } = await setup();

  // ADMIN is the sole active Norwood Steward. Give ADMIN their own profile and
  // have ADMIN request recovery of it, so the sole active Steward is the
  // candidate (requester + owner). No other Steward can approve, so the request
  // must be a #StewardRecovery resolved by the 2-member quorum.
  const adminPersonId = await makeApprovedMember(
    actor,
    adminIdentity,
    NORWOOD,
    "Ada Admin",
  );
  const verifierTwo = createIdentity("recovery-sole-steward-verifier-two-seed");
  const replacement = createIdentity("recovery-sole-steward-replacement-seed");
  await makeApprovedMember(actor, verifierTwo, NORWOOD, "Vic Two");
  await makeApprovedMember(actor, replacement, NORWOOD, "Rhea Replacement");

  // The founder is the sole active Steward AND the current owner (candidate):
  // the request must be classified #StewardRecovery, not #AccountRecovery. The
  // replacement account is the caller.
  actor.setIdentity(replacement);
  const created = ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      adminPersonId,
      replacement.getPrincipal(),
    ),
  );
  expect(created.recoveryType).toEqual({ StewardRecovery: null });
  expect(created.status).toEqual({ Pending: null });

  // The ordinary Steward-approval path is an invalid transition for it, so the
  // sole Steward cannot self-approve their own recovery.
  actor.setIdentity(adminIdentity);
  await expect(
    actor.approveAccountRecoveryForFamily(NORWOOD, created.id),
  ).resolves.toEqual({ err: { InvalidTransition: null } });

  // The 2-member quorum path is reachable: two independent approved members
  // (CONTRIBUTOR and verifierTwo, neither the candidate) confirm and the
  // recovery resolves with the ownership transfer.
  actor.setIdentity(contributorIdentity);
  const afterFirst = ok(
    await actor.verifyStewardRecoveryForFamily(NORWOOD, created.id, {
      Confirm: null,
    }),
  );
  expect(afterFirst.status).toEqual({ AwaitingVerification: null });

  actor.setIdentity(verifierTwo);
  const afterSecond = ok(
    await actor.verifyStewardRecoveryForFamily(NORWOOD, created.id, {
      Confirm: null,
    }),
  );
  expect(afterSecond.status).toEqual({ Approved: null });
  expect(afterSecond.transferredAt).toHaveLength(1);

  // Ownership moved to the replacement account on the SAME profile.
  const profile = await actor.getPersonProfileForFamily(NORWOOD, adminPersonId);
  expect(profile).toHaveLength(1);
  expect(profile[0].claimedByUserId).toEqual([replacement.getPrincipal()]);
});

// ---------------------------------------------------------------------------
// (12) Recovery audit history.
// ---------------------------------------------------------------------------

it("records creation, Steward decision, and ownership transfer in the audit history", async () => {
  const { actor } = await setup();
  const replacement = createIdentity("recovery-audit-replacement-seed");
  await makeApprovedMember(actor, replacement, NORWOOD, "Rhea Replacement");

  actor.setIdentity(replacement);
  const created = ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      "clayton",
      replacement.getPrincipal(),
    ),
  );

  actor.setIdentity(adminIdentity);
  await actor.approveAccountRecoveryForFamily(NORWOOD, created.id);

  // The audit history is Steward-readable and records the full decision trail.
  const audit = ok(await actor.listRecoveryAuditForFamily(NORWOOD, created.id));
  const actionTypes = audit.map((entry) => Object.keys(entry.actionType)[0]);
  expect(actionTypes).toContain("RequestCreated");
  expect(actionTypes).toContain("StewardDecisionRecorded");
  expect(actionTypes).toContain("ResolutionRecorded");
  expect(actionTypes).toContain("OwnershipTransferred");

  // Every entry is scoped to this family and this request, and carries the
  // affected person.
  for (const entry of audit) {
    expect(entry.familyId).toBe(NORWOOD);
    expect(entry.recoveryId).toBe(created.id);
    expect(entry.affectedPersonIds).toContain("clayton");
    expect(entry.timestamp).toEqual(expect.any(BigInt));
  }
});

it("records verification and resolution in the audit history of a quorum recovery", async () => {
  const { actor } = await setup();
  const founder = createIdentity("recovery-audit-quorum-founder-seed");
  const { familyId, founderPersonId } = await makeStewardlessFamily(
    actor,
    founder,
    "audit-quorum-family-key",
  );
  const verifierOne = createIdentity("recovery-audit-quorum-verifier-one-seed");
  const verifierTwo = createIdentity("recovery-audit-quorum-verifier-two-seed");
  const replacement = createIdentity("recovery-audit-quorum-replacement-seed");
  await makeApprovedMember(actor, verifierOne, familyId, "Vera One");
  await makeApprovedMember(actor, verifierTwo, familyId, "Vic Two");
  await makeApprovedMember(actor, replacement, familyId, "Rhea Replacement");

  actor.setIdentity(replacement);
  const created = ok(
    await actor.requestRecoveryForFamily(
      familyId,
      founderPersonId,
      replacement.getPrincipal(),
    ),
  );

  actor.setIdentity(verifierOne);
  await actor.verifyStewardRecoveryForFamily(familyId, created.id, {
    Confirm: null,
  });
  actor.setIdentity(verifierTwo);
  await actor.verifyStewardRecoveryForFamily(familyId, created.id, {
    Confirm: null,
  });

  // The audit history is Steward-only; the replacement is not a Steward, so the
  // audit read is denied for them. The verification trail is asserted through
  // the request's own verification list, which the requester may read.
  await expect(
    actor.listRecoveryAuditForFamily(familyId, created.id),
  ).resolves.toEqual({ err: { NotAuthorized: null } });

  // Read the verification trail as the requester, who is a party to the request
  // and therefore authorized to view it.
  actor.setIdentity(replacement);
  const verifications = ok(
    await actor.listRecoveryVerificationsForFamily(familyId, created.id),
  );
  expect(verifications).toHaveLength(2);
  expect(verifications.every((v) => v.decision.Confirm !== undefined)).toBe(true);

  const resolved = ok(await actor.getRecoveryRequestForFamily(familyId, created.id));
  expect(resolved[0].status).toEqual({ Approved: null });
  expect(resolved[0].transferredAt).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// Authorization boundary: anonymous callers are rejected on every recovery
// mutation.
// ---------------------------------------------------------------------------

it("rejects an anonymous caller on every recovery mutation", async () => {
  const { actor, canisterId } = await setup();
  const anonymous = pic!.createActor<_SERVICE>(idlFactory, canisterId);

  await expect(
    anonymous.requestRecoveryForFamily(
      NORWOOD,
      "clayton",
      contributorIdentity.getPrincipal(),
    ),
  ).resolves.toEqual({ err: { NotSignedIn: null } });
  await expect(
    anonymous.approveAccountRecoveryForFamily(NORWOOD, 0n),
  ).resolves.toEqual({ err: { NotSignedIn: null } });
  await expect(
    anonymous.verifyStewardRecoveryForFamily(NORWOOD, 0n, { Confirm: null }),
  ).resolves.toEqual({ err: { NotSignedIn: null } });
  await expect(
    anonymous.rejectRecoveryForFamily(NORWOOD, 0n),
  ).resolves.toEqual({ err: { NotSignedIn: null } });
});

// ---------------------------------------------------------------------------
// Idempotency: a duplicate open request for the same person is rejected.
// ---------------------------------------------------------------------------

it("rejects a duplicate open recovery request for the same person", async () => {
  const { actor } = await setup();
  const replacement = createIdentity("recovery-duplicate-replacement-seed");
  await makeApprovedMember(actor, replacement, NORWOOD, "Rhea Replacement");

  actor.setIdentity(replacement);
  const first = ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      "clayton",
      replacement.getPrincipal(),
    ),
  );
  expect(first.status).toEqual({ Pending: null });

  // A second request for the same person while the first is still open is
  // rejected, so near-simultaneous duplicates cannot both proceed.
  await expect(
    actor.requestRecoveryForFamily(
      NORWOOD,
      "clayton",
      replacement.getPrincipal(),
    ),
  ).resolves.toEqual({ err: { AlreadyPending: null } });
});

// ---------------------------------------------------------------------------
// Data safety: the old account record is not deleted by a successful recovery.
// ---------------------------------------------------------------------------

it("does not delete the old account record when recovery succeeds", async () => {
  const { actor } = await setup();
  const replacement = createIdentity("recovery-preserve-replacement-seed");
  await makeApprovedMember(actor, replacement, NORWOOD, "Rhea Replacement");

  actor.setIdentity(replacement);
  const created = ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      "clayton",
      replacement.getPrincipal(),
    ),
  );
  actor.setIdentity(adminIdentity);
  await actor.approveAccountRecoveryForFamily(NORWOOD, created.id);

  // The old owner's approved ProfileClaim record still exists: the recovery
  // moved ownership of the profile, it did not delete the account's history.
  const claims = await actor.listProfileClaims();
  const oldOwnerClaim = claims.find(
    (c) =>
      c.requestingUserId.toText() === contributorIdentity.getPrincipal().toText() &&
      c.personId === "clayton",
  );
  expect(oldOwnerClaim).toBeDefined();
  expect(oldOwnerClaim?.status).toEqual({ Approved: null });
});

// ---------------------------------------------------------------------------
// Atomic transfer when the replacement account ALREADY holds a membership.
//
// The replacement is an approved member who already holds an `#Active`
// membership in the family (linked to a different person). The transfer must
// deactivate the old owner's `#Active` membership for the recovered person
// before activating the replacement's membership, so exactly one `#Active`
// membership owns the Person/Profile and no state ever has both accounts
// owning it. No duplicate membership is created.
// ---------------------------------------------------------------------------

it("deactivates the old owner's membership when the replacement already holds one", async () => {
  const { actor } = await setup();

  // The old owner (CONTRIBUTOR) holds an `#Active` membership for "clayton".
  actor.setIdentity(adminIdentity);
  const ownerPending = ok(
    await actor.createPendingMembershipForFamily(
      NORWOOD,
      contributorIdentity.getPrincipal(),
      "clayton",
    ),
  );
  const ownerActivated = ok(
    await actor.activateMembershipForFamily(NORWOOD, ownerPending.id),
  );
  expect(ownerActivated.status).toEqual({ Active: null });

  // The replacement is an approved member with its own profile and an `#Active`
  // membership linked to that profile.
  const replacement = createIdentity("recovery-existing-membership-replacement-seed");
  const replacementPersonId = await makeApprovedMember(
    actor,
    replacement,
    NORWOOD,
    "Rhea Replacement",
  );
  actor.setIdentity(adminIdentity);
  const pending = ok(
    await actor.createPendingMembershipForFamily(
      NORWOOD,
      replacement.getPrincipal(),
      replacementPersonId,
    ),
  );
  const activated = ok(
    await actor.activateMembershipForFamily(NORWOOD, pending.id),
  );
  expect(activated.status).toEqual({ Active: null });

  const membershipsBefore = await membershipCount(actor, NORWOOD);

  // CONTRIBUTOR owns "clayton"; the replacement account (which already holds an
  // `#Active` membership) requests recovery of it.
  actor.setIdentity(replacement);
  const created = ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      "clayton",
      replacement.getPrincipal(),
    ),
  );

  actor.setIdentity(adminIdentity);
  const approved = ok(
    await actor.approveAccountRecoveryForFamily(NORWOOD, created.id),
  );
  expect(approved.status).toEqual({ Approved: null });

  // The profile now belongs to the replacement account.
  const profile = await actor.getPersonProfileForFamily(NORWOOD, "clayton");
  expect(profile).toHaveLength(1);
  expect(profile[0].claimedByUserId).toEqual([replacement.getPrincipal()]);

  // Exactly one `#Active` membership owns "clayton": the replacement's. The old
  // owner's membership is preserved as `#Left`, never deleted, and no duplicate
  // membership was created.
  const memberships = ok(await actor.listFamilyMembersForFamily(NORWOOD));
  const activeOwners = memberships.filter(
    (m) => m.personId === "clayton" && "Active" in m.status,
  );
  expect(activeOwners).toHaveLength(1);
  expect(activeOwners[0].accountId).toEqual(replacement.getPrincipal());

  const oldOwnerMembership = memberships.find(
    (m) =>
      m.accountId.toText() === contributorIdentity.getPrincipal().toText() &&
      m.personId === "clayton",
  );
  expect(oldOwnerMembership).toBeDefined();
  expect(oldOwnerMembership?.status).toEqual({ Left: null });

  expect(await membershipCount(actor, NORWOOD)).toBe(membershipsBefore);
});

// ===========================================================================
// Phase 4A-H1 — Recovery Foundation Hardening
//
// Two recovery-model gaps are covered here:
//
//   A. Replacement-account eligibility: a signed-in replacement account that
//      holds an `#Active` family membership but has NOT created its own
//      `#Approved` profile claim is eligible to recover an existing profile.
//      Previously the replacement had to be an approved member, which forced a
//      duplicate profile/membership before recovery could succeed.
//
//   B. Steward authority transfer: when the recovered profile belongs to an
//      active Family Steward, a successful recovery retargets the EXISTING
//      StewardRecord to the replacement account atomically with the ownership
//      transfer. The old account loses active Steward authority, the
//      replacement gains it, no duplicate StewardRecord is created, and a
//      completed recovery can never transfer authority twice.
// ===========================================================================

/** The active StewardRecord for `accountId` in `familyId`, if any. */
function activeStewardRecord(
  stewards: { stewardAccountId: { toText(): string }; roleStatus: unknown }[],
  accountId: { toText(): string },
): { stewardAccountId: { toText(): string }; roleStatus: unknown } | undefined {
  return stewards.find(
    (s) =>
      s.stewardAccountId.toText() === accountId.toText() &&
      "Active" in (s.roleStatus as Record<string, unknown>),
  );
}

/**
 * Gives `accountId` an `#Active` membership in `familyId` linked to `personId`,
 * without creating any profile claim for the account. The Steward (ADMIN)
 * creates and activates the membership. This is the "replacement account that
 * can authenticate but has not created a second family profile" case.
 */
async function giveActiveMembership(
  actor: _SERVICE,
  familyId: string,
  accountId: ReturnType<typeof createIdentity>["getPrincipal"],
  personId: string,
): Promise<void> {
  actor.setIdentity(adminIdentity);
  const pending = ok(
    await actor.createPendingMembershipForFamily(familyId, accountId, personId),
  );
  const activated = ok(
    await actor.activateMembershipForFamily(familyId, pending.id),
  );
  expect(activated.status).toEqual({ Active: null });
}

// ---------------------------------------------------------------------------
// (A) Replacement eligibility without a second family profile.
// ---------------------------------------------------------------------------

it("lets a replacement account with only an active membership recover an existing profile", async () => {
  const { actor } = await setup();

  // The replacement can authenticate and holds an `#Active` Norwood membership
  // linked to the existing "clayton" profile, but has NO `#Approved` profile
  // claim of its own. Under the old rule this was refused with
  // #ReplacementNotMember; the broadened eligibility admits it.
  const replacement = createIdentity("recovery-membership-only-replacement-seed");
  await giveActiveMembership(actor, NORWOOD, replacement.getPrincipal(), "clayton");

  const profilesBefore = await profileCount(actor, NORWOOD);
  const membershipsBefore = await membershipCount(actor, NORWOOD);

  // CONTRIBUTOR owns "clayton"; the membership-only replacement account requests
  // recovery of it.
  actor.setIdentity(replacement);
  const created = ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      "clayton",
      replacement.getPrincipal(),
    ),
  );
  expect(created.recoveryType).toEqual({ AccountRecovery: null });
  expect(created.replacementAccountId).toEqual(replacement.getPrincipal());

  // ADMIN (a different Steward) approves, performing the transfer.
  actor.setIdentity(adminIdentity);
  const approved = ok(
    await actor.approveAccountRecoveryForFamily(NORWOOD, created.id),
  );
  expect(approved.status).toEqual({ Approved: null });
  expect(approved.transferredAt).toHaveLength(1);

  // The existing profile now belongs to the replacement account.
  const profile = await actor.getPersonProfileForFamily(NORWOOD, "clayton");
  expect(profile).toHaveLength(1);
  expect(profile[0].claimedByUserId).toEqual([replacement.getPrincipal()]);

  // No duplicate Person and no duplicate membership were created.
  expect(await profileCount(actor, NORWOOD)).toBe(profilesBefore);
  expect(await membershipCount(actor, NORWOOD)).toBe(membershipsBefore);
});

it("lets a brand-new replacement account with no family relationship request recovery but grants no access", async () => {
  const { actor } = await setup();

  // A brand-new authenticated principal with neither an approved claim nor an
  // active membership in Norwood. Under the self-service model this account is
  // the replacement account and may REQUEST recovery of an existing claimed
  // profile — it does not need a pre-existing family membership, profile claim,
  // or second Person/Profile.
  const outsider = createIdentity("recovery-outsider-replacement-seed");
  actor.setIdentity(outsider);
  await actor._initialize_access_control();

  const profilesBefore = await profileCount(actor, NORWOOD);
  const membershipsBefore = await membershipCount(actor, NORWOOD);

  // The outsider requests recovery of "clayton", which CONTRIBUTOR owns. The
  // caller is the replacement account, so replacementAccountId equals the
  // caller.
  actor.setIdentity(outsider);
  const created = ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      "clayton",
      outsider.getPrincipal(),
    ),
  );
  expect(created.replacementAccountId).toEqual(outsider.getPrincipal());
  expect(created.requestedByAccountId).toEqual(outsider.getPrincipal());
  // The current owner is derived from the existing profile, not supplied by the
  // caller.
  expect(created.ownerAccountId).toEqual(contributorIdentity.getPrincipal());
  expect(created.status).toEqual({ Pending: null });
  expect(created.transferredAt).toEqual([]);

  // Creating the request grants no ownership and no membership: the profile is
  // still owned by CONTRIBUTOR and no membership was created for the outsider.
  const profile = await actor.getPersonProfileForFamily(NORWOOD, "clayton");
  expect(profile[0].claimedByUserId).toEqual([contributorIdentity.getPrincipal()]);
  expect(await profileCount(actor, NORWOOD)).toBe(profilesBefore);
  expect(await membershipCount(actor, NORWOOD)).toBe(membershipsBefore);

  // The outsider cannot approve their own request: they are not a Steward.
  // (The count helpers above read as the Norwood Steward, so reset the caller.)
  actor.setIdentity(outsider);
  await expect(
    actor.approveAccountRecoveryForFamily(NORWOOD, created.id),
  ).resolves.toEqual({ err: { NotSteward: null } });

  // The request is still pending and no transfer occurred.
  const still = ok(await actor.getRecoveryRequestForFamily(NORWOOD, created.id));
  expect(still[0].status).toEqual({ Pending: null });
  expect(still[0].transferredAt).toEqual([]);
});

it("rejects a caller nominating an arbitrary third-party replacement account", async () => {
  const { actor } = await setup();

  // A brand-new authenticated account that lost access to its old account.
  const requester = createIdentity("recovery-third-party-requester-seed");
  actor.setIdentity(requester);
  await actor._initialize_access_control();

  // A different, unrelated principal the requester tries to nominate as the
  // replacement. The self-service path must refuse this: the caller is the
  // replacement account, so replacementAccountId must equal the caller.
  const thirdParty = createIdentity("recovery-third-party-nominee-seed");

  await expect(
    actor.requestRecoveryForFamily(
      NORWOOD,
      "clayton",
      thirdParty.getPrincipal(),
    ),
  ).resolves.toEqual({ err: { NotAuthorized: null } });

  // No request was created.
  actor.setIdentity(adminIdentity);
  const requests = ok(await actor.listRecoveryRequestsForFamily(NORWOOD));
  expect(requests).toEqual([]);
});

it("rejects a recovery request for an unclaimed profile", async () => {
  const { actor } = await setup();

  // A brand-new authenticated account requests recovery of a profile that has
  // no owner. Recovery restores control of an EXISTING claimed profile, so an
  // unclaimed profile is not a valid target.
  const requester = createIdentity("recovery-unclaimed-requester-seed");
  actor.setIdentity(requester);
  await actor._initialize_access_control();

  // "julia" is a seeded Norwood person with no claimed profile.
  await expect(
    actor.requestRecoveryForFamily(NORWOOD, "julia", requester.getPrincipal()),
  ).resolves.toEqual({ err: { PersonNotFound: null } });
});

// ---------------------------------------------------------------------------
// (B) Steward authority transfer — another Steward approves a Steward recovery.
// ---------------------------------------------------------------------------

it("transfers Steward authority to the replacement when another Steward approves a Steward recovery", async () => {
  const { actor } = await setup();

  // Promote CONTRIBUTOR (owner of "clayton") to a second active Steward, so a
  // usable Steward other than the candidate exists and the request stays an
  // ordinary #AccountRecovery.
  actor.setIdentity(adminIdentity);
  const promoted = await actor.promoteToStewardForFamily(NORWOOD, "clayton");
  expect("ok" in promoted).toBe(true);

  // ADMIN owns a profile of their own and is an active Steward.
  const adminPersonId = await makeApprovedMember(
    actor,
    adminIdentity,
    NORWOOD,
    "Ada Admin",
  );
  const replacement = createIdentity("recovery-steward-transfer-replacement-seed");
  await makeApprovedMember(actor, replacement, NORWOOD, "Rex Replacement");

  // Snapshot the Steward roster before the recovery.
  actor.setIdentity(adminIdentity);
  const rosterBefore = await actor.listStewardsForFamily(NORWOOD);
  const adminRecordBefore = activeStewardRecord(rosterBefore, adminIdentity.getPrincipal());
  expect(adminRecordBefore).toBeDefined();

  // ADMIN (the current owner) is the candidate; the replacement account requests
  // recovery of ADMIN's profile.
  actor.setIdentity(replacement);
  const created = ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      adminPersonId,
      replacement.getPrincipal(),
    ),
  );
  expect(created.recoveryType).toEqual({ AccountRecovery: null });

  // CONTRIBUTOR (another active Steward) approves, performing the transfer.
  actor.setIdentity(contributorIdentity);
  const approved = ok(
    await actor.approveAccountRecoveryForFamily(NORWOOD, created.id),
  );
  expect(approved.status).toEqual({ Approved: null });
  expect(approved.transferredAt).toHaveLength(1);

  // The replacement now holds the active Steward authority: it can read the
  // roster and sees itself as an active Steward.
  actor.setIdentity(replacement);
  const rosterAfter = await actor.listStewardsForFamily(NORWOOD);
  const replacementRecord = activeStewardRecord(rosterAfter, replacement.getPrincipal());
  expect(replacementRecord).toBeDefined();

  // The old account no longer holds active Steward authority: the roster read
  // is Steward-only and now traps for ADMIN.
  actor.setIdentity(adminIdentity);
  await expect(actor.listStewardsForFamily(NORWOOD)).rejects.toThrow(
    /Only Family Stewards/i,
  );

  // The Steward record was retargeted, not duplicated: the roster length is
  // unchanged and the record preserves its governance fields.
  expect(rosterAfter).toHaveLength(rosterBefore.length);
  expect(replacementRecord?.familyId).toBe(NORWOOD);
  expect(replacementRecord?.assignedBy.toText()).toBe(
    adminRecordBefore?.assignedBy.toText(),
  );
  expect(replacementRecord?.assignedAt).toEqual(adminRecordBefore?.assignedAt);
  expect(replacementRecord?.founding).toBe(adminRecordBefore?.founding);
});

// ---------------------------------------------------------------------------
// (B) Steward authority transfer — sole/last-Steward quorum recovery.
// ---------------------------------------------------------------------------

it("transfers Steward authority to the replacement on a sole-Steward quorum recovery", async () => {
  const { actor } = await setup();

  // ADMIN is the sole active Norwood Steward. Give ADMIN their own profile and
  // have ADMIN request recovery of it, so the sole active Steward is the
  // candidate and the request is a #StewardRecovery resolved by the 2-member
  // quorum.
  const adminPersonId = await makeApprovedMember(
    actor,
    adminIdentity,
    NORWOOD,
    "Ada Admin",
  );
  const verifierTwo = createIdentity("recovery-sole-steward-transfer-verifier-two-seed");
  const replacement = createIdentity("recovery-sole-steward-transfer-replacement-seed");
  await makeApprovedMember(actor, verifierTwo, NORWOOD, "Vic Two");
  await makeApprovedMember(actor, replacement, NORWOOD, "Rhea Replacement");

  actor.setIdentity(adminIdentity);
  const rosterBefore = await actor.listStewardsForFamily(NORWOOD);
  const adminRecordBefore = activeStewardRecord(rosterBefore, adminIdentity.getPrincipal());
  expect(adminRecordBefore).toBeDefined();

  actor.setIdentity(replacement);
  const created = ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      adminPersonId,
      replacement.getPrincipal(),
    ),
  );
  expect(created.recoveryType).toEqual({ StewardRecovery: null });

  // Two independent approved members (neither the candidate) confirm.
  actor.setIdentity(contributorIdentity);
  const afterFirst = ok(
    await actor.verifyStewardRecoveryForFamily(NORWOOD, created.id, {
      Confirm: null,
    }),
  );
  expect(afterFirst.status).toEqual({ AwaitingVerification: null });

  actor.setIdentity(verifierTwo);
  const afterSecond = ok(
    await actor.verifyStewardRecoveryForFamily(NORWOOD, created.id, {
      Confirm: null,
    }),
  );
  expect(afterSecond.status).toEqual({ Approved: null });
  expect(afterSecond.transferredAt).toHaveLength(1);

  // The replacement now holds the active Steward authority.
  actor.setIdentity(replacement);
  const rosterAfter = await actor.listStewardsForFamily(NORWOOD);
  const replacementRecord = activeStewardRecord(rosterAfter, replacement.getPrincipal());
  expect(replacementRecord).toBeDefined();

  // The old account no longer holds active Steward authority.
  actor.setIdentity(adminIdentity);
  await expect(actor.listStewardsForFamily(NORWOOD)).rejects.toThrow(
    /Only Family Stewards/i,
  );

  // No duplicate StewardRecord: the roster length is unchanged and the record
  // preserves its governance fields.
  expect(rosterAfter).toHaveLength(rosterBefore.length);
  expect(replacementRecord?.assignedBy.toText()).toBe(
    adminRecordBefore?.assignedBy.toText(),
  );
  expect(replacementRecord?.assignedAt).toEqual(adminRecordBefore?.assignedAt);
  expect(replacementRecord?.founding).toBe(adminRecordBefore?.founding);
});

// ---------------------------------------------------------------------------
// (B) A completed Steward recovery cannot transfer authority twice.
// ---------------------------------------------------------------------------

it("cannot transfer Steward authority twice on a completed Steward recovery", async () => {
  const { actor } = await setup();

  // Promote CONTRIBUTOR to a second Steward so ADMIN's recovery is an ordinary
  // #AccountRecovery approved by CONTRIBUTOR.
  actor.setIdentity(adminIdentity);
  const promoted = await actor.promoteToStewardForFamily(NORWOOD, "clayton");
  expect("ok" in promoted).toBe(true);

  const adminPersonId = await makeApprovedMember(
    actor,
    adminIdentity,
    NORWOOD,
    "Ada Admin",
  );
  const replacement = createIdentity("recovery-steward-replay-replacement-seed");
  await makeApprovedMember(actor, replacement, NORWOOD, "Rex Replacement");

  actor.setIdentity(replacement);
  const created = ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      adminPersonId,
      replacement.getPrincipal(),
    ),
  );

  actor.setIdentity(contributorIdentity);
  const approved = ok(
    await actor.approveAccountRecoveryForFamily(NORWOOD, created.id),
  );
  expect(approved.status).toEqual({ Approved: null });

  // Snapshot the roster after the first (and only) transfer.
  actor.setIdentity(replacement);
  const rosterAfterFirst = await actor.listStewardsForFamily(NORWOOD);

  // A second approval of the same, already-resolved request is refused, so the
  // authority transfer can never run twice.
  actor.setIdentity(contributorIdentity);
  await expect(
    actor.approveAccountRecoveryForFamily(NORWOOD, created.id),
  ).resolves.toEqual({ err: { AlreadyResolved: null } });

  // The roster is unchanged: exactly one active StewardRecord for the
  // replacement, and the old account still holds no active authority.
  actor.setIdentity(replacement);
  const rosterAfterReplay = await actor.listStewardsForFamily(NORWOOD);
  expect(rosterAfterReplay).toHaveLength(rosterAfterFirst.length);
  expect(
    rosterAfterReplay.filter(
      (s) => s.stewardAccountId.toText() === replacement.getPrincipal().toText(),
    ),
  ).toHaveLength(1);

  actor.setIdentity(adminIdentity);
  await expect(actor.listStewardsForFamily(NORWOOD)).rejects.toThrow(
    /Only Family Stewards/i,
  );
});

// ===========================================================================
// Phase 4A-H2 — Lost-account recovery initiation
//
// A user who lost access to their old Norwood account authenticates with a
// brand-new replacement account and REQUESTS recovery of their existing claimed
// Person/Profile, WITHOUT the replacement account needing an existing family
// membership, profile claim, or second Person/Profile. The request is only a
// pending claim: it grants no ownership, membership, or Steward authority. The
// existing Steward approval / Steward Recovery quorum remains the security
// boundary that authorizes the actual transfer, and approval atomically
// retargets the EXISTING membership to the replacement account.
// ===========================================================================

it("lets a brand-new replacement account with no membership request and be approved, retargeting the existing membership", async () => {
  const { actor } = await setup();

  // The old owner (CONTRIBUTOR) holds an `#Active` membership for "clayton".
  actor.setIdentity(adminIdentity);
  const ownerPending = ok(
    await actor.createPendingMembershipForFamily(
      NORWOOD,
      contributorIdentity.getPrincipal(),
      "clayton",
    ),
  );
  const ownerActivated = ok(
    await actor.activateMembershipForFamily(NORWOOD, ownerPending.id),
  );
  expect(ownerActivated.status).toEqual({ Active: null });

  // A brand-new authenticated replacement account with NO family membership,
  // NO profile claim, and NO second Person/Profile.
  const replacement = createIdentity("recovery-h2-brand-new-replacement-seed");
  actor.setIdentity(replacement);
  await actor._initialize_access_control();

  const profilesBefore = await profileCount(actor, NORWOOD);
  const membershipsBefore = await membershipCount(actor, NORWOOD);

  // The replacement account requests recovery of the existing claimed profile.
  actor.setIdentity(replacement);
  const created = ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      "clayton",
      replacement.getPrincipal(),
    ),
  );
  expect(created.replacementAccountId).toEqual(replacement.getPrincipal());
  expect(created.requestedByAccountId).toEqual(replacement.getPrincipal());
  expect(created.ownerAccountId).toEqual(contributorIdentity.getPrincipal());
  expect(created.recoveryType).toEqual({ AccountRecovery: null });
  expect(created.status).toEqual({ Pending: null });

  // Creating the request grants no ownership and no membership.
  const beforeApproval = await actor.getPersonProfileForFamily(NORWOOD, "clayton");
  expect(beforeApproval[0].claimedByUserId).toEqual([
    contributorIdentity.getPrincipal(),
  ]);
  expect(await profileCount(actor, NORWOOD)).toBe(profilesBefore);
  expect(await membershipCount(actor, NORWOOD)).toBe(membershipsBefore);

  // ADMIN (a different Steward) approves, performing the transfer. The
  // replacement is NOT required to already have a family membership.
  actor.setIdentity(adminIdentity);
  const approved = ok(
    await actor.approveAccountRecoveryForFamily(NORWOOD, created.id),
  );
  expect(approved.status).toEqual({ Approved: null });
  expect(approved.transferredAt).toHaveLength(1);

  // The existing profile now belongs to the replacement account.
  const profile = await actor.getPersonProfileForFamily(NORWOOD, "clayton");
  expect(profile).toHaveLength(1);
  expect(profile[0].claimedByUserId).toEqual([replacement.getPrincipal()]);

  // The EXISTING membership was retargeted to the replacement account: exactly
  // one `#Active` membership owns "clayton", and no second membership was
  // created.
  const memberships = ok(await actor.listFamilyMembersForFamily(NORWOOD));
  const activeOwners = memberships.filter(
    (m) => m.personId === "clayton" && "Active" in m.status,
  );
  expect(activeOwners).toHaveLength(1);
  expect(activeOwners[0].accountId).toEqual(replacement.getPrincipal());
  expect(await membershipCount(actor, NORWOOD)).toBe(membershipsBefore);
  expect(await profileCount(actor, NORWOOD)).toBe(profilesBefore);
});

it("lets a brand-new replacement account satisfy a Steward Recovery quorum and retarget the existing membership", async () => {
  const { actor } = await setup();
  const founder = createIdentity("recovery-h2-quorum-founder-seed");
  const { familyId, founderPersonId } = await makeStewardlessFamily(
    actor,
    founder,
    "h2-quorum-family-key",
  );

  // Two independent approved members (verifiers) and a brand-new replacement
  // account with NO family membership.
  const verifierOne = createIdentity("recovery-h2-quorum-verifier-one-seed");
  const verifierTwo = createIdentity("recovery-h2-quorum-verifier-two-seed");
  const replacement = createIdentity("recovery-h2-quorum-replacement-seed");
  await makeApprovedMember(actor, verifierOne, familyId, "Vera One");
  await makeApprovedMember(actor, verifierTwo, familyId, "Vic Two");
  actor.setIdentity(replacement);
  await actor._initialize_access_control();

  const membershipsBefore = await membershipCountAs(actor, familyId, verifierOne);

  // No usable active Steward exists, so the request is a #StewardRecovery.
  actor.setIdentity(replacement);
  const created = ok(
    await actor.requestRecoveryForFamily(
      familyId,
      founderPersonId,
      replacement.getPrincipal(),
    ),
  );
  expect(created.recoveryType).toEqual({ StewardRecovery: null });
  expect(created.replacementAccountId).toEqual(replacement.getPrincipal());

  // Two independent confirmations satisfy the quorum and resolve the request.
  actor.setIdentity(verifierOne);
  const afterFirst = ok(
    await actor.verifyStewardRecoveryForFamily(familyId, created.id, {
      Confirm: null,
    }),
  );
  expect(afterFirst.status).toEqual({ AwaitingVerification: null });

  actor.setIdentity(verifierTwo);
  const afterSecond = ok(
    await actor.verifyStewardRecoveryForFamily(familyId, created.id, {
      Confirm: null,
    }),
  );
  expect(afterSecond.status).toEqual({ Approved: null });
  expect(afterSecond.transferredAt).toHaveLength(1);

  // The existing profile now belongs to the replacement account.
  const profile = await actor.getPersonProfileForFamily(familyId, founderPersonId);
  expect(profile).toHaveLength(1);
  expect(profile[0].claimedByUserId).toEqual([replacement.getPrincipal()]);

  // The existing membership was retargeted, not duplicated.
  const memberships = ok(await actor.listFamilyMembersForFamily(familyId));
  const activeOwners = memberships.filter(
    (m) => m.personId === founderPersonId && "Active" in m.status,
  );
  expect(activeOwners).toHaveLength(1);
  expect(activeOwners[0].accountId).toEqual(replacement.getPrincipal());
  expect(await membershipCountAs(actor, familyId, verifierOne)).toBe(membershipsBefore);
});

it("rejects cross-family approval and review of a self-service recovery request", async () => {
  const { actor } = await setup();

  // A second, unrelated family with its own founder and a real open request.
  const otherFounder = createIdentity("recovery-h2-cross-family-founder-seed");
  const { familyId: otherFamilyId, founderPersonId: otherPersonId } =
    await makeStewardlessFamily(actor, otherFounder, "h2-cross-family-key");

  // A brand-new replacement account in the other family requests recovery.
  const replacement = createIdentity("recovery-h2-cross-family-replacement-seed");
  actor.setIdentity(replacement);
  await actor._initialize_access_control();
  const otherRequest = ok(
    await actor.requestRecoveryForFamily(
      otherFamilyId,
      otherPersonId,
      replacement.getPrincipal(),
    ),
  );

  // A Norwood Steward cannot approve the other family's request: the request is
  // a #StewardRecovery, so the ordinary approval path is an invalid transition.
  actor.setIdentity(adminIdentity);
  await expect(
    actor.approveAccountRecoveryForFamily(otherFamilyId, otherRequest.id),
  ).resolves.toEqual({ err: { InvalidTransition: null } });

  // A Norwood member is not an approved member of the other family, so the
  // quorum review is denied.
  actor.setIdentity(contributorIdentity);
  await expect(
    actor.verifyStewardRecoveryForFamily(otherFamilyId, otherRequest.id, {
      Confirm: null,
    }),
  ).resolves.toEqual({ err: { NotAuthorized: null } });

  // The other family's request is untouched.
  actor.setIdentity(replacement);
  const still = ok(
    await actor.getRecoveryRequestForFamily(otherFamilyId, otherRequest.id),
  );
  expect(still[0].status).toEqual({ Pending: null });
  expect(still[0].transferredAt).toEqual([]);
});

it("cannot replay a completed self-service recovery", async () => {
  const { actor } = await setup();

  const replacement = createIdentity("recovery-h2-replay-replacement-seed");
  actor.setIdentity(replacement);
  await actor._initialize_access_control();

  const created = ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      "clayton",
      replacement.getPrincipal(),
    ),
  );

  actor.setIdentity(adminIdentity);
  const approved = ok(
    await actor.approveAccountRecoveryForFamily(NORWOOD, created.id),
  );
  expect(approved.status).toEqual({ Approved: null });
  const transferredAt = approved.transferredAt;

  // A second approval of the same, already-resolved request is refused.
  await expect(
    actor.approveAccountRecoveryForFamily(NORWOOD, created.id),
  ).resolves.toEqual({ err: { AlreadyResolved: null } });

  // The request is unchanged and ownership is still the replacement account's.
  const after = ok(await actor.getRecoveryRequestForFamily(NORWOOD, created.id));
  expect(after[0].status).toEqual({ Approved: null });
  expect(after[0].transferredAt).toEqual(transferredAt);
  const profile = await actor.getPersonProfileForFamily(NORWOOD, "clayton");
  expect(profile[0].claimedByUserId).toEqual([replacement.getPrincipal()]);
});
