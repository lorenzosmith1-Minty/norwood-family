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
// Tenancy 1C-B1 — family-scoped Archive endpoints (real-canister cover).
//
// The accepted behavior is that the canonical `*ForFamily` Archive endpoints
// enforce the family boundary: a member of Family A can read Family A's Archive
// and cannot read Family B's; a member of Family A cannot submit into Family B;
// a Steward of one family cannot approve or reject another family's item;
// approved and pending Family A items never appear in Family B's listings; and
// an `archiveItemId` alone never crosses the boundary. The default Norwood
// family's legacy behavior must be unchanged.
//
// The frontend suite mocks the actor, so none of this is visible there. This
// file installs the app's own compiled wasm and drives the real public API.
//
// Test-only families: `test-family-a` and `test-family-b`. There is no
// family-creation endpoint, and the family-scoped endpoints accept an arbitrary
// familyId, so a caller becomes an approved member of a family by creating a
// profile in it (`createMyselfForFamily` writes an APPROVED claim for the
// caller in that family). That is the only public path to non-default-family
// membership.
//
// Coverage limit this file cannot close: there is no public endpoint that
// creates a Steward of a non-default family (`claimSteward` and
// `promoteToSteward` both write `familyId = "norwood"`), so "a Steward of
// Family A cannot approve a Family B item" is exercised here as "the Norwood
// Steward cannot approve/reject a `test-family-b` item" plus "an approved
// member of B who is not a Steward cannot approve a B item". The internal
// predicate for a non-default-family Steward is covered by the sibling
// `archive-family-isolation.behavior.test.ts`, which executes the real Motoko
// source.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";
const NORWOOD = "norwood";

const MEMBERSHIP_MARKER =
  "Family membership required. Claim your family profile and wait for Family Steward approval before contributing family content.";
const STEWARD_MARKER =
  "Unauthorized: Only Family Stewards can perform this action";

let pic: PocketIc | undefined;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
});

afterAll(async () => {
  await pic?.tearDown();
});

// Deterministic identities. ADMIN is the first caller to
// _initialize_access_control and claims the Norwood Steward role; CONTRIBUTOR
// is an approved Norwood member. MEMBER_A and MEMBER_B become approved members
// of the two test-only families.
const memberAIdentity = createIdentity("archive-family-a-member-seed");
const memberBIdentity = createIdentity("archive-family-b-member-seed");

interface Seeded {
  actor: _SERVICE;
  canisterId: ReturnType<typeof createIdentity>["getPrincipal"];
}

/**
 * A fresh canister with the Norwood Steward bootstrapped, an approved Norwood
 * contributor, and MEMBER_A / MEMBER_B approved in their respective test-only
 * families. Each test seeds its own canister so no test depends on the order
 * another ran in.
 */
async function setupFamilies(): Promise<Seeded> {
  const setup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const actor = setup.actor;

  await registerApprovedContributor(actor);

  // `createMyselfForFamily` creates a minimal profile owned by the caller and
  // writes an APPROVED claim for it in that family, which is what makes the
  // caller an approved member of the family.
  actor.setIdentity(memberAIdentity);
  await actor._initialize_access_control();
  const createdA = await actor.createMyselfForFamily(FAMILY_A, "Family A Member");
  expect("ok" in createdA).toBe(true);

  actor.setIdentity(memberBIdentity);
  await actor._initialize_access_control();
  const createdB = await actor.createMyselfForFamily(FAMILY_B, "Family B Member");
  expect("ok" in createdB).toBe(true);

  return { actor, canisterId: setup.canisterId };
}

/** Submits a FamilyOnly document into `familyId` as the currently-set caller. */
async function submitInto(
  actor: _SERVICE,
  familyId: string,
  title: string,
): Promise<bigint> {
  const item = await actor.submitArchiveItemForFamily(
    familyId,
    title,
    `A contribution into ${familyId}.`,
    { Document: null },
    "application/pdf",
    blob,
    "",
    [],
    [],
    [],
    [],
    { Original: null },
    { FamilyOnly: null },
    { Standard: null },
    [],
    `${title.replace(/\s+/gu, "-").toLowerCase()}.pdf`,
  );
  return item.id;
}

