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
// Tenancy 1C-D5-A — family-scoped in-app Notifications (real-canister cover).
//
// The accepted behavior is that every Notification carries a `familyId` and
// that the canonical `*ForFamily` notification endpoints enforce the family
// boundary: a notification created by a Family A action is visible only under
// Family A and never under Family B; a `notificationId` alone never crosses the
// boundary; the unread count is family-scoped; the same recipient account can
// hold separate Family A and Family B notifications; marking a Family A
// notification read never changes the read state of the same recipient's
// Family B notification; and the legacy no-familyId endpoints still work
// unchanged through the TEMPORARY wrappers delegating with DEFAULT_FAMILY_ID
// ("norwood").
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
// Notification creation paths exercised here:
//
//   * `createMyselfForFamily(familyId, name)` writes a `#ProfileClaimReviewed`
//     notification for the caller in `familyId` (ownership.mo). It works for
//     any family, so it is the primary way a Family A / Family B notification
//     is produced through the public API.
//   * `createSourceWithUploadForFamily(familyId, ...)` writes a
//     `#ResearchSubmission` notification for the caller in `familyId`
//     (archive-research-board-notifications-api.mo). It requires only approved
//     family membership, so it is the family-scoped Research action whose
//     notification familyId is asserted below.
//
// Coverage limits this file cannot close, stated plainly:
//
//   * There is no public endpoint that creates a Steward of a non-default
//     family (`claimSteward` writes `familyId = "norwood"`), so the
//     Steward-gated Archive approve/reject notification path can only be driven
//     in Norwood. The Archive notification familyId is therefore asserted in
//     the default-family baseline file, not here.
//   * The Story and Recipe review flows emit no notifications (their
//     NotificationType variants do not exist), so "Story/Recipe actions create
//     notifications" is not a behavior this build has; the family-scoped
//     Research and profile-claim creation paths are the ones exercised.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";
const NORWOOD = "norwood";

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
  // caller an approved member of the family. It also writes a
  // `#ProfileClaimReviewed` notification for the caller in that family.
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
 * Uploads a research source file into `familyId` as the currently-set caller.
 * This is a family-scoped Research action that creates a `#ResearchSubmission`
 * notification for the caller in `familyId`.
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
    throw new Error(
      `createSourceWithUploadForFamily failed: ${JSON.stringify(result)}`,
    );
  }
  return {
    sourceId: result.ok.source.id,
    archiveItemId: result.ok.archiveItem.id,
  };
}

// ---------------------------------------------------------------------------
// (1) Read isolation: a Family A notification appears under Family A and never
//     under Family B.
// ---------------------------------------------------------------------------

it("shows a Family A notification in listNotificationsForFamily(A) and not in listNotificationsForFamily(B)", async () => {
  const { actor } = await setupFamilies();

  // MEMBER_A's profile creation in Family A produced a Family A notification.
  actor.setIdentity(memberAIdentity);
  const familyA = await actor.listNotificationsForFamily(FAMILY_A);
  expect(familyA.length).toBeGreaterThan(0);
  expect(familyA.every((n) => n.familyId === FAMILY_A)).toBe(true);
  expect(
    familyA.every(
      (n) => n.recipient.toText() === memberAIdentity.getPrincipal().toText(),
    ),
  ).toBe(true);

  // The same caller's Family B read is empty: the Family A notification never
  // appears under Family B.
  expect(await actor.listNotificationsForFamily(FAMILY_B)).toEqual([]);
});

it("does not resolve a Family A notification id under Family B", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const familyA = await actor.listNotificationsForFamily(FAMILY_A);
  expect(familyA.length).toBeGreaterThan(0);
  const familyANotificationId = familyA[0].id;

  // A notificationId alone does not cross the boundary: the lookup behaves like
  // not-found rather than leaking the record.
  await expect(
    actor.getNotificationForFamily(FAMILY_B, familyANotificationId),
  ).resolves.toEqual([]);

  // The same id resolves under its own family.
  const resolved = await actor.getNotificationForFamily(
    FAMILY_A,
    familyANotificationId,
  );
  expect(resolved).toHaveLength(1);
  expect(resolved[0]).toMatchObject({
    id: familyANotificationId,
    familyId: FAMILY_A,
  });
});

it("does not return another caller's notification in the same family", async () => {
  const { actor } = await setupFamilies();

  // MEMBER_A's Family A notification is not visible to MEMBER_B, who is not a
  // Family A member at all.
  actor.setIdentity(memberAIdentity);
  const familyA = await actor.listNotificationsForFamily(FAMILY_A);
  expect(familyA.length).toBeGreaterThan(0);

  actor.setIdentity(memberBIdentity);
  expect(await actor.listNotificationsForFamily(FAMILY_A)).toEqual([]);
});

// ---------------------------------------------------------------------------
// (2) Unread count isolation: a Family B unread notification never inflates a
//     Family A count.
// ---------------------------------------------------------------------------

