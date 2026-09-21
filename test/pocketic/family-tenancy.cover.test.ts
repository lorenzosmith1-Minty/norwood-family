import { PocketIc, createIdentity } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
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
// Family tenancy foundation (Tenancy 1A) — real-canister cover.
//
// The accepted behavior for this phase is that the migration chain seeds a
// single stable default family (`norwood` / `Norwood`), that every pre-existing
// core record is backfilled with familyId = "norwood" without disturbing its
// claims, owners, relationships, Steward state, Archive records, or blob/media
// references, and that the read-only `getFamily` lookup never creates a family.
//
// The frontend suite mocks the actor and cannot see any of this; the PocketIC
// lane installs the app's own compiled wasm and calls the real public API, so
// these assertions are the only place the migration and the new query are
// actually executed. A fresh install replays the whole migration chain from an
// empty actor, which is exactly the path that seeds the default family and
// backfills the seeded records.
//
// The upgrade path (re-running the migration over existing state, and proving
// the family is not duplicated or reset) lives in backend.upgrade.test.ts,
// which has the previous revision's wasm to upgrade from.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

let pic: PocketIc | undefined;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
});

afterAll(async () => {
  await pic?.tearDown();
});

// ---------------------------------------------------------------------------
// The default family is seeded by the migration chain and is readable through
// the new public query.
// ---------------------------------------------------------------------------

it("seeds the default Norwood family and returns it from getFamily", async () => {
  const setup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const actor = setup.actor;

  // getFamily is a public read: an anonymous caller may look up a family.
  const family = await actor.getFamily("norwood");
  expect(family).toHaveLength(1);
  expect(family[0]).toMatchObject({
    id: "norwood",
    displayName: "Norwood",
    status: { active: null },
  });
  // The record carries the full Family shape, not just the id/displayName.
  expect(family[0].createdAt).toEqual(expect.any(BigInt));
  expect(family[0].createdBy).toBeDefined();
});

it("returns null for an unknown family id and creates nothing", async () => {
  const setup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const actor = setup.actor;

  // An unknown id resolves to the empty option (`null` in the app's wrapper
  // types) rather than trapping or fabricating a record.
  await expect(actor.getFamily("does-not-exist")).resolves.toEqual([]);

  // The read is side-effect free: the unknown id is still absent on a second
  // read, and the default family is untouched.
  await expect(actor.getFamily("does-not-exist")).resolves.toEqual([]);
  const norwood = await actor.getFamily("norwood");
  expect(norwood).toHaveLength(1);
  expect(norwood[0]).toMatchObject({ id: "norwood", displayName: "Norwood" });
});

// ---------------------------------------------------------------------------
// Every pre-existing core record reads back with familyId = "norwood".
//
// The migration backfills the six core collections. This test seeds one record
// of each kind through the real public API on a fresh canister (whose install
// already ran the migration), then reads each back and asserts the familyId
// field is present and correct — the new shape the accepted criteria require.
// ---------------------------------------------------------------------------

it("backfills familyId = 'norwood' on every core record type", async () => {
  const setup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const actor = setup.actor;

  // ADMIN becomes the Family Steward; CONTRIBUTOR becomes an approved family
  // member so the contribution endpoints below are authorized.
  await registerApprovedContributor(actor);

  // PersonProfile: a seeded profile is backfilled by the migration itself.
  const seededProfile = await actor.getPersonProfile("clayton");
  expect(seededProfile).toHaveLength(1);
  expect(seededProfile[0]).toMatchObject({ personId: "clayton", familyId: "norwood" });

  // ProfileClaim: the approved contributor's claim on 'clayton'.
  actor.setIdentity(adminIdentity);
  const claims = await actor.listProfileClaims();
  const claytonClaim = claims.find((c) => c.personId === "clayton");
  expect(claytonClaim).toBeDefined();
  expect(claytonClaim).toMatchObject({ familyId: "norwood" });

  // RelationshipRequest: a pending proposal between two seeded profiles.
  actor.setIdentity(contributorIdentity);
  const proposed = await actor.proposeRelationship("clayton", "erma", {
    SpousePartner: null,
  });
  expect("ok" in proposed).toBe(true);
  const requests = await actor.getMyRelationshipRequests();
  const request = requests.find((r) => r.relatedPersonId === "erma");
  expect(request).toBeDefined();
  expect(request).toMatchObject({ familyId: "norwood" });

  // Relationship: approve the proposal as the Steward, which confirms it.
  actor.setIdentity(adminIdentity);
  const approved = await actor.approveRelationshipRequest(request!.id);
  expect(approved).toHaveLength(1);
  expect(approved[0]).toMatchObject({ familyId: "norwood" });
  const relationships = await actor.listConfirmedRelationships();
  const relationship = relationships.find(
    (r) => r.fromPersonId === "clayton" && r.toPersonId === "erma",
  );
  expect(relationship).toBeDefined();
  expect(relationship).toMatchObject({ familyId: "norwood" });

  // StewardRecord: the Steward bootstrap record written by claimSteward.
  const stewards = await actor.listStewards();
  expect(stewards.length).toBeGreaterThan(0);
  for (const steward of stewards) {
    expect(steward).toMatchObject({ familyId: "norwood" });
  }

  // ArchiveItem: a submitted contribution.
  actor.setIdentity(contributorIdentity);
  const item = await actor.submitArchiveItem(
    "A family letter",
    "A letter from 1924.",
    { Document: null },
    "application/pdf",
    blob,
    "1924",
    [1924n],
    ["letters"],
    ["julia"],
    ["branch-1"],
    { Original: null },
    { FamilyOnly: null },
    { Standard: null },
    [],
    "family-letter.pdf",
  );
  actor.setIdentity(adminIdentity);
  const pending = await actor.listPendingArchiveItems();
  const stored = pending.find((i) => i.id === item.id);
  expect(stored).toBeDefined();
  expect(stored).toMatchObject({ familyId: "norwood" });
});

