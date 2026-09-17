import { PocketIc } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";
import {
  ADMIN,
  BACKEND_WASM,
  type CanisterId,
  adminIdentity,
  contributorIdentity,
  registerApprovedContributor,
  routeConflictingFindingToReview,
} from "./lane-helpers";

// ---------------------------------------------------------------------------
// Conflict Review lifecycle (cover for the Conflict Review change). When a
// Proposed Finding labelled `#Conflicting` is approved, it is routed to a
// Conflict Review item instead of silently overwriting canonical data. The item
// captures the affected Person, the disputed field, both the existing canonical
// value and the proposed value, the proposed finding's source, and its evidence
// label. Canonical data is never altered at creation. A steward then resolves
// the item with one of four explicit actions (Keep Existing, Replace Existing,
// Preserve Both / Unresolved, Needs Research), each recording an audit entry.
//
// These tests were split out of backend.test.ts. That file installed ~26
// canisters into a single PocketIC instance, which exhausted the shared
// sidecar's pid ceiling partway through and cascaded into `fetch failed` /
// `Test timed out` failures for every test after the ceiling was hit. Each test
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

// A lazily-created canister shared by the conflict tests that are mutually
// compatible. Installing a canister replays the whole migration chain and is the
// single most expensive operation in this lane; creating one per test pushed the
// shared PocketIC sidecar past its pid ceiling, at which point the replica
// stopped accepting connections and every later test failed with `fetch failed`
// — a cascade that looked like a dead backend but was really install pressure.
//
// Only tests that leave the canonical lorenzoSmithJr preferredName at 'Waxx
// Minty' and that scope their assertions by conflict/finding id may share this
// canister. Tests that mutate canonical data (Replace Existing), assert global
// counts or list lengths, or depend on a specific birthplace value keep their
// own canister, because sharing would change what they observe.
let sharedConflictCanister: { actor: _SERVICE; canisterId: CanisterId } | undefined;

async function sharedConflictActor(): Promise<_SERVICE> {
  if (sharedConflictCanister === undefined) {
    const setup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
    sharedConflictCanister = { actor: setup.actor, canisterId: setup.canisterId };
  }
  return sharedConflictCanister.actor;
}

it("creates a Conflict Review item on a disagreeing finding and leaves canonical data unchanged", async () => {
  const conflictActor = await sharedConflictActor();

  const { conflictId, findingId } = await routeConflictingFindingToReview(conflictActor);

  // The conflict review item exists with the disputed field and both values.
  const items = await conflictActor.listConflictReviewItems();
  const conflict = items.find((c) => c.id === conflictId);
  expect(conflict).toMatchObject({
    id: conflictId,
    findingId,
    personId: ["lorenzoSmithJr"],
    field: "preferredName",
    canonicalValue: "Waxx Minty",
    proposedValue: "Lorenzo Smith Jr.",
    evidenceLabel: { Conflicting: null },
  });

  // Canonical data is NEVER altered at conflict creation: the canonical
  // preferredName stays 'Waxx Minty' before any review decision.
  const profile = await conflictActor.getPersonProfile("lorenzoSmithJr");
  expect(profile).toEqual([
    expect.objectContaining({
      personId: "lorenzoSmithJr",
      preferredName: ["Waxx Minty"],
    }),
  ]);
});

