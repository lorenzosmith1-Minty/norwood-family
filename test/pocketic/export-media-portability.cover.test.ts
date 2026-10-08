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
// Phase 5C-H1 — export-bound media retrieval (real-canister cover).
//
// The accepted Phase 5C-H1 behavior this file asserts, driven against the app's
// own compiled wasm through the real public API:
//
//   1. `exportFamilyArchive` returns the existing versioned envelope PLUS an
//      opaque `exportInstanceRef` that reveals no family id, media/storage id,
//      internal record id, or storage secret.
//   2. A generated export instance resolves `media-1`/`media-2` to the exact
//      bytes of the assets that instance's manifest bound them to.
//   3. Adding a new family media item after the export does not change the old
//      instance's `media-1`/`media-2` mappings.
//   4. Removing a bound asset does not redirect an old media ref to a different
//      asset; the ref resolves to nothing (neutral `#MediaNotFound`).
//   5. A Family A export instance cannot retrieve Family B media, and a Family B
//      media token does not resolve under a Family A instance.
//   6. A non-Steward cannot retrieve media using another user's export instance,
//      even when holding the export-instance reference.
//   7. An unknown export-instance reference is rejected with
//      `#ExportInstanceNotFound` (never a rebuild against current media).
//   8. The retrieval result carries bytes directly, with no public/permanent URL
//      and no storage secret.
//
// The frontend suite mocks the actor and has no principals, so none of this is
// visible there. This file installs the app's own compiled wasm and drives the
// real public API.
//
// The lane shares one PocketIC sidecar across every file, and installing a
// canister replays the whole migration chain. This file installs ONE canister
// in `beforeAll` and seeds it once; every test is a read-only export/retrieval
// against that state.
//
// Coverage limits this file cannot close:
//   - The public upload endpoints reject a zero-byte blob
//     (`InputValidation.requireUpload` traps on `size == 0`), so an
//     `#Unavailable` asset cannot be seeded through the public API. The neutral
//     `#Unavailable` representation is asserted at the source level in the
//     frontend lane (src/frontend/src/ExportMediaPortabilityCover.test.ts).
//   - The export-instance TTL is 7 days and this lane does no time control, so
//     the `#ExportInstanceExpired` branch is asserted at the source level only.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

const NORWOOD = "norwood";

let pic: PocketIc | undefined;
let actor: _SERVICE;
let canisterId: ReturnType<typeof createIdentity>["getPrincipal"];

const familyBFounderIdentity = createIdentity("export-media-family-b-founder-seed");

// The seeded Norwood state the media tests read.
let contributorPersonId = "";
let familyBFounderPersonId = "";
// `createFamilyWithFounder` generates the family id; the third argument is an
// idempotency key, not the id. Capture the real id for the isolation tests.
let familyBId = "";

// The bytes uploaded for the archive item and the profile photo, so the
// retrieval assertions can compare the returned bytes exactly.
const archiveBytes = new Uint8Array([11, 22, 33, 44, 55]);
const photoBytes = new Uint8Array([66, 77, 88, 99]);

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
  title: string;
  mimeType: string | null;
  filename: string | null;
  byteSize: number | null;
  relatedPersonRef: { kind: string; portableId: string } | null;
  relatedArchiveRef: { kind: string; portableId: string } | null;
  uploadedAt: string | null;
  availability: string;
  reference: string;
}

/** The media manifest of a FamilyArchive export, parsed from `payloadJson`. */
function manifestOf(envelope: { payloadJson: string }): ManifestEntry[] {
  return payloadOf(envelope).mediaManifest as ManifestEntry[];
}

/** Every `portableId` string found anywhere in a parsed payload. */
function portableIds(value: unknown): string[] {
  const found: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item);
      }
      return;
    }
    if (node !== null && typeof node === "object") {
      for (const [key, child] of Object.entries(node)) {
        if (key === "portableId" && typeof child === "string") {
          found.push(child);
        } else {
          walk(child);
        }
      }
    }
  };
  walk(value);
  return found;
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

  // Seed a real archive item with bytes in Norwood, contributed by the approved
  // contributor. It is stored pending, but the FamilyArchive manifest reads
  // every family archive item regardless of review status.
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

  // A second, unrelated family with its own founder. It has no StewardRecord,
  // so it is a distinct tenant boundary for the isolation assertions.
  actor.setIdentity(familyBFounderIdentity);
  await actor._initialize_access_control();
  const createdB = await actor.createFamilyWithFounder(
    "Boundary Media Family",
    {
      firstName: "Beatrice",
      lastName: "Boundary",
      middleName: [],
      suffix: [],
      preferredName: [],
      birthDate: [],
      birthYear: [],
      birthplace: [],
      currentLocation: [],
    },
    "export-media-family-b-key",
  );
  if (!("ok" in createdB)) {
    throw new Error(`createFamilyWithFounder failed: ${JSON.stringify(createdB)}`);
  }
  familyBFounderPersonId = createdB.ok.founderProfile.personId;
  familyBId = createdB.ok.family.id;
});