it("excludes Family B unread notifications from unreadNotificationCountForFamily(A)", async () => {
  const { actor } = await setupFamilies();

  // MEMBER_A holds one unread Family A notification and one unread Family B
  // notification (a profile in each family).
  actor.setIdentity(memberAIdentity);
  const createdB = await actor.createMyselfForFamily(FAMILY_B, "Family A Member in B");
  expect("ok" in createdB).toBe(true);

  const countA = await actor.unreadNotificationCountForFamily(FAMILY_A);
  const countB = await actor.unreadNotificationCountForFamily(FAMILY_B);
  expect(countA).toBe(1n);
  expect(countB).toBe(1n);

  // The unread listing agrees with the count and is family-scoped.
  const unreadA = await actor.listUnreadNotificationsForFamily(FAMILY_A);
  expect(unreadA).toHaveLength(1);
  expect(unreadA[0].familyId).toBe(FAMILY_A);
  expect(unreadA[0].read).toBe(false);

  const unreadB = await actor.listUnreadNotificationsForFamily(FAMILY_B);
  expect(unreadB).toHaveLength(1);
  expect(unreadB[0].familyId).toBe(FAMILY_B);
});

it("counts only the caller's own unread notifications in the family", async () => {
  const { actor } = await setupFamilies();

  // MEMBER_B's Family B notification does not appear in MEMBER_A's Family B
  // count, even though both are in Family B.
  actor.setIdentity(memberAIdentity);
  expect(await actor.unreadNotificationCountForFamily(FAMILY_B)).toBe(0n);

  actor.setIdentity(memberBIdentity);
  expect(await actor.unreadNotificationCountForFamily(FAMILY_B)).toBe(1n);
});

// ---------------------------------------------------------------------------
// (3) The same recipient account holds separate Family A and Family B
//     notifications, each visible only in its own family.
// ---------------------------------------------------------------------------

it("lets the same recipient hold separate Family A and Family B notifications", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const createdB = await actor.createMyselfForFamily(FAMILY_B, "Family A Member in B");
  expect("ok" in createdB).toBe(true);

  const familyA = await actor.listNotificationsForFamily(FAMILY_A);
  const familyB = await actor.listNotificationsForFamily(FAMILY_B);

  expect(familyA).toHaveLength(1);
  expect(familyB).toHaveLength(1);
  expect(familyA[0].familyId).toBe(FAMILY_A);
  expect(familyB[0].familyId).toBe(FAMILY_B);
  // Distinct records, not the same notification surfaced twice.
  expect(familyA[0].id).not.toBe(familyB[0].id);
  expect(familyA[0].recipient).toEqual(memberAIdentity.getPrincipal());
  expect(familyB[0].recipient).toEqual(memberAIdentity.getPrincipal());
});

// ---------------------------------------------------------------------------
// (4) Mutation isolation: marking a Family A notification read never changes
//     the same recipient's Family B notification.
// ---------------------------------------------------------------------------

it("does not change a Family B notification's read state when marking a Family A notification read", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const createdB = await actor.createMyselfForFamily(FAMILY_B, "Family A Member in B");
  expect("ok" in createdB).toBe(true);

  const familyA = await actor.listNotificationsForFamily(FAMILY_A);
  const familyB = await actor.listNotificationsForFamily(FAMILY_B);
  expect(familyA).toHaveLength(1);
  expect(familyB).toHaveLength(1);

  // Mark the Family A notification read.
  const marked = await actor.markNotificationReadForFamily(FAMILY_A, familyA[0].id);
  expect(marked).toHaveLength(1);
  expect(marked[0]).toMatchObject({ id: familyA[0].id, read: true });

  // The Family B notification is untouched and still unread.
  const familyBAfter = await actor.listNotificationsForFamily(FAMILY_B);
  expect(familyBAfter).toHaveLength(1);
  expect(familyBAfter[0]).toMatchObject({ id: familyB[0].id, read: false });
  expect(await actor.unreadNotificationCountForFamily(FAMILY_B)).toBe(1n);

  // A Family A id passed to the Family B mutation is a no-op.
  await expect(
    actor.markNotificationReadForFamily(FAMILY_B, familyA[0].id),
  ).resolves.toEqual([]);
  expect(await actor.unreadNotificationCountForFamily(FAMILY_B)).toBe(1n);
});

it("marks only the caller's notifications within the requested family with markAllNotificationsReadForFamily", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const createdB = await actor.createMyselfForFamily(FAMILY_B, "Family A Member in B");
  expect("ok" in createdB).toBe(true);

  // Marking all of Family A read leaves Family B unread.
  const markedA = await actor.markAllNotificationsReadForFamily(FAMILY_A);
  expect(markedA).toBe(1n);
  expect(await actor.unreadNotificationCountForFamily(FAMILY_A)).toBe(0n);
  expect(await actor.unreadNotificationCountForFamily(FAMILY_B)).toBe(1n);

  // Marking all of Family B read then clears the Family B notification.
  const markedB = await actor.markAllNotificationsReadForFamily(FAMILY_B);
  expect(markedB).toBe(1n);
  expect(await actor.unreadNotificationCountForFamily(FAMILY_B)).toBe(0n);
});