it("resolves a conflict with Keep Existing, leaving canonical unchanged and preserving the proposed research", async () => {
  const conflictActor = await sharedConflictActor();

  const { conflictId, findingId } = await routeConflictingFindingToReview(conflictActor);

  // Keep Existing resolves the conflict (#Approved) and leaves canonical data
  // unchanged.
  conflictActor.setIdentity(adminIdentity);
  const resolved = await conflictActor.resolveConflict(
    conflictId,
    { KeepExisting: null },
    "Canonical record is authoritative",
  );
  expect(resolved).toEqual({
    ok: expect.objectContaining({
      id: conflictId,
      status: { Approved: null },
      stewardNotes: "Canonical record is authoritative",
      resolvedBy: [ADMIN],
    }),
  });

  // Canonical data is unchanged.
  const profile = await conflictActor.getPersonProfile("lorenzoSmithJr");
  expect(profile).toEqual([
    expect.objectContaining({ preferredName: ["Waxx Minty"] }),
  ]);

  // The linked finding is marked Rejected (the proposed research is preserved
  // but not adopted), and the conflict is no longer unresolved.
  const finding = await conflictActor.getFinding(findingId);
  expect(finding).toEqual([
    expect.objectContaining({ id: findingId, status: { Rejected: null } }),
  ]);
  const items = await conflictActor.listConflictReviewItems();
  expect(items.find((c) => c.id === conflictId)!.status).toEqual({ Approved: null });

  // The resolution is recorded in Audit History.
  const audit = await conflictActor.getResearchAuditLog();
  expect(
    audit.some(
      (e) =>
        e.action === "ConflictResolved" &&
        e.summary === "Conflict Review item #" + conflictId.toString() + " resolved (KeepExisting)",
    ),
  ).toBe(true);
});

it("resolves a conflict with Replace Existing, updating canonical once and preserving old + new provenance", async () => {
  const conflictSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const conflictActor = conflictSetup.actor;

  const { conflictId, findingId } = await routeConflictingFindingToReview(conflictActor);

  // Replace Existing writes the proposed value into canonical data exactly once
  // and resolves the conflict (#Approved).
  conflictActor.setIdentity(adminIdentity);
  const resolved = await conflictActor.resolveConflict(
    conflictId,
    { ReplaceExisting: null },
    "New source is more reliable",
  );
  expect(resolved).toEqual({
    ok: expect.objectContaining({
      id: conflictId,
      status: { Approved: null },
      stewardNotes: "New source is more reliable",
      resolvedBy: [ADMIN],
    }),
  });

  // The canonical preferredName is now the proposed value.
  const profile = await conflictActor.getPersonProfile("lorenzoSmithJr");
  expect(profile).toEqual([
    expect.objectContaining({
      personId: "lorenzoSmithJr",
      preferredName: ["Lorenzo Smith Jr."],
    }),
  ]);

  // The old value and its provenance are preserved in the conflict/audit
  // history: the conflict item still records the canonical value 'Waxx Minty'
  // it replaced.
  const items = await conflictActor.listConflictReviewItems();
  expect(items.find((c) => c.id === conflictId)).toMatchObject({
    canonicalValue: "Waxx Minty",
    proposedValue: "Lorenzo Smith Jr.",
  });

  // The linked finding is marked Approved (the proposed research was adopted).
  const finding = await conflictActor.getFinding(findingId);
  expect(finding).toEqual([
    expect.objectContaining({ id: findingId, status: { Approved: null } }),
  ]);

  // The resolution is recorded in Audit History.
  const audit = await conflictActor.getResearchAuditLog();
  expect(
    audit.some(
      (e) =>
        e.action === "ConflictResolved" &&
        e.summary === "Conflict Review item #" + conflictId.toString() + " resolved (ReplaceExisting)",
    ),
  ).toBe(true);
});

it("keeps both values visible as an unresolved conflict with Preserve Both", async () => {
  const conflictActor = await sharedConflictActor();

  const { conflictId } = await routeConflictingFindingToReview(conflictActor);

  // Preserve Both keeps the item #Conflicting (unresolved) without silently
  // choosing either value, and leaves canonical data unchanged.
  conflictActor.setIdentity(adminIdentity);
  const resolved = await conflictActor.resolveConflict(
    conflictId,
    { PreserveBoth: null },
    "Keep both until more evidence",
  );
  expect(resolved).toEqual({
    ok: expect.objectContaining({
      id: conflictId,
      status: { Conflicting: null },
      stewardNotes: "Keep both until more evidence",
    }),
  });

  // Canonical data is unchanged.
  const profile = await conflictActor.getPersonProfile("lorenzoSmithJr");
  expect(profile).toEqual([
    expect.objectContaining({ preferredName: ["Waxx Minty"] }),
  ]);

  // The conflict remains unresolved (#Conflicting) and is surfaced by
  // listConflictsForPerson.
  const items = await conflictActor.listConflictReviewItems();
  expect(items.find((c) => c.id === conflictId)!.status).toEqual({ Conflicting: null });
  const surfaced = await conflictActor.listConflictsForPerson("lorenzoSmithJr");
  expect(surfaced.map((c) => c.id)).toContain(conflictId);
});

