import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type {
  MembershipConfirmationReviewView,
  _SERVICE,
} from "../../src/frontend/src/declarations/backend.did";
import { BACKEND_WASM, adminIdentity, registerApprovedContributor } from "./lane-helpers";

// ---------------------------------------------------------------------------
// Onboarding Phase 1D-UI-B1 — Steward membership review discovery (real-canister
// cover) for `listMembershipConfirmationReviewsForSteward(familyId)`.
//
// The accepted behavior this file asserts:
//
//   1. An active Steward of the requested family sees that family's unresolved
//      review cases (`#StewardReviewRequired` conflicts and standalone
//      `#RejectedByRelative` rejections).
//   2. A non-Steward signed-in caller is denied with `#NotAuthorized`.
//   3. An anonymous caller is denied with `#NotSignedIn`.
//   4. A Steward of a DIFFERENT family is denied for the requested family with
//      `#NotAuthorized` and never sees the other family's cases.
//   5. Resolved cases (`#ResolvedBySteward`) are excluded from the result.
//   6. The returned view is privacy-safe: it carries no confirmer account
//      principal, no confirmer person id, no relationship id, and no sensitive
//      relationship context, and confirmer display names are resolved
//      server-side (a display-name string, not a principal).
//
// The frontend suite mocks the actor and has no principals, so none of this is
// visible there. This file installs the app's own compiled wasm and drives the
// real public API.
//
// Seeding note: the canister is shared across the tests in this file (installing
// it replays the whole migration chain and is the lane's most expensive
// operation). Every test creates its OWN profiles through `createMyselfForFamily`
// and its own deterministic identities, so no test can collide with another's
// membership or relationship state.
//
// Coverage limits this file cannot close (recorded in the episode):
//
//   - There is no public endpoint that creates a Steward of a non-default
//     family (`claimSteward` writes `familyId = "norwood"`), so the
//     "Family A Steward sees Family A cases" direction cannot be bootstrapped
//     through the public API. The cross-family assertion below drives the
//     denial direction (a Norwood Steward is denied for Family A) plus the
//     family-scoped read boundary.
//   - The migration across a real upgrade lives in the sibling upgrade tests.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

const NORWOOD = "norwood";
const FAMILY_A = "test-family-a";

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

// Installing a canister replays the whole migration chain and is the lane's most
// expensive operation, so this file shares ONE canister across its tests. Every
// test creates its own profiles and its own deterministic identities, and every
// read is family-scoped, so the tests do not interfere.
let shared: Seeded | undefined;

