import { PocketIc } from "@dfinity/pic";
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
});
