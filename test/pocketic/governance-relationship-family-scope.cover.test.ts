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
// Tenancy 1C governance family-scope cover (real-canister) — relationships.
//
// The accepted change makes `addRelationshipForFamily`,
// `listPersonRelationshipsForFamily`, `removeRelationshipForFamily`, and
// `correctRelationshipTypeForFamily` the canonical paths, each taking an
// explicit `familyId` and filtering every Steward and profile lookup by it.
//
// The frontend suite mocks the actor and has no principals, so the per-caller
// authorization and the family-qualified lookups can only be asserted here.
// This file installs the app's own compiled wasm and drives the real public
// API. It asserts:
//
//   1. `addRelationshipForFamily` creates a Relationship whose familyId equals
//      the supplied familyId, rejects a cross-family edge, and does not create a
//      duplicate for the same pair in that family.
//   2. `listPersonRelationshipsForFamily` returns only the requested family's
//      relationships, denies a caller who is not an active Steward of the
//      supplied family, and does not return a Family A person's relationships
//      under Norwood.
//   3. `removeRelationshipForFamily` removes only the requested family's
//      relationship, denies a caller who is not an active Steward of the
//      supplied family, and returns RelationshipNotFound for an unknown id.
//   4. `correctRelationshipTypeForFamily` updates only the requested family's
//      relationship, denies a caller who is not an active Steward of the
//      supplied family, and returns RelationshipNotFound for an unknown id.
//
// The Steward/Successor half of this cover lives in the sibling
// `governance-family-scope.cover.test.ts`, and the legacy default-family
// wrappers in `governance-legacy-wrapper-family-scope.cover.test.ts`. The split
// is deliberate: each test installs its own canister, and a single file that
// installs ~26 canisters exhausts the shared sidecar's pid ceiling, after which
// the replica stops accepting connections and every later test fails with
// `fetch failed`. Keeping each file's install count well under that ceiling is
// what makes the lane reliable.
//
// Coverage limits this file cannot close, stated plainly:
//
//   * There is no public endpoint that creates a Steward of a non-default
//     family: `claimSteward` and the legacy `promoteToSteward` both write
//     `familyId = "norwood"`, and `promoteToStewardForFamily` requires the
//     caller to already be an active Steward of the supplied family. A Family A
//     Steward therefore cannot be bootstrapped through the public API, so the
//     "Family A Steward relates in Family A" direction is driven in the default
//     family (where a Steward exists) and in the denial direction for Family A.
//     The internal family-scoped predicate is covered by the sibling
//     `family-scoped-authorization.behavior.test.ts`, which executes the real
//     Motoko source.
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
// listPersonRelationshipsForFamily
// ---------------------------------------------------------------------------

it("listPersonRelationshipsForFamily returns only the requested family's relationships", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  const added = await actor.addRelationshipForFamily(
    NORWOOD,
    "clayton",
    "erma",
    { SpousePartner: null },
  );
  expect("ok" in added).toBe(true);

  // The Norwood Steward reads the Norwood relationships for `clayton`.
  const norwoodRelationships = await actor.listPersonRelationshipsForFamily(
    NORWOOD,
    "clayton",
  );
  expect(norwoodRelationships).toHaveLength(1);
  expect(norwoodRelationships[0]).toMatchObject({
    familyId: NORWOOD,
    fromPersonId: "clayton",
    toPersonId: "erma",
  });
});

it("listPersonRelationshipsForFamily denies a caller who is not an active Steward of the supplied family", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  await actor.addRelationshipForFamily(NORWOOD, "clayton", "erma", {
    SpousePartner: null,
  });

  // CONTRIBUTOR is an approved Norwood member but not a Steward.
  actor.setIdentity(contributorIdentity);
  await expect(
    actor.listPersonRelationshipsForFamily(NORWOOD, "clayton"),
  ).rejects.toThrow();

  // The Norwood Steward is not a Steward of Family A, so the Family A read is
  // denied rather than returning another family's relationships.
  actor.setIdentity(adminIdentity);
  await expect(
    actor.listPersonRelationshipsForFamily(FAMILY_A, "clayton"),
  ).rejects.toThrow();
});

it("listPersonRelationshipsForFamily does not return a Family A person's relationships under Norwood", async () => {
  const { actor } = await setupFamilies();

  const familyAPersonId = await myPersonIdIn(actor, FAMILY_A);

  // The Norwood Steward asks for the Family A person's relationships under
  // Norwood: the family-qualified profile lookup finds no such Norwood profile,
  // so the read is empty rather than crossing the family boundary.
  actor.setIdentity(adminIdentity);
  const norwoodView = await actor.listPersonRelationshipsForFamily(
    NORWOOD,
    familyAPersonId,
  );
  expect(norwoodView).toEqual([]);
});

