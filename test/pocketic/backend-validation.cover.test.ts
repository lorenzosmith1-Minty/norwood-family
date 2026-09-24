import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";

// ---------------------------------------------------------------------------
// Cover for the security-hardening pass, driven against the real canister.
//
// The frontend suite mocks the actor and has no principals, so the per-caller
// authorization rules and the backend input-length limits can only be asserted
// here. This file covers the two acceptance criteria the existing lane files do
// not:
//
//   A. Board and Messaging access is granted to an active Steward or a caller
//      with an APPROVED Norwood family claim, and denied to signed-in
//      unapproved accounts, a generic Caffeine admin without family approval,
//      and anonymous callers.
//   B. The backend rejects overlong titles, bodies, tag counts, and attachment
//      counts with clear errors and does not truncate silently.
//
// The canister is seeded once: ADMIN is the first caller to
// _initialize_access_control, so ADMIN holds the platform admin role but never
// claims the Steward role and holds no approved claim — the "generic Caffeine
// admin without family approval" case. STEWARD claims the canonical Steward
// role. MEMBER claims a seeded profile and is approved by the Steward.
// UNAPPROVED is registered but never approved.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";
const BACKEND_WASM = process.env.BACKEND_WASM ?? "";

let pic: PocketIc | undefined;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
});

afterAll(async () => {
  await pic?.tearDown();
});

const adminIdentity = createIdentity("validation-admin-seed");
const stewardIdentity = createIdentity("validation-steward-seed");
const memberIdentity = createIdentity("validation-member-seed");
const unapprovedIdentity = createIdentity("validation-unapproved-seed");

const blob = new Uint8Array([1, 2, 3, 4]);

// A fresh canister with the four callers registered. ADMIN is the platform
// admin (first caller) but not a Steward; STEWARD claims the canonical Steward
// role; MEMBER is an approved family member via an approved claim; UNAPPROVED
// is a signed-in account with no approved claim.
async function setupRoles(): Promise<{
  actor: _SERVICE;
  canisterId: ReturnType<typeof createIdentity>["getPrincipal"];
}> {
  const setup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const actor = setup.actor;

  // ADMIN registers first and becomes the platform admin. It deliberately does
  // NOT claim the Steward role, so it is the generic-admin-without-family case.
  actor.setIdentity(adminIdentity);
  await actor._initialize_access_control();

  // STEWARD registers and claims the canonical Steward role.
  actor.setIdentity(stewardIdentity);
  await actor._initialize_access_control();
  await actor.claimSteward();

  // MEMBER registers, claims the seeded living 'clayton' profile, and the
  // Steward approves the claim — making MEMBER an approved family member.
  actor.setIdentity(memberIdentity);
  await actor._initialize_access_control();
  const claim = (await actor.requestProfileClaim("clayton")) as {
    ok: { id: bigint };
  };
  actor.setIdentity(stewardIdentity);
  await actor.approveProfileClaim(claim.ok.id);

  // UNAPPROVED registers but never claims or receives an approved claim.
  actor.setIdentity(unapprovedIdentity);
  await actor._initialize_access_control();

  return { actor, canisterId: setup.canisterId };
}

// ---------------------------------------------------------------------------
// A. Board and Messaging access matrix.
// ---------------------------------------------------------------------------

it("grants board and messaging access to an active Steward", async () => {
  const { actor } = await setupRoles();
  actor.setIdentity(stewardIdentity);

  // The Steward may read the board and the messaging inbox without trapping.
  await expect(actor.listBoardPosts([])).resolves.toBeInstanceOf(Array);
  await expect(actor.listConversations()).resolves.toBeInstanceOf(Array);
  await expect(actor.listMessageableMembers()).resolves.toBeInstanceOf(Array);
});

it("grants board and messaging access to a caller with an APPROVED family claim", async () => {
  const { actor } = await setupRoles();
  actor.setIdentity(memberIdentity);

  await expect(actor.listBoardPosts([])).resolves.toBeInstanceOf(Array);
  await expect(actor.listConversations()).resolves.toBeInstanceOf(Array);
  await expect(actor.listMessageableMembers()).resolves.toBeInstanceOf(Array);
});

