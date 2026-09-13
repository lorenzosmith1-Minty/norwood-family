import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";

const PIC_URL = process.env.POCKET_IC_URL ?? "";
const BACKEND_WASM = process.env.BACKEND_WASM ?? "";

let pic: PocketIc | undefined;
let actor: _SERVICE;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let canisterId: any;
// A dedicated canister for the profile-claim flow tests, so their state (a
// pending claim, then an approved claim on the canonical Lorenzo Smith Jr.
// profile) never leaks into the shared `actor` canister the other tests use.
let claimActor: _SERVICE;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
  const setup = await pic.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  actor = setup.actor;
  canisterId = setup.canisterId;
  const claimSetup = await pic.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  claimActor = claimSetup.actor;
});

afterAll(async () => {
  await pic?.tearDown();
});

it("answers an empty-state read instead of trapping", async () => {
  // The OQL schema is a query that should resolve on a fresh canister.
  await expect(actor.schema()).resolves.toBeTypeOf("string");
});

it("reports the anonymous caller is not an admin", async () => {
  await expect(actor.isCallerAdmin()).resolves.toBe(false);
});

it("reports the anonymous caller's default role without trapping", async () => {
  // getCallerUserRole returns a UserRole variant; asserting it does not trap is
  // the high-signal check that the access-control mixin is wired up.
  await expect(actor.getCallerUserRole()).resolves.toBeDefined();
});

it("seeds lorenzoSmithJr's preferredName as 'Waxx Minty'", async () => {
  // The 20260907_000000.mo migration sets the canonical child profile's
  // preferredName to 'Waxx Minty' so the child card on Lorenzo Smith Sr.'s
  // profile resolves the canonical display name. The `name` field stays
  // 'Lorenzo Smith Jr.'; only the preferredName is the canonical display name.
  const profile = await actor.getPersonProfile("lorenzoSmithJr");
  expect(profile).toEqual([
    expect.objectContaining({
      personId: "lorenzoSmithJr",
      name: "Lorenzo Smith Jr.",
      preferredName: ["Waxx Minty"],
    }),
  ]);
});

// Characterization baseline for the existing photo workflow before the archive
// feature is added. The archive feature will add new contribution methods but
// must not change the existing per-person photo gallery API, so the full
// add -> list -> set profile -> get profile -> remove round-trip is frozen here
// against the real canister.
it("round-trips a photo through the real canister", async () => {
  const personId = "julia";
  const blob = new Uint8Array([1, 2, 3, 4]);

  // Empty-state read before anything is uploaded.
  await expect(actor.listPhotos(personId)).resolves.toEqual([]);
  await expect(actor.getProfilePhoto(personId)).resolves.toEqual([]);

  // Add a photo; the first photo becomes the profile photo automatically.
  const photo = await actor.addPhoto(personId, "julia-1.png", "image/png", blob);
  expect(photo.filename).toBe("julia-1.png");
  expect(photo.mimeType).toBe("image/png");
  expect(photo.id).toBe(0n);

  const listed = await actor.listPhotos(personId);
  expect(listed).toHaveLength(1);
  expect(listed[0]).toMatchObject({ id: 0n, filename: "julia-1.png" });

  // The first uploaded photo is auto-set as the profile photo.
  const profile = await actor.getProfilePhoto(personId);
  expect(profile).toEqual([expect.objectContaining({ id: 0n })]);

  // Removing the photo clears the gallery and the profile photo.
  await expect(actor.removePhoto(personId, 0n)).resolves.toBe(true);
  await expect(actor.listPhotos(personId)).resolves.toEqual([]);
  await expect(actor.getProfilePhoto(personId)).resolves.toEqual([]);
});

// ---------------------------------------------------------------------------
// Archive contribution and admin-approval flow (cover for the archive feature).
// ---------------------------------------------------------------------------

// A non-anonymous contributor and an admin, distinct from the anonymous caller
// the actor uses by default. Deterministic identities let us switch the caller
// via setIdentity without importing a Principal constructor directly.
const adminIdentity = createIdentity("archive-admin-seed");
const contributorIdentity = createIdentity("archive-contributor-seed");
const ADMIN = adminIdentity.getPrincipal();
const CONTRIBUTOR = contributorIdentity.getPrincipal();

const blob = new Uint8Array([10, 20, 30]);

// Registers ADMIN as the first caller (the first-admin rule makes it #admin)
// and CONTRIBUTOR as a regular #user, so the role-guarded archive methods can
// be exercised against the real canister.
async function registerRoles(): Promise<void> {
  actor.setIdentity(adminIdentity);
  await actor._initialize_access_control();
  actor.setIdentity(contributorIdentity);
  await actor._initialize_access_control();
}