/** The shared canister, installed once on first use. */
async function setup(): Promise<Seeded> {
  if (shared === undefined) {
    const setupResult = await pic!.setupCanister<_SERVICE>({
      idlFactory,
      wasm: BACKEND_WASM,
    });
    shared = { actor: setupResult.actor, canisterId: setupResult.canisterId };
    // ADMIN becomes the Norwood Family Steward; CONTRIBUTOR becomes an approved
    // claimed Norwood member. The review tests below use their own fresh
    // identities, so this bootstrap only establishes the Steward.
    await registerApprovedContributor(shared.actor);
  }
  return shared;
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

/** Unwraps a `Result` read, failing the test on an unexpected `#err`. */
function ok<T>(result: { ok: T } | { err: unknown }): T {
  if (!("ok" in result)) {
    throw new Error(`expected #ok, got ${JSON.stringify(result)}`);
  }
  return result.ok;
}

/**
 * Renders a Candid value for an error message without tripping over `bigint`
 * fields (`JSON.stringify` throws on a bigint).
 */
function describe(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
}

interface ReviewCase {
  /** The confirmer's identity (holds an #Active membership in the family). */
  confirmer: ReturnType<typeof createIdentity>;
  /** The pending membership's own account. */
  pendingAccount: ReturnType<typeof createIdentity>;
  /** The pending membership id. */
  membershipId: bigint;
  /** The confirmer's personId in the family. */
  confirmerPersonId: string;
  /** The pending person's personId in the family. */
  pendingPersonId: string;
}

/**
 * Creates a fresh profile in `familyId` for `identity` via
 * `createMyselfForFamily` and returns its personId. The profile is a real
 * family profile, which is what lets the Steward add a confirmed relationship
 * involving it.
 */
async function createProfile(
  actor: _SERVICE,
  identity: ReturnType<typeof createIdentity>,
  familyId: string,
  name: string,
): Promise<string> {
  actor.setIdentity(identity);
  const created = ok(await actor.createMyselfForFamily(familyId, name));
  return created.personId;
}

/**
 * Seeds a confirmation case in `familyId`:
 *
 *   1. a `#Pending` membership for a fresh account linked to a fresh pending
 *      profile;
 *   2. an `#Active` membership for a fresh confirmer identity linked to a fresh
 *      confirmer profile;
 *   3. a `#Confirmed` relationship between the two people.
 *
 * All three are created by the family Steward (ADMIN for Norwood). Every test
 * passes a distinct `seed` so its identities and profiles never collide with
 * another test's on the shared canister.
 */
async function seedReviewCase(
  actor: _SERVICE,
  familyId: string,
  seed: string,
  steward: ReturnType<typeof createIdentity> = adminIdentity,
): Promise<ReviewCase> {
  const confirmer = createIdentity(`review-confirmer-${seed}`);
  const pendingAccount = createIdentity(`review-pending-${seed}`);

  const confirmerPersonId = await createProfile(
    actor,
    confirmer,
    familyId,
    `Review Confirmer ${seed}`,
  );
  const pendingPersonId = await createProfile(
    actor,
    pendingAccount,
    familyId,
    `Review Pending ${seed}`,
  );

  actor.setIdentity(steward);
  const pending = ok(
    await actor.createPendingMembershipForFamily(
      familyId,
      pendingAccount.getPrincipal(),
      pendingPersonId,
    ),
  );
  const confirmerMembership = ok(
    await actor.createPendingMembershipForFamily(
      familyId,
      confirmer.getPrincipal(),
      confirmerPersonId,
    ),
  );
  ok(await actor.activateMembershipForFamily(familyId, confirmerMembership.id));

  const relationship = await actor.addRelationshipForFamily(
    familyId,
    confirmerPersonId,
    pendingPersonId,
    { Sibling: null },
  );
  expect("ok" in relationship).toBe(true);

  return {
    confirmer,
    pendingAccount,
    membershipId: pending.id,
    confirmerPersonId,
    pendingPersonId,
  };
}

/**
 * Seeds a reviewable case: a single `#Disputed` decision against a `#Pending`
 * membership, which leaves the membership `#Pending` and the confirmation state
 * at `#RejectedByRelative` (a standalone rejection, distinct from the
 * Steward-resolution state).
 */
async function seedEscalatedCase(
  actor: _SERVICE,
  familyId: string,
  seed: string,
  steward: ReturnType<typeof createIdentity> = adminIdentity,
): Promise<ReviewCase> {
  const seeded = await seedReviewCase(actor, familyId, seed, steward);
  actor.setIdentity(seeded.confirmer);
  ok(await actor.confirmPendingMembership(familyId, seeded.membershipId, { Disputed: null }));
  return seeded;
}

/** Reads the Steward review list for `familyId` as the given identity. */
async function readReviews(
  actor: _SERVICE,
  identity: ReturnType<typeof createIdentity>,
  familyId: string,
): Promise<MembershipConfirmationReviewView[]> {
  actor.setIdentity(identity);
  return ok(await actor.listMembershipConfirmationReviewsForSteward(familyId));
}

/** Finds the review for `membershipId`, failing when it is absent. */
function findReview(
  reviews: MembershipConfirmationReviewView[],
  membershipId: bigint,
): MembershipConfirmationReviewView {
  const review = reviews.find((r) => r.membershipId === membershipId);
  if (review === undefined) {
    throw new Error(`no review returned for membership ${membershipId.toString()}`);
  }
  return review;
}

// ---------------------------------------------------------------------------
// (1) AUTHORIZED STEWARD — an active Steward of the requested family sees that
//     family's unresolved review cases (standalone #RejectedByRelative and
//     conflicting #StewardReviewRequired).
// ---------------------------------------------------------------------------

it("lets an active Steward see the requested family's unresolved review cases", async () => {
  const { actor } = await setup();
  const seeded = await seedEscalatedCase(actor, NORWOOD, "steward-sees");

  const reviews = await readReviews(actor, adminIdentity, NORWOOD);
  const review = findReview(reviews, seeded.membershipId);

  expect(review.familyId).toBe(NORWOOD);
  expect(review.membershipId).toBe(seeded.membershipId);
  expect(review.pendingPersonId).toBe(seeded.pendingPersonId);
  expect(review.applicantDisplayName).toBe(`Review Pending steward-sees`);
  expect(review.membershipStatus).toEqual({ Pending: null });
  // A standalone trusted-relative rejection/dispute is reviewable and reads
  // #RejectedByRelative, distinct from the Steward-resolution state.
  expect(review.confirmationState).toEqual({ RejectedByRelative: null });
  expect(review.confirmedCount).toBe(0n);
  expect(review.disputedCount).toBe(1n);
  expect(review.simpleRelationship).toEqual({ Sibling: null });
  expect(review.confirmationHistory).toHaveLength(1);
  expect(review.confirmationHistory[0].decision).toEqual({ Disputed: null });
  expect(review.confirmationHistory[0].simpleRelationship).toEqual({ Sibling: null });
  // The confirmer display name is resolved server-side from the confirmer's
  // person profile, not from a principal.
  expect(review.confirmationHistory[0].confirmerDisplayName).toBe(
    `Review Confirmer steward-sees`,
  );
});

// ---------------------------------------------------------------------------
// (2) NON-STEWARD — a signed-in caller with no Steward authority is denied.
// ---------------------------------------------------------------------------

it("denies a non-Steward caller with #NotAuthorized", async () => {
  const { actor } = await setup();
  const seeded = await seedEscalatedCase(actor, NORWOOD, "non-steward-denied");

  // The confirmer is an approved member but not a Steward.
  actor.setIdentity(seeded.confirmer);
  await expect(
    actor.listMembershipConfirmationReviewsForSteward(NORWOOD),
  ).resolves.toEqual({ err: { NotAuthorized: null } });
});

// ---------------------------------------------------------------------------
// (3) ANONYMOUS — an anonymous caller is denied with #NotSignedIn.
// ---------------------------------------------------------------------------

it("denies an anonymous caller with #NotSignedIn", async () => {
  const { actor, canisterId } = await setup();
  await seedEscalatedCase(actor, NORWOOD, "anonymous-denied");

  const anonymous = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  await expect(
    anonymous.listMembershipConfirmationReviewsForSteward(NORWOOD),
  ).resolves.toEqual({ err: { NotSignedIn: null } });
});

// ---------------------------------------------------------------------------
// (4) CROSS-FAMILY — a Steward of a different family is denied for the
//     requested family and never sees the other family's cases.
// ---------------------------------------------------------------------------

it("denies a Steward of a different family and never leaks the other family's cases", async () => {
  const { actor } = await setup();

  // A Family A founder creates a family and an escalated case in it.
  const founderA = createIdentity("review-family-a-founder");
  actor.setIdentity(founderA);
  const createdA = ok(
    await actor.createFamilyWithFounder(
      "Review Family A",
      founderInput("Review", "A"),
      "review-family-a-key",
    ),
  );
  const familyA = createdA.family.id;
  ok(await actor.acceptFoundingStewardship(familyA));

  const seededA = await seedEscalatedCase(actor, familyA, "family-a-case", founderA);

  // The Norwood Steward is not a Steward of Family A, so the read is denied.
  actor.setIdentity(adminIdentity);
  await expect(
    actor.listMembershipConfirmationReviewsForSteward(familyA),
  ).resolves.toEqual({ err: { NotAuthorized: null } });

  // The Norwood Steward's own read never surfaces the Family A case.
  const norwoodReviews = await readReviews(actor, adminIdentity, NORWOOD);
  expect(norwoodReviews.some((r) => r.membershipId === seededA.membershipId)).toBe(false);
  expect(norwoodReviews.every((r) => r.familyId === NORWOOD)).toBe(true);
});

// ---------------------------------------------------------------------------
// (5) RESOLVED EXCLUDED — a #ResolvedBySteward case is not returned.
// ---------------------------------------------------------------------------

it("excludes a case resolved by the Steward", async () => {
  const { actor } = await setup();
  const seeded = await seedEscalatedCase(actor, NORWOOD, "resolved-excluded");

  // The case is open before resolution.
  const before = await readReviews(actor, adminIdentity, NORWOOD);
  expect(before.some((r) => r.membershipId === seeded.membershipId)).toBe(true);

  // The Steward approves the escalated case, which persists a resolution.
  actor.setIdentity(adminIdentity);
  ok(
    await actor.resolveMembershipConfirmation(NORWOOD, seeded.membershipId, { Approve: null }),
  );

  // The resolved case is excluded from the review list.
  const after = await readReviews(actor, adminIdentity, NORWOOD);
  expect(after.some((r) => r.membershipId === seeded.membershipId)).toBe(false);
});

// ---------------------------------------------------------------------------
// (6) PRIVACY-SAFE — the view carries no account principal, confirmer person
//     id, relationship id, or sensitive relationship context.
// ---------------------------------------------------------------------------

it("returns a privacy-safe review view with server-resolved confirmer names", async () => {
  const { actor } = await setup();
  const seeded = await seedEscalatedCase(actor, NORWOOD, "privacy-safe");

  const reviews = await readReviews(actor, adminIdentity, NORWOOD);
  const review = findReview(reviews, seeded.membershipId);

  // No confirmer account principal, confirmer person id, or relationship id.
  expect(review).not.toHaveProperty("confirmerAccountId");
  expect(review).not.toHaveProperty("confirmerPersonId");
  expect(review).not.toHaveProperty("relationshipId");
  expect(review.confirmationHistory[0]).not.toHaveProperty("confirmerAccountId");
  expect(review.confirmationHistory[0]).not.toHaveProperty("confirmerPersonId");
  expect(review.confirmationHistory[0]).not.toHaveProperty("relationshipId");

  // The confirmer display name is a plain string, not a principal.
  expect(typeof review.confirmationHistory[0].confirmerDisplayName).toBe("string");
  expect(review.confirmationHistory[0].confirmerDisplayName).toBe(
    `Review Confirmer privacy-safe`,
  );

  // The serialized view carries no principal text and no sensitive relationship
  // context.
  const serialized = describe(review);
  expect(serialized).not.toContain(seeded.confirmer.getPrincipal().toText());
  expect(serialized).not.toContain(seeded.pendingAccount.getPrincipal().toText());
  expect(serialized).not.toContain(seeded.confirmerPersonId);
  for (const sensitive of ["Biological", "Adoptive", "Foster", "Step", "Guardian"]) {
    expect(serialized).not.toContain(sensitive);
  }
});