// ---------------------------------------------------------------------------
// (1) A member of Family A can read Family A Archive items.
// ---------------------------------------------------------------------------

it("lets a member of Family A read a Family A Archive item by id", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const id = await submitInto(actor, FAMILY_A, "Family A letter");

  // The same caller reads it back through the family-scoped lookup.
  const read = await actor.getArchiveItemForFamily(FAMILY_A, id);
  expect(read).toHaveLength(1);
  expect(read[0]).toMatchObject({
    id,
    familyId: FAMILY_A,
    title: "Family A letter",
    status: { Pending: null },
  });
});

// ---------------------------------------------------------------------------
// (2) A member of Family A cannot read any Family B Archive item.
// ---------------------------------------------------------------------------

it("does not let a member of Family A read a Family B item by id", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberBIdentity);
  const idB = await submitInto(actor, FAMILY_B, "Family B letter");

  // MEMBER_A is not an approved member of Family B, so the family-scoped read
  // is denied outright.
  actor.setIdentity(memberAIdentity);
  await expect(actor.getArchiveItemForFamily(FAMILY_B, idB)).rejects.toThrow(
    new RegExp(MEMBERSHIP_MARKER, "i"),
  );

  // And the same id looked up under Family A resolves to nothing: the record
  // belongs to Family B, so it is never returned.
  await expect(actor.getArchiveItemForFamily(FAMILY_A, idB)).resolves.toEqual([]);
});

it("does not show a Family B FamilyOnly item in Family A's approved listing", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberBIdentity);
  const idB = await submitInto(actor, FAMILY_B, "Family B private letter");

  // The approved listing is readable without membership, but privacy is
  // enforced server-side: a FamilyOnly item is visible only to an approved
  // member of its own family, so MEMBER_A sees nothing from Family B.
  actor.setIdentity(memberAIdentity);
  const listingA = await actor.listApprovedArchiveItemsForFamily(FAMILY_B);
  expect(listingA.find((i) => i.id === idB)).toBeUndefined();
});

// ---------------------------------------------------------------------------
// (3) A member of Family A cannot submit an Archive item into Family B.
// ---------------------------------------------------------------------------

it("denies a member of Family A submitting into Family B", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  await expect(
    actor.submitArchiveItemForFamily(
      FAMILY_B,
      "Cross-family submission",
      "A member of A must not contribute into B.",
      { Document: null },
      "application/pdf",
      blob,
      "",
      [],
      [],
      [],
      [],
      { Original: null },
      { FamilyOnly: null },
      { Standard: null },
      [],
      "cross-family.pdf",
    ),
  ).rejects.toThrow(new RegExp(MEMBERSHIP_MARKER, "i"));

  // Nothing was stored in Family B: its approved listing is empty.
  const listingB = await actor.listApprovedArchiveItemsForFamily(FAMILY_B);
  expect(listingB).toEqual([]);
});

// ---------------------------------------------------------------------------
// (4) A Steward of one family cannot approve or reject another family's item.
// ---------------------------------------------------------------------------

it("denies the Norwood Steward approving or rejecting a Family B item", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberBIdentity);
  const idB = await submitInto(actor, FAMILY_B, "Family B pending letter");

  // The Norwood Steward holds no Steward record for Family B, so both review
  // actions are denied and the item stays pending.
  actor.setIdentity(adminIdentity);
  await expect(actor.approveArchiveItemForFamily(FAMILY_B, idB)).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
  await expect(actor.rejectArchiveItemForFamily(FAMILY_B, idB)).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );

  // The item is untouched: still pending and still readable by its own member.
  actor.setIdentity(memberBIdentity);
  const read = await actor.getArchiveItemForFamily(FAMILY_B, idB);
  expect(read).toHaveLength(1);
  expect(read[0]).toMatchObject({ id: idB, status: { Pending: null } });
});

