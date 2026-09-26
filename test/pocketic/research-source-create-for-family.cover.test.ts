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
// Tenancy 1C — canonical non-upload Research Source creation
// (`createSourceForFamily`) — real-canister cover.
//
// The accepted behavior is that `createSourceForFamily(familyId, ...)` is the
// canonical non-upload Source creation path: it authorizes the caller for
// `familyId`, stores `SourceRecord.familyId = familyId`, writes the Research
// audit entry to `familyId`, scopes the submission notification to `familyId`,
// and refuses to link an Archive item that belongs to another family. The
// legacy `createSource(...)` remains a thin default-family compatibility
// wrapper with unchanged Norwood behavior.
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
// Coverage limits this file cannot close, stated plainly:
//
//   * There is no public endpoint that creates a Steward of a non-default
//     family (`claimSteward` writes `familyId = "norwood"`), so the
//     Steward-gated family-scoped reads (`getSourceForFamily`,
//     `listSourcesForFamily`, `getResearchAuditLogForFamily`) can only ever be
//     executed by the Norwood Steward. The positive Family A direction is
//     therefore driven through the approved-member creation path (which
//     `createSourceForFamily` accepts), and the Family A audit entry is proven
//     by its absence from the Norwood audit log the Steward can read.
//   * The canonical path's use of the requested `familyId` (rather than
//     `DEFAULT_FAMILY_ID`) is additionally pinned by the sibling
//     `research-source-create-for-family.static.test.ts`, which executes the
//     real Motoko source.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";
const NORWOOD = "norwood";

const STEWARD_MARKER =
  "Unauthorized: Only Family Stewards can perform this action";
const LINKED_ARCHIVE_MARKER =
  "Unauthorized: Linked archive item must belong to the same family";

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
// of the two test-only families. DUAL_MEMBER becomes an approved member of BOTH
// test families, so a single account's actions can be checked for separation.
const memberAIdentity = createIdentity("research-create-family-a-seed");
const memberBIdentity = createIdentity("research-create-family-b-seed");
const dualMemberIdentity = createIdentity("research-create-dual-member-seed");

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
 * Creates a non-upload Research Source in `familyId` as the currently-set
 * caller through the canonical `createSourceForFamily` endpoint and returns the
 * created SourceRecord.
 */
async function createSourceInFamily(
  actor: _SERVICE,
  familyId: string,
  title: string,
  archiveItemId: [] | [bigint] = [],
): Promise<{ id: bigint; familyId: string }> {
  const result = await actor.createSourceForFamily(
    familyId,
    title,
    { CensusCitation: null },
    `A research source in ${familyId}.`,
    archiveItemId,
  );
  if (!("ok" in result)) {
    throw new Error(`createSourceForFamily failed: ${JSON.stringify(result)}`);
  }
  return result.ok;
}

/** Submits a FamilyOnly document into `familyId` and returns its id. */
async function submitArchiveItemInto(
  actor: _SERVICE,
  familyId: string,
  title: string,
): Promise<bigint> {
  const item = await actor.submitArchiveItemForFamily(
    familyId,
    title,
    `A contribution into ${familyId}.`,
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
// (1) Positive Family A direction: an approved Family A member creates a
//     non-upload Source through the canonical endpoint, and the stored record
//     carries familyId A.
// ---------------------------------------------------------------------------

it("lets an approved Family A member create a Source whose familyId is A", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const source = await createSourceInFamily(actor, FAMILY_A, "Family A census");

  expect(source.familyId).toBe(FAMILY_A);
  expect(source.id).toEqual(expect.any(BigInt));

  // The stored record is retrievable through the family-scoped read by the
  // Norwood Steward only under its own family; the Family A id does not resolve
  // under Norwood.
  actor.setIdentity(adminIdentity);
  await expect(actor.getSourceForFamily(NORWOOD, source.id)).resolves.toEqual([]);
});

it("records the caller as the contributor of the created Source", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const source = await createSourceInFamily(actor, FAMILY_A, "Contributor check");

  // The canonical path records the real caller, not the canister principal.
  const result = await actor.createSourceForFamily(
    FAMILY_A,
    "Contributor check 2",
    { ResearchNotes: null },
    "Another source.",
    [],
  );
  expect("ok" in result).toBe(true);
  if ("ok" in result) {
    expect(result.ok.contributor).toEqual(memberAIdentity.getPrincipal());
    expect(result.ok.familyId).toBe(FAMILY_A);
  }
  expect(source.familyId).toBe(FAMILY_A);
});

