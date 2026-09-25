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
// Tenancy 1C-C3 — family-scoped private Messaging endpoints (real-canister
// cover).
//
// The accepted behavior is that the canonical `*ForFamily` messaging endpoints
// enforce the family boundary: a conversation or message created in Family A is
// visible only under Family A and never under Family B; a `conversationId` or
// `messageId` alone never crosses the boundary; a member of Family A can create
// a conversation with a Family A participant but not with a Family B
// participant; a member of Family A cannot send into a Family B conversation;
// report/block/moderation actions stay family-scoped; and the legacy
// no-familyId Norwood endpoints still work unchanged through the TEMPORARY
// wrappers.
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
// Family A can moderate Family A reports" cannot be exercised through the
// public API. The direction the API supports is covered here: the Norwood
// Steward cannot moderate Family A reports, and an approved Family A member who
// is not a Steward cannot moderate Family A reports either.
//
// The generated declarations on disk predate this change: they still expose
// only the legacy no-familyId messaging methods and their Conversation /
// Message / Block / Report records carry no `familyId`. The family-scoped
// contract this file exercises is therefore declared locally below, mirroring
// the production Candid shapes in `src/backend/types/messaging.mo` and
// `src/backend/mixins/messaging-scope-api.mo`. Once the backend is built and
// `bindgen` regenerates the declarations, the local interface becomes
// redundant but stays compatible; until then it is the only way to type the
// calls this cover makes.
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

// ---------------------------------------------------------------------------
// Local typed view of the family-scoped messaging contract.
//
// These mirror the production Candid shapes exactly: `?T` is `[] | [T]`,
// `Nat`/`Int` are `bigint`, and each record carries `familyId`. The actor is
// cast once, at the call site, so the rest of the file is fully typed.
// ---------------------------------------------------------------------------

type FamilyId = string;
type ConversationId = bigint;
type MessageId = bigint;
type ReportId = bigint;
type Timestamp = bigint;
type AccountId = ReturnType<typeof memberAIdentity.getPrincipal>;

interface Conversation {
  familyId: FamilyId;
  conversationId: ConversationId;
  participantAccountIds: Array<AccountId>;
  participantPersonIds: Array<string>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface Message {
  familyId: FamilyId;
  messageId: MessageId;
  conversationId: ConversationId;
  senderAccountId: AccountId;
  senderPersonId: string;
  body: string;
  createdAt: Timestamp;
  readAt: [] | [Timestamp];
  status: { Sent: null } | { Blocked: null };
}

interface Report {
  familyId: FamilyId;
  reportId: ReportId;
  reportingAccountId: AccountId;
  reportedMessageId: MessageId;
  reason: string;
  createdAt: Timestamp;
  status: { Pending: null } | { Reviewed: null } | { Dismissed: null };
}

interface ConversationSummary {
  conversationId: ConversationId;
  otherPersonId: string;
  otherDisplayName: string;
  latestMessagePreview: string;
  latestMessageAt: Timestamp;
  unreadCount: bigint;
}

interface ConversationView {
  conversationId: ConversationId;
  participantPersonIds: Array<string>;
  participantDisplayNames: Array<string>;
  messages: Array<Message>;
}

interface ReportedMessageView {
  report: Report;
  message: Message;
}

type MessageError =
  | { NotSignedIn: null }
  | { NotApprovedMember: null }
  | { RecipientNotFound: null }
  | { RecipientNotClaimed: null }
  | { RecipientArchived: null }
  | { CannotMessageSelf: null }
  | { BlockedByRecipient: null }
  | { NotParticipant: null }
  | { ConversationNotFound: null };

type MessageResult = { ok: Message } | { err: MessageError };
type ConversationResult = { ok: Conversation } | { err: MessageError };

/** The family-scoped messaging surface this cover drives. */
interface FamilyScopedMessaging {
  canMessagePersonForFamily(familyId: FamilyId, personId: string): Promise<boolean>;
  listMessageableMembersForFamily(familyId: FamilyId): Promise<Array<string>>;
  listConversationsForFamily(familyId: FamilyId): Promise<Array<ConversationSummary>>;
  getConversationForFamily(
    familyId: FamilyId,
    conversationId: ConversationId,
  ): Promise<[] | [ConversationView]>;
  listMessagesForFamily(
    familyId: FamilyId,
    conversationId: ConversationId,
  ): Promise<Array<Message>>;
  createConversationForFamily(
    familyId: FamilyId,
    recipientPersonId: string,
  ): Promise<ConversationResult>;
  sendMessageForFamily(
    familyId: FamilyId,
    recipientPersonId: string,
    body: string,
  ): Promise<MessageResult>;
  markConversationReadForFamily(
    familyId: FamilyId,
    conversationId: ConversationId,
  ): Promise<undefined>;
  blockUserForFamily(familyId: FamilyId, blockedAccountId: AccountId): Promise<undefined>;
  unblockUserForFamily(familyId: FamilyId, blockedAccountId: AccountId): Promise<undefined>;
  listBlockedUsersForFamily(familyId: FamilyId): Promise<Array<AccountId>>;
  reportMessageForFamily(
    familyId: FamilyId,
    messageId: MessageId,
    reason: string,
  ): Promise<Report>;
  listReportsForFamily(familyId: FamilyId): Promise<Array<Report>>;
  reviewReportForFamily(
    familyId: FamilyId,
    reportId: ReportId,
    status: { Pending: null } | { Reviewed: null } | { Dismissed: null },
  ): Promise<[] | [Report]>;
  getReportedMessageForFamily(
    familyId: FamilyId,
    reportId: ReportId,
  ): Promise<[] | [ReportedMessageView]>;
}

/** The actor with both the generated surface and the family-scoped contract. */
type MessagingActor = _SERVICE & FamilyScopedMessaging;

let pic: PocketIc | undefined;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
});

