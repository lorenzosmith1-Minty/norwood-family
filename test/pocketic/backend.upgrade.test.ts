import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";

const PIC_URL = process.env.POCKET_IC_URL ?? "";
const BACKEND_WASM = process.env.BACKEND_WASM ?? "";
const PREVIOUS_WASM = process.env.BACKEND_WASM_PREVIOUS ?? "";

let pic: PocketIc | undefined;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
});

afterAll(async () => {
  await pic?.tearDown();
});

// The branding change is frontend-only, so the backend Candid interface is
// identical between the previous revision and this build — the current
// idlFactory (a pure codec) is therefore valid for both installs. (The previous
// revision's own declarations under `.old/` cannot be imported here: they live
// outside the app's package tree, so their `@icp-sdk/core/candid` import does
// not resolve.)
//
// Every deployment of a modified app is a canister upgrade of the version
// already running. This test installs the previous revision's wasm, writes a
// photo through its public API, upgrades to this build's wasm (replaying the
// migration chain), and asserts the photo survives — the one thing the frontend
// suite cannot see.
it("carries photos written by the previous version through the upgrade", async () => {
  // 1. Install the version the user is actually running.
  const previous = await pic!.setupCanister<_SERVICE>({
    idlFactory,
    wasm: PREVIOUS_WASM,
  });

  // 2. Write data through the OLD public API, as the deployed app did.
  const blob = new Uint8Array([7, 8, 9]);
  await previous.actor.addPhoto("julia", "julia-old.png", "image/png", blob);

  // 3. Upgrade to the version this build produces. The migration runs here.
  //    `wasm_memory_persistence: keep` is REQUIRED: these canisters are built
  //    with enhanced orthogonal persistence, and an upgrade without it is
  //    rejected with "Missing upgrade option".
  await pic!.upgradeCanister({
    canisterId: previous.canisterId,
    wasm: BACKEND_WASM,
    upgradeModeOptions: {
      skip_pre_upgrade: [],
      wasm_memory_persistence: [{ keep: null }],
    },
  });

  // 4. Read through the NEW API and assert both survival and the new shape.
  const upgraded = pic!.createActor<_SERVICE>(idlFactory, previous.canisterId);
  const photos = await upgraded.listPhotos("julia");
  expect(photos).toHaveLength(1);
  expect(photos[0]).toMatchObject({ filename: "julia-old.png" });
  // The first photo remains the profile photo after the upgrade.
  const profile = await upgraded.getProfilePhoto("julia");
  expect(profile).toEqual([
    expect.objectContaining({ filename: "julia-old.png" }),
  ]);

  // The migration initializes the new account-identity map: a signed-in caller
  // can bind an auth method and read their stable account id after the upgrade.
  const accountIdentity = createIdentity("upgrade-account-seed");
  upgraded.setIdentity(accountIdentity);
  const bound = await upgraded.bindAuthMethod({ Google: null });
  expect(bound).toEqual({
    ok: {
      id: accountIdentity.getPrincipal(),
      createdAt: expect.any(BigInt),
      authMethods: [{ Google: null }],
    },
  });
  await expect(upgraded.getMyAccountId()).resolves.toEqual({
    ok: accountIdentity.getPrincipal(),
  });
});

// The 20260907_000000.mo migration sets the canonical lorenzoSmithJr profile's
// preferredName to 'Waxx Minty' so the child card on Lorenzo Smith Sr.'s profile
// resolves the canonical display name. The previous revision already carries
// this migration (it was added in the prior canonical-display-name build), so
// installing it seeds lorenzoSmithJr with preferredName 'Waxx Minty'. This test
// installs the previous revision, upgrades to this build (replaying the
// migration chain), and asserts the preferredName stays 'Waxx Minty' while the
// `name` field is unchanged.
it("keeps lorenzoSmithJr's preferredName as 'Waxx Minty' on upgrade", async () => {
  // 1. Install the version the user is actually running. The seed migration
  //    (20260905_080000.mo) and the canonical-display-name migration
  //    (20260907_000000.mo) run here, seeding lorenzoSmithJr with preferredName
  //    'Waxx Minty'.
  const previous = await pic!.setupCanister<_SERVICE>({
    idlFactory,
    wasm: PREVIOUS_WASM,
  });

  // 2. Confirm the previous revision seeded lorenzoSmithJr with the Waxx Minty
  //    preferredName.
  const before = await previous.actor.getPersonProfile("lorenzoSmithJr");
  expect(before).toEqual([
    expect.objectContaining({
      personId: "lorenzoSmithJr",
      name: "Lorenzo Smith Jr.",
      preferredName: ["Waxx Minty"],
    }),
  ]);

  // 3. Upgrade to the version this build produces. The new migration runs here.
  await pic!.upgradeCanister({
    canisterId: previous.canisterId,
    wasm: BACKEND_WASM,
    upgradeModeOptions: {
      skip_pre_upgrade: [],
      wasm_memory_persistence: [{ keep: null }],
    },
  });

  // 4. Read through the NEW API: the preferredName is now 'Waxx Minty' and the
  //    `name` field is unchanged.
  const upgraded = pic!.createActor<_SERVICE>(idlFactory, previous.canisterId);
  const profile = await upgraded.getPersonProfile("lorenzoSmithJr");
  expect(profile).toEqual([
    expect.objectContaining({
      personId: "lorenzoSmithJr",
      name: "Lorenzo Smith Jr.",
      preferredName: ["Waxx Minty"],
    }),
  ]);
});