it("denies an approved member of Family B who is not a Steward approving a Family B item", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberBIdentity);
  const idB = await submitInto(actor, FAMILY_B, "Family B member review attempt");

  // Approved membership is not Steward authority.
  await expect(actor.approveArchiveItemForFamily(FAMILY_B, idB)).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
  await expect(actor.rejectArchiveItemForFamily(FAMILY_B, idB)).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
});

// ---------------------------------------------------------------------------
// (5) Approved Family A items never appear in Family B listings.
//
// The public API cannot approve a non-default-family item (no Steward of A
// exists), so the boundary is driven in the direction the API supports: an
// approved Norwood item must never appear in Family A's listing, and a Family A
// item must never appear in Norwood's listing.
// ---------------------------------------------------------------------------

it("never shows an approved Norwood item in Family A's listing", async () => {
  const { actor } = await setupFamilies();

  // CONTRIBUTOR submits into Norwood; the Norwood Steward approves it.
  actor.setIdentity(contributorIdentity);
  const norwoodItem = await actor.submitArchiveItem(
    "Approved Norwood letter",
    "An approved Norwood contribution.",
    { Document: null },
    "application/pdf",
    blob,
    "",
    [],
    [],
    [],
    [],
    { Original: null },
    { FamilyOnly: null },
    { Standard: null },
    [],
    "approved-norwood.pdf",
  );
  actor.setIdentity(adminIdentity);
  const approved = await actor.approveArchiveItem(norwoodItem.id);
  expect(approved).toHaveLength(1);
  expect(approved[0]).toMatchObject({ status: { Approved: null } });

  // The Norwood listing shows it; Family A's listing does not.
  const norwoodListing = await actor.listApprovedArchiveItemsForFamily(NORWOOD);
  expect(norwoodListing.find((i) => i.id === norwoodItem.id)).toBeDefined();

  actor.setIdentity(memberAIdentity);
  const listingA = await actor.listApprovedArchiveItemsForFamily(FAMILY_A);
  expect(listingA.find((i) => i.id === norwoodItem.id)).toBeUndefined();
  expect(listingA).toEqual([]);
});

// ---------------------------------------------------------------------------
// (6) Pending Family A items never appear in Family B listings.
//
// Only the Norwood family has a Steward, so the only pending listing that can
// be read is Norwood's. A pending Family A item must not appear there.
// ---------------------------------------------------------------------------

it("never shows a pending Family A item in the Norwood pending listing", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const idA = await submitInto(actor, FAMILY_A, "Pending Family A letter");

  // The Norwood Steward's pending listing (family-scoped and legacy) excludes
  // the Family A item.
  actor.setIdentity(adminIdentity);
  const pendingNorwood = await actor.listPendingArchiveItemsForFamily(NORWOOD);
  expect(pendingNorwood.find((i) => i.id === idA)).toBeUndefined();

  const legacyPending = await actor.listPendingArchiveItems();
  expect(legacyPending.find((i) => i.id === idA)).toBeUndefined();
});

// ---------------------------------------------------------------------------
// (7) A lookup by the same archiveItemId cannot cross the family boundary.
// ---------------------------------------------------------------------------

it("does not resolve a Family A item id under Norwood, nor a Norwood id under Family A", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const idA = await submitInto(actor, FAMILY_A, "Boundary Family A letter");

  actor.setIdentity(contributorIdentity);
  const norwoodItem = await actor.submitArchiveItem(
    "Boundary Norwood letter",
    "A Norwood contribution.",
    { Document: null },
    "application/pdf",
    blob,
    "",
    [],
    [],
    [],
    [],
    { Original: null },
    { FamilyOnly: null },
    { Standard: null },
    [],
    "boundary-norwood.pdf",
  );

  // The Norwood Steward cannot resolve the Family A id under Norwood.
  actor.setIdentity(adminIdentity);
  await expect(actor.getArchiveItemForFamily(NORWOOD, idA)).resolves.toEqual([]);

  // The Family A member cannot resolve the Norwood id under Family A.
  actor.setIdentity(memberAIdentity);
  await expect(
    actor.getArchiveItemForFamily(FAMILY_A, norwoodItem.id),
  ).resolves.toEqual([]);

  // Each id still resolves under its own family.
  await expect(actor.getArchiveItemForFamily(FAMILY_A, idA)).resolves.toHaveLength(1);
  actor.setIdentity(adminIdentity);
  await expect(
    actor.getArchiveItemForFamily(NORWOOD, norwoodItem.id),
  ).resolves.toHaveLength(1);
});

