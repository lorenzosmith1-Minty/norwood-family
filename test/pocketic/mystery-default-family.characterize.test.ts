import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";
import { BACKEND_WASM, adminIdentity, memberAIdentity, memberBIdentity } from "./lane-helpers";

// ---------------------------------------------------------------------------
// Tenancy — Mystery default-family characterization.
//
// The requested change gives the Mystery and MysteryContribution records a
// `familyId` field, adds canonical family-scoped Mystery endpoints (family
// listing, single-mystery read, contributions, pending contributions, a
// family-scoped submit, family-scoped approve/reject, and family-scoped
// researching/partially-resolved/resolved transitions), and keeps the existing
// no-familyId Mystery endpoints as thin TEMPORARY wrappers delegating to the
// canonical methods with DEFAULT_FAMILY_ID ("norwood").
//
// This file freezes the OBSERVABLE default-family (Norwood) behavior of the
// legacy no-familyId Mystery endpoints, which the change must preserve through
// those wrappers. It deliberately does NOT freeze:
//
//   * the absence of a `familyId` field on Mystery / MysteryContribution — the
//     change adds one, so asserting its absence would freeze the very thing
//     being changed;
//   * the exact Mystery / MysteryContribution record shape — the change adds a
//     field, so only the submitted fields and status transitions are asserted,
//     never the full record;
//   * the legacy endpoints as the only implementation — the change makes them
//     thin wrappers over canonical family-scoped methods, and this file must
//     keep passing across that refactor;
//   * the exact denial wording of the legacy member gate — the change routes it
//     through the canonical family gate, so only the fact of denial is frozen.
//
// What it does freeze is the behavior a default-family user observes today and
// must keep observing:
//
//   1. createCanonicalMystery stores the submitted fields with the requested
//      status and the caller as contributor, and listMysteries surfaces it;
//   2. submitMysteryContribution persists the submitted fields with #Pending
//      status and the caller as contributor, and listPendingMysteryContributions
//      surfaces it to a Steward;
//   3. reviewMysteryContribution moves a pending contribution to #Approved or
//      #Rejected, records the reviewer, and returns null for an unknown id and
//      for a contribution that is not pending;
//   4. updateCanonicalMystery edits an existing mystery in place, preserving its
//      contributor, createdAt, and resolution, and returns null for an unknown
//      id;
//   5. markMysteryResolved sets #Resolved and records the resolution summary,
//      supporting evidence, and resolver, and returns null for an unknown id;
//   6. listTimelineEvents surfaces a mystery as a #Mystery event linked to it;
//   7. the legacy authorization gates are unchanged: an anonymous caller and a
//      signed-in non-member are rejected on submitMysteryContribution, and the
//      Steward-only endpoints reject a non-Steward.
//
// The frontend suite mocks the actor, so none of this is visible there. This
// file installs the app's own compiled wasm and drives the real public API.
//
// Coverage limit this file cannot close: the family-boundary behavior of the
// canonical `*ForFamily` endpoints is not exercisable here because those
// endpoints do not exist yet; this file is the baseline the cover lane builds
// on. The `familyId` field the change adds to Mystery / MysteryContribution is
// likewise not asserted here.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

const SIGN_IN_MARKER = "Unauthorized: You must be signed in";
// The canonical family-membership gate's stable, non-technical message. The
// legacy no-familyId member gate now routes through this canonical helper, so
// the exact pre-tenancy wording is intentionally not frozen (see the header);
// the fact of denial and the canonical message are.
const MEMBER_MARKER =
  "Family membership required. Claim your family profile and wait for Family Steward approval before contributing family content.";
const STEWARD_MARKER = "Unauthorized: Only Family Stewards can";

let pic: PocketIc | undefined;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
});

afterAll(async () => {
  await pic?.tearDown();
});

interface Seeded {
  actor: _SERVICE;
  canisterId: ReturnType<typeof memberAIdentity.getPrincipal>;
}

/**
 * A fresh canister with ADMIN as the Family Steward and MEMBER_A / MEMBER_B as
 * approved members (each claimed a seeded living profile, approved by the
 * steward). Each test seeds its own canister so no test depends on the order
 * another ran in.
 */