// The expanded Edit My Profile build adds a migration (20260906_020000.mo) that
// introduces the separate owner-editable identity/basic/about fields
// (firstName, middleName, lastName, suffix, nickname, shortBio, longerStory,
// birthDate, birthplace, currentLocation) to every existing Person Profile,
// defaulting each to null (unset). The later duplicate-consolidation migration
// (20260908_000000.mo) removes any runtime-created duplicate Lorenzo Smith Jr.
// profile (keyed by the caller's principal) and consolidates it into the
// canonical lorenzoSmithJr record. This test installs the previous revision,
// creates a profile via createMyself, upgrades to this build (replaying the new
// migrations), and asserts the duplicate is consolidated into the canonical
// record, which carries the expanded owner-editable fields while its identity
// survives.
it("consolidates a duplicate Lorenzo Smith Jr. profile into the canonical record with expanded fields on upgrade", async () => {
  // 1. Install the version the user is actually running.
  const previous = await pic!.setupCanister<_SERVICE>({
    idlFactory,
    wasm: PREVIOUS_WASM,
  });

  // 2. A signed-in user creates a profile via createMyself (keyed by the
  //    caller's principal). This is a duplicate of the canonical record.
  const identity = createIdentity("field-expansion-seed");
  previous.actor.setIdentity(identity);
  const created = await previous.actor.createMyself("Lorenzo Smith Jr.");
  expect(created).toEqual({
    ok: expect.objectContaining({ name: "Lorenzo Smith Jr." }),
  });
  const personId = identity.getPrincipal().toText();

  // 3. Upgrade to the version this build produces. The new migrations run here.
  await pic!.upgradeCanister({
    canisterId: previous.canisterId,
    wasm: BACKEND_WASM,
    upgradeModeOptions: {
      skip_pre_upgrade: [],
      wasm_memory_persistence: [{ keep: null }],
    },
  });

  // 4. Read through the NEW API: the duplicate principal-keyed profile is
  //    consolidated into the canonical record, so it no longer resolves on its
  //    own, while the canonical lorenzoSmithJr record survives with the expanded
  //    owner-editable fields (defaulting to unset).
  const upgraded = pic!.createActor<_SERVICE>(idlFactory, previous.canisterId);
  const removed = await upgraded.getPersonProfile(personId);
  expect(removed).toEqual([]);
  const canonical = await upgraded.getPersonProfile("lorenzoSmithJr");
  expect(canonical).toEqual([
    expect.objectContaining({
      personId: "lorenzoSmithJr",
      name: "Lorenzo Smith Jr.",
      firstName: [],
      lastName: [],
      birthDate: [],
      shortBio: [],
    }),
  ]);
});

// The expanded Edit My Profile migration (20260906_020000.mo) carries all other
// state through unchanged, so a pending relationship request written by the
// previous version survives the upgrade. The later duplicate-consolidation
// migration (20260908_000000.mo) re-points, not drops, any pending relationship
// request referencing a removed duplicate personId to the canonical personId, so
// the child relationship under Lorenzo Smith Sr. resolves to the canonical
// record. This test installs the previous revision, files a pending relationship
// request from a duplicate Lorenzo Smith Jr. profile, upgrades to this build,
// and asserts the request is preserved with its requesting person re-pointed to
// the canonical record.
it("preserves a pending relationship request through the upgrade, re-pointing the duplicate requester to the canonical record", async () => {
  // 1. Install the version the user is actually running.
  const previous = await pic!.setupCanister<_SERVICE>({
    idlFactory,
    wasm: PREVIOUS_WASM,
  });

  // 2. A signed-in user creates a profile and files a pending relationship
  //    request referencing it.
  const identity = createIdentity("rel-preserve-seed");
  previous.actor.setIdentity(identity);
  const created = await previous.actor.createMyself("Lorenzo Smith Jr.");
  expect(created).toEqual({
    ok: expect.objectContaining({ name: "Lorenzo Smith Jr." }),
  });
  const personId = identity.getPrincipal().toText();
  const rel = await previous.actor.proposeRelationship(
    personId,
    "lorenzoSmithSr",
    { Child: null },
  );
  expect(rel).toEqual({
    ok: expect.objectContaining({
      requestingPersonId: personId,
      status: { Pending: null },
    }),
  });
  const relId = (rel as { ok: { id: bigint } }).ok.id;

  // 3. Upgrade to the version this build produces. The new migration runs here.
  await pic!.upgradeCanister({
    canisterId: previous.canisterId,
    wasm: BACKEND_WASM,
    upgradeModeOptions: {
      skip_pre_upgrade: [],
      wasm_memory_persistence: [{ keep: null }],
    },
  });

  // 4. Read through the NEW API: the pending relationship request is preserved
  //    with its person ids intact, but the duplicate requester is re-pointed to
  //    the canonical lorenzoSmithJr record.
  const upgraded = pic!.createActor<_SERVICE>(idlFactory, previous.canisterId);
  const preservedRel = await upgraded.getRelationshipRequest(relId);
  expect(preservedRel).toEqual([
    expect.objectContaining({
      id: relId,
      requestingPersonId: "lorenzoSmithJr",
      relatedPersonId: "lorenzoSmithSr",
      status: { Pending: null },
    }),
  ]);
});

