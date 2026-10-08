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
// Phase 5A-H1 — portable export reference hardening (real-canister cover).
//
// The accepted Phase 5A-H1 requirement is that every reference emitted by an
// export is EXPORT-LOCAL and carries NO raw internal identifier: not the family
// id, person id, membership id, relationship id, archive item id, story id,
// source id, recipe id, or recovery request id. Relationships must stay
// internally consistent: a relationship endpoint must resolve to the same
// export-local Person reference used by that person's own record.
//
// This file drives the app's own compiled wasm through the real public API and
// inspects the serialized `payloadJson`. The frontend suite mocks the actor and
// has no principals, so none of this is visible there; the focused frontend
// static test (src/frontend/src/ExportPortableReferenceCover.test.ts) pins the
// reference-construction contract, and this lane is the runtime evidence.
//
// The lane shares one PocketIC sidecar across every file, and installing a
// canister replays the whole migration chain. This file installs ONE canister
// in `beforeAll` and seeds it once; every test is a read-only export against
// that state.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

const NORWOOD = "norwood";

let pic: PocketIc | undefined;
let actor: _SERVICE;

const siblingIdentity = createIdentity("export-portable-sibling-seed");

let contributorPersonId = "";
let siblingPersonId = "";

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

/**
 * Unwraps a FamilyArchive export result to its versioned envelope. Phase 5C-H1
 * changed `exportFamilyArchive` to return the envelope plus an opaque
 * export-instance reference; these Phase 5A-H1 assertions read the envelope.
 */
function archiveEnvelopeOf(
  result: { ok: { envelope: { payloadJson: string } } } | { err: unknown },
): { payloadJson: string } {
  return ok(result).envelope;
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

  // Norwood Steward (ADMIN) + approved contributor (CONTRIBUTOR owns "clayton").
  await registerApprovedContributor(actor);

  actor.setIdentity(contributorIdentity);
  const mine = await actor.getMyProfile();
  if (mine.length === 0) {
    throw new Error("contributor profile was not seeded");
  }
  contributorPersonId = mine[0].personId;

  // A second Norwood member to relate to the contributor.
  actor.setIdentity(siblingIdentity);
  await actor._initialize_access_control();
  const created = await actor.createMyselfForFamily(NORWOOD, "Sable Sibling");
  if (!("ok" in created)) {
    throw new Error(`createMyselfForFamily failed: ${JSON.stringify(created)}`);
  }
  siblingPersonId = created.ok.personId;

  actor.setIdentity(adminIdentity);
  const relationship = await actor.addRelationshipForFamily(
    NORWOOD,
    contributorPersonId,
    siblingPersonId,
    { Sibling: null },
  );
  if (!("ok" in relationship)) {
    throw new Error(`addRelationshipForFamily failed: ${JSON.stringify(relationship)}`);
  }
});

afterAll(async () => {
  await pic?.tearDown();
});

// ---------------------------------------------------------------------------
// required_check_1..4, 6 — no raw internal identifier in any record reference.
// ---------------------------------------------------------------------------

it("emits no raw family id in any record reference", async () => {
  actor.setIdentity(adminIdentity);
  const envelope = archiveEnvelopeOf(await actor.exportFamilyArchive(NORWOOD));
  const payload = payloadOf(envelope);

  for (const portableId of portableIds(payload)) {
    expect(portableId).not.toContain(NORWOOD);
  }
  // The serialized text must not carry the raw family id through a reference.
  expect(envelope.payloadJson).not.toContain(`"${NORWOOD}`);
});

it("emits no raw person id in any record reference", async () => {
  actor.setIdentity(adminIdentity);
  const envelope = archiveEnvelopeOf(await actor.exportFamilyArchive(NORWOOD));
  const payload = payloadOf(envelope);

  for (const portableId of portableIds(payload)) {
    expect(portableId).not.toContain(contributorPersonId);
    expect(portableId).not.toContain(siblingPersonId);
  }
});

it("resolves relationship endpoints to exported person references", async () => {
  actor.setIdentity(adminIdentity);
  const envelope = archiveEnvelopeOf(await actor.exportFamilyArchive(NORWOOD));
  const payload = payloadOf(envelope);

  const persons = payload.persons as Array<{ ref: { kind: string; portableId: string } }>;
  const personRefs = new Set(persons.map((p) => p.ref.portableId));

  const relationships = payload.relationships as Array<{
    fromPersonRef: { kind: string; portableId: string };
    toPersonRef: { kind: string; portableId: string };
  }>;
  expect(relationships.length).toBeGreaterThan(0);
  for (const relationship of relationships) {
    expect(relationship.fromPersonRef.kind).toBe("Person");
    expect(relationship.toPersonRef.kind).toBe("Person");
    // Both endpoints must resolve to a Person record in the same export.
    expect(personRefs.has(relationship.fromPersonRef.portableId)).toBe(true);
    expect(personRefs.has(relationship.toPersonRef.portableId)).toBe(true);
  }
});

// ---------------------------------------------------------------------------
// Export-local sequential references — the accepted Phase 5A-H1 mechanism.
//
// The accepted requirement is that portable refs are assigned from an
// export-local namespace (`person-1`, `person-2`, `membership-1`, …), that two
// distinct persons become distinct person-N refs, and that every reference to
// the same internal record within one export reuses the same token. These are
// runtime properties of the real canister, so they are asserted here.
// ---------------------------------------------------------------------------