it("retains the conflict with Needs Research status, leaving canonical unchanged", async () => {
  const conflictActor = await sharedConflictActor();

  const { conflictId, findingId } = await routeConflictingFindingToReview(conflictActor);

  // Needs Research leaves canonical data unchanged and retains the conflict
  // with #NeedsResearch status.
  conflictActor.setIdentity(adminIdentity);
  const resolved = await conflictActor.resolveConflict(
    conflictId,
    { NeedsResearch: null },
    "Need to verify the source",
  );
  expect(resolved).toEqual({
    ok: expect.objectContaining({
      id: conflictId,
      status: { NeedsResearch: null },
      stewardNotes: "Need to verify the source",
    }),
  });

  // Canonical data is unchanged.
  const profile = await conflictActor.getPersonProfile("lorenzoSmithJr");
  expect(profile).toEqual([
    expect.objectContaining({ preferredName: ["Waxx Minty"] }),
  ]);

  // The conflict is retained with #NeedsResearch status and surfaced.
  const items = await conflictActor.listConflictReviewItems();
  expect(items.find((c) => c.id === conflictId)!.status).toEqual({ NeedsResearch: null });
  const surfaced = await conflictActor.listConflictsForPerson("lorenzoSmithJr");
  expect(surfaced.map((c) => c.id)).toContain(conflictId);

  // The linked finding is marked NeedsResearch.
  const finding = await conflictActor.getFinding(findingId);
  expect(finding).toEqual([
    expect.objectContaining({ id: findingId, status: { NeedsResearch: null } }),
  ]);
});

it("records audit entries for every conflict resolution and persists state across callers", async () => {
  const conflictActor = await sharedConflictActor();

  const { conflictId } = await routeConflictingFindingToReview(conflictActor);

  // Resolve the conflict as the steward.
  conflictActor.setIdentity(adminIdentity);
  await conflictActor.resolveConflict(
    conflictId,
    { KeepExisting: null },
    "Canonical is authoritative",
  );

  // The audit log records the resolution with the acting steward and timestamp.
  const audit = await conflictActor.getResearchAuditLog();
  const resolution = audit.find(
    (e) =>
      e.action === "ConflictResolved" &&
      e.summary === "Conflict Review item #" + conflictId.toString() + " resolved (KeepExisting)",
  );
  expect(resolution).toBeDefined();
  expect(resolution!.actorId).toEqual(ADMIN);
  expect(resolution!.timestamp).toEqual(expect.any(BigInt));

  // State persists across sign out/sign in: a fresh actor (a different caller
  // session) reading the same canister still sees the resolved conflict and the
  // unchanged canonical value. The conflict item is steward-readable and the
  // canonical profile is public.
  const freshActor = pic!.createActor<_SERVICE>(idlFactory, sharedConflictCanister!.canisterId);
  freshActor.setIdentity(adminIdentity);
  const items = await freshActor.listConflictReviewItems();
  expect(items.find((c) => c.id === conflictId)!.status).toEqual({ Approved: null });
  const profile = await freshActor.getPersonProfile("lorenzoSmithJr");
  expect(profile).toEqual([
    expect.objectContaining({ preferredName: ["Waxx Minty"] }),
  ]);
});

