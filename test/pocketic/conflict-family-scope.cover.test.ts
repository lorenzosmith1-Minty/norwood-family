import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";
import {
  BACKEND_WASM,
  adminIdentity,
  contributorIdentity,
  registerApprovedContributor,
  routeConflictingFindingToReview,
} from "./lane-helpers";

// ---------------------------------------------------------------------------
// Tenancy 1C-B2-B4 — family-scoped Conflict Review endpoints (real-canister
// cover).
//
// The accepted behavior is that the canonical `*ForFamily` conflict endpoints
// enforce the family boundary: a conflict carries a `familyId`, the family
// listing returns only that family's conflicts, a `conflictId` alone never
// crosses a family boundary, the four resolution actions are Steward-gated for
// the requested family, the Review Queue Conflict count is family-correct, and
// the default Norwood legacy conflict workflow is unchanged through the
// temporary compatibility wrappers.
//
// The frontend suite mocks the actor, so none of this is visible there. This
// file installs the app's own compiled wasm and drives the real public API.
//
// Coverage limit this file cannot close: there is no public endpoint that
// creates a Steward of a non-default family (`claimSteward` writes
// `familyId = "norwood"`), and a Conflict Review item is only ever created by a
// Steward approving a `#Conflicting` finding. A Family A conflict therefore
// cannot be created through the public API, so the Steward-gated family-scoped
// conflict reads can only be executed by the Norwood Steward. The boundary is
// driven in the direction the API supports: the Norwood Steward's Norwood read
// must never return a Family A conflict, the Norwood Steward is denied on every
// Family A conflict endpoint, and an approved Family A member is denied on the
// Family A conflict endpoints because membership is not Steward authority. The
// internal family-filter predicates (`listForFamily` / `getForFamily` /
// `resolveForFamily`) are covered by the sibling `conflict-scope.behavior.test.ts`,
// which executes the real Motoko source.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

const FAMILY_A = "test-family-a";
const NORWOOD = "norwood";

const STEWARD_MARKER =
  "Unauthorized: Only Family Stewards can perform this action";

let pic: PocketIc | undefined;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
});

afterAll(async () => {
  await pic?.tearDown();
});

// A separate identity that becomes an approved member of the test-only family
// A. `createMyselfForFamily` writes an APPROVED claim for the caller in that
// family, which is the only public path to non-default-family membership. It
// does not confer Steward authority.
const memberAIdentity = createIdentity("conflict-family-a-seed");

interface Seeded {
  actor: _SERVICE;
  canisterId: ReturnType<typeof createIdentity>["getPrincipal"];
}

/**
 * A fresh canister with the Norwood Steward bootstrapped, an approved Norwood
 * contributor, and MEMBER_A approved in the test-only family A. Each test seeds
 * its own canister so no test depends on the order another ran in.
 */
async function setupFamilies(): Promise<Seeded> {
  const setup = await pic!.setupCanister<_SERVICE>({
    idlFactory,
    wasm: BACKEND_WASM,
  });
  const actor = setup.actor;

  await registerApprovedContributor(actor);

  actor.setIdentity(memberAIdentity);
  await actor._initialize_access_control();
  const createdA = await actor.createMyselfForFamily(FAMILY_A, "Family A Member");
  expect("ok" in createdA).toBe(true);

  return { actor, canisterId: setup.canisterId };
}

// ---------------------------------------------------------------------------
// (1) A conflict carries its familyId, and the family-scoped listing returns it
//     under that family. The Norwood Steward's Norwood read is the only
//     family-scoped conflict read the public API can execute.
// ---------------------------------------------------------------------------

it("creates a Norwood conflict carrying familyId 'norwood' and returns it from listConflictReviewItemsForFamily", async () => {
  const { actor } = await setupFamilies();

  const { conflictId, findingId } = await routeConflictingFindingToReview(actor);

  actor.setIdentity(adminIdentity);
  const norwoodConflicts = await actor.listConflictReviewItemsForFamily(NORWOOD);
  const conflict = norwoodConflicts.find((c) => c.id === conflictId);
  expect(conflict).toBeDefined();
  expect(conflict).toMatchObject({
    id: conflictId,
    findingId,
    familyId: NORWOOD,
    personId: ["lorenzoSmithJr"],
    status: { Conflicting: null },
  });
  // Every returned conflict belongs to the requested family.
  expect(norwoodConflicts.every((c) => c.familyId === NORWOOD)).toBe(true);
});

