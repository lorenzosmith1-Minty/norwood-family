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
// Tenancy 1C-D1 — family-scoped Family Recipes endpoints (real-canister cover).
//
// The accepted behavior is that the canonical `*ForFamily` recipe endpoints
// enforce the family boundary: a recipe created in Family A is visible only
// under Family A and never under Family B; a `recipeId` alone never crosses the
// boundary; a member of Family A can submit into Family A but not into Family B;
// a Family A recipe cannot reference a Family B person as its originating or
// related person; a Family A recipe cannot link Archive media belonging to
// Family B; a Steward of one family cannot approve or reject another family's
// recipe; and the legacy no-familyId Norwood endpoints still work unchanged
// through the TEMPORARY wrappers.
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
// Family A can approve or reject a Family A recipe" cannot be exercised through
// the public API. The direction the API supports is covered here: the Norwood
// Steward cannot approve or reject a Family A recipe, and an approved Family A
// member who is not a Steward cannot approve or reject a Family A recipe
// either. The internal family-scoped predicate is covered by the sibling
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
const ORIGINATING_PERSON_MARKER = "Originating family member not found";

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

/** Submits a FamilyOnly recipe into `familyId` as the currently-set caller. */
async function submitInto(
  actor: _SERVICE,
  familyId: string,
  title: string,
  overrides: {
    originatingPersonId?: string;
    relatedPersonIds?: string[];
    linkedMediaIds?: bigint[];
  } = {},
) {
  return actor.submitRecipeForFamily(
    familyId,
    title,
    `Short description for ${title}.`,
    overrides.originatingPersonId ?? (await myPersonIdIn(actor, familyId)),
    overrides.relatedPersonIds ?? [],
    ["1940s"],
    [1942n],
    ["Clayton, Mississippi"],
    ["the Clayton Norwood branch"],
    ["3 cups sweet potato", "1 tsp cinnamon"],
    `Instructions for ${title}.`,
    [`Family story for ${title}.`],
    [],
    { FamilyOnly: null },
    { FamilyHistory: null },
    overrides.linkedMediaIds ?? [],
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
// (1) Read isolation: a Family A recipe is visible under Family A and absent
//     under Family B; a recipeId alone never crosses the boundary.
// ---------------------------------------------------------------------------

it("lists and reads a Family A recipe under Family A but not under Family B", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const recipe = await submitInto(actor, FAMILY_A, "Family A pie");
  expect(recipe.familyId).toBe(FAMILY_A);

  // The Family A member sees it under Family A.
  const listedA = await actor.listRecipesForFamily(FAMILY_A);
  expect(listedA.map((r) => r.recipeId)).toEqual([recipe.recipeId]);
  expect(listedA.every((r) => r.familyId === FAMILY_A)).toBe(true);

  // The Family B member's Family B listing never contains the Family A recipe.
  actor.setIdentity(memberBIdentity);
  const listedB = await actor.listRecipesForFamily(FAMILY_B);
  expect(listedB).toEqual([]);

  // A recipeId alone does not resolve under Family B: the lookup behaves like
  // not-found rather than leaking the record.
  const fetchedB = await actor.getRecipeForFamily(FAMILY_B, recipe.recipeId);
  expect(fetchedB).toEqual([]);
});

it("does not resolve a Family B recipeId through a Family A context", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberBIdentity);
  const recipeB = await submitInto(actor, FAMILY_B, "Family B pie");

  // MEMBER_A is an approved Family A member, so the Family A read runs but the
  // Family B recipeId resolves to nothing.
  actor.setIdentity(memberAIdentity);
  await expect(
    actor.getRecipeForFamily(FAMILY_A, recipeB.recipeId),
  ).resolves.toEqual([]);

  // The Family B recipe still resolves under its own family. It is pending, so
  // the direct read is Steward-only and returns nothing; the family-scoped
  // listing is the observable proof it survived.
  actor.setIdentity(memberBIdentity);
  expect(
    (await actor.listRecipesForFamily(FAMILY_B)).map((r) => r.recipeId),
  ).toContain(recipeB.recipeId);
});

// ---------------------------------------------------------------------------
// (2) Create isolation: a Family A member can submit into Family A and cannot
//     submit into Family B.
// ---------------------------------------------------------------------------