afterAll(async () => {
  await pic?.tearDown();
});

interface Seeded {
  actor: MessagingActor;
  canisterId: ReturnType<typeof memberAIdentity.getPrincipal>;
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
  const actor = setup.actor as MessagingActor;

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
  //
  // `bindAuthMethod` is also required: the messaging recipient resolver only
  // treats a claimed profile as messageable when its owner has an active linked
  // account (`accounts.get(accountId) != null`), and the account is created on
  // the first `bindAuthMethod` call. Without it every send resolves the
  // recipient as `#RecipientNotClaimed`.
  actor.setIdentity(memberAIdentity);
  await actor._initialize_access_control();
  await actor.bindAuthMethod({ Google: null });
  const createdA = await actor.createMyselfForFamily(FAMILY_A, "Family A Member");
  expect("ok" in createdA).toBe(true);

  actor.setIdentity(memberBIdentity);
  await actor._initialize_access_control();
  await actor.bindAuthMethod({ Google: null });
  const createdB = await actor.createMyselfForFamily(FAMILY_B, "Family B Member");
  expect("ok" in createdB).toBe(true);

  return { actor, canisterId: setup.canisterId };
}

/**
 * Approves MEMBER_B in Family A and returns the personId of the profile
 * `createMyselfForFamily` created for them there. The recipient of a Family A
 * conversation must be a Family A member other than the caller.
 */
async function approveMemberBInFamilyA(actor: MessagingActor): Promise<string> {
  actor.setIdentity(memberBIdentity);
  const created = await actor.createMyselfForFamily(FAMILY_A, "Family B Member in A");
  if (!("ok" in created)) {
    throw new Error("createMyselfForFamily for MEMBER_B in Family A did not return ok");
  }
  return created.ok.personId;
}

// ---------------------------------------------------------------------------
// (1) Read isolation: a Family A conversation is visible under Family A and
//     absent under Family B; a conversationId alone never crosses the boundary.
// ---------------------------------------------------------------------------

it("lists and reads a Family A conversation under Family A but not under Family B", async () => {
  const { actor } = await setupFamilies();

  // MEMBER_A and MEMBER_B are both approved in Family A for this test: the
  // recipient must belong to the requested family for the send to be allowed.
  const recipientId = await approveMemberBInFamilyA(actor);

  actor.setIdentity(memberAIdentity);
  const sent = await actor.sendMessageForFamily(FAMILY_A, recipientId, "Hello Family A");
  expect("ok" in sent).toBe(true);
  if (!("ok" in sent)) {
    throw new Error("sendMessageForFamily did not return ok");
  }
  const conversationId = sent.ok.conversationId;
  expect(sent.ok.familyId).toBe(FAMILY_A);

  // The Family A member sees it under Family A.
  const listedA = await actor.listConversationsForFamily(FAMILY_A);
  expect(listedA.map((c) => c.conversationId)).toEqual([conversationId]);

  const fetchedA = await actor.getConversationForFamily(FAMILY_A, conversationId);
  expect(fetchedA).toEqual([
    expect.objectContaining({
      conversationId,
      messages: [expect.objectContaining({ body: "Hello Family A", familyId: FAMILY_A })],
    }),
  ]);

  // The Family B member's Family B listing never contains the Family A
  // conversation.
  actor.setIdentity(memberBIdentity);
  const listedB = await actor.listConversationsForFamily(FAMILY_B);
  expect(listedB).toEqual([]);

  // A conversationId alone does not resolve under Family B: the lookup behaves
  // like not-found rather than leaking the record.
  const fetchedB = await actor.getConversationForFamily(FAMILY_B, conversationId);
  expect(fetchedB).toEqual([]);

  // The message list is likewise empty under Family B.
  const messagesB = await actor.listMessagesForFamily(FAMILY_B, conversationId);
  expect(messagesB).toEqual([]);
});

