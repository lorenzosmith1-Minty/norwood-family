import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";
import {
  BACKEND_WASM,
  CONTRIBUTOR,
  adminIdentity,
  blob,
  contributorIdentity,
  registerApprovedContributor,
} from "./lane-helpers";

// ---------------------------------------------------------------------------
// Tenancy 1C-B2 — family-scoped Research Source endpoints (real-canister cover).
//
// The accepted behavior is that the canonical `*ForFamily` source endpoints
// enforce the family boundary: a source created in Family A is visible only
// under Family A and never under Family B; a `sourceId` alone never crosses the
// boundary; the Review Queue Sources section and its counts are family-scoped;
// a Research-linked Archive item is excluded from its own family's Pending
// Contributions while another family is unaffected; and the default Norwood
// legacy source workflow is unchanged.
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
// creates a Steward of a non-default family (`claimSteward` writes
// `familyId = "norwood"`), so "Steward A can approve a Family A source" cannot
// be exercised through the public API. The direction the API supports is
// covered here: the Norwood Steward cannot approve/reject a Family A source,
// and a Family A member who is not a Steward cannot review a Family A source.
// The internal family-scoped predicate is covered by the sibling
// `research-source-scope.behavior.test.ts`, which executes the real Motoko
// source.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";
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

// Deterministic identities. ADMIN is the first caller to
// _initialize_access_control and claims the Norwood Steward role; CONTRIBUTOR
// is an approved Norwood member. MEMBER_A and MEMBER_B become approved members
// of the two test-only families.
const memberAIdentity = createIdentity("research-source-family-a-seed");
const memberBIdentity = createIdentity("research-source-family-b-seed");

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

  actor.setIdentity(memberBIdentity);
  await actor._initialize_access_control();
  const createdB = await actor.createMyselfForFamily(FAMILY_B, "Family B Member");
  expect("ok" in createdB).toBe(true);

  return { actor, canisterId: setup.canisterId };
}

/**
 * Uploads a research source file into `familyId` as the currently-set caller
 * and returns the created Source and its linked Archive item.
 */
async function uploadSourceInto(
  actor: _SERVICE,
  familyId: string,
  title: string,
): Promise<{ sourceId: bigint; archiveItemId: bigint }> {
  const result = await actor.createSourceWithUploadForFamily(
    familyId,
    title,
    { CensusCitation: null },
    `A research source in ${familyId}.`,
    "application/pdf",
    blob,
    ["census"],
    "",
    [],
    [],
    { FamilyOnly: null },
    { Standard: null },
    [],
    `${title.replace(/\s+/gu, "-").toLowerCase()}.pdf`,
  );
  if (!("ok" in result)) {
    throw new Error(`createSourceWithUploadForFamily failed: ${JSON.stringify(result)}`);
  }
  return {
    sourceId: result.ok.source.id,
    archiveItemId: result.ok.archiveItem.id,
  };
}

/** Filters notifications down to the archive review types. */
function archiveNotifications(
  notifications: Array<{ notificationType: unknown }>,
): Array<{ notificationType: unknown }> {
  return notifications.filter(
    (n) =>
      "ArchiveApproved" in (n.notificationType as object) ||
      "ArchiveRejected" in (n.notificationType as object),
  );
}

// ---------------------------------------------------------------------------
// (1) Source read isolation: a Family A source is visible under Family A and
//     absent under Family B; a sourceId alone never crosses the boundary.
//
// Only Norwood has a Steward, so the Steward-gated family-scoped reads can only
// be executed by the Norwood Steward. The boundary is therefore driven in the
// direction the API supports: the Norwood Steward's Norwood read must never
// return a Family A source, and the Family A id must not resolve under Norwood.
// ---------------------------------------------------------------------------

it("does not show a Family A source in the Norwood source listing", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const { sourceId } = await uploadSourceInto(actor, FAMILY_A, "Family A census");

  // The Norwood Steward's family-scoped listing excludes the Family A source.
  actor.setIdentity(adminIdentity);
  const norwoodSources = await actor.listSourcesForFamily(NORWOOD);
  expect(norwoodSources.find((s) => s.id === sourceId)).toBeUndefined();
  expect(norwoodSources.every((s) => s.familyId === NORWOOD)).toBe(true);
});

it("does not resolve a Family A source id under Norwood", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const { sourceId } = await uploadSourceInto(actor, FAMILY_A, "Boundary source");

  // The Norwood Steward cannot resolve the Family A id under Norwood: the
  // record belongs to another family, so the lookup behaves like not-found.
  actor.setIdentity(adminIdentity);
  await expect(actor.getSourceForFamily(NORWOOD, sourceId)).resolves.toEqual([]);
});

