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
// Cover for the accepted persisted archive media metadata + archive review
// notification change, driven against the real canister.
//
// The frontend suite mocks the actor, so the persisted fields and the
// notification side effects can only be asserted here. This file covers:
//
//   A. submitArchiveItem persists the validated MIME type and the sanitized
//      filename on the ArchiveItem, and the stored blob is unchanged.
//   B. Approving a pending item creates exactly one ArchiveApproved
//      notification for the contributor, containing the item title.
//   C. Rejecting a pending item creates exactly one ArchiveRejected
//      notification for the contributor, containing the item title.
//   D. Repeated approve/reject calls on an already-reviewed item create no
//      duplicate notifications.
//   E. An unrelated user receives no archive review notification.
//   F. A rejected record is retained (not deleted): it leaves the pending and
//      approved sets and a repeated reject returns null.
//
// The canister is seeded once per test: ADMIN is the first caller to
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

// An unrelated signed-in caller that is never the contributor of any item.
const unrelatedIdentity = createIdentity("archive-review-unrelated-seed");

async function setupRoles(): Promise<{
  actor: _SERVICE;
  canisterId: ReturnType<typeof createIdentity>["getPrincipal"];
}> {
  const setup = await pic!.setupCanister<_SERVICE>({
    idlFactory,
    wasm: BACKEND_WASM,
  });
  const actor = setup.actor;

  await registerApprovedContributor(actor);

  // Register the unrelated caller so it is a signed-in user (not anonymous).
  actor.setIdentity(unrelatedIdentity);
  await actor._initialize_access_control();

  return { actor, canisterId: setup.canisterId };
}

/**
 * Filters a notification list down to the archive review types. The
 * contributor's approved-family onboarding also creates profile-claim
 * notifications, so archive-review assertions must not count those.
 */
function archiveReviewNotifications(
  notifications: Array<{ notificationType: unknown }>,
): Array<{ notificationType: unknown }> {
  return notifications.filter(
    (n) =>
      "ArchiveApproved" in (n.notificationType as object) ||
      "ArchiveRejected" in (n.notificationType as object),
  );
}

/** Submits one pending archive item as CONTRIBUTOR and returns it. */
async function submitAsContributor(
  actor: _SERVICE,
  title: string,
  mimeType: string,
  filename: string,
) {
  actor.setIdentity(contributorIdentity);
  return actor.submitArchiveItem(
    title,
    "A letter from 1924.",
    { Document: null },
    mimeType,
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
    filename,
  );
}

// ---------------------------------------------------------------------------
// A. Persisted upload metadata.
// ---------------------------------------------------------------------------

it("persists the validated MIME type and sanitized filename on submitArchiveItem", async () => {
  const { actor } = await setupRoles();

  const item = await submitAsContributor(
    actor,
    "Persisted metadata letter",
    "application/pdf",
    "persisted-metadata.pdf",
  );

  // The returned record carries the persisted fields.
  expect(item).toMatchObject({
    title: "Persisted metadata letter",
    mimeType: ["application/pdf"],
    filename: ["persisted-metadata.pdf"],
    status: { Pending: null },
  });

  // The persisted fields survive the round-trip through the pending list, so
  // the detail view can resolve the preview type without the blob metadata.
  actor.setIdentity(adminIdentity);
  const pending = await actor.listPendingArchiveItems();
  const stored = pending.find((i) => i.id === item.id);
  expect(stored).toMatchObject({
    mimeType: ["application/pdf"],
    filename: ["persisted-metadata.pdf"],
  });
  // The stored blob reference is unchanged (the original bytes are preserved).
  expect(stored?.blob).toEqual(item.blob);
});

// ---------------------------------------------------------------------------
// B/C. Approve and reject notifications.
// ---------------------------------------------------------------------------

it("creates exactly one ArchiveApproved notification for the contributor on approval", async () => {
  const { actor } = await setupRoles();

  const item = await submitAsContributor(
    actor,
    "Approved letter",
    "application/pdf",
    "approved-letter.pdf",
  );

  // The contributor has no archive-review notification before the review.
  actor.setIdentity(contributorIdentity);
  expect(
    archiveReviewNotifications(await actor.listNotifications()),
  ).toEqual([]);

  // The steward approves the pending item.
  actor.setIdentity(adminIdentity);
  const approved = await actor.approveArchiveItem(item.id);
  expect(approved).toEqual([
    expect.objectContaining({ id: item.id, status: { Approved: null } }),
  ]);

  // The contributor receives exactly one ArchiveApproved notification whose
  // message names the item title.
  actor.setIdentity(contributorIdentity);
  const notifications = archiveReviewNotifications(
    await actor.listNotifications(),
  );
  expect(notifications).toHaveLength(1);
  expect(notifications[0]).toMatchObject({
    notificationType: { ArchiveApproved: null },
    recipient: contributorIdentity.getPrincipal(),
    read: false,
  });
  expect(notifications[0].message).toContain("Approved letter");
  expect(notifications[0].message).toContain("was approved");
});

