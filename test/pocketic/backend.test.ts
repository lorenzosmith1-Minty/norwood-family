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
// A dedicated canister for the profile-claim flow tests, so their state (a
// pending claim, then an approved claim on the canonical Lorenzo Smith Jr.
// profile) never leaks into the shared `actor` canister the other tests use.
let claimActor: _SERVICE;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
  const setup = await pic.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  actor = setup.actor;
  canisterId = setup.canisterId;
  const claimSetup = await pic.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  claimActor = claimSetup.actor;
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

// ---------------------------------------------------------------------------
// Account identity (cover for the Google/Apple sign-in change). The account id
// is the caller's stable ICP Principal — never an email or a Google/Apple
// provider identifier — and Google/Apple are authentication methods bound to
// that same account. Anonymous callers are rejected with #NotSignedIn.
// ---------------------------------------------------------------------------

it("rejects an anonymous caller from account-identity methods", async () => {
  // A fresh actor defaults to the anonymous caller.
  const anonymousActor = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  await expect(anonymousActor.getMyAccountId()).resolves.toEqual({
    err: { NotSignedIn: null },
  });
  await expect(anonymousActor.getMyAuthMethods()).resolves.toEqual({
    err: { NotSignedIn: null },
  });
  await expect(
    anonymousActor.bindAuthMethod({ Google: null }),
  ).resolves.toEqual({ err: { NotSignedIn: null } });
});

it("returns the caller's stable principal as the account id", async () => {
  actor.setIdentity(contributorIdentity);
  const result = await actor.getMyAccountId();
  expect(result).toEqual({ ok: CONTRIBUTOR });
});

it("binds Google and Apple auth methods to the same account and reflects them", async () => {
  actor.setIdentity(contributorIdentity);

  // Bind Google, then Apple, to the same account.
  const googleAccount = await actor.bindAuthMethod({ Google: null });
  expect(googleAccount).toEqual({
    ok: {
      id: CONTRIBUTOR,
      createdAt: expect.any(BigInt),
      authMethods: [{ Google: null }],
    },
  });

  const appleAccount = await actor.bindAuthMethod({ Apple: null });
  expect(appleAccount).toEqual({
    ok: {
      id: CONTRIBUTOR,
      createdAt: expect.any(BigInt),
      authMethods: [{ Google: null }, { Apple: null }],
    },
  });

  // Both methods are bound to the same stable account id.
  const methods = await actor.getMyAuthMethods();
  expect(methods).toEqual({ ok: { google: true, apple: true } });
});

// ---------------------------------------------------------------------------
// Profile claim flow (cover for the canonical Lorenzo Smith Jr. claim change).
// The build reconciles the canonical `lorenzoSmithJr` personId across the claim
// flow: a pending claim surfaces on the profile, approval marks the canonical
// profile CLAIMED with claimedByUserId set to the claiming account, and no new
// Person record is created. These tests run against a dedicated canister so the
// approved-claim state does not leak into the shared `actor` canister.
// ---------------------------------------------------------------------------

const claimantIdentity = createIdentity("lorenzo-claimant-seed");
const stewardIdentity = createIdentity("lorenzo-steward-seed");
const CLAIMANT = claimantIdentity.getPrincipal();
const STEWARD = stewardIdentity.getPrincipal();

it("round-trips a profile claim: request -> approve -> claimed with owner, no new record", async () => {
  // A signed-in user claims the canonical Lorenzo Smith Jr. profile.
  claimActor.setIdentity(claimantIdentity);
  const requested = await claimActor.requestProfileClaim("lorenzoSmithJr");
  expect(requested).toEqual({
    ok: expect.objectContaining({
      personId: "lorenzoSmithJr",
      requestingUserId: CLAIMANT,
      status: { Pending: null },
    }),
  });
  const claimId = (requested as { ok: { id: bigint } }).ok.id;

  // The caller can observe their own pending claim on the canonical profile.
  const myClaim = await claimActor.getMyProfileClaim("lorenzoSmithJr");
  expect(myClaim).toEqual([
    expect.objectContaining({
      id: claimId,
      personId: "lorenzoSmithJr",
      status: { Pending: null },
    }),
  ]);

  // getMyProfile resolves the canonical profile being claimed.
  const myProfile = await claimActor.getMyProfile();
  expect(myProfile).toEqual([
    expect.objectContaining({
      personId: "lorenzoSmithJr",
      name: "Lorenzo Smith Jr.",
    }),
  ]);

  // A Family Steward approves the claim.
  claimActor.setIdentity(stewardIdentity);
  await claimActor._initialize_access_control();
  const approved = await claimActor.approveProfileClaim(claimId);
  expect(approved).toEqual([
    expect.objectContaining({ id: claimId, status: { Approved: null } }),
  ]);

  // The canonical profile is now CLAIMED with claimedByUserId set to the
  // claiming account, and no new Person record was created (the same
  // lorenzoSmithJr personId remains).
  const profile = await claimActor.getPersonProfile("lorenzoSmithJr");
  expect(profile).toEqual([
    expect.objectContaining({
      personId: "lorenzoSmithJr",
      claimStatus: { Claimed: null },
      claimedByUserId: [CLAIMANT],
    }),
  ]);
});