// The claim-restoration migration (20260908_120000.mo) restores the canonical
// Lorenzo Smith Jr. / Waxx Minty profile to CLAIMED from an existing approved
// claim and consolidates a duplicate's uploaded gallery into the canonical
// gallery, so the previously approved ownership and the user's real photos
// survive a redeploy. This test installs the previous revision, creates a
// duplicate Lorenzo Smith Jr. profile with an uploaded photo, files and approves
// a claim on the canonical profile, upgrades to this build (replaying the new
// migration), and asserts the canonical record stays CLAIMED by the same owner,
// the duplicate is removed (exactly one canonical record remains), and the
// duplicate's photo is restored into the canonical gallery.
it("restores the canonical claim and consolidates a duplicate's gallery on upgrade", async () => {
  // 1. Install the version the user is actually running.
  const previous = await pic!.setupCanister<_SERVICE>({
    idlFactory,
    wasm: PREVIOUS_WASM,
  });

  const claimant = createIdentity("restore-claimant-seed");
  const steward = createIdentity("restore-steward-seed");
  const CLAIMANT = claimant.getPrincipal();

  // Register the steward as the first caller (admin) and the claimant as a user.
  previous.actor.setIdentity(steward);
  await previous.actor._initialize_access_control();
  previous.actor.setIdentity(claimant);
  await previous.actor._initialize_access_control();

  // 2. The claimant creates a duplicate Lorenzo Smith Jr. profile (keyed by the
  //    caller's principal) and uploads a real photo to its gallery.
  previous.actor.setIdentity(claimant);
  const created = await previous.actor.createMyself("Lorenzo Smith Jr.");
  expect(created).toEqual({
    ok: expect.objectContaining({ name: "Lorenzo Smith Jr." }),
  });
  const dupId = CLAIMANT.toText();
  await previous.actor.addPhoto(
    dupId,
    "dup-waxx.png",
    "image/png",
    new Uint8Array([1, 2, 3]),
  );

  // 3. The claimant files a claim on the canonical profile and the steward
  //    approves it, so the canonical record is CLAIMED by the claimant.
  const pending = await previous.actor.requestProfileClaim("lorenzoSmithJr");
  expect(pending).toEqual({
    ok: expect.objectContaining({
      personId: "lorenzoSmithJr",
      status: { Pending: null },
    }),
  });
  const claimId = (pending as { ok: { id: bigint } }).ok.id;
  previous.actor.setIdentity(steward);
  const approved = await previous.actor.approveProfileClaim(claimId);
  expect(approved).toEqual([
    expect.objectContaining({ id: claimId, status: { Approved: null } }),
  ]);

  // 4. Upgrade to the version this build produces. The new migration runs here.
  await pic!.upgradeCanister({
    canisterId: previous.canisterId,
    wasm: BACKEND_WASM,
    upgradeModeOptions: {
      skip_pre_upgrade: [],
      wasm_memory_persistence: [{ keep: null }],
    },
  });

  // 5. Read through the NEW API: the canonical profile stays CLAIMED by the
  //    same owner, the duplicate is removed (exactly one canonical record
  //    remains), and the duplicate's photo is restored into the canonical
  //    gallery.
  const upgraded = pic!.createActor<_SERVICE>(idlFactory, previous.canisterId);

  // The duplicate profile is removed; exactly one canonical record remains.
  expect(await upgraded.getPersonProfile(dupId)).toEqual([]);
  const canonical = await upgraded.getPersonProfile("lorenzoSmithJr");
  expect(canonical).toEqual([
    expect.objectContaining({
      personId: "lorenzoSmithJr",
      name: "Lorenzo Smith Jr.",
      claimStatus: { Claimed: null },
      claimedByUserId: [CLAIMANT],
    }),
  ]);

  // The approved claim is preserved on the canonical personId.
  upgraded.setIdentity(steward);
  const claims = await upgraded.listProfileClaims();
  const canonicalApproved = claims.filter(
    (c) => c.personId === "lorenzoSmithJr" && c.status.Approved !== undefined,
  );
  expect(canonicalApproved).toHaveLength(1);
  expect(canonicalApproved[0]).toMatchObject({
    personId: "lorenzoSmithJr",
    requestingUserId: CLAIMANT,
  });

  // The duplicate's uploaded photo is restored into the canonical gallery.
  const photos = await upgraded.listPhotos("lorenzoSmithJr");
  expect(photos.some((p) => p.filename === "dup-waxx.png")).toBe(true);
});