it("denies board and messaging access to a signed-in unapproved account", async () => {
  const { actor } = await setupRoles();
  actor.setIdentity(unapprovedIdentity);

  // The board member gate traps for a signed-in but unapproved caller.
  await expect(actor.listBoardPosts([])).rejects.toThrow();
  await expect(actor.listBoardReplies(0n)).rejects.toThrow();
  await expect(
    actor.createBoardPost({ General: null }, [], "hello", [], [], []),
  ).rejects.toThrow();

  // The messaging member gate traps too.
  await expect(actor.listConversations()).rejects.toThrow();
  await expect(actor.listBlockedUsers()).rejects.toThrow();
});

it("denies board and messaging access to a generic Caffeine admin without family approval", async () => {
  const { actor } = await setupRoles();
  actor.setIdentity(adminIdentity);

  // ADMIN holds the platform admin role but is neither a Steward nor an
  // approved family member, so the family-content gates deny it.
  await expect(actor.isCallerAdmin()).resolves.toBe(true);
  await expect(actor.isCallerSteward()).resolves.toBe(false);
  await expect(actor.listBoardPosts([])).rejects.toThrow();
  await expect(actor.listConversations()).rejects.toThrow();
});

it("denies board and messaging access to an anonymous caller", async () => {
  const { canisterId } = await setupRoles();
  const anonymous = pic!.createActor<_SERVICE>(idlFactory, canisterId);

  await expect(anonymous.listBoardPosts([])).rejects.toThrow();
  await expect(anonymous.listConversations()).rejects.toThrow();
  await expect(anonymous.listMessageableMembers()).resolves.toEqual([]);
});

// ---------------------------------------------------------------------------
// B. Backend input-length limits: overlong titles, bodies, tag counts, and
//    attachment counts are rejected with a clear error and never truncated.
// ---------------------------------------------------------------------------

it("rejects an overlong board post title instead of truncating it", async () => {
  const { actor } = await setupRoles();
  actor.setIdentity(memberIdentity);

  // MAX_TITLE_CHARS is 150; 151 characters must be rejected.
  const overlongTitle = "t".repeat(151);
  await expect(
    actor.createBoardPost({ General: null }, [overlongTitle], "body", [], [], []),
  ).rejects.toThrow(/title/i);

  // Nothing was stored: the board is still empty.
  await expect(actor.listBoardPosts([])).resolves.toEqual([]);
});

it("rejects an overlong board post body instead of truncating it", async () => {
  const { actor } = await setupRoles();
  actor.setIdentity(memberIdentity);

  // MAX_BOARD_POST_CHARS is 5,000; 5,001 characters must be rejected.
  const overlongBody = "b".repeat(5_001);
  await expect(
    actor.createBoardPost({ General: null }, [], overlongBody, [], [], []),
  ).rejects.toThrow(/body/i);

  await expect(actor.listBoardPosts([])).resolves.toEqual([]);
});

it("rejects too many tags on a board post instead of truncating the list", async () => {
  const { actor } = await setupRoles();
  actor.setIdentity(memberIdentity);

  // MAX_TAGS is 20; 21 tags must be rejected.
  const tooManyTags = Array.from({ length: 21 }, (_, i) => `tag-${i}`);
  await expect(
    actor.createBoardPost({ General: null }, [], "body", [], [], tooManyTags),
  ).rejects.toThrow(/tags/i);

  await expect(actor.listBoardPosts([])).resolves.toEqual([]);
});

it("rejects an overlong tag on a board post instead of truncating it", async () => {
  const { actor } = await setupRoles();
  actor.setIdentity(memberIdentity);

  // MAX_TAG_CHARS is 40; a 41-character tag must be rejected.
  const overlongTag = "x".repeat(41);
  await expect(
    actor.createBoardPost({ General: null }, [], "body", [], [], [overlongTag]),
  ).rejects.toThrow(/tag/i);

  await expect(actor.listBoardPosts([])).resolves.toEqual([]);
});

