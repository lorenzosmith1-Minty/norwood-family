import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";
import {
  BACKEND_WASM,
  adminIdentity,
  memberAIdentity,
  memberBIdentity,
} from "./lane-helpers";

// ---------------------------------------------------------------------------
// Tenancy — Board default-family characterization.
//
// The requested change gives BoardPost, BoardReply, and the Board media record
// a `familyId` field, adds canonical family-scoped `*ForFamily` endpoints, and
// keeps the existing no-familyId Board endpoints as thin TEMPORARY wrappers
// delegating to the canonical methods with DEFAULT_FAMILY_ID.
//
// This file freezes the OBSERVABLE default-family (Norwood) behavior of the
// legacy no-familyId Board endpoints, which the change must preserve through
// those wrappers. It deliberately does NOT freeze:
//
//   * the absence of a `familyId` field on BoardPost / BoardReply — the change
//     adds one, so asserting its absence would freeze the very thing being
//     changed;
//   * the legacy endpoints as the only implementation — the change makes them
//     thin wrappers over canonical `*ForFamily` methods, and this file must
//     keep passing across that refactor.
//
// What it does freeze is the behavior a default-family user observes today and
// must keep observing:
//
//   1. createBoardPost persists the submitted fields with #Active status and
//      #FamilyOnly privacy, and listBoardPosts returns it newest-first;
//   2. getBoardPost returns an active post by id and null for an unknown id;
//   3. updateBoardPost is author-only (a non-author is rejected) and persists
//      the edited fields;
//   4. addBoardReply / listBoardReplies round-trip a reply chronologically;
//   5. archiveBoardPost hides the post from listBoardPosts and getBoardPost,
//      listHiddenBoardPosts surfaces it to a Steward, and restoreBoardPost
//      brings it back;
//   6. removeBoardReply removes a reply (Steward-only);
//   7. searchBoardPostsByTags matches active posts by tag;
//   8. the legacy authorization gates are unchanged: an anonymous caller and a
//      signed-in non-member are rejected, and the Steward-only endpoints reject
//      a non-Steward.
//
// The frontend suite mocks the actor, so none of this is visible there. This
// file installs the app's own compiled wasm and drives the real public API.
//
// Coverage limit this file cannot close: the family-boundary behavior of the
// canonical `*ForFamily` endpoints is not exercisable here because those
// endpoints do not exist yet; this file is the baseline the cover lane builds
// on. The Board media record's familyId is likewise not asserted here.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

const STEWARD_MARKER =
  "Unauthorized: Only Family Stewards can perform this action";