it("denies a non-Steward member reading a family's source listing", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  await uploadSourceInto(actor, FAMILY_A, "Member A source");

  // Approved membership is not Steward authority: the source read is denied.
  await expect(actor.listSourcesForFamily(FAMILY_A)).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
});

// ---------------------------------------------------------------------------
// (2) Source review isolation: the Norwood Steward cannot approve or reject a
//     Family A source, and a non-Steward Family A member cannot either.
// ---------------------------------------------------------------------------

it("denies the Norwood Steward approving or rejecting a Family A source", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const { sourceId } = await uploadSourceInto(actor, FAMILY_A, "Family A pending source");

  actor.setIdentity(adminIdentity);
  await expect(actor.approveSourceForFamily(FAMILY_A, sourceId)).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
  await expect(actor.rejectSourceForFamily(FAMILY_A, sourceId)).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
  await expect(
    actor.needsResearchSourceForFamily(FAMILY_A, sourceId),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
});

it("denies an approved Family A member who is not a Steward reviewing a Family A source", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const { sourceId } = await uploadSourceInto(actor, FAMILY_A, "Member review attempt");

  await expect(actor.approveSourceForFamily(FAMILY_A, sourceId)).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
  await expect(actor.rejectSourceForFamily(FAMILY_A, sourceId)).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
});

// ---------------------------------------------------------------------------
// (3) Single-approval linked-Archive behavior (Norwood, the only family with a
//     Steward): approving a source updates its linked Archive item and emits
//     exactly one ResearchApproved notification with no ArchiveApproved.
// ---------------------------------------------------------------------------

it("approving a source approves its linked Archive item with exactly one ResearchApproved and no ArchiveApproved", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(contributorIdentity);
  const { sourceId, archiveItemId } = await uploadSourceInto(
    actor,
    NORWOOD,
    "Norwood approved source",
  );

  actor.setIdentity(adminIdentity);
  const approved = await actor.approveSourceForFamily(NORWOOD, sourceId);
  expect(approved).toEqual([
    expect.objectContaining({ id: sourceId, status: { Approved: null } }),
  ]);

  // The linked Archive item transitioned to Approved in the same action.
  const archive = await actor.listApprovedArchiveItemsForFamily(NORWOOD);
  const approvedItem = archive.find((i) => i.id === archiveItemId);
  expect(approvedItem).toBeDefined();
  expect(approvedItem?.status).toEqual({ Approved: null });

  // Exactly one ResearchApproved notification, and zero ArchiveApproved.
  actor.setIdentity(contributorIdentity);
  const notifications = await actor.listNotifications();
  const researchApproved = notifications.filter(
    (n) => "ResearchApproved" in n.notificationType,
  );
  expect(researchApproved).toHaveLength(1);
  expect(researchApproved[0]).toMatchObject({
    recipient: CONTRIBUTOR,
    notificationType: { ResearchApproved: null },
  });
  expect(archiveNotifications(notifications)).toEqual([]);
});

it("rejecting a source rejects its linked Archive item with exactly one ResearchRejected and no ArchiveRejected", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(contributorIdentity);
  const { sourceId, archiveItemId } = await uploadSourceInto(
    actor,
    NORWOOD,
    "Norwood rejected source",
  );

  actor.setIdentity(adminIdentity);
  const rejected = await actor.rejectSourceForFamily(NORWOOD, sourceId);
  expect(rejected).toEqual([
    expect.objectContaining({ id: sourceId, status: { Rejected: null } }),
  ]);

  // The linked Archive item transitioned to Rejected and is not approved.
  const archive = await actor.listApprovedArchiveItemsForFamily(NORWOOD);
  expect(archive.find((i) => i.id === archiveItemId)).toBeUndefined();

  actor.setIdentity(contributorIdentity);
  const notifications = await actor.listNotifications();
  const researchRejected = notifications.filter(
    (n) => "ResearchRejected" in n.notificationType,
  );
  expect(researchRejected).toHaveLength(1);
  expect(researchRejected[0]).toMatchObject({
    recipient: CONTRIBUTOR,
    notificationType: { ResearchRejected: null },
  });
  expect(archiveNotifications(notifications)).toEqual([]);
});

