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
// Phase 4C — Steward Recovery verification read (real-canister cover).
//
// The accepted behavior this file asserts, driven against the app's own
// compiled wasm through the real public API:
//
//   1. An eligible approved family member (not a Steward, not the recovery
//      candidate) discovers a pending Steward Recovery request through
//      `listStewardRecoveryVerificationsForFamily` and reads its family-safe
//      verification context and quorum progress.
//   2. The recovery candidate never receives an entry for their own request.
//   3. An unaffiliated principal receives no entry (existence is never leaked).
//   4. A principal in another family receives no entry.
//   5. The same verifier cannot act twice: after acting, the read returns the
//      entry with `callerHasVerified = true` and the recorded decision.
//   6. Confirming updates quorum progress from backend state.
//   7. Disputing resolves the request and removes further verifier actions.
//   8. Quorum never counts the candidate.
//   9. The 2-of-2 state becomes non-actionable as dictated by backend state.
//  10. The view exposes no principals, internal ids, or private family data.
//
// The frontend suite mocks the actor and has no principals, so none of this is
// visible there. This file installs the app's own compiled wasm and drives the
// real public API.
//
// The lane shares one PocketIC sidecar across every file, and installing a
// canister replays the whole migration chain — the single most expensive
// operation in the lane. This file keeps its canister installs to one per test
// and only the tests the Phase 4C acceptance criteria require.
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
    "Verification Family",
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

/**
 * Seeds a stewardless family with a pending `#StewardRecovery` request and
 * returns the family id, the request id, and the identities involved. The
 * replacement account is the caller; the candidate is the founder (the current
 * owner of the target profile).
 */
async function seedPendingStewardRecovery(
  actor: _SERVICE,
  key: string,
): Promise<{
  familyId: string;
  recoveryId: bigint;
  candidate: ReturnType<typeof createIdentity>;
  replacement: ReturnType<typeof createIdentity>;
}> {
  const founder = createIdentity(`${key}-founder-seed`);
  const { familyId, founderPersonId } = await makeStewardlessFamily(
    actor,
    founder,
    `${key}-family-key`,
  );
  const replacement = createIdentity(`${key}-replacement-seed`);
  await makeApprovedMember(actor, replacement, familyId, "Rhea Replacement");

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
  return { familyId, recoveryId: created.id, candidate: founder, replacement };
}

// ---------------------------------------------------------------------------
// (1) An eligible approved member discovers the pending request.
// ---------------------------------------------------------------------------

it("lets an eligible approved member discover a pending Steward Recovery request", async () => {
  const { actor } = await setup();
  const { familyId, recoveryId } = await seedPendingStewardRecovery(
    actor,
    "verify-discovery",
  );

  // A non-Steward approved member (CONTRIBUTOR is approved in Norwood, but this
  // is a different family, so create a fresh approved member there).
  const verifier = createIdentity("verify-discovery-verifier-seed");
  await makeApprovedMember(actor, verifier, familyId, "Vera Verifier");

  actor.setIdentity(verifier);
  const entries = ok(
    await actor.listStewardRecoveryVerificationsForFamily(familyId),
  );
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    recoveryId,
    candidateName: "Quinn Quorum",
    status: { Pending: null },
    confirmationsReceived: 0n,
    confirmationsRequired: 2n,
    callerHasVerified: false,
    callerDecision: [],
  });
});

// ---------------------------------------------------------------------------
// (2) The candidate never receives an entry for their own request.
// ---------------------------------------------------------------------------

it("does not return an entry to the recovery candidate", async () => {
  const { actor } = await setup();
  const { familyId, candidate } = await seedPendingStewardRecovery(
    actor,
    "verify-candidate",
  );

  // The candidate is the founder and current owner of the target profile. They
  // are an approved member (createFamilyWithFounder writes an approved claim),
  // so they pass the approved-member gate and reach the candidate exclusion.
  actor.setIdentity(candidate);
  await expect(
    actor.listStewardRecoveryVerificationsForFamily(familyId),
  ).resolves.toEqual({ ok: [] });
});

// ---------------------------------------------------------------------------
// (3) An unaffiliated principal receives no entry.
// ---------------------------------------------------------------------------

it("does not return an entry to an unaffiliated principal", async () => {
  const { actor } = await setup();
  const { familyId } = await seedPendingStewardRecovery(
    actor,
    "verify-unaffiliated",
  );

  // A brand-new authenticated principal with no family relationship.
  const outsider = createIdentity("verify-unaffiliated-outsider-seed");
  actor.setIdentity(outsider);
  await actor._initialize_access_control();

  await expect(
    actor.listStewardRecoveryVerificationsForFamily(familyId),
  ).resolves.toEqual({ ok: [] });
});

// ---------------------------------------------------------------------------
// (4) A principal in another family receives no entry.
// ---------------------------------------------------------------------------

