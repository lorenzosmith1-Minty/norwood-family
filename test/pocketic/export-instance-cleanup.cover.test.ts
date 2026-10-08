import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";
import {
  BACKEND_WASM,
  adminIdentity,
  contributorIdentity,
  registerApprovedContributor,
} from "./lane-helpers";

// ---------------------------------------------------------------------------
// Expired export-instance cleanup (real-canister cover).
//
// The accepted change adds a BOUNDED LAZY CLEANUP that prunes expired
// FamilyArchive export instances and their media bindings during an existing
// export/retrieval operation. This file drives the app's own compiled wasm
// through the real public API and uses PocketIC's time control to actually
// cross the 7-day `EXPORT_INSTANCE_TTL_NANOS` lifecycle, so the cleanup and the
// neutral expiry behavior are observed at runtime rather than asserted only at
// the source level.
//
// What this file asserts:
//
//   1. An ACTIVE export instance and its media bindings remain usable: the
//      manifest's `media-1` resolves to the exact bytes of the bound asset.
//   2. Once the 7-day lifecycle has elapsed, retrieval of the old ref is
//      NEUTRAL — it never rebuilds against current media. Because the mixin
//      prunes expired instances before resolving, the observable public result
//      is `#ExportInstanceNotFound` (the instance no longer exists); the
//      `#ExportInstanceExpired` branch remains in the pure library for a
//      still-present expired instance. Both are neutral.
//   3. Adding a new family asset after expiry does not redirect the old ref to
//      the new asset.
//   4. Pruning one family's expired mapping does not affect another family's
//      ACTIVE instance: a fresh Family B instance still resolves after a
//      Norwood export triggers the global cleanup.
//   5. The cleanup deletes no family data: a fresh export after cleanup still
//      carries the archive item and profile photo, and retrieval returns their
//      exact bytes.
//
// The frontend suite mocks the actor and has no principals, so none of this is
// visible there. This file installs the app's own compiled wasm and drives the
// real public API.
//
// The lane shares one PocketIC sidecar across every file, and installing a
// canister replays the whole migration chain. This file installs ONE canister
// in `beforeAll` and seeds it once. PocketIC's time is global to the instance,
// so the tests are ordered: the active-instance assertions run BEFORE the clock
// is advanced past the TTL, and every later test works against the advanced
// clock.
//
// Coverage limits this file cannot close:
//   - The `#ExportInstanceExpired` branch is not reachable through the public
//     API: `retrieveFamilyArchiveMedia` prunes expired instances before it
//     resolves, so an expired ref is always already pruned and returns
//     `#ExportInstanceNotFound`. The library branch is asserted at the source
//     level in the frontend lane.
//   - The public upload endpoints reject a zero-byte blob, so an `#Unavailable`
//     asset cannot be seeded through the public API.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

const NORWOOD = "norwood";

// 8 days in milliseconds: comfortably past the 7-day TTL.
const EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1000;

let pic: PocketIc | undefined;
let actor: _SERVICE;
let canisterId: ReturnType<typeof createIdentity>["getPrincipal"];

const familyBFounderIdentity = createIdentity("export-cleanup-family-b-founder-seed");

// The seeded Norwood state the cleanup tests read.
let contributorPersonId = "";
let familyBId = "";

// The bytes uploaded for the Norwood archive item and profile photo, so the
// retrieval assertions can compare the returned bytes exactly.
const archiveBytes = new Uint8Array([11, 22, 33, 44, 55]);
const photoBytes = new Uint8Array([66, 77, 88, 99]);
// A Family B archive item, so Family B has its own media to bind.
const familyBBytes = new Uint8Array([7, 14, 21, 28]);

/** Unwraps a `Result` read, failing the test on an unexpected `#err`. */
function ok<T>(result: { ok: T } | { err: unknown }): T {
  if (!("ok" in result)) {
    throw new Error(`expected #ok, got ${JSON.stringify(result)}`);
  }
  return result.ok;
}

/** Parses the envelope's `payloadJson` into a plain object for assertions. */
function payloadOf(envelope: { payloadJson: string }): Record<string, unknown> {
  return JSON.parse(envelope.payloadJson) as Record<string, unknown>;
}

interface ManifestEntry {
  ref: { kind: string; portableId: string };
  mediaKind: string;
  filename: string | null;
}

/** The media manifest of a FamilyArchive export, parsed from `payloadJson`. */
function manifestOf(envelope: { payloadJson: string }): ManifestEntry[] {
  return payloadOf(envelope).mediaManifest as ManifestEntry[];
}

