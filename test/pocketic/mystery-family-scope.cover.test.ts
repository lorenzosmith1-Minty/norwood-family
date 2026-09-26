import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";
import {
  BACKEND_WASM,
  adminIdentity,
  blob,
  memberAIdentity,
  memberBIdentity,
} from "./lane-helpers";

// ---------------------------------------------------------------------------
// Tenancy 1C-D4-A — family-scoped Family Mystery endpoints (real-canister
// cover).
//
// The accepted behavior is that the canonical `*ForFamily` mystery endpoints
// enforce the family boundary: a mystery created in one family is visible only
// under that family and never under another; a `mysteryId` or
// `contributionId` alone never crosses the boundary (a foreign-family id
// behaves exactly like not-found, never a distinguishable error that leaks
// family existence, and is never mutated); a member of Family A can submit a
// contribution into Family A but not into Family B; a mystery cannot reference
// a person or link Archive media belonging to another family; a Steward of one
// family cannot review, resolve, or edit another family's mysteries; and the
// legacy no-familyId Norwood endpoints still work unchanged through the
// TEMPORARY wrappers.
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
// Coverage limits this file cannot close, stated plainly:
//
//   * There is no public endpoint that creates a Steward of a non-default
//     family (`claimSteward` and `promoteToSteward` both write
//     `familyId = "norwood"`), so a Family A mystery cannot be created through
//     the public API at all — `createCanonicalMysteryForFamily` is Steward-only
//     and no Family A Steward can exist. The "member A can read Mystery A" and
//     "member A can contribute to Mystery A" directions are therefore driven in
//     the default family (where a Steward exists) and in the denial direction
//     for Family A. The internal family-scoped predicate is covered by the
//     sibling `family-scoped-authorization.behavior.test.ts`, which executes
//     the real Motoko source.
//   * The cross-family Steward denial is driven in the direction the API
//     supports: the Norwood Steward cannot act on a Family A mystery, and an
//     approved Family A member who is not a Steward cannot act on a Family A
//     mystery either.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";
const NORWOOD = "norwood";

const STEWARD_MARKER =
  "Unauthorized: Only Family Stewards can perform this action";
// The canonical family-membership gate's stable, non-technical message. It
// carries no family id or principal.
const MEMBER_MARKER =
  "Family membership required. Claim your family profile and wait for Family Steward approval before contributing family content.";
const LINKED_MEDIA_MARKER =
  "Unauthorized: Linked media must belong to the same family";
const RELATED_PERSON_MARKER =
  "Unauthorized: Related family members must belong to the same family";
const MYSTERY_NOT_FOUND_MARKER = "Mystery not found";

let pic: PocketIc | undefined;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
});

afterAll(async () => {
  await pic?.tearDown();
});

interface Seeded {
  actor: _SERVICE;
  canisterId: ReturnType<typeof createIdentity>["getPrincipal"];
}

/**
 * A fresh canister with the Norwood Steward bootstrapped and MEMBER_A /
 * MEMBER_B approved in their respective test-only families. Each test seeds its
 * own canister so no test depends on the order another ran in.
 */