// ---------------------------------------------------------------------------
// removeRelationshipForFamily
// ---------------------------------------------------------------------------

it("removeRelationshipForFamily removes only the requested family's relationship", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  const added = await actor.addRelationshipForFamily(
    NORWOOD,
    "clayton",
    "erma",
    { SpousePartner: null },
  );
  expect("ok" in added).toBe(true);
  const relationshipId = (added as { ok: { id: bigint } }).ok.id;

  const removed = await actor.removeRelationshipForFamily(
    NORWOOD,
    relationshipId,
  );
  expect(removed).toEqual({ ok: null });

  const remaining = await actor.listConfirmedRelationships();
  expect(remaining.some((r) => r.id === relationshipId)).toBe(false);
});

it("removeRelationshipForFamily denies a caller who is not an active Steward of the supplied family", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  const added = await actor.addRelationshipForFamily(
    NORWOOD,
    "clayton",
    "erma",
    { SpousePartner: null },
  );
  const relationshipId = (added as { ok: { id: bigint } }).ok.id;

  // CONTRIBUTOR is not a Steward, so removal is denied.
  actor.setIdentity(contributorIdentity);
  await expect(
    actor.removeRelationshipForFamily(NORWOOD, relationshipId),
  ).rejects.toThrow();

  // The Norwood Steward cannot remove a Norwood relationship through Family A:
  // the caller is not a Steward of Family A, so the relationshipId alone cannot
  // cross the family boundary.
  actor.setIdentity(adminIdentity);
  await expect(
    actor.removeRelationshipForFamily(FAMILY_A, relationshipId),
  ).rejects.toThrow();

  // The Norwood relationship is untouched.
  const remaining = await actor.listConfirmedRelationships();
  expect(remaining.some((r) => r.id === relationshipId)).toBe(true);
});

it("removeRelationshipForFamily returns RelationshipNotFound for an unknown id in the requested family", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  await expect(
    actor.removeRelationshipForFamily(NORWOOD, 999n),
  ).resolves.toEqual({ err: { RelationshipNotFound: null } });
});

// ---------------------------------------------------------------------------
// correctRelationshipTypeForFamily
// ---------------------------------------------------------------------------

it("correctRelationshipTypeForFamily updates only the requested family's relationship", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  const added = await actor.addRelationshipForFamily(
    NORWOOD,
    "clayton",
    "erma",
    { SpousePartner: null },
  );
  const relationshipId = (added as { ok: { id: bigint } }).ok.id;

  const corrected = await actor.correctRelationshipTypeForFamily(
    NORWOOD,
    relationshipId,
    { Sibling: null },
  );
  expect(corrected).toEqual({
    ok: expect.objectContaining({
      familyId: NORWOOD,
      id: relationshipId,
      relationshipType: { Sibling: null },
    }),
  });

  const stored = await actor.listConfirmedRelationships();
  const record = stored.find((r) => r.id === relationshipId);
  expect(record).toMatchObject({ relationshipType: { Sibling: null } });
});

it("correctRelationshipTypeForFamily denies a caller who is not an active Steward of the supplied family", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  const added = await actor.addRelationshipForFamily(
    NORWOOD,
    "clayton",
    "erma",
    { SpousePartner: null },
  );
  const relationshipId = (added as { ok: { id: bigint } }).ok.id;

  // CONTRIBUTOR is not a Steward, so correction is denied.
  actor.setIdentity(contributorIdentity);
  await expect(
    actor.correctRelationshipTypeForFamily(NORWOOD, relationshipId, {
      Sibling: null,
    }),
  ).rejects.toThrow();

  // The Norwood Steward cannot correct a Norwood relationship through Family A:
  // the relationshipId alone cannot cross the family boundary.
  actor.setIdentity(adminIdentity);
  await expect(
    actor.correctRelationshipTypeForFamily(FAMILY_A, relationshipId, {
      Sibling: null,
    }),
  ).rejects.toThrow();

  // The Norwood relationship keeps its original type.
  const stored = await actor.listConfirmedRelationships();
  const record = stored.find((r) => r.id === relationshipId);
  expect(record).toMatchObject({ relationshipType: { SpousePartner: null } });
});

it("correctRelationshipTypeForFamily returns RelationshipNotFound for an unknown id in the requested family", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  await expect(
    actor.correctRelationshipTypeForFamily(NORWOOD, 999n, { Sibling: null }),
  ).resolves.toEqual({ err: { RelationshipNotFound: null } });
});
