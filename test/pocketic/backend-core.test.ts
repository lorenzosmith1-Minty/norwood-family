import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";
import {
  BACKEND_WASM,
  adminIdentity,
  blob,
  contributorIdentity,
  memberAIdentity,
  registerApprovedContributor,
  stewardIdentity,
} from "./lane-helpers";

// ---------------------------------------------------------------------------
// Backend behavior that needs its own canister per test: archive privacy
// enforcement, the pending-contributions count, and the steward-authorized
// updateOwnProfile paths.
//
// This file was split out of the original backend.test.ts, which installed ~24
// canisters into a single PocketIc instance. That exhausted the shared
// sidecar's pid ceiling partway through and cascaded into `fetch failed` /
// `Server busy` / `socket closed` failures for whichever test happened to run
// after the ceiling was hit (the failing index moved between runs). Each test
// file gets its own instance and tears it down in `afterAll`, so splitting the
// suite releases one file's canisters and threads before the next starts.
//
// The assertions are unchanged from the original file; only the canister
// lifecycle and the shared helpers' location changed.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

let pic: PocketIc | undefined;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
});

afterAll(async () => {
  await pic?.tearDown();
});

// ---------------------------------------------------------------------------
// Archive privacy enforcement (cover for the server-side privacy requirement).
// Approved archive items are returned to a caller only when the caller's access
// matches the item's privacy level: Public items are visible to everyone,
// FamilyOnly items require approved family membership, and Private items are
// visible only to their contributor or an admin. This is enforced in the
// backend, not just displayed client-side — the frontend suite mocks the actor
// and cannot see it, so it is asserted here against the real canister.
// ---------------------------------------------------------------------------

it("enforces archive privacy levels server-side: a guest sees only Public approved items", async () => {
  const privacySetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const privacyActor = privacySetup.actor;

  // ADMIN becomes the Family Steward; CONTRIBUTOR registers as a #user but is
  // deliberately left UNAPPROVED so this test can assert what a signed-in
  // non-member sees. A separate approved submitter owns the three items, since
  // submitting archive items now requires approved-family membership.
  privacyActor.setIdentity(adminIdentity);
  await privacyActor._initialize_access_control();
  privacyActor.setIdentity(contributorIdentity);
  await privacyActor._initialize_access_control();

  const approvedSubmitterIdentity = createIdentity("privacy-approved-submitter-seed");
  privacyActor.setIdentity(approvedSubmitterIdentity);
  await privacyActor._initialize_access_control();
  const submitterClaim = (await privacyActor.requestProfileClaim("clayton")) as {
    ok: { id: bigint };
  };
  privacyActor.setIdentity(adminIdentity);
  await privacyActor.approveProfileClaim(submitterClaim.ok.id);

  // The approved submitter submits three items with different privacy levels.
  privacyActor.setIdentity(approvedSubmitterIdentity);
  const publicItem = await privacyActor.submitArchiveItem(
    "Public letter",
    "A public letter.",
    { Document: null },
    blob,
    "1924",
    [1924n],
    ["letters"],
    ["julia"],
    ["branch-1"],
    { Original: null },
    { Public: null },
    { Standard: null },
    [],
  );
  const familyItem = await privacyActor.submitArchiveItem(
    "Family letter",
    "A family letter.",
    { Document: null },
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
  );
  const privateItem = await privacyActor.submitArchiveItem(
    "Private letter",
    "A private letter.",
    { Document: null },
    blob,
    "1924",
    [1924n],
    ["letters"],
    ["julia"],
    ["branch-1"],
    { Original: null },
    { Private: null },
    { Standard: null },
    [],
  );

  // Approve all three so they enter the archive.
  privacyActor.setIdentity(adminIdentity);
  await privacyActor.approveArchiveItem(publicItem.id);
  await privacyActor.approveArchiveItem(familyItem.id);
  await privacyActor.approveArchiveItem(privateItem.id);

  // A guest (anonymous, no approved claim) sees ONLY the Public item — the
  // FamilyOnly and Private items are not returned to them.
  const guestActor = pic!.createActor<_SERVICE>(idlFactory, privacySetup.canisterId);
  const guestView = await guestActor.listApprovedArchiveItems();
  expect(guestView.map((i) => i.id)).toEqual([publicItem.id]);

  // A signed-in but UNAPPROVED caller sees only the Public item — the
  // FamilyOnly item requires approved membership and the Private item belongs
  // to another contributor.
  privacyActor.setIdentity(contributorIdentity);
  const contributorView = await privacyActor.listApprovedArchiveItems();
  expect(contributorView.map((i) => i.id)).toEqual([publicItem.id]);

  // The approved submitter sees their own Private item plus the Public and
  // FamilyOnly items.
  privacyActor.setIdentity(approvedSubmitterIdentity);
  const submitterView = await privacyActor.listApprovedArchiveItems();
  expect(submitterView.map((i) => i.id).sort()).toEqual(
    [publicItem.id, familyItem.id, privateItem.id].sort(),
  );

  // A different approved family member (a caller holding an approved claim)
  // sees Public + FamilyOnly, but not another contributor's Private item.
  privacyActor.setIdentity(memberAIdentity);
  await privacyActor._initialize_access_control();
  const claim = (await privacyActor.requestProfileClaim("hudson")) as {
    ok: { id: bigint };
  };
  privacyActor.setIdentity(adminIdentity);
  await privacyActor.approveProfileClaim(claim.ok.id);
  privacyActor.setIdentity(memberAIdentity);
  const memberView = await privacyActor.listApprovedArchiveItems();
  expect(memberView.map((i) => i.id).sort()).toEqual(
    [publicItem.id, familyItem.id].sort(),
  );
});