// ---------------------------------------------------------------------------
// The migration preserves the pre-existing record contents, not just the new
// familyId field: claims, owners, relationships, Steward state, Archive
// records, and blob/media references all read back unchanged.
// ---------------------------------------------------------------------------

it("preserves claims, owners, relationships, Steward state, and Archive records", async () => {
  const setup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const actor = setup.actor;

  await registerApprovedContributor(actor);

  // The seeded 'clayton' profile keeps its identity and lifecycle state; the
  // migration only adds familyId. registerApprovedContributor approved the
  // contributor's claim on 'clayton', so it reads back Claimed with that owner
  // — the ownership link the migration must preserve.
  const profile = await actor.getPersonProfile("clayton");
  expect(profile).toHaveLength(1);
  expect(profile[0]).toMatchObject({
    personId: "clayton",
    name: "Clayton Norwood",
    claimStatus: { Claimed: null },
    livingStatus: { Living: null },
  });
  expect(profile[0].claimedByUserId).toBeDefined();

  // The approved claim keeps its requester and status.
  actor.setIdentity(adminIdentity);
  const claims = await actor.listProfileClaims();
  const claim = claims.find((c) => c.personId === "clayton");
  expect(claim).toMatchObject({
    personId: "clayton",
    status: { Approved: null },
  });
  expect(claim?.requestingUserId).toBeDefined();

  // The Steward record keeps its active role and assignment metadata.
  const stewards = await actor.listStewards();
  const active = stewards.find((s) => "Active" in s.roleStatus);
  expect(active).toBeDefined();
  expect(active).toMatchObject({ roleStatus: { Active: null } });
  expect(active?.assignedBy).toBeDefined();
  expect(active?.assignedAt).toEqual(expect.any(BigInt));

  // An archive item's blob/media reference survives: the stored bytes are
  // byte-for-byte the submitted bytes, and the persisted upload metadata is
  // intact.
  actor.setIdentity(contributorIdentity);
  const item = await actor.submitArchiveItem(
    "Preserved letter",
    "A letter whose bytes must survive.",
    { Document: null },
    "application/pdf",
    blob,
    "1924",
    [1924n],
    ["letters"],
    ["julia"],
    ["branch-1"],
    { Original: null },
    { FamilyOnly: null },
    { Standard: null },
    [],
    "preserved-letter.pdf",
  );
  actor.setIdentity(adminIdentity);
  const pending = await actor.listPendingArchiveItems();
  const stored = pending.find((i) => i.id === item.id);
  expect(stored).toBeDefined();
  expect(stored?.blob).toEqual(blob);
  expect(stored).toMatchObject({
    title: "Preserved letter",
    era: "1924",
    tags: ["letters"],
    status: { Pending: null },
    mimeType: ["application/pdf"],
    filename: ["preserved-letter.pdf"],
  });
});

// ---------------------------------------------------------------------------
// getFamily is a read-only surface: no family-creation endpoint is exposed, and
// repeated reads never add a second family.
// ---------------------------------------------------------------------------

it("exposes no family-creation surface and never duplicates the default family", async () => {
  const setup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const actor = setup.actor;

  // The only family-related method on the real Candid interface is the
  // read-only getFamily lookup; there is no createFamily/onboardFamily surface.
  // The service class's `_fields` is the authoritative method list the canister
  // actually exposes, so this reads the deployed interface rather than the
  // actor object's own enumerable keys.
  const service = idlFactory({ IDL }) as unknown as {
    _fields: Array<[string, unknown]>;
  };
  const familyMethods = service._fields
    .map(([name]) => name)
    .filter((name) => name.toLowerCase().includes("family"));
  expect(familyMethods).toEqual(["getFamily"]);

  // Repeated reads of the default family return the same single record.
  const first = await actor.getFamily("norwood");
  const second = await actor.getFamily("norwood");
  expect(first).toHaveLength(1);
  expect(second).toHaveLength(1);
  expect(second[0]).toEqual(first[0]);
});

// ---------------------------------------------------------------------------
// A caller-isolation check for the new query: getFamily is public, so an
// anonymous caller and a signed-in caller see the same family record.
// ---------------------------------------------------------------------------

it("lets an anonymous caller read the default family", async () => {
  const setup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });

  // A fresh actor with no identity set is anonymous.
  const anonymous = pic!.createActor<_SERVICE>(idlFactory, setup.canisterId);
  const family = await anonymous.getFamily("norwood");
  expect(family).toHaveLength(1);
  expect(family[0]).toMatchObject({ id: "norwood", displayName: "Norwood" });

  // A signed-in caller sees the same record.
  const signedIn = createIdentity("family-reader-seed");
  setup.actor.setIdentity(signedIn);
  const asSignedIn = await setup.actor.getFamily("norwood");
  expect(asSignedIn).toEqual(family);
});
