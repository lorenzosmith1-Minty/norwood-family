import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";
import { BACKEND_WASM } from "./lane-helpers";

// ---------------------------------------------------------------------------
// Cover for the multi-family photo-isolation fix.
//
// Two backend helpers used to resolve a person profile by the BARE personId
// instead of the family-qualified key:
//
//   - `canManagePersonPhotosForFamily` (lib/family-authorization.mo) looked up
//     `profiles.get(personId)`, so for a non-default family it never found the
//     profile stored under `familyId + "::" + personId` and denied every photo
//     mutation — including the family's own founder/Steward.
//   - `isUnclaimedProfileForFamily` (mixins/object-storage-api.mo) did the same
//     bare lookup, so a CLAIMED profile in a non-default family was treated as
//     unclaimed and its portrait leaked to anonymous guests.
//
// Both now go through `TenancyLib.getProfileForFamily(profiles, familyId,
// personId)`. These rules live in the PocketIC lane because the frontend suite
// mocks the actor and has no principals at all. Every assertion below drives the
// real canister through its public API.
//
// The default Norwood family keeps the legacy bare key, so the bug only
// manifests for a NON-DEFAULT family. Each test creates its own freshly created
// family (never hard-coding "norwood") and its own deterministic identities.
//
// Coverage limits this file cannot close (recorded in the episode):
//
//   - The frontend suite mocks the actor entirely; this file is the only place
//     the family-qualified photo lookup is exercised against real storage.
//   - The legacy single-family wrappers (`addPhoto`, `getProfilePhoto`) are not
//     re-tested here; they delegate to the family-scoped helpers with the
//     default family id and are covered by photo-authorization.cover.test.ts.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

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
// and every read is family-scoped, so the tests do not interfere.
let shared: Seeded | undefined;

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

/**
 * Creates a non-default family as `founder`, accepts founding Stewardship so the
 * founder is an active Steward of that family, and returns the family id and the
 * founder's personId in it. The founder profile is `#Claimed` by the founder and
 * stored under the family-qualified key.
 *
 * `firstName`/`lastName` are parameters because the founder personId is derived
 * from them: two families created with the same name would produce the same
 * personId, which would make a cross-family test accidentally target the
 * caller's own profile.
 */
async function createStewardedFamily(
  actor: _SERVICE,
  founder: ReturnType<typeof createIdentity>,
  displayName: string,
  key: string,
  firstName: string,
  lastName: string,
): Promise<{ familyId: string; founderPersonId: string }> {
  actor.setIdentity(founder);
  const created = ok(
    await actor.createFamilyWithFounder(displayName, founderInput(firstName, lastName), key),
  );
  ok(await actor.acceptFoundingStewardship(created.family.id));
  return { familyId: created.family.id, founderPersonId: created.founderProfile.personId };
}

const blob = new Uint8Array([1, 2, 3, 4]);

// ---------------------------------------------------------------------------
// 1. A Steward of a non-default family can add a photo to a claimed profile in
//    that family. This pins the `canManagePersonPhotosForFamily` fix: the bare
//    lookup missed the family-qualified profile and denied the family's own
//    Steward.
// ---------------------------------------------------------------------------

it("lets a Steward of a non-default family add a photo to a claimed profile in that family", async () => {
  const { actor } = await setup();
  const founder = createIdentity("photo-scope-steward-add-seed");
  const { familyId, founderPersonId } = await createStewardedFamily(
    actor,
    founder,
    "Photo Scope Add Family",
    "photo-scope-add-key",
    "Add",
    "Founder",
  );

  actor.setIdentity(founder);
  const added = await actor.addPhotoForFamily(
    familyId,
    founderPersonId,
    "founder.png",
    "image/png",
    blob,
  );
  expect(added).toMatchObject({ filename: "founder.png", mimeType: "image/png" });

  // The photo is stored in the family's gallery and readable by the Steward.
  const listed = await actor.listPhotosForFamily(familyId, founderPersonId);
  expect(listed.map((p) => p.filename)).toEqual(["founder.png"]);
});

// ---------------------------------------------------------------------------
// 2. A claimed profile's portrait in a non-default family is NOT public. This
//    pins the `isUnclaimedProfileForFamily` fix: the bare lookup missed the
//    family-qualified profile, treated it as unclaimed, and leaked the portrait
//    to an anonymous guest.
// ---------------------------------------------------------------------------

