import { PocketIc } from "@dfinity/pic";
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
// Cover for the single-approval fix: a Research upload creates ONE canonical
// pending Archive item linked to the Source, and the steward's single
// approveSource / rejectSource action resolves BOTH records.
//
// The four scenarios below are the accepted behavior:
//
//   A. createSourceWithUpload leaves the Source and its linked Archive item
//      pending; the Source appears in the Research Review Queue, and the linked
//      Archive item is EXCLUDED from Pending Contributions.
//   B. approveSource transitions the Source AND the linked Archive item to
//      Approved, the item appears in approved Archive results, and exactly one
//      ResearchApproved notification is emitted with zero ArchiveApproved.
//   C. rejectSource transitions the Source AND the linked Archive item to
//      Rejected, the item does NOT appear in approved Archive results, and
//      exactly one ResearchRejected notification is emitted with zero
//      ArchiveRejected.
//   D. An ordinary (non-Research) Archive upload still appears in Pending
//      Contributions and still resolves through approveArchiveItem /
//      rejectArchiveItem.
//
// The canister is seeded per test: ADMIN is the first caller to
// _initialize_access_control and claims the Steward role; CONTRIBUTOR is an
// approved family member via an approved claim.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

let pic: PocketIc | undefined;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
});

afterAll(async () => {
  await pic?.tearDown();
});

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

/** Filters notifications down to the research review types. */
function researchNotifications(
  notifications: Array<{ notificationType: unknown }>,
): Array<{ notificationType: unknown }> {
  return notifications.filter(
    (n) =>
      "ResearchSubmission" in (n.notificationType as object) ||
      "ResearchApproved" in (n.notificationType as object) ||
      "ResearchRejected" in (n.notificationType as object),
  );
}

/** Uploads one research source file as CONTRIBUTOR and returns the result. */
async function uploadResearchSource(actor: _SERVICE, title: string) {
  actor.setIdentity(contributorIdentity);
  return actor.createSourceWithUpload(
    title,
    { CensusCitation: null },
    "Census record listing the Norwood family.",
    "application/pdf",
    blob,
    ["census", "1900"],
    "1900",
    [1900n],
    ["julia"],
    { FamilyOnly: null },
    { Standard: null },
    [],
    `${title.toLowerCase().replace(/\s+/g, "-")}.pdf`,
  );
}

/** Submits one ordinary (non-Research) pending Archive item as CONTRIBUTOR. */
async function submitOrdinaryArchiveItem(actor: _SERVICE, title: string) {
  actor.setIdentity(contributorIdentity);
  return actor.submitArchiveItem(
    title,
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
    `${title.toLowerCase().replace(/\s+/g, "-")}.pdf`,
  );
}

// ---------------------------------------------------------------------------
// A. createSourceWithUpload: Source pending, linked Archive item pending,
//    Source in the Research Review Queue, linked item excluded from Pending
//    Contributions.
// ---------------------------------------------------------------------------

it("A: a research upload leaves both records pending, queues the Source, and excludes the linked item from Pending Contributions", async () => {
  const setup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const actor = setup.actor;
  await registerApprovedContributor(actor);

  const result = await uploadResearchSource(actor, "A census upload");
  expect(result).toEqual({
    ok: expect.objectContaining({
      source: expect.objectContaining({
        title: "A census upload",
        status: { Pending: null },
        archiveItemId: [expect.any(BigInt)],
      }),
      archiveItem: expect.objectContaining({
        title: "A census upload",
        status: { Pending: null },
      }),
    }),
  });
  const source = (result as { ok: { source: { id: bigint; archiveItemId: [bigint] } } }).ok
    .source;
  const archiveItem = (result as { ok: { archiveItem: { id: bigint } } }).ok.archiveItem;

  // The Source links to the Archive item created in the same call.
  expect(source.archiveItemId).toEqual([archiveItem.id]);

  actor.setIdentity(adminIdentity);

  // The Source is pending and appears in the Research Review Queue.
  const queue = await actor.getReviewQueue();
  expect(queue.pending).toBe(1n);
  const sourceItem = queue.items.find((i) => i.kind.Source !== undefined);
  expect(sourceItem).toMatchObject({
    id: source.id,
    title: "A census upload",
    status: { Pending: null },
  });

  // The linked Archive item is pending but is NOT listed in Pending
  // Contributions — it is reviewed through the Research Intake queue.
  const pending = await actor.listPendingArchiveItems();
  expect(pending.find((i) => i.id === archiveItem.id)).toBeUndefined();
  expect(pending).toHaveLength(0);

  // The Source record still carries the link and is pending.
  const sources = await actor.listSources();
  expect(sources).toHaveLength(1);
  expect(sources[0]).toMatchObject({
    id: source.id,
    archiveItemId: [archiveItem.id],
    status: { Pending: null },
  });
});

