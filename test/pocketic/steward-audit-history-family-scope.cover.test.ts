import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";
import {
  BACKEND_WASM,
  adminIdentity,
  blob,
  contributorIdentity,
  registerApprovedContributor,
} from "./lane-helpers";

// ---------------------------------------------------------------------------
// Tenancy 1C — family-scoped merged Steward Audit History (real-canister cover).
//
// The accepted behavior is that the merged Steward Audit History is fully
// family-scoped: `getStewardAuditHistoryForFamily(familyId)` returns only the
// governance and Research audit entries belonging to `familyId`, and the legacy
// `getStewardAuditHistory()` still returns the default-family (Norwood) history
// unchanged. A Steward of one family can never receive another family's audit
// entries, even when the same person or actor participates in both families.
//
// The frontend suite mocks the actor, so none of this is visible there. This
// file installs the app's own compiled wasm and drives the real public API.
//
// Test-only families: `test-family-a` and `test-family-b`. There is no
// family-creation endpoint, and the family-scoped endpoints accept an arbitrary
// familyId, so a caller becomes an approved member of a family by creating a
// profile in it (`createMyselfForFamily` writes an APPROVED claim for the caller
// in that family). That is the only public path to non-default-family
// membership.
//
// Coverage limit this file cannot close: there is no public endpoint that
// creates a Steward of a non-default family (`claimSteward` and
// `promoteToSteward` both write `familyId = "norwood"`, and
// `promoteToStewardForFamily` requires the caller to already be an active
// Steward of the supplied family). A Family A/B Steward therefore cannot be
// bootstrapped through the public API, so the family-scoped merged read can only
// ever be executed by the Norwood Steward, and the Family A/B reads are always
// denied. The boundary is therefore driven in the direction the API supports:
// the Norwood Steward's Norwood read must never return a Family A/B entry, the
// Norwood Steward is denied on the Family A/B merged reads, and the merged
// Norwood history still contains every Norwood governance entry. The internal
// family-filter predicate (`governanceEntryBelongsToFamily`) is exercised
// through the real merged read below.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";
const NORWOOD = "norwood";

const STEWARD_MARKER =
  "Unauthorized: Only Family Stewards can perform this action";

let pic: PocketIc | undefined;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
});

afterAll(async () => {
  await pic?.tearDown();
});

// Deterministic identities. ADMIN is the first caller to
// _initialize_access_control and claims the Norwood Steward role; CONTRIBUTOR
// is an approved Norwood member. MEMBER_A and MEMBER_B become approved members
// of the two test-only families. DUAL_MEMBER becomes an approved member of BOTH
// test families, so a single actor's actions can be checked for separation.
const memberAIdentity = createIdentity("steward-audit-family-a-seed");
const memberBIdentity = createIdentity("steward-audit-family-b-seed");
const dualMemberIdentity = createIdentity("steward-audit-dual-member-seed");

interface Seeded {
  actor: _SERVICE;
  canisterId: ReturnType<typeof createIdentity>["getPrincipal"];
}

/**
 * A fresh canister with the Norwood Steward bootstrapped, an approved Norwood
 * contributor, and MEMBER_A / MEMBER_B approved in their respective test-only
 * families. Each test seeds its own canister so no test depends on the order
 * another ran in.
 */
