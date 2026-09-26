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
// Tenancy 1C-D5-A — Notification default-family characterization.
//
// The requested change gives every Notification a `familyId` field, adds
// canonical family-scoped Notification endpoints, and keeps the existing
// no-familyId Notification endpoints as thin TEMPORARY wrappers delegating to
// the canonical methods with DEFAULT_FAMILY_ID ("norwood").
//
// This file freezes the OBSERVABLE default-family (Norwood) behavior of the
// legacy no-familyId Notification endpoints, which the change must preserve
// through those wrappers. It deliberately does NOT freeze:
//
//   * the absence of a `familyId` field on Notification — the change adds one,
//     so asserting its absence would freeze the very thing being changed;
//   * the exact Notification record shape — the change adds a field, so only
//     the observable fields and read transitions are asserted, never the full
//     record;
//   * the legacy endpoints as the only implementation — the change makes them
//     thin wrappers over canonical family-scoped methods, and this file must
//     keep passing across that refactor;
//   * the exact wording of any notification message — the change must not alter
//     notification wording, but this file asserts only the type and recipient,
//     not the text.
//
// What it does freeze is the behavior a default-family user observes today and
// must keep observing:
//
//   1. a Norwood action (an approved contributor's Research upload) creates a
//      `#ResearchSubmission` notification addressed to that contributor, and
//      legacy `listNotifications()` surfaces it;
//   2. legacy `listNotifications()` returns only the caller's own
//      notifications, newest first, and an unrelated caller sees none;
//   3. legacy `markNotificationRead(id)` marks the caller's notification read
//      and returns it; a repeated call is idempotent; an unknown id returns
//      null;
//   4. the unread count and unread listing reflect the read transition;
//   5. the canonical family-scoped Norwood read agrees with the legacy read.
//
// The frontend suite mocks the actor, so none of this is visible there. This
// file installs the app's own compiled wasm and drives the real public API.
//
// Coverage limit this file cannot close: the family-boundary behavior of the
// canonical `*ForFamily` endpoints is covered by the sibling
// `notification-family-scope.cover.test.ts`; this file is the default-family
// baseline it must not disturb.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

const NORWOOD = "norwood";

let pic: PocketIc | undefined;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
});

afterAll(async () => {
  await pic?.tearDown();
});

// An unrelated signed-in caller that is never the recipient of the contributor's
// notifications.
const unrelatedIdentity = createIdentity("notification-default-unrelated-seed");

interface Seeded {
  actor: _SERVICE;
  canisterId: ReturnType<typeof createIdentity>["getPrincipal"];
}

/**
 * A fresh canister with ADMIN as the Norwood Steward, CONTRIBUTOR as an
 * approved Norwood member, and an unrelated signed-in caller. Each test seeds
 * its own canister so no test depends on the order another ran in.
 */
async function setupNorwood(): Promise<Seeded> {
  const setup = await pic!.setupCanister<_SERVICE>({
    idlFactory,
    wasm: BACKEND_WASM,
  });
  const actor = setup.actor;

  await registerApprovedContributor(actor);

  actor.setIdentity(unrelatedIdentity);
  await actor._initialize_access_control();

  return { actor, canisterId: setup.canisterId };
}

/**
 * Uploads a research source file into Norwood as the currently-set caller. This
 * is the default-family Research action that creates a `#ResearchSubmission`
 * notification for the contributor.
 */
async function uploadNorwoodSource(
  actor: _SERVICE,
  title: string,
): Promise<{ sourceId: bigint; archiveItemId: bigint }> {
  const result = await actor.createSourceWithUploadForFamily(
    NORWOOD,
    title,
    { CensusCitation: null },
    "A Norwood research source.",
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
    throw new Error(
      `createSourceWithUploadForFamily failed: ${JSON.stringify(result)}`,
    );
  }
  return {
    sourceId: result.ok.source.id,
    archiveItemId: result.ok.archiveItem.id,
  };
}

/** Filters a notification list down to the Research submission type. */
function researchNotifications(
  notifications: Array<{ notificationType: unknown }>,
): Array<{ notificationType: unknown }> {
  return notifications.filter(
    (n) => "ResearchSubmission" in (n.notificationType as object),
  );
}

// ---------------------------------------------------------------------------
// (1) A Norwood action creates a notification the legacy read surfaces.
// ---------------------------------------------------------------------------

it("surfaces a Norwood Research notification through the legacy listNotifications", async () => {
  const { actor } = await setupNorwood();

  actor.setIdentity(contributorIdentity);
  await uploadNorwoodSource(actor, "Norwood baseline source");

  const notifications = await actor.listNotifications();
  const research = researchNotifications(notifications);
  expect(research).toHaveLength(1);
  expect(research[0]).toMatchObject({
    recipient: contributorIdentity.getPrincipal(),
    notificationType: { ResearchSubmission: null },
    read: false,
  });
});

