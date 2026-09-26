import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";

// ---------------------------------------------------------------------------
// Tenancy 1C-D4-A: Mystery / MysteryContribution familyId across a real
// upgrade.
//
// The previous revision's Mystery and MysteryContribution have no `familyId`
// field; this build's 20260927_000000.mo migration adds one and backfills every
// pre-existing record with familyId = "norwood". This test installs the
// previous revision, writes a mystery (with a related person and a linked
// Archive media item) and a pending contribution through its public API,
// upgrades to this build (running the migration), and asserts:
//   1. the mystery and contribution survive with their ids, content, status,
//      related-person references, and media links unchanged and
//      familyId = "norwood";
//   2. the record counts are unchanged and no id is duplicated — the migration
//      rebuilds each list exactly once;
//   3. a repeated read is idempotent: the same records come back unchanged, so
//      the migration neither duplicates nor reseeds them.
//
// The pre-upgrade write goes through the previous revision's own declarations
// (`.old/`), because this build's codec requires the new `familyId` field and
// cannot encode a call against the previous revision's pre-migration types.
//
// The runner only runs `*upgrade*` files when a previous revision exists to
// upgrade from; on a build without `.old/` it excludes this file and prints the
// reason.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";
const BACKEND_WASM = process.env.BACKEND_WASM ?? "";
const PREVIOUS_WASM = process.env.BACKEND_WASM_PREVIOUS ?? "";
const PREVIOUS_DECLARATIONS = process.env.BACKEND_DECLARATIONS_PREVIOUS ?? "";

let pic: PocketIc | undefined;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
});

afterAll(async () => {
  await pic?.tearDown();
});

it("defaults pre-existing mysteries and contributions to norwood on upgrade, preserving ids, content, references, and status", async () => {
  const previousDeclarations = await import(
    /* @vite-ignore */ PREVIOUS_DECLARATIONS
  );
  const previousIdlFactory = previousDeclarations.idlFactory;

  // 1. Install the version the user is actually running.
  const previous = await pic!.setupCanister({
    idlFactory: previousIdlFactory,
    wasm: PREVIOUS_WASM,
  });

  // 2. Write a mystery and a contribution through the OLD public API. The
  //    writer becomes the Family Steward (the one-time claimSteward bootstrap)
  //    and approves its own claim on a seeded profile so the contribution
  //    endpoints are authorized.
  const steward = createIdentity("upgrade-mystery-steward-seed");
  previous.actor.setIdentity(steward);
  await previous.actor._initialize_access_control();
  await previous.actor.claimSteward();
  const requested = await previous.actor.requestProfileClaim("clayton");
  if ("ok" in requested) {
    await previous.actor.approveProfileClaim(requested.ok.id);
  }

  // A linked Archive media item, so the mystery's media link can be checked
  // after the upgrade.
  const media = await previous.actor.submitArchiveItem(
    "Pre-tenancy mystery photo",
    "A photo linked to a mystery written before the familyId migration.",
    { Photo: null },
    "image/png",
    new Uint8Array([51, 52, 53]),
    "1930",
    [1930n],
    ["mysteries"],
    ["clayton"],
    [],
    { Original: null },
    { FamilyOnly: null },
    { Standard: null },
    [],
    "pre-tenancy-mystery-photo.png",
  );

  const written = await previous.actor.createCanonicalMystery(
    "Pre-tenancy mystery",
    "A mystery written before the familyId migration.",
    ["clayton", "hudson"],
    ["Norwood"],
    ["A known fact."],
    ["A possibility."],
    [7n],
    [media.id],
    { Researching: null },
  );
  expect(written.status).toEqual({ Researching: null });

  const contribution = await previous.actor.submitMysteryContribution(
    written.id,
    { Memory: null },
    "A memory written before the familyId migration.",
  );
  expect(contribution.status).toEqual({ Pending: null });

  // 3. Upgrade to the version this build produces. The 20260927_000000.mo
  //    migration runs here.
  await pic!.upgradeCanister({
    canisterId: previous.canisterId,
    wasm: BACKEND_WASM,
    upgradeModeOptions: {
      skip_pre_upgrade: [],
      wasm_memory_persistence: [{ keep: null }],
    },
  });

  // 4. Read through the NEW API. The records survive with their ids, content,
  //    references, and status unchanged and familyId = "norwood".
  const upgraded = pic!.createActor<_SERVICE>(idlFactory, previous.canisterId);
  upgraded.setIdentity(steward);

  const listed = await upgraded.listMysteriesForFamily("norwood");
  const stored = listed.find((m) => m.id === written.id);
  expect(stored).toBeDefined();
  expect(stored).toMatchObject({
    id: written.id,
    familyId: "norwood",
    title: "Pre-tenancy mystery",
    description: "A mystery written before the familyId migration.",
    relatedMemberIds: ["clayton", "hudson"],
    relatedBranchId: ["Norwood"],
    knownFacts: ["A known fact."],
    possibilities: ["A possibility."],
    relatedSourceIds: [7n],
    relatedArchiveItemIds: [media.id],
    status: { Researching: null },
    resolution: [],
  });

  // No duplicates: exactly one mystery with that id, and the migration did not
  // reseed the collection.
  expect(listed.filter((m) => m.id === written.id)).toHaveLength(1);
  expect(listed).toHaveLength(1);

  // The contribution survives with its id, target, content, and status
  // unchanged and familyId = "norwood".
  const contributions = await upgraded.listMysteryContributionsForFamily(
    "norwood",
    written.id,
  );
  const storedContribution = contributions.find((c) => c.id === contribution.id);
  expect(storedContribution).toBeDefined();
  expect(storedContribution).toMatchObject({
    id: contribution.id,
    familyId: "norwood",
    mysteryId: written.id,
    contributionType: { Memory: null },
    text: "A memory written before the familyId migration.",
    status: { Pending: null },
    reviewedBy: [],
    reviewedAt: [],
  });
  expect(contributions.filter((c) => c.id === contribution.id)).toHaveLength(1);

  // 5. A repeated read is idempotent: the same records come back unchanged, so
  //    the migration neither duplicates nor rewrites them.
  const listedAgain = await upgraded.listMysteriesForFamily("norwood");
  expect(listedAgain).toHaveLength(1);
  expect(listedAgain.find((m) => m.id === written.id)).toEqual(stored);

  const contributionsAgain = await upgraded.listMysteryContributionsForFamily(
    "norwood",
    written.id,
  );
  expect(contributionsAgain).toHaveLength(1);
  expect(contributionsAgain.find((c) => c.id === contribution.id)).toEqual(
    storedContribution,
  );
});