it("does not leak a claimed profile's portrait in a non-default family to an anonymous guest", async () => {
  const { actor, canisterId } = await setup();
  const founder = createIdentity("photo-scope-leak-seed");
  const { familyId, founderPersonId } = await createStewardedFamily(
    actor,
    founder,
    "Photo Scope Leak Family",
    "photo-scope-leak-key",
    "Leak",
    "Founder",
  );

  // The Steward seeds a portrait on their own claimed profile.
  actor.setIdentity(founder);
  const photo = await actor.addPhotoForFamily(
    familyId,
    founderPersonId,
    "founder.png",
    "image/png",
    blob,
  );
  await actor.setProfilePhotoForFamily(familyId, founderPersonId, photo.id);

  // An anonymous guest must NOT be able to read the claimed profile's portrait.
  const anonymous = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  await expect(anonymous.getProfilePhotoForFamily(familyId, founderPersonId)).rejects.toThrow();

  // The Steward can still read it.
  actor.setIdentity(founder);
  const readable = await actor.getProfilePhotoForFamily(familyId, founderPersonId);
  expect(readable).toEqual([expect.objectContaining({ filename: "founder.png" })]);
});

// ---------------------------------------------------------------------------
// 3. A Steward of Family B cannot mutate a Family A profile. The two founders
//    have distinct names, so their personIds differ and the cross-family call
//    cannot accidentally target the caller's own profile. This pins the
//    cross-family boundary on the family-scoped photo mutation path.
// ---------------------------------------------------------------------------

it("does not let a Steward of Family B mutate a Family A profile", async () => {
  const { actor } = await setup();
  const founderA = createIdentity("photo-scope-cross-a-seed");
  const founderB = createIdentity("photo-scope-cross-b-seed");

  const familyA = await createStewardedFamily(
    actor,
    founderA,
    "Photo Cross A",
    "photo-cross-a-key",
    "Alpha",
    "Founder",
  );
  const familyB = await createStewardedFamily(
    actor,
    founderB,
    "Photo Cross B",
    "photo-cross-b-key",
    "Bravo",
    "Founder",
  );

  // The two families' founder personIds are genuinely different, so the
  // cross-family call below targets a profile that does not exist in Family B.
  expect(familyA.founderPersonId).not.toBe(familyB.founderPersonId);

  // Founder B is a Steward of Family B only, and tries to add a photo to
  // Family A's founder profile using Family B's id.
  actor.setIdentity(founderB);
  await expect(
    actor.addPhotoForFamily(familyB.familyId, familyA.founderPersonId, "intruder.png", "image/png", blob),
  ).rejects.toThrow();

  // Family A's gallery is untouched by the rejected cross-family mutation.
  actor.setIdentity(founderA);
  const listed = await actor.listPhotosForFamily(familyA.familyId, familyA.founderPersonId);
  expect(listed).toEqual([]);
});

// ---------------------------------------------------------------------------
// 4. A Family A portrait never surfaces under Family B. This pins the read side
//    of the same boundary: a claimed Family A profile's portrait is not
//    discoverable through Family B's id, even for a Family B Steward.
// ---------------------------------------------------------------------------

it("does not surface a Family A portrait under Family B", async () => {
  const { actor } = await setup();
  const founderA = createIdentity("photo-scope-read-cross-a-seed");
  const founderB = createIdentity("photo-scope-read-cross-b-seed");

  const familyA = await createStewardedFamily(
    actor,
    founderA,
    "Photo Read Cross A",
    "photo-read-cross-a-key",
    "Charlie",
    "Founder",
  );
  const familyB = await createStewardedFamily(
    actor,
    founderB,
    "Photo Read Cross B",
    "photo-read-cross-b-key",
    "Delta",
    "Founder",
  );

  // Family A's Steward seeds a portrait on their own claimed profile.
  actor.setIdentity(founderA);
  const photo = await actor.addPhotoForFamily(
    familyA.familyId,
    familyA.founderPersonId,
    "alpha.png",
    "image/png",
    blob,
  );
  await actor.setProfilePhotoForFamily(familyA.familyId, familyA.founderPersonId, photo.id);

  // Family B's Steward reads Family A's personId under Family B: the
  // family-qualified lookup finds no such profile in Family B, so no Family A
  // portrait is returned.
  actor.setIdentity(founderB);
  const crossRead = await actor.getProfilePhotoForFamily(familyB.familyId, familyA.founderPersonId);
  expect(crossRead).toEqual([]);

  // Family A's own Steward still reads the portrait.
  actor.setIdentity(founderA);
  const ownRead = await actor.getProfilePhotoForFamily(familyA.familyId, familyA.founderPersonId);
  expect(ownRead).toEqual([expect.objectContaining({ filename: "alpha.png" })]);
});
