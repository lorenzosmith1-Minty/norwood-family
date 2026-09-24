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
// Tenancy 1C-B2-B5 — family-scoped Research audit log (real-canister cover).
//
// The accepted behavior is that every Research audit entry carries the
// `familyId` of the family the action was performed in, that the canonical
// family-scoped read (`getResearchAuditLogForFamily`) returns only entries whose
// `familyId` matches the requested family, that the read is Steward-gated for
// that family, and that the legacy `getResearchAuditLog` still returns the
// default-family (Norwood) history unchanged.
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
// `promoteToSteward` both write `familyId = "norwood"`), so the family-scoped
// audit read can only ever be executed by the Norwood Steward. The boundary is
// therefore driven in the direction the API supports: the Norwood Steward's
// Norwood read must never return a Family A/B entry, the Norwood Steward is
// denied on the Family A/B audit reads, and an approved Family A member is
// denied on the Family A audit read because membership is not Steward authority.
// The internal family-filter predicate (`listAuditForFamily`) and the canonical
// creation helper (`appendAudit`) are covered by the sibling
// `research-audit-scope.static.test.ts`, which reads the real Motoko source.
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
const memberAIdentity = createIdentity("research-audit-family-a-seed");
const memberBIdentity = createIdentity("research-audit-family-b-seed");
const dualMemberIdentity = createIdentity("research-audit-dual-member-seed");

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

// ---------------------------------------------------------------------------
// (1) A Research action in Family A writes its audit entry to Family A, not to
//     the default family. The Norwood Steward's Norwood read is the only
//     family-scoped audit read the public API can execute, so the observable
//     proof is that the Family A action never appears in the Norwood log.
// ---------------------------------------------------------------------------

it("does not leak a Family A Research action into the Norwood audit log", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  await submitCandidateInFamily(actor, FAMILY_A, "Family A Unknown");

  // The Norwood Steward's Norwood read contains no Family A entry.
  actor.setIdentity(adminIdentity);
  const norwoodAudit = await actor.getResearchAuditLogForFamily(NORWOOD);
  expect(norwoodAudit.every((e) => e.familyId === NORWOOD)).toBe(true);
  expect(norwoodAudit.find((e) => e.summary.includes("Family A Unknown"))).toBeUndefined();

  // The legacy read agrees with the Norwood family-scoped read.
  const legacyAudit = await actor.getResearchAuditLog();
  expect(legacyAudit.find((e) => e.summary.includes("Family A Unknown"))).toBeUndefined();
});

it("does not leak a Family B Research action into the Norwood audit log", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberBIdentity);
  await submitCandidateInFamily(actor, FAMILY_B, "Family B Unknown");

  actor.setIdentity(adminIdentity);
  const norwoodAudit = await actor.getResearchAuditLogForFamily(NORWOOD);
  expect(norwoodAudit.every((e) => e.familyId === NORWOOD)).toBe(true);
  expect(norwoodAudit.find((e) => e.summary.includes("Family B Unknown"))).toBeUndefined();
});

// ---------------------------------------------------------------------------
// (2) A single actor participating in both Family A and Family B produces
//     correctly separated audit records: each action is written to its own
//     family and neither leaks into the default family.
// ---------------------------------------------------------------------------

it("separates a dual-family actor's audit records per family", async () => {
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

  // Neither action leaks into the Norwood log, so each was written to its own
  // family rather than to the default family.
  actor.setIdentity(adminIdentity);
  const norwoodAudit = await actor.getResearchAuditLogForFamily(NORWOOD);
  expect(norwoodAudit.find((e) => e.summary.includes("Dual Family A Candidate"))).toBeUndefined();
  expect(norwoodAudit.find((e) => e.summary.includes("Dual Family B Candidate"))).toBeUndefined();
  expect(norwoodAudit.every((e) => e.familyId === NORWOOD)).toBe(true);
});

// ---------------------------------------------------------------------------
// (3) Cross-family read denial: the Norwood Steward is denied the Family A and
//     Family B audit reads, and an approved Family A member is denied the
//     Family A audit read because membership is not Steward authority.
// ---------------------------------------------------------------------------

it("denies the Norwood Steward the Family A and Family B audit reads", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  await submitCandidateInFamily(actor, FAMILY_A, "Boundary A Candidate");

  actor.setIdentity(adminIdentity);
  await expect(actor.getResearchAuditLogForFamily(FAMILY_A)).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
  await expect(actor.getResearchAuditLogForFamily(FAMILY_B)).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
});

it("denies an approved Family A member the Family A audit read", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  await submitCandidateInFamily(actor, FAMILY_A, "Member A Candidate");

  // Approved membership is not Steward authority: the audit read is denied.
  await expect(actor.getResearchAuditLogForFamily(FAMILY_A)).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
});