// ---------------------------------------------------------------------------
// B. approveSource: Source Approved, linked Archive item Approved, item in
//    approved Archive results, exactly one ResearchApproved, zero
//    ArchiveApproved.
// ---------------------------------------------------------------------------

it("B: approveSource approves the Source and its linked Archive item with exactly one ResearchApproved notification", async () => {
  const setup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const actor = setup.actor;
  await registerApprovedContributor(actor);

  const result = await uploadResearchSource(actor, "B census upload");
  const source = (result as { ok: { source: { id: bigint } } }).ok.source;
  const archiveItem = (result as { ok: { archiveItem: { id: bigint } } }).ok.archiveItem;

  actor.setIdentity(adminIdentity);
  const approved = await actor.approveSource(source.id);
  expect(approved).toEqual([
    expect.objectContaining({ id: source.id, status: { Approved: null } }),
  ]);

  // The linked Archive item transitioned to Approved in the same action.
  const archive = await actor.listApprovedArchiveItems();
  const approvedItem = archive.find((i) => i.id === archiveItem.id);
  expect(approvedItem).toBeDefined();
  expect(approvedItem?.status).toEqual({ Approved: null });

  // The item is no longer pending.
  const pending = await actor.listPendingArchiveItems();
  expect(pending.find((i) => i.id === archiveItem.id)).toBeUndefined();

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
    message: "Your research submission was approved.",
  });
  expect(
    notifications.filter((n) => "ArchiveApproved" in n.notificationType),
  ).toEqual([]);
  expect(archiveNotifications(notifications)).toEqual([]);
});

// ---------------------------------------------------------------------------
// C. rejectSource: Source Rejected, linked Archive item Rejected, item absent
//    from approved Archive results, exactly one ResearchRejected, zero
//    ArchiveRejected.
// ---------------------------------------------------------------------------

it("C: rejectSource rejects the Source and its linked Archive item with exactly one ResearchRejected notification", async () => {
  const setup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const actor = setup.actor;
  await registerApprovedContributor(actor);

  const result = await uploadResearchSource(actor, "C census upload");
  const source = (result as { ok: { source: { id: bigint } } }).ok.source;
  const archiveItem = (result as { ok: { archiveItem: { id: bigint } } }).ok.archiveItem;

  actor.setIdentity(adminIdentity);
  const rejected = await actor.rejectSource(source.id);
  expect(rejected).toEqual([
    expect.objectContaining({ id: source.id, status: { Rejected: null } }),
  ]);

  // The linked Archive item transitioned to Rejected and is not approved.
  const archive = await actor.listApprovedArchiveItems();
  expect(archive.find((i) => i.id === archiveItem.id)).toBeUndefined();
  const pending = await actor.listPendingArchiveItems();
  expect(pending.find((i) => i.id === archiveItem.id)).toBeUndefined();

  // Exactly one ResearchRejected notification, and zero ArchiveRejected.
  actor.setIdentity(contributorIdentity);
  const notifications = await actor.listNotifications();
  const researchRejected = notifications.filter(
    (n) => "ResearchRejected" in n.notificationType,
  );
  expect(researchRejected).toHaveLength(1);
  expect(researchRejected[0]).toMatchObject({
    recipient: CONTRIBUTOR,
    notificationType: { ResearchRejected: null },
    message: "Your research submission was not approved.",
  });
  expect(
    notifications.filter((n) => "ArchiveRejected" in n.notificationType),
  ).toEqual([]);
  expect(archiveNotifications(notifications)).toEqual([]);
});