// ---------------------------------------------------------------------------
// Search is family-scoped too.
// ---------------------------------------------------------------------------

it("scopes searchArchiveItemsForFamily to the requested family and denies a non-member", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const idA = await submitInto(actor, FAMILY_A, "Searchable Family A letter");

  // Search requires approved membership of the family; MEMBER_A is approved in
  // A but not in B.
  await expect(
    actor.searchArchiveItemsForFamily(FAMILY_B, {
      familyId: FAMILY_B,
      searchTerm: [],
      tags: [],
      itemType: [],
      relatedMemberId: [],
      era: [],
    }),
  ).rejects.toThrow(new RegExp(MEMBERSHIP_MARKER, "i"));

  // The Family A search runs and never returns a Family B record.
  const resultsA = await actor.searchArchiveItemsForFamily(FAMILY_A, {
    familyId: FAMILY_A,
    searchTerm: [],
    tags: [],
    itemType: [],
    relatedMemberId: [],
    era: [],
  });
  expect(resultsA.every((i) => i.familyId === FAMILY_A)).toBe(true);
  // The item is pending, so it is not in the approved search results.
  expect(resultsA.find((i) => i.id === idA)).toBeUndefined();
});

// ---------------------------------------------------------------------------
// (8) Default Norwood behavior is unchanged.
// ---------------------------------------------------------------------------

it("keeps the legacy Norwood Archive flow working end to end", async () => {
  const { actor } = await setupFamilies();

  // Legacy submit -> pending -> approve -> approved, all through the
  // no-argument compatibility wrappers.
  actor.setIdentity(contributorIdentity);
  const item = await actor.submitArchiveItem(
    "Legacy Norwood letter",
    "A legacy contribution.",
    { Document: null },
    "application/pdf",
    blob,
    "",
    [],
    [],
    [],
    [],
    { Original: null },
    { FamilyOnly: null },
    { Standard: null },
    [],
    "legacy-norwood.pdf",
  );
  expect(item).toMatchObject({ familyId: NORWOOD, status: { Pending: null } });

  actor.setIdentity(adminIdentity);
  const pending = await actor.listPendingArchiveItems();
  expect(pending.find((i) => i.id === item.id)).toBeDefined();

  const approved = await actor.approveArchiveItem(item.id);
  expect(approved).toHaveLength(1);
  expect(approved[0]).toMatchObject({ id: item.id, status: { Approved: null } });

  const approvedList = await actor.listApprovedArchiveItems();
  expect(approvedList.find((i) => i.id === item.id)).toBeDefined();

  // The legacy count and the family-scoped Norwood count agree.
  const legacyCount = await actor.getPendingContributionsCount();
  const norwoodCount = await actor.getPendingContributionsCountForFamily(NORWOOD);
  expect(norwoodCount).toBe(legacyCount);
});

it("scopes the pending count to the family and denies a non-Steward", async () => {
  const { actor } = await setupFamilies();

  // A pending Family A item must not inflate the Norwood count.
  actor.setIdentity(memberAIdentity);
  await submitInto(actor, FAMILY_A, "Counted Family A letter");

  actor.setIdentity(adminIdentity);
  const norwoodCount = await actor.getPendingContributionsCountForFamily(NORWOOD);
  expect(norwoodCount).toBe(0n);

  // A non-Steward cannot read a family's pending count.
  actor.setIdentity(memberAIdentity);
  await expect(
    actor.getPendingContributionsCountForFamily(FAMILY_A),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
});
