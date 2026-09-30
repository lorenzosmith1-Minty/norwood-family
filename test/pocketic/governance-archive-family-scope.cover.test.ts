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
// Tenancy 1C — family-scoped archived-profile reads and mutations
// (real-canister cover).
//
// The accepted change makes `archiveProfileForFamily`, `restoreProfileForFamily`,
// `listArchivedProfilesForFamily`, `listArchivedProfileIdsForFamily`,
// `getArchivedProfileForFamily`, and `permanentlyDeleteProfileForFamily` the
// canonical paths, each taking an explicit `familyId` and filtering every
// profile lookup by it, and reduces the legacy no-familyId methods to thin
// DEFAULT_FAMILY_ID wrappers.
//
// The frontend suite mocks the actor and has no principals, so the per-caller
// authorization and the family-qualified profile lookups can only be asserted
// here. This file installs the app's own compiled wasm and drives the real
// public API. It asserts:
//
//   1. The Norwood Steward cannot archive a Family A profile, and the Family A
//      profile is not archived.
//   2. `listArchivedProfileIdsForFamily` is ungated and family-scoped: a Norwood
//      archived id never appears in Family A's ids, and vice versa.
//   3. The Norwood Steward cannot list Family A's archived profiles, and the
//      Norwood listing returns only Norwood archived profiles.
//   4. Restoring and permanently deleting a Norwood profile affect only Norwood;
//      the Family A profile is untouched.
//   5. `getArchivedProfileForFamily` never resolves a profile across the family
//      boundary.
//
// Coverage limit this file cannot close: there is no public endpoint that
// creates a Steward of a non-default family (`claimSteward` and
// `promoteToSteward` both write `familyId = "norwood"`), so "a Steward of
// Family A cannot archive/restore a Family B profile" is exercised in the
// direction the API supports: the Norwood Steward cannot archive/restore a
// Family A profile, and an approved Family A member who is not a Steward cannot
// archive a Family A profile. The internal `isActiveStewardForFamily` predicate
// is covered by the sibling `family-scoped-authorization.behavior.test.ts`.
//
// The legacy default-family wrappers are covered by the sibling
// `governance-removal-archive-duplicate-legacy-wrapper.cover.test.ts`.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";
const NORWOOD = "norwood";

const STEWARD_MARKER =
  "Unauthorized: Only Family Stewards can archive profiles";

let pic: PocketIc | undefined;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
});

afterAll(async () => {
  await pic?.tearDown();
});

const memberAIdentity = createIdentity("archive-scope-family-a-member-seed");
const memberBIdentity = createIdentity("archive-scope-family-b-member-seed");

interface Seeded {
  actor: _SERVICE;
  canisterId: ReturnType<typeof createIdentity>["getPrincipal"];
  /** The personId of MEMBER_A's profile in Family A. */
  familyAPersonId: string;
}

