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
// Tenancy 1C-C1 — family-scoped Message Board endpoints (real-canister cover).
//
// The accepted behavior is that the canonical `*ForFamily` board endpoints
// enforce the family boundary: a post or reply created in Family A is visible
// only under Family A and never under Family B; a `postId` or `replyId` alone
// never crosses the boundary; a member of Family A can create a post in Family
// A but not in Family B; a member of Family A cannot reply to a Family B post;
// a Steward of one family cannot moderate another family's content; a board
// attachment created with a post belongs to the same family as the post; and
// the legacy no-familyId Norwood endpoints still work unchanged.
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
// Coverage limit this file cannot close: there is no public endpoint that
// creates a Steward of a non-default family (`claimSteward` and
// `promoteToSteward` both write `familyId = "norwood"`), so "a Steward of
// Family A can moderate Family A content" cannot be exercised through the
// public API. The direction the API supports is covered here: the Norwood
// Steward cannot moderate Family A content, and an approved Family A member who
// is not a Steward cannot moderate Family A content either. The internal
// family-scoped predicate is covered by the sibling
// `family-scoped-authorization.behavior.test.ts`, which executes the real
// Motoko source.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";
const NORWOOD = "norwood";

const STEWARD_MARKER =
  "Unauthorized: Only Family Stewards can perform this action";
// The canonical family-membership gate's stable, non-technical message. It
// carries no family id or principal.
const MEMBER_MARKER =
  "Family membership required. Claim your family profile and wait for Family Steward approval before contributing family content.";
const LINKED_MEDIA_MARKER =
  "Unauthorized: Linked media must belong to the same family";

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
  // caller an approved member of the family.
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

/** Creates a post in `familyId` as the currently-set caller and returns it. */
async function createPostIn(
  actor: _SERVICE,
  familyId: string,
  title: string,
  tags: string[] = [],
) {
  return actor.createBoardPostForFamily(
    familyId,
    { Announcement: null },
    [title],
    `Body for ${title}.`,
    [],
    [],
    tags,
  );
}

// ---------------------------------------------------------------------------
// (1) Read isolation: a Family A post is visible under Family A and absent
//     under Family B; a postId alone never crosses the boundary.
// ---------------------------------------------------------------------------

it("lists and reads a Family A post under Family A but not under Family B", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const post = await createPostIn(actor, FAMILY_A, "Family A post");
  expect(post.familyId).toBe(FAMILY_A);

  // The Family A member sees it under Family A.
  const listedA = await actor.listBoardPostsForFamily(FAMILY_A, []);
  expect(listedA.map((p) => p.postId)).toEqual([post.postId]);
  expect(listedA.every((p) => p.familyId === FAMILY_A)).toBe(true);

  const fetchedA = await actor.getBoardPostForFamily(FAMILY_A, post.postId);
  expect(fetchedA).toEqual([
    expect.objectContaining({ postId: post.postId, familyId: FAMILY_A }),
  ]);

  // The Family B member's Family B listing never contains the Family A post.
  actor.setIdentity(memberBIdentity);
  const listedB = await actor.listBoardPostsForFamily(FAMILY_B, []);
  expect(listedB).toEqual([]);

  // A postId alone does not resolve under Family B: the lookup behaves like
  // not-found rather than leaking the record.
  const fetchedB = await actor.getBoardPostForFamily(FAMILY_B, post.postId);
  expect(fetchedB).toEqual([]);
});

it("lists and reads Family A replies under Family A but not under Family B", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const post = await createPostIn(actor, FAMILY_A, "Family A reply post");
  const reply = await actor.addBoardReplyForFamily(
    FAMILY_A,
    post.postId,
    "A Family A reply.",
  );
  expect(reply.familyId).toBe(FAMILY_A);

  // The Family A member reads the reply thread under Family A.
  const repliesA = await actor.listBoardRepliesForFamily(FAMILY_A, post.postId);
  expect(repliesA.map((r) => r.replyId)).toEqual([reply.replyId]);
  expect(repliesA.every((r) => r.familyId === FAMILY_A)).toBe(true);

  // The Family B member's Family B read of the same postId returns nothing.
  actor.setIdentity(memberBIdentity);
  const repliesB = await actor.listBoardRepliesForFamily(FAMILY_B, post.postId);
  expect(repliesB).toEqual([]);
});

// ---------------------------------------------------------------------------
// (2) Create isolation: a Family A member can create in Family A and cannot
//     create in Family B.
// ---------------------------------------------------------------------------

