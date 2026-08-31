import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";

const PIC_URL = process.env.POCKET_IC_URL ?? "";
const BACKEND_WASM = process.env.BACKEND_WASM ?? "";

let pic: PocketIc | undefined;
let actor: _SERVICE;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let canisterId: any;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
  const setup = await pic.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  actor = setup.actor;
  canisterId = setup.canisterId;
});

afterAll(async () => {
  await pic?.tearDown();
});

it("answers an empty-state read instead of trapping", async () => {
  // The OQL schema is a query that should resolve on a fresh canister.
  await expect(actor.schema()).resolves.toBeTypeOf("string");
});

it("reports the anonymous caller is not an admin", async () => {
  await expect(actor.isCallerAdmin()).resolves.toBe(false);
});

it("reports the anonymous caller's default role without trapping", async () => {
  // getCallerUserRole returns a UserRole variant; asserting it does not trap is
  // the high-signal check that the access-control mixin is wired up.
  await expect(actor.getCallerUserRole()).resolves.toBeDefined();
});

// Characterization baseline for the existing photo workflow before the archive
// feature is added. The archive feature will add new contribution methods but
// must not change the existing per-person photo gallery API, so the full
// add -> list -> set profile -> get profile -> remove round-trip is frozen here
// against the real canister.
it("round-trips a photo through the real canister", async () => {
  const personId = "julia";
  const blob = new Uint8Array([1, 2, 3, 4]);

  // Empty-state read before anything is uploaded.
  await expect(actor.listPhotos(personId)).resolves.toEqual([]);
  await expect(actor.getProfilePhoto(personId)).resolves.toEqual([]);

  // Add a photo; the first photo becomes the profile photo automatically.
  const photo = await actor.addPhoto(personId, "julia-1.png", "image/png", blob);
  expect(photo.filename).toBe("julia-1.png");
  expect(photo.mimeType).toBe("image/png");
  expect(photo.id).toBe(0n);

  const listed = await actor.listPhotos(personId);
  expect(listed).toHaveLength(1);
  expect(listed[0]).toMatchObject({ id: 0n, filename: "julia-1.png" });

  // The first uploaded photo is auto-set as the profile photo.
  const profile = await actor.getProfilePhoto(personId);
  expect(profile).toEqual([expect.objectContaining({ id: 0n })]);

  // Removing the photo clears the gallery and the profile photo.
  await expect(actor.removePhoto(personId, 0n)).resolves.toBe(true);
  await expect(actor.listPhotos(personId)).resolves.toEqual([]);
  await expect(actor.getProfilePhoto(personId)).resolves.toEqual([]);
});

// ---------------------------------------------------------------------------
// Archive contribution and admin-approval flow (cover for the archive feature).
// ---------------------------------------------------------------------------

// A non-anonymous contributor and an admin, distinct from the anonymous caller
// the actor uses by default. Deterministic identities let us switch the caller
// via setIdentity without importing a Principal constructor directly.
const adminIdentity = createIdentity("archive-admin-seed");
const contributorIdentity = createIdentity("archive-contributor-seed");
const ADMIN = adminIdentity.getPrincipal();
const CONTRIBUTOR = contributorIdentity.getPrincipal();

const blob = new Uint8Array([10, 20, 30]);

// Registers ADMIN as the first caller (the first-admin rule makes it #admin)
// and CONTRIBUTOR as a regular #user, so the role-guarded archive methods can
// be exercised against the real canister.
async function registerRoles(): Promise<void> {
  actor.setIdentity(adminIdentity);
  await actor._initialize_access_control();
  actor.setIdentity(contributorIdentity);
  await actor._initialize_access_control();
}

async function submitAsContributor(): Promise<bigint> {
  actor.setIdentity(contributorIdentity);
  const item = await actor.submitArchiveItem(
    "A family letter",
    "A letter from 1924.",
    { Document: null },
    blob,
    "1924",
    [1924n],
    ["letters"],
    ["julia"],
    ["branch-1"],
    { Original: null },
    { FamilyOnly: null },
  );
  return item.id;
}

it("rejects an anonymous submitArchiveItem call instead of trapping silently", async () => {
  // A fresh actor defaults to the anonymous caller, so no identity is set.
  const anonymousActor = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  await expect(
    anonymousActor.submitArchiveItem(
      "No author",
      "Anonymous must not be able to contribute.",
      { Photo: null },
      blob,
      "1920s",
      [],
      [],
      [],
      [],
      { Original: null },
      { Public: null },
    ),
  ).rejects.toThrow();
});

it("round-trips a contribution through submit -> pending -> approve -> approved", async () => {
  await registerRoles();

  // Empty-state reads before anything is submitted.
  await expect(actor.listApprovedArchiveItems()).resolves.toEqual([]);

  // A signed-in contributor submits; the item lands in pending state.
  const id = await submitAsContributor();
  // Not yet part of the archive (readable by any caller).
  await expect(actor.listApprovedArchiveItems()).resolves.toEqual([]);

  // An admin lists the pending item and approves it, moving it into the archive.
  actor.setIdentity(adminIdentity);
  const pending = await actor.listPendingArchiveItems();
  expect(pending).toHaveLength(1);
  expect(pending[0]).toMatchObject({
    id,
    title: "A family letter",
    itemType: { Document: null },
    status: { Pending: null },
    contributor: CONTRIBUTOR,
  });
  const approved = await actor.approveArchiveItem(id);
  expect(approved).toEqual([
    expect.objectContaining({ id, status: { Approved: null } }),
  ]);
  await expect(actor.listPendingArchiveItems()).resolves.toEqual([]);
  const archive = await actor.listApprovedArchiveItems();
  expect(archive).toHaveLength(1);
  expect(archive[0]).toMatchObject({ id, status: { Approved: null } });
});

it("rejects a pending contribution, excluding it from the archive", async () => {
  await registerRoles();
  const id = await submitAsContributor();

  actor.setIdentity(adminIdentity);
  const rejected = await actor.rejectArchiveItem(id);
  expect(rejected).toEqual([
    expect.objectContaining({ id, status: { Rejected: null } }),
  ]);
  // The rejected item is no longer pending and is not part of the archive.
  // (The canister is shared across tests, so other items may exist.)
  const pending = await actor.listPendingArchiveItems();
  expect(pending.find((i) => i.id === id)).toBeUndefined();
  const approved = await actor.listApprovedArchiveItems();
  expect(approved.find((i) => i.id === id)).toBeUndefined();
});

it("does not let a non-admin list or approve pending contributions", async () => {
  await registerRoles();
  await submitAsContributor();

  // A signed-in non-admin cannot list pending items.
  actor.setIdentity(contributorIdentity);
  await expect(actor.listPendingArchiveItems()).rejects.toThrow();
  await expect(actor.approveArchiveItem(0n)).rejects.toThrow();
  await expect(actor.rejectArchiveItem(0n)).rejects.toThrow();
});