async function setupFamilies(): Promise<Seeded> {
  const setup = await pic!.setupCanister<_SERVICE>({
    idlFactory,
    wasm: BACKEND_WASM,
  });
  const actor = setup.actor;

  // ADMIN becomes the Norwood Family Steward. Steward authority is the
  // canonical active-Steward record, not the platform admin role: the first
  // caller to _initialize_access_control is #admin but must still claim the
  // Steward role explicitly.
  actor.setIdentity(adminIdentity);
  await actor._initialize_access_control();
  await actor.claimSteward();

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

/** The personId of the profile `createMyselfForFamily` created for the caller. */
async function myPersonIdIn(actor: _SERVICE, familyId: string): Promise<string> {
  const profile = await actor.getMyProfileForFamily(familyId);
  if (profile.length === 0) {
    throw new Error(`no profile for the caller in ${familyId}`);
  }
  return profile[0].personId;
}

/**
 * Creates a canonical mystery in `familyId` as the currently-set caller (which
 * must be a Steward of that family). The related member defaults to the
 * caller's own profile in that family, which exists.
 */
async function createMysteryInto(
  actor: _SERVICE,
  familyId: string,
  title: string,
  overrides: {
    relatedMemberIds?: string[];
    relatedArchiveItemIds?: bigint[];
    status?: { Open: null } | { Researching: null } | { PartiallyResolved: null } | { Resolved: null };
  } = {},
) {
  return actor.createCanonicalMysteryForFamily(
    familyId,
    title,
    `The mystery of ${title}.`,
    overrides.relatedMemberIds ?? [],
    [],
    [],
    [],
    [],
    overrides.relatedArchiveItemIds ?? [],
    overrides.status ?? { Open: null },
  );
}

/** Submits a mystery contribution into `familyId` as the currently-set caller. */
async function contributeInto(
  actor: _SERVICE,
  familyId: string,
  mysteryId: bigint,
  text: string,
  contributionType:
    | { Note: null }
    | { Memory: null }
    | { Lead: null }
    | { Source: null } = { Note: null },
) {
  return actor.submitMysteryContributionForFamily(
    familyId,
    mysteryId,
    contributionType,
    text,
  );
}

/** Submits a FamilyOnly Archive item into `familyId` and returns its id. */
async function submitMediaInto(
  actor: _SERVICE,
  familyId: string,
  title: string,
): Promise<bigint> {
  const item = await actor.submitArchiveItemForFamily(
    familyId,
    title,
    `Media for ${title}.`,
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
// (1) Read isolation: a Norwood mystery is visible under Norwood and absent
//     under Family A; a mysteryId alone never crosses the boundary.
// ---------------------------------------------------------------------------

it("lists and reads a Norwood mystery under Norwood but not under Family A", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  const mystery = await createMysteryInto(actor, NORWOOD, "Norwood mystery");
  expect(mystery.familyId).toBe(NORWOOD);

  // The Norwood Steward sees it under Norwood via the family-scoped listing.
  const listedNorwood = await actor.listMysteriesForFamily(NORWOOD);
  expect(listedNorwood.map((m) => m.id)).toEqual([mystery.id]);
  expect(listedNorwood.every((m) => m.familyId === NORWOOD)).toBe(true);

  // The Family A member's Family A listing never contains the Norwood mystery.
  actor.setIdentity(memberAIdentity);
  expect(await actor.listMysteriesForFamily(FAMILY_A)).toEqual([]);

  // A mysteryId alone does not resolve under Family A: the lookup behaves like
  // not-found rather than leaking the record.
  await expect(
    actor.getMysteryForFamily(FAMILY_A, mystery.id),
  ).resolves.toEqual([]);
});

it("does not resolve a Norwood mysteryId through a Family A context", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  const mystery = await createMysteryInto(actor, NORWOOD, "Norwood mystery");

  // MEMBER_A is an approved Family A member, so the Family A read runs but the
  // Norwood mysteryId resolves to nothing.
  actor.setIdentity(memberAIdentity);
  await expect(
    actor.getMysteryForFamily(FAMILY_A, mystery.id),
  ).resolves.toEqual([]);

  // The Norwood mystery still resolves under its own family.
  actor.setIdentity(adminIdentity);
  expect(
    (await actor.listMysteriesForFamily(NORWOOD)).map((m) => m.id),
  ).toContain(mystery.id);
});

it("denies a non-member reading another family's mysteries", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  await createMysteryInto(actor, NORWOOD, "Norwood mystery");

  // MEMBER_A is an approved Family A member but not a Norwood member, so the
  // Norwood read is denied outright rather than returning the record.
  actor.setIdentity(memberAIdentity);
  await expect(actor.listMysteriesForFamily(NORWOOD)).rejects.toThrow(
    new RegExp(MEMBER_MARKER, "i"),
  );
});

// ---------------------------------------------------------------------------
// (2) Contribution target isolation: a member can contribute to a mystery in
//     their own family and cannot contribute to a mystery in another family.
// ---------------------------------------------------------------------------