it("lets a Family A member create in Family A and denies a create in Family B", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const created = await createPostIn(actor, FAMILY_A, "Allowed Family A post");
  expect(created.familyId).toBe(FAMILY_A);

  // The same caller is not an approved member of Family B, so the create is
  // denied outright.
  await expect(createPostIn(actor, FAMILY_B, "Denied Family B post")).rejects.toThrow(
    new RegExp(MEMBER_MARKER, "i"),
  );

  // Nothing was stored in Family B.
  actor.setIdentity(memberBIdentity);
  expect(await actor.listBoardPostsForFamily(FAMILY_B, [])).toEqual([]);
});

// ---------------------------------------------------------------------------
// (3) Reply isolation: a Family A member cannot reply to a Family B post.
// ---------------------------------------------------------------------------

it("denies a Family A member replying to a Family B post", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberBIdentity);
  const familyBPost = await createPostIn(actor, FAMILY_B, "Family B post");

  // MEMBER_A is not an approved member of Family B, so the reply is denied.
  actor.setIdentity(memberAIdentity);
  await expect(
    actor.addBoardReplyForFamily(FAMILY_B, familyBPost.postId, "Cross-family reply."),
  ).rejects.toThrow(new RegExp(MEMBER_MARKER, "i"));

  // The Family B post has no replies.
  actor.setIdentity(memberBIdentity);
  expect(
    await actor.listBoardRepliesForFamily(FAMILY_B, familyBPost.postId),
  ).toEqual([]);
});

// ---------------------------------------------------------------------------
// (4) A replyId from Family B does not resolve through a Norwood context.
//
// Only Norwood has a Steward, so the replyId boundary is driven in the
// direction the API supports: the Norwood Steward's family-scoped removal of a
// Family B replyId behaves like not-found, and the Family B reply survives.
// ---------------------------------------------------------------------------

it("does not resolve a Family B replyId through a Norwood context", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberBIdentity);
  const familyBPost = await createPostIn(actor, FAMILY_B, "Family B reply post");
  const familyBReply = await actor.addBoardReplyForFamily(
    FAMILY_B,
    familyBPost.postId,
    "Family B reply.",
  );

  // The Norwood Steward's Norwood removal of the Family B replyId behaves like
  // not-found: the reply belongs to another family, so nothing is removed.
  actor.setIdentity(adminIdentity);
  const removed = await actor.removeBoardReplyForFamily(
    NORWOOD,
    familyBReply.replyId,
  );
  expect(removed).toEqual([]);

  // The Family B reply is still there.
  actor.setIdentity(memberBIdentity);
  const replies = await actor.listBoardRepliesForFamily(
    FAMILY_B,
    familyBPost.postId,
  );
  expect(replies.map((r) => r.replyId)).toEqual([familyBReply.replyId]);
});

// ---------------------------------------------------------------------------
// (5) Moderation isolation. Only Norwood has a Steward, so the boundary is
//     driven in the direction the API supports: the Norwood Steward cannot
//     moderate Family A content, and an approved Family A member who is not a
//     Steward cannot moderate Family A content either.
// ---------------------------------------------------------------------------

it("denies the Norwood Steward moderating Family A content", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const post = await createPostIn(actor, FAMILY_A, "Family A moderated post");
  await actor.archiveBoardPostForFamily(FAMILY_A, post.postId);

  // The Norwood Steward is not a Steward of Family A, so the Family A hidden
  // listing and restore are denied.
  actor.setIdentity(adminIdentity);
  await expect(actor.listHiddenBoardPostsForFamily(FAMILY_A)).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
  await expect(
    actor.restoreBoardPostForFamily(FAMILY_A, post.postId),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
});

it("denies an approved Family A member who is not a Steward moderating Family A content", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const post = await createPostIn(actor, FAMILY_A, "Family A member-moderated post");
  await actor.archiveBoardPostForFamily(FAMILY_A, post.postId);

  // Approved membership is not Steward authority: the hidden listing and
  // restore are denied.
  await expect(actor.listHiddenBoardPostsForFamily(FAMILY_A)).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
  await expect(
    actor.restoreBoardPostForFamily(FAMILY_A, post.postId),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
});

// ---------------------------------------------------------------------------
// (6) A board attachment created with a post belongs to the same family as the
//     post.
//
// The created Archive item is pending, so it is not visible through the
// approved-item archive search. The observable proof the API supports is the
// cross-family attach gate: the attachment's id, created with a Family A post,
// is rejected when a Family B post tries to attach it by id — which can only
// happen if the item carries Family A.
// ---------------------------------------------------------------------------

