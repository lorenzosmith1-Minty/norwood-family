import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";
import {
  BACKEND_WASM,
  adminIdentity,
  memberAIdentity,
  memberBIdentity,
} from "./lane-helpers";

// ---------------------------------------------------------------------------
// Tenancy — Family Recipes default-family characterization.
//
// The requested change gives the Recipe record a `familyId` field, adds
// canonical family-scoped endpoints (a family-scoped submit, pending/approved
// listings, approve/reject, get, list-for-person, and publish), and keeps the
// existing no-familyId Recipe endpoints as thin TEMPORARY wrappers delegating
// to the canonical methods with DEFAULT_FAMILY_ID.
//
// This file freezes the OBSERVABLE default-family (Norwood) behavior of the
// legacy no-familyId Recipe endpoints, which the change must preserve through
// those wrappers. It deliberately does NOT freeze:
//
//   * the absence of a `familyId` field on Recipe — the change adds one, so
//     asserting its absence would freeze the very thing being changed;
//   * the legacy endpoints as the only implementation — the change makes them
//     thin wrappers over canonical family-scoped methods, and this file must
//     keep passing across that refactor;
//   * the exact denial wording of the legacy member gate — the change routes it
//     through the canonical family gate, so only the fact of denial is frozen.
//
// What it does freeze is the behavior a default-family user observes today and
// must keep observing:
//
//   1. submitRecipe persists the submitted fields with #Pending status and the
//      caller as contributor, and listPendingRecipes surfaces it to a Steward;
//   2. approveRecipe moves a pending recipe to #Approved and listApprovedRecipes
//      then returns it; rejectRecipe moves a pending recipe to #Rejected and it
//      is absent from the approved listing;
//   3. getRecipe returns an approved recipe by id and null for an unknown id;
//   4. listRecipesForPerson matches approved recipes by originating or related
//      person id;
//   5. publishRecipe stores an already-#Approved canonical recipe directly;
//   6. private recipes are visible only to their contributor or a Steward, and
//      non-approved recipes are visible only to a Steward;
//   7. the legacy authorization gates are unchanged: an anonymous caller and a
//      signed-in non-member are rejected, and the Steward-only endpoints reject
//      a non-Steward.
//
// The frontend suite mocks the actor, so none of this is visible there. This
// file installs the app's own compiled wasm and drives the real public API.
//
// Coverage limit this file cannot close: the family-boundary behavior of the
// canonical `*ForFamily` endpoints is not exercisable here because those
// endpoints do not exist yet; this file is the baseline the cover lane builds
// on. The `familyId` field the change adds to Recipe is likewise not asserted
// here.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

const SIGN_IN_MARKER = "Unauthorized: You must be signed in";
// The canonical family-membership gate's stable, non-technical message. The
// legacy no-familyId member gate now routes through this canonical helper, so
// the exact pre-tenancy wording is intentionally not frozen (see the header);
// the fact of denial and the canonical message are.
const MEMBER_MARKER =
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

interface Seeded {
  actor: _SERVICE;
  canisterId: ReturnType<typeof memberAIdentity.getPrincipal>;
}

/**
 * A fresh canister with ADMIN as the Family Steward and MEMBER_A / MEMBER_B as
 * approved members (each claimed a seeded living profile, approved by the
 * steward). Each test seeds its own canister so no test depends on the order
 * another ran in.
 */
async function setupRecipes(): Promise<Seeded> {
  const setup = await pic!.setupCanister<_SERVICE>({
    idlFactory,
    wasm: BACKEND_WASM,
  });
  const actor = setup.actor;

  // ADMIN becomes the Family Steward. Steward authority is the canonical
  // active-Steward record, not the platform admin role: the first caller to
  // _initialize_access_control is #admin but must still claim the Steward role
  // explicitly before the approvals below are authorized.
  actor.setIdentity(adminIdentity);
  await actor._initialize_access_control();
  await actor.claimSteward();

  // MEMBER_A and MEMBER_B register as approved #user members and bind an auth
  // method so their accounts are active.
  actor.setIdentity(memberAIdentity);
  await actor._initialize_access_control();
  await actor.bindAuthMethod({ Google: null });
  actor.setIdentity(memberBIdentity);
  await actor._initialize_access_control();
  await actor.bindAuthMethod({ Google: null });

  // MEMBER_A claims the living 'clayton' profile and MEMBER_B claims 'hudson';
  // the steward approves both, making them approved family members.
  actor.setIdentity(memberAIdentity);
  const claimA = (await actor.requestProfileClaim("clayton")) as {
    ok: { id: bigint };
  };
  actor.setIdentity(memberBIdentity);
  const claimB = (await actor.requestProfileClaim("hudson")) as {
    ok: { id: bigint };
  };
  actor.setIdentity(adminIdentity);
  await actor.approveProfileClaim(claimA.ok.id);
  await actor.approveProfileClaim(claimB.ok.id);

  return { actor, canisterId: setup.canisterId };
}

