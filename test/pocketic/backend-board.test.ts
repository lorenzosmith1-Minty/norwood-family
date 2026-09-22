import { PocketIc } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";
import {
  BACKEND_WASM,
  CONTRIBUTOR,
  adminIdentity,
  blob,
  claimantIdentity,
  contributorIdentity,
  memberAIdentity,
  memberBIdentity,
  registerApprovedContributor,
} from "./lane-helpers";

// ---------------------------------------------------------------------------
// Message Board, Private Messaging, blocking, reporting, archive tag search,
// research source upload, board media attachments, and stale claim-notification
// reconciliation.
//
// These tests were split out of backend.test.ts. That file installed ~24
// canisters into a single PocketIc instance, which exhausted the shared
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
// Message Board, Private Messaging, blocking, reporting, and the Pending
// Contributions count (cover for the board/messaging/pending-count phase).
// These methods are approved-member / Family-Steward gated and are exercised
// against the real canister so a stubbed backend cannot pass the cover. A
// dedicated canister keeps the claim/approve state from leaking into the shared
// `actor` canister the other tests use.
// ---------------------------------------------------------------------------

it("round-trips board posts, replies, archive/restore, messaging, block, report, and pending count", async () => {
  const boardSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const boardActor = boardSetup.actor;

  // ADMIN becomes the Family Steward. Steward authority is the canonical
  // active-Steward record, not the platform admin role: the first caller to
  // _initialize_access_control is #admin but must still claim the Steward role
  // explicitly before the approvals below are authorized.
  boardActor.setIdentity(adminIdentity);
  await boardActor._initialize_access_control();
  await boardActor.claimSteward();
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
  await boardActor.blockUser(memberBIdentity.getPrincipal());
  const blocked = await boardActor.listBlockedUsers();
  expect(blocked.map((p) => p.toText())).toContain(memberBIdentity.getPrincipal().toText());
  await boardActor.unblockUser(memberBIdentity.getPrincipal());
  expect((await boardActor.listBlockedUsers()).map((p) => p.toText())).not.toContain(
    memberBIdentity.getPrincipal().toText(),
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
  // accounts map), which messaging eligibility requires. Steward authority is
  // the canonical active-Steward record, so ADMIN must claim it explicitly.
  structActor.setIdentity(adminIdentity);
  await structActor._initialize_access_control();
  await structActor.claimSteward();
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
  // accounts map), which messaging eligibility requires. Steward authority is
  // the canonical active-Steward record, so ADMIN must claim it explicitly.
  structActor.setIdentity(adminIdentity);
  await structActor._initialize_access_control();
  await structActor.claimSteward();
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

  // ADMIN becomes the Family Steward; CONTRIBUTOR registers as an approved
  // family member so they may submit archive items.
  await registerApprovedContributor(searchActor);

  // A contributor submits two approved items with distinct titles and tags.
  searchActor.setIdentity(contributorIdentity);
  const letter = await searchActor.submitArchiveItem(
    "A family letter",
    "A letter from 1924.",
    { Document: null },
    "application/pdf",
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
    "family-letter.pdf",
  );
  const photo = await searchActor.submitArchiveItem(
    "Wedding portrait",
    "The couple on their wedding day.",
    { Photo: null },
    "image/png",
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
    "wedding-portrait.png",
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

  // ADMIN becomes the Family Steward; CONTRIBUTOR registers as an approved
  // family member so they may upload a research source.
  await registerApprovedContributor(uploadActor);

  // A signed-in contributor uploads a source file.
  uploadActor.setIdentity(contributorIdentity);
  const result = await uploadActor.createSourceWithUpload(
    "1900 census, Norwood household",
    { CensusCitation: null },
    "Census record listing the Norwood family.",
    "application/pdf",
    blob,
    ["census", "1900"],
    "1900",
    [1900n],
    ["julia"],
    { FamilyOnly: null },
    { Standard: null },
    [],
    "1900-census.pdf",
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

  // Exactly one canonical archive item was created (pending) and the source
  // links to it by id — no manually typed Archive Item ID was required. The
  // linked item is NOT listed in Pending Contributions: a Research-linked
  // pending item is reviewed through the Research Intake queue, so
  // listPendingArchiveItems excludes it. listPendingArchiveItems is
  // steward-gated, so switch to the admin caller.
  uploadActor.setIdentity(adminIdentity);
  const pending = await uploadActor.listPendingArchiveItems();
  const archiveItemId = (result as { ok: { archiveItem: { id: bigint } } }).ok.archiveItem.id;
  expect(pending.find((i) => i.id === archiveItemId)).toBeUndefined();
  expect(pending).toHaveLength(0);

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
  // and binds an auth method so their account is active. Steward authority is
  // the canonical active-Steward record, so ADMIN must claim it explicitly.
  mediaActor.setIdentity(adminIdentity);
  await mediaActor._initialize_access_control();
  await mediaActor.claimSteward();
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
    "image/png",
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
    "existing-photo.png",
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
        mimeType: "image/png",
        blob,
        filename: "new-reunion-photo.png",
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

  // ADMIN becomes the Family Steward; CLAIMANT registers as a user. Steward
  // authority is the canonical active-Steward record, so ADMIN must claim it
  // explicitly before the approval below is authorized.
  notifActor.setIdentity(adminIdentity);
  await notifActor._initialize_access_control();
  await notifActor.claimSteward();
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

  // A steward approves the claim. ADMIN claimed the canonical Steward role
  // above, so ADMIN is the Family Steward here.
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
      claimedByUserId: [claimantIdentity.getPrincipal()],
    }),
  ]);
});