afterAll(async () => {
  await pic?.tearDown();
});

// ---------------------------------------------------------------------------
// (1) An active Family Steward can obtain the authorized media manifest plus an
//     opaque export-instance reference.
// ---------------------------------------------------------------------------

it("lets an active Family Steward obtain the manifest and an opaque export instance", async () => {
  actor.setIdentity(adminIdentity);
  const result = ok(await actor.exportFamilyArchive(NORWOOD));
  const { envelope, exportInstanceRef } = result;

  // The existing export schema remains versioned and self-describing.
  expect(envelope.metadata.schemaVersion).toBe(1n);
  expect(envelope.metadata.scope).toEqual({ FamilyArchive: null });

  // The opaque instance reference is a short export-local token that reveals no
  // family id, media/storage id, internal record id, or storage secret.
  expect(typeof exportInstanceRef).toBe("string");
  expect(exportInstanceRef.length).toBeGreaterThan(0);
  expect(exportInstanceRef).not.toContain(NORWOOD);
  expect(exportInstanceRef).not.toContain(contributorPersonId);
  expect(exportInstanceRef).not.toContain(familyBFounderPersonId);
  for (const forbidden of ["token", "secret", "credential", "password"]) {
    expect(exportInstanceRef.toLowerCase()).not.toContain(forbidden);
  }

  const manifest = manifestOf(envelope);
  // The seeded archive item and profile photo both appear.
  expect(manifest.length).toBeGreaterThanOrEqual(2);

  for (const entry of manifest) {
    // Export-local media reference: `media-N`, never a raw internal id.
    expect(entry.ref.kind).toBe("Media");
    expect(entry.ref.portableId).toMatch(/^media-\d+$/u);
    // The opaque `reference` is the entry's own export-local portable id.
    expect(entry.reference).toBe(entry.ref.portableId);
    // Portable media kind.
    expect(["ProfilePhoto", "ArchiveItem"]).toContain(entry.mediaKind);
    // Availability is a neutral state.
    expect(["Available", "Unavailable"]).toContain(entry.availability);
    // A byte size is recorded when known.
    expect(entry.byteSize).not.toBeNull();
    expect(entry.byteSize).toBeGreaterThan(0);
  }

  // The archive item entry carries its export-local archive reference and a
  // related person reference; the profile photo entry carries its owning person.
  const archiveEntry = manifest.find((m) => m.mediaKind === "ArchiveItem");
  expect(archiveEntry).toBeDefined();
  expect(archiveEntry?.relatedArchiveRef?.kind).toBe("ArchiveItem");
  expect(archiveEntry?.relatedArchiveRef?.portableId).toMatch(/^archive-\d+$/u);
  expect(archiveEntry?.relatedPersonRef?.kind).toBe("Person");
  expect(archiveEntry?.relatedPersonRef?.portableId).toMatch(/^person-\d+$/u);
  expect(archiveEntry?.uploadedAt).not.toBeNull();

  const photoEntry = manifest.find((m) => m.mediaKind === "ProfilePhoto");
  expect(photoEntry).toBeDefined();
  expect(photoEntry?.relatedPersonRef?.kind).toBe("Person");
  expect(photoEntry?.relatedPersonRef?.portableId).toMatch(/^person-\d+$/u);
  expect(photoEntry?.relatedArchiveRef).toBeNull();
});

it("contains no raw internal media or storage identifier in the manifest", async () => {
  actor.setIdentity(adminIdentity);
  const { envelope } = ok(await actor.exportFamilyArchive(NORWOOD));
  const payload = payloadOf(envelope);

  // Every portable id is an export-local token, never a raw internal id.
  for (const portableId of portableIds(payload)) {
    expect(portableId).not.toContain(NORWOOD);
    expect(portableId).not.toContain(contributorPersonId);
    expect(portableId).not.toContain(familyBFounderPersonId);
  }

  // The serialized manifest carries no raw family id and no storage secret.
  const serialized = envelope.payloadJson.toLowerCase();
  expect(serialized).not.toContain(`"${NORWOOD}`);
  for (const forbidden of ["token", "secret", "credential", "password"]) {
    expect(serialized).not.toContain(forbidden);
  }
});

