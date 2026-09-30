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
// Tenancy 1C — family-scoped duplicate review and merge (real-canister cover).
//
// The accepted change makes `listDuplicateCandidatesForFamily`,
// `notDuplicateForFamily`, `mergeProfilesForFamily`, and
// `resolveMergeConflictForFamily` the canonical paths, each taking an explicit
// `familyId` and filtering every profile lookup by it, and reduces the legacy
// no-familyId methods to thin DEFAULT_FAMILY_ID wrappers.
//
// The frontend suite mocks the actor and has no principals, so the per-caller
// authorization and the family-qualified profile lookups can only be asserted
// here. This file installs the app's own compiled wasm and drives the real
// public API. It asserts:
//
//   1. Duplicate matching for Norwood ignores Family A profiles: the Norwood
//      candidate listing returns the Norwood pair and never a Family A person.
//   2. The Norwood Steward cannot list Family A's duplicate candidates.
//   3. The Norwood Steward cannot merge profiles in Family A, and a merge that
//      names a Family A profile under Norwood is refused with #ProfileNotFound.
//   4. Merging two Norwood profiles changes only Norwood and leaves Family A
//      unchanged.
//   5. `notDuplicateForFamily` refuses a cross-family pair and is Steward-gated
//      for a non-default family.
//
// Coverage limit this file cannot close: there is no public endpoint that
// creates a Steward of a non-default family (`claimSteward` and
// `promoteToSteward` both write `familyId = "norwood"`), so "a Steward of
// Family A cannot merge an A profile with a B profile" is exercised in the
// direction the API supports: the Norwood Steward cannot merge in Family A, and
// a merge naming a Family A profile under Norwood is refused. The internal
// `isActiveStewardForFamily` predicate is covered by the sibling
// `family-scoped-authorization.behavior.test.ts`.
//
// The legacy default-family wrappers are covered by the sibling
// `governance-removal-archive-duplicate-legacy-wrapper.cover.test.ts`.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";
const NORWOOD = "norwood";

const STEWARD_MARKER =
  "Unauthorized: Only Family Stewards can list duplicate candidates";

let pic: PocketIc | undefined;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
});

afterAll(async () => {
  await pic?.tearDown();
});

// Fresh identities for the duplicate pairs. Each identity owns exactly one
// profile, so `createMyselfForFamily` can be called once per identity.
const norwoodDupAIdentity = createIdentity("dup-norwood-a-seed");
const norwoodDupBIdentity = createIdentity("dup-norwood-b-seed");
const familyADupAIdentity = createIdentity("dup-family-a-a-seed");
const familyADupBIdentity = createIdentity("dup-family-a-b-seed");

interface Seeded {
  actor: _SERVICE;
  canisterId: ReturnType<typeof createIdentity>["getPrincipal"];
  /** The two same-named Norwood profiles (a duplicate candidate pair). */
  norwoodPair: [string, string];
  /** The two same-named Family A profiles (a duplicate candidate pair). */
  familyAPair: [string, string];
}

/**
 * Creates a populated profile in `familyId` for the given identity and returns
 * its personId. The profile is deliberately non-sparse (four populated fields)
 * and shares its name and birth date with its pair, so the two are a duplicate
 * candidate.
 */
async function createPopulatedProfileForFamily(
  actor: _SERVICE,
  identity: ReturnType<typeof createIdentity>,
  familyId: string,
  name: string,
): Promise<string> {
  actor.setIdentity(identity);
  await actor._initialize_access_control();
  const created = await actor.createMyselfForFamily(familyId, name);
  if (!("ok" in created)) {
    throw new Error(`createMyselfForFamily failed for ${familyId}`);
  }
  const personId = created.ok.personId;
  await actor.updateOwnProfileForFamily(familyId, personId, {
    preferredName: [],
    firstName: ["Duplicate"],
    middleName: [],
    lastName: ["Person"],
    suffix: [],
    nickname: [],
    birthDate: ["1900"],
    birthplace: ["Norwood"],
    currentLocation: [],
    occupation: [],
    livingStatus: [],
    shortBio: [],
    longerStory: [],
    story: [],
    birthInfo: [],
    timeline: [],
    privacySettings: [],
  });
  return personId;
}

/**
 * A fresh canister with the Norwood Steward bootstrapped, an approved Norwood
 * contributor, a same-named Norwood duplicate pair, and a same-named Family A
 * duplicate pair. Each test seeds its own canister so no test depends on the
 * order another ran in.
 */
async function setupFamilies(): Promise<Seeded> {
  const setup = await pic!.setupCanister<_SERVICE>({
    idlFactory,
    wasm: BACKEND_WASM,
  });
  const actor = setup.actor;

  await registerApprovedContributor(actor);

  // Person ids are derived from the profile name and are global, not
  // family-qualified, so each family's pair uses a distinct name to keep the
  // two families' person ids disjoint.
  const norwoodA = await createPopulatedProfileForFamily(
    actor,
    norwoodDupAIdentity,
    NORWOOD,
    "Norwood Duplicate",
  );
  const norwoodB = await createPopulatedProfileForFamily(
    actor,
    norwoodDupBIdentity,
    NORWOOD,
    "Norwood Duplicate",
  );
  const familyAA = await createPopulatedProfileForFamily(
    actor,
    familyADupAIdentity,
    FAMILY_A,
    "Family A Duplicate",
  );
  const familyAB = await createPopulatedProfileForFamily(
    actor,
    familyADupBIdentity,
    FAMILY_A,
    "Family A Duplicate",
  );

  return {
    actor,
    canisterId: setup.canisterId,
    norwoodPair: [norwoodA, norwoodB],
    familyAPair: [familyAA, familyAB],
  };
}