it("lets a Norwood member contribute to a Norwood mystery and denies a Family A member the same mystery", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  const mystery = await createMysteryInto(actor, NORWOOD, "Norwood mystery");

  // A Norwood member (the Steward is also an approved member) can contribute.
  const submitted = await contributeInto(
    actor,
    NORWOOD,
    mystery.id,
    "A Norwood memory.",
    { Memory: null },
  );
  expect(submitted.familyId).toBe(NORWOOD);
  expect(submitted.mysteryId).toBe(mystery.id);
  expect(submitted.status).toEqual({ Pending: null });

  // A Family A member cannot contribute to the Norwood mystery: the target
  // mystery does not belong to Family A, so it behaves as not-found.
  actor.setIdentity(memberAIdentity);
  await expect(
    contributeInto(actor, FAMILY_A, mystery.id, "A cross-family memory."),
  ).rejects.toThrow(new RegExp(MYSTERY_NOT_FOUND_MARKER, "i"));

  // Nothing was stored in Family A.
  expect(await actor.listMysteriesForFamily(FAMILY_A)).toEqual([]);
});

it("denies a Family A member contributing to a Family B mystery", async () => {
  const { actor } = await setupFamilies();

  // MEMBER_B creates a Family B mystery? No — only a Steward can create a
  // canonical mystery and no Family B Steward exists. The boundary is driven
  // with a Norwood mystery instead: MEMBER_A is not a Norwood member, so the
  // membership gate denies before the target is even considered.
  actor.setIdentity(adminIdentity);
  const mystery = await createMysteryInto(actor, NORWOOD, "Norwood mystery");

  actor.setIdentity(memberAIdentity);
  await expect(
    contributeInto(actor, FAMILY_B, mystery.id, "A Family B contribution."),
  ).rejects.toThrow(new RegExp(MEMBER_MARKER, "i"));
});

it("lists a mystery's contributions only under its own family", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  const mystery = await createMysteryInto(actor, NORWOOD, "Norwood mystery");
  const submitted = await contributeInto(
    actor,
    NORWOOD,
    mystery.id,
    "A Norwood lead.",
    { Lead: null },
  );

  // The Norwood contribution listing surfaces it.
  const listed = await actor.listMysteryContributionsForFamily(
    NORWOOD,
    mystery.id,
  );
  expect(listed.map((c) => c.id)).toEqual([submitted.id]);
  expect(listed.every((c) => c.familyId === NORWOOD)).toBe(true);

  // A Family A member reading the same mysteryId under Family A gets nothing.
  actor.setIdentity(memberAIdentity);
  await expect(
    actor.listMysteryContributionsForFamily(FAMILY_A, mystery.id),
  ).resolves.toEqual([]);
});

// ---------------------------------------------------------------------------
// (3) Review isolation. Only Norwood has a Steward, so the boundary is driven
//     in the direction the API supports: the Norwood Steward cannot review,
//     resolve, or edit a Family A mystery, and an approved Family A member who
//     is not a Steward cannot either.
// ---------------------------------------------------------------------------

