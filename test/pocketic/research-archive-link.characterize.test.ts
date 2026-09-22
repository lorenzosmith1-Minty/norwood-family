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
// Characterization for the Research Source <-> Archive Item link and the
// ordinary (non-Research) Archive review flow.
//
// The accepted change intentionally alters three behaviors, and this file
// deliberately does NOT freeze any of them:
//
//   * listPendingArchiveItems will start filtering out Archive items that a
//     Research Source links to via archiveItemId;
//   * approveSource will additionally transition the linked pending Archive
//     item to Approved;
//   * rejectSource will additionally transition the linked pending Archive
//     item to Rejected.
//
// What this file protects is the adjacent behavior that must survive that
// change:
//
//   1. createSourceWithUpload still creates exactly ONE canonical pending
//      Archive item and links the Source to it via archiveItemId (the link the
//      new filtering/transition logic depends on).
//   2. createSource with an explicit archiveItemId still links a Source to an
//      existing Archive item.
//   3. The ordinary Archive approve/reject flow on a non-Research item still
//      transitions the item and emits exactly one ArchiveApproved /
//      ArchiveRejected notification, with no Research notification.
//   4. A Research upload still emits exactly one ResearchSubmission
//      notification and no Archive notification.
//   5. listPendingArchiveItems remains Steward-gated.
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
// 1. createSourceWithUpload creates exactly one pending Archive item and links
//    the Source to it. This is the link the accepted change reads.
// ---------------------------------------------------------------------------

it("links a research upload to exactly one canonical pending archive item", async () => {
  const setup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const actor = setup.actor;
  await registerApprovedContributor(actor);

  actor.setIdentity(contributorIdentity);
  const result = await actor.createSourceWithUpload(
    "1900 census, Norwood household",
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
    "1900-census.pdf",
  );

  expect(result).toEqual({
    ok: expect.objectContaining({
      source: expect.objectContaining({
        title: "1900 census, Norwood household",
        sourceType: { CensusCitation: null },
        archiveItemId: [expect.any(BigInt)],
        contributor: CONTRIBUTOR,
        status: { Pending: null },
      }),
      archiveItem: expect.objectContaining({
        title: "1900 census, Norwood household",
        itemType: { Document: null },
        contributor: CONTRIBUTOR,
        status: { Pending: null },
      }),
    }),
  });

  const source = (result as { ok: { source: { id: bigint; archiveItemId: [bigint] } } }).ok
    .source;
  const archiveItem = (result as { ok: { archiveItem: { id: bigint } } }).ok.archiveItem;

  // The Source links to the Archive item that was created in the same call.
  expect(source.archiveItemId).toEqual([archiveItem.id]);

  // The linked Archive item is pending, but it is NOT listed in Pending
  // Contributions: a Research-linked pending item is reviewed through the
  // Research Intake queue, so listPendingArchiveItems excludes it. The item
  // still exists (the Source links to it) and is still pending.
  actor.setIdentity(adminIdentity);
  const pending = await actor.listPendingArchiveItems();
  expect(pending.find((i) => i.id === archiveItem.id)).toBeUndefined();
  expect(pending).toHaveLength(0);

  // The Source is readable and carries the same link.
  const sources = await actor.listSources();
  expect(sources).toHaveLength(1);
  expect(sources[0]).toMatchObject({
    id: source.id,
    archiveItemId: [archiveItem.id],
    status: { Pending: null },
  });
});

// ---------------------------------------------------------------------------
// 2. createSource with an explicit archiveItemId links to an existing item.
// ---------------------------------------------------------------------------

it("links a source to an existing archive item via an explicit archiveItemId", async () => {
  const setup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const actor = setup.actor;
  await registerApprovedContributor(actor);

  // Seed an ordinary pending Archive item to link against.
  const item = await submitOrdinaryArchiveItem(actor, "Link target letter");

  actor.setIdentity(contributorIdentity);
  const created = await actor.createSource(
    "Source linked to an existing item",
    { CensusCitation: null },
    "A source that references an existing archive item.",
    [item.id],
  );
  expect(created).toEqual({
    ok: expect.objectContaining({
      title: "Source linked to an existing item",
      archiveItemId: [item.id],
      contributor: CONTRIBUTOR,
      status: { Pending: null },
    }),
  });

  // The explicit link survives the round-trip.
  actor.setIdentity(adminIdentity);
  const sources = await actor.listSources();
  const linked = sources.find((s) => s.title === "Source linked to an existing item");
  expect(linked?.archiveItemId).toEqual([item.id]);
});

// ---------------------------------------------------------------------------
// 3. Ordinary Archive approve/reject still works and emits only the Archive
//    notification (no Research notification).
// ---------------------------------------------------------------------------