it("assigns sequential export-local person references", async () => {
  actor.setIdentity(adminIdentity);
  const envelope = archiveEnvelopeOf(await actor.exportFamilyArchive(NORWOOD));
  const payload = payloadOf(envelope);

  const persons = payload.persons as Array<{ ref: { portableId: string } }>;
  expect(persons.length).toBeGreaterThanOrEqual(2);

  const personIds = persons.map((p) => p.ref.portableId);
  // Every person reference is a `person-N` token, not a raw/encoded id.
  for (const portableId of personIds) {
    expect(portableId).toMatch(/^person-\d+$/u);
  }
  // Two distinct persons become distinct person-N refs.
  expect(new Set(personIds).size).toBe(personIds.length);
  // The numbering is sequential from 1 with no gaps.
  const numbers = personIds
    .map((id) => Number.parseInt(id.slice("person-".length), 10))
    .sort((a, b) => a - b);
  expect(numbers).toEqual(
    Array.from({ length: personIds.length }, (_, index) => index + 1),
  );
});

it("reuses the same export-local person reference for the same internal person", async () => {
  actor.setIdentity(adminIdentity);
  const envelope = archiveEnvelopeOf(await actor.exportFamilyArchive(NORWOOD));
  const payload = payloadOf(envelope);

  const persons = payload.persons as Array<{ ref: { portableId: string } }>;
  const personRefs = new Set(persons.map((p) => p.ref.portableId));

  // Every person-pointing field in the export must resolve to one of the
  // exported Person references — the same token that person's own record
  // carries. A fresh token per appearance would produce a dangling reference.
  const relationships = payload.relationships as Array<{
    fromPersonRef: { portableId: string };
    toPersonRef: { portableId: string };
  }>;
  for (const relationship of relationships) {
    expect(personRefs.has(relationship.fromPersonRef.portableId)).toBe(true);
    expect(personRefs.has(relationship.toPersonRef.portableId)).toBe(true);
  }

  const memberships = payload.memberships as Array<{
    personRef: { portableId: string };
  }>;
  for (const membership of memberships) {
    expect(personRefs.has(membership.personRef.portableId)).toBe(true);
  }

  // The contributor appears in both their own Person record and the Sibling
  // relationship; both must use the same export-local token.
  const contributorRef = persons.find(
    (p) => (p as { name?: string }).name === "Clayton Norwood",
  )?.ref.portableId;
  expect(contributorRef).toBeDefined();
  const sibling = relationships.find(
    (r) => (r as { relationshipType?: string }).relationshipType === "Sibling",
  );
  expect(sibling).toBeDefined();
  const endpoints = [
    sibling?.fromPersonRef.portableId,
    sibling?.toPersonRef.portableId,
  ];
  expect(endpoints).toContain(contributorRef);
});

it("restarts export-local numbering for each generated export", async () => {
  actor.setIdentity(adminIdentity);
  const first = payloadOf(archiveEnvelopeOf(await actor.exportFamilyArchive(NORWOOD)));
  const second = payloadOf(archiveEnvelopeOf(await actor.exportFamilyArchive(NORWOOD)));

  const firstPersons = (first.persons as Array<{ ref: { portableId: string } }>).map(
    (p) => p.ref.portableId,
  );
  const secondPersons = (second.persons as Array<{ ref: { portableId: string } }>).map(
    (p) => p.ref.portableId,
  );

  // Numbering restarts for every export, so the same family yields the same
  // person-1..person-N sequence each time (cross-export stability is not
  // required, but the namespace is rebuilt from scratch).
  expect(firstPersons).toEqual(secondPersons);
  expect(firstPersons[0]).toBe("person-1");
});

// ---------------------------------------------------------------------------
// required_check_5 — MyData recovery reference carries no internal recovery id.
// ---------------------------------------------------------------------------

it("emits a recovery reference with no internal recovery request id", async () => {
  const replacement = createIdentity("export-portable-recovery-seed");
  actor.setIdentity(replacement);
  await actor._initialize_access_control();
  const replacementProfile = await actor.createMyselfForFamily(
    NORWOOD,
    "Rhea Replacement",
  );
  expect("ok" in replacementProfile).toBe(true);
  const requested = await actor.requestRecoveryForFamily(
    NORWOOD,
    contributorPersonId,
    replacement.getPrincipal(),
  );
  expect("ok" in requested).toBe(true);

  actor.setIdentity(replacement);
  const envelope = ok(await actor.exportMyData(NORWOOD));
  const payload = payloadOf(envelope);
  const recoveryStatuses = payload.recoveryStatuses as Array<{
    ref: { kind: string; portableId: string };
  }>;
  expect(recoveryStatuses.length).toBeGreaterThan(0);
  for (const status of recoveryStatuses) {
    expect(status.ref.kind).toBe("RecoveryStatus");
    // The internal recovery request id is a small integer; the portable id must
    // not be the bare id or a family-prefixed composite of it.
    expect(status.ref.portableId).not.toMatch(/^\d+$/u);
    expect(status.ref.portableId).not.toContain(NORWOOD);
  }
});

// ---------------------------------------------------------------------------
// required_check_8 — the export schema remains versioned and valid JSON.
// ---------------------------------------------------------------------------

it("keeps the export schema versioned and the payload valid JSON", async () => {
  actor.setIdentity(adminIdentity);
  const envelope = archiveEnvelopeOf(await actor.exportFamilyArchive(NORWOOD));

  expect(envelope.metadata.schemaVersion).toBe(1n);
  expect(envelope.metadata.scope).toEqual({ FamilyArchive: null });
  expect(envelope.metadata.format).toEqual({ JSON: null });

  // `payloadJson` must parse as a JSON object with the expected categories.
  const payload = payloadOf(envelope);
  for (const category of [
    "persons",
    "memberships",
    "relationships",
    "archiveItems",
    "stories",
    "sources",
    "recipes",
    "recoveryStatuses",
    "mediaManifest",
  ]) {
    expect(Array.isArray(payload[category])).toBe(true);
  }
});