// ---------------------------------------------------------------------------
// (1) Duplicate matching for Norwood ignores Family A profiles.
// ---------------------------------------------------------------------------

it("returns the Norwood duplicate pair and never a Family A profile", async () => {
  const { actor, norwoodPair, familyAPair } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  const candidates = await actor.listDuplicateCandidatesForFamily(NORWOOD);

  // The Norwood pair is flagged.
  const norwoodIds = new Set(norwoodPair);
  const flagged = candidates.filter(
    (c) =>
      norwoodIds.has(c.candidateA.personId) &&
      norwoodIds.has(c.candidateB.personId),
  );
  expect(flagged).toHaveLength(1);

  // No candidate references a Family A profile.
  const familyAIds = new Set(familyAPair);
  for (const candidate of candidates) {
    expect(familyAIds.has(candidate.candidateA.personId)).toBe(false);
    expect(familyAIds.has(candidate.candidateB.personId)).toBe(false);
  }
});

// ---------------------------------------------------------------------------
// (2) The Norwood Steward cannot list Family A's duplicate candidates.
// ---------------------------------------------------------------------------

it("denies the Norwood Steward listing Family A's duplicate candidates", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  await expect(
    actor.listDuplicateCandidatesForFamily(FAMILY_A),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
});

// ---------------------------------------------------------------------------
// (3) A merge never crosses the family boundary.
// ---------------------------------------------------------------------------

it("denies the Norwood Steward merging profiles in Family A", async () => {
  const { actor, familyAPair } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  await expect(
    actor.mergeProfilesForFamily(FAMILY_A, familyAPair[0], familyAPair[1]),
  ).rejects.toThrow();

  // Neither Family A profile was archived by the denied attempt.
  const archivedIdsA = await actor.listArchivedProfileIdsForFamily(FAMILY_A);
  expect(archivedIdsA).toEqual([]);
});

it("refuses a Norwood merge that names a Family A profile", async () => {
  const { actor, norwoodPair, familyAPair } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  // The canonical profile is a Norwood profile; the merged-away profile is a
  // Family A profile. The family-qualified lookup finds no such Norwood profile,
  // so the merge is refused rather than crossing the boundary.
  await expect(
    actor.mergeProfilesForFamily(NORWOOD, norwoodPair[0], familyAPair[0]),
  ).resolves.toEqual({ err: { ProfileNotFound: null } });

  // The Family A profile is untouched and still resolves under Family A.
  actor.setIdentity(familyADupAIdentity);
  const profileA = await actor.getPersonProfileForFamily(
    FAMILY_A,
    familyAPair[0],
  );
  expect(profileA).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// (4) Merging two Norwood profiles leaves Family A unchanged.
// ---------------------------------------------------------------------------

it("merges two Norwood profiles and leaves Family A unchanged", async () => {
  const { actor, norwoodPair, familyAPair } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  const merged = await actor.mergeProfilesForFamily(
    NORWOOD,
    norwoodPair[0],
    norwoodPair[1],
  );
  expect(merged).toEqual({
    ok: expect.objectContaining({
      canonicalPersonId: norwoodPair[0],
      archivedPersonId: norwoodPair[1],
    }),
  });

  // The merged-away Norwood profile is archived; the Family A profiles are not.
  const norwoodArchived = await actor.listArchivedProfileIdsForFamily(NORWOOD);
  expect(norwoodArchived).toContain(norwoodPair[1]);
  expect(norwoodArchived).not.toContain(familyAPair[0]);
  expect(norwoodArchived).not.toContain(familyAPair[1]);

  const familyAArchived = await actor.listArchivedProfileIdsForFamily(FAMILY_A);
  expect(familyAArchived).toEqual([]);

  // Both Family A profiles still resolve under Family A.
  actor.setIdentity(familyADupAIdentity);
  const profileA0 = await actor.getPersonProfileForFamily(
    FAMILY_A,
    familyAPair[0],
  );
  expect(profileA0).toHaveLength(1);
  actor.setIdentity(familyADupBIdentity);
  const profileA1 = await actor.getPersonProfileForFamily(
    FAMILY_A,
    familyAPair[1],
  );
  expect(profileA1).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// (5) notDuplicateForFamily refuses a cross-family pair and is Steward-gated.
// ---------------------------------------------------------------------------

it("refuses a cross-family notDuplicate pair and denies a non-Steward", async () => {
  const { actor, norwoodPair, familyAPair } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  // A Norwood profile and a Family A profile: the Family A profile does not
  // belong to Norwood, so the pair is refused.
  await expect(
    actor.notDuplicateForFamily(NORWOOD, norwoodPair[0], familyAPair[0]),
  ).resolves.toEqual({ err: { ProfileNotFound: null } });

  // The Norwood Steward cannot review duplicates in Family A.
  await expect(
    actor.notDuplicateForFamily(FAMILY_A, familyAPair[0], familyAPair[1]),
  ).rejects.toThrow();

  // An approved Family A member who is not a Steward cannot review duplicates
  // in Family A either.
  actor.setIdentity(familyADupAIdentity);
  await expect(
    actor.notDuplicateForFamily(FAMILY_A, familyAPair[0], familyAPair[1]),
  ).rejects.toThrow();
});