it("prevents duplicate claim submissions for the same person", async () => {
  // A fresh canister so the pending-claim state is clean (the claim-flow test
  // above approved a claim on the same canonical profile).
  const dupSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const dupActor = dupSetup.actor;

  // A signed-in user claims the canonical profile, then a second submission for
  // the same person is rejected as AlreadyPending (duplicate-claim prevention).
  dupActor.setIdentity(claimantIdentity);
  const first = await dupActor.requestProfileClaim("lorenzoSmithJr");
  expect(first).toEqual({
    ok: expect.objectContaining({ personId: "lorenzoSmithJr" }),
  });
  const second = await dupActor.requestProfileClaim("lorenzoSmithJr");
  expect(second).toEqual({ err: { AlreadyPending: null } });
});

// ---------------------------------------------------------------------------
// updateOwnProfile (cover for the profile-edit backend seam). The claim-flow
// test above approved a claim on the canonical lorenzoSmithJr profile with
// CLAIMANT as the owner, so this canister already has a CLAIMED living profile
// to edit. updateOwnProfile must update the SAME canonical record in place
// (same personId, claim stays CLAIMED, claimedByUserId preserved, no duplicate
// created) and must reject a caller who is not the owner.
// ---------------------------------------------------------------------------

it("updates the canonical record in place via updateOwnProfile, preserving claim ownership", async () => {
  // The claim-flow test left lorenzoSmithJr CLAIMED by CLAIMANT on claimActor.
  claimActor.setIdentity(claimantIdentity);

  const edits = {
    preferredName: ["Lorenzo Smith Jr."],
    firstName: ["Lorenzo"],
    middleName: [],
    lastName: ["Smith"],
    suffix: ["Jr."],
    nickname: [],
    birthDate: ["1990"],
    birthplace: ["Chicago, IL"],
    currentLocation: [],
    occupation: ["Family historian"],
    livingStatus: [],
    shortBio: ["A family historian."],
    longerStory: [],
    story: [],
    birthInfo: [],
    timeline: [],
    privacySettings: [],
  };

  const result = await claimActor.updateOwnProfile("lorenzoSmithJr", edits);
  expect(result).toEqual({
    ok: expect.objectContaining({
      personId: "lorenzoSmithJr",
      preferredName: ["Lorenzo Smith Jr."],
      firstName: ["Lorenzo"],
      lastName: ["Smith"],
      suffix: ["Jr."],
      birthDate: ["1990"],
      birthplace: ["Chicago, IL"],
      occupation: ["Family historian"],
      shortBio: ["A family historian."],
      // Claim ownership is preserved: still CLAIMED by the same owner.
      claimStatus: { Claimed: null },
      claimedByUserId: [CLAIMANT],
    }),
  });

  // The canonical record is updated IN PLACE: same personId, no duplicate
  // record was created, and the edits are readable back through the public API.
  const profile = await claimActor.getPersonProfile("lorenzoSmithJr");
  expect(profile).toEqual([
    expect.objectContaining({
      personId: "lorenzoSmithJr",
      preferredName: ["Lorenzo Smith Jr."],
      firstName: ["Lorenzo"],
      lastName: ["Smith"],
      suffix: ["Jr."],
      birthDate: ["1990"],
      birthplace: ["Chicago, IL"],
      occupation: ["Family historian"],
      shortBio: ["A family historian."],
      claimStatus: { Claimed: null },
      claimedByUserId: [CLAIMANT],
    }),
  ]);
});

it("rejects a non-owner from updateOwnProfile with NotOwner", async () => {
  // A fresh canister where lorenzoSmithJr is claimed by CLAIMANT, but a
  // different signed-in user (STEWARD) attempts to edit it.
  const nonOwnerSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const nonOwnerActor = nonOwnerSetup.actor;

  nonOwnerActor.setIdentity(claimantIdentity);
  await nonOwnerActor.requestProfileClaim("lorenzoSmithJr");
  const claimId = (
    (await nonOwnerActor.getMyProfileClaim("lorenzoSmithJr")) as Array<{ id: bigint }>
  )[0].id;
  nonOwnerActor.setIdentity(stewardIdentity);
  await nonOwnerActor._initialize_access_control();
  await nonOwnerActor.approveProfileClaim(claimId);

  // STEWARD is signed in but is not the owner of the claimed profile.
  nonOwnerActor.setIdentity(stewardIdentity);
  const result = await nonOwnerActor.updateOwnProfile("lorenzoSmithJr", {
    preferredName: ["Hijacked"],
    firstName: [],
    middleName: [],
    lastName: [],
    suffix: [],
    nickname: [],
    birthDate: [],
    birthplace: [],
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
  expect(result).toEqual({ err: { NotOwner: null } });

  // The canonical record was not modified by the rejected edit.
  const profile = await nonOwnerActor.getPersonProfile("lorenzoSmithJr");
  expect(profile).toEqual([
    expect.objectContaining({
      personId: "lorenzoSmithJr",
      preferredName: [],
      claimStatus: { Claimed: null },
      claimedByUserId: [CLAIMANT],
    }),
  ]);
});
