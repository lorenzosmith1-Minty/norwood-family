import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";
import {
  BACKEND_WASM,
  adminIdentity,
  contributorIdentity,
  memberAIdentity,
  registerApprovedContributor,
} from "./lane-helpers";

// ---------------------------------------------------------------------------
// Tenancy 1C governance family-scope cover (real-canister).
//
// The accepted change makes `promoteToStewardForFamily`,
// `activateSuccessorForFamily`, and `addRelationshipForFamily` the canonical
// paths, each taking an explicit `familyId` and filtering every Steward and
// profile lookup by it, and reduces the legacy `promoteToSteward`,
// `activateSuccessor`, and `addRelationship` to thin wrappers delegating to the
// default Norwood family.
//
// The frontend suite mocks the actor and has no principals, so the per-caller
// authorization and the family-qualified lookups can only be asserted here.
// This file installs the app's own compiled wasm and drives the real public
// API. It asserts:
//
//   1. `promoteToStewardForFamily` rejects a caller who is not an active
//      Steward of the supplied familyId.
//   2. `promoteToStewardForFamily` rejects a target profile that does not
//      belong to the supplied familyId.
//   3. `promoteToStewardForFamily` creates a StewardRecord whose familyId equals
//      the supplied familyId.
//   4. `activateSuccessorForFamily` rejects a caller who is not an active
//      Steward of the supplied familyId, and (in the default family) activates
//      the designated successor into a record stamped with that familyId.
//   5. `addRelationshipForFamily` creates a Relationship whose familyId equals
//      the supplied familyId, rejects a cross-family edge, and does not create a
//      duplicate for the same pair in that family.
//   6. The legacy `promoteToSteward`, `activateSuccessor`, and `addRelationship`
//      wrappers still produce the default-family behavior.
//
// Coverage limits this file cannot close, stated plainly:
//
//   * There is no public endpoint that creates a Steward of a non-default
//     family: `claimSteward` and the legacy `promoteToSteward` both write
//     `familyId = "norwood"`, and `promoteToStewardForFamily` requires the
//     caller to already be an active Steward of the supplied family. A Family A
//     Steward therefore cannot be bootstrapped through the public API, so the
//     "Family A Steward promotes/activates/relates in Family A" direction is
//     driven in the default family (where a Steward exists) and in the denial
//     direction for Family A. The internal family-scoped predicate is covered by
//     the sibling `family-scoped-authorization.behavior.test.ts`, which executes
//     the real Motoko source.
//   * The two-family isolation of `activateSuccessorForFamily` is asserted in
//     the direction the API supports: a Norwood Steward cannot activate a
//     successor in Family A, and the Family A profile state is unchanged.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

const FAMILY_A = "test-family-a";
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
 * A fresh canister with the Norwood Steward bootstrapped, an approved claimed
 * Norwood member (`clayton`, owned by CONTRIBUTOR), and MEMBER_A approved in
 * the test-only Family A. Each test seeds its own canister so no test depends
 * on the order another ran in.
 */
async function setupFamilies(): Promise<Seeded> {
  const setup = await pic!.setupCanister<_SERVICE>({
    idlFactory,
    wasm: BACKEND_WASM,
  });
  const actor = setup.actor;

  // ADMIN becomes the Norwood Family Steward and CONTRIBUTOR becomes an
  // approved claimed Norwood member (owner of the `clayton` profile).
  await registerApprovedContributor(actor);

  // `createMyselfForFamily` creates a minimal profile owned by the caller and
  // writes an APPROVED claim for it in that family, which is what makes the
  // caller an approved member of Family A.
  actor.setIdentity(memberAIdentity);
  await actor._initialize_access_control();
  const createdA = await actor.createMyselfForFamily(FAMILY_A, "Family A Member");
  expect("ok" in createdA).toBe(true);

  return { actor, canisterId: setup.canisterId };
}

/** The personId of the profile `createMyselfForFamily` created for the caller. */
async function myPersonIdIn(actor: _SERVICE, familyId: string): Promise<string> {
  const profile = await actor.getMyProfileForFamily(familyId);
  if (profile.length === 0) {
    throw new Error(`no profile for the caller in ${familyId}`);
  }
  return profile[0].personId;
}

// ---------------------------------------------------------------------------
// promoteToStewardForFamily
// ---------------------------------------------------------------------------

it("promoteToStewardForFamily rejects a caller who is not an active Steward of the supplied family", async () => {
  const { actor } = await setupFamilies();

  // CONTRIBUTOR is an approved Norwood member but not a Steward. The canonical
  // endpoint gates on active Steward authority for the requested family.
  actor.setIdentity(contributorIdentity);
  await expect(
    actor.promoteToStewardForFamily(NORWOOD, "clayton"),
  ).rejects.toThrow();

  // The Norwood Steward is not a Steward of Family A, so the same call against
  // Family A is denied even though the caller is a Steward somewhere.
  actor.setIdentity(adminIdentity);
  await expect(
    actor.promoteToStewardForFamily(FAMILY_A, "clayton"),
  ).rejects.toThrow();
});

