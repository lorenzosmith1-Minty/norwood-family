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
// Phase 4B-H1 — Recovery privacy + caller-scoped status (real-canister cover).
//
// The accepted behavior this file asserts, driven against the app's own
// compiled wasm through the real public API:
//
//   1. `searchRecoveryTargetsForFamily` is the ONLY recovery discovery read and
//      returns exactly an opaque target id and a display name. It carries no
//      parent, relationship, sibling, story, photo, principal, membership-id,
//      or Steward data — an unaffiliated replacement account cannot receive
//      FAMILY_GRAPH data during recovery.
//   2. The dedicated discovery read never consults the relationship graph: the
//      generic `searchPossibleMatchesForFamily` (which returns `PersonMatch`
//      with `parents`) is a different endpoint, and the recovery result has no
//      `parents` field at all.
//   3. `listMyRecoveryRequestsForFamily` is caller-scoped: it returns only the
//      signed-in caller's own requests, projected to the minimum caller-facing
//      view (target display name, status, timestamps) with no principal,
//      recovery id, or internal id.
//   4. Another replacement account cannot read those requests (it gets an empty
//      list, not the other account's requests).
//   5. A Family A recovery request never appears in Family B.
//   6. Anonymous callers are rejected on both reads.
//   7. Status survives a fresh frontend session because it comes from the
//      backend: a brand-new actor for the same identity sees the same request.
//
// The frontend suite mocks the actor and has no principals, so none of this is
// visible there. This file installs the app's own compiled wasm and drives the
// real public API.
//
// The lane shares one PocketIC sidecar across every file, and installing a
// canister replays the whole migration chain — the single most expensive
// operation in the lane. This file keeps its canister installs to one per test
// and only the tests the Phase 4B-H1 acceptance criteria require.
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
 * has NO StewardRecord, so a recovery request in it is a `#StewardRecovery`.
 * Returns the new family id and the founder's personId.
 */
