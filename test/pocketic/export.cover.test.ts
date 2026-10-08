import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";
import {
  BACKEND_WASM,
  adminIdentity,
  blob,
  contributorIdentity,
  registerApprovedContributor,
} from "./lane-helpers";

// ---------------------------------------------------------------------------
// Phase 5A — Data Export / Portability Foundation (real-canister cover).
//
// The accepted behavior this file asserts, driven against the app's own
// compiled wasm through the real public API:
//
//   1. An authenticated user can export MyData for their own identity.
//   2. A user cannot export another member's private data (a caller with no
//      profile in the family is refused; a caller's export never carries
//      another member's profile).
//   3. A non-Steward cannot export FamilyArchive.
//   4. An active Family Steward can export FamilyArchive.
//   5. A Family A export contains no Family B records.
//   6. Invite tokens and authentication secrets are absent from export output.
//   7. Recovery and security secrets are absent from export output.
//   8. The export schema is versioned and self-describing.
//   9. Relationships remain representable in the portable output.
//  10. The export action is audited (see the coverage limit below: the audit
//      collection has no public read endpoint, so the real-canister lane can
//      only observe that the export succeeds and that the read-only guarantee
//      holds; the audit write itself is asserted at the source level in the
//      frontend lane).
//  11. The export operation does not mutate existing family/profile/archive
//      data.
//
// The frontend suite mocks the actor and has no principals, so none of this is
// visible there. This file installs the app's own compiled wasm and drives the
// real public API.
//
// The lane shares one PocketIC sidecar across every file, and installing a
// canister replays the whole migration chain — the single most expensive
// operation in the lane. This file installs ONE canister in `beforeAll` and
// seeds it once; every test is a read-only export against that state.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

const NORWOOD = "norwood";
const FAMILY_B = "export-family-b";

let pic: PocketIc | undefined;
let actor: _SERVICE;
let canisterId: ReturnType<typeof createIdentity>["getPrincipal"];

// Deterministic identities. ADMIN is the first caller to
// _initialize_access_control and claims the Norwood Steward role; CONTRIBUTOR
// is an approved Norwood member who owns the seeded "clayton" profile.
const outsiderIdentity = createIdentity("export-outsider-seed");
const familyBFounderIdentity = createIdentity("export-family-b-founder-seed");

// The seeded Norwood state the export tests read.
let contributorPersonId = "";
let familyBFounderPersonId = "";
let familyBFounderName = "";

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
 * export-instance reference; these Phase 5A assertions read the envelope.
 */
function archiveEnvelopeOf(
  result: { ok: { envelope: { payloadJson: string } } } | { err: unknown },
): { payloadJson: string } {
  return ok(result).envelope;
}

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
  const setup = await pic.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  actor = setup.actor;
  canisterId = setup.canisterId;

  // Norwood Steward (ADMIN) + approved contributor (CONTRIBUTOR owns "clayton").
  await registerApprovedContributor(actor);

  // Resolve the contributor's own person id from their profile.
  actor.setIdentity(contributorIdentity);
  const mine = await actor.getMyProfile();
  if (mine.length === 0) {
    throw new Error("contributor profile was not seeded");
  }
  contributorPersonId = mine[0].personId;

  // A second, unrelated family with its own founder. It has no StewardRecord,
  // so it is a distinct tenant boundary for the isolation assertions.
  actor.setIdentity(familyBFounderIdentity);
  await actor._initialize_access_control();
  familyBFounderName = "Beatrice Boundary";
  const createdB = await actor.createFamilyWithFounder(
    "Boundary Family",
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
    "export-family-b-key",
  );
  if (!("ok" in createdB)) {
    throw new Error(`createFamilyWithFounder failed: ${JSON.stringify(createdB)}`);
  }
  familyBFounderPersonId = createdB.ok.founderProfile.personId;
});

afterAll(async () => {
  await pic?.tearDown();
});

// ---------------------------------------------------------------------------
// (1) An authenticated user can export MyData for their own identity.
// (8) The export schema is versioned and self-describing.
// ---------------------------------------------------------------------------

it("lets an authenticated user export MyData for their own identity", async () => {
  actor.setIdentity(contributorIdentity);
  const envelope = ok(await actor.exportMyData(NORWOOD));

  // Self-describing, versioned metadata.
  expect(envelope.metadata.schemaVersion).toBe(1n);
  expect(envelope.metadata.scope).toEqual({ MyData: null });
  expect(envelope.metadata.format).toEqual({ JSON: null });
  expect(envelope.metadata.sourceAppName).toBe("Norwood");
  expect(envelope.metadata.sourceAppVersion).toEqual(expect.any(String));
  expect(envelope.metadata.generatedAt).toEqual(expect.any(BigInt));
  // `familyRef` is the portable family display name, never the internal id.
  expect(envelope.metadata.familyRef).toEqual(expect.any(String));
  expect(envelope.metadata.familyRef).not.toBe(NORWOOD);

  // The payload is JSON text and carries the caller's own profile.
  const payload = payloadOf(envelope);
  const persons = payload.persons as Array<{ name: string; ref: { kind: string } }>;
  expect(persons).toHaveLength(1);
  expect(persons[0].name).toBe("Clayton Norwood");
  expect(persons[0].ref.kind).toBe("Person");
});