it("lists Family A messages under Family A but not under Family B", async () => {
  const { actor } = await setupFamilies();

  const recipientId = await approveMemberBInFamilyA(actor);

  actor.setIdentity(memberAIdentity);
  const sent = await actor.sendMessageForFamily(FAMILY_A, recipientId, "A Family A message");
  if (!("ok" in sent)) {
    throw new Error("sendMessageForFamily did not return ok");
  }
  const conversationId = sent.ok.conversationId;

  const messagesA = await actor.listMessagesForFamily(FAMILY_A, conversationId);
  expect(messagesA.map((m) => m.messageId)).toEqual([sent.ok.messageId]);
  expect(messagesA.every((m) => m.familyId === FAMILY_A)).toBe(true);

  // The Family B member's Family B read of the same conversationId returns
  // nothing.
  actor.setIdentity(memberBIdentity);
  expect(await actor.listMessagesForFamily(FAMILY_B, conversationId)).toEqual([]);
});

// ---------------------------------------------------------------------------
// (2) Create isolation: a Family A member can create with a Family A
//     participant and cannot create with a Family B participant.
// ---------------------------------------------------------------------------

it("lets a Family A member create a conversation with a Family A participant", async () => {
  const { actor } = await setupFamilies();

  // MEMBER_B is approved in Family A, so the pair is a valid Family A
  // conversation.
  actor.setIdentity(memberBIdentity);
  const createdB = await actor.createMyselfForFamily(FAMILY_A, "Family B Member in A");
  expect("ok" in createdB).toBe(true);
  const recipientId = (createdB as { ok: { personId: string } }).ok.personId;

  actor.setIdentity(memberAIdentity);
  const created = await actor.createConversationForFamily(FAMILY_A, recipientId);
  expect("ok" in created).toBe(true);
  if (!("ok" in created)) {
    throw new Error("createConversationForFamily did not return ok");
  }
  expect(created.ok.familyId).toBe(FAMILY_A);
  expect(created.ok.participantPersonIds).toContain(recipientId);
});

it("rejects a Family A member creating a conversation with a Family B participant", async () => {
  const { actor } = await setupFamilies();

  // MEMBER_B's profile is in Family B only.
  actor.setIdentity(memberBIdentity);
  const familyBProfile = await actor.getMyProfileForFamily(FAMILY_B);
  expect(familyBProfile).toHaveLength(1);
  const familyBPersonId = familyBProfile[0].personId;

  // MEMBER_A is an approved Family A member, but the recipient belongs to
  // Family B only: the cross-family mix is rejected rather than silently
  // creating a conversation that straddles the boundary. The rejection is the
  // canonical `#RecipientNotFound` result (a foreign-family person is never
  // resolved, so the boundary does not leak the person's existence).
  actor.setIdentity(memberAIdentity);
  await expect(
    actor.createConversationForFamily(FAMILY_A, familyBPersonId),
  ).resolves.toEqual({ err: { RecipientNotFound: null } });

  // Nothing was stored in Family A.
  expect(await actor.listConversationsForFamily(FAMILY_A)).toEqual([]);
});

it("rejects a Family A member creating a conversation in Family B", async () => {
  const { actor } = await setupFamilies();

  // MEMBER_B's profile is in Family B only.
  actor.setIdentity(memberBIdentity);
  const familyBProfile = await actor.getMyProfileForFamily(FAMILY_B);
  expect(familyBProfile).toHaveLength(1);
  const familyBPersonId = familyBProfile[0].personId;

  // MEMBER_A is not an approved member of Family B, so the create is denied
  // outright.
  actor.setIdentity(memberAIdentity);
  await expect(
    actor.createConversationForFamily(FAMILY_B, familyBPersonId),
  ).rejects.toThrow(new RegExp(MEMBER_MARKER, "i"));

  // Nothing was stored in Family B.
  actor.setIdentity(memberBIdentity);
  expect(await actor.listConversationsForFamily(FAMILY_B)).toEqual([]);
});