async function setupMysteries(): Promise<Seeded> {
  const setup = await pic!.setupCanister<_SERVICE>({
    idlFactory,
    wasm: BACKEND_WASM,
  });
  const actor = setup.actor;

  // ADMIN becomes the Family Steward. Steward authority is the canonical
  // active-Steward record, not the platform admin role: the first caller to
  // _initialize_access_control is #admin but must still claim the Steward role
  // explicitly before the approvals below are authorized.
  actor.setIdentity(adminIdentity);
  await actor._initialize_access_control();
  await actor.claimSteward();

  // MEMBER_A and MEMBER_B register as approved #user members and bind an auth
  // method so their accounts are active.
  actor.setIdentity(memberAIdentity);
  await actor._initialize_access_control();
  await actor.bindAuthMethod({ Google: null });
  actor.setIdentity(memberBIdentity);
  await actor._initialize_access_control();
  await actor.bindAuthMethod({ Google: null });

  // MEMBER_A claims the living 'clayton' profile and MEMBER_B claims 'hudson';
  // the steward approves both, making them approved family members.
  actor.setIdentity(memberAIdentity);
  const claimA = (await actor.requestProfileClaim("clayton")) as {
    ok: { id: bigint };
  };
  actor.setIdentity(memberBIdentity);
  const claimB = (await actor.requestProfileClaim("hudson")) as {
    ok: { id: bigint };
  };
  actor.setIdentity(adminIdentity);
  await actor.approveProfileClaim(claimA.ok.id);
  await actor.approveProfileClaim(claimB.ok.id);

  return { actor, canisterId: setup.canisterId };
}

/**
 * Creates a canonical mystery as ADMIN with the given title and overrides. The
 * related member defaults to MEMBER_A's claimed profile ('clayton'), which is a
 * seeded living profile.
 */
async function createMysteryAsSteward(
  actor: _SERVICE,
  title: string,
  overrides: {
    description?: string;
    relatedMemberIds?: string[];
    relatedBranchId?: [] | [string];
    knownFacts?: string[];
    possibilities?: string[];
    relatedSourceIds?: bigint[];
    relatedArchiveItemIds?: bigint[];
    status?: { Open: null } | { Researching: null } | { PartiallyResolved: null } | { Resolved: null };
  } = {},
) {
  actor.setIdentity(adminIdentity);
  return actor.createCanonicalMystery(
    title,
    overrides.description ?? `The mystery of ${title}.`,
    overrides.relatedMemberIds ?? ["clayton"],
    overrides.relatedBranchId ?? [],
    overrides.knownFacts ?? [],
    overrides.possibilities ?? [],
    overrides.relatedSourceIds ?? [],
    overrides.relatedArchiveItemIds ?? [],
    overrides.status ?? { Open: null },
  );
}

/**
 * Submits a mystery contribution as MEMBER_A with the given text and type.
 */
async function submitAsA(
  actor: _SERVICE,
  mysteryId: bigint,
  text: string,
  contributionType:
    | { Note: null }
    | { Memory: null }
    | { Lead: null }
    | { Source: null } = { Note: null },
) {
  actor.setIdentity(memberAIdentity);
  return actor.submitMysteryContribution(mysteryId, contributionType, text);
}

/**
 * Submits a Norwood Archive item as ADMIN and returns its id. The tenancy change
 * adds a family-boundary guard on linked media: a mystery may only link an
 * Archive item that exists in the same family, so a test that asserts a mystery
 * with a media link must create a real Norwood item rather than pass an
 * arbitrary id.
 */
