import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";

const PIC_URL = process.env.POCKET_IC_URL ?? "";
const BACKEND_WASM = process.env.BACKEND_WASM ?? "";
const PREVIOUS_WASM = process.env.BACKEND_WASM_PREVIOUS ?? "";
// The runner sets this to the previous revision's generated declarations under
// `.old/`. They are imported dynamically in the archive migration test below.
const PREVIOUS_DECLARATIONS = process.env.BACKEND_DECLARATIONS_PREVIOUS ?? "";

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

  // 2. Write data through the OLD public API, as the deployed app did. The
  //    previous revision already gates addPhoto on approved-family membership,
  //    so the writer must be authorized there too. Its Steward authority is the
  //    canonical active-Steward record over the persisted `stewards` list — the
  //    platform admin role is never consulted — so the writer must perform the
  //    one-time `claimSteward` bootstrap on the previous revision before it can
  //    add a photo. (The previous revision's `isSteward` delegates to
  //    `StewardAuthorityLib.isActiveSteward`, exactly as this build's does.)
  const steward = createIdentity("upgrade-photo-steward-seed");
  previous.actor.setIdentity(steward);
  await previous.actor._initialize_access_control();
  await previous.actor.claimSteward();
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
  // listPhotos requires an approved family member or a Family Steward. The
  // StewardRecord written by the previous revision's `claimSteward` bootstrap
  // is stable state and survives the upgrade, so the same identity is still an
  // active Steward here and can read the gallery without re-claiming. The photo
  // itself must survive the upgrade regardless of who reads it back.
  upgraded.setIdentity(steward);
  const photos = await upgraded.listPhotos("julia");
  expect(photos).toHaveLength(1);
  expect(photos[0]).toMatchObject({ filename: "julia-old.png" });
  // The first photo remains the profile photo after the upgrade. 'julia' is
  // seeded #Unclaimed, so getProfilePhoto stays readable by guests too.
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

// The archive collection must survive an upgrade: a record written through the
// previous revision's public API is carried through the migration chain with
// its original fields intact and is not reset.
//
// The previous revision (`.old/`) already carries the 20260917_000000.mo
// migration that widened ArchiveItem with the optional persisted
// `mimeType`/`filename` fields, and its `submitArchiveItem` already persists
// them at submit time. A record written through the previous revision's API
// therefore carries non-null upload metadata, and the migration does not
// rewrite it (the migration only backfills records that predate it, and it is
// already applied in `.old/`). This test installs the previous revision, writes
// an archive item through its public API, upgrades to this build (replaying the
// migration chain), and asserts the record survives with its original fields
// and its persisted metadata intact.
//
// Both revisions' `submitArchiveItem` take 15 parameters (the trailing
// `filename`), so the call below passes all 15. The previous revision's own
// declarations under `.old/` are imported dynamically from the path the runner
// supplies, so a resolution failure surfaces as a clear error here rather than
// breaking the whole file at collection time.
it("carries archive items written by the previous version through the upgrade", async () => {
  const previousDeclarations = await import(
    /* @vite-ignore */ PREVIOUS_DECLARATIONS
  );
  const previousIdlFactory = previousDeclarations.idlFactory;

  // 1. Install the version the user is actually running.
  const previous = await pic!.setupCanister({
    idlFactory: previousIdlFactory,
    wasm: PREVIOUS_WASM,
  });

  // 2. Write an archive item through the OLD public API. The writer must be an
  //    approved family member on the previous revision, so it performs the
  //    one-time Steward bootstrap and approves its own profile claim.
  const contributor = createIdentity("upgrade-archive-contributor-seed");
  previous.actor.setIdentity(contributor);
  await previous.actor._initialize_access_control();
  await previous.actor.claimSteward();
  const requested = await previous.actor.requestProfileClaim("clayton");
  if ("ok" in requested) {
    await previous.actor.approveProfileClaim(requested.ok.id);
  }
  const written = await previous.actor.submitArchiveItem(
    "Pre-upgrade letter",
    "A letter written before the persisted-media migration.",
    { Document: null },
    "application/pdf",
    new Uint8Array([4, 5, 6]),
    "1924",
    [1924n],
    ["letters"],
    ["julia"],
    ["branch-1"],
    { Original: null },
    { FamilyOnly: null },
    { Standard: null },
    [],
    "pre-upgrade-letter.pdf",
  );

  // 3. Upgrade to the version this build produces. The migration runs here.
  await pic!.upgradeCanister({
    canisterId: previous.canisterId,
    wasm: BACKEND_WASM,
    upgradeModeOptions: {
      skip_pre_upgrade: [],
      wasm_memory_persistence: [{ keep: null }],
    },
  });

  // 4. Read through the NEW API. The record survives with its original fields
  //    and the persisted upload metadata written by the previous revision is
  //    intact (the migration did not reset the archive collection or drop the
  //    metadata).
  const upgraded = pic!.createActor<_SERVICE>(idlFactory, previous.canisterId);
  upgraded.setIdentity(contributor);
  const pending = await upgraded.listPendingArchiveItems();
  const stored = pending.find((item) => item.id === written.id);
  expect(stored).toBeDefined();
  expect(stored).toMatchObject({
    id: written.id,
    title: "Pre-upgrade letter",
    era: "1924",
    tags: ["letters"],
    status: { Pending: null },
    mimeType: ["application/pdf"],
    filename: ["pre-upgrade-letter.pdf"],
  });
  // The stored blob reference is unchanged: the original bytes are preserved.
  expect(stored?.blob).toEqual(written.blob);
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
// The ownership-restoration migrations (20260911_000000.mo and
// 20260912_000000.mo) are now carried by the previous revision (`.old/`), so
// they run at INSTALL time of the previous wasm — before any runtime data is
// written. At install the state is empty (a fresh canister), so there is no
// runtime-created duplicate Lorenzo Smith Jr. profile and no surviving
// ownership/steward evidence for those migrations to consolidate: the canonical
// lorenzoSmithJr profile is seeded UNCLAIMED by the seed migration
// (20260905_080000.mo) and stays that way through the install-time chain.
//
// A duplicate Lorenzo Smith Jr. profile created via createMyself at runtime on
// the previous revision is therefore carried through the upgrade unchanged: the
// migration chain does not re-run already-applied migrations, and the only
// migration this build adds (20260913_000000.mo) is research-intake-only — it
// introduces the research collections and touches no ownership, media, or
// steward state. Testing "ownership/media/steward restoration on upgrade" would
// require a previous revision that predates the ownership-restoration
// migrations, which this build's `.old/` does not provide. Those scenarios are
// not applicable to this build's upgrade path and are intentionally not
// asserted here.