// ---------------------------------------------------------------------------
// (3) Send isolation: a Family A member cannot send into a Family B
//     conversation.
// ---------------------------------------------------------------------------

it("denies a Family A member sending into a Family B conversation", async () => {
  const { actor, canisterId } = await setupFamilies();

  // MEMBER_B creates a Family B conversation with a second Family B member.
  const familyBPeerIdentity = createIdentity("messaging-family-b-peer-seed");
  const peerActor = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  peerActor.setIdentity(familyBPeerIdentity);
  await peerActor._initialize_access_control();
  await peerActor.bindAuthMethod({ Google: null });
  const peerCreated = await peerActor.createMyselfForFamily(FAMILY_B, "Family B Peer");
  expect("ok" in peerCreated).toBe(true);
  const peerPersonId = (peerCreated as { ok: { personId: string } }).ok.personId;

  actor.setIdentity(memberBIdentity);
  const familyBSent = await actor.sendMessageForFamily(FAMILY_B, peerPersonId, "Family B only");
  if (!("ok" in familyBSent)) {
    throw new Error("Family B send did not return ok");
  }
  const familyBConversationId = familyBSent.ok.conversationId;

  // MEMBER_A is not an approved member of Family B, so a send into the Family B
  // conversation is denied.
  actor.setIdentity(memberAIdentity);
  await expect(
    actor.sendMessageForFamily(FAMILY_B, peerPersonId, "Cross-family send."),
  ).rejects.toThrow(new RegExp(MEMBER_MARKER, "i"));

  // The Family B conversation has only its original message.
  actor.setIdentity(memberBIdentity);
  const messages = await actor.listMessagesForFamily(FAMILY_B, familyBConversationId);
  expect(messages.map((m) => m.body)).toEqual(["Family B only"]);
});

// ---------------------------------------------------------------------------
// (4) Report isolation: a report filed in Family A is not visible under
//     Family B, and a reportId alone does not resolve across the boundary.
// ---------------------------------------------------------------------------

it("keeps a Family A report out of Family B", async () => {
  const { actor } = await setupFamilies();

  const recipientId = await approveMemberBInFamilyA(actor);

  actor.setIdentity(memberAIdentity);
  const sent = await actor.sendMessageForFamily(FAMILY_A, recipientId, "Reportable");
  if (!("ok" in sent)) {
    throw new Error("sendMessageForFamily did not return ok");
  }

  const report = await actor.reportMessageForFamily(FAMILY_A, sent.ok.messageId, "Harassment");
  expect(report.familyId).toBe(FAMILY_A);

  // The Norwood Steward is not a Steward of Family A, so the Family A report
  // listing is denied.
  actor.setIdentity(adminIdentity);
  await expect(actor.listReportsForFamily(FAMILY_A)).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );

  // The reportId alone does not resolve through a Norwood context.
  await expect(actor.getReportedMessageForFamily(NORWOOD, report.reportId)).resolves.toEqual(
    [],
  );
});

// ---------------------------------------------------------------------------
// (5) Block isolation: a block in Family A does not affect Family B.
// ---------------------------------------------------------------------------

it("scopes a block to the family it was created in", async () => {
  const { actor } = await setupFamilies();

  // MEMBER_B blocks MEMBER_A in Family B.
  actor.setIdentity(memberBIdentity);
  await actor.blockUserForFamily(FAMILY_B, memberAIdentity.getPrincipal());
  const blockedB = await actor.listBlockedUsersForFamily(FAMILY_B);
  expect(blockedB.map((p) => p.toText())).toContain(memberAIdentity.getPrincipal().toText());

  // The same block is not visible in Family A. MEMBER_A is an approved Family A
  // member, so MEMBER_A may read the Family A blocked list (MEMBER_B is not a
  // Family A member and would be denied the read outright).
  actor.setIdentity(memberAIdentity);
  const blockedA = await actor.listBlockedUsersForFamily(FAMILY_A);
  expect(blockedA).toEqual([]);

  // Unblocking in Family A does not remove the Family B block.
  await actor.unblockUserForFamily(FAMILY_A, memberAIdentity.getPrincipal());
  actor.setIdentity(memberBIdentity);
  const stillBlockedB = await actor.listBlockedUsersForFamily(FAMILY_B);
  expect(stillBlockedB.map((p) => p.toText())).toContain(
    memberAIdentity.getPrincipal().toText(),
  );
});

