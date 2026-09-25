import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";

const PIC_URL = process.env.POCKET_IC_URL ?? "";
const BACKEND_WASM = process.env.BACKEND_WASM ?? "";
const PREVIOUS_WASM = process.env.BACKEND_WASM_PREVIOUS ?? "";
// The runner sets this to the previous revision's generated declarations under
// `.old/`. They are imported dynamically in the archive migration test below.
const PREVIOUS_DECLARATIONS = process.env.BACKEND_DECLARATIONS_PREVIOUS ?? "";

let pic: PocketIc | undefined;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
});

afterAll(async () => {
  await pic?.tearDown();
});

// The branding change is frontend-only, so the backend Candid interface is
// identical between the previous revision and this build — the current
// idlFactory (a pure codec) is therefore valid for both installs. (The previous
// revision's own declarations under `.old/` cannot be imported here: they live
// outside the app's package tree, so their `@icp-sdk/core/candid` import does
// not resolve.)
//
// Every deployment of a modified app is a canister upgrade of the version
// already running. This test installs the previous revision's wasm, writes a
// photo through its public API, upgrades to this build's wasm (replaying the
// migration chain), and asserts the photo survives — the one thing the frontend
// suite cannot see.
it("carries photos written by the previous version through the upgrade", async () => {
  // 1. Install the version the user is actually running.
  const previous = await pic!.setupCanister<_SERVICE>({
    idlFactory,
    wasm: PREVIOUS_WASM,
  });

  // 2. Write data through the OLD public API, as the deployed app did. The
  //    previous revision already gates addPhoto on approved-family membership,
  //    so the writer must be authorized there too. Its Steward authority is the
  //    canonical active-Steward record over the persisted `stewards` list — the
  //    platform admin role is never consulted — so the writer must perform the
  //    one-time `claimSteward` bootstrap on the previous revision before it can
  //    add a photo. (The previous revision's `isSteward` delegates to
  //    `StewardAuthorityLib.isActiveSteward`, exactly as this build's does.)
  const steward = createIdentity("upgrade-photo-steward-seed");
  previous.actor.setIdentity(steward);
  await previous.actor._initialize_access_control();
  await previous.actor.claimSteward();
  const blob = new Uint8Array([7, 8, 9]);
  await previous.actor.addPhoto("julia", "julia-old.png", "image/png", blob);

  // 3. Upgrade to the version this build produces. The migration runs here.
  //    `wasm_memory_persistence: keep` is REQUIRED: these canisters are built
  //    with enhanced orthogonal persistence, and an upgrade without it is
  //    rejected with "Missing upgrade option".
  await pic!.upgradeCanister({
    canisterId: previous.canisterId,
    wasm: BACKEND_WASM,
    upgradeModeOptions: {
      skip_pre_upgrade: [],
      wasm_memory_persistence: [{ keep: null }],
    },
  });

  // 4. Read through the NEW API and assert both survival and the new shape.
  const upgraded = pic!.createActor<_SERVICE>(idlFactory, previous.canisterId);
  // listPhotos requires an approved family member or a Family Steward. The
  // StewardRecord written by the previous revision's `claimSteward` bootstrap
  // is stable state and survives the upgrade, so the same identity is still an
  // active Steward here and can read the gallery without re-claiming. The photo
  // itself must survive the upgrade regardless of who reads it back.
  upgraded.setIdentity(steward);
  const photos = await upgraded.listPhotos("julia");
  expect(photos).toHaveLength(1);
  expect(photos[0]).toMatchObject({ filename: "julia-old.png" });
  // The first photo remains the profile photo after the upgrade. 'julia' is
  // seeded #Unclaimed, so getProfilePhoto stays readable by guests too.
  const profile = await upgraded.getProfilePhoto("julia");
  expect(profile).toEqual([
    expect.objectContaining({ filename: "julia-old.png" }),
  ]);

  // The migration initializes the new account-identity map: a signed-in caller
  // can bind an auth method and read their stable account id after the upgrade.
  const accountIdentity = createIdentity("upgrade-account-seed");
  upgraded.setIdentity(accountIdentity);
  const bound = await upgraded.bindAuthMethod({ Google: null });
  expect(bound).toEqual({
    ok: {
      id: accountIdentity.getPrincipal(),
      createdAt: expect.any(BigInt),
      authMethods: [{ Google: null }],
    },
  });
  await expect(upgraded.getMyAccountId()).resolves.toEqual({
    ok: accountIdentity.getPrincipal(),
  });
});