it("gates listConflictReviewItems and resolveConflict to Family Stewards", async () => {
  const conflictActor = await sharedConflictActor();

  const { conflictId } = await routeConflictingFindingToReview(conflictActor);

  // A signed-in non-steward cannot list or resolve conflict review items.
  conflictActor.setIdentity(contributorIdentity);
  await expect(conflictActor.listConflictReviewItems()).rejects.toThrow();
  await expect(
    conflictActor.resolveConflict(conflictId, { KeepExisting: null }, ""),
  ).rejects.toThrow();

  // An anonymous caller is also rejected.
  const anonymousActor = pic!.createActor<_SERVICE>(idlFactory, sharedConflictCanister!.canisterId);
  await expect(anonymousActor.listConflictReviewItems()).rejects.toThrow();
  await expect(
    anonymousActor.resolveConflict(conflictId, { KeepExisting: null }, ""),
  ).rejects.toThrow();
});

it("counts each unresolved conflict exactly once in the review queue, not double-counting the linked finding", async () => {
  const conflictSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const conflictActor = conflictSetup.actor;

  const { conflictId } = await routeConflictingFindingToReview(conflictActor);

  // The conflict item is created as #Conflicting (unresolved) and the linked
  // finding is excluded from the queue, so the unresolved conflict is counted
  // exactly once — not double-counted as both a finding and a conflict item.
  conflictActor.setIdentity(adminIdentity);
  const queue = await conflictActor.getReviewQueue();
  expect(queue.conflicting).toBe(1n);

  // The linked finding is not present as a separate queue item.
  const findingItems = queue.items.filter((i) => i.kind.Finding !== undefined);
  expect(findingItems).toHaveLength(0);

  // The conflict item is present in the queue exactly once, as #Conflicting.
  const conflictItems = queue.items.filter((i) => i.kind.ConflictReview !== undefined);
  expect(conflictItems).toHaveLength(1);
  expect(conflictItems[0]).toMatchObject({
    id: conflictId,
    status: { Conflicting: null },
  });
});

it("reports one conflicting item in the review queue and one conflict review item with structured fields", async () => {
  const conflictSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const conflictActor = conflictSetup.actor;

  const { conflictId, findingId } = await routeConflictingFindingToReview(conflictActor);

  // The review queue counts the single routed conflict exactly once as
  // #Conflicting.
  conflictActor.setIdentity(adminIdentity);
  const queue = await conflictActor.getReviewQueue();
  expect(queue.conflicting).toBe(1n);

  // The conflict review list holds exactly the one routed item, with the
  // expected structured fields: the disputed field, both values, the affected
  // person, the proposed finding's source, and the #Conflicting evidence label.
  const items = await conflictActor.listConflictReviewItems();
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({
    id: conflictId,
    findingId,
    personId: ["lorenzoSmithJr"],
    field: "preferredName",
    canonicalValue: "Waxx Minty",
    proposedValue: "Lorenzo Smith Jr.",
    proposedSourceId: [expect.any(BigInt)],
    evidenceLabel: { Conflicting: null },
    status: { Conflicting: null },
    stewardNotes: "",
  });
});

// ---------------------------------------------------------------------------
// Conflict Review structured-field contract (cover for the Conflict Review
// list-query / error-masking repair). This test pins the full ConflictReviewItem
// shape the frontend depends on — personId, existingSourceId, proposedSourceId,
// evidenceLabel, stewardNotes, status, resolvedBy, resolvedAt — so a stale or
// drifted backend contract is caught here rather than surfacing as a masked
// "No conflicts to review" in the UI. It reuses routeConflictingFindingToReview
// and the PocketIc setup, and needs no OAuth (setIdentity with the admin and
// contributor identities, exactly as the other conflict tests do).
// ---------------------------------------------------------------------------