/**
 * Submits a Norwood Archive item as the Steward and returns its id, so a recipe
 * can link media that genuinely belongs to the default family. The accepted
 * change requires every linked media id to resolve to an Archive item in the
 * same family, so a recipe can no longer link an arbitrary id.
 */
async function submitNorwoodMedia(actor: _SERVICE, title: string): Promise<bigint> {
  actor.setIdentity(adminIdentity);
  const item = await actor.submitArchiveItem(
    title,
    `Media for ${title}.`,
    { Document: null },
    "application/pdf",
    new Uint8Array([1, 2, 3]),
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

/**
 * Submits a recipe as MEMBER_A with the given title and overrides. The
 * originating person defaults to MEMBER_A's own claimed profile ('clayton'),
 * which is a seeded living profile.
 */
async function submitAsA(
  actor: _SERVICE,
  title: string,
  overrides: {
    originatingPersonId?: string;
    relatedPersonIds?: string[];
    privacyLevel?: { Public: null } | { FamilyOnly: null } | { Private: null };
    tags?: string[];
    linkedMediaIds?: bigint[];
  } = {},
) {
  actor.setIdentity(memberAIdentity);
  return actor.submitRecipe(
    title,
    `Short description for ${title}.`,
    overrides.originatingPersonId ?? "clayton",
    overrides.relatedPersonIds ?? [],
    ["1940s"],
    [1942n],
    ["Clayton, Mississippi"],
    ["the Clayton Norwood branch"],
    ["3 cups sweet potato", "1 tsp cinnamon"],
    `Instructions for ${title}.`,
    [`Family story for ${title}.`],
    overrides.tags ?? [],
    overrides.privacyLevel ?? { FamilyOnly: null },
    { FamilyHistory: null },
    overrides.linkedMediaIds ?? [],
  );
}

// ---------------------------------------------------------------------------
// (1) Legacy submit persists the submitted fields with #Pending, and the
//     Steward-only pending listing surfaces it.
// ---------------------------------------------------------------------------

it("persists a legacy Norwood recipe with the submitted fields and lists it pending", async () => {
  const { actor } = await setupRecipes();

  // The accepted change requires linked media to belong to the same family, so
  // the recipe links two real Norwood Archive items rather than arbitrary ids.
  const mediaA = await submitNorwoodMedia(actor, "Sweet Potato Pie photo");
  const mediaB = await submitNorwoodMedia(actor, "Sweet Potato Pie letter");

  const submitted = await submitAsA(actor, "Sweet Potato Pie", {
    relatedPersonIds: ["hudson"],
    tags: ["dessert", "holiday"],
    linkedMediaIds: [mediaA, mediaB],
  });

  expect(submitted).toMatchObject({
    title: "Sweet Potato Pie",
    shortDescription: "Short description for Sweet Potato Pie.",
    originatingPersonId: "clayton",
    relatedPersonIds: ["hudson"],
    era: ["1940s"],
    year: [1942n],
    location: ["Clayton, Mississippi"],
    familyBranch: ["the Clayton Norwood branch"],
    ingredients: ["3 cups sweet potato", "1 tsp cinnamon"],
    instructions: "Instructions for Sweet Potato Pie.",
    familyStory: ["Family story for Sweet Potato Pie."],
    tags: ["dessert", "holiday"],
    privacyLevel: { FamilyOnly: null },
    evidenceStatus: { FamilyHistory: null },
    linkedMediaIds: [mediaA, mediaB],
    status: { Pending: null },
  });
  // The caller is recorded as the contributor.
  expect(submitted.contributorAccountId).toEqual(memberAIdentity.getPrincipal());

  // The Steward sees it in the pending review listing.
  actor.setIdentity(adminIdentity);
  const pending = await actor.listPendingRecipes();
  expect(pending.map((r) => r.recipeId)).toContain(submitted.recipeId);
});

// ---------------------------------------------------------------------------
// (2) Legacy approve / reject move a pending recipe and update the listings.
// ---------------------------------------------------------------------------

it("approves a pending recipe and lists it approved", async () => {
  const { actor } = await setupRecipes();

  const submitted = await submitAsA(actor, "Approved Pie");

  // Before approval it is not in the approved listing.
  expect(await actor.listApprovedRecipes()).toEqual([]);

  actor.setIdentity(adminIdentity);
  const approved = await actor.approveRecipe(submitted.recipeId);
  expect(approved).toEqual([
    expect.objectContaining({
      recipeId: submitted.recipeId,
      status: { Approved: null },
    }),
  ]);

  // It is gone from pending and present in the approved listing.
  expect((await actor.listPendingRecipes()).map((r) => r.recipeId)).not.toContain(
    submitted.recipeId,
  );
  const listed = await actor.listApprovedRecipes();
  expect(listed.map((r) => r.recipeId)).toContain(submitted.recipeId);
});

it("rejects a pending recipe and keeps it out of the approved listing", async () => {
  const { actor } = await setupRecipes();

  const submitted = await submitAsA(actor, "Rejected Pie");

  actor.setIdentity(adminIdentity);
  const rejected = await actor.rejectRecipe(submitted.recipeId);
  expect(rejected).toEqual([
    expect.objectContaining({
      recipeId: submitted.recipeId,
      status: { Rejected: null },
    }),
  ]);

  expect((await actor.listPendingRecipes()).map((r) => r.recipeId)).not.toContain(
    submitted.recipeId,
  );
  expect((await actor.listApprovedRecipes()).map((r) => r.recipeId)).not.toContain(
    submitted.recipeId,
  );
});

it("returns null when approving or rejecting an unknown recipe id", async () => {
  const { actor } = await setupRecipes();

  actor.setIdentity(adminIdentity);
  await expect(actor.approveRecipe(9999n)).resolves.toEqual([]);
  await expect(actor.rejectRecipe(9999n)).resolves.toEqual([]);
});

// ---------------------------------------------------------------------------
// (3) Legacy get returns an approved recipe by id and null for an unknown id.
// ---------------------------------------------------------------------------

it("returns an approved recipe by id and null for an unknown id", async () => {
  const { actor } = await setupRecipes();

  const submitted = await submitAsA(actor, "Lookup Pie");
  actor.setIdentity(adminIdentity);
  await actor.approveRecipe(submitted.recipeId);

  const found = await actor.getRecipe(submitted.recipeId);
  expect(found).toEqual([
    expect.objectContaining({ recipeId: submitted.recipeId, title: "Lookup Pie" }),
  ]);

  const missing = await actor.getRecipe(9999n);
  expect(missing).toEqual([]);
});

// ---------------------------------------------------------------------------
// (4) Legacy listRecipesForPerson matches originating and related person ids.
// ---------------------------------------------------------------------------

it("lists approved recipes by originating and related person", async () => {
  const { actor } = await setupRecipes();

  const originating = await submitAsA(actor, "Originating Pie", {
    originatingPersonId: "clayton",
  });
  const related = await submitAsA(actor, "Related Pie", {
    originatingPersonId: "clayton",
    relatedPersonIds: ["hudson"],
  });

  actor.setIdentity(adminIdentity);
  await actor.approveRecipe(originating.recipeId);
  await actor.approveRecipe(related.recipeId);

  // 'clayton' is the originating person of both.
  const forClayton = await actor.listRecipesForPerson("clayton");
  expect(forClayton.map((r) => r.recipeId).sort()).toEqual(
    [originating.recipeId, related.recipeId].sort(),
  );

  // 'hudson' is only a related person of the second.
  const forHudson = await actor.listRecipesForPerson("hudson");
  expect(forHudson.map((r) => r.recipeId)).toEqual([related.recipeId]);

  // An unrelated person matches nothing.
  expect(await actor.listRecipesForPerson("no-such-person")).toEqual([]);
});

// ---------------------------------------------------------------------------
// (5) Legacy publishRecipe stores an already-approved canonical recipe.
// ---------------------------------------------------------------------------

it("publishes a canonical recipe directly as approved", async () => {
  const { actor } = await setupRecipes();

  // The accepted change requires linked media to belong to the same family, so
  // the published recipe links a real Norwood Archive item.
  const media = await submitNorwoodMedia(actor, "Published Pie photo");

  actor.setIdentity(adminIdentity);
  const published = await actor.publishRecipe(
    "Published Pie",
    "A steward-published recipe.",
    "clayton",
    ["hudson"],
    ["1950s"],
    [1951n],
    ["Norwood"],
    ["the Clayton Norwood branch"],
    ["1 cup sugar"],
    "Bake until golden.",
    ["A published family story."],
    ["published"],
    { Public: null },
    { Documented: null },
    [media],
  );

  expect(published).toMatchObject({
    title: "Published Pie",
    status: { Approved: null },
    privacyLevel: { Public: null },
    linkedMediaIds: [media],
  });

  // It is immediately visible in the approved listing and by id.
  const listed = await actor.listApprovedRecipes();
  expect(listed.map((r) => r.recipeId)).toContain(published.recipeId);
  const found = await actor.getRecipe(published.recipeId);
  expect(found).toEqual([
    expect.objectContaining({ recipeId: published.recipeId, title: "Published Pie" }),
  ]);
});

// ---------------------------------------------------------------------------
// (6) Legacy visibility rules: private recipes are contributor/Steward-only,
//     and non-approved recipes are Steward-only.
// ---------------------------------------------------------------------------

it("hides a private recipe from other members and shows it to its contributor and a Steward", async () => {
  const { actor } = await setupRecipes();

  const submitted = await submitAsA(actor, "Private Pie", {
    privacyLevel: { Private: null },
  });

  actor.setIdentity(adminIdentity);
  await actor.approveRecipe(submitted.recipeId);

  // MEMBER_B is an approved member but not the contributor: the private recipe
  // is hidden from both the listing and the direct read.
  actor.setIdentity(memberBIdentity);
  expect((await actor.listApprovedRecipes()).map((r) => r.recipeId)).not.toContain(
    submitted.recipeId,
  );
  await expect(actor.getRecipe(submitted.recipeId)).resolves.toEqual([]);

  // The contributor sees it.
  actor.setIdentity(memberAIdentity);
  expect((await actor.listApprovedRecipes()).map((r) => r.recipeId)).toContain(
    submitted.recipeId,
  );
  await expect(actor.getRecipe(submitted.recipeId)).resolves.toEqual([
    expect.objectContaining({ recipeId: submitted.recipeId }),
  ]);

  // A Steward sees it too.
  actor.setIdentity(adminIdentity);
  expect((await actor.listApprovedRecipes()).map((r) => r.recipeId)).toContain(
    submitted.recipeId,
  );
});

it("hides a non-approved recipe from a member and shows it to a Steward", async () => {
  const { actor } = await setupRecipes();

  const submitted = await submitAsA(actor, "Still Pending Pie");

  // A non-Steward member cannot read a pending recipe by id.
  actor.setIdentity(memberAIdentity);
  await expect(actor.getRecipe(submitted.recipeId)).resolves.toEqual([]);

  // A Steward can.
  actor.setIdentity(adminIdentity);
  await expect(actor.getRecipe(submitted.recipeId)).resolves.toEqual([
    expect.objectContaining({ recipeId: submitted.recipeId, status: { Pending: null } }),
  ]);
});

// ---------------------------------------------------------------------------
// (7) Legacy authorization gates are unchanged.
// ---------------------------------------------------------------------------

it("rejects a legacy Norwood recipe whose originating person does not exist", async () => {
  const { actor } = await setupRecipes();

  // The pre-tenancy endpoint trapped when the originating person did not exist.
  // The family-scoped implementation restores that guard explicitly, because
  // `isPersonInFamily` accepts any well-formed person id for the default
  // Norwood family. This negative case is what catches the guard's loss.
  await expect(
    submitAsA(actor, "Ghost Pie", { originatingPersonId: "no-such-person" }),
  ).rejects.toThrow(/Originating family member not found/i);

  // Nothing was stored.
  actor.setIdentity(adminIdentity);
  expect(await actor.listPendingRecipes()).toEqual([]);
});

it("rejects an anonymous caller and a signed-in non-member", async () => {
  const { canisterId } = await setupRecipes();

  // A freshly created actor calls as the anonymous principal until an identity
  // is set.
  const guest = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  await expect(
    guest.submitRecipe(
      "Anonymous recipe",
      "Anonymous must not contribute.",
      "clayton",
      [],
      [],
      [],
      [],
      [],
      [],
      "Mix everything.",
      [],
      [],
      { FamilyOnly: null },
      { FamilyHistory: null },
      [],
    ),
  ).rejects.toThrow(new RegExp(SIGN_IN_MARKER, "i"));

  // A signed-in caller that never claimed a profile is not an approved member.
  const strangerIdentity = createIdentity("recipes-stranger-seed");
  const strangerActor = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  strangerActor.setIdentity(strangerIdentity);
  await strangerActor._initialize_access_control();
  await expect(
    strangerActor.submitRecipe(
      "Stranger recipe",
      "A signed-in non-member must not contribute.",
      "clayton",
      [],
      [],
      [],
      [],
      [],
      [],
      "Mix everything.",
      [],
      [],
      { FamilyOnly: null },
      { FamilyHistory: null },
      [],
    ),
  ).rejects.toThrow(new RegExp(MEMBER_MARKER, "i"));
});

it("denies a non-Steward the Steward-only endpoints", async () => {
  const { actor } = await setupRecipes();

  // A signed-in approved member is not a Steward.
  actor.setIdentity(memberAIdentity);
  await expect(actor.listPendingRecipes()).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
  await expect(actor.approveRecipe(0n)).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
  await expect(actor.rejectRecipe(0n)).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
  await expect(
    actor.publishRecipe(
      "Non-steward recipe",
      "A non-steward must not publish.",
      "clayton",
      [],
      [],
      [],
      [],
      [],
      [],
      "Mix everything.",
      [],
      [],
      { FamilyOnly: null },
      { FamilyHistory: null },
      [],
    ),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
});