it("rejects too many attachments on a board post instead of truncating the list", async () => {
  const { actor } = await setupRoles();
  actor.setIdentity(memberIdentity);

  // MAX_BOARD_ATTACHMENTS is 5; 6 new uploads must be rejected before any is
  // stored.
  const upload = {
    familyId: "norwood",
    title: "Attachment",
    description: "An attachment.",
    itemType: { Photo: null },
    mimeType: "image/png",
    blob,
    filename: "attachment.png",
    era: "2024",
    year: [2024n],
    tags: [],
    relatedMemberIds: [],
    relatedBranchId: [],
    sourceStatus: { Original: null },
    privacyLevel: { FamilyOnly: null },
    classification: { Standard: null },
    primarySpeaker: [],
  };
  const tooManyUploads = Array.from({ length: 6 }, () => ({ ...upload }));

  await expect(
    actor.createBoardPostWithMedia(
      { General: null },
      [],
      "body",
      [],
      [],
      tooManyUploads,
      [],
    ),
  ).rejects.toThrow(/newUploads/i);

  // No post and no pending archive item was created.
  await expect(actor.listBoardPosts([])).resolves.toEqual([]);
  actor.setIdentity(stewardIdentity);
  await expect(actor.listPendingArchiveItems()).resolves.toEqual([]);
});

it("rejects an overlong archive item title instead of truncating it", async () => {
  const { actor } = await setupRoles();
  actor.setIdentity(memberIdentity);

  // MAX_TITLE_CHARS is 150; 151 characters must be rejected.
  const overlongTitle = "t".repeat(151);
  await expect(
    actor.submitArchiveItem(
      overlongTitle,
      "A description.",
      { Document: null },
      "application/pdf",
      blob,
      "1924",
      [1924n],
      [],
      [],
      [],
      { Original: null },
      { FamilyOnly: null },
      { Standard: null },
      [],
      "overlong-title.pdf",
    ),
  ).rejects.toThrow(/title/i);

  // Nothing was stored: no pending item exists.
  actor.setIdentity(stewardIdentity);
  await expect(actor.listPendingArchiveItems()).resolves.toEqual([]);
});

it("rejects an overlong archive item description instead of truncating it", async () => {
  const { actor } = await setupRoles();
  actor.setIdentity(memberIdentity);

  // MAX_DESCRIPTION_CHARS is 10,000; 10,001 characters must be rejected.
  const overlongDescription = "d".repeat(10_001);
  await expect(
    actor.submitArchiveItem(
      "A title",
      overlongDescription,
      { Document: null },
      "application/pdf",
      blob,
      "1924",
      [1924n],
      [],
      [],
      [],
      { Original: null },
      { FamilyOnly: null },
      { Standard: null },
      [],
      "overlong-description.pdf",
    ),
  ).rejects.toThrow(/description/i);

  actor.setIdentity(stewardIdentity);
  await expect(actor.listPendingArchiveItems()).resolves.toEqual([]);
});

it("rejects too many tags on an archive item instead of truncating the list", async () => {
  const { actor } = await setupRoles();
  actor.setIdentity(memberIdentity);

  // MAX_TAGS is 20; 21 tags must be rejected.
  const tooManyTags = Array.from({ length: 21 }, (_, i) => `tag-${i}`);
  await expect(
    actor.submitArchiveItem(
      "A title",
      "A description.",
      { Document: null },
      "application/pdf",
      blob,
      "1924",
      [1924n],
      tooManyTags,
      [],
      [],
      { Original: null },
      { FamilyOnly: null },
      { Standard: null },
      [],
      "too-many-tags.pdf",
    ),
  ).rejects.toThrow(/tags/i);

  actor.setIdentity(stewardIdentity);
  await expect(actor.listPendingArchiveItems()).resolves.toEqual([]);
});

it("rejects an overlong board reply body instead of truncating it", async () => {
  const { actor } = await setupRoles();
  actor.setIdentity(memberIdentity);

  // Seed a post so the reply has a target.
  const post = await actor.createBoardPost(
    { General: null },
    [],
    "A question",
    [],
    [],
    [],
  );

  // MAX_BOARD_REPLY_CHARS is 2,000; 2,001 characters must be rejected.
  const overlongReply = "r".repeat(2_001);
  await expect(actor.addBoardReply(post.postId, overlongReply)).rejects.toThrow(
    /reply/i,
  );

  await expect(actor.listBoardReplies(post.postId)).resolves.toEqual([]);
});
