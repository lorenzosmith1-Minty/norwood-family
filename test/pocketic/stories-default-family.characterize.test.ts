import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";
import { BACKEND_WASM, adminIdentity, memberAIdentity, memberBIdentity } from "./lane-helpers";

// ---------------------------------------------------------------------------
// Tenancy — Family Stories default-family characterization.
//
// The requested change gives the Story record a `familyId` field, adds
// canonical family-scoped endpoints (a family-scoped submit, pending/approved
// listings, approve/reject, and canonical add/update), and keeps the existing
// no-familyId Story endpoints as thin TEMPORARY wrappers delegating to the
// canonical methods with DEFAULT_FAMILY_ID ("norwood").
//
// This file freezes the OBSERVABLE default-family (Norwood) behavior of the
// legacy no-familyId Story endpoints, which the change must preserve through
// those wrappers. It deliberately does NOT freeze:
//
//   * the absence of a `familyId` field on Story — the change adds one, so
//     asserting its absence would freeze the very thing being changed;
//   * the exact Story record shape — the change adds a field, so only the
//     submitted fields and status transitions are asserted, never the full
//     record;
//   * the legacy endpoints as the only implementation — the change makes them
//     thin wrappers over canonical family-scoped methods, and this file must
//     keep passing across that refactor;
//   * the exact denial wording of the legacy member gate — the change routes it
//     through the canonical family gate, so only the fact of denial is frozen.
//
// What it does freeze is the behavior a default-family user observes today and
// must keep observing:
//
//   1. submitStory persists the submitted fields with #Pending status and the
//      caller as contributor, and listPendingStories surfaces it to a Steward;
//   2. approveStory moves a pending story to #Approved and listApprovedStories
//      then returns it; rejectStory moves a pending story to #Rejected and it
//      is absent from the approved listing;
//   3. approveStory/rejectStory return null for an unknown id and for a story
//      that is not pending;
//   4. addCanonicalStory stores an already-#Approved story directly;
//   5. updateCanonicalStory edits an existing story in place, preserving its
//      contributor, createdAt, and status, and returns null for an unknown id;
//   6. listTimelineEvents surfaces a story as a #Story event linked to it;
//   7. the legacy authorization gates are unchanged: an anonymous caller and a
//      signed-in non-member are rejected on submitStory, and the Steward-only
//      endpoints reject a non-Steward;
//   8. a pending story contributes to the Steward-facing pending-contributions
//      count and stops contributing once approved or rejected.
//
// The frontend suite mocks the actor, so none of this is visible there. This
// file installs the app's own compiled wasm and drives the real public API.
//
// Coverage limit this file cannot close: the family-boundary behavior of the
// canonical `*ForFamily` endpoints is not exercisable here because those
// endpoints do not exist yet; this file is the baseline the cover lane builds
// on. The `familyId` field the change adds to Story is likewise not asserted
// here.
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
async function setupStories(): Promise<Seeded> {
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
 * Submits a story as MEMBER_A with the given title and overrides. The related
 * member defaults to MEMBER_A's own claimed profile ('clayton'), which is a
 * seeded living profile.
 */
async function submitAsA(
  actor: _SERVICE,
  title: string,
  overrides: {
    storyText?: string;
    relatedMemberIds?: string[];
    era?: [] | [string];
    year?: [] | [bigint];
    location?: [] | [string];
    evidenceStatus?: { Documented: null } | { FamilyHistory: null } | { PersonalMemory: null } | { Unresolved: null };
    relatedArchiveItemIds?: bigint[];
  } = {},
) {
  actor.setIdentity(memberAIdentity);
  return actor.submitStory(
    title,
    overrides.storyText ?? `The story of ${title}.`,
    overrides.relatedMemberIds ?? ["clayton"],
    overrides.era ?? ["early 1900s"],
    overrides.year ?? [1905n],
    overrides.location ?? ["Norwood, Mississippi"],
    overrides.evidenceStatus ?? { FamilyHistory: null },
    overrides.relatedArchiveItemIds ?? [],
  );
}

// ---------------------------------------------------------------------------
// (1) Legacy submit persists the submitted fields with #Pending, and the
//     Steward-only pending listing surfaces it.
// ---------------------------------------------------------------------------

it("persists a legacy Norwood story with the submitted fields and lists it pending", async () => {
  const { actor } = await setupStories();

  const submitted = await submitAsA(actor, "The Long Walk Home", {
    storyText: "Grandpa walked twelve miles to the county fair.",
    relatedMemberIds: ["clayton", "hudson"],
    era: ["late 1920s"],
    year: [1928n],
    location: ["Clayton, Mississippi"],
    evidenceStatus: { PersonalMemory: null },
  });

  expect(submitted).toMatchObject({
    title: "The Long Walk Home",
    storyText: "Grandpa walked twelve miles to the county fair.",
    relatedMemberIds: ["clayton", "hudson"],
    era: ["late 1920s"],
    year: [1928n],
    location: ["Clayton, Mississippi"],
    evidenceStatus: { PersonalMemory: null },
    status: { Pending: null },
  });
  // The caller is recorded as the contributor.
  expect(submitted.contributor).toEqual(memberAIdentity.getPrincipal());

  // The Steward sees it in the pending review listing.
  actor.setIdentity(adminIdentity);
  const pending = await actor.listPendingStories();
  expect(pending.map((s) => s.id)).toContain(submitted.id);
});

it("does not expose a pending story in the public approved listing", async () => {
  const { actor } = await setupStories();

  const submitted = await submitAsA(actor, "Not Yet Approved");

  // The approved listing is public and must not leak a pending story.
  expect((await actor.listApprovedStories()).map((s) => s.id)).not.toContain(
    submitted.id,
  );
});

// ---------------------------------------------------------------------------
// (2) Legacy approve / reject move a pending story and update the listings.
// ---------------------------------------------------------------------------

it("approves a pending story and lists it approved", async () => {
  const { actor } = await setupStories();

  const submitted = await submitAsA(actor, "Approved Story");

  // Before approval it is not in the approved listing.
  expect(await actor.listApprovedStories()).toEqual([]);

  actor.setIdentity(adminIdentity);
  const approved = await actor.approveStory(submitted.id);
  expect(approved).toEqual([
    expect.objectContaining({
      id: submitted.id,
      status: { Approved: null },
    }),
  ]);

  // It is gone from pending and present in the approved listing.
  expect((await actor.listPendingStories()).map((s) => s.id)).not.toContain(
    submitted.id,
  );
  const listed = await actor.listApprovedStories();
  expect(listed.map((s) => s.id)).toContain(submitted.id);
});

it("rejects a pending story and keeps it out of the approved listing", async () => {
  const { actor } = await setupStories();

  const submitted = await submitAsA(actor, "Rejected Story");

  actor.setIdentity(adminIdentity);
  const rejected = await actor.rejectStory(submitted.id);
  expect(rejected).toEqual([
    expect.objectContaining({
      id: submitted.id,
      status: { Rejected: null },
    }),
  ]);

  expect((await actor.listPendingStories()).map((s) => s.id)).not.toContain(
    submitted.id,
  );
  expect((await actor.listApprovedStories()).map((s) => s.id)).not.toContain(
    submitted.id,
  );
});

// ---------------------------------------------------------------------------
// (3) Legacy approve / reject return null for an unknown id and for a story
//     that is not pending.
// ---------------------------------------------------------------------------

it("returns null when approving or rejecting an unknown story id", async () => {
  const { actor } = await setupStories();

  actor.setIdentity(adminIdentity);
  await expect(actor.approveStory(9999n)).resolves.toEqual([]);
  await expect(actor.rejectStory(9999n)).resolves.toEqual([]);
});

it("returns null when approving or rejecting a story that is not pending", async () => {
  const { actor } = await setupStories();

  const submitted = await submitAsA(actor, "Already Decided");

  actor.setIdentity(adminIdentity);
  await actor.approveStory(submitted.id);

  // A second approve or a reject of the now-approved story is a no-op.
  await expect(actor.approveStory(submitted.id)).resolves.toEqual([]);
  await expect(actor.rejectStory(submitted.id)).resolves.toEqual([]);
});

// ---------------------------------------------------------------------------
// (4) Legacy addCanonicalStory stores an already-approved story directly.
// ---------------------------------------------------------------------------

it("adds a canonical story directly as approved", async () => {
  const { actor } = await setupStories();

  actor.setIdentity(adminIdentity);
  const added = await actor.addCanonicalStory(
    "Canonical Story",
    "A steward-authored canonical story.",
    ["clayton"],
    ["1890s"],
    [1893n],
    ["Norwood"],
    { Documented: null },
    [],
  );

  expect(added).toMatchObject({
    title: "Canonical Story",
    status: { Approved: null },
    evidenceStatus: { Documented: null },
  });
  expect(added.contributor).toEqual(adminIdentity.getPrincipal());

  // It is immediately visible in the approved listing.
  const listed = await actor.listApprovedStories();
  expect(listed.map((s) => s.id)).toContain(added.id);
});

// ---------------------------------------------------------------------------
// (5) Legacy updateCanonicalStory edits in place and returns null for an
//     unknown id.
// ---------------------------------------------------------------------------

it("updates a canonical story in place, preserving contributor, createdAt, and status", async () => {
  const { actor } = await setupStories();

  actor.setIdentity(adminIdentity);
  const added = await actor.addCanonicalStory(
    "Original Title",
    "Original text.",
    ["clayton"],
    ["1890s"],
    [1893n],
    ["Norwood"],
    { Documented: null },
    [],
  );

  const updated = await actor.updateCanonicalStory(
    added.id,
    "Revised Title",
    "Revised text.",
    ["clayton", "hudson"],
    ["1900s"],
    [1901n],
    ["Clayton"],
    { FamilyHistory: null },
    [],
  );

  expect(updated).toEqual([
    expect.objectContaining({
      id: added.id,
      title: "Revised Title",
      storyText: "Revised text.",
      relatedMemberIds: ["clayton", "hudson"],
      era: ["1900s"],
      year: [1901n],
      location: ["Clayton"],
      evidenceStatus: { FamilyHistory: null },
      // The edit preserves the original contributor, creation time, and status.
      contributor: added.contributor,
      createdAt: added.createdAt,
      status: { Approved: null },
    }),
  ]);

  // The approved listing reflects the edit.
  const listed = await actor.listApprovedStories();
  expect(listed.find((s) => s.id === added.id)).toMatchObject({
    title: "Revised Title",
  });
});

it("returns null when updating an unknown story id", async () => {
  const { actor } = await setupStories();

  actor.setIdentity(adminIdentity);
  await expect(
    actor.updateCanonicalStory(
      9999n,
      "Ghost",
      "No such story.",
      [],
      [],
      [],
      [],
      { Unresolved: null },
      [],
    ),
  ).resolves.toEqual([]);
});

// ---------------------------------------------------------------------------
// (6) listTimelineEvents surfaces a story as a #Story event linked to it.
// ---------------------------------------------------------------------------

it("surfaces an approved story in the timeline as a #Story event", async () => {
  const { actor } = await setupStories();

  const submitted = await submitAsA(actor, "Timeline Story", {
    era: ["1910s"],
    year: [1912n],
  });
  actor.setIdentity(adminIdentity);
  await actor.approveStory(submitted.id);

  const events = await actor.listTimelineEvents();
  const storyEvent = events.find(
    (e) => "Story" in e.linkTarget && e.linkTarget.Story === submitted.id,
  );
  expect(storyEvent).toMatchObject({
    eventType: { Story: null },
    title: "Timeline Story",
    era: ["1910s"],
    year: [1912n],
  });
});

// ---------------------------------------------------------------------------
// (7) Legacy authorization gates are unchanged.
// ---------------------------------------------------------------------------

it("rejects an anonymous caller and a signed-in non-member from submitting a story", async () => {
  const { canisterId } = await setupStories();

  // A freshly created actor calls as the anonymous principal until an identity
  // is set.
  const guest = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  await expect(
    guest.submitStory(
      "Anonymous story",
      "Anonymous must not contribute.",
      [],
      [],
      [],
      [],
      { FamilyHistory: null },
      [],
    ),
  ).rejects.toThrow(new RegExp(SIGN_IN_MARKER, "i"));

  // A signed-in caller that never claimed a profile is not an approved member.
  const strangerIdentity = createIdentity("stories-stranger-seed");
  const strangerActor = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  strangerActor.setIdentity(strangerIdentity);
  await strangerActor._initialize_access_control();
  await expect(
    strangerActor.submitStory(
      "Stranger story",
      "A signed-in non-member must not contribute.",
      [],
      [],
      [],
      [],
      { FamilyHistory: null },
      [],
    ),
  ).rejects.toThrow(new RegExp(MEMBER_MARKER, "i"));
});

it("denies a non-Steward the Steward-only story endpoints", async () => {
  const { actor } = await setupStories();

  // A signed-in approved member is not a Steward.
  actor.setIdentity(memberAIdentity);
  await expect(actor.listPendingStories()).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
  await expect(actor.approveStory(0n)).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
  await expect(actor.rejectStory(0n)).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
  await expect(
    actor.addCanonicalStory(
      "Non-steward story",
      "A non-steward must not add canonical stories.",
      [],
      [],
      [],
      [],
      { FamilyHistory: null },
      [],
    ),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
  await expect(
    actor.updateCanonicalStory(
      0n,
      "Non-steward edit",
      "A non-steward must not edit canonical stories.",
      [],
      [],
      [],
      [],
      { FamilyHistory: null },
      [],
    ),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
});

// ---------------------------------------------------------------------------
// (8) A pending story contributes to the Steward-facing pending-contributions
//     count and stops contributing once approved or rejected.
// ---------------------------------------------------------------------------

it("counts a pending story in the pending contributions count until it is reviewed", async () => {
  const { actor } = await setupStories();

  // Empty-state: no pending items, so the count is zero.
  actor.setIdentity(adminIdentity);
  expect(await actor.getPendingContributionsCount()).toBe(0n);

  // A member submits a story; the count increments to one.
  const submitted = await submitAsA(actor, "Counted Story");
  actor.setIdentity(adminIdentity);
  expect(await actor.getPendingContributionsCount()).toBe(1n);

  // Approving the story removes it from the pending set, decrementing the count.
  await actor.approveStory(submitted.id);
  expect(await actor.getPendingContributionsCount()).toBe(0n);

  // A second pending story that is rejected likewise stops contributing.
  const rejected = await submitAsA(actor, "Rejected Counted Story");
  actor.setIdentity(adminIdentity);
  expect(await actor.getPendingContributionsCount()).toBe(1n);
  await actor.rejectStory(rejected.id);
  expect(await actor.getPendingContributionsCount()).toBe(0n);
});