it("creates a board attachment in the same family as its post", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const post = await actor.createBoardPostWithMediaForFamily(
    FAMILY_A,
    { General: null },
    ["Family A photo post"],
    "A post with a new upload.",
    [],
    [],
    [
      {
        familyId: FAMILY_A,
        title: "Family A photo",
        description: "A photo uploaded into Family A.",
        itemType: { Photo: null },
        mimeType: "image/png",
        blob,
        filename: "family-a-photo.png",
        era: "2024",
        year: [2024n],
        tags: ["reunion"],
        relatedMemberIds: [],
        relatedBranchId: [],
        sourceStatus: { Original: null },
        privacyLevel: { FamilyOnly: null },
        classification: { Standard: null },
        primarySpeaker: [],
      },
    ],
    ["reunion"],
  );

  expect(post.familyId).toBe(FAMILY_A);
  expect(post.linkedMediaIds).toHaveLength(1);
  const attachmentId = post.linkedMediaIds[0];

  // The Family B member cannot attach the Family A attachment by id: the item
  // belongs to Family A, so the cross-family attach is denied.
  actor.setIdentity(memberBIdentity);
  await expect(
    actor.createBoardPostWithMediaForFamily(
      FAMILY_B,
      { General: null },
      ["Family B attach attempt"],
      "Trying to attach a Family A item.",
      [],
      [attachmentId],
      [],
      [],
    ),
  ).rejects.toThrow(new RegExp(LINKED_MEDIA_MARKER, "i"));

  // The Family A post still links its own attachment.
  actor.setIdentity(memberAIdentity);
  const fetched = await actor.getBoardPostForFamily(FAMILY_A, post.postId);
  expect(fetched).toEqual([
    expect.objectContaining({
      postId: post.postId,
      familyId: FAMILY_A,
      linkedMediaIds: [attachmentId],
    }),
  ]);
});

// ---------------------------------------------------------------------------
// (7) Default Norwood compatibility: the legacy no-familyId board endpoints
//     still work unchanged through the TEMPORARY wrappers.
// ---------------------------------------------------------------------------

it("keeps the legacy Norwood board workflow working end to end", async () => {
  const { actor } = await setupFamilies();

  // The Norwood Steward claims the seeded living 'clayton' profile for
  // MEMBER_A, making them an approved Norwood member.
  actor.setIdentity(memberAIdentity);
  const claim = (await actor.requestProfileClaim("clayton")) as {
    ok: { id: bigint };
  };
  actor.setIdentity(adminIdentity);
  await actor.approveProfileClaim(claim.ok.id);

  // Legacy create writes a Norwood post.
  actor.setIdentity(memberAIdentity);
  const post = await actor.createBoardPost(
    { Announcement: null },
    ["Legacy Norwood post"],
    "A legacy Norwood body.",
    [],
    [],
    ["legacy"],
  );
  expect(post.familyId).toBe(NORWOOD);

  // Legacy list and get resolve it.
  const listed = await actor.listBoardPosts([]);
  expect(listed.map((p) => p.postId)).toContain(post.postId);
  const fetched = await actor.getBoardPost(post.postId);
  expect(fetched).toEqual([
    expect.objectContaining({ postId: post.postId, familyId: NORWOOD }),
  ]);

  // Legacy reply round-trips.
  const reply = await actor.addBoardReply(post.postId, "A legacy reply.");
  expect(reply.familyId).toBe(NORWOOD);
  const replies = await actor.listBoardReplies(post.postId);
  expect(replies.map((r) => r.replyId)).toEqual([reply.replyId]);

  // Legacy tag search matches the post.
  const byTag = await actor.searchBoardPostsByTags(["legacy"]);
  expect(byTag.map((p) => p.postId)).toEqual([post.postId]);

  // Legacy archive hides the post from the active listing and surfaces it in
  // the Steward-only hidden listing.
  actor.setIdentity(adminIdentity);
  const archived = await actor.archiveBoardPost(post.postId);
  expect(archived).toEqual([
    expect.objectContaining({ status: { Archived: null } }),
  ]);
  expect(await actor.listBoardPosts([])).toEqual([]);
  const hidden = await actor.listHiddenBoardPosts();
  expect(hidden.map((p) => p.postId)).toContain(post.postId);
});