async function makeStewardlessFamily(
  actor: _SERVICE,
  founder: ReturnType<typeof createIdentity>,
  key: string,
): Promise<{ familyId: string; founderPersonId: string }> {
  actor.setIdentity(founder);
  const created = await actor.createFamilyWithFounder(
    "Privacy Family",
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

// ---------------------------------------------------------------------------
// (1) The dedicated discovery read returns only an opaque id and a name.
// ---------------------------------------------------------------------------

it("returns only an opaque target id and display name from recovery discovery", async () => {
  const { actor } = await setup();

  // A brand-new authenticated account with NO family relationship searches for
  // a claimed profile. It is the unaffiliated replacement account.
  const outsider = createIdentity("recovery-privacy-outsider-seed");
  actor.setIdentity(outsider);
  await actor._initialize_access_control();

  const matches = ok(
    await actor.searchRecoveryTargetsForFamily(NORWOOD, "clayton"),
  );
  expect(matches).toHaveLength(1);
  expect(matches[0]).toEqual({ personId: "clayton", name: "Clayton Norwood" });

  // The result carries EXACTLY the two recovery-safe fields. A `parents` field
  // (or any relationship/story/photo/principal/membership field) would leak
  // FAMILY_GRAPH data to an unaffiliated account.
  expect(Object.keys(matches[0]).sort()).toEqual(["name", "personId"]);
  expect(matches[0]).not.toHaveProperty("parents");
  expect(matches[0]).not.toHaveProperty("relationships");
  expect(matches[0]).not.toHaveProperty("story");
  expect(matches[0]).not.toHaveProperty("photo");
  expect(matches[0]).not.toHaveProperty("ownerAccountId");
  expect(matches[0]).not.toHaveProperty("membershipId");
});

it("does not expose the relationship graph through the generic match read to the recovery flow", async () => {
  const { actor } = await setup();

  // The generic possible-match read DOES return parents; the dedicated recovery
  // read must not. This pins the distinction the recovery flow relies on: the
  // recovery page uses `searchRecoveryTargetsForFamily`, never
  // `searchPossibleMatchesForFamily`.
  const outsider = createIdentity("recovery-privacy-graph-seed");
  actor.setIdentity(outsider);
  await actor._initialize_access_control();

  const generic = await actor.searchPossibleMatchesForFamily(NORWOOD, "clayton");
  expect(generic.length).toBeGreaterThan(0);
  expect(generic[0]).toHaveProperty("parents");

  const recovery = ok(
    await actor.searchRecoveryTargetsForFamily(NORWOOD, "clayton"),
  );
  expect(recovery[0]).not.toHaveProperty("parents");
});

it("returns no matches for an empty query and never an error", async () => {
  const { actor } = await setup();
  const outsider = createIdentity("recovery-privacy-empty-seed");
  actor.setIdentity(outsider);
  await actor._initialize_access_control();

  await expect(
    actor.searchRecoveryTargetsForFamily(NORWOOD, ""),
  ).resolves.toEqual({ ok: [] });
});

it("rejects an anonymous caller on the recovery discovery read", async () => {
  const { actor, canisterId } = await setup();
  const anonymous = pic!.createActor<_SERVICE>(idlFactory, canisterId);

  await expect(
    anonymous.searchRecoveryTargetsForFamily(NORWOOD, "clayton"),
  ).resolves.toEqual({ err: { NotSignedIn: null } });
});

// ---------------------------------------------------------------------------
// (2) The caller-scoped status read returns only the caller's own requests.
// ---------------------------------------------------------------------------

it("returns only the signed-in caller's own recovery requests", async () => {
  const { actor } = await setup();

  // Two independent replacement accounts each request recovery of a different
  // claimed profile. CONTRIBUTOR owns "clayton"; ADMIN owns their own profile.
  const adminPersonId = await makeApprovedMember(
    actor,
    adminIdentity,
    NORWOOD,
    "Ada Admin",
  );
  const replacementA = createIdentity("recovery-privacy-caller-a-seed");
  const replacementB = createIdentity("recovery-privacy-caller-b-seed");
  await makeApprovedMember(actor, replacementA, NORWOOD, "Rhea A");
  await makeApprovedMember(actor, replacementB, NORWOOD, "Rex B");

  actor.setIdentity(replacementA);
  const requestA = ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      "clayton",
      replacementA.getPrincipal(),
    ),
  );

  actor.setIdentity(replacementB);
  const requestB = ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      adminPersonId,
      replacementB.getPrincipal(),
    ),
  );

  // Caller A sees only its own request.
  actor.setIdentity(replacementA);
  const mineA = ok(await actor.listMyRecoveryRequestsForFamily(NORWOOD));
  expect(mineA).toHaveLength(1);
  expect(mineA[0].targetName).toBe("Clayton Norwood");
  expect(mineA[0].status).toEqual({ Pending: null });

  // Caller B sees only its own request.
  actor.setIdentity(replacementB);
  const mineB = ok(await actor.listMyRecoveryRequestsForFamily(NORWOOD));
  expect(mineB).toHaveLength(1);
  expect(mineB[0].targetName).toBe("Ada Admin");

  // The two requests are distinct and neither caller sees the other's.
  expect(requestA.id).not.toBe(requestB.id);
});

it("does not let another replacement account read the caller's requests", async () => {
  const { actor } = await setup();

  const replacementA = createIdentity("recovery-privacy-reader-a-seed");
  const replacementB = createIdentity("recovery-privacy-reader-b-seed");
  await makeApprovedMember(actor, replacementA, NORWOOD, "Rhea A");
  await makeApprovedMember(actor, replacementB, NORWOOD, "Rex B");

  actor.setIdentity(replacementA);
  ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      "clayton",
      replacementA.getPrincipal(),
    ),
  );

  // A different replacement account with no request of its own gets an empty
  // list — never the other account's request.
  actor.setIdentity(replacementB);
  await expect(
    actor.listMyRecoveryRequestsForFamily(NORWOOD),
  ).resolves.toEqual({ ok: [] });
});

