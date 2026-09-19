import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";

// ---------------------------------------------------------------------------
// Cover for the photo-authorization hardening change.
//
// The change restricts addPhoto / setProfilePhoto / removePhoto to the approved
// OWNER of a claimed profile, or a Family Steward acting on an
// unclaimed/historical profile. It restricts listPhotos to approved family
// membership or a Steward, and keeps getProfilePhoto public only for
// unclaimed/historical profiles.
//
// These rules live in the PocketIC lane because the frontend suite mocks the
// actor and has no principals at all. Every assertion below drives the real
// canister through its public API.
//
// The canister is seeded once per test group:
//   - STEWARD is the first caller to _initialize_access_control, so STEWARD is
//     the Family Steward (#admin).
//   - MEMBER claims the seeded living, unclaimed 'clayton' profile and STEWARD
//     approves it, so MEMBER is an approved family member who owns 'clayton'.
//   - OWNER claims the seeded living, unclaimed 'elbert' profile and STEWARD
//     approves it, so OWNER is an approved owner of a claimed profile that is
//     NOT 'clayton'.
//   - 'julia' is seeded #Unclaimed (deceased), the unclaimed/historical case.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";
const BACKEND_WASM = process.env.BACKEND_WASM ?? "";

let pic: PocketIc | undefined;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
});

afterAll(async () => {
  await pic?.tearDown();
});

const stewardIdentity = createIdentity("photo-auth-steward-seed");
const memberIdentity = createIdentity("photo-auth-member-seed");
const ownerIdentity = createIdentity("photo-auth-owner-seed");

const blob = new Uint8Array([1, 2, 3, 4]);

// The canister id type, derived from the identity helper rather than importing
// `Principal` directly: `@icp-sdk/core` is a frontend-package dependency and a
// bare import of it from `app/test/` does not resolve in the lane.
type CanisterId = ReturnType<ReturnType<typeof createIdentity>["getPrincipal"]>;

interface SeededCanister {
  actor: _SERVICE;
  canisterId: CanisterId;
  /** The personId of the claimed profile OWNER owns. */
  ownedPersonId: string;
}

/**
 * Installs a fresh canister and seeds the three roles described above. Each
 * test group gets its own canister so the photo state one test writes never
 * leaks into another's assertions.
 */
async function seedCanister(): Promise<SeededCanister> {
  const setup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const actor = setup.actor;

  // STEWARD is the first caller to _initialize_access_control, so STEWARD
  // becomes the Family Steward. Every other caller must also register (the real
  // app registers every signed-in user through the Internet Identity sign-in
  // flow) before the access-control-gated methods will serve them.
  actor.setIdentity(stewardIdentity);
  await actor._initialize_access_control();
  // Steward authority is a separate, explicit bootstrap: the first caller is
  // #admin, but only `claimSteward` grants the canonical Steward powers that
  // the approvals below require.
  await actor.claimSteward();

  // MEMBER registers, then claims the seeded living, unclaimed 'clayton'
  // profile; STEWARD approves it, making MEMBER an approved family member who
  // owns 'clayton'.
  actor.setIdentity(memberIdentity);
  await actor._initialize_access_control();
  const claim = (await actor.requestProfileClaim("clayton")) as {
    ok: { id: bigint };
  };
  actor.setIdentity(stewardIdentity);
  await actor.approveProfileClaim(claim.ok.id);

  // OWNER registers, then claims the seeded living, unclaimed 'elbert' profile;
  // STEWARD approves it, making OWNER the approved owner of a claimed profile
  // that is not 'clayton'.
  actor.setIdentity(ownerIdentity);
  await actor._initialize_access_control();
  const ownerClaim = (await actor.requestProfileClaim("elbert")) as {
    ok: { id: bigint };
  };
  actor.setIdentity(stewardIdentity);
  await actor.approveProfileClaim(ownerClaim.ok.id);

  return { actor, canisterId: setup.canisterId, ownedPersonId: "elbert" };
}

// ---------------------------------------------------------------------------
// 1. The approved owner of a claimed profile can add, set, and remove photos on
//    their own profile.
// ---------------------------------------------------------------------------