/** A minimal valid founder input. */
function founderInput(firstName: string, lastName: string) {
  return {
    firstName,
    lastName,
    middleName: [] as [] | [string],
    suffix: [] as [] | [string],
    preferredName: [] as [] | [string],
    birthDate: [] as [] | [string],
    birthYear: [] as [] | [string],
    birthplace: [] as [] | [string],
    currentLocation: [] as [] | [string],
  };
}

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
  const setup = await pic.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  actor = setup.actor;
  canisterId = setup.canisterId;

  // Norwood Steward (ADMIN) + approved contributor (CONTRIBUTOR owns "clayton").
  await registerApprovedContributor(actor);

  actor.setIdentity(contributorIdentity);
  const mine = await actor.getMyProfile();
  if (mine.length === 0) {
    throw new Error("contributor profile was not seeded");
  }
  contributorPersonId = mine[0].personId;

  // Seed a real Norwood archive item with bytes.
  actor.setIdentity(contributorIdentity);
  const item = await actor.submitArchiveItemForFamily(
    NORWOOD,
    "Family reunion photograph",
    "A photograph contributed to the family archive.",
    { Photo: null },
    "image/png",
    archiveBytes,
    "",
    [],
    [],
    [contributorPersonId],
    [],
    { Original: null },
    { FamilyOnly: null },
    { Standard: null },
    [],
    "reunion-photo.png",
  );
  expect(item.familyId).toBe(NORWOOD);

  // Seed a real profile photo on the contributor's own claimed profile.
  actor.setIdentity(contributorIdentity);
  const photo = await actor.addPhotoForFamily(
    NORWOOD,
    contributorPersonId,
    "clayton-portrait.png",
    "image/png",
    photoBytes,
  );
  await actor.setProfilePhotoForFamily(NORWOOD, contributorPersonId, photo.id);

  // A second, unrelated family with its own founder. The founder accepts
  // founding Stewardship so Family B has its own active Steward and can
  // generate its own export instance.
  actor.setIdentity(familyBFounderIdentity);
  await actor._initialize_access_control();
  const createdB = await actor.createFamilyWithFounder(
    "Boundary Cleanup Family",
    founderInput("Beatrice", "Boundary"),
    "export-cleanup-family-b-key",
  );
  if (!("ok" in createdB)) {
    throw new Error(`createFamilyWithFounder failed: ${JSON.stringify(createdB)}`);
  }
  familyBId = createdB.ok.family.id;
  ok(await actor.acceptFoundingStewardship(familyBId));

  // Seed a Family B archive item so Family B has its own media to bind.
  actor.setIdentity(familyBFounderIdentity);
  const familyBItem = await actor.submitArchiveItemForFamily(
    familyBId,
    "Boundary family photograph",
    "A photograph contributed to the Boundary family archive.",
    { Photo: null },
    "image/png",
    familyBBytes,
    "",
    [],
    [],
    [createdB.ok.founderProfile.personId],
    [],
    { Original: null },
    { FamilyOnly: null },
    { Standard: null },
    [],
    "boundary-document.png",
  );
  expect(familyBItem.familyId).toBe(familyBId);
});

afterAll(async () => {
  await pic?.tearDown();
});

// ---------------------------------------------------------------------------
// (1) ACTIVE instances and their bindings remain usable, BEFORE the clock is
//     advanced past the TTL.
// ---------------------------------------------------------------------------

it("resolves an active Norwood instance's media to its exact bytes", async () => {
  actor.setIdentity(adminIdentity);
  const { envelope, exportInstanceRef } = ok(
    await actor.exportFamilyArchive(NORWOOD),
  );
  const manifest = manifestOf(envelope);
  const archiveEntry = manifest.find((m) => m.mediaKind === "ArchiveItem");
  expect(archiveEntry).toBeDefined();

  const retrieved = ok(
    await actor.retrieveFamilyArchiveMedia(
      exportInstanceRef,
      archiveEntry!.ref.portableId,
    ),
  );
  expect(Array.from(retrieved.bytes)).toEqual(Array.from(archiveBytes));
});

it("resolves an active Family B instance's media to its exact bytes", async () => {
  actor.setIdentity(familyBFounderIdentity);
  const { envelope, exportInstanceRef } = ok(
    await actor.exportFamilyArchive(familyBId),
  );
  const manifest = manifestOf(envelope);
  const archiveEntry = manifest.find((m) => m.mediaKind === "ArchiveItem");
  expect(archiveEntry).toBeDefined();

  const retrieved = ok(
    await actor.retrieveFamilyArchiveMedia(
      exportInstanceRef,
      archiveEntry!.ref.portableId,
    ),
  );
  expect(Array.from(retrieved.bytes)).toEqual(Array.from(familyBBytes));
});

// ---------------------------------------------------------------------------
// Advance the IC clock past the 7-day export-instance lifecycle. Every test
// below works against the advanced clock; the active-instance assertions above
// have already run.
// ---------------------------------------------------------------------------

it("advances the IC clock past the 7-day export-instance lifecycle", async () => {
  const before = await pic!.getTime();
  await pic!.advanceTime(EIGHT_DAYS_MS);
  await pic!.tick();
  // The clock really moved forward by at least the TTL. PocketIC's default
  // epoch is 2021, so this is compared against the IC's own baseline, not
  // wall-clock time.
  expect(await pic!.getTime()).toBeGreaterThanOrEqual(before + EIGHT_DAYS_MS);
});