// The 20260907_000000.mo migration sets the canonical lorenzoSmithJr profile's
// preferredName to 'Waxx Minty' so the child card on Lorenzo Smith Sr.'s profile
// resolves the canonical display name. The previous revision already carries
// this migration (it was added in the prior canonical-display-name build), so
// installing it seeds lorenzoSmithJr with preferredName 'Waxx Minty'. This test
// installs the previous revision, upgrades to this build (replaying the
// migration chain), and asserts the preferredName stays 'Waxx Minty' while the
// `name` field is unchanged.
//
// The pre-upgrade read MUST go through the previous revision's own declarations
// (`.old/`), not this build's `idlFactory`. This build adds a required
// `familyId` field to PersonProfile, so the current codec cannot decode the
// previous revision's pre-migration record: the call resolves to an empty
// option (`[]`) rather than the seeded profile, which is a codec mismatch in the
// test, not a missing seed. The previous declarations are imported dynamically
// from the path the runner supplies, exactly as the archive migration test
// below does, so a resolution failure surfaces as a clear error here rather than
// breaking the whole file at collection time.
it("keeps lorenzoSmithJr's preferredName as 'Waxx Minty' on upgrade", async () => {
  const previousDeclarations = await import(
    /* @vite-ignore */ PREVIOUS_DECLARATIONS
  );
  const previousIdlFactory = previousDeclarations.idlFactory;

  // 1. Install the version the user is actually running. The seed migration
  //    (20260905_080000.mo) and the canonical-display-name migration
  //    (20260907_000000.mo) run here, seeding lorenzoSmithJr with preferredName
  //    'Waxx Minty'.
  const previous = await pic!.setupCanister({
    idlFactory: previousIdlFactory,
    wasm: PREVIOUS_WASM,
  });

  // 2. Confirm the previous revision seeded lorenzoSmithJr with the Waxx Minty
  //    preferredName, read through the previous revision's own codec.
  const before = await previous.actor.getPersonProfile("lorenzoSmithJr");
  expect(before).toEqual([
    expect.objectContaining({
      personId: "lorenzoSmithJr",
      name: "Lorenzo Smith Jr.",
      preferredName: ["Waxx Minty"],
    }),
  ]);

  // 3. Upgrade to the version this build produces. The new migration runs here.
  await pic!.upgradeCanister({
    canisterId: previous.canisterId,
    wasm: BACKEND_WASM,
    upgradeModeOptions: {
      skip_pre_upgrade: [],
      wasm_memory_persistence: [{ keep: null }],
    },
  });

  // 4. Read through the NEW API: the preferredName is now 'Waxx Minty' and the
  //    `name` field is unchanged.
  const upgraded = pic!.createActor<_SERVICE>(idlFactory, previous.canisterId);
  const profile = await upgraded.getPersonProfile("lorenzoSmithJr");
  expect(profile).toEqual([
    expect.objectContaining({
      personId: "lorenzoSmithJr",
      name: "Lorenzo Smith Jr.",
      preferredName: ["Waxx Minty"],
    }),
  ]);
});

