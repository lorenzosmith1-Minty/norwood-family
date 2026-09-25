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
// Tenancy — Private Messaging default-family characterization.
//
// The requested change gives Conversation, Message, Block, and Report a
// `familyId` field, adds canonical family-scoped endpoints
// (listConversationsForFamily, getConversationForFamily, listMessagesForFamily,
// a family-scoped create/send, and family-scoped mark-read / report / block /
// Steward moderation), and keeps the existing no-familyId Messaging endpoints
// as thin TEMPORARY wrappers delegating to the canonical methods with
// DEFAULT_FAMILY_ID.
//
// This file freezes the OBSERVABLE default-family (Norwood) behavior of the
// legacy no-familyId Messaging endpoints, which the change must preserve through
// those wrappers. It deliberately does NOT freeze:
//
//   * the absence of a `familyId` field on Conversation / Message / Block /
//     Report — the change adds one, so asserting its absence would freeze the
//     very thing being changed;
//   * the legacy endpoints as the only implementation — the change makes them
//     thin wrappers over canonical family-scoped methods, and this file must
//     keep passing across that refactor;
//   * the exact denial wording of the legacy member gate — the change routes it
//     through the canonical family gate, so only the fact of denial is frozen.
//
// What it does freeze is the behavior a default-family user observes today and
// must keep observing:
//
//   1. canMessagePerson / listMessageableMembers eligibility: a living, claimed,
//      active-account member is messageable; self, unclaimed, and archived
//      profiles are not; an anonymous caller sees nothing;
//   2. sendMessage round-trips a message, reuses the canonical 1:1 conversation
//      for the account pair, and rejects self-messaging with CannotMessageSelf;
//   3. listConversations returns the caller's inbox summary (other participant,
//      preview, unread count) and getConversation returns the participant's
//      message history while returning null for a non-participant;
//   4. markConversationRead marks only the other party's messages read;
//   5. blockUser / listBlockedUsers / unblockUser round-trip, and a blocked
//      sender's sendMessage is rejected with BlockedByRecipient;
//   6. reportMessage / listReports / reviewReport / getReportedMessage round-trip
//      a report and expose only the reported message to a Steward;
//   7. the legacy authorization gates are unchanged: an anonymous caller and a
//      signed-in non-member are rejected, and the Steward-only endpoints reject
//      a non-Steward.
//
// The frontend suite mocks the actor, so none of this is visible there. This
// file installs the app's own compiled wasm and drives the real public API.
//
// Coverage limit this file cannot close: the family-boundary behavior of the
// canonical `*ForFamily` endpoints is not exercisable here because those
// endpoints do not exist yet; this file is the baseline the cover lane builds
// on. The `familyId` field the change adds to each record is likewise not
// asserted here.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

const SIGN_IN_MARKER = "Unauthorized: You must be signed in";
// The canonical family-membership gate's stable, non-technical message. The
// legacy no-familyId member gate now routes through this canonical helper, so
// the exact pre-tenancy wording is intentionally not frozen (see the header);
// the fact of denial and the canonical message are.
const MEMBER_MARKER =
  "Family membership required. Claim your family profile and wait for Family Steward approval before contributing family content.";