async function setupFamilies(): Promise<Seeded> {
  const setup = await pic!.setupCanister<_SERVICE>({
    idlFactory,
    wasm: BACKEND_WASM,
  });
  const actor = setup.actor;

  await registerApprovedContributor(actor);

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

/**
 * Uploads a research source file into `familyId` as the currently-set caller
 * and returns the created Source id. The upload itself writes no audit entry
 * (only the legacy `createSource` does), so it never pollutes the audit
 * assertions below.
 */
async function uploadSourceInto(
  actor: _SERVICE,
  familyId: string,
  title: string,
): Promise<bigint> {
  const result = await actor.createSourceWithUploadForFamily(
    familyId,
    title,
    { CensusCitation: null },
    `A research source in ${familyId}.`,
    "application/pdf",
    blob,
    ["census"],
    "",
    [],
    [],
    { FamilyOnly: null },
    { Standard: null },
    [],
    `${title.replace(/\s+/gu, "-").toLowerCase()}.pdf`,
  );
  if (!("ok" in result)) {
    throw new Error(`createSourceWithUploadForFamily failed: ${JSON.stringify(result)}`);
  }
  return result.ok.source.id;
}

/**
 * Performs a Research action in `familyId` as the currently-set caller: uploads
 * a source and submits a New Person Candidate linked to it. Returns the
 * candidate id. The candidate submission is the audit-writing action; the
 * upload is not.
 */
async function submitCandidateInFamily(
  actor: _SERVICE,
  familyId: string,
  name: string,
): Promise<bigint> {
  const sourceId = await uploadSourceInto(actor, familyId, `${name} source`);
  const created = await actor.createNewPersonCandidateForFamily(
    familyId,
    name,
    "A previously unrecorded family member.",
    sourceId,
  );
  if (!("ok" in created)) {
    throw new Error(`createNewPersonCandidateForFamily failed: ${JSON.stringify(created)}`);
  }
  return created.ok.id;
}

/**
 * Creates a governance audit entry in the default family: the Norwood Steward
 * promotes the approved claimed `clayton` profile to Steward. This appends a
 * `#StewardPromoted` governance entry whose actor is the Norwood Steward.
 */
async function createNorwoodGovernanceEntry(actor: _SERVICE): Promise<void> {
  actor.setIdentity(adminIdentity);
  const promoted = await actor.promoteToStewardForFamily(NORWOOD, "clayton");
  expect("ok" in promoted).toBe(true);
}

// ---------------------------------------------------------------------------
// (1) The merged Norwood history contains the Norwood governance entry, and a
//     Family A Research action never leaks into it.
// ---------------------------------------------------------------------------

it("keeps the Norwood governance entry in the merged Norwood history", async () => {
  const { actor } = await setupFamilies();

  await createNorwoodGovernanceEntry(actor);

  actor.setIdentity(adminIdentity);
  const merged = await actor.getStewardAuditHistory();
  const governance = merged.filter((e) => "Governance" in e.kind);
  const promoted = governance.find((e) => e.actionType === "StewardPromoted");
  expect(promoted).toBeDefined();
  expect(promoted!.summary).toContain("clayton");
  expect(promoted!.actorAccountId).toEqual(adminIdentity.getPrincipal());
});

it("does not leak a Family A Research action into the merged Norwood history", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  await submitCandidateInFamily(actor, FAMILY_A, "Family A Unknown");

  actor.setIdentity(adminIdentity);
  const merged = await actor.getStewardAuditHistory();
  expect(
    merged.find((e) => e.summary.includes("Family A Unknown")),
  ).toBeUndefined();

  // The legacy read agrees with the family-scoped Norwood read.
  const norwoodMerged = await actor.getStewardAuditHistoryForFamily(NORWOOD);
  expect(
    norwoodMerged.find((e) => e.summary.includes("Family A Unknown")),
  ).toBeUndefined();
});

it("does not leak a Family B Research action into the merged Norwood history", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberBIdentity);
  await submitCandidateInFamily(actor, FAMILY_B, "Family B Unknown");

  actor.setIdentity(adminIdentity);
  const merged = await actor.getStewardAuditHistory();
  expect(
    merged.find((e) => e.summary.includes("Family B Unknown")),
  ).toBeUndefined();
});

// ---------------------------------------------------------------------------
// (2) A single actor participating in both Family A and Family B produces
//     correctly separated histories: each Research action is written to its own
//     family and neither leaks into the default family's merged history.
// ---------------------------------------------------------------------------