// ---------------------------------------------------------------------------
// (2) An expired ref is NEUTRAL and never rebuilds against current media.
// (3) A new family asset added after expiry does not redirect the old ref.
// ---------------------------------------------------------------------------

it("resolves an expired ref neutrally and never rebuilds against current media", async () => {
  // Mint an instance, then let it expire.
  actor.setIdentity(adminIdentity);
  const { envelope, exportInstanceRef } = ok(
    await actor.exportFamilyArchive(NORWOOD),
  );
  const manifest = manifestOf(envelope);
  const archiveEntry = manifest.find((m) => m.mediaKind === "ArchiveItem");
  expect(archiveEntry).toBeDefined();

  // Add a NEW archive item AFTER the export. A rebuilt current manifest would
  // renumber media-N; the old ref must not resolve to the new asset.
  actor.setIdentity(contributorIdentity);
  const added = await actor.submitArchiveItemForFamily(
    NORWOOD,
    "Later addition",
    "An asset added after the export.",
    { Photo: null },
    "image/png",
    new Uint8Array([1, 2, 3]),
    "",
    [],
    [],
    [contributorPersonId],
    [],
    { Original: null },
    { FamilyOnly: null },
    { Standard: null },
    [],
    "later-addition.png",
  );
  expect(added.familyId).toBe(NORWOOD);

  // Advance past the TTL for this instance.
  await pic!.advanceTime(EIGHT_DAYS_MS);
  await pic!.tick();

  // The expired ref is neutral. The mixin prunes expired instances before
  // resolving, so the observable result is #ExportInstanceNotFound; it is never
  // a successful retrieval and never the newly-added asset.
  actor.setIdentity(adminIdentity);
  const result = await actor.retrieveFamilyArchiveMedia(
    exportInstanceRef,
    archiveEntry!.ref.portableId,
  );
  expect(result).toEqual({ err: { ExportInstanceNotFound: null } });
});

// ---------------------------------------------------------------------------
// (4) Pruning one family's expired mapping does not affect another family's
//     ACTIVE instance.
// ---------------------------------------------------------------------------

it("does not affect another family's active instance when pruning expired mappings", async () => {
  // Family B mints a FRESH instance now (active under the advanced clock).
  actor.setIdentity(familyBFounderIdentity);
  const familyBFresh = ok(await actor.exportFamilyArchive(familyBId));
  const familyBManifest = manifestOf(familyBFresh.envelope);
  const familyBEntry = familyBManifest.find((m) => m.mediaKind === "ArchiveItem");
  expect(familyBEntry).toBeDefined();

  // A Norwood export triggers the global bounded cleanup, which prunes any
  // expired instances (including Norwood's) but must leave Family B's active
  // instance and bindings untouched.
  actor.setIdentity(adminIdentity);
  ok(await actor.exportFamilyArchive(NORWOOD));

  // Family B's active instance still resolves to its exact bytes.
  actor.setIdentity(familyBFounderIdentity);
  const retrieved = ok(
    await actor.retrieveFamilyArchiveMedia(
      familyBFresh.exportInstanceRef,
      familyBEntry!.ref.portableId,
    ),
  );
  expect(Array.from(retrieved.bytes)).toEqual(Array.from(familyBBytes));
});

// ---------------------------------------------------------------------------
// (5) The cleanup deletes no family data: a fresh export after cleanup still
//     carries the family's archive item and profile photo, and retrieval
//     returns their exact bytes.
// ---------------------------------------------------------------------------

it("keeps family archive media and profile photos after cleanup", async () => {
  actor.setIdentity(adminIdentity);
  const { envelope, exportInstanceRef } = ok(
    await actor.exportFamilyArchive(NORWOOD),
  );
  const manifest = manifestOf(envelope);

  const archiveEntry = manifest.find((m) => m.mediaKind === "ArchiveItem");
  const photoEntry = manifest.find((m) => m.mediaKind === "ProfilePhoto");
  expect(archiveEntry).toBeDefined();
  expect(photoEntry).toBeDefined();

  // The original archive item and profile photo are still present and their
  // bytes are still retrievable through the fresh instance.
  const retrievedArchive = ok(
    await actor.retrieveFamilyArchiveMedia(
      exportInstanceRef,
      archiveEntry!.ref.portableId,
    ),
  );
  expect(Array.from(retrievedArchive.bytes)).toEqual(Array.from(archiveBytes));

  const retrievedPhoto = ok(
    await actor.retrieveFamilyArchiveMedia(
      exportInstanceRef,
      photoEntry!.ref.portableId,
    ),
  );
  expect(Array.from(retrievedPhoto.bytes)).toEqual(Array.from(photoBytes));
});

it("still refuses an unknown export-instance reference neutrally", async () => {
  actor.setIdentity(adminIdentity);
  await expect(
    actor.retrieveFamilyArchiveMedia("export-does-not-exist", "media-1"),
  ).resolves.toEqual({ err: { ExportInstanceNotFound: null } });
});