it("resolves manifest person and archive relationships through export-local refs", async () => {
  actor.setIdentity(adminIdentity);
  const { envelope } = ok(await actor.exportFamilyArchive(NORWOOD));
  const payload = payloadOf(envelope);

  const persons = payload.persons as Array<{ ref: { portableId: string } }>;
  const personRefs = new Set(persons.map((p) => p.ref.portableId));
  const archiveItems = payload.archiveItems as Array<{
    ref: { portableId: string };
  }>;
  const archiveRefs = new Set(archiveItems.map((a) => a.ref.portableId));

  for (const entry of manifestOf(envelope)) {
    if (entry.relatedPersonRef !== null) {
      expect(entry.relatedPersonRef.kind).toBe("Person");
      // The related person resolves to an exported Person record.
      expect(personRefs.has(entry.relatedPersonRef.portableId)).toBe(true);
    }
    if (entry.relatedArchiveRef !== null) {
      expect(entry.relatedArchiveRef.kind).toBe("ArchiveItem");
      // The related archive item resolves to an exported ArchiveItem record.
      expect(archiveRefs.has(entry.relatedArchiveRef.portableId)).toBe(true);
    }
  }
});

// ---------------------------------------------------------------------------
// (2) A generated export instance resolves media-1/media-2 to the exact bytes
//     of the assets its manifest bound them to.
// (8) The bytes are returned directly; no public/permanent URL is created.
// ---------------------------------------------------------------------------