// ---------------------------------------------------------------------------
// (2) A user cannot export another member's private data.
// ---------------------------------------------------------------------------

it("refuses MyData to a caller with no profile in the family", async () => {
  actor.setIdentity(outsiderIdentity);
  await actor._initialize_access_control();

  // The outsider has no profile in Norwood, so the family-scoped profile seam
  // resolves nothing and the export is refused. A known family id alone never
  // grants access.
  await expect(actor.exportMyData(NORWOOD)).resolves.toEqual({
    err: { NotAuthorized: null },
  });
});

it("never carries another member's profile in the caller's MyData export", async () => {
  actor.setIdentity(contributorIdentity);
  const envelope = ok(await actor.exportMyData(NORWOOD));
  const payload = payloadOf(envelope);
  const persons = payload.persons as Array<{ name: string }>;

  // Exactly the caller's own profile; the Steward's profile is not present.
  expect(persons).toHaveLength(1);
  expect(persons.map((p) => p.name)).not.toContain("Ada Admin");
});

// ---------------------------------------------------------------------------
// (3) A non-Steward cannot export FamilyArchive.
// (4) An active Family Steward can export FamilyArchive.
// ---------------------------------------------------------------------------

it("refuses FamilyArchive to a non-Steward", async () => {
  actor.setIdentity(contributorIdentity);
  await expect(actor.exportFamilyArchive(NORWOOD)).resolves.toEqual({
    err: { NotSteward: null },
  });
});

it("lets an active Family Steward export FamilyArchive", async () => {
  actor.setIdentity(adminIdentity);
  const envelope = archiveEnvelopeOf(await actor.exportFamilyArchive(NORWOOD));

  expect(envelope.metadata.scope).toEqual({ FamilyArchive: null });
  expect(envelope.metadata.schemaVersion).toBe(1n);

  const payload = payloadOf(envelope);
  const persons = payload.persons as Array<{ name: string }>;
  // The family archive carries the family's profiles, including the
  // contributor's.
  expect(persons.map((p) => p.name)).toContain("Clayton Norwood");
});

// ---------------------------------------------------------------------------
// (5) A Family A export contains no Family B records.
// ---------------------------------------------------------------------------

it("never includes Family B records in a Norwood FamilyArchive export", async () => {
  actor.setIdentity(adminIdentity);
  const envelope = archiveEnvelopeOf(await actor.exportFamilyArchive(NORWOOD));
  const payload = payloadOf(envelope);

  const persons = payload.persons as Array<{ name: string }>;
  expect(persons.map((p) => p.name)).not.toContain(familyBFounderName);

  // The Family B founder's portable id is family-qualified, so it can never
  // appear in a Norwood export.
  const serialized = envelope.payloadJson;
  expect(serialized).not.toContain(FAMILY_B);
  expect(serialized).not.toContain(familyBFounderPersonId);
});

// ---------------------------------------------------------------------------
// (6) Invite tokens and authentication secrets are absent from export output.
// ---------------------------------------------------------------------------