it("creates exactly one ArchiveRejected notification for the contributor on rejection", async () => {
  const { actor } = await setupRoles();

  const item = await submitAsContributor(
    actor,
    "Rejected letter",
    "application/pdf",
    "rejected-letter.pdf",
  );

  actor.setIdentity(adminIdentity);
  const rejected = await actor.rejectArchiveItem(item.id);
  expect(rejected).toEqual([
    expect.objectContaining({ id: item.id, status: { Rejected: null } }),
  ]);

  actor.setIdentity(contributorIdentity);
  const notifications = archiveReviewNotifications(
    await actor.listNotifications(),
  );
  expect(notifications).toHaveLength(1);
  expect(notifications[0]).toMatchObject({
    notificationType: { ArchiveRejected: null },
    recipient: contributorIdentity.getPrincipal(),
    read: false,
  });
  expect(notifications[0].message).toContain("Rejected letter");
  expect(notifications[0].message).toContain("was not approved");
});

// ---------------------------------------------------------------------------
// D. Repeated calls create no duplicates.
// ---------------------------------------------------------------------------

it("creates no duplicate notification on a repeated approve call", async () => {
  const { actor } = await setupRoles();

  const item = await submitAsContributor(
    actor,
    "Repeated approve letter",
    "application/pdf",
    "repeated-approve.pdf",
  );

  actor.setIdentity(adminIdentity);
  await actor.approveArchiveItem(item.id);
  // A second approve on an already-approved item is a no-op: it returns null
  // and must not create a second notification.
  await expect(actor.approveArchiveItem(item.id)).resolves.toEqual([]);

  actor.setIdentity(contributorIdentity);
  const notifications = archiveReviewNotifications(await actor.listNotifications());
  expect(notifications).toHaveLength(1);
  expect(notifications[0].notificationType).toEqual({ ArchiveApproved: null });
});

it("creates no duplicate notification on a repeated reject call", async () => {
  const { actor } = await setupRoles();

  const item = await submitAsContributor(
    actor,
    "Repeated reject letter",
    "application/pdf",
    "repeated-reject.pdf",
  );

  actor.setIdentity(adminIdentity);
  await actor.rejectArchiveItem(item.id);
  await expect(actor.rejectArchiveItem(item.id)).resolves.toEqual([]);

  actor.setIdentity(contributorIdentity);
  const notifications = archiveReviewNotifications(await actor.listNotifications());
  expect(notifications).toHaveLength(1);
  expect(notifications[0].notificationType).toEqual({ ArchiveRejected: null });
});

// ---------------------------------------------------------------------------
// E. Only the contributor is notified.
// ---------------------------------------------------------------------------

it("does not notify an unrelated user about an archive review", async () => {
  const { actor } = await setupRoles();

  const item = await submitAsContributor(
    actor,
    "Contributor-only letter",
    "application/pdf",
    "contributor-only.pdf",
  );

  actor.setIdentity(adminIdentity);
  await actor.approveArchiveItem(item.id);

  // The unrelated signed-in caller has no notification.
  actor.setIdentity(unrelatedIdentity);
  await expect(actor.listNotifications()).resolves.toEqual([]);

  // The contributor is the only recipient.
  actor.setIdentity(contributorIdentity);
  const notifications = archiveReviewNotifications(await actor.listNotifications());
  expect(notifications).toHaveLength(1);
  expect(notifications[0].recipient).toEqual(contributorIdentity.getPrincipal());
});

// ---------------------------------------------------------------------------
// F. Rejected records are retained, not deleted.
// ---------------------------------------------------------------------------

it("retains a rejected record instead of deleting it", async () => {
  const { actor } = await setupRoles();

  const item = await submitAsContributor(
    actor,
    "Retained rejection",
    "application/pdf",
    "retained-rejection.pdf",
  );

  actor.setIdentity(adminIdentity);
  await actor.rejectArchiveItem(item.id);

  // The rejected item is neither pending nor approved.
  const pending = await actor.listPendingArchiveItems();
  expect(pending.find((i) => i.id === item.id)).toBeUndefined();
  const approved = await actor.listApprovedArchiveItems();
  expect(approved.find((i) => i.id === item.id)).toBeUndefined();

  // A repeated reject returns null because the record still exists in a
  // non-pending state — it was not deleted and re-created.
  await expect(actor.rejectArchiveItem(item.id)).resolves.toEqual([]);
  // The record is not silently resurrected into the archive either.
  await expect(actor.approveArchiveItem(item.id)).resolves.toEqual([]);
});
