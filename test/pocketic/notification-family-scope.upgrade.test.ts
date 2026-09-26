import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";

// ---------------------------------------------------------------------------
// Tenancy 1C-D5-A: Notification familyId across a real upgrade.
//
// The previous revision's Notification has no `familyId` field; this build's
// 20260928_000000.mo migration adds one and backfills every pre-existing
// notification with familyId = "norwood". This test installs the previous
// revision, writes notifications through its public API, upgrades to this build
// (running the migration), and asserts:
//   1. every pre-existing notification survives with its id, recipient,
//      notification type, message, createdAt, and read state unchanged and
//      familyId = "norwood";
//   2. the record count is unchanged and no id is duplicated — the migration
//      rebuilds the list exactly once;
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

it("defaults pre-existing notifications to norwood on upgrade, preserving id, recipient, type, message, createdAt, and read state", async () => {
  const previousDeclarations = await import(
    /* @vite-ignore */ PREVIOUS_DECLARATIONS
  );
  const previousIdlFactory = previousDeclarations.idlFactory;

  // 1. Install the version the user is actually running.
  const previous = await pic!.setupCanister({
    idlFactory: previousIdlFactory,
    wasm: PREVIOUS_WASM,
  });

  // 2. Write notifications through the OLD public API. The writer becomes the
  //    Family Steward (the one-time claimSteward bootstrap) and approves its own
  //    claim on a seeded profile so the Research upload endpoints are
  //    authorized. The legacy `createSourceWithUpload` writes a
  //    `#ResearchSubmission` notification for the contributor.
  const steward = createIdentity("upgrade-notification-steward-seed");
  previous.actor.setIdentity(steward);
  await previous.actor._initialize_access_control();
  await previous.actor.claimSteward();
  const requested = await previous.actor.requestProfileClaim("clayton");
  if ("ok" in requested) {
    await previous.actor.approveProfileClaim(requested.ok.id);
  }

  const upload = await previous.actor.createSourceWithUpload(
    "Pre-tenancy research source",
    { CensusCitation: null },
    "A source written before the familyId migration.",
    "application/pdf",
    new Uint8Array([61, 62, 63]),
    ["census"],
    "",
    [],
    [],
    { FamilyOnly: null },
    { Standard: null },
    [],
    "pre-tenancy-research-source.pdf",
  );
  expect("ok" in upload).toBe(true);

  // The pre-upgrade notification list, read through the OLD API. It carries no
  // familyId field yet.
  const before = await previous.actor.listNotifications();
  expect(before.length).toBeGreaterThan(0);
  const researchBefore = before.filter(
    (n: { notificationType: unknown }) =>
      "ResearchSubmission" in (n.notificationType as object),
  );
  expect(researchBefore).toHaveLength(1);
  const original = researchBefore[0] as {
    id: bigint;
    recipient: unknown;
    notificationType: unknown;
    message: string;
    createdAt: bigint;
    read: boolean;
  };

  // Mark one notification read before the upgrade so the read state is
  // non-default and its preservation is meaningful.
  const marked = await previous.actor.markNotificationRead(original.id);
  expect(marked).toHaveLength(1);
  expect(marked[0].read).toBe(true);

  // 3. Upgrade to the version this build produces. The 20260928_000000.mo
  //    migration runs here.
  await pic!.upgradeCanister({
    canisterId: previous.canisterId,
    wasm: BACKEND_WASM,
    upgradeModeOptions: {
      skip_pre_upgrade: [],
      wasm_memory_persistence: [{ keep: null }],
    },
  });

  // 4. Read through the NEW API. The notification survives with its id,
  //    recipient, type, message, createdAt, and read state unchanged and
  //    familyId = "norwood".
  const upgraded = pic!.createActor<_SERVICE>(idlFactory, previous.canisterId);
  upgraded.setIdentity(steward);

  const listed = await upgraded.listNotificationsForFamily("norwood");
  const stored = listed.find((n) => n.id === original.id);
  expect(stored).toBeDefined();
  expect(stored).toMatchObject({
    id: original.id,
    familyId: "norwood",
    recipient: original.recipient,
    notificationType: original.notificationType,
    message: original.message,
    createdAt: original.createdAt,
    read: true,
  });

  // No duplicates: exactly one notification with that id, and the migration did
  // not reseed the collection.
  expect(listed.filter((n) => n.id === original.id)).toHaveLength(1);
  expect(listed).toHaveLength(before.length);

  // 5. A repeated read is idempotent: the same records come back unchanged, so
  //    the migration neither duplicates nor rewrites them.
  const listedAgain = await upgraded.listNotificationsForFamily("norwood");
  expect(listedAgain).toHaveLength(before.length);
  expect(listedAgain.find((n) => n.id === original.id)).toEqual(stored);

  // The legacy no-familyId read agrees with the canonical Norwood read.
  const legacy = await upgraded.listNotifications();
  expect(legacy.map((n) => n.id).sort()).toEqual(
    listed.map((n) => n.id).sort(),
  );
});