it("omits invite tokens and authentication secrets from export output", async () => {
  // Create a real invitation in Norwood so the underlying record exists and
  // could be serialized if the export were careless.
  actor.setIdentity(adminIdentity);
  const invited = await actor.createFamilyInvitation(
    NORWOOD,
    contributorPersonId,
    ["invitee@example.com"],
  );
  expect("ok" in invited).toBe(true);

  const envelope = archiveEnvelopeOf(await actor.exportFamilyArchive(NORWOOD));
  const serialized = envelope.payloadJson.toLowerCase();

  // No token, hash, secret, credential, or password material is present.
  for (const forbidden of [
    "tokenhash",
    "token",
    "secret",
    "credential",
    "password",
    "invite",
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
});

// ---------------------------------------------------------------------------
// (7) Recovery and security secrets are absent from export output.
// ---------------------------------------------------------------------------

it("omits recovery and security secrets from MyData export output", async () => {
  // Create a real recovery request so the underlying record exists. The
  // replacement must have their own Norwood profile to export MyData.
  const replacement = createIdentity("export-recovery-replacement-seed");
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

  // The requester exports their own MyData; the recovery status is included
  // but no principal, recovery id, verifier identity, or private reason is.
  actor.setIdentity(replacement);
  const envelope = ok(await actor.exportMyData(NORWOOD));
  const serialized = envelope.payloadJson;

  expect(serialized).not.toContain(replacement.getPrincipal().toText());
  expect(serialized).not.toContain(contributorIdentity.getPrincipal().toText());
  expect(serialized).not.toContain(adminIdentity.getPrincipal().toText());
  for (const forbidden of ["recoveryId", "verifier", "secret", "token"]) {
    expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
  }
});

// ---------------------------------------------------------------------------
// (9) Relationships remain representable in the portable output.
// ---------------------------------------------------------------------------

it("represents relationships through portable record references", async () => {
  // Seed a confirmed Norwood relationship between two real Norwood profiles.
  // The contributor owns "clayton"; create a second Norwood member to relate.
  const sibling = createIdentity("export-sibling-seed");
  actor.setIdentity(sibling);
  await actor._initialize_access_control();
  const created = await actor.createMyselfForFamily(NORWOOD, "Sable Sibling");
  if (!("ok" in created)) {
    throw new Error(`createMyselfForFamily failed: ${JSON.stringify(created)}`);
  }
  const siblingPersonId = created.ok.personId;

  actor.setIdentity(adminIdentity);
  const relationship = await actor.addRelationshipForFamily(
    NORWOOD,
    contributorPersonId,
    siblingPersonId,
    { Sibling: null },
  );
  expect("ok" in relationship).toBe(true);

  const envelope = archiveEnvelopeOf(await actor.exportFamilyArchive(NORWOOD));
  const payload = payloadOf(envelope);
  const persons = payload.persons as Array<{
    ref: { kind: string; portableId: string };
  }>;
  const personRefs = new Set(persons.map((p) => p.ref.portableId));
  const relationships = payload.relationships as Array<{
    fromPersonRef: { kind: string; portableId: string };
    toPersonRef: { kind: string; portableId: string };
    relationshipType: string;
  }>;

  // Phase 5A-H1: portable references are export-local, so a relationship is no
  // longer identified by embedding the raw person ids. The seeded Sibling
  // relationship is located by its portable type, and both endpoints must
  // resolve to exported Person records (the same export-local Person reference
  // that person's own record carries), preserving relational integrity.
  const seeded = relationships.find((r) => r.relationshipType === "Sibling");
  expect(seeded).toBeDefined();
  expect(seeded?.fromPersonRef.kind).toBe("Person");
  expect(seeded?.toPersonRef.kind).toBe("Person");
  expect(personRefs.has(seeded?.fromPersonRef.portableId ?? "")).toBe(true);
  expect(personRefs.has(seeded?.toPersonRef.portableId ?? "")).toBe(true);
  // No raw internal id leaks through either endpoint.
  expect(seeded?.fromPersonRef.portableId).not.toContain(contributorPersonId);
  expect(seeded?.toPersonRef.portableId).not.toContain(siblingPersonId);
});

// ---------------------------------------------------------------------------
// (11) The export operation does not mutate existing family/profile/archive
//      data. (10) The audit write is the only mutation; the audit collection
//      has no public read endpoint, so the lane observes the read-only
//      guarantee and the frontend lane asserts the audit write at source.
// ---------------------------------------------------------------------------

it("does not mutate existing profile or archive data across repeated exports", async () => {
  actor.setIdentity(contributorIdentity);
  const before = await actor.getMyProfile();
  expect(before).toHaveLength(1);

  // Two exports in a row: the read-only operation must leave the profile
  // byte-for-byte identical.
  ok(await actor.exportMyData(NORWOOD));
  ok(await actor.exportMyData(NORWOOD));

  const after = await actor.getMyProfile();
  expect(after).toEqual(before);

  // The archive listing is likewise unchanged by a FamilyArchive export.
  actor.setIdentity(adminIdentity);
  const archiveBefore = await actor.listApprovedArchiveItemsForFamily(NORWOOD);
  archiveEnvelopeOf(await actor.exportFamilyArchive(NORWOOD));
  const archiveAfter = await actor.listApprovedArchiveItemsForFamily(NORWOOD);
  expect(archiveAfter).toEqual(archiveBefore);
});

// ---------------------------------------------------------------------------
// Anonymous callers are refused on both export endpoints.
// ---------------------------------------------------------------------------

it("refuses anonymous callers on both export endpoints", async () => {
  const anonymous = pic!.createActor<_SERVICE>(idlFactory, canisterId);

  await expect(anonymous.exportMyData(NORWOOD)).resolves.toEqual({
    err: { NotSignedIn: null },
  });
  await expect(anonymous.exportFamilyArchive(NORWOOD)).resolves.toEqual({
    err: { NotSignedIn: null },
  });
});
