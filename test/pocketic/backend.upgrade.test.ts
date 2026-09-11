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

// The duplicate-consolidation migrations (20260908_000000.mo and
// 20260908_120000.mo) and the steward-fields migration (20260909_000000.mo) are
// already present in the previous revision (`.old/`), so they run at INSTALL
// time of the previous wasm — before any runtime data is written. A duplicate
// Lorenzo Smith Jr. profile created via createMyself on the previous revision is
// therefore carried through the upgrade unchanged: the migration chain does not
// re-run already-applied migrations, so there is no consolidation to observe on
// upgrade. Testing "consolidation on upgrade" would require a previous revision
// that predates the consolidation migrations, which this build's `.old/` does
// not provide. Those scenarios are not applicable to this build's upgrade path
// and are intentionally not asserted here.
//
// The 20260912_000000.mo migration (this build) is the data-persistence repair.
// The previous revision already carries 20260911_000000.mo, so that migration
// runs at INSTALL of the previous wasm — before any runtime-created duplicate
// exists — and is already applied when this build upgrades. The 20260912
// migration therefore runs on upgrade and handles a duplicate Lorenzo Smith Jr.
// profile that STILL EXISTS at upgrade time — a runtime createMyself record
// keyed by the caller's principal whose normalized name matches "lorenzo smith
// jr". It recovers the real ownership link from that duplicate (claimStatus
// #Claimed, claimedByUserId = ?owner), restores it onto the canonical
// lorenzoSmithJr profile, and consolidates the duplicate's gallery into the
// canonical gallery so user-uploaded media is never orphaned. This test
// installs the previous revision, creates that exact duplicate and uploads a
// photo to it, upgrades to this build (replaying the new migration), and
// asserts both halves: the canonical profile is CLAIMED by the recovered owner,
// and the photo survives under the canonical personId.
it("restores the canonical Lorenzo Smith Jr. ownership and recovers orphaned media from a duplicate profile on upgrade", async () => {
  const ownerIdentity = createIdentity("lorenzo-owner-seed");
  const owner = ownerIdentity.getPrincipal();

  // 1. Install the version the user is actually running.
  const previous = await pic!.setupCanister<_SERVICE>({
    idlFactory,
    wasm: PREVIOUS_WASM,
  });

  // 2. Create a duplicate Lorenzo Smith Jr. profile via createMyself. It is
  //    keyed by the caller's principal and CLAIMED by that caller — the exact
  //    runtime record the repair migration recovers ownership from.
  previous.actor.setIdentity(ownerIdentity);
  const created = await previous.actor.createMyself("Lorenzo Smith Jr.");
  expect(created).toEqual({
    ok: expect.objectContaining({
      personId: owner.toText(),
      claimStatus: { Claimed: null },
      claimedByUserId: [owner],
    }),
  });
  const dupPersonId = owner.toText();

  // 3. Upload a real photo to the duplicate profile so there is orphaned media
  //    to recover once the duplicate is consolidated away.
  const blob = new Uint8Array([4, 5, 6]);
  const photo = await previous.actor.addPhoto(
    dupPersonId,
    "waxx-recovered.png",
    "image/png",
    blob,
  );
  expect(photo.filename).toBe("waxx-recovered.png");

  // 4. Upgrade to the version this build produces. The 20260911 migration runs
  //    here, consolidating the duplicate and restoring ownership + media.
  await pic!.upgradeCanister({
    canisterId: previous.canisterId,
    wasm: BACKEND_WASM,
    upgradeModeOptions: {
      skip_pre_upgrade: [],
      wasm_memory_persistence: [{ keep: null }],
    },
  });

  // 5. The canonical profile is now CLAIMED by the recovered owner — the
  //    account-to-person ownership link is restored without a new claim.
  const upgraded = pic!.createActor<_SERVICE>(idlFactory, previous.canisterId);
  const profile = await upgraded.getPersonProfile("lorenzoSmithJr");
  expect(profile).toEqual([
    expect.objectContaining({
      personId: "lorenzoSmithJr",
      claimStatus: { Claimed: null },
      claimedByUserId: [owner],
    }),
  ]);

  // 6. The orphaned photo is recovered into the canonical gallery, keyed by the
  //    canonical personId — no media is lost.
  const photos = await upgraded.listPhotos("lorenzoSmithJr");
  expect(photos.map((p) => p.filename)).toContain("waxx-recovered.png");
});

// The 20260912_000000.mo migration (this build) also restores Family Steward
// permission from surviving state. When the recovered owner held the #admin
// role (surviving in accessControlState, which the data-loss migration does not
// touch) but no steward record survives, the migration adds an #Active steward
// record for that owner so the durable steward permission is not lost. This
// test installs the previous revision, makes the owner the first admin, creates
// a duplicate Lorenzo Smith Jr. profile CLAIMED by that owner, upgrades to this
// build, and asserts both halves: the canonical profile is CLAIMED by the owner
// and the owner now holds an #Active Family Steward record.
it("restores Family Steward permission for the recovered owner from surviving admin state on upgrade", async () => {
  const ownerIdentity = createIdentity("lorenzo-steward-owner-seed");
  const owner = ownerIdentity.getPrincipal();

  // 1. Install the version the user is actually running.
  const previous = await pic!.setupCanister<_SERVICE>({
    idlFactory,
    wasm: PREVIOUS_WASM,
  });

  // 2. The owner is the first caller to _initialize_access_control, so they
  //    become the #admin — the surviving privileged evidence the repair
  //    migration reads to restore Family Steward permission.
  previous.actor.setIdentity(ownerIdentity);
  await previous.actor._initialize_access_control();

  // 3. Create a duplicate Lorenzo Smith Jr. profile via createMyself, CLAIMED
  //    by the owner — the runtime record the repair migration recovers
  //    ownership from.
  const created = await previous.actor.createMyself("Lorenzo Smith Jr.");
  expect(created).toEqual({
    ok: expect.objectContaining({
      personId: owner.toText(),
      claimStatus: { Claimed: null },
      claimedByUserId: [owner],
    }),
  });

  // 4. Upgrade to the version this build produces. The 20260911 migration runs
  //    here, restoring ownership and, because the owner is an admin with no
  //    surviving steward record, adding an active Family Steward record.
  await pic!.upgradeCanister({
    canisterId: previous.canisterId,
    wasm: BACKEND_WASM,
    upgradeModeOptions: {
      skip_pre_upgrade: [],
      wasm_memory_persistence: [{ keep: null }],
    },
  });

  // 5. The canonical profile is CLAIMED by the recovered owner.
  const upgraded = pic!.createActor<_SERVICE>(idlFactory, previous.canisterId);
  const profile = await upgraded.getPersonProfile("lorenzoSmithJr");
  expect(profile).toEqual([
    expect.objectContaining({
      personId: "lorenzoSmithJr",
      claimStatus: { Claimed: null },
      claimedByUserId: [owner],
    }),
  ]);

  // 6. The owner now holds an active Family Steward record (restored from the
  //    surviving admin role). listStewards is steward-gated; the owner is now a
  //    steward, so the call resolves and lists them as an Active steward.
  upgraded.setIdentity(ownerIdentity);
  const stewards = await upgraded.listStewards();
  expect(stewards).toContainEqual(
    expect.objectContaining({
      stewardAccountId: owner,
      roleStatus: { Active: null },
    }),
  );
});