it("does not return an entry to a principal in another family", async () => {
  const { actor } = await setup();
  const { familyId } = await seedPendingStewardRecovery(
    actor,
    "verify-other-family",
  );

  // CONTRIBUTOR is an approved member of Norwood, not of this family.
  actor.setIdentity(contributorIdentity);
  await expect(
    actor.listStewardRecoveryVerificationsForFamily(familyId),
  ).resolves.toEqual({ ok: [] });
});

// ---------------------------------------------------------------------------
// (5) The same verifier cannot act twice.
// ---------------------------------------------------------------------------

it("returns callerHasVerified after the verifier acts, so a second action is suppressed", async () => {
  const { actor } = await setup();
  const { familyId, recoveryId } = await seedPendingStewardRecovery(
    actor,
    "verify-once",
  );
  const verifier = createIdentity("verify-once-verifier-seed");
  await makeApprovedMember(actor, verifier, familyId, "Vera Once");

  actor.setIdentity(verifier);
  const first = ok(
    await actor.verifyStewardRecoveryForFamily(familyId, recoveryId, {
      Confirm: null,
    }),
  );
  expect(first.status).toEqual({ AwaitingVerification: null });

  // The read now reports the caller's recorded decision, so the UI can suppress
  // further actions.
  const entries = ok(
    await actor.listStewardRecoveryVerificationsForFamily(familyId),
  );
  expect(entries).toHaveLength(1);
  expect(entries[0].callerHasVerified).toBe(true);
  expect(entries[0].callerDecision).toEqual([{ Confirm: null }]);

  // The backend also refuses a second decision from the same verifier.
  await expect(
    actor.verifyStewardRecoveryForFamily(familyId, recoveryId, {
      Confirm: null,
    }),
  ).resolves.toEqual({ err: { AlreadyVerifier: null } });
});

// ---------------------------------------------------------------------------
// (6) Confirming updates quorum progress from backend state.
// ---------------------------------------------------------------------------

it("updates quorum progress from backend state after a confirmation", async () => {
  const { actor } = await setup();
  const { familyId, recoveryId } = await seedPendingStewardRecovery(
    actor,
    "verify-quorum",
  );
  const verifierOne = createIdentity("verify-quorum-verifier-one-seed");
  const verifierTwo = createIdentity("verify-quorum-verifier-two-seed");
  await makeApprovedMember(actor, verifierOne, familyId, "Vera One");
  await makeApprovedMember(actor, verifierTwo, familyId, "Vic Two");

  // Before any confirmation, both verifiers see 0 of 2.
  actor.setIdentity(verifierOne);
  let entries = ok(
    await actor.listStewardRecoveryVerificationsForFamily(familyId),
  );
  expect(entries[0].confirmationsReceived).toBe(0n);
  expect(entries[0].confirmationsRequired).toBe(2n);

  // After the first confirmation, the second verifier sees 1 of 2.
  await actor.verifyStewardRecoveryForFamily(familyId, recoveryId, {
    Confirm: null,
  });
  actor.setIdentity(verifierTwo);
  entries = ok(
    await actor.listStewardRecoveryVerificationsForFamily(familyId),
  );
  expect(entries[0].confirmationsReceived).toBe(1n);
  expect(entries[0].status).toEqual({ AwaitingVerification: null });
});

// ---------------------------------------------------------------------------
// (7) Disputing resolves the request and removes further verifier actions.
// ---------------------------------------------------------------------------

it("resolves the request on a dispute and removes further verifier actions", async () => {
  const { actor } = await setup();
  const { familyId, recoveryId } = await seedPendingStewardRecovery(
    actor,
    "verify-dispute",
  );
  const verifierOne = createIdentity("verify-dispute-verifier-one-seed");
  const verifierTwo = createIdentity("verify-dispute-verifier-two-seed");
  await makeApprovedMember(actor, verifierOne, familyId, "Vera One");
  await makeApprovedMember(actor, verifierTwo, familyId, "Vic Two");

  actor.setIdentity(verifierOne);
  const disputed = ok(
    await actor.verifyStewardRecoveryForFamily(familyId, recoveryId, {
      Reject: null,
    }),
  );
  expect(disputed.status).toEqual({ Rejected: null });

  // The request is resolved, so no verifier receives an entry any more.
  actor.setIdentity(verifierTwo);
  await expect(
    actor.listStewardRecoveryVerificationsForFamily(familyId),
  ).resolves.toEqual({ ok: [] });
});

// ---------------------------------------------------------------------------
// (8) Quorum never counts the candidate.
// ---------------------------------------------------------------------------