// ---------------------------------------------------------------------------
// (2) The Family A Source's audit entry is written to Family A, not to the
//     default family. The only family-scoped audit read the public API can
//     execute is the Norwood Steward's Norwood read, so the observable proof is
//     that the Family A action never appears in the Norwood log.
// ---------------------------------------------------------------------------

it("does not leak a Family A Source creation into the Norwood audit log", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  await createSourceInFamily(actor, FAMILY_A, "Family A audited source");

  // The Norwood Steward's Norwood read contains no Family A entry.
  actor.setIdentity(adminIdentity);
  const norwoodAudit = await actor.getResearchAuditLogForFamily(NORWOOD);
  expect(norwoodAudit.every((e) => e.familyId === NORWOOD)).toBe(true);
  expect(
    norwoodAudit.find((e) => e.summary.includes("Family A audited source")),
  ).toBeUndefined();

  // The legacy read agrees with the Norwood family-scoped read.
  const legacyAudit = await actor.getResearchAuditLog();
  expect(
    legacyAudit.find((e) => e.summary.includes("Family A audited source")),
  ).toBeUndefined();
});

it("writes a Norwood Source creation's audit entry to the default family", async () => {
  const { actor } = await setupFamilies();

  // A Norwood contributor creates a source through the canonical endpoint with
  // the default family; the audit entry is readable by the Norwood Steward.
  actor.setIdentity(contributorIdentity);
  await createSourceInFamily(actor, NORWOOD, "Norwood canonical source");

  actor.setIdentity(adminIdentity);
  const norwoodAudit = await actor.getResearchAuditLogForFamily(NORWOOD);
  const entry = norwoodAudit.find((e) =>
    e.summary.includes("Norwood canonical source"),
  );
  expect(entry).toBeDefined();
  expect(entry).toMatchObject({
    action: "SourceCreated",
    familyId: NORWOOD,
    actorId: contributorIdentity.getPrincipal(),
  });
});

// ---------------------------------------------------------------------------
// (3) The submission notification produced by the canonical non-upload Source
//     creation is scoped to the acting family.
// ---------------------------------------------------------------------------

it("scopes the Source creation notification to Family A", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  await createSourceInFamily(actor, FAMILY_A, "Family A notified source");

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

  // The Family A notification never appears under Family B.
  expect(await actor.listNotificationsForFamily(FAMILY_B)).toEqual([]);
});

// ---------------------------------------------------------------------------
// (4) Family B cannot create or read a Family A Source through Family B
//     context.
// ---------------------------------------------------------------------------

it("denies a Family B member creating a Source in Family A", async () => {
  const { actor } = await setupFamilies();

  // MEMBER_B is approved in B but not in A, so the canonical creation path
  // returns the not-authorized error rather than storing a record.
  actor.setIdentity(memberBIdentity);
  const result = await actor.createSourceForFamily(
    FAMILY_A,
    "Cross-family creation",
    { CensusCitation: null },
    "A member of B must not create in A.",
    [],
  );
  expect(result).toEqual({ err: { notAuthorized: null } });

  // Nothing was stored in Family A: the Norwood Steward's Norwood read is
  // unaffected, and the Family A member's own listing is empty of the title.
  actor.setIdentity(memberAIdentity);
  const familyANotifications = await actor.listNotificationsForFamily(FAMILY_A);
  expect(
    familyANotifications.find((n) =>
      "ResearchSubmission" in n.notificationType,
    ),
  ).toBeUndefined();
});

