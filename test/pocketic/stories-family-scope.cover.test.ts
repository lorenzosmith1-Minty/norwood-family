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
// Tenancy 1C-D3-A — family-scoped Family Stories endpoints (real-canister
// cover).
//
// The accepted behavior is that the canonical `*ForFamily` story endpoints
// enforce the family boundary: a story created in Family A is visible only
// under Family A and never under Family B; a `storyId` alone never crosses the
// boundary (a foreign-family id behaves exactly like not-found, never a
// distinguishable error that leaks family existence); a member of Family A can
// submit into Family A but not into Family B; a Family A story cannot reference
// a Family B person as a related member; a Family A story cannot link Archive
// media belonging to Family B; a Steward of one family cannot approve or reject
// another family's story; and the legacy no-familyId Norwood endpoints still
// work unchanged through the TEMPORARY wrappers.
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
// Family A can approve or reject a Family A story" cannot be exercised through
// the public API. The direction the API supports is covered here: the Norwood
// Steward cannot approve or reject a Family A story, and an approved Family A
// member who is not a Steward cannot approve or reject a Family A story either.
// The internal family-scoped predicate is covered by the sibling
// `family-scoped-authorization.behavior.test.ts`, which executes the real
// Motoko source.
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

/** Submits a story into `familyId` as the currently-set caller. */
async function submitInto(
  actor: _SERVICE,
  familyId: string,
  title: string,
  overrides: {
    relatedMemberIds?: string[];
    relatedArchiveItemIds?: bigint[];
  } = {},
) {
  return actor.submitStoryForFamily(
    familyId,
    title,
    `The story of ${title}.`,
    overrides.relatedMemberIds ?? [],
    ["early 1900s"],
    [1905n],
    ["Norwood, Mississippi"],
    { FamilyHistory: null },
    overrides.relatedArchiveItemIds ?? [],
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
// (1) Read isolation: a Family A story is visible under Family A and absent
//     under Family B; a storyId alone never crosses the boundary.
// ---------------------------------------------------------------------------

it("lists and reads a Family A story under Family A but not under Family B", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const story = await submitInto(actor, FAMILY_A, "Family A story");
  expect(story.familyId).toBe(FAMILY_A);

  // The Family A member sees it under Family A via the family-scoped listing.
  const listedA = await actor.listStoriesForFamily(FAMILY_A);
  expect(listedA.map((s) => s.id)).toEqual([story.id]);
  expect(listedA.every((s) => s.familyId === FAMILY_A)).toBe(true);

  // The Family B member's Family B listing never contains the Family A story.
  actor.setIdentity(memberBIdentity);
  const listedB = await actor.listStoriesForFamily(FAMILY_B);
  expect(listedB).toEqual([]);

  // A storyId alone does not resolve under Family B: the lookup behaves like
  // not-found rather than leaking the record.
  const fetchedB = await actor.getStoryForFamily(FAMILY_B, story.id);
  expect(fetchedB).toEqual([]);
});

it("does not resolve a Family B storyId through a Family A context", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberBIdentity);
  const storyB = await submitInto(actor, FAMILY_B, "Family B story");

  // MEMBER_A is an approved Family A member, so the Family A read runs but the
  // Family B storyId resolves to nothing.
  actor.setIdentity(memberAIdentity);
  await expect(
    actor.getStoryForFamily(FAMILY_A, storyB.id),
  ).resolves.toEqual([]);

  // The Family B story still resolves under its own family.
  actor.setIdentity(memberBIdentity);
  expect(
    (await actor.listStoriesForFamily(FAMILY_B)).map((s) => s.id),
  ).toContain(storyB.id);
});

it("lists only the family's own approved stories through listApprovedStoriesForFamily", async () => {
  const { actor } = await setupFamilies();

  // A Family A story is submitted and approved by the Norwood Steward? No —
  // only a Steward of the same family may approve, and no non-default Steward
  // exists. Instead, seed an approved story directly via the canonical
  // addCanonicalStoryForFamily path is Steward-only too. The observable
  // approved-listing boundary is therefore driven with the default family:
  // the Norwood Steward adds a canonical Norwood story, and a Family A member
  // never sees it in the Family A approved listing.
  actor.setIdentity(adminIdentity);
  const norwoodStory = await actor.addCanonicalStoryForFamily(
    NORWOOD,
    "Norwood canonical story",
    "A steward-authored Norwood story.",
    [],
    ["1890s"],
    [1893n],
    ["Norwood"],
    { Documented: null },
    [],
  );
  expect(norwoodStory.familyId).toBe(NORWOOD);

  // The Family A member's approved listing is empty: the Norwood story is not
  // in Family A.
  actor.setIdentity(memberAIdentity);
  expect(await actor.listApprovedStoriesForFamily(FAMILY_A)).toEqual([]);

  // The Norwood Steward's approved listing contains it.
  actor.setIdentity(adminIdentity);
  expect(
    (await actor.listApprovedStoriesForFamily(NORWOOD)).map((s) => s.id),
  ).toContain(norwoodStory.id);
});