it("promoteToStewardForFamily rejects a target profile that does not belong to the supplied family", async () => {
  const { actor } = await setupFamilies();

  const familyAPersonId = await myPersonIdIn(actor, FAMILY_A);

  // The Norwood Steward promotes a Family A person into Norwood: the
  // family-qualified profile lookup finds no such Norwood profile, so the
  // promotion is refused rather than crossing the family boundary.
  actor.setIdentity(adminIdentity);
  await expect(
    actor.promoteToStewardForFamily(NORWOOD, familyAPersonId),
  ).resolves.toEqual({ err: { NotApprovedClaimedMember: null } });

  // No Steward record was created for the Family A person.
  const stewards = await actor.listStewards();
  expect(
    stewards.some(
      (s) =>
        s.stewardAccountId.toText() ===
        memberAIdentity.getPrincipal().toText(),
    ),
  ).toBe(false);
});

it("promoteToStewardForFamily creates a StewardRecord whose familyId equals the supplied familyId", async () => {
  const { actor } = await setupFamilies();

  // `clayton` is a claimed Norwood profile owned by CONTRIBUTOR.
  actor.setIdentity(adminIdentity);
  const promoted = await actor.promoteToStewardForFamily(NORWOOD, "clayton");
  expect(promoted).toEqual({
    ok: expect.objectContaining({
      familyId: NORWOOD,
      stewardAccountId: contributorIdentity.getPrincipal(),
      roleStatus: { Active: null },
    }),
  });

  // The persisted roster carries the same familyId. Principal objects are
  // compared by text: two Principal instances for the same account are not
  // reference-equal.
  const stewards = await actor.listStewards();
  const record = stewards.find(
    (s) =>
      s.stewardAccountId.toText() ===
      contributorIdentity.getPrincipal().toText(),
  );
  expect(record).toMatchObject({ familyId: NORWOOD, roleStatus: { Active: null } });
});

// ---------------------------------------------------------------------------
// activateSuccessorForFamily
// ---------------------------------------------------------------------------

it("activateSuccessorForFamily rejects a caller who is not an active Steward of the supplied family", async () => {
  const { actor } = await setupFamilies();

  // Designate `clayton` as a successor in the default family as the Steward.
  actor.setIdentity(adminIdentity);
  const designated = await actor.designateSuccessor("clayton", 1n);
  expect("ok" in designated).toBe(true);

  // CONTRIBUTOR is not a Steward, so activation is denied.
  actor.setIdentity(contributorIdentity);
  await expect(
    actor.activateSuccessorForFamily(NORWOOD, "clayton"),
  ).rejects.toThrow();

  // The Norwood Steward cannot activate a successor in Family A.
  actor.setIdentity(adminIdentity);
  await expect(
    actor.activateSuccessorForFamily(FAMILY_A, "clayton"),
  ).rejects.toThrow();
});

it("activateSuccessorForFamily activates the designated successor into a record stamped with the supplied familyId", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  const designated = await actor.designateSuccessor("clayton", 2n);
  expect("ok" in designated).toBe(true);

  const activated = await actor.activateSuccessorForFamily(NORWOOD, "clayton");
  expect(activated).toEqual({
    ok: expect.objectContaining({
      familyId: NORWOOD,
      stewardAccountId: contributorIdentity.getPrincipal(),
      roleStatus: { Active: null },
      successorPriority: [2n],
    }),
  });
});

it("activating a successor in the default family leaves Family A profile state unchanged", async () => {
  const { actor } = await setupFamilies();

  const familyAPersonId = await myPersonIdIn(actor, FAMILY_A);
  const before = await actor.getPersonProfileForFamily(FAMILY_A, familyAPersonId);
  expect(before).toHaveLength(1);

  actor.setIdentity(adminIdentity);
  await actor.designateSuccessor("clayton", 1n);
  await actor.activateSuccessorForFamily(NORWOOD, "clayton");

  // Family A's profile is byte-for-byte unchanged, and no Family A Steward
  // record was created.
  const after = await actor.getPersonProfileForFamily(FAMILY_A, familyAPersonId);
  expect(after).toEqual(before);
  const stewards = await actor.listStewards();
  expect(stewards.every((s) => s.familyId === NORWOOD)).toBe(true);
});

it("designateSuccessor stamps the designation with the default familyId", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  const designated = await actor.designateSuccessor("clayton", 1n);
  expect(designated).toEqual({
    ok: expect.objectContaining({
      familyId: NORWOOD,
      personId: "clayton",
      priority: 1n,
      status: { Designated: null },
    }),
  });

  // The persisted designation carries the same familyId.
  const successors = await actor.listSuccessors();
  expect(successors).toHaveLength(1);
  expect(successors[0]).toMatchObject({ familyId: NORWOOD, personId: "clayton" });
});