// ---------------------------------------------------------------------------
// (6) Moderation isolation. Only Norwood has a Steward, so the boundary is
//     driven in the direction the API supports: the Norwood Steward cannot
//     moderate Family A reports, and an approved Family A member who is not a
//     Steward cannot moderate Family A reports either.
// ---------------------------------------------------------------------------

it("denies the Norwood Steward moderating Family A reports", async () => {
  const { actor } = await setupFamilies();

  const recipientId = await approveMemberBInFamilyA(actor);

  actor.setIdentity(memberAIdentity);
  const sent = await actor.sendMessageForFamily(FAMILY_A, recipientId, "Moderated");
  if (!("ok" in sent)) {
    throw new Error("sendMessageForFamily did not return ok");
  }
  const report = await actor.reportMessageForFamily(FAMILY_A, sent.ok.messageId, "Spam");

  // The Norwood Steward is not a Steward of Family A.
  actor.setIdentity(adminIdentity);
  await expect(actor.listReportsForFamily(FAMILY_A)).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
  await expect(
    actor.reviewReportForFamily(FAMILY_A, report.reportId, { Reviewed: null }),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
  await expect(actor.getReportedMessageForFamily(FAMILY_A, report.reportId)).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
});

it("denies an approved Family A member who is not a Steward moderating Family A reports", async () => {
  const { actor } = await setupFamilies();

  const recipientId = await approveMemberBInFamilyA(actor);

  actor.setIdentity(memberAIdentity);
  const sent = await actor.sendMessageForFamily(FAMILY_A, recipientId, "Member-moderated");
  if (!("ok" in sent)) {
    throw new Error("sendMessageForFamily did not return ok");
  }
  const report = await actor.reportMessageForFamily(FAMILY_A, sent.ok.messageId, "Spam");

  // Approved membership is not Steward authority.
  await expect(actor.listReportsForFamily(FAMILY_A)).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
  await expect(
    actor.reviewReportForFamily(FAMILY_A, report.reportId, { Reviewed: null }),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
});

// ---------------------------------------------------------------------------
// (7) Default Norwood compatibility: the legacy no-familyId messaging
//     endpoints still work unchanged through the TEMPORARY wrappers.
// ---------------------------------------------------------------------------

it("keeps the legacy Norwood messaging workflow working end to end", async () => {
  const { actor } = await setupFamilies();

  // MEMBER_A and MEMBER_B claim seeded Norwood profiles and the Steward
  // approves both, making them approved Norwood members.
  actor.setIdentity(memberAIdentity);
  const claimA = (await actor.requestProfileClaim("clayton")) as { ok: { id: bigint } };
  actor.setIdentity(memberBIdentity);
  const claimB = (await actor.requestProfileClaim("hudson")) as { ok: { id: bigint } };
  actor.setIdentity(adminIdentity);
  await actor.approveProfileClaim(claimA.ok.id);
  await actor.approveProfileClaim(claimB.ok.id);

  // Legacy send round-trips and writes a Norwood message.
  actor.setIdentity(memberAIdentity);
  const sent = await actor.sendMessage("hudson", "Legacy hello");
  expect(sent).toMatchObject({
    ok: expect.objectContaining({ body: "Legacy hello", senderPersonId: "clayton" }),
  });
  if (!("ok" in sent)) {
    throw new Error("legacy sendMessage did not return ok");
  }

  // Legacy inbox and conversation read resolve it.
  const conversations = await actor.listConversations();
  expect(conversations.map((c) => c.conversationId)).toEqual([sent.ok.conversationId]);
  const view = await actor.getConversation(sent.ok.conversationId);
  expect(view).toEqual([
    expect.objectContaining({
      messages: [expect.objectContaining({ body: "Legacy hello" })],
    }),
  ]);

  // Legacy block round-trips.
  actor.setIdentity(memberBIdentity);
  await actor.blockUser(memberAIdentity.getPrincipal());
  expect((await actor.listBlockedUsers()).map((p) => p.toText())).toContain(
    memberAIdentity.getPrincipal().toText(),
  );
  await actor.unblockUser(memberAIdentity.getPrincipal());
  expect(await actor.listBlockedUsers()).toEqual([]);
});