// ---------------------------------------------------------------------------
// (2) Create isolation: a Family A member can submit into Family A and cannot
//     submit into Family B.
// ---------------------------------------------------------------------------

it("lets a Family A member submit into Family A and denies a submit into Family B", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const created = await submitInto(actor, FAMILY_A, "Allowed Family A story");
  expect(created.familyId).toBe(FAMILY_A);

  // The same caller is not an approved member of Family B, so the submit is
  // denied outright.
  await expect(
    submitInto(actor, FAMILY_B, "Denied Family B story"),
  ).rejects.toThrow(new RegExp(MEMBER_MARKER, "i"));

  // Nothing was stored in Family B.
  actor.setIdentity(memberBIdentity);
  expect(await actor.listStoriesForFamily(FAMILY_B)).toEqual([]);
});

// ---------------------------------------------------------------------------
// (3) Person-reference isolation: a Family A story cannot reference a Family B
//     person.
// ---------------------------------------------------------------------------

it("denies a Family A story referencing a Family B person", async () => {
  const { actor } = await setupFamilies();

  // MEMBER_B's profile exists only in Family B.
  actor.setIdentity(memberBIdentity);
  const familyBPersonId = await myPersonIdIn(actor, FAMILY_B);

  // As a related person: the family-boundary guard rejects the foreign person.
  actor.setIdentity(memberAIdentity);
  await expect(
    submitInto(actor, FAMILY_A, "Cross-family related story", {
      relatedMemberIds: [familyBPersonId],
    }),
  ).rejects.toThrow(new RegExp(RELATED_PERSON_MARKER, "i"));

  // Nothing was stored in Family A.
  expect(await actor.listStoriesForFamily(FAMILY_A)).toEqual([]);
});

it("accepts a Family A story referencing a Family A person", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const familyAPersonId = await myPersonIdIn(actor, FAMILY_A);
  const story = await submitInto(actor, FAMILY_A, "Same-family story", {
    relatedMemberIds: [familyAPersonId],
  });

  expect(story.familyId).toBe(FAMILY_A);
  expect(story.relatedMemberIds).toEqual([familyAPersonId]);
});

// ---------------------------------------------------------------------------
// (4) Media isolation: a Family A story cannot link Archive media belonging to
//     Family B.
// ---------------------------------------------------------------------------

it("denies a Family A story linking Family B Archive media", async () => {
  const { actor } = await setupFamilies();

  // MEMBER_B uploads an item into Family B.
  actor.setIdentity(memberBIdentity);
  const mediaB = await submitMediaInto(actor, FAMILY_B, "Family B photo");

  // MEMBER_A cannot attach the Family B item to a Family A story.
  actor.setIdentity(memberAIdentity);
  await expect(
    submitInto(actor, FAMILY_A, "Cross-family media story", {
      relatedArchiveItemIds: [mediaB],
    }),
  ).rejects.toThrow(new RegExp(LINKED_MEDIA_MARKER, "i"));

  // Nothing was stored in Family A.
  expect(await actor.listStoriesForFamily(FAMILY_A)).toEqual([]);
});

it("links a Family A story to Family A Archive media", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const mediaA = await submitMediaInto(actor, FAMILY_A, "Family A photo");
  const story = await submitInto(actor, FAMILY_A, "Family A media story", {
    relatedArchiveItemIds: [mediaA],
  });

  expect(story.familyId).toBe(FAMILY_A);
  expect(story.relatedArchiveItemIds).toEqual([mediaA]);
});

// ---------------------------------------------------------------------------
// (5) Review isolation. Only Norwood has a Steward, so the boundary is driven
//     in the direction the API supports: the Norwood Steward cannot approve or
//     reject a Family A story, and an approved Family A member who is not a
//     Steward cannot approve or reject a Family A story either.
// ---------------------------------------------------------------------------

it("denies the Norwood Steward approving or rejecting a Family A story", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const story = await submitInto(actor, FAMILY_A, "Family A pending story");

  // The Norwood Steward holds no Steward record for Family A, so both review
  // actions are denied and the story stays pending.
  actor.setIdentity(adminIdentity);
  await expect(
    actor.approveStoryForFamily(FAMILY_A, story.id),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
  await expect(
    actor.rejectStoryForFamily(FAMILY_A, story.id),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));

  // The story is untouched: still pending and still listed by its own member.
  actor.setIdentity(memberAIdentity);
  const listed = await actor.listStoriesForFamily(FAMILY_A);
  const stored = listed.find((s) => s.id === story.id);
  expect(stored).toBeDefined();
  expect(stored).toMatchObject({ id: story.id, status: { Pending: null } });
});

