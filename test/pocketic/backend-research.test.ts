import { PocketIc } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";
import {
  BACKEND_WASM,
  CONTRIBUTOR,
  adminIdentity,
  contributorIdentity,
  registerApprovedContributor,
} from "./lane-helpers";

// ---------------------------------------------------------------------------
// Research Intake review workflow: source create -> queue -> approve/reject/
// needs-research with notifications, finding needs-research, steward gating of
// the review queue and audit log, and the New Person Candidate and Relationship
// Proposal review actions.
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
// Research Intake review workflow (cover for the research review change). A
// pending Source enters the Research Review Queue with Approve/Reject/Needs
// Research actions, contributes to the steward action count, and generates the
// awaiting-review/approved/not-approved notifications without duplicates.
// getReviewQueue and getResearchAuditLog are Family-Steward-gated.
// ---------------------------------------------------------------------------

it("round-trips a research source through create -> queue -> approve with notifications", async () => {
  const researchSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const researchActor = researchSetup.actor;

  // ADMIN becomes the Family Steward; CONTRIBUTOR registers as an approved
  // family member so they may create research sources and findings.
  await registerApprovedContributor(researchActor);

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

  // The contributor receives the awaiting-review notification. The approved-
  // contributor setup also produced a ProfileClaimRequested notification, so
  // filter to the research-submission notification rather than counting all.
  const contributorNotifs = await researchActor.listNotifications();
  const submissionNotifs = contributorNotifs.filter(
    (n) => "ResearchSubmission" in n.notificationType,
  );
  expect(submissionNotifs).toHaveLength(1);
  expect(submissionNotifs[0]).toMatchObject({
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

  // ADMIN becomes the Family Steward; CONTRIBUTOR registers as an approved
  // family member so they may create research sources and findings.
  await registerApprovedContributor(researchActor);

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

  // ADMIN becomes the Family Steward; CONTRIBUTOR registers as an approved
  // family member so they may create research sources and findings.
  await registerApprovedContributor(researchActor);

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

  // ADMIN becomes the Family Steward; CONTRIBUTOR registers as an approved
  // family member so they may create research sources and findings.
  await registerApprovedContributor(researchActor);

  // A signed-in non-steward cannot read the review queue or audit log.
  researchActor.setIdentity(contributorIdentity);
  await expect(researchActor.getReviewQueue()).rejects.toThrow();
  await expect(researchActor.getResearchAuditLog()).rejects.toThrow();

  // An anonymous caller is also rejected.
  const anonymousActor = pic!.createActor<_SERVICE>(idlFactory, researchSetup.canisterId);
  await expect(anonymousActor.getReviewQueue()).rejects.toThrow();
  await expect(anonymousActor.getResearchAuditLog()).rejects.toThrow();
});

// ---------------------------------------------------------------------------
// New Person Candidate review actions (cover for the Research Review Actions
// change). A pending candidate is created, then approved (creating exactly one
// canonical Person that preserves the candidate's source/provenance and records
// the approval in Audit History), rejected (creating no Person), or marked Needs
// Research (creating no Person). The pending count decrements immediately.
// ---------------------------------------------------------------------------

it("approves a New Person candidate, creating exactly one canonical Person and recording the audit", async () => {
  const candSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const candActor = candSetup.actor;

  // ADMIN becomes the Family Steward; CONTRIBUTOR registers as an approved
  // family member so they may create research sources and candidates.
  await registerApprovedContributor(candActor);

  // A contributor creates a source and a New Person candidate linked to it.
  candActor.setIdentity(contributorIdentity);
  const sourceCreated = await candActor.createSource(
    "1900 census, Norwood household",
    { CensusCitation: null },
    "Census record listing the Norwood family.",
    [],
  );
  const sourceId = (sourceCreated as { ok: { id: bigint } }).ok.id;
  const candidateCreated = await candActor.createNewPersonCandidate(
    "Unknown Norwood",
    "A previously unrecorded family member.",
    sourceId,
  );
  expect(candidateCreated).toEqual({
    ok: expect.objectContaining({
      name: "Unknown Norwood",
      sourceId,
      status: { Pending: null },
    }),
  });
  const candidateId = (candidateCreated as { ok: { id: bigint } }).ok.id;

  // The steward sees the pending candidate in the review queue. The pending
  // count includes the linked source (still pending) plus the candidate.
  candActor.setIdentity(adminIdentity);
  const queueBefore = await candActor.getReviewQueue();
  expect(queueBefore.pending).toBe(2n);
  const candidateItem = queueBefore.items.find((i) => i.kind.NewPersonCandidate !== undefined);
  expect(candidateItem).toMatchObject({
    id: candidateId,
    title: "Unknown Norwood",
    status: { Pending: null },
  });
  expect(candidateItem!.actions).toEqual([
    { Approve: null },
    { Reject: null },
    { NeedsResearch: null },
  ]);

  // Approving creates exactly one canonical Person and marks the candidate
  // Approved; the pending count decrements immediately (the source remains
  // pending, so pending drops from 2 to 1).
  const approved = await candActor.approveNewPersonCandidate(candidateId);
  expect(approved).toEqual([
    expect.objectContaining({ id: candidateId, status: { Approved: null } }),
  ]);
  const queueAfter = await candActor.getReviewQueue();
  expect(queueAfter.pending).toBe(1n);
  expect(queueAfter.approved).toBe(1n);

  // The canonical Person was created (living, unclaimed) with the candidate's
  // name. uniquePersonId derives the personId from the name (lowercased, words
  // joined with no separator).
  const person = await candActor.getPersonProfile("unknownnorwood");
  expect(person).toEqual([
    expect.objectContaining({
      personId: "unknownnorwood",
      name: "Unknown Norwood",
      livingStatus: { Living: null },
      claimStatus: { Unclaimed: null },
    }),
  ]);

  // The approval is recorded in Audit History.
  const audit = await candActor.getResearchAuditLog();
  expect(
    audit.some(
      (e) =>
        e.action === "NewPersonCandidateApproved" &&
        e.summary === "New Person Candidate 'Unknown Norwood' approved and created as a canonical Person",
    ),
  ).toBe(true);
});

it("rejects and marks-needs-research New Person candidates, creating no Person", async () => {
  const candSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const candActor = candSetup.actor;

  // ADMIN becomes the Family Steward; CONTRIBUTOR registers as an approved
  // family member so they may create research sources and candidates.
  await registerApprovedContributor(candActor);

  // A contributor creates a source and two candidates.
  candActor.setIdentity(contributorIdentity);
  const sourceCreated = await candActor.createSource(
    "1900 census, Norwood household",
    { CensusCitation: null },
    "Census record listing the Norwood family.",
    [],
  );
  const sourceId = (sourceCreated as { ok: { id: bigint } }).ok.id;
  const rejectCreated = await candActor.createNewPersonCandidate(
    "Rejected Norwood",
    "A rejected candidate.",
    sourceId,
  );
  const needsCreated = await candActor.createNewPersonCandidate(
    "NeedsResearch Norwood",
    "A needs-research candidate.",
    sourceId,
  );
  const rejectId = (rejectCreated as { ok: { id: bigint } }).ok.id;
  const needsId = (needsCreated as { ok: { id: bigint } }).ok.id;

  // Rejecting marks the candidate Rejected and creates no Person.
  candActor.setIdentity(adminIdentity);
  const rejected = await candActor.rejectNewPersonCandidate(rejectId);
  expect(rejected).toEqual([
    expect.objectContaining({ id: rejectId, status: { Rejected: null } }),
  ]);
  await expect(candActor.getPersonProfile("rejectednorwood")).resolves.toEqual([]);

  // Needs Research marks the candidate NeedsResearch and creates no Person.
  const needsResearch = await candActor.needsResearchNewPersonCandidate(needsId);
  expect(needsResearch).toEqual([
    expect.objectContaining({ id: needsId, status: { NeedsResearch: null } }),
  ]);
  await expect(candActor.getPersonProfile("needsresearchnorwood")).resolves.toEqual([]);

  // The queue reflects the rejected and needs-research counts.
  const queue = await candActor.getReviewQueue();
  expect(queue.rejected).toBe(1n);
  expect(queue.needsResearch).toBe(1n);
});

// ---------------------------------------------------------------------------
// Relationship Proposal review actions (cover for the Research Review Actions
// change). A pending proposal is approved (creating/updating the canonical
// relationship exactly once, updating the family graph, and preventing
// duplicates), rejected (leaving the graph unchanged), or marked Needs Research
// (leaving the graph unchanged). Pending counts decrement immediately.
// ---------------------------------------------------------------------------

it("approves a Relationship proposal, updating the family graph exactly once without duplicates", async () => {
  const relSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const relActor = relSetup.actor;

  // ADMIN becomes the Family Steward; CONTRIBUTOR registers as an approved
  // family member so they may create research sources and proposals.
  await registerApprovedContributor(relActor);

  // A contributor creates a source and a relationship proposal.
  relActor.setIdentity(contributorIdentity);
  const sourceCreated = await relActor.createSource(
    "1900 census, Norwood household",
    { CensusCitation: null },
    "Census record listing the Norwood family.",
    [],
  );
  const sourceId = (sourceCreated as { ok: { id: bigint } }).ok.id;
  const proposalCreated = await relActor.createRelationshipProposal(
    "clayton",
    "julia",
    "Father",
    sourceId,
  );
  expect(proposalCreated).toEqual({
    ok: expect.objectContaining({
      fromPersonId: "clayton",
      toPersonId: "julia",
      relationshipType: "Father",
      sourceId,
      status: { Pending: null },
    }),
  });
  const proposalId = (proposalCreated as { ok: { id: bigint } }).ok.id;

  // The steward sees the pending proposal in the review queue. The pending
  // count includes the linked source (still pending) plus the proposal.
  relActor.setIdentity(adminIdentity);
  const queueBefore = await relActor.getReviewQueue();
  expect(queueBefore.pending).toBe(2n);
  const proposalItem = queueBefore.items.find((i) => i.kind.RelationshipProposal !== undefined);
  expect(proposalItem).toMatchObject({
    id: proposalId,
    title: "clayton - Father - julia",
    status: { Pending: null },
  });
  expect(proposalItem!.actions).toEqual([
    { Approve: null },
    { Reject: null },
    { NeedsResearch: null },
  ]);

  // Approving updates the family graph exactly once and marks the proposal
  // Approved; the pending count decrements immediately (the source remains
  // pending, so pending drops from 2 to 1).
  const approved = await relActor.approveRelationshipProposal(proposalId);
  expect(approved).toEqual([
    expect.objectContaining({ id: proposalId, status: { Approved: null } }),
  ]);
  const queueAfter = await relActor.getReviewQueue();
  expect(queueAfter.pending).toBe(1n);
  expect(queueAfter.approved).toBe(1n);

  // The canonical relationship is in the family graph exactly once. "Father"
  // maps to the #Parent relationship type.
  const relationships = await relActor.listConfirmedRelationships();
  const matching = relationships.filter(
    (r) =>
      r.fromPersonId === "clayton" &&
      r.toPersonId === "julia" &&
      "Parent" in r.relationshipType,
  );
  expect(matching).toHaveLength(1);

  // The approval is recorded in Audit History.
  const audit = await relActor.getResearchAuditLog();
  expect(
    audit.some(
      (e) =>
        e.action === "RelationshipProposalApproved" &&
        e.summary === "Relationship proposal 'clayton - Father - julia' approved",
    ),
  ).toBe(true);
});

it("rejects and marks-needs-research Relationship proposals, leaving the family graph unchanged", async () => {
  const relSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const relActor = relSetup.actor;

  // ADMIN becomes the Family Steward; CONTRIBUTOR registers as an approved
  // family member so they may create research sources and proposals.
  await registerApprovedContributor(relActor);

  // A contributor creates a source and two proposals.
  relActor.setIdentity(contributorIdentity);
  const sourceCreated = await relActor.createSource(
    "1900 census, Norwood household",
    { CensusCitation: null },
    "Census record listing the Norwood family.",
    [],
  );
  const sourceId = (sourceCreated as { ok: { id: bigint } }).ok.id;
  const rejectCreated = await relActor.createRelationshipProposal(
    "clayton",
    "julia",
    "Father",
    sourceId,
  );
  const needsCreated = await relActor.createRelationshipProposal(
    "clayton",
    "julia",
    "Brother",
    sourceId,
  );
  const rejectId = (rejectCreated as { ok: { id: bigint } }).ok.id;
  const needsId = (needsCreated as { ok: { id: bigint } }).ok.id;

  // Rejecting marks the proposal Rejected and leaves the graph unchanged.
  relActor.setIdentity(adminIdentity);
  const rejected = await relActor.rejectRelationshipProposal(rejectId);
  expect(rejected).toEqual([
    expect.objectContaining({ id: rejectId, status: { Rejected: null } }),
  ]);
  await expect(relActor.listConfirmedRelationships()).resolves.toEqual([]);

  // Needs Research marks the proposal NeedsResearch and leaves the graph unchanged.
  const needsResearch = await relActor.needsResearchRelationshipProposal(needsId);
  expect(needsResearch).toEqual([
    expect.objectContaining({ id: needsId, status: { NeedsResearch: null } }),
  ]);
  await expect(relActor.listConfirmedRelationships()).resolves.toEqual([]);

  // The queue reflects the rejected and needs-research counts.
  const queue = await relActor.getReviewQueue();
  expect(queue.rejected).toBe(1n);
  expect(queue.needsResearch).toBe(1n);
});