it("never exposes a principal, recovery id, or internal id in the caller view", async () => {
  const { actor } = await setup();

  const replacement = createIdentity("recovery-privacy-view-seed");
  await makeApprovedMember(actor, replacement, NORWOOD, "Rhea Replacement");

  actor.setIdentity(replacement);
  const created = ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      "clayton",
      replacement.getPrincipal(),
    ),
  );

  const mine = ok(await actor.listMyRecoveryRequestsForFamily(NORWOOD));
  expect(mine).toHaveLength(1);

  // The caller-facing view carries EXACTLY the family-safe fields. Phase 4C-H1
  // added the two optional quorum counts (`confirmationsReceived` /
  // `confirmationsRequired`); this request is an ordinary Account Recovery in
  // Norwood (which has an active Steward), so the backend leaves both null and
  // Candid decodes them as empty options. The old owner principal, the
  // replacement principal, the recovery id, and every other internal datum are
  // still absent.
  expect(Object.keys(mine[0]).sort()).toEqual([
    "confirmationsReceived",
    "confirmationsRequired",
    "createdAt",
    "status",
    "targetName",
    "updatedAt",
  ]);
  expect(mine[0].confirmationsReceived).toEqual([]);
  expect(mine[0].confirmationsRequired).toEqual([]);
  expect(mine[0]).not.toHaveProperty("id");
  expect(mine[0]).not.toHaveProperty("ownerAccountId");
  expect(mine[0]).not.toHaveProperty("replacementAccountId");
  expect(mine[0]).not.toHaveProperty("requestedByAccountId");
  expect(mine[0]).not.toHaveProperty("personId");
  expect(mine[0]).not.toHaveProperty("familyId");
  expect(mine[0].createdAt).toEqual(expect.any(BigInt));
  expect(mine[0].updatedAt).toEqual(expect.any(BigInt));
  // The internal recovery id is not leaked through the view: the only numeric
  // fields are the two timestamps, and neither equals the recovery id.
  expect(created.id).not.toBe(mine[0].createdAt);
  expect(created.id).not.toBe(mine[0].updatedAt);
});

it("rejects an anonymous caller on the caller-scoped status read", async () => {
  const { actor, canisterId } = await setup();
  const anonymous = pic!.createActor<_SERVICE>(idlFactory, canisterId);

  await expect(
    anonymous.listMyRecoveryRequestsForFamily(NORWOOD),
  ).resolves.toEqual({ err: { NotSignedIn: null } });
});

// ---------------------------------------------------------------------------
// (3) Family isolation: a Family A request never appears in Family B.
// ---------------------------------------------------------------------------

it("does not show a Family A recovery request in Family B", async () => {
  const { actor } = await setup();

  // A second, unrelated family with its own founder and a real open request.
  const otherFounder = createIdentity("recovery-privacy-family-b-founder-seed");
  const { familyId: familyB, founderPersonId: founderB } =
    await makeStewardlessFamily(actor, otherFounder, "privacy-family-b-key");

  // The same replacement account requests recovery in BOTH families.
  const replacement = createIdentity("recovery-privacy-cross-family-seed");
  await makeApprovedMember(actor, replacement, NORWOOD, "Rhea Norwood");
  await makeApprovedMember(actor, replacement, familyB, "Rhea B");

  actor.setIdentity(replacement);
  ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      "clayton",
      replacement.getPrincipal(),
    ),
  );
  ok(
    await actor.requestRecoveryForFamily(
      familyB,
      founderB,
      replacement.getPrincipal(),
    ),
  );

  // Each family's caller-scoped read returns only that family's request.
  actor.setIdentity(replacement);
  const inNorwood = ok(await actor.listMyRecoveryRequestsForFamily(NORWOOD));
  expect(inNorwood).toHaveLength(1);
  expect(inNorwood[0].targetName).toBe("Clayton Norwood");

  const inFamilyB = ok(await actor.listMyRecoveryRequestsForFamily(familyB));
  expect(inFamilyB).toHaveLength(1);
  expect(inFamilyB[0].targetName).toBe("Quinn Quorum");

  // The Family A request never appears in Family B and vice versa.
  expect(inFamilyB.map((r) => r.targetName)).not.toContain("Clayton Norwood");
  expect(inNorwood.map((r) => r.targetName)).not.toContain("Quinn Quorum");
});