it("returns one conflict review item with the full structured field contract, and populates resolvedBy/resolvedAt on resolution", async () => {
  const conflictSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const conflictActor = conflictSetup.actor;

  // Create a conflicting finding and route it into Conflict Review.
  const { conflictId, findingId } = await routeConflictingFindingToReview(conflictActor);

  // The review queue counts the single routed conflict exactly once.
  conflictActor.setIdentity(adminIdentity);
  const queue = await conflictActor.getReviewQueue();
  expect(queue.conflicting).toBe(1n);

  // The conflict review list holds exactly the one routed item.
  const items = await conflictActor.listConflictReviewItems();
  expect(items).toHaveLength(1);

  // The returned conflict carries every structured field the frontend reads.
  // existingSourceId is null because the canonical 'Waxx Minty' value is seeded
  // by the migration with no known source; proposedSourceId is the finding's
  // source. An unresolved item has no resolvedBy/resolvedAt yet.
  const conflict = items[0];
  expect(conflict).toMatchObject({
    id: conflictId,
    findingId,
    personId: ["lorenzoSmithJr"],
    field: "preferredName",
    canonicalValue: "Waxx Minty",
    proposedValue: "Lorenzo Smith Jr.",
    existingSourceId: [],
    proposedSourceId: [expect.any(BigInt)],
    evidenceLabel: { Conflicting: null },
    stewardNotes: "",
    status: { Conflicting: null },
    resolvedBy: [],
    resolvedAt: [],
  });

  // Resolving the conflict populates resolvedBy (the acting steward) and
  // resolvedAt (a timestamp), so the frontend can render who/when it was
  // resolved.
  const resolved = await conflictActor.resolveConflict(
    conflictId,
    { KeepExisting: null },
    "Canonical record is authoritative",
  );
  expect(resolved).toEqual({
    ok: expect.objectContaining({
      id: conflictId,
      status: { Approved: null },
      stewardNotes: "Canonical record is authoritative",
      resolvedBy: [ADMIN],
      resolvedAt: [expect.any(BigInt)],
    }),
  });
});

// ---------------------------------------------------------------------------
// Person Fact field mapping (cover for the field-mapping change). A Person Fact
// finding submitted with a human label like 'Birth Place' is normalized to the
// canonical 'birthplace' key in both canonicalValueFor and applyPersonFact, so
// Conflict Review reads and writes the same canonical field. An unmappable
// field returns a clear unsupported-field error on Replace Existing instead of
// silently resolving, leaving the conflict unresolved and canonical data
// unchanged.
// ---------------------------------------------------------------------------

// A helper that seeds a `#Conflicting` PersonFact finding whose field is a
// human label ('Birth Place') that must normalize to the canonical 'birthplace'
// key, and routes it to Conflict Review. Returns the conflict item id.
async function routeHumanLabelFindingToReview(
  conflictActor: _SERVICE,
): Promise<{ conflictId: bigint; findingId: bigint }> {
  // ADMIN becomes the Family Steward; CONTRIBUTOR registers as an approved
  // family member so they may create research sources and findings.
  await registerApprovedContributor(conflictActor);

  // A contributor creates a source and a `#Conflicting` PersonFact finding whose
  // field is the human label 'Birth Place' (not the canonical key).
  conflictActor.setIdentity(contributorIdentity);
  const sourceCreated = await conflictActor.createSource(
    "1900 census, Norwood household",
    { CensusCitation: null },
    "Census record listing the Norwood family.",
    [],
  );
  const sourceId = (sourceCreated as { ok: { id: bigint } }).ok.id;
  const findingCreated = await conflictActor.createFinding(
    "Birthplace of Julia Norwood",
    { Conflicting: null },
    { PersonFact: null },
    {
      PersonFact: {
        field: "Birth Place",
        value: "Springfield, IL",
        personId: "julia",
      },
    },
    sourceId,
    ["julia"],
    [],
  );
  const findingId = (findingCreated as { ok: { id: bigint } }).ok.id;

  // A steward approves the `#Conflicting` finding, routing it to Conflict
  // Review. canonicalValueFor normalizes 'Birth Place' to 'birthplace' so the
  // conflict reads the canonical birthplace value.
  conflictActor.setIdentity(adminIdentity);
  await conflictActor.approveFinding(findingId);
  const items = await conflictActor.listConflictReviewItems();
  const conflict = items.find((c) => c.findingId === findingId);
  expect(conflict).toBeDefined();
  return { conflictId: conflict!.id, findingId };
}