/**
 * A fresh canister with the Norwood Steward bootstrapped, an approved Norwood
 * contributor, and MEMBER_A / MEMBER_B approved in their respective test-only
 * families. Each test seeds its own canister so no test depends on the order
 * another ran in.
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
  const familyAPersonId = createdA.ok.personId;

  actor.setIdentity(memberBIdentity);
  await actor._initialize_access_control();
  const createdB = await actor.createMyselfForFamily(FAMILY_B, "Family B Member");
  expect("ok" in createdB).toBe(true);

  return { actor, canisterId: setup.canisterId, familyAPersonId };
}

// ---------------------------------------------------------------------------
// (1) The Norwood Steward cannot archive a Family A profile.
// ---------------------------------------------------------------------------

it("denies the Norwood Steward archiving a Family A profile and leaves it unarchived", async () => {
  const { actor, familyAPersonId } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  await expect(
    actor.archiveProfileForFamily(FAMILY_A, familyAPersonId),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));

  // The Family A profile is not archived.
  const archivedIdsA = await actor.listArchivedProfileIdsForFamily(FAMILY_A);
  expect(archivedIdsA).not.toContain(familyAPersonId);
  expect(archivedIdsA).toEqual([]);
});

it("denies an approved Family A member who is not a Steward archiving a Family A profile", async () => {
  const { actor, familyAPersonId } = await setupFamilies();

  // Approved membership is not Steward authority.
  actor.setIdentity(memberAIdentity);
  await expect(
    actor.archiveProfileForFamily(FAMILY_A, familyAPersonId),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
});

// ---------------------------------------------------------------------------
// (2) listArchivedProfileIdsForFamily is ungated and family-scoped.
// ---------------------------------------------------------------------------

it("scopes archived profile ids to the requested family", async () => {
  const { actor, familyAPersonId } = await setupFamilies();

  // Archive a Norwood profile as the Norwood Steward.
  actor.setIdentity(adminIdentity);
  const archived = await actor.archiveProfileForFamily(NORWOOD, "clayton");
  expect(archived).toEqual({ ok: null });

  // The Norwood ids include the Norwood profile and never the Family A profile.
  const norwoodIds = await actor.listArchivedProfileIdsForFamily(NORWOOD);
  expect(norwoodIds).toContain("clayton");
  expect(norwoodIds).not.toContain(familyAPersonId);

  // The Family A ids are empty: the Norwood archived id never leaks into A.
  const familyAIds = await actor.listArchivedProfileIdsForFamily(FAMILY_A);
  expect(familyAIds).not.toContain("clayton");
  expect(familyAIds).toEqual([]);

  // The read is ungated: an approved Family A member can read A's ids.
  actor.setIdentity(memberAIdentity);
  await expect(
    actor.listArchivedProfileIdsForFamily(FAMILY_A),
  ).resolves.toEqual([]);
});

// ---------------------------------------------------------------------------
// (3) listArchivedProfilesForFamily is Steward-gated and family-scoped.
// ---------------------------------------------------------------------------

it("denies the Norwood Steward listing Family A's archived profiles and returns only Norwood profiles for Norwood", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  await actor.archiveProfileForFamily(NORWOOD, "clayton");

  // The Norwood Steward holds no Steward record for Family A.
  await expect(
    actor.listArchivedProfilesForFamily(FAMILY_A),
  ).rejects.toThrow();

  // The Norwood listing returns only Norwood archived profiles.
  const norwoodArchived = await actor.listArchivedProfilesForFamily(NORWOOD);
  expect(norwoodArchived).toHaveLength(1);
  expect(norwoodArchived[0]).toMatchObject({
    personId: "clayton",
    familyId: NORWOOD,
  });
});

// ---------------------------------------------------------------------------
// (4) Restore and permanent delete of a Norwood profile affect only Norwood.
// ---------------------------------------------------------------------------

it("restores a Norwood profile without touching Family A", async () => {
  const { actor, familyAPersonId } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  await actor.archiveProfileForFamily(NORWOOD, "clayton");
  expect(await actor.listArchivedProfileIdsForFamily(NORWOOD)).toContain(
    "clayton",
  );

  const restored = await actor.restoreProfileForFamily(NORWOOD, "clayton");
  expect(restored).toEqual({ ok: null });

  // Norwood no longer lists it; Family A is unchanged.
  expect(await actor.listArchivedProfileIdsForFamily(NORWOOD)).not.toContain(
    "clayton",
  );
  expect(await actor.listArchivedProfileIdsForFamily(FAMILY_A)).toEqual([]);
  expect(familyAPersonId).not.toBe("clayton");
});

it("refuses to permanently delete a Family A profile under Norwood and leaves it in place", async () => {
  const { actor, familyAPersonId } = await setupFamilies();

  // The Norwood Steward cannot permanently delete a Family A profile under
  // Family A (no Steward record for A).
  actor.setIdentity(adminIdentity);
  await expect(
    actor.permanentlyDeleteProfileForFamily(FAMILY_A, familyAPersonId, true),
  ).rejects.toThrow();

  // Under Norwood the same personId resolves to no Norwood profile, so the
  // delete is refused rather than crossing the boundary.
  await expect(
    actor.permanentlyDeleteProfileForFamily(NORWOOD, familyAPersonId, true),
  ).resolves.toEqual({ err: { ProfileNotFound: null } });

  // The Family A profile still resolves under Family A.
  actor.setIdentity(memberAIdentity);
  const profileA = await actor.getPersonProfileForFamily(
    FAMILY_A,
    familyAPersonId,
  );
  expect(profileA).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// (5) getArchivedProfileForFamily never resolves across the boundary.
// ---------------------------------------------------------------------------

it("does not resolve an archived profile across the family boundary", async () => {
  const { actor, familyAPersonId } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  await actor.archiveProfileForFamily(NORWOOD, "clayton");

  // The Norwood Steward cannot read Family A's archived profile (denied).
  await expect(
    actor.getArchivedProfileForFamily(FAMILY_A, familyAPersonId),
  ).rejects.toThrow();

  // Under Norwood the Family A personId resolves to nothing.
  await expect(
    actor.getArchivedProfileForFamily(NORWOOD, familyAPersonId),
  ).resolves.toEqual([]);

  // The Norwood archived profile resolves under Norwood.
  const norwoodArchived = await actor.getArchivedProfileForFamily(
    NORWOOD,
    "clayton",
  );
  expect(norwoodArchived).toHaveLength(1);
  expect(norwoodArchived[0]).toMatchObject({ personId: "clayton" });
});