it("lets a Family A member submit into Family A and denies a submit into Family B", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const created = await submitInto(actor, FAMILY_A, "Allowed Family A pie");
  expect(created.familyId).toBe(FAMILY_A);

  // The same caller is not an approved member of Family B, so the submit is
  // denied outright. The membership gate runs before the person check, so the
  // originating person is irrelevant here.
  await expect(
    submitInto(actor, FAMILY_B, "Denied Family B pie", {
      originatingPersonId: "clayton",
    }),
  ).rejects.toThrow(new RegExp(MEMBER_MARKER, "i"));

  // Nothing was stored in Family B.
  actor.setIdentity(memberBIdentity);
  expect(await actor.listRecipesForFamily(FAMILY_B)).toEqual([]);
});

// ---------------------------------------------------------------------------
// (3) Person-reference isolation: a Family A recipe cannot reference a Family B
//     person as its originating or related person.
// ---------------------------------------------------------------------------

it("denies a Family A recipe referencing a Family B person", async () => {
  const { actor } = await setupFamilies();

  // MEMBER_B's profile exists only in Family B.
  actor.setIdentity(memberBIdentity);
  const familyBPersonId = await myPersonIdIn(actor, FAMILY_B);

  // As the originating person: the existence guard rejects a person who is not
  // in the requested family.
  actor.setIdentity(memberAIdentity);
  await expect(
    submitInto(actor, FAMILY_A, "Cross-family originating pie", {
      originatingPersonId: familyBPersonId,
    }),
  ).rejects.toThrow(new RegExp(ORIGINATING_PERSON_MARKER, "i"));

  // As a related person: the family-boundary guard rejects the foreign person.
  await expect(
    submitInto(actor, FAMILY_A, "Cross-family related pie", {
      relatedPersonIds: [familyBPersonId],
    }),
  ).rejects.toThrow(new RegExp(RELATED_PERSON_MARKER, "i"));

  // Nothing was stored in Family A.
  expect(await actor.listRecipesForFamily(FAMILY_A)).toEqual([]);
});

// ---------------------------------------------------------------------------
// (4) Media isolation: a Family A recipe cannot link Archive media belonging to
//     Family B.
// ---------------------------------------------------------------------------

it("denies a Family A recipe linking Family B Archive media", async () => {
  const { actor } = await setupFamilies();

  // MEMBER_B uploads an item into Family B.
  actor.setIdentity(memberBIdentity);
  const mediaB = await submitMediaInto(actor, FAMILY_B, "Family B photo");

  // MEMBER_A cannot attach the Family B item to a Family A recipe.
  actor.setIdentity(memberAIdentity);
  await expect(
    submitInto(actor, FAMILY_A, "Cross-family media pie", {
      linkedMediaIds: [mediaB],
    }),
  ).rejects.toThrow(new RegExp(LINKED_MEDIA_MARKER, "i"));

  // Nothing was stored in Family A.
  expect(await actor.listRecipesForFamily(FAMILY_A)).toEqual([]);
});

it("links a Family A recipe to Family A Archive media", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const mediaA = await submitMediaInto(actor, FAMILY_A, "Family A photo");
  const recipe = await submitInto(actor, FAMILY_A, "Family A media pie", {
    linkedMediaIds: [mediaA],
  });

  expect(recipe.familyId).toBe(FAMILY_A);
  expect(recipe.linkedMediaIds).toEqual([mediaA]);
});

// ---------------------------------------------------------------------------
// (5) Review isolation. Only Norwood has a Steward, so the boundary is driven
//     in the direction the API supports: the Norwood Steward cannot approve or
//     reject a Family A recipe, and an approved Family A member who is not a
//     Steward cannot approve or reject a Family A recipe either.
// ---------------------------------------------------------------------------

it("denies the Norwood Steward approving or rejecting a Family A recipe", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const recipe = await submitInto(actor, FAMILY_A, "Family A pending pie");

  // The Norwood Steward holds no Steward record for Family A, so both review
  // actions are denied and the recipe stays pending.
  actor.setIdentity(adminIdentity);
  await expect(
    actor.approveRecipeForFamily(FAMILY_A, recipe.recipeId),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
  await expect(
    actor.rejectRecipeForFamily(FAMILY_A, recipe.recipeId),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));

  // The recipe is untouched: still pending and still listed by its own member.
  actor.setIdentity(memberAIdentity);
  const listed = await actor.listRecipesForFamily(FAMILY_A);
  const stored = listed.find((r) => r.recipeId === recipe.recipeId);
  expect(stored).toBeDefined();
  expect(stored).toMatchObject({ recipeId: recipe.recipeId, status: { Pending: null } });
});