// ---------------------------------------------------------------------------
// E. The Pending Contributions badge count (getPendingContributionsCount)
//    excludes a Research-linked pending Archive item, so the badge agrees with
//    listPendingArchiveItems. An ordinary pending item still counts.
// ---------------------------------------------------------------------------

it("E: getPendingContributionsCount excludes a Research-linked pending item and agrees with the pending list", async () => {
  const setup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const actor = setup.actor;
  await registerApprovedContributor(actor);

  // One Research upload (Source + linked pending Archive item) and one ordinary
  // pending Archive item.
  await uploadResearchSource(actor, "E census upload");
  await submitOrdinaryArchiveItem(actor, "E ordinary letter");

  actor.setIdentity(adminIdentity);

  // The linked Research item is excluded from the pending list, so only the
  // ordinary item is listed.
  const pending = await actor.listPendingArchiveItems();
  expect(pending).toHaveLength(1);
  expect(pending[0].title).toBe("E ordinary letter");

  // The badge count agrees with the list: the Research-linked pending item is
  // not counted, so the count is exactly one.
  expect(await actor.getPendingContributionsCount()).toBe(1n);

  // Approving the ordinary item decrements the count to zero, still agreeing
  // with the (now empty) pending list.
  await actor.approveArchiveItem(pending[0].id);
  expect(await actor.listPendingArchiveItems()).toEqual([]);
  expect(await actor.getPendingContributionsCount()).toBe(0n);
});

// ---------------------------------------------------------------------------
// D. Ordinary Archive upload: still appears in Pending Contributions and still
//    resolves through approveArchiveItem / rejectArchiveItem.
// ---------------------------------------------------------------------------

it("D: an ordinary archive upload still appears in Pending Contributions and resolves via approveArchiveItem/rejectArchiveItem", async () => {
  const setup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const actor = setup.actor;
  await registerApprovedContributor(actor);

  const approvedItem = await submitOrdinaryArchiveItem(actor, "Ordinary approved letter");
  const rejectedItem = await submitOrdinaryArchiveItem(actor, "Ordinary rejected letter");

  actor.setIdentity(adminIdentity);

  // Both ordinary items are listed in Pending Contributions.
  const pending = await actor.listPendingArchiveItems();
  expect(pending.map((i) => i.id).sort()).toEqual(
    [approvedItem.id, rejectedItem.id].sort(),
  );

  // approveArchiveItem resolves the ordinary item and emits one ArchiveApproved.
  const approved = await actor.approveArchiveItem(approvedItem.id);
  expect(approved).toEqual([
    expect.objectContaining({ id: approvedItem.id, status: { Approved: null } }),
  ]);
  const archive = await actor.listApprovedArchiveItems();
  expect(archive.find((i) => i.id === approvedItem.id)).toBeDefined();

  // rejectArchiveItem resolves the other ordinary item.
  const rejected = await actor.rejectArchiveItem(rejectedItem.id);
  expect(rejected).toEqual([
    expect.objectContaining({ id: rejectedItem.id, status: { Rejected: null } }),
  ]);
  const pendingAfter = await actor.listPendingArchiveItems();
  expect(pendingAfter.find((i) => i.id === rejectedItem.id)).toBeUndefined();

  // The ordinary flow emits Archive notifications (not Research ones).
  actor.setIdentity(contributorIdentity);
  const notifications = await actor.listNotifications();
  const archiveApproved = notifications.filter(
    (n) => "ArchiveApproved" in n.notificationType,
  );
  const archiveRejected = notifications.filter(
    (n) => "ArchiveRejected" in n.notificationType,
  );
  expect(archiveApproved).toHaveLength(1);
  expect(archiveApproved[0]).toMatchObject({
    recipient: CONTRIBUTOR,
    notificationType: { ArchiveApproved: null },
  });
  expect(archiveRejected).toHaveLength(1);
  expect(archiveRejected[0]).toMatchObject({
    recipient: CONTRIBUTOR,
    notificationType: { ArchiveRejected: null },
  });
  expect(researchNotifications(notifications)).toEqual([]);
});