// The legacy no-familyId endpoints are now thin wrappers over the canonical
// family-scoped methods, so their membership denial comes from the canonical
// family gate: an anonymous caller is denied with the sign-in message, and a
// signed-in but unapproved caller with the family-membership-required message.
// Both are still denied; only the stable message differs from the pre-tenancy
// board-specific wording.
const SIGN_IN_MARKER = "Unauthorized: You must be signed in";
const MEMBER_MARKER =
  "Family membership required. Claim your family profile and wait for Family Steward approval before contributing family content.";

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
async function setupBoard(): Promise<Seeded> {
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

/** Creates a post as MEMBER_A and returns it. */
async function createPost(actor: _SERVICE, title: string, tags: string[] = []) {
  actor.setIdentity(memberAIdentity);
  return actor.createBoardPost(
    { Announcement: null },
    [title],
    `Body for ${title}.`,
    ["hudson"],
    [],
    tags,
  );
}

// ---------------------------------------------------------------------------
// (1) Legacy create persists the submitted fields with #Active / #FamilyOnly,
//     and the legacy listing returns it newest-first.
// ---------------------------------------------------------------------------

it("persists a legacy Norwood post with the submitted fields and lists it newest-first", async () => {
  const { actor } = await setupBoard();

  const first = await createPost(actor, "First post");
  const second = await createPost(actor, "Second post");

  expect(first).toMatchObject({
    postType: { Announcement: null },
    title: ["First post"],
    body: "Body for First post.",
    relatedPersonIds: ["hudson"],
    tags: [],
    status: { Active: null },
    privacyScope: { FamilyOnly: null },
    authorPersonId: "clayton",
  });

  // The listing is newest-first: the second post was created later.
  const listed = await actor.listBoardPosts([]);
  expect(listed.map((p) => p.postId)).toEqual([second.postId, first.postId]);
});

// ---------------------------------------------------------------------------
// (2) Legacy get returns an active post by id and null for an unknown id.
// ---------------------------------------------------------------------------

it("returns an active post by id and null for an unknown id", async () => {
  const { actor } = await setupBoard();

  const post = await createPost(actor, "Lookup post");

  const found = await actor.getBoardPost(post.postId);
  expect(found).toEqual([expect.objectContaining({ postId: post.postId })]);

  const missing = await actor.getBoardPost(9999n);
  expect(missing).toEqual([]);
});

// ---------------------------------------------------------------------------
// (3) Legacy update is author-only and persists the edited fields.
// ---------------------------------------------------------------------------

it("updates the author's own post and rejects a non-author", async () => {
  const { actor } = await setupBoard();

  const post = await createPost(actor, "Editable post");

  // The author edits their own post.
  actor.setIdentity(memberAIdentity);
  const updated = await actor.updateBoardPost(
    post.postId,
    { General: null },
    ["Edited title"],
    "Edited body.",
    [],
    [],
    ["edited"],
  );
  expect(updated).toEqual([
    expect.objectContaining({
      postId: post.postId,
      postType: { General: null },
      title: ["Edited title"],
      body: "Edited body.",
      tags: ["edited"],
    }),
  ]);

  // A different approved member cannot edit someone else's post.
  actor.setIdentity(memberBIdentity);
  await expect(
    actor.updateBoardPost(
      post.postId,
      { General: null },
      ["Hijacked"],
      "Hijacked body.",
      [],
      [],
      [],
    ),
  ).rejects.toThrow(/Only the post author/i);
});

// ---------------------------------------------------------------------------
// (4) Legacy reply round-trip is chronological.
// ---------------------------------------------------------------------------

it("round-trips replies chronologically", async () => {
  const { actor } = await setupBoard();

  const post = await createPost(actor, "Reply post");

  actor.setIdentity(memberBIdentity);
  const firstReply = await actor.addBoardReply(post.postId, "First reply.");
  actor.setIdentity(memberAIdentity);
  const secondReply = await actor.addBoardReply(post.postId, "Second reply.");

  expect(firstReply).toMatchObject({
    postId: post.postId,
    body: "First reply.",
    authorPersonId: "hudson",
  });

  const replies = await actor.listBoardReplies(post.postId);
  expect(replies.map((r) => r.replyId)).toEqual([
    firstReply.replyId,
    secondReply.replyId,
  ]);
});

// ---------------------------------------------------------------------------
// (5) Legacy archive hides the post from the active listing and get, surfaces
//     it in the Steward-only hidden listing, and restore brings it back.
// ---------------------------------------------------------------------------

it("archives a post out of the active listing and restores it", async () => {
  const { actor } = await setupBoard();

  const post = await createPost(actor, "Archivable post");

  // The author archives their own post.
  actor.setIdentity(memberAIdentity);
  const archived = await actor.archiveBoardPost(post.postId);
  expect(archived).toEqual([
    expect.objectContaining({ status: { Archived: null } }),
  ]);

  // It is gone from the active listing and from get.
  expect(await actor.listBoardPosts([])).toEqual([]);
  expect(await actor.getBoardPost(post.postId)).toEqual([]);

  // A Steward sees it in the hidden/moderated listing.
  actor.setIdentity(adminIdentity);
  const hidden = await actor.listHiddenBoardPosts();
  expect(hidden.map((p) => p.postId)).toContain(post.postId);

  // A Steward restores it; it returns to the active listing.
  const restored = await actor.restoreBoardPost(post.postId);
  expect(restored).toEqual([
    expect.objectContaining({ status: { Active: null } }),
  ]);
  expect(await actor.listBoardPosts([])).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// (6) Legacy removeBoardReply removes a reply (Steward-only).
// ---------------------------------------------------------------------------

it("removes a reply as a Steward", async () => {
  const { actor } = await setupBoard();

  const post = await createPost(actor, "Removable reply post");
  actor.setIdentity(memberBIdentity);
  const reply = await actor.addBoardReply(post.postId, "Remove me.");

  actor.setIdentity(adminIdentity);
  const removed = await actor.removeBoardReply(reply.replyId);
  expect(removed).toEqual([expect.objectContaining({ replyId: reply.replyId })]);
  expect(await actor.listBoardReplies(post.postId)).toEqual([]);
});

// ---------------------------------------------------------------------------
// (7) Legacy tag search matches active posts by tag.
// ---------------------------------------------------------------------------

it("searches active posts by tag", async () => {
  const { actor } = await setupBoard();

  const tagged = await createPost(actor, "Tagged post", ["reunion", "family"]);
  await createPost(actor, "Untagged post");

  const byTag = await actor.searchBoardPostsByTags(["reunion"]);
  expect(byTag.map((p) => p.postId)).toEqual([tagged.postId]);

  const noMatch = await actor.searchBoardPostsByTags(["nonexistent"]);
  expect(noMatch).toEqual([]);
});

// ---------------------------------------------------------------------------
// (8) Legacy authorization gates are unchanged.
// ---------------------------------------------------------------------------

it("rejects an anonymous caller and a signed-in non-member", async () => {
  const { canisterId } = await setupBoard();

  // A freshly created actor calls as the anonymous principal until an identity
  // is set.
  const guest = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  await expect(guest.listBoardPosts([])).rejects.toThrow(
    new RegExp(SIGN_IN_MARKER, "i"),
  );

  // A signed-in caller that never claimed a profile is not an approved member.
  // A brand-new identity is registered (so it is a signed-in #user) but has no
  // approved claim.
  const strangerIdentity = createIdentity("board-stranger-seed");
  const strangerActor = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  strangerActor.setIdentity(strangerIdentity);
  await strangerActor._initialize_access_control();
  await expect(strangerActor.listBoardPosts([])).rejects.toThrow(
    new RegExp(MEMBER_MARKER, "i"),
  );
});

it("denies a non-Steward the Steward-only endpoints", async () => {
  const { actor } = await setupBoard();

  const post = await createPost(actor, "Steward-gated post");

  // A signed-in approved member is not a Steward.
  actor.setIdentity(memberAIdentity);
  await expect(actor.listHiddenBoardPosts()).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
  await expect(actor.restoreBoardPost(post.postId)).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
});