it("denies an anonymous caller the family-scoped audit read", async () => {
  const { canisterId } = await setupFamilies();

  const anonymousActor = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  await expect(
    anonymousActor.getResearchAuditLogForFamily(NORWOOD),
  ).rejects.toThrow();
});

// ---------------------------------------------------------------------------
// (4) Existing Norwood default-family audit history remains readable through
//     the legacy read after the migration, and each legacy review action still
//     appends exactly one entry carrying familyId "norwood".
// ---------------------------------------------------------------------------

it("keeps the default-family audit history readable through the legacy read", async () => {
  const { actor } = await setupFamilies();

  // A contributor creates a source and a finding; a steward approves the
  // finding. Each action appends one audit entry.
  actor.setIdentity(contributorIdentity);
  const sourceCreated = await actor.createSource(
    "1900 census, Norwood household",
    { CensusCitation: null },
    "Census record listing the Norwood family.",
    [],
  );
  if (!("ok" in sourceCreated)) {
    throw new Error(`createSource failed: ${JSON.stringify(sourceCreated)}`);
  }
  const sourceId = sourceCreated.ok.id;
  const findingCreated = await actor.createFinding(
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
  if (!("ok" in findingCreated)) {
    throw new Error(`createFinding failed: ${JSON.stringify(findingCreated)}`);
  }
  const findingId = findingCreated.ok.id;

  actor.setIdentity(adminIdentity);
  await actor.approveFinding(findingId);

  // The legacy read returns the default-family audit history, and every entry
  // carries familyId "norwood".
  const audit = await actor.getResearchAuditLog();
  const actions = audit.map((e) => e.action);
  expect(actions).toContain("SourceCreated");
  expect(actions).toContain("FindingSubmitted");
  expect(actions).toContain("FindingApproved");
  expect(audit.every((e) => e.familyId === NORWOOD)).toBe(true);

  // The family-scoped Norwood read returns the same entries.
  const norwoodAudit = await actor.getResearchAuditLogForFamily(NORWOOD);
  expect(norwoodAudit.map((e) => e.id).sort()).toEqual(
    audit.map((e) => e.id).sort(),
  );

  // Each entry carries its action, summary, actor, and timestamp.
  const sourceEntry = audit.find((e) => e.action === "SourceCreated");
  expect(sourceEntry).toMatchObject({
    action: "SourceCreated",
    actorId: contributorIdentity.getPrincipal(),
    summary: "Source '1900 census, Norwood household' created",
    familyId: NORWOOD,
  });
  expect(sourceEntry?.sourceId).toEqual([sourceId]);
  expect(typeof sourceEntry?.timestamp).toBe("bigint");
});

it("appends exactly one default-family audit entry per legacy review action", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(contributorIdentity);
  const sourceCreated = await actor.createSource(
    "One entry per action",
    { CensusCitation: null },
    "A source.",
    [],
  );
  if (!("ok" in sourceCreated)) {
    throw new Error(`createSource failed: ${JSON.stringify(sourceCreated)}`);
  }
  const sourceId = sourceCreated.ok.id;
  const findingCreated = await actor.createFinding(
    "One entry finding",
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
  if (!("ok" in findingCreated)) {
    throw new Error(`createFinding failed: ${JSON.stringify(findingCreated)}`);
  }
  const findingId = findingCreated.ok.id;

  actor.setIdentity(adminIdentity);
  await actor.needsResearchFinding(findingId);

  const audit = await actor.getResearchAuditLog();
  const countOf = (action: string) => audit.filter((e) => e.action === action).length;

  expect(countOf("SourceCreated")).toBe(1);
  expect(countOf("FindingSubmitted")).toBe(1);
  expect(countOf("FindingNeedsResearch")).toBe(1);
  expect(audit).toHaveLength(3);
  expect(audit.every((e) => e.familyId === NORWOOD)).toBe(true);
});

// ---------------------------------------------------------------------------
// (5) The legacy audit read remains Steward-gated.
// ---------------------------------------------------------------------------

it("keeps getResearchAuditLog gated to Family Stewards", async () => {
  const setupResult = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const actor = setupResult.actor;
  await registerApprovedContributor(actor);

  actor.setIdentity(contributorIdentity);
  await expect(actor.getResearchAuditLog()).rejects.toThrow();

  const anonymousActor = pic!.createActor<_SERVICE>(idlFactory, setupResult.canisterId);
  await expect(anonymousActor.getResearchAuditLog()).rejects.toThrow();

  actor.setIdentity(adminIdentity);
  await expect(actor.getResearchAuditLog()).resolves.toBeInstanceOf(Array);
});