it("never counts the candidate toward quorum", async () => {
  const { actor } = await setup();
  const { familyId, recoveryId, candidate } = await seedPendingStewardRecovery(
    actor,
    "verify-candidate-count",
  );
  const verifier = createIdentity("verify-candidate-count-verifier-seed");
  await makeApprovedMember(actor, verifier, familyId, "Vera Verifier");

  // The candidate cannot verify their own request. The exact refusal depends on
  // the candidate's membership status (the approved-member gate runs before the
  // self-verification check), but either way the attempt is refused and records
  // nothing.
  actor.setIdentity(candidate);
  const refused = await actor.verifyStewardRecoveryForFamily(
    familyId,
    recoveryId,
    { Confirm: null },
  );
  expect("err" in refused).toBe(true);

  // One independent confirmation still leaves the quorum at 1 of 2: the
  // candidate's attempted confirmation was never recorded.
  actor.setIdentity(verifier);
  await actor.verifyStewardRecoveryForFamily(familyId, recoveryId, {
    Confirm: null,
  });
  const entries = ok(
    await actor.listStewardRecoveryVerificationsForFamily(familyId),
  );
  expect(entries[0].confirmationsReceived).toBe(1n);
  expect(entries[0].confirmationsRequired).toBe(2n);
  expect(entries[0].status).toEqual({ AwaitingVerification: null });
});

// ---------------------------------------------------------------------------
// (9) The 2-of-2 state becomes non-actionable.
// ---------------------------------------------------------------------------

it("becomes non-actionable once the 2-of-2 quorum is reached", async () => {
  const { actor } = await setup();
  const { familyId, recoveryId } = await seedPendingStewardRecovery(
    actor,
    "verify-quorum-reached",
  );
  const verifierOne = createIdentity("verify-quorum-reached-one-seed");
  const verifierTwo = createIdentity("verify-quorum-reached-two-seed");
  await makeApprovedMember(actor, verifierOne, familyId, "Vera One");
  await makeApprovedMember(actor, verifierTwo, familyId, "Vic Two");

  actor.setIdentity(verifierOne);
  await actor.verifyStewardRecoveryForFamily(familyId, recoveryId, {
    Confirm: null,
  });
  actor.setIdentity(verifierTwo);
  const resolved = ok(
    await actor.verifyStewardRecoveryForFamily(familyId, recoveryId, {
      Confirm: null,
    }),
  );
  // The implementation transitions through #ReadyForApproval and performs the
  // transfer atomically, so the persisted status is #Approved.
  expect(resolved.status).toEqual({ Approved: null });

  // The request is no longer open, so no verifier receives an actionable entry.
  actor.setIdentity(verifierOne);
  await expect(
    actor.listStewardRecoveryVerificationsForFamily(familyId),
  ).resolves.toEqual({ ok: [] });
});

// ---------------------------------------------------------------------------
// (10) The view exposes no principals, internal ids, or private family data.
// ---------------------------------------------------------------------------

it("exposes only the family-safe verification fields", async () => {
  const { actor } = await setup();
  const { familyId, recoveryId } = await seedPendingStewardRecovery(
    actor,
    "verify-privacy",
  );
  const verifier = createIdentity("verify-privacy-verifier-seed");
  await makeApprovedMember(actor, verifier, familyId, "Vera Verifier");

  actor.setIdentity(verifier);
  const entries = ok(
    await actor.listStewardRecoveryVerificationsForFamily(familyId),
  );
  expect(entries).toHaveLength(1);

  // The view carries EXACTLY the family-safe fields. Account principals,
  // membership ids, verifier identities, and every other internal datum are
  // absent. `recoveryId` is the opaque handle the verify action needs and is
  // only returned to a caller already authorized to see the request.
  expect(Object.keys(entries[0]).sort()).toEqual([
    "callerDecision",
    "callerHasVerified",
    "candidateName",
    "confirmationsReceived",
    "confirmationsRequired",
    "recoveryId",
    "status",
  ]);
  expect(entries[0]).not.toHaveProperty("ownerAccountId");
  expect(entries[0]).not.toHaveProperty("replacementAccountId");
  expect(entries[0]).not.toHaveProperty("requestedByAccountId");
  expect(entries[0]).not.toHaveProperty("verifierAccountId");
  expect(entries[0]).not.toHaveProperty("membershipId");
  expect(entries[0]).not.toHaveProperty("personId");
  expect(entries[0]).not.toHaveProperty("familyId");
  expect(entries[0].recoveryId).toBe(recoveryId);
});

// ---------------------------------------------------------------------------
// Authorization boundary: anonymous callers are rejected on the read.
// ---------------------------------------------------------------------------

it("rejects an anonymous caller on the verification read", async () => {
  const { actor, canisterId } = await setup();
  const anonymous = pic!.createActor<_SERVICE>(idlFactory, canisterId);

  await expect(
    anonymous.listStewardRecoveryVerificationsForFamily(NORWOOD),
  ).resolves.toEqual({ err: { NotSignedIn: null } });
});