// The archive collection must survive an upgrade: a record written through the
// previous revision's public API is carried through the migration chain with
// its original fields intact and is not reset.
//
// The previous revision (`.old/`) already carries the 20260917_000000.mo
// migration that widened ArchiveItem with the optional persisted
// `mimeType`/`filename` fields, and its `submitArchiveItem` already persists
// them at submit time. A record written through the previous revision's API
// therefore carries non-null upload metadata, and the migration does not
// rewrite it (the migration only backfills records that predate it, and it is
// already applied in `.old/`). This test installs the previous revision, writes
// an archive item through its public API, upgrades to this build (replaying the
// migration chain), and asserts the record survives with its original fields
// and its persisted metadata intact.
//
// Both revisions' `submitArchiveItem` take 15 parameters (the trailing
// `filename`), so the call below passes all 15. The previous revision's own
// declarations under `.old/` are imported dynamically from the path the runner
// supplies, so a resolution failure surfaces as a clear error here rather than
// breaking the whole file at collection time.
it("carries archive items written by the previous version through the upgrade", async () => {
  const previousDeclarations = await import(
    /* @vite-ignore */ PREVIOUS_DECLARATIONS
  );
  const previousIdlFactory = previousDeclarations.idlFactory;

  // 1. Install the version the user is actually running.
  const previous = await pic!.setupCanister({
    idlFactory: previousIdlFactory,
    wasm: PREVIOUS_WASM,
  });

  // 2. Write an archive item through the OLD public API. The writer must be an
  //    approved family member on the previous revision, so it performs the
  //    one-time Steward bootstrap and approves its own profile claim.
  const contributor = createIdentity("upgrade-archive-contributor-seed");
  previous.actor.setIdentity(contributor);
  await previous.actor._initialize_access_control();
  await previous.actor.claimSteward();
  const requested = await previous.actor.requestProfileClaim("clayton");
  if ("ok" in requested) {
    await previous.actor.approveProfileClaim(requested.ok.id);
  }
  const written = await previous.actor.submitArchiveItem(
    "Pre-upgrade letter",
    "A letter written before the persisted-media migration.",
    { Document: null },
    "application/pdf",
    new Uint8Array([4, 5, 6]),
    "1924",
    [1924n],
    ["letters"],
    ["julia"],
    ["branch-1"],
    { Original: null },
    { FamilyOnly: null },
    { Standard: null },
    [],
    "pre-upgrade-letter.pdf",
  );

  // 3. Upgrade to the version this build produces. The migration runs here.
  await pic!.upgradeCanister({
    canisterId: previous.canisterId,
    wasm: BACKEND_WASM,
    upgradeModeOptions: {
      skip_pre_upgrade: [],
      wasm_memory_persistence: [{ keep: null }],
    },
  });

  // 4. Read through the NEW API. The record survives with its original fields
  //    and the persisted upload metadata written by the previous revision is
  //    intact (the migration did not reset the archive collection or drop the
  //    metadata).
  const upgraded = pic!.createActor<_SERVICE>(idlFactory, previous.canisterId);
  upgraded.setIdentity(contributor);
  const pending = await upgraded.listPendingArchiveItems();
  const stored = pending.find((item) => item.id === written.id);
  expect(stored).toBeDefined();
  expect(stored).toMatchObject({
    id: written.id,
    title: "Pre-upgrade letter",
    era: "1924",
    tags: ["letters"],
    status: { Pending: null },
    mimeType: ["application/pdf"],
    filename: ["pre-upgrade-letter.pdf"],
  });
  // The stored blob reference is unchanged: the original bytes are preserved.
  expect(stored?.blob).toEqual(written.blob);
});

// The duplicate-consolidation migrations (20260908_000000.mo and
// 20260908_120000.mo) and the steward-fields migration (20260909_000000.mo) are
// already present in the previous revision (`.old/`), so they run at INSTALL
// time of the previous wasm — before any runtime data is written. A duplicate
// Lorenzo Smith Jr. profile created via createMyself on the previous revision is
// therefore carried through the upgrade unchanged: the migration chain does not
// re-run already-applied migrations, so there is no consolidation to observe on
// upgrade. Testing "consolidation on upgrade" would require a previous revision
// that predates the consolidation migrations, which this build's `.old/` does
// not provide. Those scenarios are not applicable to this build's upgrade path
// and are intentionally not asserted here.
//
// The ownership-restoration migrations (20260911_000000.mo and
// 20260912_000000.mo) are now carried by the previous revision (`.old/`), so
// they run at INSTALL time of the previous wasm — before any runtime data is
// written. At install the state is empty (a fresh canister), so there is no
// runtime-created duplicate Lorenzo Smith Jr. profile and no surviving
// ownership/steward evidence for those migrations to consolidate: the canonical
// lorenzoSmithJr profile is seeded UNCLAIMED by the seed migration
// (20260905_080000.mo) and stays that way through the install-time chain.
//
// A duplicate Lorenzo Smith Jr. profile created via createMyself at runtime on
// the previous revision is therefore carried through the upgrade unchanged: the
// migration chain does not re-run already-applied migrations, and the only
// migration this build adds (20260913_000000.mo) is research-intake-only — it
// introduces the research collections and touches no ownership, media, or
// steward state. Testing "ownership/media/steward restoration on upgrade" would
// require a previous revision that predates the ownership-restoration
// migrations, which this build's `.old/` does not provide. Those scenarios are
// not applicable to this build's upgrade path and are intentionally not
// asserted here.