it("listSuccessorsForFamily is Steward-gated and returns only the requested family's designations", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  await actor.designateSuccessor("clayton", 1n);

  // The Norwood Steward reads the Norwood designations.
  const norwoodSuccessors = await actor.listSuccessorsForFamily(NORWOOD);
  expect(norwoodSuccessors).toHaveLength(1);
  expect(norwoodSuccessors.every((s) => s.familyId === NORWOOD)).toBe(true);

  // The Norwood Steward is not a Steward of Family A, so the Family A read is
  // denied rather than returning another family's designations.
  await expect(actor.listSuccessorsForFamily(FAMILY_A)).rejects.toThrow();
});

it("a Norwood successor designation cannot activate a Steward in Family A", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  await actor.designateSuccessor("clayton", 1n);

  // The Norwood Steward is not a Steward of Family A, so the activation is
  // denied before any designation lookup.
  await expect(
    actor.activateSuccessorForFamily(FAMILY_A, "clayton"),
  ).rejects.toThrow();

  // The Norwood designation is untouched and still #Designated.
  const successors = await actor.listSuccessors();
  expect(successors).toHaveLength(1);
  expect(successors[0]).toMatchObject({
    familyId: NORWOOD,
    personId: "clayton",
    status: { Designated: null },
  });
});

// ---------------------------------------------------------------------------
// addRelationshipForFamily
// ---------------------------------------------------------------------------

it("addRelationshipForFamily creates a Relationship whose familyId equals the supplied familyId", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  const added = await actor.addRelationshipForFamily(
    NORWOOD,
    "clayton",
    "erma",
    { SpousePartner: null },
  );
  expect(added).toEqual({
    ok: expect.objectContaining({
      familyId: NORWOOD,
      fromPersonId: "clayton",
      toPersonId: "erma",
      relationshipType: { SpousePartner: null },
      status: { Confirmed: null },
    }),
  });

  const relationships = await actor.listConfirmedRelationships();
  const stored = relationships.find(
    (r) => r.fromPersonId === "clayton" && r.toPersonId === "erma",
  );
  expect(stored).toMatchObject({ familyId: NORWOOD });
});

it("addRelationshipForFamily rejects a cross-family edge", async () => {
  const { actor } = await setupFamilies();

  const familyAPersonId = await myPersonIdIn(actor, FAMILY_A);

  // One endpoint is a Family A person: the family-qualified lookup finds no
  // such Norwood profile, so no cross-family edge can be created.
  actor.setIdentity(adminIdentity);
  await expect(
    actor.addRelationshipForFamily(NORWOOD, "clayton", familyAPersonId, {
      SpousePartner: null,
    }),
  ).resolves.toEqual({ err: { PersonNotFound: null } });

  const relationships = await actor.listConfirmedRelationships();
  expect(
    relationships.some(
      (r) => r.fromPersonId === "clayton" && r.toPersonId === familyAPersonId,
    ),
  ).toBe(false);
});

it("addRelationshipForFamily does not create a duplicate for the same pair in that family", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  const first = await actor.addRelationshipForFamily(
    NORWOOD,
    "clayton",
    "erma",
    { SpousePartner: null },
  );
  expect("ok" in first).toBe(true);

  const second = await actor.addRelationshipForFamily(
    NORWOOD,
    "clayton",
    "erma",
    { SpousePartner: null },
  );
  expect(second).toEqual({ err: { DuplicateRelationship: null } });

  const relationships = await actor.listConfirmedRelationships();
  const matching = relationships.filter(
    (r) =>
      r.familyId === NORWOOD &&
      r.fromPersonId === "clayton" &&
      r.toPersonId === "erma" &&
      "SpousePartner" in r.relationshipType,
  );
  expect(matching).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// Legacy wrappers keep the default-family behavior
// ---------------------------------------------------------------------------

it("the legacy promoteToSteward wrapper still writes the default-family StewardRecord", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  const promoted = await actor.promoteToSteward("clayton");
  expect(promoted).toEqual({
    ok: expect.objectContaining({
      familyId: NORWOOD,
      stewardAccountId: contributorIdentity.getPrincipal(),
      roleStatus: { Active: null },
    }),
  });
});

it("the legacy activateSuccessor wrapper still activates into the default family", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  await actor.designateSuccessor("clayton", 1n);
  const activated = await actor.activateSuccessor("clayton");
  expect(activated).toEqual({
    ok: expect.objectContaining({
      familyId: NORWOOD,
      stewardAccountId: contributorIdentity.getPrincipal(),
      roleStatus: { Active: null },
    }),
  });
});

it("the legacy addRelationship wrapper still writes the default-family Relationship", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  const added = await actor.addRelationship("clayton", "erma", {
    SpousePartner: null,
  });
  expect(added).toEqual({
    ok: expect.objectContaining({
      familyId: NORWOOD,
      fromPersonId: "clayton",
      toPersonId: "erma",
      status: { Confirmed: null },
    }),
  });
});