it("denies an approved Family A member who is not a Steward reviewing a Family A story", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const story = await submitInto(actor, FAMILY_A, "Family A member-reviewed story");

  // Approved membership is not Steward authority.
  await expect(
    actor.approveStoryForFamily(FAMILY_A, story.id),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
  await expect(
    actor.rejectStoryForFamily(FAMILY_A, story.id),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
});

// ---------------------------------------------------------------------------
// (6) A storyId from Family B never mutates through a Family A context.
//
// Only Norwood has a Steward, so the mutation boundary is driven in the
// direction the API supports: the Norwood Steward's Norwood approve/reject of a
// Family B storyId behaves like not-found, and the Family B story survives.
// ---------------------------------------------------------------------------

it("does not mutate a Family B storyId through a Norwood context", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberBIdentity);
  const storyB = await submitInto(actor, FAMILY_B, "Family B pending story");

  // The Norwood Steward's Norwood approve/reject of the Family B storyId
  // behaves like not-found: the story belongs to another family, so nothing is
  // touched.
  actor.setIdentity(adminIdentity);
  await expect(
    actor.approveStoryForFamily(NORWOOD, storyB.id),
  ).resolves.toEqual([]);
  await expect(
    actor.rejectStoryForFamily(NORWOOD, storyB.id),
  ).resolves.toEqual([]);

  // The Family B story is still pending and still listed by its own member.
  actor.setIdentity(memberBIdentity);
  const listed = await actor.listStoriesForFamily(FAMILY_B);
  const stored = listed.find((s) => s.id === storyB.id);
  expect(stored).toBeDefined();
  expect(stored).toMatchObject({ id: storyB.id, status: { Pending: null } });
});

it("does not resolve a Family B storyId through a Family A read", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberBIdentity);
  const storyB = await submitInto(actor, FAMILY_B, "Family B read-isolated story");

  // A Family A member reading the Family B storyId gets the same not-found
  // result as an unknown id — never a distinguishable error that would leak
  // whether the story exists in another family.
  actor.setIdentity(memberAIdentity);
  await expect(
    actor.getStoryForFamily(FAMILY_A, storyB.id),
  ).resolves.toEqual([]);
  await expect(
    actor.getStoryForFamily(FAMILY_A, 9999n),
  ).resolves.toEqual([]);
});

// ---------------------------------------------------------------------------
// (7) Default Norwood compatibility: the legacy no-familyId story endpoints
//     still work unchanged through the TEMPORARY wrappers.
// ---------------------------------------------------------------------------

it("keeps the legacy Norwood story workflow working end to end", async () => {
  const { actor } = await setupFamilies();

  // MEMBER_A claims the seeded living 'clayton' profile and the Steward approves
  // the claim, making them an approved Norwood member.
  actor.setIdentity(memberAIdentity);
  const claim = (await actor.requestProfileClaim("clayton")) as {
    ok: { id: bigint };
  };
  actor.setIdentity(adminIdentity);
  await actor.approveProfileClaim(claim.ok.id);

  // Legacy submit writes a Norwood story.
  actor.setIdentity(memberAIdentity);
  const story = await actor.submitStory(
    "Legacy Norwood story",
    "A legacy Norwood story.",
    ["clayton"],
    ["1940s"],
    [1942n],
    ["Norwood"],
    { FamilyHistory: null },
    [],
  );
  expect(story.familyId).toBe(NORWOOD);
  expect(story.status).toEqual({ Pending: null });

  // Legacy pending listing surfaces it to the Steward.
  actor.setIdentity(adminIdentity);
  const pending = await actor.listPendingStories();
  expect(pending.map((s) => s.id)).toContain(story.id);

  // Legacy approve moves it to approved and the legacy approved listing returns
  // it.
  const approved = await actor.approveStory(story.id);
  expect(approved).toEqual([
    expect.objectContaining({ id: story.id, status: { Approved: null } }),
  ]);
  expect((await actor.listApprovedStories()).map((s) => s.id)).toContain(
    story.id,
  );

  // The canonical family-scoped read resolves the same story under Norwood.
  expect(
    (await actor.listStoriesForFamily(NORWOOD)).map((s) => s.id),
  ).toContain(story.id);
});

it("keeps the legacy Norwood canonical add and update wrappers working", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  const added = await actor.addCanonicalStory(
    "Legacy canonical story",
    "A steward-authored legacy canonical story.",
    [],
    ["1890s"],
    [1893n],
    ["Norwood"],
    { Documented: null },
    [],
  );
  expect(added).toMatchObject({
    familyId: NORWOOD,
    status: { Approved: null },
  });

  const updated = await actor.updateCanonicalStory(
    added.id,
    "Legacy canonical story revised",
    "Revised legacy canonical story.",
    [],
    ["1900s"],
    [1901n],
    ["Clayton"],
    { FamilyHistory: null },
    [],
  );
  expect(updated).toEqual([
    expect.objectContaining({
      id: added.id,
      familyId: NORWOOD,
      title: "Legacy canonical story revised",
      status: { Approved: null },
    }),
  ]);
});