// ---------------------------------------------------------------------------
// Family tenancy foundation (Tenancy 1A) across a real upgrade.
//
// This is the highest-value assertion for this phase and nothing else in the
// build can see it. The previous revision has no `families` collection and no
// `familyId` field on any core record; this build's 20260921_000000.mo migration
// adds both and backfills every pre-existing record with familyId = "norwood".
//
// The test installs the previous revision, writes one record of each core kind
// through its public API, upgrades to this build (running the migration), and
// asserts:
//   1. getFamily("norwood") returns exactly one default family — the migration
//      seeds it once and does not duplicate it;
//   2. every pre-existing record reads back with familyId = "norwood";
//   3. the records' original fields, ownership, and blob/media references are
//      unchanged — the migration backfills, it does not reset.
//
// The pre-upgrade writes go through the previous revision's own declarations
// (`.old/`), because this build's codec requires the new `familyId` field and
// cannot encode a call against the previous revision's pre-migration types.
// ---------------------------------------------------------------------------
it("seeds exactly one default family and backfills familyId on upgrade", async () => {
  const previousDeclarations = await import(
    /* @vite-ignore */ PREVIOUS_DECLARATIONS
  );
  const previousIdlFactory = previousDeclarations.idlFactory;

  // 1. Install the version the user is actually running.
  const previous = await pic!.setupCanister({
    idlFactory: previousIdlFactory,
    wasm: PREVIOUS_WASM,
  });

  // 2. Write one record of each core kind through the OLD public API. The
  //    writer becomes the Family Steward (the one-time claimSteward bootstrap)
  //    and approves its own claim on a seeded profile so the contribution
  //    endpoints are authorized.
  const steward = createIdentity("upgrade-family-steward-seed");
  previous.actor.setIdentity(steward);
  await previous.actor._initialize_access_control();
  await previous.actor.claimSteward();
  const requested = await previous.actor.requestProfileClaim("clayton");
  if ("ok" in requested) {
    await previous.actor.approveProfileClaim(requested.ok.id);
  }

  // A pending relationship request between two seeded profiles.
  const proposed = await previous.actor.proposeRelationship(
    "clayton",
    "erma",
    { SpousePartner: null },
  );
  expect("ok" in proposed).toBe(true);

  // An archive item with a distinctive blob, so the media reference can be
  // checked byte-for-byte after the upgrade.
  const archiveBlob = new Uint8Array([21, 22, 23]);
  const written = await previous.actor.submitArchiveItem(
    "Pre-tenancy letter",
    "A letter written before the family tenancy migration.",
    { Document: null },
    "application/pdf",
    archiveBlob,
    "1924",
    [1924n],
    ["letters"],
    ["julia"],
    ["branch-1"],
    { Original: null },
    { FamilyOnly: null },
    { Standard: null },
    [],
    "pre-tenancy-letter.pdf",
  );

  // 3. Upgrade to the version this build produces. The 20260921_000000.mo
  //    migration runs here.
  await pic!.upgradeCanister({
    canisterId: previous.canisterId,
    wasm: BACKEND_WASM,
    upgradeModeOptions: {
      skip_pre_upgrade: [],
      wasm_memory_persistence: [{ keep: null }],
    },
  });

  // 4. Read through the NEW API.
  const upgraded = pic!.createActor<_SERVICE>(idlFactory, previous.canisterId);
  upgraded.setIdentity(steward);

  // The migration seeds exactly one default family. A second read returns the
  // same single record — the migration does not duplicate it.
  const family = await upgraded.getFamily("norwood");
  expect(family).toHaveLength(1);
  expect(family[0]).toMatchObject({
    id: "norwood",
    displayName: "Norwood",
    status: { active: null },
  });
  const familyAgain = await upgraded.getFamily("norwood");
  expect(familyAgain).toHaveLength(1);
  expect(familyAgain[0]).toEqual(family[0]);

  // Every pre-existing core record reads back with familyId = "norwood".
  const profile = await upgraded.getPersonProfile("clayton");
  expect(profile).toHaveLength(1);
  expect(profile[0]).toMatchObject({
    personId: "clayton",
    name: "Clayton Norwood",
    familyId: "norwood",
  });

  const claims = await upgraded.listProfileClaims();
  const claim = claims.find((c) => c.personId === "clayton");
  expect(claim).toBeDefined();
  expect(claim).toMatchObject({
    personId: "clayton",
    status: { Approved: null },
    familyId: "norwood",
  });

  const requests = await upgraded.listRelationshipRequests();
  const request = requests.find((r) => r.relatedPersonId === "erma");
  expect(request).toBeDefined();
  expect(request).toMatchObject({
    requestingPersonId: "clayton",
    relatedPersonId: "erma",
    status: { Pending: null },
    familyId: "norwood",
  });

  const stewards = await upgraded.listStewards();
  const activeSteward = stewards.find((s) => "Active" in s.roleStatus);
  expect(activeSteward).toBeDefined();
  expect(activeSteward).toMatchObject({
    roleStatus: { Active: null },
    familyId: "norwood",
  });

  // The archive record survives with its original fields and its blob/media
  // reference intact — the migration backfills familyId without resetting the
  // collection or dropping the bytes.
  const pending = await upgraded.listPendingArchiveItems();
  const stored = pending.find((item) => item.id === written.id);
  expect(stored).toBeDefined();
  expect(stored).toMatchObject({
    id: written.id,
    title: "Pre-tenancy letter",
    era: "1924",
    tags: ["letters"],
    status: { Pending: null },
    mimeType: ["application/pdf"],
    filename: ["pre-tenancy-letter.pdf"],
    familyId: "norwood",
  });
  expect(stored?.blob).toEqual(archiveBlob);
});