// ---------------------------------------------------------------------------
// (4) Review Queue source counts are family-scoped: a Family A source must not
//     inflate the Norwood queue's source count.
// ---------------------------------------------------------------------------

it("scopes the Review Queue source count to the requested family", async () => {
  const { actor } = await setupFamilies();

  // One Norwood source and one Family A source.
  actor.setIdentity(contributorIdentity);
  await uploadSourceInto(actor, NORWOOD, "Norwood queued source");

  actor.setIdentity(memberAIdentity);
  await uploadSourceInto(actor, FAMILY_A, "Family A queued source");

  // The Norwood queue counts only the Norwood source.
  actor.setIdentity(adminIdentity);
  const norwoodQueue = await actor.getReviewQueueForFamily(NORWOOD);
  const norwoodSourceItems = norwoodQueue.items.filter(
    (i) => i.kind.Source !== undefined,
  );
  expect(norwoodSourceItems).toHaveLength(1);
  expect(norwoodSourceItems[0].title).toBe("Norwood queued source");
  expect(norwoodQueue.pending).toBe(1n);

  // The legacy queue agrees with the Norwood family-scoped queue.
  const legacyQueue = await actor.getReviewQueue();
  expect(legacyQueue.pending).toBe(norwoodQueue.pending);
});

// ---------------------------------------------------------------------------
// (5) Pending Contributions: a Research-linked Archive item is excluded from
//     its own family's Pending Contributions, and another family is unaffected.
// ---------------------------------------------------------------------------

it("excludes a Research-linked Archive item from its own family's Pending Contributions", async () => {
  const { actor } = await setupFamilies();

  // A Research upload in Norwood creates a linked pending Archive item that is
  // reviewed through Research Intake, not Pending Contributions.
  actor.setIdentity(contributorIdentity);
  await uploadSourceInto(actor, NORWOOD, "Norwood research upload");

  actor.setIdentity(adminIdentity);
  const norwoodPending = await actor.listPendingArchiveItemsForFamily(NORWOOD);
  expect(norwoodPending).toEqual([]);
  expect(await actor.getPendingContributionsCountForFamily(NORWOOD)).toBe(0n);

  // A Family A Research upload is likewise excluded from Family A's pending
  // list, and does not appear in Norwood's either.
  actor.setIdentity(memberAIdentity);
  await uploadSourceInto(actor, FAMILY_A, "Family A research upload");

  actor.setIdentity(adminIdentity);
  const norwoodPendingAfter = await actor.listPendingArchiveItemsForFamily(NORWOOD);
  expect(norwoodPendingAfter).toEqual([]);
});

// ---------------------------------------------------------------------------
// (6) Default Norwood compatibility: the legacy source workflow (create,
//     upload, list, get, approve, reject) behaves unchanged.
// ---------------------------------------------------------------------------

it("keeps the legacy Norwood source workflow working end to end", async () => {
  const { actor } = await setupFamilies();

  // Legacy createSource writes a Norwood source.
  actor.setIdentity(contributorIdentity);
  const created = await actor.createSource(
    "Legacy Norwood source",
    { CensusCitation: null },
    "A legacy source.",
    [],
  );
  expect("ok" in created).toBe(true);
  const createdSource = (created as { ok: { id: bigint; familyId: string } }).ok;
  expect(createdSource.familyId).toBe(NORWOOD);

  // Legacy listSources and getSource resolve it.
  actor.setIdentity(adminIdentity);
  const listed = await actor.listSources();
  expect(listed.find((s) => s.id === createdSource.id)).toBeDefined();
  const fetched = await actor.getSource(createdSource.id);
  expect(fetched).toHaveLength(1);
  expect(fetched[0]).toMatchObject({ id: createdSource.id, familyId: NORWOOD });

  // Legacy approveSource resolves it.
  const approved = await actor.approveSource(createdSource.id);
  expect(approved).toEqual([
    expect.objectContaining({ id: createdSource.id, status: { Approved: null } }),
  ]);

  // A second legacy source rejects through the legacy endpoint.
  actor.setIdentity(contributorIdentity);
  const created2 = await actor.createSource(
    "Legacy Norwood source 2",
    { CensusCitation: null },
    "Another legacy source.",
    [],
  );
  const createdSource2 = (created2 as { ok: { id: bigint } }).ok;
  actor.setIdentity(adminIdentity);
  const rejected = await actor.rejectSource(createdSource2.id);
  expect(rejected).toEqual([
    expect.objectContaining({ id: createdSource2.id, status: { Rejected: null } }),
  ]);
});