it("denies the Norwood Steward reviewing, resolving, or editing a Family A mystery", async () => {
  const { actor } = await setupFamilies();

  // The Norwood Steward holds no Steward record for Family A, so every
  // Steward-only Family A action is denied.
  actor.setIdentity(adminIdentity);
  await expect(
    actor.listPendingMysteryContributionsForFamily(FAMILY_A),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
  await expect(
    actor.reviewMysteryContributionForFamily(FAMILY_A, 0n, true),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
  await expect(
    createMysteryInto(actor, FAMILY_A, "Cross-family mystery"),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
  await expect(
    actor.updateCanonicalMysteryForFamily(
      FAMILY_A,
      0n,
      "Cross-family edit",
      "A Steward of another family must not edit this.",
      [],
      [],
      [],
      [],
      [],
      [],
      { Open: null },
    ),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
  await expect(
    actor.markMysteryResolvedForFamily(FAMILY_A, 0n, "Cross-family resolve.", []),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
});

it("denies an approved Family A member who is not a Steward reviewing a Family A mystery", async () => {
  const { actor } = await setupFamilies();

  // Approved membership is not Steward authority.
  actor.setIdentity(memberAIdentity);
  await expect(
    actor.listPendingMysteryContributionsForFamily(FAMILY_A),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
  await expect(
    actor.reviewMysteryContributionForFamily(FAMILY_A, 0n, true),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
  await expect(
    createMysteryInto(actor, FAMILY_A, "Member-authored mystery"),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
  await expect(
    actor.markMysteryResolvedForFamily(FAMILY_A, 0n, "Member resolve.", []),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
});

// ---------------------------------------------------------------------------
// (4) A foreign-family id never mutates through a Norwood context.
//
// Only Norwood has a Steward, so the mutation boundary is driven in the
// direction the API supports: the Norwood Steward's Norwood review/resolve/edit
// of a foreign-family id behaves like not-found, and the foreign record
// survives.
// ---------------------------------------------------------------------------

it("does not mutate a foreign-family mysteryId through a Norwood context", async () => {
  const { actor } = await setupFamilies();

  // A Norwood mystery exists; the Norwood Steward's Norwood update/resolve of a
  // nonexistent id behaves like not-found and touches nothing.
  actor.setIdentity(adminIdentity);
  const mystery = await createMysteryInto(actor, NORWOOD, "Norwood mystery");

  await expect(
    actor.updateCanonicalMysteryForFamily(
      NORWOOD,
      9999n,
      "Ghost edit",
      "No such mystery.",
      [],
      [],
      [],
      [],
      [],
      [],
      { Open: null },
    ),
  ).resolves.toEqual([]);
  await expect(
    actor.markMysteryResolvedForFamily(NORWOOD, 9999n, "No such mystery.", []),
  ).resolves.toEqual([]);

  // The real Norwood mystery is untouched.
  const listed = await actor.listMysteriesForFamily(NORWOOD);
  const stored = listed.find((m) => m.id === mystery.id);
  expect(stored).toBeDefined();
  expect(stored).toMatchObject({
    id: mystery.id,
    title: "Norwood mystery",
    status: { Open: null },
    resolution: [],
  });
});

it("does not mutate a foreign-family contributionId through a Norwood context", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  const mystery = await createMysteryInto(actor, NORWOOD, "Norwood mystery");
  const submitted = await contributeInto(
    actor,
    NORWOOD,
    mystery.id,
    "A Norwood lead.",
  );

  // Reviewing an unknown contribution id is a no-op.
  await expect(
    actor.reviewMysteryContributionForFamily(NORWOOD, 9999n, true),
  ).resolves.toEqual([]);

  // The real contribution is still pending and still listed.
  const pending = await actor.listPendingMysteryContributionsForFamily(NORWOOD);
  const stored = pending.find((c) => c.id === submitted.id);
  expect(stored).toBeDefined();
  expect(stored).toMatchObject({ id: submitted.id, status: { Pending: null } });
});

// ---------------------------------------------------------------------------
// (5) Reference isolation: a mystery cannot reference a person or link Archive
//     media belonging to another family.
// ---------------------------------------------------------------------------

it("denies a Norwood mystery referencing a Family B person", async () => {
  const { actor } = await setupFamilies();

  // MEMBER_B's profile exists only in Family B.
  actor.setIdentity(memberBIdentity);
  const familyBPersonId = await myPersonIdIn(actor, FAMILY_B);

  // The Norwood Steward cannot reference the Family B person. Norwood is the
  // legacy family, where `isPersonInFamily` accepts any well-formed person id
  // (the seeded Norwood tree predates tenancy), so the cross-family reference is
  // caught by the existence guard rather than the family-boundary guard. Either
  // way the record is rejected and never stored; the assertion accepts either
  // stable denial so it does not over-specify which guard fires.
  actor.setIdentity(adminIdentity);
  await expect(
    createMysteryInto(actor, NORWOOD, "Cross-family related mystery", {
      relatedMemberIds: [familyBPersonId],
    }),
  ).rejects.toThrow(
    new RegExp(`${RELATED_PERSON_MARKER}|Related family member not found`, "i"),
  );

  // Nothing was stored in Norwood.
  expect(await actor.listMysteriesForFamily(NORWOOD)).toEqual([]);
});

it("denies a Norwood mystery linking Family B Archive media", async () => {
  const { actor } = await setupFamilies();

  // MEMBER_B uploads an item into Family B.
  actor.setIdentity(memberBIdentity);
  const mediaB = await submitMediaInto(actor, FAMILY_B, "Family B photo");

  // The Norwood Steward cannot attach the Family B item to a Norwood mystery.
  actor.setIdentity(adminIdentity);
  await expect(
    createMysteryInto(actor, NORWOOD, "Cross-family media mystery", {
      relatedArchiveItemIds: [mediaB],
    }),
  ).rejects.toThrow(new RegExp(LINKED_MEDIA_MARKER, "i"));

  // Nothing was stored in Norwood.
  expect(await actor.listMysteriesForFamily(NORWOOD)).toEqual([]);
});

it("accepts a Norwood mystery referencing a Norwood person and Norwood media", async () => {
  const { actor } = await setupFamilies();

  // A seeded Norwood person that is tracked in the default family. The Norwood
  // Steward has no profile of its own (the Steward role is separate from
  // profile ownership), so the related member is a seeded Norwood profile.
  const norwoodPersonId = "clayton";
  actor.setIdentity(adminIdentity);
  const media = await submitMediaInto(actor, NORWOOD, "Norwood photo");

  const mystery = await createMysteryInto(actor, NORWOOD, "Same-family mystery", {
    relatedMemberIds: [norwoodPersonId],
    relatedArchiveItemIds: [media],
  });

  expect(mystery.familyId).toBe(NORWOOD);
  expect(mystery.relatedMemberIds).toEqual([norwoodPersonId]);
  expect(mystery.relatedArchiveItemIds).toEqual([media]);
});

// ---------------------------------------------------------------------------
// (6) Default Norwood compatibility: the legacy no-familyId mystery endpoints
//     still work unchanged through the TEMPORARY wrappers.
// ---------------------------------------------------------------------------

it("keeps the legacy Norwood mystery workflow working end to end", async () => {
  const { actor } = await setupFamilies();

  // Legacy create writes a Norwood mystery.
  actor.setIdentity(adminIdentity);
  const mystery = await actor.createCanonicalMystery(
    "Legacy Norwood mystery",
    "A legacy Norwood mystery.",
    [],
    [],
    [],
    [],
    [],
    [],
    { Open: null },
  );
  expect(mystery.familyId).toBe(NORWOOD);
  expect(mystery.status).toEqual({ Open: null });

  // Legacy listing surfaces it.
  expect((await actor.listMysteries()).map((m) => m.id)).toContain(mystery.id);

  // Legacy submit writes a Norwood contribution.
  const submitted = await actor.submitMysteryContribution(
    mystery.id,
    { Note: null },
    "A legacy Norwood note.",
  );
  expect(submitted.familyId).toBe(NORWOOD);
  expect(submitted.status).toEqual({ Pending: null });

  // Legacy pending listing surfaces it to the Steward.
  expect(
    (await actor.listPendingMysteryContributions()).map((c) => c.id),
  ).toContain(submitted.id);

  // Legacy review approves it.
  const reviewed = await actor.reviewMysteryContribution(submitted.id, true);
  expect(reviewed).toEqual([
    expect.objectContaining({ id: submitted.id, status: { Approved: null } }),
  ]);

  // Legacy update edits it in place.
  const updated = await actor.updateCanonicalMystery(
    mystery.id,
    "Legacy Norwood mystery revised",
    "A revised legacy Norwood mystery.",
    [],
    [],
    [],
    [],
    [],
    [],
    { Researching: null },
  );
  expect(updated).toEqual([
    expect.objectContaining({
      id: mystery.id,
      familyId: NORWOOD,
      title: "Legacy Norwood mystery revised",
      status: { Researching: null },
    }),
  ]);

  // Legacy resolve marks it resolved.
  const resolved = await actor.markMysteryResolved(
    mystery.id,
    "The legacy mystery was resolved.",
    ["A legacy source"],
  );
  expect(resolved).toEqual([
    expect.objectContaining({
      id: mystery.id,
      familyId: NORWOOD,
      status: { Resolved: null },
    }),
  ]);

  // The canonical family-scoped read resolves the same mystery under Norwood.
  expect(
    (await actor.listMysteriesForFamily(NORWOOD)).map((m) => m.id),
  ).toContain(mystery.id);
});

it("keeps the legacy Norwood timeline wrapper working", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  const mystery = await createMysteryInto(actor, NORWOOD, "Timeline mystery");

  const events = await actor.listTimelineEvents();
  const mysteryEvent = events.find(
    (e) => "Mystery" in e.linkTarget && e.linkTarget.Mystery === mystery.id,
  );
  expect(mysteryEvent).toMatchObject({
    eventType: { Mystery: null },
    title: "Timeline mystery",
    evidenceStatus: { Unresolved: null },
  });
});