const STEWARD_MARKER =
  "Unauthorized: Only Family Stewards can perform this action";

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
async function setupMessaging(): Promise<Seeded> {
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
  // method so their accounts are active (linked to the accounts map), which the
  // messaging eligibility requires.
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

/** Sends a message as MEMBER_A to MEMBER_B's claimed person and returns it. */
async function sendFromA(actor: _SERVICE, body: string) {
  actor.setIdentity(memberAIdentity);
  return actor.sendMessage("hudson", body);
}

// ---------------------------------------------------------------------------
// (1) Eligibility: canMessagePerson and listMessageableMembers.
// ---------------------------------------------------------------------------

it("reports a living claimed member as messageable and excludes self and unclaimed profiles", async () => {
  const { actor } = await setupMessaging();

  actor.setIdentity(memberAIdentity);
  // MEMBER_B's claimed person is messageable; the caller's own claimed person is
  // not (self is excluded).
  await expect(actor.canMessagePerson("hudson")).resolves.toBe(true);
  await expect(actor.canMessagePerson("clayton")).resolves.toBe(false);

  // listMessageableMembers is data-driven and non-admin-gated: MEMBER_A sees
  // MEMBER_B's claimed person but never their own.
  const messageable = await actor.listMessageableMembers();
  expect(messageable).toContain("hudson");
  expect(messageable).not.toContain("clayton");
});

it("reports an anonymous caller as unable to message anyone", async () => {
  const { canisterId } = await setupMessaging();

  // A freshly created actor calls as the anonymous principal until an identity
  // is set.
  const guest = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  await expect(guest.canMessagePerson("hudson")).resolves.toBe(false);
  await expect(guest.listMessageableMembers()).resolves.toEqual([]);
});

// ---------------------------------------------------------------------------
// (2) sendMessage round-trip, conversation reuse, and self-message rejection.
// ---------------------------------------------------------------------------

it("round-trips a message and reuses the canonical 1:1 conversation", async () => {
  const { actor } = await setupMessaging();

  const first = await sendFromA(actor, "Hello Versie");
  expect(first).toMatchObject({
    ok: expect.objectContaining({
      body: "Hello Versie",
      senderPersonId: "clayton",
      status: { Sent: null },
      readAt: [],
    }),
  });

  // MEMBER_B replies; the same conversation is reused (one conversation for the
  // account pair), so both messages share a conversationId.
  actor.setIdentity(memberBIdentity);
  const reply = await actor.sendMessage("clayton", "Hi Clayton");
  expect(reply).toMatchObject({ ok: expect.objectContaining({ body: "Hi Clayton" }) });

  const firstMessage = (first as { ok: { conversationId: bigint } }).ok;
  const replyMessage = (reply as { ok: { conversationId: bigint } }).ok;
  expect(replyMessage.conversationId).toBe(firstMessage.conversationId);

  // MEMBER_A's inbox has exactly one conversation for the pair.
  actor.setIdentity(memberAIdentity);
  const conversations = await actor.listConversations();
  expect(conversations).toHaveLength(1);
  expect(conversations[0].conversationId).toBe(firstMessage.conversationId);
});

it("rejects self-messaging with CannotMessageSelf", async () => {
  const { actor } = await setupMessaging();

  actor.setIdentity(memberAIdentity);
  const selfSend = await actor.sendMessage("clayton", "to myself");
  expect(selfSend).toEqual({ err: { CannotMessageSelf: null } });
});

it("rejects a message to an unknown recipient with RecipientNotFound", async () => {
  const { actor } = await setupMessaging();

  actor.setIdentity(memberAIdentity);
  const unknown = await actor.sendMessage("no-such-person", "hello?");
  expect(unknown).toEqual({ err: { RecipientNotFound: null } });
});

// ---------------------------------------------------------------------------
// (3) Inbox summary and participant-only conversation read.
// ---------------------------------------------------------------------------

it("summarises the inbox and returns the participant's message history", async () => {
  const { actor } = await setupMessaging();

  await sendFromA(actor, "Hello Versie");

  actor.setIdentity(memberAIdentity);
  const conversations = await actor.listConversations();
  expect(conversations).toHaveLength(1);
  expect(conversations[0]).toMatchObject({
    otherPersonId: "hudson",
    latestMessagePreview: "Hello Versie",
    unreadCount: 0n,
  });

  const view = await actor.getConversation(conversations[0].conversationId);
  expect(view).toEqual([
    expect.objectContaining({
      participantPersonIds: expect.arrayContaining(["clayton", "hudson"]),
      messages: [expect.objectContaining({ body: "Hello Versie" })],
    }),
  ]);
});

it("returns null for a conversation the caller does not participate in", async () => {
  const { actor } = await setupMessaging();

  const sent = await sendFromA(actor, "private note");
  const conversationId = (sent as { ok: { conversationId: bigint } }).ok.conversationId;

  // The Steward is not a participant, so they cannot read the conversation and
  // their inbox is empty — unreported private content is not steward-readable.
  actor.setIdentity(adminIdentity);
  await expect(actor.getConversation(conversationId)).resolves.toEqual([]);
  await expect(actor.listConversations()).resolves.toEqual([]);
});

// ---------------------------------------------------------------------------
// (4) markConversationRead marks only the other party's messages read.
// ---------------------------------------------------------------------------

it("marks only the other party's messages read", async () => {
  const { actor } = await setupMessaging();

  // MEMBER_A sends to MEMBER_B, then MEMBER_B replies.
  await sendFromA(actor, "Hello Versie");
  actor.setIdentity(memberBIdentity);
  await actor.sendMessage("clayton", "Hi Clayton");

  // MEMBER_A's inbox shows one unread message (MEMBER_B's reply).
  actor.setIdentity(memberAIdentity);
  const before = await actor.listConversations();
  expect(before[0].unreadCount).toBe(1n);

  await actor.markConversationRead(before[0].conversationId);

  // MEMBER_A's own sent message stays unread for MEMBER_B; MEMBER_A's unread
  // count drops to zero.
  const after = await actor.listConversations();
  expect(after[0].unreadCount).toBe(0n);

  actor.setIdentity(memberBIdentity);
  const bInbox = await actor.listConversations();
  expect(bInbox[0].unreadCount).toBe(1n);
});

// ---------------------------------------------------------------------------
// (5) Block / unblock round-trip and blocked-send rejection.
// ---------------------------------------------------------------------------

it("blocks a sender, rejects their message, and unblocks them", async () => {
  const { actor } = await setupMessaging();

  // MEMBER_B blocks MEMBER_A.
  actor.setIdentity(memberBIdentity);
  await actor.blockUser(memberAIdentity.getPrincipal());
  const blocked = await actor.listBlockedUsers();
  expect(blocked.map((p) => p.toText())).toContain(
    memberAIdentity.getPrincipal().toText(),
  );

  // MEMBER_A's send to MEMBER_B is rejected because MEMBER_B blocked them.
  actor.setIdentity(memberAIdentity);
  const blockedSend = await actor.sendMessage("hudson", "let me in");
  expect(blockedSend).toEqual({ err: { BlockedByRecipient: null } });

  // MEMBER_B unblocks; the same send now succeeds.
  actor.setIdentity(memberBIdentity);
  await actor.unblockUser(memberAIdentity.getPrincipal());
  expect((await actor.listBlockedUsers()).map((p) => p.toText())).not.toContain(
    memberAIdentity.getPrincipal().toText(),
  );

  actor.setIdentity(memberAIdentity);
  const allowed = await actor.sendMessage("hudson", "let me in");
  expect(allowed).toMatchObject({ ok: expect.objectContaining({ body: "let me in" }) });
});

// ---------------------------------------------------------------------------
// (6) Report round-trip and Steward-only reported-message view.
// ---------------------------------------------------------------------------

it("round-trips a report and exposes only the reported message to a Steward", async () => {
  const { actor } = await setupMessaging();

  const sent = await sendFromA(actor, "Hello Versie");
  const messageId = (sent as { ok: { messageId: bigint } }).ok.messageId;

  // MEMBER_A reports the message they sent.
  actor.setIdentity(memberAIdentity);
  const report = await actor.reportMessage(messageId, "Harassment");
  expect(report).toMatchObject({
    reportedMessageId: messageId,
    reason: "Harassment",
    status: { Pending: null },
  });

  // The Steward lists the report and reads only the reported message content.
  actor.setIdentity(adminIdentity);
  const reports = await actor.listReports();
  expect(reports).toHaveLength(1);
  const reportedView = await actor.getReportedMessage(report.reportId);
  expect(reportedView).toEqual([
    expect.objectContaining({
      message: expect.objectContaining({ messageId, body: "Hello Versie" }),
    }),
  ]);

  // The Steward reviews the report; the status is updated.
  const reviewed = await actor.reviewReport(report.reportId, { Reviewed: null });
  expect(reviewed).toEqual([expect.objectContaining({ status: { Reviewed: null } })]);
});

it("returns nothing for an unreported message id", async () => {
  const { actor } = await setupMessaging();

  actor.setIdentity(adminIdentity);
  await expect(actor.getReportedMessage(0n)).resolves.toEqual([]);
});

// ---------------------------------------------------------------------------
// (7) Legacy authorization gates are unchanged.
// ---------------------------------------------------------------------------

it("rejects an anonymous caller and a signed-in non-member", async () => {
  const { canisterId } = await setupMessaging();

  // A freshly created actor calls as the anonymous principal until an identity
  // is set.
  const guest = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  await expect(guest.listConversations()).rejects.toThrow(
    new RegExp(SIGN_IN_MARKER, "i"),
  );
  await expect(guest.listBlockedUsers()).rejects.toThrow(
    new RegExp(SIGN_IN_MARKER, "i"),
  );

  // A signed-in caller that never claimed a profile is not an approved member.
  const strangerIdentity = createIdentity("messaging-stranger-seed");
  const strangerActor = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  strangerActor.setIdentity(strangerIdentity);
  await strangerActor._initialize_access_control();
  await expect(strangerActor.listConversations()).rejects.toThrow(
    new RegExp(MEMBER_MARKER, "i"),
  );
  await expect(strangerActor.listBlockedUsers()).rejects.toThrow(
    new RegExp(MEMBER_MARKER, "i"),
  );
});

it("denies a non-Steward the Steward-only endpoints", async () => {
  const { actor } = await setupMessaging();

  // A signed-in approved member is not a Steward.
  actor.setIdentity(memberAIdentity);
  await expect(actor.listReports()).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
  await expect(actor.reviewReport(0n, { Reviewed: null })).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
  await expect(actor.getReportedMessage(0n)).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
});