it("denies a Family B member reading a Family A Source through Family A context", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const source = await createSourceInFamily(actor, FAMILY_A, "Family A private source");

  // The family-scoped source reads are Steward-gated: an approved member of B
  // (who is not a Steward of A) is denied outright.
  actor.setIdentity(memberBIdentity);
  await expect(actor.getSourceForFamily(FAMILY_A, source.id)).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
  await expect(actor.listSourcesForFamily(FAMILY_A)).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
});

it("does not resolve a Family A Source id under Norwood", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const source = await createSourceInFamily(actor, FAMILY_A, "Boundary source");

  // The Norwood Steward cannot resolve the Family A id under Norwood: the
  // record belongs to another family, so the lookup behaves like not-found.
  actor.setIdentity(adminIdentity);
  await expect(actor.getSourceForFamily(NORWOOD, source.id)).resolves.toEqual([]);

  // The Norwood Steward is also denied the Family A read outright.
  await expect(actor.getSourceForFamily(FAMILY_A, source.id)).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
});

// ---------------------------------------------------------------------------
// (5) A related Archive reference from Family B cannot be attached to a Family
//     A Source, while a Family A reference can.
// ---------------------------------------------------------------------------

it("refuses to attach a Family B Archive item to a Family A Source", async () => {
  const { actor } = await setupFamilies();

  // MEMBER_B submits a Family B Archive item.
  actor.setIdentity(memberBIdentity);
  const itemB = await submitArchiveItemInto(actor, FAMILY_B, "Family B letter");

  // MEMBER_A cannot link the Family B item into a Family A Source: an
  // archiveItemId alone is never a tenant boundary.
  actor.setIdentity(memberAIdentity);
  await expect(
    actor.createSourceForFamily(
      FAMILY_A,
      "Cross-family link",
      { CensusCitation: null },
      "A Family A source must not link a Family B item.",
      [itemB],
    ),
  ).rejects.toThrow(new RegExp(LINKED_ARCHIVE_MARKER, "i"));
});

it("attaches a Family A Archive item to a Family A Source", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const itemA = await submitArchiveItemInto(actor, FAMILY_A, "Family A letter");
  const source = await createSourceInFamily(
    actor,
    FAMILY_A,
    "Family A linked source",
    [itemA],
  );

  expect(source.familyId).toBe(FAMILY_A);
  // The linked item is stored on the record.
  const result = await actor.createSourceForFamily(
    FAMILY_A,
    "Family A linked source 2",
    { CensusCitation: null },
    "Another linked source.",
    [itemA],
  );
  expect("ok" in result).toBe(true);
  if ("ok" in result) {
    expect(result.ok.archiveItemId).toEqual([itemA]);
    expect(result.ok.familyId).toBe(FAMILY_A);
  }
});

// ---------------------------------------------------------------------------
// (6) The same account participating in both families creates correctly
//     separated Source records.
// ---------------------------------------------------------------------------