// ---------------------------------------------------------------------------
// (4) Status continuity: the backend is the source of truth across sessions.
// ---------------------------------------------------------------------------

it("survives a fresh frontend session because the status comes from the backend", async () => {
  const { actor, canisterId } = await setup();

  const replacement = createIdentity("recovery-privacy-session-seed");
  await makeApprovedMember(actor, replacement, NORWOOD, "Rhea Replacement");

  actor.setIdentity(replacement);
  ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      "clayton",
      replacement.getPrincipal(),
    ),
  );

  // A brand-new actor for the SAME identity simulates a fresh browser session
  // with no client-side state: the request is still visible because it is read
  // from the backend, not from sessionStorage.
  const freshActor = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  freshActor.setIdentity(replacement);
  const mine = ok(await freshActor.listMyRecoveryRequestsForFamily(NORWOOD));
  expect(mine).toHaveLength(1);
  expect(mine[0].targetName).toBe("Clayton Norwood");
  expect(mine[0].status).toEqual({ Pending: null });
});

// ---------------------------------------------------------------------------
// (5) The caller-scoped read reflects a resolved status from the backend.
// ---------------------------------------------------------------------------

it("reflects the resolved status from the backend after a Steward decision", async () => {
  const { actor } = await setup();

  const replacement = createIdentity("recovery-privacy-resolved-seed");
  await makeApprovedMember(actor, replacement, NORWOOD, "Rhea Replacement");

  actor.setIdentity(replacement);
  const created = ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      "clayton",
      replacement.getPrincipal(),
    ),
  );

  // ADMIN (a different Steward) approves, resolving the request.
  actor.setIdentity(adminIdentity);
  const approved = ok(
    await actor.approveAccountRecoveryForFamily(NORWOOD, created.id),
  );
  expect(approved.status).toEqual({ Approved: null });

  // The caller-scoped read now reports the resolved status, so the status page
  // shows "Access restored" without any client-side registry.
  actor.setIdentity(replacement);
  const mine = ok(await actor.listMyRecoveryRequestsForFamily(NORWOOD));
  expect(mine).toHaveLength(1);
  expect(mine[0].status).toEqual({ Approved: null });
});

// ---------------------------------------------------------------------------
// (6) The dedicated discovery read is family-scoped.
// ---------------------------------------------------------------------------

it("does not resolve a person id from another family through recovery discovery", async () => {
  const { actor } = await setup();

  const otherFounder = createIdentity("recovery-privacy-discovery-family-seed");
  const { familyId: familyB } = await makeStewardlessFamily(
    actor,
    otherFounder,
    "privacy-discovery-family-key",
  );

  const outsider = createIdentity("recovery-privacy-discovery-outsider-seed");
  actor.setIdentity(outsider);
  await actor._initialize_access_control();

  // "clayton" exists in Norwood but not in Family B: a person id from one
  // family never resolves under another.
  const inB = ok(await actor.searchRecoveryTargetsForFamily(familyB, "clayton"));
  expect(inB).toEqual([]);

  // The same search in Norwood does resolve it.
  const inNorwood = ok(
    await actor.searchRecoveryTargetsForFamily(NORWOOD, "clayton"),
  );
  expect(inNorwood).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// (7) The recovery request still submits the signed-in caller as replacement.
// ---------------------------------------------------------------------------

it("submits the signed-in caller as the replacement account", async () => {
  const { actor } = await setup();

  const replacement = createIdentity("recovery-privacy-self-service-seed");
  actor.setIdentity(replacement);
  await actor._initialize_access_control();

  const created = ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      "clayton",
      replacement.getPrincipal(),
    ),
  );
  expect(created.replacementAccountId).toEqual(replacement.getPrincipal());
  expect(created.requestedByAccountId).toEqual(replacement.getPrincipal());
  // The current owner is derived from the existing profile, not supplied.
  expect(created.ownerAccountId).toEqual(contributorIdentity.getPrincipal());
});