// ---------------------------------------------------------------------------
// (2) The legacy read returns only the caller's own notifications.
// ---------------------------------------------------------------------------

it("returns only the caller's own notifications from the legacy read", async () => {
  const { actor } = await setupNorwood();

  actor.setIdentity(contributorIdentity);
  await uploadNorwoodSource(actor, "Contributor-only source");

  // The unrelated signed-in caller sees none of the contributor's
  // notifications.
  actor.setIdentity(unrelatedIdentity);
  await expect(actor.listNotifications()).resolves.toEqual([]);

  // The contributor sees their own.
  actor.setIdentity(contributorIdentity);
  const notifications = await actor.listNotifications();
  expect(notifications.length).toBeGreaterThan(0);
  expect(
    notifications.every(
      (n) =>
        n.recipient.toText() === contributorIdentity.getPrincipal().toText(),
    ),
  ).toBe(true);
});

// ---------------------------------------------------------------------------
// (3) Legacy markNotificationRead marks the caller's notification read.
// ---------------------------------------------------------------------------

it("marks the caller's notification read through the legacy markNotificationRead", async () => {
  const { actor } = await setupNorwood();

  actor.setIdentity(contributorIdentity);
  await uploadNorwoodSource(actor, "Mark-read source");

  const before = researchNotifications(await actor.listNotifications());
  expect(before).toHaveLength(1);
  const target = before[0] as { id: bigint; read: boolean };
  expect(target.read).toBe(false);

  // The legacy mark returns the updated notification.
  const marked = await actor.markNotificationRead(target.id);
  expect(marked).toHaveLength(1);
  expect(marked[0]).toMatchObject({ id: target.id, read: true });

  // A repeated call is idempotent.
  const markedAgain = await actor.markNotificationRead(target.id);
  expect(markedAgain).toHaveLength(1);
  expect(markedAgain[0]).toMatchObject({ id: target.id, read: true });

  // An unknown id returns null.
  await expect(actor.markNotificationRead(9999n)).resolves.toEqual([]);
});

it("reflects the read transition in the unread count and unread listing", async () => {
  const { actor } = await setupNorwood();

  actor.setIdentity(contributorIdentity);
  await uploadNorwoodSource(actor, "Unread-count source");

  const unreadBefore = await actor.listUnreadNotificationsForFamily(NORWOOD);
  expect(unreadBefore.length).toBeGreaterThan(0);
  const target = unreadBefore[0];

  await actor.markNotificationRead(target.id);

  const unreadAfter = await actor.listUnreadNotificationsForFamily(NORWOOD);
  expect(unreadAfter.find((n) => n.id === target.id)).toBeUndefined();
  expect(await actor.unreadNotificationCountForFamily(NORWOOD)).toBe(
    BigInt(unreadAfter.length),
  );
});

// ---------------------------------------------------------------------------
// (4) The canonical family-scoped Norwood read agrees with the legacy read.
// ---------------------------------------------------------------------------

it("agrees with the canonical family-scoped Norwood read", async () => {
  const { actor } = await setupNorwood();

  actor.setIdentity(contributorIdentity);
  await uploadNorwoodSource(actor, "Agreement source");

  const legacy = await actor.listNotifications();
  const canonical = await actor.listNotificationsForFamily(NORWOOD);

  expect(canonical.map((n) => n.id).sort()).toEqual(
    legacy.map((n) => n.id).sort(),
  );
  expect(canonical.every((n) => n.familyId === NORWOOD)).toBe(true);
});

// ---------------------------------------------------------------------------
// (5) The legacy read never surfaces a non-default-family notification.
// ---------------------------------------------------------------------------

it("does not surface a non-default-family notification through the legacy read", async () => {
  const { actor } = await setupNorwood();

  // The unrelated caller creates a profile in a test-only family, which writes
  // a notification in that family only.
  actor.setIdentity(unrelatedIdentity);
  const created = await actor.createMyselfForFamily(
    "test-family-baseline",
    "Baseline Family Member",
  );
  expect("ok" in created).toBe(true);

  // The legacy no-familyId read returns nothing: the notification belongs to
  // the test-only family, not to Norwood.
  await expect(actor.listNotifications()).resolves.toEqual([]);

  // The canonical family-scoped read for that family surfaces it.
  const familyScoped = await actor.listNotificationsForFamily(
    "test-family-baseline",
  );
  expect(familyScoped.length).toBeGreaterThan(0);
  expect(familyScoped.every((n) => n.familyId === "test-family-baseline")).toBe(
    true,
  );
});