it("separates a dual-family account's Source records per family", async () => {
  const { actor } = await setupFamilies();

  // The same identity becomes an approved member of both test families.
  actor.setIdentity(dualMemberIdentity);
  await actor._initialize_access_control();
  const createdA = await actor.createMyselfForFamily(FAMILY_A, "Dual Member A");
  expect("ok" in createdA).toBe(true);
  const createdB = await actor.createMyselfForFamily(FAMILY_B, "Dual Member B");
  expect("ok" in createdB).toBe(true);

  const sourceA = await createSourceInFamily(actor, FAMILY_A, "Dual Family A source");
  const sourceB = await createSourceInFamily(actor, FAMILY_B, "Dual Family B source");

  // Each record carries its own family, and the ids are distinct.
  expect(sourceA.familyId).toBe(FAMILY_A);
  expect(sourceB.familyId).toBe(FAMILY_B);
  expect(sourceA.id).not.toBe(sourceB.id);

  // The notifications are likewise separated per family.
  const notificationsA = await actor.listNotificationsForFamily(FAMILY_A);
  const notificationsB = await actor.listNotificationsForFamily(FAMILY_B);
  const researchA = notificationsA.filter(
    (n) => "ResearchSubmission" in n.notificationType,
  );
  const researchB = notificationsB.filter(
    (n) => "ResearchSubmission" in n.notificationType,
  );
  expect(researchA).toHaveLength(1);
  expect(researchB).toHaveLength(1);
  expect(researchA[0].familyId).toBe(FAMILY_A);
  expect(researchB[0].familyId).toBe(FAMILY_B);
  expect(researchA[0].id).not.toBe(researchB[0].id);

  // Neither action leaks into the Norwood audit log.
  actor.setIdentity(adminIdentity);
  const norwoodAudit = await actor.getResearchAuditLogForFamily(NORWOOD);
  expect(
    norwoodAudit.find((e) => e.summary.includes("Dual Family A source")),
  ).toBeUndefined();
  expect(
    norwoodAudit.find((e) => e.summary.includes("Dual Family B source")),
  ).toBeUndefined();
  expect(norwoodAudit.every((e) => e.familyId === NORWOOD)).toBe(true);
});

// ---------------------------------------------------------------------------
// (7) Existing Norwood `createSource(...)` behavior remains unchanged: it is a
//     thin default-family wrapper that stores familyId "norwood", writes a
//     Norwood audit entry, and resolves through the legacy reads.
// ---------------------------------------------------------------------------

it("keeps the legacy Norwood createSource behavior unchanged", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(contributorIdentity);
  const created = await actor.createSource(
    "Legacy Norwood source",
    { CensusCitation: null },
    "A legacy source.",
    [],
  );
  expect("ok" in created).toBe(true);
  if (!("ok" in created)) {
    throw new Error(`createSource failed: ${JSON.stringify(created)}`);
  }
  const source = created.ok;
  expect(source.familyId).toBe(NORWOOD);
  expect(source.contributor).toEqual(contributorIdentity.getPrincipal());

  // The legacy reads resolve it, and the family-scoped Norwood read agrees.
  actor.setIdentity(adminIdentity);
  const listed = await actor.listSources();
  expect(listed.find((s) => s.id === source.id)).toBeDefined();
  const fetched = await actor.getSource(source.id);
  expect(fetched).toHaveLength(1);
  expect(fetched[0]).toMatchObject({ id: source.id, familyId: NORWOOD });

  // The legacy creation wrote a Norwood audit entry.
  const audit = await actor.getResearchAuditLog();
  const entry = audit.find((e) => e.summary.includes("Legacy Norwood source"));
  expect(entry).toBeDefined();
  expect(entry).toMatchObject({ action: "SourceCreated", familyId: NORWOOD });

  // The legacy creation wrote a Norwood notification for the contributor.
  actor.setIdentity(contributorIdentity);
  const notifications = await actor.listNotifications();
  const research = notifications.filter(
    (n) => "ResearchSubmission" in n.notificationType,
  );
  expect(research).toHaveLength(1);
  expect(research[0]).toMatchObject({
    familyId: NORWOOD,
    recipient: contributorIdentity.getPrincipal(),
  });
});

it("keeps the legacy createSource denial for a non-member unchanged", async () => {
  const { actor } = await setupFamilies();

  // A signed-in caller with no approved Norwood membership is denied with the
  // not-authorized error, exactly as before the canonical path existed.
  const outsiderIdentity = createIdentity("research-create-outsider-seed");
  actor.setIdentity(outsiderIdentity);
  await actor._initialize_access_control();
  const result = await actor.createSource(
    "Outsider source",
    { CensusCitation: null },
    "An outsider must not create a Norwood source.",
    [],
  );
  expect(result).toEqual({ err: { notAuthorized: null } });
});