it("dismisses a notification only within its own family", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const createdB = await actor.createMyselfForFamily(FAMILY_B, "Family A Member in B");
  expect("ok" in createdB).toBe(true);

  const familyA = await actor.listNotificationsForFamily(FAMILY_A);
  const familyB = await actor.listNotificationsForFamily(FAMILY_B);
  expect(familyA).toHaveLength(1);
  expect(familyB).toHaveLength(1);

  // A Family A id passed to the Family B dismiss is a no-op.
  await expect(
    actor.dismissNotificationForFamily(FAMILY_B, familyA[0].id),
  ).resolves.toBe(false);
  expect(await actor.listNotificationsForFamily(FAMILY_B)).toHaveLength(1);

  // Dismissing under its own family removes it.
  await expect(
    actor.dismissNotificationForFamily(FAMILY_A, familyA[0].id),
  ).resolves.toBe(true);
  expect(await actor.listNotificationsForFamily(FAMILY_A)).toEqual([]);
});

// ---------------------------------------------------------------------------
// (5) Family-scoped Research action: the notification's familyId matches the
//     acting family.
// ---------------------------------------------------------------------------

it("creates a Research notification whose familyId matches the acting family", async () => {
  const { actor } = await setupFamilies();

  // A Family A Research upload creates a Family A ResearchSubmission
  // notification for the contributor.
  actor.setIdentity(memberAIdentity);
  await uploadSourceInto(actor, FAMILY_A, "Family A research upload");

  const familyA = await actor.listNotificationsForFamily(FAMILY_A);
  const researchA = familyA.filter(
    (n) => "ResearchSubmission" in n.notificationType,
  );
  expect(researchA).toHaveLength(1);
  expect(researchA[0]).toMatchObject({
    familyId: FAMILY_A,
    recipient: memberAIdentity.getPrincipal(),
    notificationType: { ResearchSubmission: null },
    read: false,
  });

  // The Family A Research notification never appears under Family B.
  expect(await actor.listNotificationsForFamily(FAMILY_B)).toEqual([]);

  // A Family B Research upload creates a Family B notification, not a Family A
  // one.
  actor.setIdentity(memberBIdentity);
  await uploadSourceInto(actor, FAMILY_B, "Family B research upload");

  const familyB = await actor.listNotificationsForFamily(FAMILY_B);
  const researchB = familyB.filter(
    (n) => "ResearchSubmission" in n.notificationType,
  );
  expect(researchB).toHaveLength(1);
  expect(researchB[0]).toMatchObject({
    familyId: FAMILY_B,
    recipient: memberBIdentity.getPrincipal(),
    notificationType: { ResearchSubmission: null },
  });

  // MEMBER_A's Family A listing is unchanged by the Family B action.
  actor.setIdentity(memberAIdentity);
  const familyAAfter = await actor.listNotificationsForFamily(FAMILY_A);
  expect(familyAAfter.filter((n) => "ResearchSubmission" in n.notificationType)).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// (6) Default Norwood compatibility: the legacy no-familyId notification
//     endpoints still work unchanged through the TEMPORARY wrappers delegating
//     with DEFAULT_FAMILY_ID.
// ---------------------------------------------------------------------------

it("keeps the legacy no-familyId notification endpoints working for the default family", async () => {
  const { actor } = await setupFamilies();

  // The Norwood Steward's own profile creation writes a Norwood notification.
  actor.setIdentity(adminIdentity);
  const created = await actor.createMyselfForFamily(NORWOOD, "Norwood Steward Profile");
  expect("ok" in created).toBe(true);

  // Legacy listNotifications returns the Norwood notification.
  const legacy = await actor.listNotifications();
  expect(legacy.length).toBeGreaterThan(0);
  expect(legacy.every((n) => n.familyId === NORWOOD)).toBe(true);
  expect(
    legacy.every(
      (n) => n.recipient.toText() === adminIdentity.getPrincipal().toText(),
    ),
  ).toBe(true);

  // The canonical family-scoped read agrees with the legacy read.
  const canonical = await actor.listNotificationsForFamily(NORWOOD);
  expect(canonical.map((n) => n.id).sort()).toEqual(legacy.map((n) => n.id).sort());

  // Legacy markNotificationRead marks the Norwood notification read.
  const target = legacy[0];
  const marked = await actor.markNotificationRead(target.id);
  expect(marked).toHaveLength(1);
  expect(marked[0]).toMatchObject({ id: target.id, familyId: NORWOOD, read: true });

  // The canonical family-scoped read observes the same read state.
  const canonicalAfter = await actor.listNotificationsForFamily(NORWOOD);
  const stored = canonicalAfter.find((n) => n.id === target.id);
  expect(stored?.read).toBe(true);
});

it("does not let the legacy no-familyId read surface a non-default-family notification", async () => {
  const { actor } = await setupFamilies();

  // MEMBER_A holds a Family A notification but no Norwood notification.
  actor.setIdentity(memberAIdentity);
  expect(await actor.listNotificationsForFamily(FAMILY_A)).not.toEqual([]);
  await expect(actor.listNotifications()).resolves.toEqual([]);
});