it("normalizes a human Person Fact field label to its canonical key in Conflict Review", async () => {
  const conflictSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const conflictActor = conflictSetup.actor;

  const { conflictId } = await routeHumanLabelFindingToReview(conflictActor);

  // The conflict item's field is the human label as submitted, but the
  // canonical value is read from the 'birthplace' profile field (the human
  // label 'Birth Place' normalized to the canonical key). Julia's canonical
  // birthplace is seeded by the migration.
  const items = await conflictActor.listConflictReviewItems();
  const conflict = items.find((c) => c.id === conflictId);
  expect(conflict).toMatchObject({
    id: conflictId,
    field: "Birth Place",
    personId: ["julia"],
  });

  // Replace Existing writes the proposed value into the canonical 'birthplace'
  // field (applyPersonFact normalizes 'Birth Place' to 'birthplace') and
  // resolves the conflict.
  conflictActor.setIdentity(adminIdentity);
  const resolved = await conflictActor.resolveConflict(
    conflictId,
    { ReplaceExisting: null },
    "New source is more reliable",
  );
  expect(resolved).toEqual({
    ok: expect.objectContaining({ id: conflictId, status: { Approved: null } }),
  });

  // The canonical birthplace field was updated to the proposed value.
  const profile = await conflictActor.getPersonProfile("julia");
  expect(profile).toEqual([
    expect.objectContaining({ birthplace: ["Springfield, IL"] }),
  ]);
});

it("returns a clear unsupported-field error on Replace Existing for an unmappable Person Fact field, leaving the conflict unresolved and canonical data unchanged", async () => {
  const conflictSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const conflictActor = conflictSetup.actor;

  // ADMIN becomes the Family Steward; CONTRIBUTOR registers as an approved
  // family member so they may create research sources and findings.
  await registerApprovedContributor(conflictActor);

  // A contributor creates a source and a `#Conflicting` PersonFact finding with
  // an unmappable field.
  conflictActor.setIdentity(contributorIdentity);
  const sourceCreated = await conflictActor.createSource(
    "1900 census, Norwood household",
    { CensusCitation: null },
    "Census record listing the Norwood family.",
    [],
  );
  const sourceId = (sourceCreated as { ok: { id: bigint } }).ok.id;
  const findingCreated = await conflictActor.createFinding(
    "Favorite color of Julia Norwood",
    { Conflicting: null },
    { PersonFact: null },
    {
      PersonFact: {
        field: "Favorite Color",
        value: "Blue",
        personId: "julia",
      },
    },
    sourceId,
    ["julia"],
    [],
  );
  const findingId = (findingCreated as { ok: { id: bigint } }).ok.id;

  // A steward approves the `#Conflicting` finding, routing it to Conflict
  // Review.
  conflictActor.setIdentity(adminIdentity);
  await conflictActor.approveFinding(findingId);
  const items = await conflictActor.listConflictReviewItems();
  const conflict = items.find((c) => c.findingId === findingId);
  expect(conflict).toBeDefined();
  const conflictId = conflict!.id;

  // Replace Existing on the unmappable field returns a clear unsupported-field
  // error instead of silently resolving.
  const resolved = await conflictActor.resolveConflict(
    conflictId,
    { ReplaceExisting: null },
    "Replace it",
  );
  expect(resolved).toEqual({
    err: { invalidState: "Unsupported Person Fact field: 'Favorite Color'" },
  });

  // The conflict is left unresolved (#Conflicting) and no resolution was
  // recorded.
  const after = await conflictActor.listConflictReviewItems();
  expect(after.find((c) => c.id === conflictId)!.status).toEqual({ Conflicting: null });

  // Canonical data is unchanged: Julia's birthplace is still unset (null).
  const profile = await conflictActor.getPersonProfile("julia");
  expect(profile).toEqual([
    expect.objectContaining({ birthplace: [] }),
  ]);
});