it("approves an ordinary archive item with exactly one ArchiveApproved notification", async () => {
  const setup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const actor = setup.actor;
  await registerApprovedContributor(actor);

  const item = await submitOrdinaryArchiveItem(actor, "Ordinary approved letter");

  actor.setIdentity(adminIdentity);
  const approved = await actor.approveArchiveItem(item.id);
  expect(approved).toEqual([
    expect.objectContaining({ id: item.id, status: { Approved: null } }),
  ]);

  // The item left pending and entered the approved archive.
  const pending = await actor.listPendingArchiveItems();
  expect(pending.find((i) => i.id === item.id)).toBeUndefined();
  const archive = await actor.listApprovedArchiveItems();
  expect(archive.find((i) => i.id === item.id)).toBeDefined();

  // Exactly one ArchiveApproved notification, and no Research notification.
  actor.setIdentity(contributorIdentity);
  const notifications = await actor.listNotifications();
  const archiveNotifs = archiveNotifications(notifications);
  expect(archiveNotifs).toHaveLength(1);
  expect(archiveNotifs[0]).toMatchObject({
    notificationType: { ArchiveApproved: null },
    recipient: CONTRIBUTOR,
  });
  expect(researchNotifications(notifications)).toEqual([]);
});

it("rejects an ordinary archive item with exactly one ArchiveRejected notification", async () => {
  const setup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const actor = setup.actor;
  await registerApprovedContributor(actor);

  const item = await submitOrdinaryArchiveItem(actor, "Ordinary rejected letter");

  actor.setIdentity(adminIdentity);
  const rejected = await actor.rejectArchiveItem(item.id);
  expect(rejected).toEqual([
    expect.objectContaining({ id: item.id, status: { Rejected: null } }),
  ]);

  // The rejected item is neither pending nor approved.
  const pending = await actor.listPendingArchiveItems();
  expect(pending.find((i) => i.id === item.id)).toBeUndefined();
  const archive = await actor.listApprovedArchiveItems();
  expect(archive.find((i) => i.id === item.id)).toBeUndefined();

  // Exactly one ArchiveRejected notification, and no Research notification.
  actor.setIdentity(contributorIdentity);
  const notifications = await actor.listNotifications();
  const archiveNotifs = archiveNotifications(notifications);
  expect(archiveNotifs).toHaveLength(1);
  expect(archiveNotifs[0]).toMatchObject({
    notificationType: { ArchiveRejected: null },
    recipient: CONTRIBUTOR,
  });
  expect(researchNotifications(notifications)).toEqual([]);
});

// ---------------------------------------------------------------------------
// 4. A research upload emits exactly one ResearchSubmission notification and no
//    Archive notification.
// ---------------------------------------------------------------------------

it("emits exactly one ResearchSubmission notification on a research upload", async () => {
  const setup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const actor = setup.actor;
  await registerApprovedContributor(actor);

  actor.setIdentity(contributorIdentity);
  await actor.createSourceWithUpload(
    "Notification census",
    { CensusCitation: null },
    "A research upload that should notify the contributor.",
    "application/pdf",
    blob,
    ["census"],
    "1900",
    [1900n],
    ["julia"],
    { FamilyOnly: null },
    { Standard: null },
    [],
    "notification-census.pdf",
  );

  const notifications = await actor.listNotifications();
  const submission = notifications.filter(
    (n) => "ResearchSubmission" in n.notificationType,
  );
  expect(submission).toHaveLength(1);
  expect(submission[0]).toMatchObject({
    recipient: CONTRIBUTOR,
    notificationType: { ResearchSubmission: null },
    message: "Your research submission is awaiting Family Steward review.",
    read: false,
  });
  // The upload itself must not emit an Archive review notification.
  expect(archiveNotifications(notifications)).toEqual([]);
});

// ---------------------------------------------------------------------------
// 5. listPendingArchiveItems remains Steward-gated.
// ---------------------------------------------------------------------------

it("keeps listPendingArchiveItems gated to Family Stewards", async () => {
  const setup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const actor = setup.actor;
  await registerApprovedContributor(actor);

  await submitOrdinaryArchiveItem(actor, "Gated pending letter");

  // A signed-in non-steward cannot list pending items.
  actor.setIdentity(contributorIdentity);
  await expect(actor.listPendingArchiveItems()).rejects.toThrow();

  // An anonymous caller is also rejected.
  const anonymousActor = pic!.createActor<_SERVICE>(idlFactory, setup.canisterId);
  await expect(anonymousActor.listPendingArchiveItems()).rejects.toThrow();

  // The steward can.
  actor.setIdentity(adminIdentity);
  await expect(actor.listPendingArchiveItems()).resolves.toBeInstanceOf(Array);
});