it("allows the approved owner of a claimed profile to add, set, and remove photos", async () => {
  const { actor, ownedPersonId } = await seedCanister();
  actor.setIdentity(ownerIdentity);

  const added = await actor.addPhoto(ownedPersonId, "owner-1.png", "image/png", blob);
  expect(added).toMatchObject({ filename: "owner-1.png", mimeType: "image/png" });

  const second = await actor.addPhoto(ownedPersonId, "owner-2.png", "image/png", blob);
  expect(second).toMatchObject({ filename: "owner-2.png" });

  // The owner can select either of their own photos as the profile photo.
  const selected = await actor.setProfilePhoto(ownedPersonId, second.id);
  expect(selected).toEqual([expect.objectContaining({ id: second.id })]);

  // The owner can remove a photo from their own gallery.
  await expect(actor.removePhoto(ownedPersonId, added.id)).resolves.toBe(true);
  const remaining = await actor.listPhotos(ownedPersonId);
  expect(remaining.map((p) => p.id)).toEqual([second.id]);
});

// ---------------------------------------------------------------------------
// 2. An approved family member who is NOT the owner of a claimed profile is
//    rejected on add, set, and remove.
// ---------------------------------------------------------------------------

it("rejects an approved non-owner on add, set, and remove for another claimed profile", async () => {
  const { actor, ownedPersonId } = await seedCanister();

  // The owner seeds a photo so set/remove have a real target.
  actor.setIdentity(ownerIdentity);
  const photo = await actor.addPhoto(ownedPersonId, "owner.png", "image/png", blob);

  // MEMBER is an approved family member (via the approved 'clayton' claim) but
  // does NOT own OWNER's claimed profile.
  actor.setIdentity(memberIdentity);
  await expect(
    actor.addPhoto(ownedPersonId, "intruder.png", "image/png", blob),
  ).rejects.toThrow();
  await expect(actor.setProfilePhoto(ownedPersonId, photo.id)).rejects.toThrow();
  await expect(actor.removePhoto(ownedPersonId, photo.id)).rejects.toThrow();

  // The rejected mutations left the owner's gallery untouched.
  actor.setIdentity(ownerIdentity);
  const listed = await actor.listPhotos(ownedPersonId);
  expect(listed.map((p) => p.filename)).toEqual(["owner.png"]);
});

// ---------------------------------------------------------------------------
// 3. A Family Steward can add, set, and remove photos on an unclaimed/historical
//    profile.
// ---------------------------------------------------------------------------

it("allows a Family Steward to add, set, and remove photos on an unclaimed profile", async () => {
  const { actor } = await seedCanister();
  actor.setIdentity(stewardIdentity);

  // 'julia' is seeded #Unclaimed (deceased) — the unclaimed/historical case.
  const added = await actor.addPhoto("julia", "julia-1.png", "image/png", blob);
  expect(added).toMatchObject({ filename: "julia-1.png" });

  const second = await actor.addPhoto("julia", "julia-2.png", "image/png", blob);
  const selected = await actor.setProfilePhoto("julia", second.id);
  expect(selected).toEqual([expect.objectContaining({ id: second.id })]);

  await expect(actor.removePhoto("julia", added.id)).resolves.toBe(true);
  const remaining = await actor.listPhotos("julia");
  expect(remaining.map((p) => p.id)).toEqual([second.id]);
});

// ---------------------------------------------------------------------------
// 4. A Family Steward is rejected when attempting to modify a claimed profile
//    owned by another user.
// ---------------------------------------------------------------------------

it("rejects a Family Steward on a claimed profile owned by another user", async () => {
  const { actor, ownedPersonId } = await seedCanister();

  actor.setIdentity(ownerIdentity);
  const photo = await actor.addPhoto(ownedPersonId, "owner.png", "image/png", blob);

  // STEWARD is the Family Steward, but OWNER's profile is claimed by OWNER.
  actor.setIdentity(stewardIdentity);
  await expect(
    actor.addPhoto(ownedPersonId, "steward.png", "image/png", blob),
  ).rejects.toThrow();
  await expect(actor.setProfilePhoto(ownedPersonId, photo.id)).rejects.toThrow();
  await expect(actor.removePhoto(ownedPersonId, photo.id)).rejects.toThrow();

  // The owner's gallery is unchanged by the rejected steward mutations.
  actor.setIdentity(ownerIdentity);
  const listed = await actor.listPhotos(ownedPersonId);
  expect(listed.map((p) => p.filename)).toEqual(["owner.png"]);
});