// ---------------------------------------------------------------------------
// Tenancy 1C-B2-B3: RelationshipProposal familyId across a real upgrade.
//
// The previous revision's RelationshipProposal has no `familyId` field; this
// build's 20260923_140000.mo migration adds one and backfills every pre-existing
// proposal with familyId = "norwood". This test installs the previous revision,
// writes a proposal through its public API, upgrades to this build (running the
// migration), and asserts the proposal survives with its id and submitted fields
// unchanged and familyId = "norwood". It then re-reads to confirm the migration
// is a no-op on a second read (the record is not duplicated or rewritten).
//
// The pre-upgrade write goes through the previous revision's own declarations
// (`.old/`), because this build's codec requires the new `familyId` field and
// cannot encode a call against the previous revision's pre-migration types.
// ---------------------------------------------------------------------------
it("defaults a pre-existing relationship proposal to norwood on upgrade, preserving its id and data", async () => {
  const previousDeclarations = await import(
    /* @vite-ignore */ PREVIOUS_DECLARATIONS
  );
  const previousIdlFactory = previousDeclarations.idlFactory;

  // 1. Install the version the user is actually running.
  const previous = await pic!.setupCanister({
    idlFactory: previousIdlFactory,
    wasm: PREVIOUS_WASM,
  });

  // 2. Write a proposal through the OLD public API. The writer becomes the
  //    Family Steward (the one-time claimSteward bootstrap) and approves its own
  //    claim on a seeded profile so the contribution endpoints are authorized.
  const steward = createIdentity("upgrade-proposal-steward-seed");
  previous.actor.setIdentity(steward);
  await previous.actor._initialize_access_control();
  await previous.actor.claimSteward();
  const requested = await previous.actor.requestProfileClaim("clayton");
  if ("ok" in requested) {
    await previous.actor.approveProfileClaim(requested.ok.id);
  }

  const createdSource = await previous.actor.createSource(
    "Pre-tenancy proposal source",
    { CensusCitation: null },
    "A source written before the proposal familyId migration.",
    [],
  );
  expect("ok" in createdSource).toBe(true);
  const sourceId = (createdSource as { ok: { id: bigint } }).ok.id;

  const createdProposal = await previous.actor.createRelationshipProposal(
    "clayton",
    "julia",
    "Father",
    sourceId,
  );
  expect("ok" in createdProposal).toBe(true);
  const proposalId = (createdProposal as { ok: { id: bigint } }).ok.id;

  // 3. Upgrade to the version this build produces. The 20260923_140000.mo
  //    migration runs here.
  await pic!.upgradeCanister({
    canisterId: previous.canisterId,
    wasm: BACKEND_WASM,
    upgradeModeOptions: {
      skip_pre_upgrade: [],
      wasm_memory_persistence: [{ keep: null }],
    },
  });

  // 4. Read through the NEW API. The proposal survives with its id and submitted
  //    fields unchanged and familyId = "norwood".
  const upgraded = pic!.createActor<_SERVICE>(idlFactory, previous.canisterId);
  upgraded.setIdentity(steward);
  const listed = await upgraded.listRelationshipProposals();
  const stored = listed.find((p) => p.id === proposalId);
  expect(stored).toBeDefined();
  expect(stored).toMatchObject({
    id: proposalId,
    familyId: "norwood",
    fromPersonId: "clayton",
    toPersonId: "julia",
    relationshipType: "Father",
    sourceId,
    status: { Pending: null },
  });

  // Re-reading is a no-op: the migration does not duplicate or rewrite the
  // record, so the same single proposal is returned.
  const listedAgain = await upgraded.listRelationshipProposals();
  expect(listedAgain.filter((p) => p.id === proposalId)).toHaveLength(1);
  expect(listedAgain.find((p) => p.id === proposalId)).toEqual(stored);
});