it("separates a dual-family actor's merged history per family", async () => {
  const { actor } = await setupFamilies();

  // The same identity becomes an approved member of both test families.
  actor.setIdentity(dualMemberIdentity);
  await actor._initialize_access_control();
  const createdA = await actor.createMyselfForFamily(FAMILY_A, "Dual Member A");
  expect("ok" in createdA).toBe(true);
  const createdB = await actor.createMyselfForFamily(FAMILY_B, "Dual Member B");
  expect("ok" in createdB).toBe(true);

  await submitCandidateInFamily(actor, FAMILY_A, "Dual Family A Candidate");
  await submitCandidateInFamily(actor, FAMILY_B, "Dual Family B Candidate");

  // Neither action leaks into the Norwood merged history, so each was written
  // to its own family rather than to the default family.
  actor.setIdentity(adminIdentity);
  const merged = await actor.getStewardAuditHistory();
  expect(
    merged.find((e) => e.summary.includes("Dual Family A Candidate")),
  ).toBeUndefined();
  expect(
    merged.find((e) => e.summary.includes("Dual Family B Candidate")),
  ).toBeUndefined();
});

// ---------------------------------------------------------------------------
// (3) Cross-family read denial: the Norwood Steward is denied the Family A and
//     Family B merged reads, and an approved Family A member is denied the
//     Family A merged read because membership is not Steward authority.
// ---------------------------------------------------------------------------

it("denies the Norwood Steward the Family A and Family B merged reads", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  await submitCandidateInFamily(actor, FAMILY_A, "Boundary A Candidate");

  actor.setIdentity(adminIdentity);
  await expect(actor.getStewardAuditHistoryForFamily(FAMILY_A)).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
  await expect(actor.getStewardAuditHistoryForFamily(FAMILY_B)).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
});

it("denies an approved Family A member the Family A merged read", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  await submitCandidateInFamily(actor, FAMILY_A, "Member A Candidate");

  // Approved membership is not Steward authority: the merged read is denied.
  await expect(actor.getStewardAuditHistoryForFamily(FAMILY_A)).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
});

it("denies an anonymous caller the family-scoped merged read", async () => {
  const { canisterId } = await setupFamilies();

  const anonymousActor = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  await expect(
    anonymousActor.getStewardAuditHistoryForFamily(NORWOOD),
  ).rejects.toThrow();
});

// ---------------------------------------------------------------------------
// (4) Default Norwood behavior is unchanged: the legacy read still returns the
//     merged history, still contains every governance entry, and the
//     family-scoped Norwood read agrees with it.
// ---------------------------------------------------------------------------

it("keeps the default-family merged history readable through the legacy read", async () => {
  const { actor } = await setupFamilies();

  await createNorwoodGovernanceEntry(actor);

  actor.setIdentity(adminIdentity);
  const legacy = await actor.getStewardAuditHistory();
  const norwood = await actor.getStewardAuditHistoryForFamily(NORWOOD);

  // The legacy read and the family-scoped Norwood read return the same entries.
  expect(legacy.map((e) => e.id).sort()).toEqual(norwood.map((e) => e.id).sort());

  // The Norwood governance entry is present in both.
  expect(
    legacy.some((e) => "Governance" in e.kind && e.actionType === "StewardPromoted"),
  ).toBe(true);

  // The merged list is sorted newest first by timestamp.
  const timestamps = legacy.map((e) => e.timestamp);
  const sorted = [...timestamps].sort((a, b) => Number(b - a));
  expect(timestamps).toEqual(sorted);
});

it("keeps getStewardAuditHistory gated to Family Stewards", async () => {
  const setupResult = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const actor = setupResult.actor;
  await registerApprovedContributor(actor);

  actor.setIdentity(contributorIdentity);
  await expect(actor.getStewardAuditHistory()).rejects.toThrow();

  const anonymousActor = pic!.createActor<_SERVICE>(idlFactory, setupResult.canisterId);
  await expect(anonymousActor.getStewardAuditHistory()).rejects.toThrow();

  actor.setIdentity(adminIdentity);
  await expect(actor.getStewardAuditHistory()).resolves.toBeInstanceOf(Array);
});