// ---------------------------------------------------------------------------
// Pending Contributions count derives from canonical pending records (cover for
// the pending-badge repair). The Steward-facing badge must reflect the same
// canonical backend pending data that listPendingArchiveItems returns, so a
// submitted contribution increments the count and an Approve/Reject decrements
// it. A dedicated canister keeps the shared `actor` canister's state from
// leaking into this assertion.
// ---------------------------------------------------------------------------

it("derives the pending contributions count from canonical pending archive records", async () => {
  const countSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const countActor = countSetup.actor;

  // ADMIN becomes the Family Steward; CONTRIBUTOR registers as an approved
  // family member so they may submit archive items.
  await registerApprovedContributor(countActor);

  // Empty-state: no pending items, so the count is zero.
  countActor.setIdentity(adminIdentity);
  expect(await countActor.getPendingContributionsCount()).toBe(0n);

  // A contributor submits a pending archive item; the count increments to one.
  countActor.setIdentity(contributorIdentity);
  const item = await countActor.submitArchiveItem(
    "A family letter",
    "A letter from 1924.",
    { Document: null },
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
  );

  // The count reflects the same canonical pending record listPendingArchiveItems
  // returns: exactly one pending item.
  countActor.setIdentity(adminIdentity);
  expect(await countActor.getPendingContributionsCount()).toBe(1n);
  expect(await countActor.listPendingArchiveItems()).toHaveLength(1);

  // Approving the item removes it from the pending set, decrementing the count.
  await countActor.approveArchiveItem(item.id);
  expect(await countActor.getPendingContributionsCount()).toBe(0n);
  expect(await countActor.listPendingArchiveItems()).toEqual([]);
});

// ---------------------------------------------------------------------------
// Steward-authorized update path (cover for the profile-edit hydration build).
// updateOwnProfile now lets a Family Steward edit an unclaimed/historical
// profile (treated as editing an existing profile, never creating a new one),
// and the #DeceasedProfile guard runs AFTER the ownership check so a steward
// editing an unclaimed deceased profile is allowed while an owner (or a steward
// editing a profile claimed by another user) is still blocked. These run
// against a dedicated canister so the claim/approve state never leaks into the
// shared `actor` canister.
// ---------------------------------------------------------------------------

it("lets a Family Steward edit an unclaimed living profile via updateOwnProfile", async () => {
  const stewardSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const stewardActor = stewardSetup.actor;

  // STEWARD becomes the Family Steward (first caller to _initialize_access_control).
  stewardActor.setIdentity(stewardIdentity);
  await stewardActor._initialize_access_control();

  // 'clayton' is a seeded living, unclaimed profile. A steward may edit it as
  // an existing profile — the update succeeds and the canonical record is
  // updated in place (same personId, still unclaimed, no duplicate created).
  const result = await stewardActor.updateOwnProfile("clayton", {
    preferredName: ["Clayton Norwood"],
    firstName: [],
    middleName: [],
    lastName: [],
    suffix: ["II"],
    nickname: [],
    birthDate: [],
    birthplace: [],
    currentLocation: [],
    occupation: [],
    livingStatus: [],
    shortBio: [],
    longerStory: [],
    story: [],
    birthInfo: [],
    timeline: [],
    privacySettings: [],
  });
  expect(result).toEqual({
    ok: expect.objectContaining({
      personId: "clayton",
      preferredName: ["Clayton Norwood"],
      suffix: ["II"],
      claimStatus: { Unclaimed: null },
    }),
  });

  // The canonical record is updated in place — same personId, still unclaimed.
  const profile = await stewardActor.getPersonProfile("clayton");
  expect(profile).toEqual([
    expect.objectContaining({
      personId: "clayton",
      suffix: ["II"],
      claimStatus: { Unclaimed: null },
    }),
  ]);
});

it("lets a Family Steward edit an unclaimed deceased profile (reordered guard)", async () => {
  const deceasedSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const deceasedActor = deceasedSetup.actor;

  // STEWARD becomes the Family Steward.
  deceasedActor.setIdentity(stewardIdentity);
  await deceasedActor._initialize_access_control();

  // 'julia' is a seeded deceased, unclaimed profile. The #DeceasedProfile guard
  // runs after the ownership check, so a steward editing an unclaimed deceased
  // profile is allowed (isStewardEditable) rather than blocked.
  const result = await deceasedActor.updateOwnProfile("julia", {
    preferredName: ["Julia Norwood"],
    firstName: [],
    middleName: [],
    lastName: [],
    suffix: [],
    nickname: [],
    birthDate: [],
    birthplace: [],
    currentLocation: [],
    occupation: [],
    livingStatus: [],
    shortBio: [],
    longerStory: [],
    story: [],
    birthInfo: [],
    timeline: [],
    privacySettings: [],
  });
  expect(result).toEqual({
    ok: expect.objectContaining({
      personId: "julia",
      preferredName: ["Julia Norwood"],
      livingStatus: { Deceased: null },
      claimStatus: { Unclaimed: null },
    }),
  });
});