it("denies an approved Family A member who is not a Steward reviewing a Family A recipe", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const recipe = await submitInto(actor, FAMILY_A, "Family A member-reviewed pie");

  // Approved membership is not Steward authority.
  await expect(
    actor.approveRecipeForFamily(FAMILY_A, recipe.recipeId),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
  await expect(
    actor.rejectRecipeForFamily(FAMILY_A, recipe.recipeId),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
});

// ---------------------------------------------------------------------------
// (6) A recipeId from Family B never mutates through a Family A context.
//
// Only Norwood has a Steward, so the mutation boundary is driven in the
// direction the API supports: the Norwood Steward's Norwood approve/reject of a
// Family B recipeId behaves like not-found, and the Family B recipe survives.
// ---------------------------------------------------------------------------

it("does not mutate a Family B recipeId through a Norwood context", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberBIdentity);
  const recipeB = await submitInto(actor, FAMILY_B, "Family B pending pie");

  // The Norwood Steward's Norwood approve/reject of the Family B recipeId
  // behaves like not-found: the recipe belongs to another family, so nothing is
  // touched.
  actor.setIdentity(adminIdentity);
  await expect(
    actor.approveRecipeForFamily(NORWOOD, recipeB.recipeId),
  ).resolves.toEqual([]);
  await expect(
    actor.rejectRecipeForFamily(NORWOOD, recipeB.recipeId),
  ).resolves.toEqual([]);

  // The Family B recipe is still pending and still listed by its own member.
  actor.setIdentity(memberBIdentity);
  const listed = await actor.listRecipesForFamily(FAMILY_B);
  const stored = listed.find((r) => r.recipeId === recipeB.recipeId);
  expect(stored).toBeDefined();
  expect(stored).toMatchObject({ recipeId: recipeB.recipeId, status: { Pending: null } });
});

// ---------------------------------------------------------------------------
// (7) Default Norwood compatibility: the legacy no-familyId recipe endpoints
//     still work unchanged through the TEMPORARY wrappers.
// ---------------------------------------------------------------------------

it("keeps the legacy Norwood recipe workflow working end to end", async () => {
  const { actor } = await setupFamilies();

  // MEMBER_A claims the seeded living 'clayton' profile and the Steward approves
  // the claim, making them an approved Norwood member.
  actor.setIdentity(memberAIdentity);
  const claim = (await actor.requestProfileClaim("clayton")) as {
    ok: { id: bigint };
  };
  actor.setIdentity(adminIdentity);
  await actor.approveProfileClaim(claim.ok.id);

  // Legacy submit writes a Norwood recipe.
  actor.setIdentity(memberAIdentity);
  const recipe = await actor.submitRecipe(
    "Legacy Norwood pie",
    "A legacy Norwood recipe.",
    "clayton",
    [],
    ["1940s"],
    [1942n],
    ["Norwood"],
    [],
    ["1 cup sugar"],
    "Bake until golden.",
    [],
    ["legacy"],
    { FamilyOnly: null },
    { FamilyHistory: null },
    [],
  );
  expect(recipe.familyId).toBe(NORWOOD);
  expect(recipe.status).toEqual({ Pending: null });

  // Legacy pending listing surfaces it to the Steward.
  actor.setIdentity(adminIdentity);
  const pending = await actor.listPendingRecipes();
  expect(pending.map((r) => r.recipeId)).toContain(recipe.recipeId);

  // Legacy approve moves it to approved and the legacy approved listing returns
  // it.
  const approved = await actor.approveRecipe(recipe.recipeId);
  expect(approved).toEqual([
    expect.objectContaining({ recipeId: recipe.recipeId, status: { Approved: null } }),
  ]);
  expect((await actor.listApprovedRecipes()).map((r) => r.recipeId)).toContain(
    recipe.recipeId,
  );

  // Legacy get and listRecipesForPerson resolve it.
  await expect(actor.getRecipe(recipe.recipeId)).resolves.toEqual([
    expect.objectContaining({ recipeId: recipe.recipeId, familyId: NORWOOD }),
  ]);
  expect(
    (await actor.listRecipesForPerson("clayton")).map((r) => r.recipeId),
  ).toContain(recipe.recipeId);
});

it("keeps the legacy Norwood publish wrapper working", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  const published = await actor.publishRecipe(
    "Legacy published pie",
    "A steward-published legacy recipe.",
    "clayton",
    [],
    ["1950s"],
    [1951n],
    ["Norwood"],
    [],
    ["1 cup sugar"],
    "Bake until golden.",
    [],
    ["published"],
    { Public: null },
    { Documented: null },
    [],
  );

  expect(published).toMatchObject({
    familyId: NORWOOD,
    status: { Approved: null },
  });
  expect((await actor.listApprovedRecipes()).map((r) => r.recipeId)).toContain(
    published.recipeId,
  );
});
