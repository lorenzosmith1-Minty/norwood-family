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

// The expanded Edit My Profile build adds a new migration (20260906_020000.mo)
// that introduces the separate owner-editable identity/basic/about fields
// (firstName, middleName, lastName, suffix, nickname, shortBio, longerStory,
// birthDate, birthplace, currentLocation) to every existing Person Profile,
// defaulting each to null (unset). The earlier duplicate-removal migration
// (20260906_010000.mo) is already in the previous revision's chain tail, so it
// does not re-run on this upgrade. This test installs the previous revision,
// creates a profile via createMyself, upgrades to this build (replaying the new
// migration), and asserts the expanded fields are added while the canonical
// record and its identity survive.
it("adds the expanded owner-editable fields to existing profiles on upgrade", async () => {
  // 1. Install the version the user is actually running.
  const previous = await pic!.setupCanister<_SERVICE>({
    idlFactory,
    wasm: PREVIOUS_WASM,
  });

  // 2. A signed-in user creates a profile via createMyself (keyed by the
  //    caller's principal).
  const identity = createIdentity("field-expansion-seed");
  previous.actor.setIdentity(identity);
  const created = await previous.actor.createMyself("Lorenzo Smith Jr.");
  expect(created).toEqual({
    ok: expect.objectContaining({ name: "Lorenzo Smith Jr." }),
  });
  const personId = identity.getPrincipal().toText();

  // 3. Upgrade to the version this build produces. The new migration runs here.
  await pic!.upgradeCanister({
    canisterId: previous.canisterId,
    wasm: BACKEND_WASM,
    upgradeModeOptions: {
      skip_pre_upgrade: [],
      wasm_memory_persistence: [{ keep: null }],
    },
  });

  // 4. Read through the NEW API: the expanded owner-editable fields are present
  //    (defaulting to unset) and the profile's identity survives.
  const upgraded = pic!.createActor<_SERVICE>(idlFactory, previous.canisterId);
  const profile = await upgraded.getPersonProfile(personId);
  expect(profile).toEqual([
    expect.objectContaining({
      personId,
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
// previous version survives the upgrade with its person ids intact. This test
// installs the previous revision, files a pending relationship request, upgrades
// to this build, and asserts the request is preserved.
it("preserves a pending relationship request through the upgrade", async () => {
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
  //    with its person ids intact.
  const upgraded = pic!.createActor<_SERVICE>(idlFactory, previous.canisterId);
  const preservedRel = await upgraded.getRelationshipRequest(relId);
  expect(preservedRel).toEqual([
    expect.objectContaining({
      id: relId,
      requestingPersonId: personId,
      status: { Pending: null },
    }),
  ]);
});