it("returns a single conflict by family and conflict id from getConflictReviewItemForFamily", async () => {
  const { actor } = await setupFamilies();

  const { conflictId } = await routeConflictingFindingToReview(actor);

  actor.setIdentity(adminIdentity);
  const fetched = await actor.getConflictReviewItemForFamily(
    NORWOOD,
    conflictId,
  );
  expect(fetched).toHaveLength(1);
  expect(fetched[0]).toMatchObject({
    id: conflictId,
    familyId: NORWOOD,
    status: { Conflicting: null },
  });

  // An unknown conflict id resolves to the empty option rather than trapping.
  await expect(
    actor.getConflictReviewItemForFamily(NORWOOD, 9999n),
  ).resolves.toEqual([]);
});

// ---------------------------------------------------------------------------
// (2) A conflict id alone never crosses a family boundary: the Norwood Steward
//     is denied on every Family A conflict endpoint, and an approved Family A
//     member is denied too because membership is not Steward authority.
// ---------------------------------------------------------------------------

it("denies the Norwood Steward every Family A conflict endpoint", async () => {
  const { actor } = await setupFamilies();

  const { conflictId } = await routeConflictingFindingToReview(actor);

  actor.setIdentity(adminIdentity);
  await expect(
    actor.listConflictReviewItemsForFamily(FAMILY_A),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
  await expect(
    actor.getConflictReviewItemForFamily(FAMILY_A, conflictId),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
  await expect(
    actor.resolveConflictForFamily(FAMILY_A, conflictId, { KeepExisting: null }, ""),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
});

it("denies an approved Family A member the Family A conflict endpoints", async () => {
  const { actor } = await setupFamilies();

  const { conflictId } = await routeConflictingFindingToReview(actor);

  // MEMBER_A holds an APPROVED claim in Family A but is not a Steward of it, so
  // every conflict read and action is denied.
  actor.setIdentity(memberAIdentity);
  await expect(
    actor.listConflictReviewItemsForFamily(FAMILY_A),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
  await expect(
    actor.getConflictReviewItemForFamily(FAMILY_A, conflictId),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
  await expect(
    actor.resolveConflictForFamily(FAMILY_A, conflictId, { KeepExisting: null }, ""),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
});

it("denies a non-Steward member every Norwood conflict endpoint", async () => {
  const { actor } = await setupFamilies();

  const { conflictId } = await routeConflictingFindingToReview(actor);

  // Approved membership is not Steward authority: every conflict read and
  // action is denied for a signed-in non-Steward.
  actor.setIdentity(contributorIdentity);
  await expect(
    actor.listConflictReviewItemsForFamily(NORWOOD),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
  await expect(
    actor.getConflictReviewItemForFamily(NORWOOD, conflictId),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
  await expect(
    actor.resolveConflictForFamily(NORWOOD, conflictId, { KeepExisting: null }, ""),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
});

it("denies an anonymous caller the Norwood conflict endpoints", async () => {
  const { canisterId } = await setupFamilies();

  // A fresh actor with no identity set is anonymous.
  const anonymousActor = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  await expect(
    anonymousActor.listConflictReviewItemsForFamily(NORWOOD),
  ).rejects.toThrow();
  await expect(
    anonymousActor.resolveConflictForFamily(
      NORWOOD,
      1n,
      { KeepExisting: null },
      "",
    ),
  ).rejects.toThrow();
});

// ---------------------------------------------------------------------------
// (3) The four resolution actions are family-scoped and Steward-gated, and
//     resolveConflictForFamily resolves the conflict in its own family.
// ---------------------------------------------------------------------------

it("resolves a Norwood conflict through resolveConflictForFamily with Keep Existing", async () => {
  const { actor } = await setupFamilies();

  const { conflictId } = await routeConflictingFindingToReview(actor);

  actor.setIdentity(adminIdentity);
  const resolved = await actor.resolveConflictForFamily(
    NORWOOD,
    conflictId,
    { KeepExisting: null },
    "Canonical record is authoritative",
  );
  expect(resolved).toEqual({
    ok: expect.objectContaining({
      id: conflictId,
      familyId: NORWOOD,
      status: { Approved: null },
      stewardNotes: "Canonical record is authoritative",
    }),
  });

  // The conflict is resolved in the family-scoped listing.
  const norwoodConflicts = await actor.listConflictReviewItemsForFamily(NORWOOD);
  expect(norwoodConflicts.find((c) => c.id === conflictId)!.status).toEqual({
    Approved: null,
  });
});

it("keeps a conflict unresolved with Preserve Both and Needs Research", async () => {
  const { actor } = await setupFamilies();

  const { conflictId } = await routeConflictingFindingToReview(actor);

  actor.setIdentity(adminIdentity);
  const preserved = await actor.resolveConflictForFamily(
    NORWOOD,
    conflictId,
    { PreserveBoth: null },
    "Both values are attested",
  );
  expect(preserved).toEqual({
    ok: expect.objectContaining({
      id: conflictId,
      status: { Conflicting: null },
    }),
  });

  const needsResearch = await actor.resolveConflictForFamily(
    NORWOOD,
    conflictId,
    { NeedsResearch: null },
    "Need to verify the source",
  );
  expect(needsResearch).toEqual({
    ok: expect.objectContaining({
      id: conflictId,
      status: { NeedsResearch: null },
    }),
  });
});

it("returns #notFound for an unknown conflict id on resolveConflictForFamily", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  // Notes are validated before the lookup, so a non-empty note is required to
  // reach the not-found branch.
  const result = await actor.resolveConflictForFamily(
    NORWOOD,
    9999n,
    { KeepExisting: null },
    "No such conflict",
  );
  expect(result).toEqual({ err: { notFound: 9999n } });
});

// ---------------------------------------------------------------------------
// (4) The Review Queue Conflict count is family-correct: the Norwood queue
//     counts the Norwood conflict exactly once, and the legacy queue agrees.
// ---------------------------------------------------------------------------

it("counts the Norwood conflict in the Norwood family-scoped review queue", async () => {
  const { actor } = await setupFamilies();

  await routeConflictingFindingToReview(actor);

  actor.setIdentity(adminIdentity);
  const norwoodQueue = await actor.getReviewQueueForFamily(NORWOOD);
  expect(norwoodQueue.conflicting).toBe(1n);

  // The conflict is present in the queue exactly once, as #ConflictReview.
  const conflictItems = norwoodQueue.items.filter(
    (i) => i.kind.ConflictReview !== undefined,
  );
  expect(conflictItems).toHaveLength(1);
  expect(conflictItems[0].status).toEqual({ Conflicting: null });

  // The legacy queue agrees with the Norwood family-scoped queue.
  const legacyQueue = await actor.getReviewQueue();
  expect(legacyQueue.conflicting).toBe(norwoodQueue.conflicting);
});

it("denies a non-Steward the family-scoped review queue", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(contributorIdentity);
  await expect(actor.getReviewQueueForFamily(NORWOOD)).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
});

// ---------------------------------------------------------------------------
// (5) Default Norwood compatibility: the legacy conflict workflow (list, get,
//     resolve, list-for-person) behaves unchanged through the temporary
//     wrappers.
// ---------------------------------------------------------------------------

it("keeps the legacy Norwood conflict workflow working through the compatibility wrappers", async () => {
  const { actor } = await setupFamilies();

  const { conflictId } = await routeConflictingFindingToReview(actor);

  actor.setIdentity(adminIdentity);
  // Legacy listConflictReviewItems resolves it.
  const listed = await actor.listConflictReviewItems();
  const found = listed.find((c) => c.id === conflictId);
  expect(found).toBeDefined();
  expect(found).toMatchObject({ id: conflictId, familyId: NORWOOD });

  // Legacy listConflictsForPerson surfaces the unresolved conflict.
  const surfaced = await actor.listConflictsForPerson("lorenzoSmithJr");
  expect(surfaced.map((c) => c.id)).toContain(conflictId);

  // Legacy resolveConflict resolves it.
  const resolved = await actor.resolveConflict(
    conflictId,
    { NeedsResearch: null },
    "Need to verify the source",
  );
  expect(resolved).toEqual({
    ok: expect.objectContaining({
      id: conflictId,
      familyId: NORWOOD,
      status: { NeedsResearch: null },
    }),
  });

  // The family-scoped listing agrees with the legacy listing.
  const norwoodConflicts = await actor.listConflictReviewItemsForFamily(NORWOOD);
  expect(norwoodConflicts.find((c) => c.id === conflictId)!.status).toEqual({
    NeedsResearch: null,
  });
});