// ---------------------------------------------------------------------------
// 5. Anonymous callers are rejected on all three mutation methods.
// ---------------------------------------------------------------------------

it("rejects an anonymous caller on add, set, and remove", async () => {
  const { actor, canisterId, ownedPersonId } = await seedCanister();

  // Seed a real photo as the owner so set/remove have a target.
  actor.setIdentity(ownerIdentity);
  const photo = await actor.addPhoto(ownedPersonId, "owner.png", "image/png", blob);

  // A fresh actor defaults to the anonymous caller.
  const anonymous = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  await expect(
    anonymous.addPhoto(ownedPersonId, "anon.png", "image/png", blob),
  ).rejects.toThrow();
  await expect(anonymous.setProfilePhoto(ownedPersonId, photo.id)).rejects.toThrow();
  await expect(anonymous.removePhoto(ownedPersonId, photo.id)).rejects.toThrow();
});

// ---------------------------------------------------------------------------
// 6. listPhotos returns the full gallery only to an approved family member or a
//    Steward; anonymous callers are rejected.
// ---------------------------------------------------------------------------

it("rejects an anonymous caller on listPhotos and returns no gallery", async () => {
  const { actor, canisterId, ownedPersonId } = await seedCanister();

  actor.setIdentity(ownerIdentity);
  await actor.addPhoto(ownedPersonId, "owner.png", "image/png", blob);

  const anonymous = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  await expect(anonymous.listPhotos(ownedPersonId)).rejects.toThrow();
});

// ---------------------------------------------------------------------------
// 7. Any approved family member may view the full gallery of any person
//    profile, including other claimed people.
// ---------------------------------------------------------------------------

it("lets an approved family member list the full gallery of any person profile", async () => {
  const { actor, ownedPersonId } = await seedCanister();

  // The owner seeds two photos on their own claimed profile.
  actor.setIdentity(ownerIdentity);
  await actor.addPhoto(ownedPersonId, "owner-1.png", "image/png", blob);
  await actor.addPhoto(ownedPersonId, "owner-2.png", "image/png", blob);

  // MEMBER is an approved family member who does not own this profile, but may
  // still view the full gallery.
  actor.setIdentity(memberIdentity);
  const listed = await actor.listPhotos(ownedPersonId);
  expect(listed.map((p) => p.filename)).toEqual(["owner-1.png", "owner-2.png"]);

  // The Steward may view it too.
  actor.setIdentity(stewardIdentity);
  const stewardListed = await actor.listPhotos(ownedPersonId);
  expect(stewardListed).toHaveLength(2);
});

// ---------------------------------------------------------------------------
// 8. getProfilePhoto for an unclaimed/historical profile remains readable by
//    guests.
// ---------------------------------------------------------------------------

it("keeps getProfilePhoto readable by an anonymous guest for an unclaimed profile", async () => {
  const { actor, canisterId } = await seedCanister();

  // The Steward seeds a profile photo on the unclaimed 'julia' profile.
  actor.setIdentity(stewardIdentity);
  await actor.addPhoto("julia", "julia.png", "image/png", blob);

  // An anonymous guest can still read the single designated portrait.
  const anonymous = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  const profile = await anonymous.getProfilePhoto("julia");
  expect(profile).toEqual([expect.objectContaining({ filename: "julia.png" })]);
});

// ---------------------------------------------------------------------------
// 9. getProfilePhoto for a claimed profile is readable only by approved family
//    members or a Steward.
// ---------------------------------------------------------------------------

it("rejects an anonymous caller on getProfilePhoto for a claimed profile", async () => {
  const { actor, canisterId, ownedPersonId } = await seedCanister();

  actor.setIdentity(ownerIdentity);
  await actor.addPhoto(ownedPersonId, "owner.png", "image/png", blob);

  const anonymous = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  await expect(anonymous.getProfilePhoto(ownedPersonId)).rejects.toThrow();
});

it("lets an approved family member read getProfilePhoto for a claimed profile", async () => {
  const { actor, ownedPersonId } = await seedCanister();

  actor.setIdentity(ownerIdentity);
  await actor.addPhoto(ownedPersonId, "owner.png", "image/png", blob);

  // MEMBER is an approved family member who does not own this profile.
  actor.setIdentity(memberIdentity);
  const profile = await actor.getProfilePhoto(ownedPersonId);
  expect(profile).toEqual([expect.objectContaining({ filename: "owner.png" })]);
});
