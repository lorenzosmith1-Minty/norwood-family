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

it("seeds lorenzoSmithJr's preferredName as 'Waxx Minty'", async () => {
  // The 20260907_000000.mo migration sets the canonical child profile's
  // preferredName to 'Waxx Minty' so the child card on Lorenzo Smith Sr.'s
  // profile resolves the canonical display name. The `name` field stays
  // 'Lorenzo Smith Jr.'; only the preferredName is the canonical display name.
  const profile = await actor.getPersonProfile("lorenzoSmithJr");
  expect(profile).toEqual([
    expect.objectContaining({
      personId: "lorenzoSmithJr",
      name: "Lorenzo Smith Jr.",
      preferredName: ["Waxx Minty"],
    }),
  ]);
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
    { Standard: null },
    [],
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
      { Standard: null },
      [],
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
// Archive privacy enforcement (cover for the server-side privacy requirement).
// Approved archive items are returned to a caller only when the caller's access
// matches the item's privacy level: Public items are visible to everyone,
// FamilyOnly items require approved family membership, and Private items are
// visible only to their contributor or an admin. This is enforced in the
// backend, not just displayed client-side — the frontend suite mocks the actor
// and cannot see it, so it is asserted here against the real canister.
// ---------------------------------------------------------------------------

it("enforces archive privacy levels server-side: a guest sees only Public approved items", async () => {
  const privacySetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const privacyActor = privacySetup.actor;

  // ADMIN becomes the Family Steward; CONTRIBUTOR registers as a #user.
  privacyActor.setIdentity(adminIdentity);
  await privacyActor._initialize_access_control();
  privacyActor.setIdentity(contributorIdentity);
  await privacyActor._initialize_access_control();

  // A contributor submits three approved items with different privacy levels.
  privacyActor.setIdentity(contributorIdentity);
  const publicItem = await privacyActor.submitArchiveItem(
    "Public letter",
    "A public letter.",
    { Document: null },
    blob,
    "1924",
    [1924n],
    ["letters"],
    ["julia"],
    ["branch-1"],
    { Original: null },
    { Public: null },
    { Standard: null },
    [],
  );
  const familyItem = await privacyActor.submitArchiveItem(
    "Family letter",
    "A family letter.",
    { Document: null },
    blob,
    "1924",
    [1924n],
    ["letters"],
    ["julia"],
    ["branch-1"],
    { Original: null },
    { FamilyOnly: null },
    { Standard: null },
    [],
  );
  const privateItem = await privacyActor.submitArchiveItem(
    "Private letter",
    "A private letter.",
    { Document: null },
    blob,
    "1924",
    [1924n],
    ["letters"],
    ["julia"],
    ["branch-1"],
    { Original: null },
    { Private: null },
    { Standard: null },
    [],
  );

  // Approve all three so they enter the archive.
  privacyActor.setIdentity(adminIdentity);
  await privacyActor.approveArchiveItem(publicItem.id);
  await privacyActor.approveArchiveItem(familyItem.id);
  await privacyActor.approveArchiveItem(privateItem.id);

  // A guest (anonymous, no approved claim) sees ONLY the Public item — the
  // FamilyOnly and Private items are not returned to them.
  const guestActor = pic!.createActor<_SERVICE>(idlFactory, privacySetup.canisterId);
  const guestView = await guestActor.listApprovedArchiveItems();
  expect(guestView.map((i) => i.id)).toEqual([publicItem.id]);

  // The contributor sees their own Private item plus the Public item, but NOT
  // the FamilyOnly item (they are not an approved family member).
  privacyActor.setIdentity(contributorIdentity);
  const contributorView = await privacyActor.listApprovedArchiveItems();
  expect(contributorView.map((i) => i.id).sort()).toEqual(
    [publicItem.id, privateItem.id].sort(),
  );

  // An approved family member (a caller holding an approved claim) sees Public
  // + FamilyOnly, but not another contributor's Private item.
  privacyActor.setIdentity(memberAIdentity);
  await privacyActor._initialize_access_control();
  const claim = (await privacyActor.requestProfileClaim("clayton")) as {
    ok: { id: bigint };
  };
  privacyActor.setIdentity(adminIdentity);
  await privacyActor.approveProfileClaim(claim.ok.id);
  privacyActor.setIdentity(memberAIdentity);
  const memberView = await privacyActor.listApprovedArchiveItems();
  expect(memberView.map((i) => i.id).sort()).toEqual(
    [publicItem.id, familyItem.id].sort(),
  );
});

// ---------------------------------------------------------------------------
// Pending Contributions count derives from canonical pending records (cover for
// the pending-badge repair). The Steward-facing badge must reflect the same
// canonical backend pending data that listPendingArchiveItems returns, so a
// submitted contribution increments the count and an Approve/Reject decrements
// it. A dedicated canister keeps the shared `actor` canister's state from
// leaking into this assertion.
// ---------------------------------------------------------------------------

it("derives the pending contributions count from canonical pending archive records", async () => {
  const countSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const countActor = countSetup.actor;

  // ADMIN becomes the Family Steward; CONTRIBUTOR registers as a #user.
  countActor.setIdentity(adminIdentity);
  await countActor._initialize_access_control();
  countActor.setIdentity(contributorIdentity);
  await countActor._initialize_access_control();

  // Empty-state: no pending items, so the count is zero.
  countActor.setIdentity(adminIdentity);
  expect(await countActor.getPendingContributionsCount()).toBe(0n);

  // A contributor submits a pending archive item; the count increments to one.
  countActor.setIdentity(contributorIdentity);
  const item = await countActor.submitArchiveItem(
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
    { Standard: null },
    [],
  );

  // The count reflects the same canonical pending record listPendingArchiveItems
  // returns: exactly one pending item.
  countActor.setIdentity(adminIdentity);
  expect(await countActor.getPendingContributionsCount()).toBe(1n);
  expect(await countActor.listPendingArchiveItems()).toHaveLength(1);

  // Approving the item removes it from the pending set, decrementing the count.
  await countActor.approveArchiveItem(item.id);
  expect(await countActor.getPendingContributionsCount()).toBe(0n);
  expect(await countActor.listPendingArchiveItems()).toEqual([]);
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
  // updateOwnProfile now resolves the caller's steward status via isAdmin, which
  // requires the caller to be registered (the real app registers every signed-in
  // user through the Internet Identity sign-in flow). Register CLAIMANT as a
  // #user so the owner-edit path is exercised as it is in the deployed app.
  await claimActor._initialize_access_control();

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

  // The canonical record was not modified by the rejected edit. The seeded
  // preferredName 'Waxx Minty' (set by the 20260907_000000.mo migration) is
  // preserved — the rejected edit did not overwrite it.
  const profile = await nonOwnerActor.getPersonProfile("lorenzoSmithJr");
  expect(profile).toEqual([
    expect.objectContaining({
      personId: "lorenzoSmithJr",
      preferredName: ["Waxx Minty"],
      claimStatus: { Claimed: null },
      claimedByUserId: [CLAIMANT],
    }),
  ]);
});

// ---------------------------------------------------------------------------
// Steward-authorized update path (cover for the profile-edit hydration build).
// updateOwnProfile now lets a Family Steward edit an unclaimed/historical
// profile (treated as editing an existing profile, never creating a new one),
// and the #DeceasedProfile guard runs AFTER the ownership check so a steward
// editing an unclaimed deceased profile is allowed while an owner (or a steward
// editing a profile claimed by another user) is still blocked. These run
// against a dedicated canister so the claim/approve state never leaks into the
// shared `actor` canister.
// ---------------------------------------------------------------------------

it("lets a Family Steward edit an unclaimed living profile via updateOwnProfile", async () => {
  const stewardSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const stewardActor = stewardSetup.actor;

  // STEWARD becomes the Family Steward (first caller to _initialize_access_control).
  stewardActor.setIdentity(stewardIdentity);
  await stewardActor._initialize_access_control();

  // 'clayton' is a seeded living, unclaimed profile. A steward may edit it as
  // an existing profile — the update succeeds and the canonical record is
  // updated in place (same personId, still unclaimed, no duplicate created).
  const result = await stewardActor.updateOwnProfile("clayton", {
    preferredName: ["Clayton Norwood"],
    firstName: [],
    middleName: [],
    lastName: [],
    suffix: ["II"],
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
  expect(result).toEqual({
    ok: expect.objectContaining({
      personId: "clayton",
      preferredName: ["Clayton Norwood"],
      suffix: ["II"],
      claimStatus: { Unclaimed: null },
    }),
  });

  // The canonical record is updated in place — same personId, still unclaimed.
  const profile = await stewardActor.getPersonProfile("clayton");
  expect(profile).toEqual([
    expect.objectContaining({
      personId: "clayton",
      suffix: ["II"],
      claimStatus: { Unclaimed: null },
    }),
  ]);
});

it("lets a Family Steward edit an unclaimed deceased profile (reordered guard)", async () => {
  const deceasedSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const deceasedActor = deceasedSetup.actor;

  // STEWARD becomes the Family Steward.
  deceasedActor.setIdentity(stewardIdentity);
  await deceasedActor._initialize_access_control();

  // 'julia' is a seeded deceased, unclaimed profile. The #DeceasedProfile guard
  // runs after the ownership check, so a steward editing an unclaimed deceased
  // profile is allowed (isStewardEditable) rather than blocked.
  const result = await deceasedActor.updateOwnProfile("julia", {
    preferredName: ["Julia Norwood"],
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
  expect(result).toEqual({
    ok: expect.objectContaining({
      personId: "julia",
      preferredName: ["Julia Norwood"],
      livingStatus: { Deceased: null },
      claimStatus: { Unclaimed: null },
    }),
  });
});

// ---------------------------------------------------------------------------
// Steward identity display and eligibility (cover for the steward-management
// identity change). The build adds listStewardIdentities and
// listEligibleStewardCandidates so the Steward Management tab can render the
// linked Person's preferred/display name instead of the raw account id and
// drive its promote/successor dropdowns from eligible approved claimed members.
// These are query methods; the high-signal check is that they resolve without
// trapping and return the StewardIdentity shape.
// ---------------------------------------------------------------------------

it("lists steward identities without trapping, resolving the linked Person display name", async () => {
  // listStewardIdentities is Family-Steward-gated, so authenticate as a steward
  // (the first caller to _initialize_access_control becomes the admin) before
  // calling it. The shared `actor` canister has no stewards seeded, so the list
  // is empty but must resolve (not trap) with the StewardIdentity shape.
  actor.setIdentity(adminIdentity);
  await actor._initialize_access_control();
  const identities = await actor.listStewardIdentities();
  expect(Array.isArray(identities)).toBe(true);
});

it("lists eligible steward candidates without trapping", async () => {
  // listEligibleStewardCandidates is Family-Steward-gated, so authenticate as a
  // steward first. No approved claimed living members are seeded, so the
  // eligible list is empty but must resolve (not trap).
  actor.setIdentity(adminIdentity);
  await actor._initialize_access_control();
  const candidates = await actor.listEligibleStewardCandidates();
  expect(Array.isArray(candidates)).toBe(true);
});

// ---------------------------------------------------------------------------
// Message Board, Private Messaging, blocking, reporting, and the Pending
// Contributions count (cover for the board/messaging/pending-count phase).
// These methods are approved-member / Family-Steward gated and are exercised
// against the real canister so a stubbed backend cannot pass the cover. A
// dedicated canister keeps the claim/approve state from leaking into the shared
// `actor` canister the other tests use.
// ---------------------------------------------------------------------------

const memberAIdentity = createIdentity("board-member-a-seed");
const memberBIdentity = createIdentity("board-member-b-seed");
const MEMBER_A = memberAIdentity.getPrincipal();
const MEMBER_B = memberBIdentity.getPrincipal();

it("round-trips board posts, replies, archive/restore, messaging, block, report, and pending count", async () => {
  const boardSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const boardActor = boardSetup.actor;

  // ADMIN becomes the Family Steward (first caller to _initialize_access_control).
  boardActor.setIdentity(adminIdentity);
  await boardActor._initialize_access_control();
  // MEMBER_A and MEMBER_B register as approved #user members and bind an auth
  // method so their accounts are active (linked to the accounts map), which the
  // messaging eligibility requires.
  boardActor.setIdentity(memberAIdentity);
  await boardActor._initialize_access_control();
  await boardActor.bindAuthMethod({ Google: null });
  boardActor.setIdentity(memberBIdentity);
  await boardActor._initialize_access_control();
  await boardActor.bindAuthMethod({ Google: null });

  // Two approved members: MEMBER_A claims the living 'clayton' profile and
  // MEMBER_B claims the living 'hudson' profile; the steward approves both.
  boardActor.setIdentity(memberAIdentity);
  const claimA = (await boardActor.requestProfileClaim("clayton")) as {
    ok: { id: bigint };
  };
  boardActor.setIdentity(memberBIdentity);
  const claimB = (await boardActor.requestProfileClaim("hudson")) as {
    ok: { id: bigint };
  };
  boardActor.setIdentity(adminIdentity);
  await boardActor.approveProfileClaim(claimA.ok.id);
  await boardActor.approveProfileClaim(claimB.ok.id);

  // Pending Contributions count is steward-gated and resolves (0 with no
  // pending items) instead of trapping.
  const pendingCount = await boardActor.getPendingContributionsCount();
  expect(typeof pendingCount).toBe("bigint");

  // MEMBER_A creates a board post with a type, title, body, and a related
  // member; it is FamilyOnly and Active.
  boardActor.setIdentity(memberAIdentity);
  const post = await boardActor.createBoardPost(
    { Announcement: null },
    ["Family reunion"],
    "Save the date for the annual reunion.",
    ["hudson"],
    [],
    ["reunion", "family"],
  );
  expect(post).toMatchObject({
    postType: { Announcement: null },
    title: ["Family reunion"],
    body: "Save the date for the annual reunion.",
    relatedPersonIds: ["hudson"],
    tags: ["reunion", "family"],
    status: { Active: null },
    privacyScope: { FamilyOnly: null },
    authorPersonId: "clayton",
  });

  // The post is listed for an approved member, newest first.
  const listed = await boardActor.listBoardPosts([]);
  expect(listed).toHaveLength(1);
  expect(listed[0].postId).toBe(post.postId);

  // MEMBER_B adds a reply that appears chronologically.
  boardActor.setIdentity(memberBIdentity);
  const reply = await boardActor.addBoardReply(post.postId, "I will be there.");
  expect(reply).toMatchObject({ postId: post.postId, body: "I will be there." });
  const replies = await boardActor.listBoardReplies(post.postId);
  expect(replies).toHaveLength(1);
  expect(replies[0].body).toBe("I will be there.");

  // A steward archives the post (hides it) and restores it.
  boardActor.setIdentity(adminIdentity);
  const archived = await boardActor.archiveBoardPost(post.postId);
  expect(archived).toEqual([expect.objectContaining({ status: { Archived: null } })]);
  const restored = await boardActor.restoreBoardPost(post.postId);
  expect(restored).toEqual([expect.objectContaining({ status: { Active: null } })]);

  // MEMBER_A sends a private message to MEMBER_B (person 'hudson'), reusing the
  // canonical 1:1 conversation.
  boardActor.setIdentity(memberAIdentity);
  const sent = await boardActor.sendMessage("hudson", "Hello Versie");
  expect(sent).toMatchObject({ ok: expect.objectContaining({ body: "Hello Versie" }) });

  // The conversation appears in MEMBER_A's inbox and is readable by a participant.
  const conversations = await boardActor.listConversations();
  expect(conversations).toHaveLength(1);
  expect(conversations[0]).toMatchObject({ otherPersonId: "hudson" });
  const view = await boardActor.getConversation(conversations[0].conversationId);
  expect(view).toEqual([
    expect.objectContaining({
      messages: [expect.objectContaining({ body: "Hello Versie" })],
    }),
  ]);

  // MEMBER_A blocks MEMBER_B, sees them in the blocked list, then unblocks.
  await boardActor.blockUser(MEMBER_B);
  const blocked = await boardActor.listBlockedUsers();
  expect(blocked.map((p) => p.toText())).toContain(MEMBER_B.toText());
  await boardActor.unblockUser(MEMBER_B);
  expect((await boardActor.listBlockedUsers()).map((p) => p.toText())).not.toContain(
    MEMBER_B.toText(),
  );

  // MEMBER_A reports the received message with a reason; the steward reviews
  // only that report and its message content.
  const messageId = (sent as { ok: { messageId: bigint } }).ok.messageId;
  const report = await boardActor.reportMessage(messageId, "Harassment");
  expect(report).toMatchObject({
    reportedMessageId: messageId,
    reason: "Harassment",
    status: { Pending: null },
  });
  boardActor.setIdentity(adminIdentity);
  const reports = await boardActor.listReports();
  expect(reports).toHaveLength(1);
  const reportedView = await boardActor.getReportedMessage(report.reportId);
  expect(reportedView).toEqual([
    expect.objectContaining({
      message: expect.objectContaining({ messageId, body: "Hello Versie" }),
    }),
  ]);
  const reviewed = await boardActor.reviewReport(report.reportId, { Reviewed: null });
  expect(reviewed).toEqual([expect.objectContaining({ status: { Reviewed: null } })]);
});

// ---------------------------------------------------------------------------
// Structural verification for Private Messaging (cover for the messaging
// phase). These tests assert the invariants the acceptance criteria require:
// conversations need two different eligible accountIds, self-messaging is
// impossible, Block is conversation-specific, Report is message-specific, and
// unreported private content is not steward-readable. They run against a fresh
// canister with two approved claimed members and a steward, without fake users.
// ---------------------------------------------------------------------------

it("rejects self-messaging and lists only other eligible members", async () => {
  const structSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const structActor = structSetup.actor;

  // ADMIN becomes the Family Steward; MEMBER_A and MEMBER_B register as users
  // and bind an auth method so their accounts are active (linked to the
  // accounts map), which messaging eligibility requires.
  structActor.setIdentity(adminIdentity);
  await structActor._initialize_access_control();
  structActor.setIdentity(memberAIdentity);
  await structActor._initialize_access_control();
  await structActor.bindAuthMethod({ Google: null });
  structActor.setIdentity(memberBIdentity);
  await structActor._initialize_access_control();
  await structActor.bindAuthMethod({ Google: null });

  // MEMBER_A claims 'clayton' and MEMBER_B claims 'hudson'; the steward approves.
  structActor.setIdentity(memberAIdentity);
  const claimA = (await structActor.requestProfileClaim("clayton")) as {
    ok: { id: bigint };
  };
  structActor.setIdentity(memberBIdentity);
  const claimB = (await structActor.requestProfileClaim("hudson")) as {
    ok: { id: bigint };
  };
  structActor.setIdentity(adminIdentity);
  await structActor.approveProfileClaim(claimA.ok.id);
  await structActor.approveProfileClaim(claimB.ok.id);

  // listMessageableMembers is data-driven and non-admin-gated: MEMBER_A sees
  // MEMBER_B's claimed person but never their own (self is excluded).
  structActor.setIdentity(memberAIdentity);
  const messageable = await structActor.listMessageableMembers();
  expect(messageable).toContain("hudson");
  expect(messageable).not.toContain("clayton");

  // Self-messaging is impossible: MEMBER_A sending to their own claimed person
  // ('clayton') is rejected with CannotMessageSelf.
  const selfSend = await structActor.sendMessage("clayton", "to myself");
  expect(selfSend).toEqual({ err: { CannotMessageSelf: null } });

  // A real 1:1 conversation between two different eligible members works.
  const sent = await structActor.sendMessage("hudson", "Hello");
  expect(sent).toMatchObject({ ok: expect.objectContaining({ body: "Hello" }) });
});

it("does not expose unreported private conversation content to a steward", async () => {
  const structSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const structActor = structSetup.actor;

  // ADMIN becomes the Family Steward; MEMBER_A and MEMBER_B register as users
  // and bind an auth method so their accounts are active (linked to the
  // accounts map), which messaging eligibility requires.
  structActor.setIdentity(adminIdentity);
  await structActor._initialize_access_control();
  structActor.setIdentity(memberAIdentity);
  await structActor._initialize_access_control();
  await structActor.bindAuthMethod({ Google: null });
  structActor.setIdentity(memberBIdentity);
  await structActor._initialize_access_control();
  await structActor.bindAuthMethod({ Google: null });

  // MEMBER_A claims 'clayton' and MEMBER_B claims 'hudson'; the steward approves.
  structActor.setIdentity(memberAIdentity);
  const claimA = (await structActor.requestProfileClaim("clayton")) as {
    ok: { id: bigint };
  };
  structActor.setIdentity(memberBIdentity);
  const claimB = (await structActor.requestProfileClaim("hudson")) as {
    ok: { id: bigint };
  };
  structActor.setIdentity(adminIdentity);
  await structActor.approveProfileClaim(claimA.ok.id);
  await structActor.approveProfileClaim(claimB.ok.id);

  // MEMBER_A sends a private message to MEMBER_B.
  structActor.setIdentity(memberAIdentity);
  const sent = (await structActor.sendMessage("hudson", "private note")) as {
    ok: { messageId: bigint };
  };

  // The steward is NOT a participant, so they cannot read the conversation
  // (getConversation returns null) — unreported private content is not
  // steward-readable.
  structActor.setIdentity(adminIdentity);
  const conversations = await structActor.listConversations();
  expect(conversations).toEqual([]);
  const stewardView = await structActor.getConversation(1n);
  expect(stewardView).toEqual([]);

  // Before any report is filed, getReportedMessage for the message returns
  // nothing — the steward only ever sees reported message content.
  const unreported = await structActor.getReportedMessage(0n);
  expect(unreported).toEqual([]);

  // Once MEMBER_A reports the specific message, the steward sees only that
  // reported message's content.
  structActor.setIdentity(memberAIdentity);
  const report = await structActor.reportMessage(sent.ok.messageId, "Spam");
  structActor.setIdentity(adminIdentity);
  const reportedView = await structActor.getReportedMessage(report.reportId);
  expect(reportedView).toEqual([
    expect.objectContaining({
      message: expect.objectContaining({
        messageId: sent.ok.messageId,
        body: "private note",
      }),
    }),
  ]);
});

// ---------------------------------------------------------------------------
// Archive tag search (cover for the archive title + tag search requirement).
// searchArchiveItems filters approved items by title query and tags, matching
// case-insensitively by substring, and an item must carry ALL of the given
// tags. Only #Approved items are returned.
// ---------------------------------------------------------------------------

it("searches approved archive items by title and tags", async () => {
  const searchSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const searchActor = searchSetup.actor;

  // ADMIN becomes the Family Steward; CONTRIBUTOR registers as a #user.
  searchActor.setIdentity(adminIdentity);
  await searchActor._initialize_access_control();
  searchActor.setIdentity(contributorIdentity);
  await searchActor._initialize_access_control();

  // A contributor submits two approved items with distinct titles and tags.
  searchActor.setIdentity(contributorIdentity);
  const letter = await searchActor.submitArchiveItem(
    "A family letter",
    "A letter from 1924.",
    { Document: null },
    blob,
    "1924",
    [1924n],
    ["letters", "1924"],
    ["julia"],
    ["branch-1"],
    { Original: null },
    { FamilyOnly: null },
    { Standard: null },
    [],
  );
  const photo = await searchActor.submitArchiveItem(
    "Wedding portrait",
    "The couple on their wedding day.",
    { Photo: null },
    blob,
    "1920s",
    [],
    ["wedding", "1920s"],
    ["julia"],
    ["branch-1"],
    { Original: null },
    { FamilyOnly: null },
    { Standard: null },
    [],
  );

  // Approve both items so they enter the searchable archive.
  searchActor.setIdentity(adminIdentity);
  await searchActor.approveArchiveItem(letter.id);
  await searchActor.approveArchiveItem(photo.id);

  // Empty-state search returns everything approved.
  const all = await searchActor.searchArchiveItems({
    searchTerm: [],
    tags: [],
    itemType: [],
    relatedMemberId: [],
    era: [],
  });
  expect(all).toHaveLength(2);

  // Title search matches case-insensitively by substring.
  const byTitle = await searchActor.searchArchiveItems({
    searchTerm: ["FAMILY"],
    tags: [],
    itemType: [],
    relatedMemberId: [],
    era: [],
  });
  expect(byTitle.map((i) => i.id)).toEqual([letter.id]);

  // Tag search requires ALL of the given tags.
  const byTag = await searchActor.searchArchiveItems({
    searchTerm: [],
    tags: ["wedding"],
    itemType: [],
    relatedMemberId: [],
    era: [],
  });
  expect(byTag.map((i) => i.id)).toEqual([photo.id]);

  // A tag present on only one item narrows to that item.
  const byBothTags = await searchActor.searchArchiveItems({
    searchTerm: [],
    tags: ["1924"],
    itemType: [],
    relatedMemberId: [],
    era: [],
  });
  expect(byBothTags.map((i) => i.id)).toEqual([letter.id]);
});

// ---------------------------------------------------------------------------
// Research source upload (cover for the Research Intake source-upload
// requirement). createSourceWithUpload creates ONE canonical Archive item
// (pending) and links a new Research Source record to it via archiveItemId, so
// no manually typed Archive Item ID is required.
// ---------------------------------------------------------------------------

it("creates one canonical archive item and links a source via createSourceWithUpload", async () => {
  const uploadSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const uploadActor = uploadSetup.actor;

  // ADMIN becomes the Family Steward; CONTRIBUTOR registers as a #user.
  uploadActor.setIdentity(adminIdentity);
  await uploadActor._initialize_access_control();
  uploadActor.setIdentity(contributorIdentity);
  await uploadActor._initialize_access_control();

  // A signed-in contributor uploads a source file.
  uploadActor.setIdentity(contributorIdentity);
  const result = await uploadActor.createSourceWithUpload(
    "1900 census, Norwood household",
    { CensusCitation: null },
    "Census record listing the Norwood family.",
    blob,
    ["census", "1900"],
    "1900",
    [1900n],
    ["julia"],
    { FamilyOnly: null },
    { Standard: null },
    [],
  );
  expect(result).toEqual({
    ok: expect.objectContaining({
      source: expect.objectContaining({
        title: "1900 census, Norwood household",
        sourceType: { CensusCitation: null },
        archiveItemId: [expect.any(BigInt)],
        contributor: CONTRIBUTOR,
        status: { Pending: null },
      }),
      archiveItem: expect.objectContaining({
        title: "1900 census, Norwood household",
        itemType: { Document: null },
        tags: ["census", "1900"],
        contributor: CONTRIBUTOR,
        status: { Pending: null },
      }),
    }),
  });

  // Exactly one canonical archive item was created (pending), and the source
  // links to it by id — no manually typed Archive Item ID was required.
  // listPendingArchiveItems is admin-gated, so switch to the admin caller.
  uploadActor.setIdentity(adminIdentity);
  const pending = await uploadActor.listPendingArchiveItems();
  expect(pending).toHaveLength(1);
  const archiveItemId = (result as { ok: { archiveItem: { id: bigint } } }).ok.archiveItem.id;
  expect(pending[0].id).toBe(archiveItemId);

  // The source record is readable and carries the linked archive item id.
  const sources = await uploadActor.listSources();
  expect(sources).toHaveLength(1);
  expect(sources[0]).toMatchObject({
    title: "1900 census, Norwood household",
    archiveItemId: [archiveItemId],
  });
});

// ---------------------------------------------------------------------------
// Board post with media (cover for the Message Board media-attachment
// requirement). createBoardPostWithMedia attaches existing Archive items by id
// and/or creates one canonical Archive item per new upload — the underlying
// file is never duplicated.
// ---------------------------------------------------------------------------

it("creates a board post attaching existing media and new uploads without duplication", async () => {
  const mediaSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const mediaActor = mediaSetup.actor;

  // ADMIN becomes the Family Steward; MEMBER_A registers as an approved member
  // and binds an auth method so their account is active.
  mediaActor.setIdentity(adminIdentity);
  await mediaActor._initialize_access_control();
  mediaActor.setIdentity(memberAIdentity);
  await mediaActor._initialize_access_control();
  await mediaActor.bindAuthMethod({ Google: null });

  // MEMBER_A claims the living 'clayton' profile; the steward approves it.
  mediaActor.setIdentity(memberAIdentity);
  const claim = (await mediaActor.requestProfileClaim("clayton")) as {
    ok: { id: bigint };
  };
  mediaActor.setIdentity(adminIdentity);
  await mediaActor.approveProfileClaim(claim.ok.id);

  // Seed an approved archive item to attach by id.
  mediaActor.setIdentity(memberAIdentity);
  const existing = await mediaActor.submitArchiveItem(
    "Existing photo",
    "Already in the archive.",
    { Photo: null },
    blob,
    "1920s",
    [],
    ["existing"],
    ["clayton"],
    [],
    { Original: null },
    { FamilyOnly: null },
    { Standard: null },
    [],
  );
  mediaActor.setIdentity(adminIdentity);
  await mediaActor.approveArchiveItem(existing.id);

  // MEMBER_A creates a post attaching the existing item AND one new upload.
  mediaActor.setIdentity(memberAIdentity);
  const post = await mediaActor.createBoardPostWithMedia(
    { General: null },
    ["Reunion photos"],
    "Here are the reunion photos.",
    ["clayton"],
    [existing.id],
    [
      {
        title: "New reunion photo",
        description: "A photo from the reunion.",
        itemType: { Photo: null },
        blob,
        era: "2024",
        year: [2024n],
        tags: ["reunion"],
        relatedMemberIds: ["clayton"],
        relatedBranchId: [],
        sourceStatus: { Original: null },
        privacyLevel: { FamilyOnly: null },
        classification: { Standard: null },
        primarySpeaker: [],
      },
    ],
    ["reunion", "photos"],
  );

  // The post links BOTH the existing item and the new upload's archive item.
  expect(post.linkedMediaIds).toHaveLength(2);
  expect(post.linkedMediaIds).toContain(existing.id);

  // The new upload created exactly one canonical Archive item (pending) — the
  // underlying file is not duplicated. listPendingArchiveItems is admin-gated,
  // so switch to the admin caller.
  mediaActor.setIdentity(adminIdentity);
  const pending = await mediaActor.listPendingArchiveItems();
  expect(pending).toHaveLength(1);
  expect(pending[0]).toMatchObject({
    title: "New reunion photo",
    itemType: { Photo: null },
    tags: ["reunion"],
  });
  expect(post.linkedMediaIds).toContain(pending[0].id);
});

// ---------------------------------------------------------------------------
// Stale claim notification reconciliation (cover for the approved-claim
// notification requirement). When a profile claim becomes APPROVED, the pending
// ProfileClaimRequested notification for the claimant is no longer
// actionable/current — reconcileClaimNotifications marks it read/resolved while
// the profile status stays CLAIMED.
// ---------------------------------------------------------------------------

it("reconciles the pending claim notification once the claim is approved", async () => {
  const notifSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const notifActor = notifSetup.actor;

  // ADMIN becomes the Family Steward; CLAIMANT registers as a user.
  notifActor.setIdentity(adminIdentity);
  await notifActor._initialize_access_control();
  notifActor.setIdentity(claimantIdentity);
  await notifActor._initialize_access_control();

  // CLAIMANT requests a claim on the canonical lorenzoSmithJr profile, which
  // creates a pending ProfileClaimRequested notification for the claimant.
  notifActor.setIdentity(claimantIdentity);
  const requested = (await notifActor.requestProfileClaim("lorenzoSmithJr")) as {
    ok: { id: bigint };
  };
  const claimId = requested.ok.id;

  // The claimant has a pending, unread claim notification.
  const before = await notifActor.listNotifications();
  expect(before).toHaveLength(1);
  expect(before[0]).toMatchObject({
    notificationType: { ProfileClaimRequested: null },
    read: false,
  });

  // A steward approves the claim. ADMIN is the first caller to
  // _initialize_access_control, so ADMIN is the Family Steward here.
  notifActor.setIdentity(adminIdentity);
  await notifActor.approveProfileClaim(claimId);

  // Reconcile marks the pending claim notification read/resolved.
  notifActor.setIdentity(claimantIdentity);
  const reconciled = await notifActor.reconcileClaimNotifications(claimId);
  expect(reconciled).toBe(1n);

  // The pending claim notification is now read (no longer actionable/current).
  const after = await notifActor.listNotifications();
  const claimRequested = after.find(
    (n) => "ProfileClaimRequested" in n.notificationType,
  );
  expect(claimRequested).toMatchObject({ read: true });

  // The profile status stays CLAIMED — no new claim is created.
  const profile = await notifActor.getPersonProfile("lorenzoSmithJr");
  expect(profile).toEqual([
    expect.objectContaining({
      personId: "lorenzoSmithJr",
      claimStatus: { Claimed: null },
      claimedByUserId: [CLAIMANT],
    }),
  ]);
});

// ---------------------------------------------------------------------------
// Research Intake review workflow (cover for the research review change). A
// pending Source enters the Research Review Queue with Approve/Reject/Needs
// Research actions, contributes to the steward action count, and generates the
// awaiting-review/approved/not-approved notifications without duplicates.
// getReviewQueue and getResearchAuditLog are Family-Steward-gated.
// ---------------------------------------------------------------------------

it("round-trips a research source through create -> queue -> approve with notifications", async () => {
  const researchSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const researchActor = researchSetup.actor;

  // ADMIN becomes the Family Steward; CONTRIBUTOR registers as a #user.
  researchActor.setIdentity(adminIdentity);
  await researchActor._initialize_access_control();
  researchActor.setIdentity(contributorIdentity);
  await researchActor._initialize_access_control();

  // A signed-in contributor creates a source; it enters as Pending.
  researchActor.setIdentity(contributorIdentity);
  const created = await researchActor.createSource(
    "1900 census, Norwood household",
    { CensusCitation: null },
    "Census record listing the Norwood family.",
    [],
  );
  expect(created).toEqual({
    ok: expect.objectContaining({
      title: "1900 census, Norwood household",
      sourceType: { CensusCitation: null },
      contributor: CONTRIBUTOR,
      status: { Pending: null },
    }),
  });
  const sourceId = (created as { ok: { id: bigint } }).ok.id;

  // The contributor receives the awaiting-review notification.
  const contributorNotifs = await researchActor.listNotifications();
  expect(contributorNotifs).toHaveLength(1);
  expect(contributorNotifs[0]).toMatchObject({
    recipient: CONTRIBUTOR,
    notificationType: { ResearchSubmission: null },
    message: "Your research submission is awaiting Family Steward review.",
    read: false,
  });

  // The steward sees the pending source in the review queue with the
  // Approve/Reject/Needs Research actions.
  researchActor.setIdentity(adminIdentity);
  const queue = await researchActor.getReviewQueue();
  expect(queue.pending).toBe(1n);
  expect(queue.needsResearch).toBe(0n);
  const sourceItem = queue.items.find((i) => i.kind.Source !== undefined);
  expect(sourceItem).toMatchObject({
    id: sourceId,
    title: "1900 census, Norwood household",
    status: { Pending: null },
    contributor: [CONTRIBUTOR],
  });
  expect(sourceItem!.actions).toEqual([
    { Approve: null },
    { Reject: null },
    { NeedsResearch: null },
  ]);

  // Approving transitions the source to Approved and records the approved
  // notification for the contributor.
  const approved = await researchActor.approveSource(sourceId);
  expect(approved).toEqual([
    expect.objectContaining({ id: sourceId, status: { Approved: null } }),
  ]);
  const afterApprove = await researchActor.getReviewQueue();
  expect(afterApprove.pending).toBe(0n);
  expect(afterApprove.approved).toBe(1n);

  researchActor.setIdentity(contributorIdentity);
  const approvedNotifs = await researchActor.listNotifications();
  expect(
    approvedNotifs.filter(
      (n) =>
        "ResearchApproved" in n.notificationType &&
        n.message === "Your research submission was approved.",
    ),
  ).toHaveLength(1);
});

it("rejects and marks-needs-research sources, preserving the source and notes", async () => {
  const researchSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const researchActor = researchSetup.actor;

  researchActor.setIdentity(adminIdentity);
  await researchActor._initialize_access_control();
  researchActor.setIdentity(contributorIdentity);
  await researchActor._initialize_access_control();

  // Create two sources to reject and mark needs-research.
  researchActor.setIdentity(contributorIdentity);
  const rejectCreated = await researchActor.createSource(
    "Deed record",
    { DeedPropertyReference: null },
    "A deed reference.",
    [],
  );
  const needsCreated = await researchActor.createSource(
    "Email thread",
    { EmailThread: null },
    "An email thread.",
    [],
  );
  const rejectId = (rejectCreated as { ok: { id: bigint } }).ok.id;
  const needsId = (needsCreated as { ok: { id: bigint } }).ok.id;

  // Rejecting transitions to Rejected and records the not-approved
  // notification; the source (and its notes/description) is preserved.
  researchActor.setIdentity(adminIdentity);
  const rejected = await researchActor.rejectSource(rejectId);
  expect(rejected).toEqual([
    expect.objectContaining({
      id: rejectId,
      status: { Rejected: null },
      description: "A deed reference.",
    }),
  ]);

  // Needs Research transitions to NeedsResearch, preserving the source.
  const needsResearch = await researchActor.needsResearchSource(needsId);
  expect(needsResearch).toEqual([
    expect.objectContaining({
      id: needsId,
      status: { NeedsResearch: null },
      description: "An email thread.",
    }),
  ]);

  // The queue reflects the rejected and needs-research counts.
  const queue = await researchActor.getReviewQueue();
  expect(queue.rejected).toBe(1n);
  expect(queue.needsResearch).toBe(1n);

  // The contributor receives the not-approved notification for the rejection.
  researchActor.setIdentity(contributorIdentity);
  const notifs = await researchActor.listNotifications();
  expect(
    notifs.filter(
      (n) =>
        "ResearchRejected" in n.notificationType &&
        n.message === "Your research submission was not approved.",
    ),
  ).toHaveLength(1);
});

it("marks a pending finding as Needs Research, retaining it in the queue", async () => {
  const researchSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const researchActor = researchSetup.actor;

  researchActor.setIdentity(adminIdentity);
  await researchActor._initialize_access_control();
  researchActor.setIdentity(contributorIdentity);
  await researchActor._initialize_access_control();

  // A contributor creates a source and a pending finding linked to it.
  researchActor.setIdentity(contributorIdentity);
  const sourceCreated = await researchActor.createSource(
    "1900 census, Norwood household",
    { CensusCitation: null },
    "Census record listing the Norwood family.",
    [],
  );
  const sourceId = (sourceCreated as { ok: { id: bigint } }).ok.id;
  const findingCreated = await researchActor.createFinding(
    "Birth date of Julia Norwood",
    { Documented: null },
    { PersonFact: null },
    {
      PersonFact: {
        field: "birthDate",
        value: "12 March 1898",
        personId: "julia",
      },
    },
    sourceId,
    ["julia"],
    [],
  );
  expect(findingCreated).toEqual({
    ok: expect.objectContaining({
      title: "Birth date of Julia Norwood",
      status: { Pending: null },
    }),
  });
  const findingId = (findingCreated as { ok: { id: bigint } }).ok.id;

  // The steward marks the finding as Needs Research.
  researchActor.setIdentity(adminIdentity);
  const needsResearch = await researchActor.needsResearchFinding(findingId);
  expect(needsResearch).toEqual([
    expect.objectContaining({
      id: findingId,
      status: { NeedsResearch: null },
      title: "Birth date of Julia Norwood",
    }),
  ]);

  // The finding is retained in the queue with status NEEDS_RESEARCH and the
  // queue reflects the needs-research count. The linked source is still
  // pending, so pending remains 1 (the source) while needsResearch is 1 (the
  // finding).
  const queue = await researchActor.getReviewQueue();
  expect(queue.needsResearch).toBe(1n);
  expect(queue.pending).toBe(1n);
  const findingItem = queue.items.find((i) => i.kind.Finding !== undefined);
  expect(findingItem).toMatchObject({
    id: findingId,
    title: "Birth date of Julia Norwood",
    status: { NeedsResearch: null },
  });

  // The audit log records the FindingNeedsResearch action.
  const audit = await researchActor.getResearchAuditLog();
  expect(
    audit.some(
      (e) =>
        e.action === "FindingNeedsResearch" &&
        e.summary === "Finding 'Birth date of Julia Norwood' marked as needing research",
    ),
  ).toBe(true);
});

it("gates getReviewQueue and getResearchAuditLog to Family Stewards", async () => {
  const researchSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const researchActor = researchSetup.actor;

  researchActor.setIdentity(adminIdentity);
  await researchActor._initialize_access_control();
  researchActor.setIdentity(contributorIdentity);
  await researchActor._initialize_access_control();

  // A signed-in non-steward cannot read the review queue or audit log.
  researchActor.setIdentity(contributorIdentity);
  await expect(researchActor.getReviewQueue()).rejects.toThrow();
  await expect(researchActor.getResearchAuditLog()).rejects.toThrow();

  // An anonymous caller is also rejected.
  const anonymousActor = pic!.createActor<_SERVICE>(idlFactory, researchSetup.canisterId);
  await expect(anonymousActor.getReviewQueue()).rejects.toThrow();
  await expect(anonymousActor.getResearchAuditLog()).rejects.toThrow();
});

// ---------------------------------------------------------------------------
// New Person Candidate review actions (cover for the Research Review Actions
// change). A pending candidate is created, then approved (creating exactly one
// canonical Person that preserves the candidate's source/provenance and records
// the approval in Audit History), rejected (creating no Person), or marked Needs
// Research (creating no Person). The pending count decrements immediately.
// ---------------------------------------------------------------------------

it("approves a New Person candidate, creating exactly one canonical Person and recording the audit", async () => {
  const candSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const candActor = candSetup.actor;

  candActor.setIdentity(adminIdentity);
  await candActor._initialize_access_control();
  candActor.setIdentity(contributorIdentity);
  await candActor._initialize_access_control();

  // A contributor creates a source and a New Person candidate linked to it.
  candActor.setIdentity(contributorIdentity);
  const sourceCreated = await candActor.createSource(
    "1900 census, Norwood household",
    { CensusCitation: null },
    "Census record listing the Norwood family.",
    [],
  );
  const sourceId = (sourceCreated as { ok: { id: bigint } }).ok.id;
  const candidateCreated = await candActor.createNewPersonCandidate(
    "Unknown Norwood",
    "A previously unrecorded family member.",
    sourceId,
  );
  expect(candidateCreated).toEqual({
    ok: expect.objectContaining({
      name: "Unknown Norwood",
      sourceId,
      status: { Pending: null },
    }),
  });
  const candidateId = (candidateCreated as { ok: { id: bigint } }).ok.id;

  // The steward sees the pending candidate in the review queue. The pending
  // count includes the linked source (still pending) plus the candidate.
  candActor.setIdentity(adminIdentity);
  const queueBefore = await candActor.getReviewQueue();
  expect(queueBefore.pending).toBe(2n);
  const candidateItem = queueBefore.items.find((i) => i.kind.NewPersonCandidate !== undefined);
  expect(candidateItem).toMatchObject({
    id: candidateId,
    title: "Unknown Norwood",
    status: { Pending: null },
  });
  expect(candidateItem!.actions).toEqual([
    { Approve: null },
    { Reject: null },
    { NeedsResearch: null },
  ]);

  // Approving creates exactly one canonical Person and marks the candidate
  // Approved; the pending count decrements immediately (the source remains
  // pending, so pending drops from 2 to 1).
  const approved = await candActor.approveNewPersonCandidate(candidateId);
  expect(approved).toEqual([
    expect.objectContaining({ id: candidateId, status: { Approved: null } }),
  ]);
  const queueAfter = await candActor.getReviewQueue();
  expect(queueAfter.pending).toBe(1n);
  expect(queueAfter.approved).toBe(1n);

  // The canonical Person was created (living, unclaimed) with the candidate's
  // name. uniquePersonId derives the personId from the name (lowercased, words
  // joined with no separator).
  const person = await candActor.getPersonProfile("unknownnorwood");
  expect(person).toEqual([
    expect.objectContaining({
      personId: "unknownnorwood",
      name: "Unknown Norwood",
      livingStatus: { Living: null },
      claimStatus: { Unclaimed: null },
    }),
  ]);

  // The approval is recorded in Audit History.
  const audit = await candActor.getResearchAuditLog();
  expect(
    audit.some(
      (e) =>
        e.action === "NewPersonCandidateApproved" &&
        e.summary === "New Person Candidate 'Unknown Norwood' approved and created as a canonical Person",
    ),
  ).toBe(true);
});

it("rejects and marks-needs-research New Person candidates, creating no Person", async () => {
  const candSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const candActor = candSetup.actor;

  candActor.setIdentity(adminIdentity);
  await candActor._initialize_access_control();
  candActor.setIdentity(contributorIdentity);
  await candActor._initialize_access_control();

  // A contributor creates a source and two candidates.
  candActor.setIdentity(contributorIdentity);
  const sourceCreated = await candActor.createSource(
    "1900 census, Norwood household",
    { CensusCitation: null },
    "Census record listing the Norwood family.",
    [],
  );
  const sourceId = (sourceCreated as { ok: { id: bigint } }).ok.id;
  const rejectCreated = await candActor.createNewPersonCandidate(
    "Rejected Norwood",
    "A rejected candidate.",
    sourceId,
  );
  const needsCreated = await candActor.createNewPersonCandidate(
    "NeedsResearch Norwood",
    "A needs-research candidate.",
    sourceId,
  );
  const rejectId = (rejectCreated as { ok: { id: bigint } }).ok.id;
  const needsId = (needsCreated as { ok: { id: bigint } }).ok.id;

  // Rejecting marks the candidate Rejected and creates no Person.
  candActor.setIdentity(adminIdentity);
  const rejected = await candActor.rejectNewPersonCandidate(rejectId);
  expect(rejected).toEqual([
    expect.objectContaining({ id: rejectId, status: { Rejected: null } }),
  ]);
  await expect(candActor.getPersonProfile("rejectednorwood")).resolves.toEqual([]);

  // Needs Research marks the candidate NeedsResearch and creates no Person.
  const needsResearch = await candActor.needsResearchNewPersonCandidate(needsId);
  expect(needsResearch).toEqual([
    expect.objectContaining({ id: needsId, status: { NeedsResearch: null } }),
  ]);
  await expect(candActor.getPersonProfile("needsresearchnorwood")).resolves.toEqual([]);

  // The queue reflects the rejected and needs-research counts.
  const queue = await candActor.getReviewQueue();
  expect(queue.rejected).toBe(1n);
  expect(queue.needsResearch).toBe(1n);
});

// ---------------------------------------------------------------------------
// Relationship Proposal review actions (cover for the Research Review Actions
// change). A pending proposal is approved (creating/updating the canonical
// relationship exactly once, updating the family graph, and preventing
// duplicates), rejected (leaving the graph unchanged), or marked Needs Research
// (leaving the graph unchanged). Pending counts decrement immediately.
// ---------------------------------------------------------------------------

it("approves a Relationship proposal, updating the family graph exactly once without duplicates", async () => {
  const relSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const relActor = relSetup.actor;

  relActor.setIdentity(adminIdentity);
  await relActor._initialize_access_control();
  relActor.setIdentity(contributorIdentity);
  await relActor._initialize_access_control();

  // A contributor creates a source and a relationship proposal.
  relActor.setIdentity(contributorIdentity);
  const sourceCreated = await relActor.createSource(
    "1900 census, Norwood household",
    { CensusCitation: null },
    "Census record listing the Norwood family.",
    [],
  );
  const sourceId = (sourceCreated as { ok: { id: bigint } }).ok.id;
  const proposalCreated = await relActor.createRelationshipProposal(
    "clayton",
    "julia",
    "Father",
    sourceId,
  );
  expect(proposalCreated).toEqual({
    ok: expect.objectContaining({
      fromPersonId: "clayton",
      toPersonId: "julia",
      relationshipType: "Father",
      sourceId,
      status: { Pending: null },
    }),
  });
  const proposalId = (proposalCreated as { ok: { id: bigint } }).ok.id;

  // The steward sees the pending proposal in the review queue. The pending
  // count includes the linked source (still pending) plus the proposal.
  relActor.setIdentity(adminIdentity);
  const queueBefore = await relActor.getReviewQueue();
  expect(queueBefore.pending).toBe(2n);
  const proposalItem = queueBefore.items.find((i) => i.kind.RelationshipProposal !== undefined);
  expect(proposalItem).toMatchObject({
    id: proposalId,
    title: "clayton - Father - julia",
    status: { Pending: null },
  });
  expect(proposalItem!.actions).toEqual([
    { Approve: null },
    { Reject: null },
    { NeedsResearch: null },
  ]);

  // Approving updates the family graph exactly once and marks the proposal
  // Approved; the pending count decrements immediately (the source remains
  // pending, so pending drops from 2 to 1).
  const approved = await relActor.approveRelationshipProposal(proposalId);
  expect(approved).toEqual([
    expect.objectContaining({ id: proposalId, status: { Approved: null } }),
  ]);
  const queueAfter = await relActor.getReviewQueue();
  expect(queueAfter.pending).toBe(1n);
  expect(queueAfter.approved).toBe(1n);

  // The canonical relationship is in the family graph exactly once. "Father"
  // maps to the #Parent relationship type.
  const relationships = await relActor.listConfirmedRelationships();
  const matching = relationships.filter(
    (r) =>
      r.fromPersonId === "clayton" &&
      r.toPersonId === "julia" &&
      "Parent" in r.relationshipType,
  );
  expect(matching).toHaveLength(1);

  // The approval is recorded in Audit History.
  const audit = await relActor.getResearchAuditLog();
  expect(
    audit.some(
      (e) =>
        e.action === "RelationshipProposalApproved" &&
        e.summary === "Relationship proposal 'clayton - Father - julia' approved and added to the family graph",
    ),
  ).toBe(true);
});

it("rejects and marks-needs-research Relationship proposals, leaving the family graph unchanged", async () => {
  const relSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const relActor = relSetup.actor;

  relActor.setIdentity(adminIdentity);
  await relActor._initialize_access_control();
  relActor.setIdentity(contributorIdentity);
  await relActor._initialize_access_control();

  // A contributor creates a source and two proposals.
  relActor.setIdentity(contributorIdentity);
  const sourceCreated = await relActor.createSource(
    "1900 census, Norwood household",
    { CensusCitation: null },
    "Census record listing the Norwood family.",
    [],
  );
  const sourceId = (sourceCreated as { ok: { id: bigint } }).ok.id;
  const rejectCreated = await relActor.createRelationshipProposal(
    "clayton",
    "julia",
    "Father",
    sourceId,
  );
  const needsCreated = await relActor.createRelationshipProposal(
    "clayton",
    "julia",
    "Brother",
    sourceId,
  );
  const rejectId = (rejectCreated as { ok: { id: bigint } }).ok.id;
  const needsId = (needsCreated as { ok: { id: bigint } }).ok.id;

  // Rejecting marks the proposal Rejected and leaves the graph unchanged.
  relActor.setIdentity(adminIdentity);
  const rejected = await relActor.rejectRelationshipProposal(rejectId);
  expect(rejected).toEqual([
    expect.objectContaining({ id: rejectId, status: { Rejected: null } }),
  ]);
  await expect(relActor.listConfirmedRelationships()).resolves.toEqual([]);

  // Needs Research marks the proposal NeedsResearch and leaves the graph unchanged.
  const needsResearch = await relActor.needsResearchRelationshipProposal(needsId);
  expect(needsResearch).toEqual([
    expect.objectContaining({ id: needsId, status: { NeedsResearch: null } }),
  ]);
  await expect(relActor.listConfirmedRelationships()).resolves.toEqual([]);

  // The queue reflects the rejected and needs-research counts.
  const queue = await relActor.getReviewQueue();
  expect(queue.rejected).toBe(1n);
  expect(queue.needsResearch).toBe(1n);
});

// ---------------------------------------------------------------------------
// Conflict Review lifecycle (cover for the Conflict Review change). When a
// Proposed Finding labelled `#Conflicting` is approved, it is routed to a
// Conflict Review item instead of silently overwriting canonical data. The item
// captures the affected Person, the disputed field, both the existing canonical
// value and the proposed value, the proposed finding's source, and its evidence
// label. Canonical data is never altered at creation. A steward then resolves
// the item with one of four explicit actions (Keep Existing, Replace Existing,
// Preserve Both / Unresolved, Needs Research), each recording an audit entry.
// These tests run against dedicated canisters so the resolution state never
// leaks into the shared `actor` canister the other tests use.
// ---------------------------------------------------------------------------

// A helper that seeds a `#Conflicting` PersonFact finding on the canonical
// lorenzoSmithJr profile (whose preferredName is 'Waxx Minty' from the
// 20260907_000000.mo migration) and routes it to Conflict Review by approving
// it as a steward. Returns the created conflict review item id and the finding
// id.
async function routeConflictingFindingToReview(
  conflictActor: _SERVICE,
): Promise<{ conflictId: bigint; findingId: bigint }> {
  // ADMIN becomes the Family Steward; CONTRIBUTOR registers as a #user.
  conflictActor.setIdentity(adminIdentity);
  await conflictActor._initialize_access_control();
  conflictActor.setIdentity(contributorIdentity);
  await conflictActor._initialize_access_control();

  // A signed-in contributor creates a source and a `#Conflicting` PersonFact
  // finding that disagrees with the canonical preferredName 'Waxx Minty'.
  conflictActor.setIdentity(contributorIdentity);
  const sourceCreated = await conflictActor.createSource(
    "1900 census, Norwood household",
    { CensusCitation: null },
    "Census record listing the Norwood family.",
    [],
  );
  const sourceId = (sourceCreated as { ok: { id: bigint } }).ok.id;
  const findingCreated = await conflictActor.createFinding(
    "Preferred name of Lorenzo Smith Jr.",
    { Conflicting: null },
    { PersonFact: null },
    {
      PersonFact: {
        field: "preferredName",
        value: "Lorenzo Smith Jr.",
        personId: "lorenzoSmithJr",
      },
    },
    sourceId,
    ["lorenzoSmithJr"],
    [],
  );
  expect(findingCreated).toEqual({
    ok: expect.objectContaining({
      title: "Preferred name of Lorenzo Smith Jr.",
      status: { Pending: null },
    }),
  });
  const findingId = (findingCreated as { ok: { id: bigint } }).ok.id;

  // A steward approves the `#Conflicting` finding, which routes it to Conflict
  // Review instead of silently overwriting canonical data.
  conflictActor.setIdentity(adminIdentity);
  const approved = await conflictActor.approveFinding(findingId);
  expect(approved).toEqual([
    expect.objectContaining({
      id: findingId,
      status: { Conflicting: null },
    }),
  ]);

  // The conflict review item was created with the canonical and proposed values
  // and the proposed finding's source.
  const items = await conflictActor.listConflictReviewItems();
  const conflict = items.find((c) => c.findingId === findingId);
  expect(conflict).toBeDefined();
  expect(conflict).toMatchObject({
    findingId,
    personId: ["lorenzoSmithJr"],
    field: "preferredName",
    canonicalValue: "Waxx Minty",
    proposedValue: "Lorenzo Smith Jr.",
    proposedSourceId: [sourceId],
    evidenceLabel: { Conflicting: null },
    stewardNotes: "",
  });
  return { conflictId: conflict!.id, findingId };
}

it("creates a Conflict Review item on a disagreeing finding and leaves canonical data unchanged", async () => {
  const conflictSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const conflictActor = conflictSetup.actor;

  const { conflictId, findingId } = await routeConflictingFindingToReview(conflictActor);

  // The conflict review item exists with the disputed field and both values.
  const items = await conflictActor.listConflictReviewItems();
  const conflict = items.find((c) => c.id === conflictId);
  expect(conflict).toMatchObject({
    id: conflictId,
    findingId,
    personId: ["lorenzoSmithJr"],
    field: "preferredName",
    canonicalValue: "Waxx Minty",
    proposedValue: "Lorenzo Smith Jr.",
    evidenceLabel: { Conflicting: null },
  });

  // Canonical data is NEVER altered at conflict creation: the canonical
  // preferredName stays 'Waxx Minty' before any review decision.
  const profile = await conflictActor.getPersonProfile("lorenzoSmithJr");
  expect(profile).toEqual([
    expect.objectContaining({
      personId: "lorenzoSmithJr",
      preferredName: ["Waxx Minty"],
    }),
  ]);
});

it("resolves a conflict with Keep Existing, leaving canonical unchanged and preserving the proposed research", async () => {
  const conflictSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const conflictActor = conflictSetup.actor;

  const { conflictId, findingId } = await routeConflictingFindingToReview(conflictActor);

  // Keep Existing resolves the conflict (#Approved) and leaves canonical data
  // unchanged.
  conflictActor.setIdentity(adminIdentity);
  const resolved = await conflictActor.resolveConflict(
    conflictId,
    { KeepExisting: null },
    "Canonical record is authoritative",
  );
  expect(resolved).toEqual([
    expect.objectContaining({
      id: conflictId,
      status: { Approved: null },
      stewardNotes: "Canonical record is authoritative",
      resolvedBy: [ADMIN],
    }),
  ]);

  // Canonical data is unchanged.
  const profile = await conflictActor.getPersonProfile("lorenzoSmithJr");
  expect(profile).toEqual([
    expect.objectContaining({ preferredName: ["Waxx Minty"] }),
  ]);

  // The linked finding is marked Rejected (the proposed research is preserved
  // but not adopted), and the conflict is no longer unresolved.
  const finding = await conflictActor.getFinding(findingId);
  expect(finding).toEqual([
    expect.objectContaining({ id: findingId, status: { Rejected: null } }),
  ]);
  const items = await conflictActor.listConflictReviewItems();
  expect(items.find((c) => c.id === conflictId)!.status).toEqual({ Approved: null });

  // The resolution is recorded in Audit History.
  const audit = await conflictActor.getResearchAuditLog();
  expect(
    audit.some(
      (e) =>
        e.action === "ConflictResolved" &&
        e.summary === "Conflict Review item #" + conflictId.toString() + " resolved (KeepExisting)",
    ),
  ).toBe(true);
});

it("resolves a conflict with Replace Existing, updating canonical once and preserving old + new provenance", async () => {
  const conflictSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const conflictActor = conflictSetup.actor;

  const { conflictId, findingId } = await routeConflictingFindingToReview(conflictActor);

  // Replace Existing writes the proposed value into canonical data exactly once
  // and resolves the conflict (#Approved).
  conflictActor.setIdentity(adminIdentity);
  const resolved = await conflictActor.resolveConflict(
    conflictId,
    { ReplaceExisting: null },
    "New source is more reliable",
  );
  expect(resolved).toEqual([
    expect.objectContaining({
      id: conflictId,
      status: { Approved: null },
      stewardNotes: "New source is more reliable",
      resolvedBy: [ADMIN],
    }),
  ]);

  // The canonical preferredName is now the proposed value.
  const profile = await conflictActor.getPersonProfile("lorenzoSmithJr");
  expect(profile).toEqual([
    expect.objectContaining({
      personId: "lorenzoSmithJr",
      preferredName: ["Lorenzo Smith Jr."],
    }),
  ]);

  // The old value and its provenance are preserved in the conflict/audit
  // history: the conflict item still records the canonical value 'Waxx Minty'
  // it replaced.
  const items = await conflictActor.listConflictReviewItems();
  expect(items.find((c) => c.id === conflictId)).toMatchObject({
    canonicalValue: "Waxx Minty",
    proposedValue: "Lorenzo Smith Jr.",
  });

  // The linked finding is marked Approved (the proposed research was adopted).
  const finding = await conflictActor.getFinding(findingId);
  expect(finding).toEqual([
    expect.objectContaining({ id: findingId, status: { Approved: null } }),
  ]);

  // The resolution is recorded in Audit History.
  const audit = await conflictActor.getResearchAuditLog();
  expect(
    audit.some(
      (e) =>
        e.action === "ConflictResolved" &&
        e.summary === "Conflict Review item #" + conflictId.toString() + " resolved (ReplaceExisting)",
    ),
  ).toBe(true);
});

it("keeps both values visible as an unresolved conflict with Preserve Both", async () => {
  const conflictSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const conflictActor = conflictSetup.actor;

  const { conflictId } = await routeConflictingFindingToReview(conflictActor);

  // Preserve Both keeps the item #Conflicting (unresolved) without silently
  // choosing either value, and leaves canonical data unchanged.
  conflictActor.setIdentity(adminIdentity);
  const resolved = await conflictActor.resolveConflict(
    conflictId,
    { PreserveBoth: null },
    "Keep both until more evidence",
  );
  expect(resolved).toEqual([
    expect.objectContaining({
      id: conflictId,
      status: { Conflicting: null },
      stewardNotes: "Keep both until more evidence",
    }),
  ]);

  // Canonical data is unchanged.
  const profile = await conflictActor.getPersonProfile("lorenzoSmithJr");
  expect(profile).toEqual([
    expect.objectContaining({ preferredName: ["Waxx Minty"] }),
  ]);

  // The conflict remains unresolved (#Conflicting) and is surfaced by
  // listConflictsForPerson.
  const items = await conflictActor.listConflictReviewItems();
  expect(items.find((c) => c.id === conflictId)!.status).toEqual({ Conflicting: null });
  const surfaced = await conflictActor.listConflictsForPerson("lorenzoSmithJr");
  expect(surfaced.map((c) => c.id)).toContain(conflictId);
});

it("retains the conflict with Needs Research status, leaving canonical unchanged", async () => {
  const conflictSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const conflictActor = conflictSetup.actor;

  const { conflictId, findingId } = await routeConflictingFindingToReview(conflictActor);

  // Needs Research leaves canonical data unchanged and retains the conflict
  // with #NeedsResearch status.
  conflictActor.setIdentity(adminIdentity);
  const resolved = await conflictActor.resolveConflict(
    conflictId,
    { NeedsResearch: null },
    "Need to verify the source",
  );
  expect(resolved).toEqual([
    expect.objectContaining({
      id: conflictId,
      status: { NeedsResearch: null },
      stewardNotes: "Need to verify the source",
    }),
  ]);

  // Canonical data is unchanged.
  const profile = await conflictActor.getPersonProfile("lorenzoSmithJr");
  expect(profile).toEqual([
    expect.objectContaining({ preferredName: ["Waxx Minty"] }),
  ]);

  // The conflict is retained with #NeedsResearch status and surfaced.
  const items = await conflictActor.listConflictReviewItems();
  expect(items.find((c) => c.id === conflictId)!.status).toEqual({ NeedsResearch: null });
  const surfaced = await conflictActor.listConflictsForPerson("lorenzoSmithJr");
  expect(surfaced.map((c) => c.id)).toContain(conflictId);

  // The linked finding is marked NeedsResearch.
  const finding = await conflictActor.getFinding(findingId);
  expect(finding).toEqual([
    expect.objectContaining({ id: findingId, status: { NeedsResearch: null } }),
  ]);
});

it("records audit entries for every conflict resolution and persists state across callers", async () => {
  const conflictSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const conflictActor = conflictSetup.actor;

  const { conflictId } = await routeConflictingFindingToReview(conflictActor);

  // Resolve the conflict as the steward.
  conflictActor.setIdentity(adminIdentity);
  await conflictActor.resolveConflict(
    conflictId,
    { KeepExisting: null },
    "Canonical is authoritative",
  );

  // The audit log records the resolution with the acting steward and timestamp.
  const audit = await conflictActor.getResearchAuditLog();
  const resolution = audit.find(
    (e) =>
      e.action === "ConflictResolved" &&
      e.summary === "Conflict Review item #" + conflictId.toString() + " resolved (KeepExisting)",
  );
  expect(resolution).toBeDefined();
  expect(resolution!.actorId).toEqual(ADMIN);
  expect(resolution!.timestamp).toEqual(expect.any(BigInt));

  // State persists across sign out/sign in: a fresh actor (a different caller
  // session) reading the same canister still sees the resolved conflict and the
  // unchanged canonical value. The conflict item is steward-readable and the
  // canonical profile is public.
  const freshActor = pic!.createActor<_SERVICE>(idlFactory, conflictSetup.canisterId);
  freshActor.setIdentity(adminIdentity);
  const items = await freshActor.listConflictReviewItems();
  expect(items.find((c) => c.id === conflictId)!.status).toEqual({ Approved: null });
  const profile = await freshActor.getPersonProfile("lorenzoSmithJr");
  expect(profile).toEqual([
    expect.objectContaining({ preferredName: ["Waxx Minty"] }),
  ]);
});

it("gates listConflictReviewItems and resolveConflict to Family Stewards", async () => {
  const conflictSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const conflictActor = conflictSetup.actor;

  const { conflictId } = await routeConflictingFindingToReview(conflictActor);

  // A signed-in non-steward cannot list or resolve conflict review items.
  conflictActor.setIdentity(contributorIdentity);
  await expect(conflictActor.listConflictReviewItems()).rejects.toThrow();
  await expect(
    conflictActor.resolveConflict(conflictId, { KeepExisting: null }, ""),
  ).rejects.toThrow();

  // An anonymous caller is also rejected.
  const anonymousActor = pic!.createActor<_SERVICE>(idlFactory, conflictSetup.canisterId);
  await expect(anonymousActor.listConflictReviewItems()).rejects.toThrow();
  await expect(
    anonymousActor.resolveConflict(conflictId, { KeepExisting: null }, ""),
  ).rejects.toThrow();
});

it("counts each unresolved conflict exactly once in the review queue, not double-counting the linked finding", async () => {
  const conflictSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const conflictActor = conflictSetup.actor;

  const { conflictId } = await routeConflictingFindingToReview(conflictActor);

  // The conflict item is created as #Conflicting (unresolved) and the linked
  // finding is excluded from the queue, so the unresolved conflict is counted
  // exactly once — not double-counted as both a finding and a conflict item.
  conflictActor.setIdentity(adminIdentity);
  const queue = await conflictActor.getReviewQueue();
  expect(queue.conflicting).toBe(1n);

  // The linked finding is not present as a separate queue item.
  const findingItems = queue.items.filter((i) => i.kind.Finding !== undefined);
  expect(findingItems).toHaveLength(0);

  // The conflict item is present in the queue exactly once, as #Conflicting.
  const conflictItems = queue.items.filter((i) => i.kind.ConflictReview !== undefined);
  expect(conflictItems).toHaveLength(1);
  expect(conflictItems[0]).toMatchObject({
    id: conflictId,
    status: { Conflicting: null },
  });
});