// ---------------------------------------------------------------------------
// Tenancy 1C-B2-B5: ResearchAuditEntry familyId across a real upgrade.
//
// The previous revision's ResearchAuditEntry has no `familyId` field; this
// build's 20260923_150000.mo migration adds one and backfills every pre-existing
// audit record with familyId = "norwood". This test installs the previous
// revision, writes audit records through its public API, upgrades to this build
// (running the migration), and asserts:
//   1. every pre-existing audit record reads back with familyId = "norwood";
//   2. the records' ids, actions, actors, timestamps, and summaries are
//      preserved — the migration backfills, it does not reset or reseed;
//   3. the record count is unchanged and no id is duplicated — the migration
//      rebuilds the list exactly once;
//   4. a repeated read is idempotent: the same records come back unchanged, so
//      the migration neither duplicates nor rewrites them.
//
// The pre-upgrade read goes through the previous revision's own declarations
// (`.old/`), because this build's codec requires the new `familyId` field and
// cannot decode the previous revision's pre-migration audit records.
// ---------------------------------------------------------------------------
it("backfills pre-existing Research audit records to norwood on upgrade, with no duplicates and an idempotent re-read", async () => {
  const previousDeclarations = await import(
    /* @vite-ignore */ PREVIOUS_DECLARATIONS
  );
  const previousIdlFactory = previousDeclarations.idlFactory;

  // 1. Install the version the user is actually running.
  const previous = await pic!.setupCanister({
    idlFactory: previousIdlFactory,
    wasm: PREVIOUS_WASM,
  });

  // 2. Write audit records through the OLD public API. The writer becomes the
  //    Family Steward (the one-time claimSteward bootstrap) and approves its own
  //    claim on a seeded profile so the contribution endpoints are authorized.
  //    `createSource` and `createFinding` each append one audit entry, and
  //    `approveFinding` appends a third, so three pre-existing records exist
  //    before the upgrade.
  const steward = createIdentity("upgrade-audit-steward-seed");
  previous.actor.setIdentity(steward);
  await previous.actor._initialize_access_control();
  await previous.actor.claimSteward();
  const requested = await previous.actor.requestProfileClaim("clayton");
  if ("ok" in requested) {
    await previous.actor.approveProfileClaim(requested.ok.id);
  }

  const createdSource = await previous.actor.createSource(
    "Pre-tenancy audit source",
    { CensusCitation: null },
    "A source written before the audit familyId migration.",
    [],
  );
  expect("ok" in createdSource).toBe(true);
  const sourceId = (createdSource as { ok: { id: bigint } }).ok.id;

  const createdFinding = await previous.actor.createFinding(
    "Pre-tenancy audit finding",
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
  expect("ok" in createdFinding).toBe(true);
  const findingId = (createdFinding as { ok: { id: bigint } }).ok.id;

  await previous.actor.approveFinding(findingId);

  // Capture the pre-upgrade audit records through the previous revision's own
  // codec. They carry no `familyId` yet.
  const before = await previous.actor.getResearchAuditLog();
  expect(before).toHaveLength(3);
  const beforeIds = before.map((e) => e.id).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const beforeById = new Map(before.map((e) => [e.id.toString(), e]));

  // 3. Upgrade to the version this build produces. The 20260923_150000.mo
  //    migration runs here.
  await pic!.upgradeCanister({
    canisterId: previous.canisterId,
    wasm: BACKEND_WASM,
    upgradeModeOptions: {
      skip_pre_upgrade: [],
      wasm_memory_persistence: [{ keep: null }],
    },
  });

  // 4. Read through the NEW API. Every pre-existing record is backfilled to
  //    familyId = "norwood", and its id, action, actor, timestamp, and summary
  //    are preserved.
  const upgraded = pic!.createActor<_SERVICE>(idlFactory, previous.canisterId);
  upgraded.setIdentity(steward);
  const after = await upgraded.getResearchAuditLog();

  // No duplicates: the same number of records, with the same ids.
  expect(after).toHaveLength(before.length);
  const afterIds = after.map((e) => e.id).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  expect(afterIds).toEqual(beforeIds);
  expect(new Set(afterIds.map((id) => id.toString())).size).toBe(afterIds.length);

  // Every record is backfilled to the default family.
  expect(after.every((e) => e.familyId === "norwood")).toBe(true);

  // Each record's original fields survive the migration unchanged.
  for (const entry of after) {
    const original = beforeById.get(entry.id.toString());
    expect(original).toBeDefined();
    expect(entry).toMatchObject({
      id: original!.id,
      action: original!.action,
      actorId: original!.actorId,
      timestamp: original!.timestamp,
      summary: original!.summary,
      familyId: "norwood",
    });
  }

  // The three actions written before the upgrade are all present.
  const actions = after.map((e) => e.action);
  expect(actions).toContain("SourceCreated");
  expect(actions).toContain("FindingSubmitted");
  expect(actions).toContain("FindingApproved");

  // 5. A repeated read is idempotent: the same records come back, unchanged, so
  //    the migration neither duplicates nor rewrites them.
  const afterAgain = await upgraded.getResearchAuditLog();
  expect(afterAgain).toHaveLength(after.length);
  expect(afterAgain.map((e) => e.id).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual(
    afterIds,
  );
  expect(afterAgain.every((e) => e.familyId === "norwood")).toBe(true);
  expect(afterAgain).toEqual(after);
});

// ---------------------------------------------------------------------------
// Tenancy 1C-D1: Recipe familyId across a real upgrade.
//
// The previous revision's Recipe has no `familyId` field; this build's
// 20260925_000000.mo migration adds one and backfills every pre-existing recipe
// with familyId = "norwood". This test installs the previous revision, writes a
// recipe (with a linked Archive media item) through its public API, upgrades to
// this build (running the migration), and asserts:
//   1. the recipe survives with its id, content, media links, and status
//      unchanged and familyId = "norwood";
//   2. the record count is unchanged and no id is duplicated — the migration
//      rebuilds the list exactly once;
//   3. a repeated read is idempotent: the same recipe comes back unchanged, so
//      the migration neither duplicates nor rewrites it.
//
// The pre-upgrade write goes through the previous revision's own declarations
// (`.old/`), because this build's codec requires the new `familyId` field and
// cannot encode a call against the previous revision's pre-migration types.
// ---------------------------------------------------------------------------
it("defaults a pre-existing recipe to norwood on upgrade, preserving its id, content, media links, and status", async () => {
  const previousDeclarations = await import(
    /* @vite-ignore */ PREVIOUS_DECLARATIONS
  );
  const previousIdlFactory = previousDeclarations.idlFactory;

  // 1. Install the version the user is actually running.
  const previous = await pic!.setupCanister({
    idlFactory: previousIdlFactory,
    wasm: PREVIOUS_WASM,
  });

  // 2. Write a recipe through the OLD public API. The writer becomes the Family
  //    Steward (the one-time claimSteward bootstrap) and approves its own claim
  //    on a seeded profile so the contribution endpoints are authorized.
  const steward = createIdentity("upgrade-recipe-steward-seed");
  previous.actor.setIdentity(steward);
  await previous.actor._initialize_access_control();
  await previous.actor.claimSteward();
  const requested = await previous.actor.requestProfileClaim("clayton");
  if ("ok" in requested) {
    await previous.actor.approveProfileClaim(requested.ok.id);
  }

  // A linked Archive media item, so the recipe's media link can be checked
  // after the upgrade.
  const media = await previous.actor.submitArchiveItem(
    "Pre-tenancy recipe photo",
    "A photo linked to a recipe written before the familyId migration.",
    { Photo: null },
    "image/png",
    new Uint8Array([31, 32, 33]),
    "1942",
    [1942n],
    ["recipes"],
    ["clayton"],
    [],
    { Original: null },
    { FamilyOnly: null },
    { Standard: null },
    [],
    "pre-tenancy-recipe-photo.png",
  );

  const written = await previous.actor.submitRecipe(
    "Pre-tenancy sweet potato pie",
    "A recipe written before the familyId migration.",
    "clayton",
    ["hudson"],
    ["1940s"],
    [1942n],
    ["Clayton, Mississippi"],
    ["the Clayton Norwood branch"],
    ["3 cups sweet potato", "1 tsp cinnamon"],
    "Bake until golden.",
    ["A pre-tenancy family story."],
    ["dessert", "holiday"],
    { FamilyOnly: null },
    { FamilyHistory: null },
    [media.id],
  );
  expect(written.status).toEqual({ Pending: null });

  // 3. Upgrade to the version this build produces. The 20260925_000000.mo
  //    migration runs here.
  await pic!.upgradeCanister({
    canisterId: previous.canisterId,
    wasm: BACKEND_WASM,
    upgradeModeOptions: {
      skip_pre_upgrade: [],
      wasm_memory_persistence: [{ keep: null }],
    },
  });

  // 4. Read through the NEW API. The recipe survives with its id, content,
  //    media links, and status unchanged and familyId = "norwood".
  const upgraded = pic!.createActor<_SERVICE>(idlFactory, previous.canisterId);
  upgraded.setIdentity(steward);
  const listed = await upgraded.listRecipesForFamily("norwood");
  const stored = listed.find((r) => r.recipeId === written.recipeId);
  expect(stored).toBeDefined();
  expect(stored).toMatchObject({
    recipeId: written.recipeId,
    familyId: "norwood",
    title: "Pre-tenancy sweet potato pie",
    shortDescription: "A recipe written before the familyId migration.",
    originatingPersonId: "clayton",
    relatedPersonIds: ["hudson"],
    era: ["1940s"],
    year: [1942n],
    location: ["Clayton, Mississippi"],
    familyBranch: ["the Clayton Norwood branch"],
    ingredients: ["3 cups sweet potato", "1 tsp cinnamon"],
    instructions: "Bake until golden.",
    familyStory: ["A pre-tenancy family story."],
    tags: ["dessert", "holiday"],
    privacyLevel: { FamilyOnly: null },
    evidenceStatus: { FamilyHistory: null },
    linkedMediaIds: [media.id],
    status: { Pending: null },
  });

  // No duplicates: exactly one recipe with that id, and the migration did not
  // reseed the collection.
  expect(listed.filter((r) => r.recipeId === written.recipeId)).toHaveLength(1);
  expect(listed).toHaveLength(1);

  // 5. A repeated read is idempotent: the same recipe comes back unchanged, so
  //    the migration neither duplicates nor rewrites it.
  const listedAgain = await upgraded.listRecipesForFamily("norwood");
  expect(listedAgain).toHaveLength(1);
  expect(listedAgain.find((r) => r.recipeId === written.recipeId)).toEqual(stored);
});