// ---------------------------------------------------------------------------
// (8) Phase 4C-H1: the caller-scoped view carries backend-derived quorum
//     progress for the caller's own Steward Recovery request.
// ---------------------------------------------------------------------------

it("carries backend-derived quorum progress for the caller's own Steward Recovery request", async () => {
  const { actor } = await setup();

  // A stewardless family makes the request a `#StewardRecovery` requiring the
  // 2-member quorum. The replacement account is the caller.
  const founder = createIdentity("recovery-privacy-quorum-founder-seed");
  const { familyId, founderPersonId } = await makeStewardlessFamily(
    actor,
    founder,
    "privacy-quorum-family-key",
  );
  const replacement = createIdentity("recovery-privacy-quorum-replacement-seed");
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

  // Before any confirmation the caller sees 0 of 2.
  let mine = ok(await actor.listMyRecoveryRequestsForFamily(familyId));
  expect(mine).toHaveLength(1);
  expect(mine[0].confirmationsReceived).toEqual([0n]);
  expect(mine[0].confirmationsRequired).toEqual([2n]);

  // One independent approved member confirms: the caller sees 1 of 2.
  const verifierOne = createIdentity("recovery-privacy-quorum-verifier-one-seed");
  await makeApprovedMember(actor, verifierOne, familyId, "Vera One");
  actor.setIdentity(verifierOne);
  await actor.verifyStewardRecoveryForFamily(familyId, created.id, {
    Confirm: null,
  });

  actor.setIdentity(replacement);
  mine = ok(await actor.listMyRecoveryRequestsForFamily(familyId));
  expect(mine[0].confirmationsReceived).toEqual([1n]);
  expect(mine[0].confirmationsRequired).toEqual([2n]);

  // A second independent approved member confirms: the caller sees 2 of 2.
  const verifierTwo = createIdentity("recovery-privacy-quorum-verifier-two-seed");
  await makeApprovedMember(actor, verifierTwo, familyId, "Vic Two");
  actor.setIdentity(verifierTwo);
  await actor.verifyStewardRecoveryForFamily(familyId, created.id, {
    Confirm: null,
  });

  actor.setIdentity(replacement);
  mine = ok(await actor.listMyRecoveryRequestsForFamily(familyId));
  expect(mine[0].confirmationsReceived).toEqual([2n]);
  expect(mine[0].confirmationsRequired).toEqual([2n]);
});

it("leaves the quorum fields null for an ordinary Account Recovery request", async () => {
  const { actor } = await setup();

  // Norwood has an active Steward, so this is an ordinary `#AccountRecovery`
  // request: the 2-member quorum does not apply and both counts stay null.
  const replacement = createIdentity("recovery-privacy-account-quorum-seed");
  await makeApprovedMember(actor, replacement, NORWOOD, "Rhea Replacement");

  actor.setIdentity(replacement);
  const created = ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      "clayton",
      replacement.getPrincipal(),
    ),
  );
  expect(created.recoveryType).toEqual({ AccountRecovery: null });

  const mine = ok(await actor.listMyRecoveryRequestsForFamily(NORWOOD));
  expect(mine).toHaveLength(1);
  expect(mine[0].confirmationsReceived).toEqual([]);
  expect(mine[0].confirmationsRequired).toEqual([]);
});