it("resolves media-1 and media-2 through the export instance to their exact bytes", async () => {
  actor.setIdentity(adminIdentity);
  const { envelope, exportInstanceRef } = ok(
    await actor.exportFamilyArchive(NORWOOD),
  );
  const manifest = manifestOf(envelope);

  const archiveEntry = manifest.find((m) => m.mediaKind === "ArchiveItem");
  const photoEntry = manifest.find((m) => m.mediaKind === "ProfilePhoto");
  expect(archiveEntry).toBeDefined();
  expect(photoEntry).toBeDefined();

  // The manifest assigns archive items first, then profile photos, so the
  // archive item is media-1 and the profile photo is media-2.
  expect(archiveEntry!.ref.portableId).toBe("media-1");
  expect(photoEntry!.ref.portableId).toBe("media-2");

  const retrievedArchive = ok(
    await actor.retrieveFamilyArchiveMedia(
      exportInstanceRef,
      archiveEntry!.ref.portableId,
    ),
  );
  // The bytes are returned directly and match the uploaded asset.
  expect(Array.from(retrievedArchive.bytes)).toEqual(Array.from(archiveBytes));
  // The retrieval carries the same portable metadata as the manifest entry.
  expect(retrievedArchive.ref.portableId).toBe(archiveEntry!.ref.portableId);
  expect(retrievedArchive.mediaKind).toEqual({ ArchiveItem: null });
  expect(retrievedArchive.availability).toEqual({ Available: null });
  // No URL is returned: the result carries bytes, never a link. Serialize with
  // a bigint replacer because the retrieval metadata carries bigint fields.
  expect(retrievedArchive).not.toHaveProperty("url");
  const serializedRetrieval = JSON.stringify(retrievedArchive, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
  expect(serializedRetrieval).not.toContain("http");
  expect(serializedRetrieval).not.toContain("url");

  const retrievedPhoto = ok(
    await actor.retrieveFamilyArchiveMedia(
      exportInstanceRef,
      photoEntry!.ref.portableId,
    ),
  );
  expect(Array.from(retrievedPhoto.bytes)).toEqual(Array.from(photoBytes));
  expect(retrievedPhoto.mediaKind).toEqual({ ProfilePhoto: null });
});

// ---------------------------------------------------------------------------
// (3) Adding a new family media item after the export does not change the old
//     instance's media-1/media-2 mappings.
// ---------------------------------------------------------------------------

it("keeps an old export instance's media refs bound after a new asset is added", async () => {
  actor.setIdentity(adminIdentity);
  const { envelope, exportInstanceRef } = ok(
    await actor.exportFamilyArchive(NORWOOD),
  );
  const manifest = manifestOf(envelope);
  const archiveEntry = manifest.find((m) => m.mediaKind === "ArchiveItem");
  const photoEntry = manifest.find((m) => m.mediaKind === "ProfilePhoto");
  expect(archiveEntry).toBeDefined();
  expect(photoEntry).toBeDefined();

  // Add a new archive item to the family AFTER the export was generated. A
  // rebuilt current manifest would renumber media-N; the stored bindings must
  // not.
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

  // The old instance's media-1/media-2 still resolve to their original assets.
  actor.setIdentity(adminIdentity);
  const stillArchive = ok(
    await actor.retrieveFamilyArchiveMedia(
      exportInstanceRef,
      archiveEntry!.ref.portableId,
    ),
  );
  expect(Array.from(stillArchive.bytes)).toEqual(Array.from(archiveBytes));

  const stillPhoto = ok(
    await actor.retrieveFamilyArchiveMedia(
      exportInstanceRef,
      photoEntry!.ref.portableId,
    ),
  );
  expect(Array.from(stillPhoto.bytes)).toEqual(Array.from(photoBytes));
});

// ---------------------------------------------------------------------------
// (4) Removing a bound asset does not redirect an old media ref to a different
//     asset; the ref resolves to nothing (neutral `#MediaNotFound`).
// ---------------------------------------------------------------------------

it("does not redirect an old media ref to another asset after the asset is removed", async () => {
  // Seed a dedicated profile photo on the contributor's profile, export, then
  // remove that photo. The old instance's media ref must not resolve to any
  // other asset.
  actor.setIdentity(contributorIdentity);
  const removable = await actor.addPhotoForFamily(
    NORWOOD,
    contributorPersonId,
    "removable-portrait.png",
    "image/png",
    new Uint8Array([9, 8, 7, 6]),
  );

  actor.setIdentity(adminIdentity);
  const { envelope, exportInstanceRef } = ok(
    await actor.exportFamilyArchive(NORWOOD),
  );
  const manifest = manifestOf(envelope);
  // The removable photo is the last profile photo in the manifest; locate it by
  // its filename so the assertion does not depend on ordering.
  const removableEntry = manifest.find(
    (m) => m.mediaKind === "ProfilePhoto" && m.filename === "removable-portrait.png",
  );
  expect(removableEntry).toBeDefined();

  // Remove the underlying photo. The stored binding still points at the exact
  // source key, which now resolves to nothing.
  actor.setIdentity(contributorIdentity);
  const removed = await actor.removePhotoForFamily(
    NORWOOD,
    contributorPersonId,
    removable.id,
  );
  expect(removed).toBe(true);

  // The old media ref is NOT redirected to a different asset: it resolves to
  // the neutral not-found result.
  actor.setIdentity(adminIdentity);
  await expect(
    actor.retrieveFamilyArchiveMedia(
      exportInstanceRef,
      removableEntry!.ref.portableId,
    ),
  ).resolves.toEqual({ err: { MediaNotFound: null } });
});

// ---------------------------------------------------------------------------
// (5) A Family A export instance cannot retrieve Family B media, and a Family B
//     media token does not resolve under a Family A instance.
// ---------------------------------------------------------------------------

it("does not let a Norwood export instance retrieve Family B media", async () => {
  actor.setIdentity(adminIdentity);
  const { exportInstanceRef } = ok(await actor.exportFamilyArchive(NORWOOD));

  // A Family B media token is not bound to the Norwood instance, so it resolves
  // to nothing rather than crossing the family boundary.
  await expect(
    actor.retrieveFamilyArchiveMedia(exportInstanceRef, "media-999"),
  ).resolves.toEqual({ err: { MediaNotFound: null } });
});

it("does not resolve a Family B instance reference under Norwood", async () => {
  // Family B has no Steward, so no Family B export instance can be generated
  // through the public API; an unknown instance reference is rejected neutrally
  // rather than resolved against any family's current media.
  actor.setIdentity(adminIdentity);
  await expect(
    actor.retrieveFamilyArchiveMedia(`export-${familyBId}`, "media-1"),
  ).resolves.toEqual({ err: { ExportInstanceNotFound: null } });
});

// ---------------------------------------------------------------------------
// (6) A non-Steward cannot retrieve media using another user's export instance,
//     even when holding the export-instance reference.
// (7) An unknown export-instance reference is rejected.
// ---------------------------------------------------------------------------

it("refuses media retrieval to a non-Steward holding another user's export instance", async () => {
  actor.setIdentity(adminIdentity);
  const { envelope, exportInstanceRef } = ok(
    await actor.exportFamilyArchive(NORWOOD),
  );
  const mediaRef = manifestOf(envelope)[0]?.ref.portableId;
  expect(mediaRef).toBeDefined();

  // The approved contributor is a family member but not a Steward. Possession
  // of the export-instance reference does not bypass the Steward check.
  actor.setIdentity(contributorIdentity);
  await expect(
    actor.retrieveFamilyArchiveMedia(exportInstanceRef, mediaRef!),
  ).resolves.toEqual({ err: { NotSteward: null } });
});

it("refuses media retrieval to an anonymous caller", async () => {
  actor.setIdentity(adminIdentity);
  const { envelope, exportInstanceRef } = ok(
    await actor.exportFamilyArchive(NORWOOD),
  );
  const mediaRef = manifestOf(envelope)[0]?.ref.portableId;
  expect(mediaRef).toBeDefined();

  const anonymous = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  await expect(
    anonymous.retrieveFamilyArchiveMedia(exportInstanceRef, mediaRef!),
  ).resolves.toEqual({ err: { NotSignedIn: null } });
});

it("rejects an unknown export-instance reference", async () => {
  actor.setIdentity(adminIdentity);
  await expect(
    actor.retrieveFamilyArchiveMedia("export-does-not-exist", "media-1"),
  ).resolves.toEqual({ err: { ExportInstanceNotFound: null } });
});