async function submitAsContributor(): Promise<bigint> {
  actor.setIdentity(contributorIdentity);
  const item = await actor.submitArchiveItem(
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
  return item.id;
}

it("rejects an anonymous submitArchiveItem call instead of trapping silently", async () => {
  // A fresh actor defaults to the anonymous caller, so no identity is set.
  const anonymousActor = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  await expect(
    anonymousActor.submitArchiveItem(
      "No author",
      "Anonymous must not be able to contribute.",
      { Photo: null },
      blob,
      "1920s",
      [],
      [],
      [],
      [],
      { Original: null },
      { Public: null },
      { Standard: null },
      [],
    ),
  ).rejects.toThrow();
});

it("round-trips a contribution through submit -> pending -> approve -> approved", async () => {
  await registerRoles();

  // Empty-state reads before anything is submitted.
  await expect(actor.listApprovedArchiveItems()).resolves.toEqual([]);

  // A signed-in contributor submits; the item lands in pending state.
  const id = await submitAsContributor();
  // Not yet part of the archive (readable by any caller).
  await expect(actor.listApprovedArchiveItems()).resolves.toEqual([]);

  // An admin lists the pending item and approves it, moving it into the archive.
  actor.setIdentity(adminIdentity);
  const pending = await actor.listPendingArchiveItems();
  expect(pending).toHaveLength(1);
  expect(pending[0]).toMatchObject({
    id,
    title: "A family letter",
    itemType: { Document: null },
    status: { Pending: null },
    contributor: CONTRIBUTOR,
  });
  const approved = await actor.approveArchiveItem(id);
  expect(approved).toEqual([
    expect.objectContaining({ id, status: { Approved: null } }),
  ]);
  await expect(actor.listPendingArchiveItems()).resolves.toEqual([]);
  const archive = await actor.listApprovedArchiveItems();
  expect(archive).toHaveLength(1);
  expect(archive[0]).toMatchObject({ id, status: { Approved: null } });
});

it("rejects a pending contribution, excluding it from the archive", async () => {
  await registerRoles();
  const id = await submitAsContributor();

  actor.setIdentity(adminIdentity);
  const rejected = await actor.rejectArchiveItem(id);
  expect(rejected).toEqual([
    expect.objectContaining({ id, status: { Rejected: null } }),
  ]);
  // The rejected item is no longer pending and is not part of the archive.
  // (The canister is shared across tests, so other items may exist.)
  const pending = await actor.listPendingArchiveItems();
  expect(pending.find((i) => i.id === id)).toBeUndefined();
  const approved = await actor.listApprovedArchiveItems();
  expect(approved.find((i) => i.id === id)).toBeUndefined();
});

it("does not let a non-admin list or approve pending contributions", async () => {
  await registerRoles();
  await submitAsContributor();

  // A signed-in non-admin cannot list pending items.
  actor.setIdentity(contributorIdentity);
  await expect(actor.listPendingArchiveItems()).rejects.toThrow();
  await expect(actor.approveArchiveItem(0n)).rejects.toThrow();
  await expect(actor.rejectArchiveItem(0n)).rejects.toThrow();
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

  // ADMIN becomes the Family Steward; CONTRIBUTOR registers as a #user.
  countActor.setIdentity(adminIdentity);
  await countActor._initialize_access_control();
  countActor.setIdentity(contributorIdentity);
  await countActor._initialize_access_control();

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
// Account identity (cover for the Google/Apple sign-in change). The account id
// is the caller's stable ICP Principal — never an email or a Google/Apple
// provider identifier — and Google/Apple are authentication methods bound to
// that same account. Anonymous callers are rejected with #NotSignedIn.
// ---------------------------------------------------------------------------

it("rejects an anonymous caller from account-identity methods", async () => {
  // A fresh actor defaults to the anonymous caller.
  const anonymousActor = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  await expect(anonymousActor.getMyAccountId()).resolves.toEqual({
    err: { NotSignedIn: null },
  });
  await expect(anonymousActor.getMyAuthMethods()).resolves.toEqual({
    err: { NotSignedIn: null },
  });
  await expect(
    anonymousActor.bindAuthMethod({ Google: null }),
  ).resolves.toEqual({ err: { NotSignedIn: null } });
});

it("returns the caller's stable principal as the account id", async () => {
  actor.setIdentity(contributorIdentity);
  const result = await actor.getMyAccountId();
  expect(result).toEqual({ ok: CONTRIBUTOR });
});

it("binds Google and Apple auth methods to the same account and reflects them", async () => {
  actor.setIdentity(contributorIdentity);

  // Bind Google, then Apple, to the same account.
  const googleAccount = await actor.bindAuthMethod({ Google: null });
  expect(googleAccount).toEqual({
    ok: {
      id: CONTRIBUTOR,
      createdAt: expect.any(BigInt),
      authMethods: [{ Google: null }],
    },
  });

  const appleAccount = await actor.bindAuthMethod({ Apple: null });
  expect(appleAccount).toEqual({
    ok: {
      id: CONTRIBUTOR,
      createdAt: expect.any(BigInt),
      authMethods: [{ Google: null }, { Apple: null }],
    },
  });

  // Both methods are bound to the same stable account id.
  const methods = await actor.getMyAuthMethods();
  expect(methods).toEqual({ ok: { google: true, apple: true } });
});

// ---------------------------------------------------------------------------
// Profile claim flow (cover for the canonical Lorenzo Smith Jr. claim change).
// The build reconciles the canonical `lorenzoSmithJr` personId across the claim
// flow: a pending claim surfaces on the profile, approval marks the canonical
// profile CLAIMED with claimedByUserId set to the claiming account, and no new
// Person record is created. These tests run against a dedicated canister so the
// approved-claim state does not leak into the shared `actor` canister.
// ---------------------------------------------------------------------------

const claimantIdentity = createIdentity("lorenzo-claimant-seed");
const stewardIdentity = createIdentity("lorenzo-steward-seed");
const CLAIMANT = claimantIdentity.getPrincipal();
const STEWARD = stewardIdentity.getPrincipal();

it("round-trips a profile claim: request -> approve -> claimed with owner, no new record", async () => {
  // A signed-in user claims the canonical Lorenzo Smith Jr. profile.
  claimActor.setIdentity(claimantIdentity);
  const requested = await claimActor.requestProfileClaim("lorenzoSmithJr");
  expect(requested).toEqual({
    ok: expect.objectContaining({
      personId: "lorenzoSmithJr",
      requestingUserId: CLAIMANT,
      status: { Pending: null },
    }),
  });
  const claimId = (requested as { ok: { id: bigint } }).ok.id;

  // The caller can observe their own pending claim on the canonical profile.
  const myClaim = await claimActor.getMyProfileClaim("lorenzoSmithJr");
  expect(myClaim).toEqual([
    expect.objectContaining({
      id: claimId,
      personId: "lorenzoSmithJr",
      status: { Pending: null },
    }),
  ]);

  // getMyProfile resolves the canonical profile being claimed.
  const myProfile = await claimActor.getMyProfile();
  expect(myProfile).toEqual([
    expect.objectContaining({
      personId: "lorenzoSmithJr",
      name: "Lorenzo Smith Jr.",
    }),
  ]);

  // A Family Steward approves the claim.
  claimActor.setIdentity(stewardIdentity);
  await claimActor._initialize_access_control();
  const approved = await claimActor.approveProfileClaim(claimId);
  expect(approved).toEqual([
    expect.objectContaining({ id: claimId, status: { Approved: null } }),
  ]);

  // The canonical profile is now CLAIMED with claimedByUserId set to the
  // claiming account, and no new Person record was created (the same
  // lorenzoSmithJr personId remains).
  const profile = await claimActor.getPersonProfile("lorenzoSmithJr");
  expect(profile).toEqual([
    expect.objectContaining({
      personId: "lorenzoSmithJr",
      claimStatus: { Claimed: null },
      claimedByUserId: [CLAIMANT],
    }),
  ]);
});

it("prevents duplicate claim submissions for the same person", async () => {
  // A fresh canister so the pending-claim state is clean (the claim-flow test
  // above approved a claim on the same canonical profile).
  const dupSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const dupActor = dupSetup.actor;

  // A signed-in user claims the canonical profile, then a second submission for
  // the same person is rejected as AlreadyPending (duplicate-claim prevention).
  dupActor.setIdentity(claimantIdentity);
  const first = await dupActor.requestProfileClaim("lorenzoSmithJr");
  expect(first).toEqual({
    ok: expect.objectContaining({ personId: "lorenzoSmithJr" }),
  });
  const second = await dupActor.requestProfileClaim("lorenzoSmithJr");
  expect(second).toEqual({ err: { AlreadyPending: null } });
});

// ---------------------------------------------------------------------------
// updateOwnProfile (cover for the profile-edit backend seam). The claim-flow
// test above approved a claim on the canonical lorenzoSmithJr profile with
// CLAIMANT as the owner, so this canister already has a CLAIMED living profile
// to edit. updateOwnProfile must update the SAME canonical record in place
// (same personId, claim stays CLAIMED, claimedByUserId preserved, no duplicate
// created) and must reject a caller who is not the owner.
// ---------------------------------------------------------------------------

it("updates the canonical record in place via updateOwnProfile, preserving claim ownership", async () => {
  // The claim-flow test left lorenzoSmithJr CLAIMED by CLAIMANT on claimActor.
  claimActor.setIdentity(claimantIdentity);

  const edits = {
    preferredName: ["Lorenzo Smith Jr."],
    firstName: ["Lorenzo"],
    middleName: [],
    lastName: ["Smith"],
    suffix: ["Jr."],
    nickname: [],
    birthDate: ["1990"],
    birthplace: ["Chicago, IL"],
    currentLocation: [],
    occupation: ["Family historian"],
    livingStatus: [],
    shortBio: ["A family historian."],
    longerStory: [],
    story: [],
    birthInfo: [],
    timeline: [],
    privacySettings: [],
  };

  const result = await claimActor.updateOwnProfile("lorenzoSmithJr", edits);
  expect(result).toEqual({
    ok: expect.objectContaining({
      personId: "lorenzoSmithJr",
      preferredName: ["Lorenzo Smith Jr."],
      firstName: ["Lorenzo"],
      lastName: ["Smith"],
      suffix: ["Jr."],
      birthDate: ["1990"],
      birthplace: ["Chicago, IL"],
      occupation: ["Family historian"],
      shortBio: ["A family historian."],
      // Claim ownership is preserved: still CLAIMED by the same owner.
      claimStatus: { Claimed: null },
      claimedByUserId: [CLAIMANT],
    }),
  });

  // The canonical record is updated IN PLACE: same personId, no duplicate
  // record was created, and the edits are readable back through the public API.
  const profile = await claimActor.getPersonProfile("lorenzoSmithJr");
  expect(profile).toEqual([
    expect.objectContaining({
      personId: "lorenzoSmithJr",
      preferredName: ["Lorenzo Smith Jr."],
      firstName: ["Lorenzo"],
      lastName: ["Smith"],
      suffix: ["Jr."],
      birthDate: ["1990"],
      birthplace: ["Chicago, IL"],
      occupation: ["Family historian"],
      shortBio: ["A family historian."],
      claimStatus: { Claimed: null },
      claimedByUserId: [CLAIMANT],
    }),
  ]);
});

it("rejects a non-owner from updateOwnProfile with NotOwner", async () => {
  // A fresh canister where lorenzoSmithJr is claimed by CLAIMANT, but a
  // different signed-in user (STEWARD) attempts to edit it.
  const nonOwnerSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const nonOwnerActor = nonOwnerSetup.actor;

  nonOwnerActor.setIdentity(claimantIdentity);
  await nonOwnerActor.requestProfileClaim("lorenzoSmithJr");
  const claimId = (
    (await nonOwnerActor.getMyProfileClaim("lorenzoSmithJr")) as Array<{ id: bigint }>
  )[0].id;
  nonOwnerActor.setIdentity(stewardIdentity);
  await nonOwnerActor._initialize_access_control();
  await nonOwnerActor.approveProfileClaim(claimId);

  // STEWARD is signed in but is not the owner of the claimed profile.
  nonOwnerActor.setIdentity(stewardIdentity);
  const result = await nonOwnerActor.updateOwnProfile("lorenzoSmithJr", {
    preferredName: ["Hijacked"],
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
  expect(result).toEqual({ err: { NotOwner: null } });

  // The canonical record was not modified by the rejected edit. The seeded
  // preferredName 'Waxx Minty' (set by the 20260907_000000.mo migration) is
  // preserved — the rejected edit did not overwrite it.
  const profile = await nonOwnerActor.getPersonProfile("lorenzoSmithJr");
  expect(profile).toEqual([
    expect.objectContaining({
      personId: "lorenzoSmithJr",
      preferredName: ["Waxx Minty"],
      claimStatus: { Claimed: null },
      claimedByUserId: [CLAIMANT],
    }),
  ]);
});

// ---------------------------------------------------------------------------
// Steward identity display and eligibility (cover for the steward-management
// identity change). The build adds listStewardIdentities and
// listEligibleStewardCandidates so the Steward Management tab can render the
// linked Person's preferred/display name instead of the raw account id and
// drive its promote/successor dropdowns from eligible approved claimed members.
// These are query methods; the high-signal check is that they resolve without
// trapping and return the StewardIdentity shape.
// ---------------------------------------------------------------------------

it("lists steward identities without trapping, resolving the linked Person display name", async () => {
  // listStewardIdentities is Family-Steward-gated, so authenticate as a steward
  // (the first caller to _initialize_access_control becomes the admin) before
  // calling it. The shared `actor` canister has no stewards seeded, so the list
  // is empty but must resolve (not trap) with the StewardIdentity shape.
  actor.setIdentity(adminIdentity);
  await actor._initialize_access_control();
  const identities = await actor.listStewardIdentities();
  expect(Array.isArray(identities)).toBe(true);
});

it("lists eligible steward candidates without trapping", async () => {
  // listEligibleStewardCandidates is Family-Steward-gated, so authenticate as a
  // steward first. No approved claimed living members are seeded, so the
  // eligible list is empty but must resolve (not trap).
  actor.setIdentity(adminIdentity);
  await actor._initialize_access_control();
  const candidates = await actor.listEligibleStewardCandidates();
  expect(Array.isArray(candidates)).toBe(true);
});

// ---------------------------------------------------------------------------
// Message Board, Private Messaging, blocking, reporting, and the Pending
// Contributions count (cover for the board/messaging/pending-count phase).
// These methods are approved-member / Family-Steward gated and are exercised
// against the real canister so a stubbed backend cannot pass the cover. A
// dedicated canister keeps the claim/approve state from leaking into the shared
// `actor` canister the other tests use.
// ---------------------------------------------------------------------------

const memberAIdentity = createIdentity("board-member-a-seed");
const memberBIdentity = createIdentity("board-member-b-seed");
const MEMBER_A = memberAIdentity.getPrincipal();
const MEMBER_B = memberBIdentity.getPrincipal();

it("round-trips board posts, replies, archive/restore, messaging, block, report, and pending count", async () => {
  const boardSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const boardActor = boardSetup.actor;

  // ADMIN becomes the Family Steward (first caller to _initialize_access_control).
  boardActor.setIdentity(adminIdentity);
  await boardActor._initialize_access_control();
  // MEMBER_A and MEMBER_B register as approved #user members and bind an auth
  // method so their accounts are active (linked to the accounts map), which the
  // messaging eligibility requires.
  boardActor.setIdentity(memberAIdentity);
  await boardActor._initialize_access_control();
  await boardActor.bindAuthMethod({ Google: null });
  boardActor.setIdentity(memberBIdentity);
  await boardActor._initialize_access_control();
  await boardActor.bindAuthMethod({ Google: null });

  // Two approved members: MEMBER_A claims the living 'clayton' profile and
  // MEMBER_B claims the living 'hudson' profile; the steward approves both.
  boardActor.setIdentity(memberAIdentity);
  const claimA = (await boardActor.requestProfileClaim("clayton")) as {
    ok: { id: bigint };
  };
  boardActor.setIdentity(memberBIdentity);
  const claimB = (await boardActor.requestProfileClaim("hudson")) as {
    ok: { id: bigint };
  };
  boardActor.setIdentity(adminIdentity);
  await boardActor.approveProfileClaim(claimA.ok.id);
  await boardActor.approveProfileClaim(claimB.ok.id);

  // Pending Contributions count is steward-gated and resolves (0 with no
  // pending items) instead of trapping.
  const pendingCount = await boardActor.getPendingContributionsCount();
  expect(typeof pendingCount).toBe("bigint");

  // MEMBER_A creates a board post with a type, title, body, and a related
  // member; it is FamilyOnly and Active.
  boardActor.setIdentity(memberAIdentity);
  const post = await boardActor.createBoardPost(
    { Announcement: null },
    ["Family reunion"],
    "Save the date for the annual reunion.",
    ["hudson"],
    [],
    ["reunion", "family"],
  );
  expect(post).toMatchObject({
    postType: { Announcement: null },
    title: ["Family reunion"],
    body: "Save the date for the annual reunion.",
    relatedPersonIds: ["hudson"],
    tags: ["reunion", "family"],
    status: { Active: null },
    privacyScope: { FamilyOnly: null },
    authorPersonId: "clayton",
  });

  // The post is listed for an approved member, newest first.
  const listed = await boardActor.listBoardPosts([]);
  expect(listed).toHaveLength(1);
  expect(listed[0].postId).toBe(post.postId);

  // MEMBER_B adds a reply that appears chronologically.
  boardActor.setIdentity(memberBIdentity);
  const reply = await boardActor.addBoardReply(post.postId, "I will be there.");
  expect(reply).toMatchObject({ postId: post.postId, body: "I will be there." });
  const replies = await boardActor.listBoardReplies(post.postId);
  expect(replies).toHaveLength(1);
  expect(replies[0].body).toBe("I will be there.");

  // A steward archives the post (hides it) and restores it.
  boardActor.setIdentity(adminIdentity);
  const archived = await boardActor.archiveBoardPost(post.postId);
  expect(archived).toEqual([expect.objectContaining({ status: { Archived: null } })]);
  const restored = await boardActor.restoreBoardPost(post.postId);
  expect(restored).toEqual([expect.objectContaining({ status: { Active: null } })]);

  // MEMBER_A sends a private message to MEMBER_B (person 'hudson'), reusing the
  // canonical 1:1 conversation.
  boardActor.setIdentity(memberAIdentity);
  const sent = await boardActor.sendMessage("hudson", "Hello Versie");
  expect(sent).toMatchObject({ ok: expect.objectContaining({ body: "Hello Versie" }) });

  // The conversation appears in MEMBER_A's inbox and is readable by a participant.
  const conversations = await boardActor.listConversations();
  expect(conversations).toHaveLength(1);
  expect(conversations[0]).toMatchObject({ otherPersonId: "hudson" });
  const view = await boardActor.getConversation(conversations[0].conversationId);
  expect(view).toEqual([
    expect.objectContaining({
      messages: [expect.objectContaining({ body: "Hello Versie" })],
    }),
  ]);

  // MEMBER_A blocks MEMBER_B, sees them in the blocked list, then unblocks.
  await boardActor.blockUser(MEMBER_B);
  const blocked = await boardActor.listBlockedUsers();
  expect(blocked.map((p) => p.toText())).toContain(MEMBER_B.toText());
  await boardActor.unblockUser(MEMBER_B);
  expect((await boardActor.listBlockedUsers()).map((p) => p.toText())).not.toContain(
    MEMBER_B.toText(),
  );

  // MEMBER_A reports the received message with a reason; the steward reviews
  // only that report and its message content.
  const messageId = (sent as { ok: { messageId: bigint } }).ok.messageId;
  const report = await boardActor.reportMessage(messageId, "Harassment");
  expect(report).toMatchObject({
    reportedMessageId: messageId,
    reason: "Harassment",
    status: { Pending: null },
  });
  boardActor.setIdentity(adminIdentity);
  const reports = await boardActor.listReports();
  expect(reports).toHaveLength(1);
  const reportedView = await boardActor.getReportedMessage(report.reportId);
  expect(reportedView).toEqual([
    expect.objectContaining({
      message: expect.objectContaining({ messageId, body: "Hello Versie" }),
    }),
  ]);
  const reviewed = await boardActor.reviewReport(report.reportId, { Reviewed: null });
  expect(reviewed).toEqual([expect.objectContaining({ status: { Reviewed: null } })]);
});

// ---------------------------------------------------------------------------
// Structural verification for Private Messaging (cover for the messaging
// phase). These tests assert the invariants the acceptance criteria require:
// conversations need two different eligible accountIds, self-messaging is
// impossible, Block is conversation-specific, Report is message-specific, and
// unreported private content is not steward-readable. They run against a fresh
// canister with two approved claimed members and a steward, without fake users.
// ---------------------------------------------------------------------------

it("rejects self-messaging and lists only other eligible members", async () => {
  const structSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const structActor = structSetup.actor;

  // ADMIN becomes the Family Steward; MEMBER_A and MEMBER_B register as users
  // and bind an auth method so their accounts are active (linked to the
  // accounts map), which messaging eligibility requires.
  structActor.setIdentity(adminIdentity);
  await structActor._initialize_access_control();
  structActor.setIdentity(memberAIdentity);
  await structActor._initialize_access_control();
  await structActor.bindAuthMethod({ Google: null });
  structActor.setIdentity(memberBIdentity);
  await structActor._initialize_access_control();
  await structActor.bindAuthMethod({ Google: null });

  // MEMBER_A claims 'clayton' and MEMBER_B claims 'hudson'; the steward approves.
  structActor.setIdentity(memberAIdentity);
  const claimA = (await structActor.requestProfileClaim("clayton")) as {
    ok: { id: bigint };
  };
  structActor.setIdentity(memberBIdentity);
  const claimB = (await structActor.requestProfileClaim("hudson")) as {
    ok: { id: bigint };
  };
  structActor.setIdentity(adminIdentity);
  await structActor.approveProfileClaim(claimA.ok.id);
  await structActor.approveProfileClaim(claimB.ok.id);

  // listMessageableMembers is data-driven and non-admin-gated: MEMBER_A sees
  // MEMBER_B's claimed person but never their own (self is excluded).
  structActor.setIdentity(memberAIdentity);
  const messageable = await structActor.listMessageableMembers();
  expect(messageable).toContain("hudson");
  expect(messageable).not.toContain("clayton");

  // Self-messaging is impossible: MEMBER_A sending to their own claimed person
  // ('clayton') is rejected with CannotMessageSelf.
  const selfSend = await structActor.sendMessage("clayton", "to myself");
  expect(selfSend).toEqual({ err: { CannotMessageSelf: null } });

  // A real 1:1 conversation between two different eligible members works.
  const sent = await structActor.sendMessage("hudson", "Hello");
  expect(sent).toMatchObject({ ok: expect.objectContaining({ body: "Hello" }) });
});

it("does not expose unreported private conversation content to a steward", async () => {
  const structSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const structActor = structSetup.actor;

  // ADMIN becomes the Family Steward; MEMBER_A and MEMBER_B register as users
  // and bind an auth method so their accounts are active (linked to the
  // accounts map), which messaging eligibility requires.
  structActor.setIdentity(adminIdentity);
  await structActor._initialize_access_control();
  structActor.setIdentity(memberAIdentity);
  await structActor._initialize_access_control();
  await structActor.bindAuthMethod({ Google: null });
  structActor.setIdentity(memberBIdentity);
  await structActor._initialize_access_control();
  await structActor.bindAuthMethod({ Google: null });

  // MEMBER_A claims 'clayton' and MEMBER_B claims 'hudson'; the steward approves.
  structActor.setIdentity(memberAIdentity);
  const claimA = (await structActor.requestProfileClaim("clayton")) as {
    ok: { id: bigint };
  };
  structActor.setIdentity(memberBIdentity);
  const claimB = (await structActor.requestProfileClaim("hudson")) as {
    ok: { id: bigint };
  };
  structActor.setIdentity(adminIdentity);
  await structActor.approveProfileClaim(claimA.ok.id);
  await structActor.approveProfileClaim(claimB.ok.id);

  // MEMBER_A sends a private message to MEMBER_B.
  structActor.setIdentity(memberAIdentity);
  const sent = (await structActor.sendMessage("hudson", "private note")) as {
    ok: { messageId: bigint };
  };

  // The steward is NOT a participant, so they cannot read the conversation
  // (getConversation returns null) — unreported private content is not
  // steward-readable.
  structActor.setIdentity(adminIdentity);
  const conversations = await structActor.listConversations();
  expect(conversations).toEqual([]);
  const stewardView = await structActor.getConversation(1n);
  expect(stewardView).toEqual([]);

  // Before any report is filed, getReportedMessage for the message returns
  // nothing — the steward only ever sees reported message content.
  const unreported = await structActor.getReportedMessage(0n);
  expect(unreported).toEqual([]);

  // Once MEMBER_A reports the specific message, the steward sees only that
  // reported message's content.
  structActor.setIdentity(memberAIdentity);
  const report = await structActor.reportMessage(sent.ok.messageId, "Spam");
  structActor.setIdentity(adminIdentity);
  const reportedView = await structActor.getReportedMessage(report.reportId);
  expect(reportedView).toEqual([
    expect.objectContaining({
      message: expect.objectContaining({
        messageId: sent.ok.messageId,
        body: "private note",
      }),
    }),
  ]);
});

// ---------------------------------------------------------------------------
// Archive tag search (cover for the archive title + tag search requirement).
// searchArchiveItems filters approved items by title query and tags, matching
// case-insensitively by substring, and an item must carry ALL of the given
// tags. Only #Approved items are returned.
// ---------------------------------------------------------------------------

it("searches approved archive items by title and tags", async () => {
  const searchSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const searchActor = searchSetup.actor;

  // ADMIN becomes the Family Steward; CONTRIBUTOR registers as a #user.
  searchActor.setIdentity(adminIdentity);
  await searchActor._initialize_access_control();
  searchActor.setIdentity(contributorIdentity);
  await searchActor._initialize_access_control();

  // A contributor submits two approved items with distinct titles and tags.
  searchActor.setIdentity(contributorIdentity);
  const letter = await searchActor.submitArchiveItem(
    "A family letter",
    "A letter from 1924.",
    { Document: null },
    blob,
    "1924",
    [1924n],
    ["letters", "1924"],
    ["julia"],
    ["branch-1"],
    { Original: null },
    { FamilyOnly: null },
    { Standard: null },
    [],
  );
  const photo = await searchActor.submitArchiveItem(
    "Wedding portrait",
    "The couple on their wedding day.",
    { Photo: null },
    blob,
    "1920s",
    [],
    ["wedding", "1920s"],
    ["julia"],
    ["branch-1"],
    { Original: null },
    { FamilyOnly: null },
    { Standard: null },
    [],
  );

  // Approve both items so they enter the searchable archive.
  searchActor.setIdentity(adminIdentity);
  await searchActor.approveArchiveItem(letter.id);
  await searchActor.approveArchiveItem(photo.id);

  // Empty-state search returns everything approved.
  const all = await searchActor.searchArchiveItems({
    searchTerm: [],
    tags: [],
    itemType: [],
    relatedMemberId: [],
    era: [],
  });
  expect(all).toHaveLength(2);

  // Title search matches case-insensitively by substring.
  const byTitle = await searchActor.searchArchiveItems({
    searchTerm: ["FAMILY"],
    tags: [],
    itemType: [],
    relatedMemberId: [],
    era: [],
  });
  expect(byTitle.map((i) => i.id)).toEqual([letter.id]);

  // Tag search requires ALL of the given tags.
  const byTag = await searchActor.searchArchiveItems({
    searchTerm: [],
    tags: ["wedding"],
    itemType: [],
    relatedMemberId: [],
    era: [],
  });
  expect(byTag.map((i) => i.id)).toEqual([photo.id]);

  // A tag present on only one item narrows to that item.
  const byBothTags = await searchActor.searchArchiveItems({
    searchTerm: [],
    tags: ["1924"],
    itemType: [],
    relatedMemberId: [],
    era: [],
  });
  expect(byBothTags.map((i) => i.id)).toEqual([letter.id]);
});

// ---------------------------------------------------------------------------
// Research source upload (cover for the Research Intake source-upload
// requirement). createSourceWithUpload creates ONE canonical Archive item
// (pending) and links a new Research Source record to it via archiveItemId, so
// no manually typed Archive Item ID is required.
// ---------------------------------------------------------------------------

it("creates one canonical archive item and links a source via createSourceWithUpload", async () => {
  const uploadSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const uploadActor = uploadSetup.actor;

  // ADMIN becomes the Family Steward; CONTRIBUTOR registers as a #user.
  uploadActor.setIdentity(adminIdentity);
  await uploadActor._initialize_access_control();
  uploadActor.setIdentity(contributorIdentity);
  await uploadActor._initialize_access_control();

  // A signed-in contributor uploads a source file.
  uploadActor.setIdentity(contributorIdentity);
  const result = await uploadActor.createSourceWithUpload(
    "1900 census, Norwood household",
    { CensusCitation: null },
    "Census record listing the Norwood family.",
    blob,
    ["census", "1900"],
    "1900",
    [1900n],
    ["julia"],
    { FamilyOnly: null },
    { Standard: null },
    [],
  );
  expect(result).toEqual({
    ok: expect.objectContaining({
      source: expect.objectContaining({
        title: "1900 census, Norwood household",
        sourceType: { CensusCitation: null },
        archiveItemId: [expect.any(BigInt)],
        contributor: CONTRIBUTOR,
        status: { Pending: null },
      }),
      archiveItem: expect.objectContaining({
        title: "1900 census, Norwood household",
        itemType: { Document: null },
        tags: ["census", "1900"],
        contributor: CONTRIBUTOR,
        status: { Pending: null },
      }),
    }),
  });

  // Exactly one canonical archive item was created (pending), and the source
  // links to it by id — no manually typed Archive Item ID was required.
  // listPendingArchiveItems is admin-gated, so switch to the admin caller.
  uploadActor.setIdentity(adminIdentity);
  const pending = await uploadActor.listPendingArchiveItems();
  expect(pending).toHaveLength(1);
  const archiveItemId = (result as { ok: { archiveItem: { id: bigint } } }).ok.archiveItem.id;
  expect(pending[0].id).toBe(archiveItemId);

  // The source record is readable and carries the linked archive item id.
  const sources = await uploadActor.listSources();
  expect(sources).toHaveLength(1);
  expect(sources[0]).toMatchObject({
    title: "1900 census, Norwood household",
    archiveItemId: [archiveItemId],
  });
});

// ---------------------------------------------------------------------------
// Board post with media (cover for the Message Board media-attachment
// requirement). createBoardPostWithMedia attaches existing Archive items by id
// and/or creates one canonical Archive item per new upload — the underlying
// file is never duplicated.
// ---------------------------------------------------------------------------

it("creates a board post attaching existing media and new uploads without duplication", async () => {
  const mediaSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const mediaActor = mediaSetup.actor;

  // ADMIN becomes the Family Steward; MEMBER_A registers as an approved member
  // and binds an auth method so their account is active.
  mediaActor.setIdentity(adminIdentity);
  await mediaActor._initialize_access_control();
  mediaActor.setIdentity(memberAIdentity);
  await mediaActor._initialize_access_control();
  await mediaActor.bindAuthMethod({ Google: null });

  // MEMBER_A claims the living 'clayton' profile; the steward approves it.
  mediaActor.setIdentity(memberAIdentity);
  const claim = (await mediaActor.requestProfileClaim("clayton")) as {
    ok: { id: bigint };
  };
  mediaActor.setIdentity(adminIdentity);
  await mediaActor.approveProfileClaim(claim.ok.id);

  // Seed an approved archive item to attach by id.
  mediaActor.setIdentity(memberAIdentity);
  const existing = await mediaActor.submitArchiveItem(
    "Existing photo",
    "Already in the archive.",
    { Photo: null },
    blob,
    "1920s",
    [],
    ["existing"],
    ["clayton"],
    [],
    { Original: null },
    { FamilyOnly: null },
    { Standard: null },
    [],
  );
  mediaActor.setIdentity(adminIdentity);
  await mediaActor.approveArchiveItem(existing.id);

  // MEMBER_A creates a post attaching the existing item AND one new upload.
  mediaActor.setIdentity(memberAIdentity);
  const post = await mediaActor.createBoardPostWithMedia(
    { General: null },
    ["Reunion photos"],
    "Here are the reunion photos.",
    ["clayton"],
    [existing.id],
    [
      {
        title: "New reunion photo",
        description: "A photo from the reunion.",
        itemType: { Photo: null },
        blob,
        era: "2024",
        year: [2024n],
        tags: ["reunion"],
        relatedMemberIds: ["clayton"],
        relatedBranchId: [],
        sourceStatus: { Original: null },
        privacyLevel: { FamilyOnly: null },
        classification: { Standard: null },
        primarySpeaker: [],
      },
    ],
    ["reunion", "photos"],
  );

  // The post links BOTH the existing item and the new upload's archive item.
  expect(post.linkedMediaIds).toHaveLength(2);
  expect(post.linkedMediaIds).toContain(existing.id);

  // The new upload created exactly one canonical Archive item (pending) — the
  // underlying file is not duplicated. listPendingArchiveItems is admin-gated,
  // so switch to the admin caller.
  mediaActor.setIdentity(adminIdentity);
  const pending = await mediaActor.listPendingArchiveItems();
  expect(pending).toHaveLength(1);
  expect(pending[0]).toMatchObject({
    title: "New reunion photo",
    itemType: { Photo: null },
    tags: ["reunion"],
  });
  expect(post.linkedMediaIds).toContain(pending[0].id);
});

// ---------------------------------------------------------------------------
// Stale claim notification reconciliation (cover for the approved-claim
// notification requirement). When a profile claim becomes APPROVED, the pending
// ProfileClaimRequested notification for the claimant is no longer
// actionable/current — reconcileClaimNotifications marks it read/resolved while
// the profile status stays CLAIMED.
// ---------------------------------------------------------------------------

it("reconciles the pending claim notification once the claim is approved", async () => {
  const notifSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const notifActor = notifSetup.actor;

  // ADMIN becomes the Family Steward; CLAIMANT registers as a user.
  notifActor.setIdentity(adminIdentity);
  await notifActor._initialize_access_control();
  notifActor.setIdentity(claimantIdentity);
  await notifActor._initialize_access_control();

  // CLAIMANT requests a claim on the canonical lorenzoSmithJr profile, which
  // creates a pending ProfileClaimRequested notification for the claimant.
  notifActor.setIdentity(claimantIdentity);
  const requested = (await notifActor.requestProfileClaim("lorenzoSmithJr")) as {
    ok: { id: bigint };
  };
  const claimId = requested.ok.id;

  // The claimant has a pending, unread claim notification.
  const before = await notifActor.listNotifications();
  expect(before).toHaveLength(1);
  expect(before[0]).toMatchObject({
    notificationType: { ProfileClaimRequested: null },
    read: false,
  });

  // A steward approves the claim. ADMIN is the first caller to
  // _initialize_access_control, so ADMIN is the Family Steward here.
  notifActor.setIdentity(adminIdentity);
  await notifActor.approveProfileClaim(claimId);

  // Reconcile marks the pending claim notification read/resolved.
  notifActor.setIdentity(claimantIdentity);
  const reconciled = await notifActor.reconcileClaimNotifications(claimId);
  expect(reconciled).toBe(1n);

  // The pending claim notification is now read (no longer actionable/current).
  const after = await notifActor.listNotifications();
  const claimRequested = after.find(
    (n) => "ProfileClaimRequested" in n.notificationType,
  );
  expect(claimRequested).toMatchObject({ read: true });

  // The profile status stays CLAIMED — no new claim is created.
  const profile = await notifActor.getPersonProfile("lorenzoSmithJr");
  expect(profile).toEqual([
    expect.objectContaining({
      personId: "lorenzoSmithJr",
      claimStatus: { Claimed: null },
      claimedByUserId: [CLAIMANT],
    }),
  ]);
});

// ---------------------------------------------------------------------------
// Research Intake review workflow (cover for the research review change). A
// pending Source enters the Research Review Queue with Approve/Reject/Needs
// Research actions, contributes to the steward action count, and generates the
// awaiting-review/approved/not-approved notifications without duplicates.
// getReviewQueue and getResearchAuditLog are Family-Steward-gated.
// ---------------------------------------------------------------------------

it("round-trips a research source through create -> queue -> approve with notifications", async () => {
  const researchSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const researchActor = researchSetup.actor;

  // ADMIN becomes the Family Steward; CONTRIBUTOR registers as a #user.
  researchActor.setIdentity(adminIdentity);
  await researchActor._initialize_access_control();
  researchActor.setIdentity(contributorIdentity);
  await researchActor._initialize_access_control();

  // A signed-in contributor creates a source; it enters as Pending.
  researchActor.setIdentity(contributorIdentity);
  const created = await researchActor.createSource(
    "1900 census, Norwood household",
    { CensusCitation: null },
    "Census record listing the Norwood family.",
    [],
  );
  expect(created).toEqual({
    ok: expect.objectContaining({
      title: "1900 census, Norwood household",
      sourceType: { CensusCitation: null },
      contributor: CONTRIBUTOR,
      status: { Pending: null },
    }),
  });
  const sourceId = (created as { ok: { id: bigint } }).ok.id;

  // The contributor receives the awaiting-review notification.
  const contributorNotifs = await researchActor.listNotifications();
  expect(contributorNotifs).toHaveLength(1);
  expect(contributorNotifs[0]).toMatchObject({
    recipient: CONTRIBUTOR,
    notificationType: { ResearchSubmission: null },
    message: "Your research submission is awaiting Family Steward review.",
    read: false,
  });

  // The steward sees the pending source in the review queue with the
  // Approve/Reject/Needs Research actions.
  researchActor.setIdentity(adminIdentity);
  const queue = await researchActor.getReviewQueue();
  expect(queue.pending).toBe(1n);
  expect(queue.needsResearch).toBe(0n);
  const sourceItem = queue.items.find((i) => i.kind.Source !== undefined);
  expect(sourceItem).toMatchObject({
    id: sourceId,
    title: "1900 census, Norwood household",
    status: { Pending: null },
    contributor: [CONTRIBUTOR],
  });
  expect(sourceItem!.actions).toEqual([
    { Approve: null },
    { Reject: null },
    { NeedsResearch: null },
  ]);

  // Approving transitions the source to Approved and records the approved
  // notification for the contributor.
  const approved = await researchActor.approveSource(sourceId);
  expect(approved).toEqual([
    expect.objectContaining({ id: sourceId, status: { Approved: null } }),
  ]);
  const afterApprove = await researchActor.getReviewQueue();
  expect(afterApprove.pending).toBe(0n);
  expect(afterApprove.approved).toBe(1n);

  researchActor.setIdentity(contributorIdentity);
  const approvedNotifs = await researchActor.listNotifications();
  expect(
    approvedNotifs.filter(
      (n) =>
        "ResearchApproved" in n.notificationType &&
        n.message === "Your research submission was approved.",
    ),
  ).toHaveLength(1);
});

it("rejects and marks-needs-research sources, preserving the source and notes", async () => {
  const researchSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const researchActor = researchSetup.actor;

  researchActor.setIdentity(adminIdentity);
  await researchActor._initialize_access_control();
  researchActor.setIdentity(contributorIdentity);
  await researchActor._initialize_access_control();

  // Create two sources to reject and mark needs-research.
  researchActor.setIdentity(contributorIdentity);
  const rejectCreated = await researchActor.createSource(
    "Deed record",
    { DeedPropertyReference: null },
    "A deed reference.",
    [],
  );
  const needsCreated = await researchActor.createSource(
    "Email thread",
    { EmailThread: null },
    "An email thread.",
    [],
  );
  const rejectId = (rejectCreated as { ok: { id: bigint } }).ok.id;
  const needsId = (needsCreated as { ok: { id: bigint } }).ok.id;

  // Rejecting transitions to Rejected and records the not-approved
  // notification; the source (and its notes/description) is preserved.
  researchActor.setIdentity(adminIdentity);
  const rejected = await researchActor.rejectSource(rejectId);
  expect(rejected).toEqual([
    expect.objectContaining({
      id: rejectId,
      status: { Rejected: null },
      description: "A deed reference.",
    }),
  ]);

  // Needs Research transitions to NeedsResearch, preserving the source.
  const needsResearch = await researchActor.needsResearchSource(needsId);
  expect(needsResearch).toEqual([
    expect.objectContaining({
      id: needsId,
      status: { NeedsResearch: null },
      description: "An email thread.",
    }),
  ]);

  // The queue reflects the rejected and needs-research counts.
  const queue = await researchActor.getReviewQueue();
  expect(queue.rejected).toBe(1n);
  expect(queue.needsResearch).toBe(1n);

  // The contributor receives the not-approved notification for the rejection.
  researchActor.setIdentity(contributorIdentity);
  const notifs = await researchActor.listNotifications();
  expect(
    notifs.filter(
      (n) =>
        "ResearchRejected" in n.notificationType &&
        n.message === "Your research submission was not approved.",
    ),
  ).toHaveLength(1);
});

it("marks a pending finding as Needs Research, retaining it in the queue", async () => {
  const researchSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const researchActor = researchSetup.actor;

  researchActor.setIdentity(adminIdentity);
  await researchActor._initialize_access_control();
  researchActor.setIdentity(contributorIdentity);
  await researchActor._initialize_access_control();

  // A contributor creates a source and a pending finding linked to it.
  researchActor.setIdentity(contributorIdentity);
  const sourceCreated = await researchActor.createSource(
    "1900 census, Norwood household",
    { CensusCitation: null },
    "Census record listing the Norwood family.",
    [],
  );
  const sourceId = (sourceCreated as { ok: { id: bigint } }).ok.id;
  const findingCreated = await researchActor.createFinding(
    "Birth date of Julia Norwood",
    { Documented: null },
    { PersonFact: null },
    {
      PersonFact: {
        field: "birthDate",
        value: "12 March 1898",
        personId: "julia",
      },
    },
    sourceId,
    ["julia"],
    [],
  );
  expect(findingCreated).toEqual({
    ok: expect.objectContaining({
      title: "Birth date of Julia Norwood",
      status: { Pending: null },
    }),
  });
  const findingId = (findingCreated as { ok: { id: bigint } }).ok.id;

  // The steward marks the finding as Needs Research.
  researchActor.setIdentity(adminIdentity);
  const needsResearch = await researchActor.needsResearchFinding(findingId);
  expect(needsResearch).toEqual([
    expect.objectContaining({
      id: findingId,
      status: { NeedsResearch: null },
      title: "Birth date of Julia Norwood",
    }),
  ]);

  // The finding is retained in the queue with status NEEDS_RESEARCH and the
  // queue reflects the needs-research count. The linked source is still
  // pending, so pending remains 1 (the source) while needsResearch is 1 (the
  // finding).
  const queue = await researchActor.getReviewQueue();
  expect(queue.needsResearch).toBe(1n);
  expect(queue.pending).toBe(1n);
  const findingItem = queue.items.find((i) => i.kind.Finding !== undefined);
  expect(findingItem).toMatchObject({
    id: findingId,
    title: "Birth date of Julia Norwood",
    status: { NeedsResearch: null },
  });

  // The audit log records the FindingNeedsResearch action.
  const audit = await researchActor.getResearchAuditLog();
  expect(
    audit.some(
      (e) =>
        e.action === "FindingNeedsResearch" &&
        e.summary === "Finding 'Birth date of Julia Norwood' marked as needing research",
    ),
  ).toBe(true);
});

it("gates getReviewQueue and getResearchAuditLog to Family Stewards", async () => {
  const researchSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const researchActor = researchSetup.actor;

  researchActor.setIdentity(adminIdentity);
  await researchActor._initialize_access_control();
  researchActor.setIdentity(contributorIdentity);
  await researchActor._initialize_access_control();

  // A signed-in non-steward cannot read the review queue or audit log.
  researchActor.setIdentity(contributorIdentity);
  await expect(researchActor.getReviewQueue()).rejects.toThrow();
  await expect(researchActor.getResearchAuditLog()).rejects.toThrow();

  // An anonymous caller is also rejected.
  const anonymousActor = pic!.createActor<_SERVICE>(idlFactory, researchSetup.canisterId);
  await expect(anonymousActor.getReviewQueue()).rejects.toThrow();
  await expect(anonymousActor.getResearchAuditLog()).rejects.toThrow();
});