async function submitNorwoodMedia(actor: _SERVICE, title: string): Promise<bigint> {
  actor.setIdentity(adminIdentity);
  const item = await actor.submitArchiveItem(
    title,
    `Media for ${title}.`,
    { Document: null },
    "application/pdf",
    new Uint8Array([10, 20, 30]),
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
// (1) createCanonicalMystery stores the submitted fields and listMysteries
//     surfaces it.
// ---------------------------------------------------------------------------

it("creates a canonical Norwood mystery with the submitted fields and lists it", async () => {
  const { actor } = await setupMysteries();

  // A real Norwood Archive item: the tenancy change requires linked media to
  // belong to the same family, so an arbitrary id is rejected.
  const media = await submitNorwoodMedia(actor, "Norwood photograph");

  const created = await createMysteryAsSteward(actor, "The Missing Photograph", {
    description: "A family photograph is missing from the album.",
    relatedMemberIds: ["clayton", "hudson"],
    relatedBranchId: ["Norwood"],
    knownFacts: ["The album was kept in the parlor."],
    possibilities: ["It may have been lent to a cousin."],
    relatedSourceIds: [7n],
    relatedArchiveItemIds: [media],
    status: { Researching: null },
  });

  expect(created).toMatchObject({
    title: "The Missing Photograph",
    description: "A family photograph is missing from the album.",
    relatedMemberIds: ["clayton", "hudson"],
    relatedBranchId: ["Norwood"],
    knownFacts: ["The album was kept in the parlor."],
    possibilities: ["It may have been lent to a cousin."],
    relatedSourceIds: [7n],
    relatedArchiveItemIds: [media],
    status: { Researching: null },
    resolution: [],
  });
  // The caller is recorded as the contributor.
  expect(created.contributor).toEqual(adminIdentity.getPrincipal());

  // The public listing surfaces it.
  const listed = await actor.listMysteries();
  expect(listed.map((m) => m.id)).toContain(created.id);
});

it("starts an empty mystery listing before anything is created", async () => {
  const { actor } = await setupMysteries();

  expect(await actor.listMysteries()).toEqual([]);
});

// ---------------------------------------------------------------------------
// (2) submitMysteryContribution persists the submitted fields with #Pending and
//     the Steward-only pending listing surfaces it.
// ---------------------------------------------------------------------------

it("persists a Norwood mystery contribution as pending and lists it for a Steward", async () => {
  const { actor } = await setupMysteries();

  const mystery = await createMysteryAsSteward(actor, "The Unmarked Grave");

  const submitted = await submitAsA(
    actor,
    mystery.id,
    "Grandma said the stone was moved in the 1950s.",
    { Memory: null },
  );

  expect(submitted).toMatchObject({
    mysteryId: mystery.id,
    contributionType: { Memory: null },
    text: "Grandma said the stone was moved in the 1950s.",
    status: { Pending: null },
    reviewedBy: [],
    reviewedAt: [],
  });
  // The caller is recorded as the contributor.
  expect(submitted.contributor).toEqual(memberAIdentity.getPrincipal());

  // The Steward sees it in the pending review listing.
  actor.setIdentity(adminIdentity);
  const pending = await actor.listPendingMysteryContributions();
  expect(pending.map((c) => c.id)).toContain(submitted.id);
});

it("keeps the public mystery listing to mysteries when a contribution is pending", async () => {
  const { actor } = await setupMysteries();

  const mystery = await createMysteryAsSteward(actor, "The Unmarked Grave");
  await submitAsA(actor, mystery.id, "A lead.");

  // The public mystery listing is not a contribution listing: submitting a
  // contribution must not add a mystery record.
  const listed = await actor.listMysteries();
  expect(listed.map((m) => m.id)).toEqual([mystery.id]);
});

// ---------------------------------------------------------------------------
// (3) reviewMysteryContribution approves / rejects a pending contribution and
//     returns null for an unknown id and for a contribution that is not pending.
// ---------------------------------------------------------------------------

it("approves a pending contribution and records the reviewer", async () => {
  const { actor } = await setupMysteries();

  const mystery = await createMysteryAsSteward(actor, "The Unmarked Grave");
  const submitted = await submitAsA(actor, mystery.id, "A possible lead.");

  actor.setIdentity(adminIdentity);
  const reviewed = await actor.reviewMysteryContribution(submitted.id, true);
  expect(reviewed).toEqual([
    expect.objectContaining({
      id: submitted.id,
      status: { Approved: null },
      reviewedBy: [adminIdentity.getPrincipal()],
    }),
  ]);

  // It is gone from the pending listing.
  expect(
    (await actor.listPendingMysteryContributions()).map((c) => c.id),
  ).not.toContain(submitted.id);
});

it("rejects a pending contribution and records the reviewer", async () => {
  const { actor } = await setupMysteries();

  const mystery = await createMysteryAsSteward(actor, "The Unmarked Grave");
  const submitted = await submitAsA(actor, mystery.id, "An unreliable lead.");

  actor.setIdentity(adminIdentity);
  const reviewed = await actor.reviewMysteryContribution(submitted.id, false);
  expect(reviewed).toEqual([
    expect.objectContaining({
      id: submitted.id,
      status: { Rejected: null },
      reviewedBy: [adminIdentity.getPrincipal()],
    }),
  ]);

  expect(
    (await actor.listPendingMysteryContributions()).map((c) => c.id),
  ).not.toContain(submitted.id);
});

it("returns null when reviewing an unknown contribution id", async () => {
  const { actor } = await setupMysteries();

  actor.setIdentity(adminIdentity);
  await expect(actor.reviewMysteryContribution(9999n, true)).resolves.toEqual([]);
});

it("returns null when reviewing a contribution that is not pending", async () => {
  const { actor } = await setupMysteries();

  const mystery = await createMysteryAsSteward(actor, "The Unmarked Grave");
  const submitted = await submitAsA(actor, mystery.id, "Already decided.");

  actor.setIdentity(adminIdentity);
  await actor.reviewMysteryContribution(submitted.id, true);

  // A second review of the now-approved contribution is a no-op.
  await expect(actor.reviewMysteryContribution(submitted.id, false)).resolves.toEqual([]);
});

// ---------------------------------------------------------------------------
// (4) updateCanonicalMystery edits in place and returns null for an unknown id.
// ---------------------------------------------------------------------------

it("updates a canonical mystery in place, preserving contributor, createdAt, and resolution", async () => {
  const { actor } = await setupMysteries();

  const created = await createMysteryAsSteward(actor, "Original Title", {
    description: "Original description.",
    status: { Open: null },
  });

  // A real Norwood Archive item: the tenancy change requires linked media to
  // belong to the same family, so an arbitrary id is rejected.
  const media = await submitNorwoodMedia(actor, "Revised Norwood photograph");

  const updated = await actor.updateCanonicalMystery(
    created.id,
    "Revised Title",
    "Revised description.",
    ["clayton", "hudson"],
    ["Clayton"],
    ["A revised known fact."],
    ["A revised possibility."],
    [9n],
    [media],
    { PartiallyResolved: null },
  );

  expect(updated).toEqual([
    expect.objectContaining({
      id: created.id,
      title: "Revised Title",
      description: "Revised description.",
      relatedMemberIds: ["clayton", "hudson"],
      relatedBranchId: ["Clayton"],
      knownFacts: ["A revised known fact."],
      possibilities: ["A revised possibility."],
      relatedSourceIds: [9n],
      relatedArchiveItemIds: [media],
      status: { PartiallyResolved: null },
      // The edit preserves the original contributor, creation time, and
      // resolution.
      contributor: created.contributor,
      createdAt: created.createdAt,
      resolution: [],
    }),
  ]);

  // The public listing reflects the edit.
  const listed = await actor.listMysteries();
  expect(listed.find((m) => m.id === created.id)).toMatchObject({
    title: "Revised Title",
  });
});

it("returns null when updating an unknown mystery id", async () => {
  const { actor } = await setupMysteries();

  actor.setIdentity(adminIdentity);
  await expect(
    actor.updateCanonicalMystery(
      9999n,
      "Ghost",
      "No such mystery.",
      [],
      [],
      [],
      [],
      [],
      [],
      { Open: null },
    ),
  ).resolves.toEqual([]);
});

// ---------------------------------------------------------------------------
// (5) markMysteryResolved sets #Resolved and records the resolution.
// ---------------------------------------------------------------------------

it("marks a mystery resolved and records the resolution summary and evidence", async () => {
  const { actor } = await setupMysteries();

  const created = await createMysteryAsSteward(actor, "The Unmarked Grave", {
    status: { Researching: null },
  });

  actor.setIdentity(adminIdentity);
  const resolved = await actor.markMysteryResolved(
    created.id,
    "The stone was moved to the new cemetery in 1952.",
    ["Cemetery relocation ledger, 1952"],
  );

  expect(resolved).toEqual([
    expect.objectContaining({
      id: created.id,
      status: { Resolved: null },
      resolution: [
        expect.objectContaining({
          summary: "The stone was moved to the new cemetery in 1952.",
          supportingEvidence: ["Cemetery relocation ledger, 1952"],
          resolvedBy: adminIdentity.getPrincipal(),
        }),
      ],
    }),
  ]);

  // The public listing reflects the resolution.
  const listed = await actor.listMysteries();
  expect(listed.find((m) => m.id === created.id)).toMatchObject({
    status: { Resolved: null },
  });
});

it("returns null when resolving an unknown mystery id", async () => {
  const { actor } = await setupMysteries();

  actor.setIdentity(adminIdentity);
  await expect(
    actor.markMysteryResolved(9999n, "No such mystery.", []),
  ).resolves.toEqual([]);
});

// ---------------------------------------------------------------------------
// (6) listTimelineEvents surfaces a mystery as a #Mystery event linked to it.
// ---------------------------------------------------------------------------

it("surfaces a mystery in the timeline as a #Mystery event", async () => {
  const { actor } = await setupMysteries();

  const created = await createMysteryAsSteward(actor, "Timeline Mystery", {
    description: "A mystery that should appear on the timeline.",
  });

  const events = await actor.listTimelineEvents();
  const mysteryEvent = events.find(
    (e) => "Mystery" in e.linkTarget && e.linkTarget.Mystery === created.id,
  );
  expect(mysteryEvent).toMatchObject({
    eventType: { Mystery: null },
    title: "Timeline Mystery",
    description: "A mystery that should appear on the timeline.",
    evidenceStatus: { Unresolved: null },
  });
});

// ---------------------------------------------------------------------------
// (7) Legacy authorization gates are unchanged.
// ---------------------------------------------------------------------------

it("rejects an anonymous caller and a signed-in non-member from submitting a contribution", async () => {
  const { actor, canisterId } = await setupMysteries();

  const mystery = await createMysteryAsSteward(actor, "The Unmarked Grave");

  // A freshly created actor calls as the anonymous principal until an identity
  // is set.
  const guest = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  await expect(
    guest.submitMysteryContribution(mystery.id, { Note: null }, "Anonymous must not contribute."),
  ).rejects.toThrow(new RegExp(SIGN_IN_MARKER, "i"));

  // A signed-in caller that never claimed a profile is not an approved member.
  const strangerIdentity = createIdentity("mystery-stranger-seed");
  const strangerActor = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  strangerActor.setIdentity(strangerIdentity);
  await strangerActor._initialize_access_control();
  await expect(
    strangerActor.submitMysteryContribution(mystery.id, { Note: null }, "A signed-in non-member must not contribute."),
  ).rejects.toThrow(new RegExp(MEMBER_MARKER, "i"));
});

it("denies a non-Steward the Steward-only mystery endpoints", async () => {
  const { actor } = await setupMysteries();

  // A signed-in approved member is not a Steward.
  actor.setIdentity(memberAIdentity);
  await expect(actor.listPendingMysteryContributions()).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
  await expect(actor.reviewMysteryContribution(0n, true)).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
  await expect(
    actor.createCanonicalMystery(
      "Non-steward mystery",
      "A non-steward must not create canonical mysteries.",
      [],
      [],
      [],
      [],
      [],
      [],
      { Open: null },
    ),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
  await expect(
    actor.updateCanonicalMystery(
      0n,
      "Non-steward edit",
      "A non-steward must not edit canonical mysteries.",
      [],
      [],
      [],
      [],
      [],
      [],
      { Open: null },
    ),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
  await expect(
    actor.markMysteryResolved(0n, "A non-steward must not resolve mysteries.", []),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
});
