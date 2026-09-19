import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";

// ---------------------------------------------------------------------------
// Characterization baseline for the contribution-authorization change.
//
// The change tightens the family-content contribution endpoints from "any
// signed-in caller" to "approved family member (or Family Steward)". This file
// deliberately does NOT freeze the permissive pre-change behavior — a signed-in
// unapproved caller contributing is exactly what the change removes.
//
// What it protects instead is the behavior that must survive the change:
//   1. Anonymous callers are rejected by every contribution endpoint.
//   2. The onboarding / profile-claim paths (createMyself,
//      searchPossibleMatches, requestProfileClaim, proposeRelationship) remain
//      available to signed-in users who are NOT yet approved.
//   3. The steward/admin review endpoints still work.
//
// The role checks live here, in the PocketIC lane, because the frontend suite
// mocks the actor and has no principals at all.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";
const BACKEND_WASM = process.env.BACKEND_WASM ?? "";

let pic: PocketIc | undefined;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
});

afterAll(async () => {
  await pic?.tearDown();
});

// Deterministic identities. ADMIN is the first caller to
// _initialize_access_control, so ADMIN becomes the Family Steward. UNMEMBER is
// a signed-in caller who never holds an approved claim — the "signed-in but
// unapproved" case the onboarding paths must keep serving.
const adminIdentity = createIdentity("contrib-auth-admin-seed");
const unmemberIdentity = createIdentity("contrib-auth-unmember-seed");
const UNMEMBER = unmemberIdentity.getPrincipal();

const blob = new Uint8Array([1, 2, 3, 4]);

// The canister id type, derived from the identity helper rather than importing
// `Principal` directly: `@icp-sdk/core` is a frontend-package dependency and a
// bare import of it from `app/test/` does not resolve in the lane.
type CanisterId = ReturnType<ReturnType<typeof createIdentity>["getPrincipal"]>;

// A fresh canister with ADMIN as steward and UNMEMBER registered as a signed-in
// non-approved user. Returns the actor plus the canister id so a caller can
// create an anonymous actor against the same canister.
async function setupRoles(): Promise<{ actor: _SERVICE; canisterId: CanisterId }> {
  const setup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const roleActor = setup.actor;
  roleActor.setIdentity(adminIdentity);
  await roleActor._initialize_access_control();
  // Steward authority is a separate, explicit bootstrap: the first caller is
  // #admin, but only `claimSteward` grants the canonical Steward powers that
  // the review endpoints below require.
  await roleActor.claimSteward();
  roleActor.setIdentity(unmemberIdentity);
  await roleActor._initialize_access_control();
  return { actor: roleActor, canisterId: setup.canisterId };
}

// ---------------------------------------------------------------------------
// 1. Anonymous callers are rejected by every contribution endpoint.
// ---------------------------------------------------------------------------

it("rejects an anonymous caller from every family-content contribution endpoint", async () => {
  const { canisterId } = await setupRoles();
  // A fresh actor defaults to the anonymous caller.
  const anonymous = pic!.createActor<_SERVICE>(idlFactory, canisterId);

  // Story / mystery / recipe contributions.
  await expect(
    anonymous.submitStory(
      "Anonymous story",
      "Anonymous must not be able to contribute.",
      [],
      [],
      [],
      [],
      { FamilyHistory: null },
      [],
    ),
  ).rejects.toThrow();

  await expect(
    anonymous.submitMysteryContribution(0n, { Note: null }, "Anonymous note"),
  ).rejects.toThrow();

  await expect(
    anonymous.submitRecipe(
      "Anonymous recipe",
      "Anonymous must not be able to contribute.",
      "julia",
      [],
      [],
      [],
      [],
      [],
      [],
      "Mix everything.",
      [],
      [],
      { FamilyOnly: null },
      { FamilyHistory: null },
      [],
    ),
  ).rejects.toThrow();

  // Archive contribution.
  await expect(
    anonymous.submitArchiveItem(
      "Anonymous item",
      "Anonymous must not be able to contribute.",
      { Document: null },
      "application/pdf",
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

  // Research intake contributions. These return a Result rather than trapping,
  // so the rejection is the #err(#notAuthorized) variant, not a thrown error.
  await expect(
    anonymous.createSource("Anonymous source", { CensusCitation: null }, "Anonymous.", []),
  ).resolves.toEqual({ err: { notAuthorized: null } });

  await expect(
    anonymous.createSourceWithUpload(
      "Anonymous upload",
      { CensusCitation: null },
      "Anonymous.",
      "application/pdf",
      blob,
      [],
      "1900",
      [],
      [],
      { FamilyOnly: null },
      { Standard: null },
      [],
    ),
  ).resolves.toEqual({ err: { notAuthorized: null } });

  await expect(
    anonymous.createFinding(
      "Anonymous finding",
      { Documented: null },
      { PersonFact: null },
      { PersonFact: { field: "birthDate", value: "1900", personId: "julia" } },
      0n,
      ["julia"],
      [],
    ),
  ).resolves.toEqual({ err: { notAuthorized: null } });

  await expect(
    anonymous.createNewPersonCandidate("Anonymous candidate", "Anonymous.", 0n),
  ).resolves.toEqual({ err: { notAuthorized: null } });

  await expect(
    anonymous.createRelationshipProposal("clayton", "julia", "Father", 0n),
  ).resolves.toEqual({ err: { notAuthorized: null } });

  // addPhoto is guarded too: an anonymous caller is rejected.
  await expect(
    anonymous.addPhoto("julia", "anonymous.png", "image/png", blob),
  ).rejects.toThrow();
});

// ---------------------------------------------------------------------------
// 1b. A signed-in but UNAPPROVED caller is rejected by every contribution
//     endpoint. This is the core of the authorization change: mere sign-in is
//     no longer sufficient for family-content contribution.
// ---------------------------------------------------------------------------

it("rejects a signed-in unapproved caller from every family-content contribution endpoint", async () => {
  const { actor: unapprovedActor } = await setupRoles();
  unapprovedActor.setIdentity(unmemberIdentity);

  // Story / mystery / recipe contributions trap.
  await expect(
    unapprovedActor.submitStory(
      "Unapproved story",
      "A signed-in unapproved caller must not contribute.",
      [],
      [],
      [],
      [],
      { FamilyHistory: null },
      [],
    ),
  ).rejects.toThrow();

  await expect(
    unapprovedActor.submitMysteryContribution(0n, { Note: null }, "Unapproved note"),
  ).rejects.toThrow();

  await expect(
    unapprovedActor.submitRecipe(
      "Unapproved recipe",
      "A signed-in unapproved caller must not contribute.",
      "julia",
      [],
      [],
      [],
      [],
      [],
      [],
      "Mix everything.",
      [],
      [],
      { FamilyOnly: null },
      { FamilyHistory: null },
      [],
    ),
  ).rejects.toThrow();

  // Archive contribution traps.
  await expect(
    unapprovedActor.submitArchiveItem(
      "Unapproved item",
      "A signed-in unapproved caller must not contribute.",
      { Document: null },
      "application/pdf",
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

  // addPhoto traps.
  await expect(
    unapprovedActor.addPhoto("julia", "unapproved.png", "image/png", blob),
  ).rejects.toThrow();

  // Research intake contributions return #err(#notAuthorized).
  await expect(
    unapprovedActor.createSource("Unapproved source", { CensusCitation: null }, "Unapproved.", []),
  ).resolves.toEqual({ err: { notAuthorized: null } });

  await expect(
    unapprovedActor.createSourceWithUpload(
      "Unapproved upload",
      { CensusCitation: null },
      "Unapproved.",
      "application/pdf",
      blob,
      [],
      "1900",
      [],
      [],
      { FamilyOnly: null },
      { Standard: null },
      [],
    ),
  ).resolves.toEqual({ err: { notAuthorized: null } });

  await expect(
    unapprovedActor.createFinding(
      "Unapproved finding",
      { Documented: null },
      { PersonFact: null },
      { PersonFact: { field: "birthDate", value: "1900", personId: "julia" } },
      0n,
      ["julia"],
      [],
    ),
  ).resolves.toEqual({ err: { notAuthorized: null } });

  await expect(
    unapprovedActor.createNewPersonCandidate("Unapproved candidate", "Unapproved.", 0n),
  ).resolves.toEqual({ err: { notAuthorized: null } });

  await expect(
    unapprovedActor.createRelationshipProposal("clayton", "julia", "Father", 0n),
  ).resolves.toEqual({ err: { notAuthorized: null } });
});

// ---------------------------------------------------------------------------
// 2. Onboarding / profile-claim paths remain available to signed-in unapproved
//    users. These must NOT be tightened by the authorization change.
// ---------------------------------------------------------------------------

it("keeps createMyself available to a signed-in unapproved user", async () => {
  const { actor: onboardActor } = await setupRoles();

  onboardActor.setIdentity(unmemberIdentity);
  const created = await onboardActor.createMyself("Una Pproved");
  expect(created).toEqual({
    ok: expect.objectContaining({
      name: "Una Pproved",
      claimStatus: { Claimed: null },
      claimedByUserId: [UNMEMBER],
    }),
  });
});

it("keeps searchPossibleMatches available to a signed-in unapproved user", async () => {
  const { actor: onboardActor } = await setupRoles();

  onboardActor.setIdentity(unmemberIdentity);
  // A query that resolves (possibly empty) rather than trapping.
  await expect(onboardActor.searchPossibleMatches("Julia Norwood")).resolves.toBeInstanceOf(
    Array,
  );
});

it("keeps requestProfileClaim available to a signed-in unapproved user", async () => {
  const { actor: onboardActor } = await setupRoles();

  onboardActor.setIdentity(unmemberIdentity);
  const requested = await onboardActor.requestProfileClaim("clayton");
  expect(requested).toEqual({
    ok: expect.objectContaining({
      personId: "clayton",
      requestingUserId: UNMEMBER,
      status: { Pending: null },
    }),
  });
});

it("keeps proposeRelationship available to a signed-in unapproved user", async () => {
  const { actor: onboardActor } = await setupRoles();

  onboardActor.setIdentity(unmemberIdentity);
  const proposed = await onboardActor.proposeRelationship("clayton", "julia", {
    Parent: null,
  });
  expect(proposed).toEqual({
    ok: expect.objectContaining({
      requestingPersonId: "clayton",
      relatedPersonId: "julia",
      status: { Pending: null },
    }),
  });
});

// ---------------------------------------------------------------------------
// 3. Steward/admin review endpoints still work. The authorization change must
//    not break the steward's ability to review and approve contributions.
// ---------------------------------------------------------------------------

it("keeps the steward review endpoints working for a Family Steward", async () => {
  const { actor: stewardActor } = await setupRoles();

  // The steward can list the pending review surfaces without trapping.
  stewardActor.setIdentity(adminIdentity);
  await expect(stewardActor.listPendingArchiveItems()).resolves.toBeInstanceOf(Array);
  await expect(stewardActor.listPendingRecipes()).resolves.toBeInstanceOf(Array);
  await expect(stewardActor.listPendingStories()).resolves.toBeInstanceOf(Array);
  await expect(stewardActor.listProfileClaims()).resolves.toBeInstanceOf(Array);
  await expect(stewardActor.getReviewQueue()).resolves.toBeDefined();
});

it("keeps the steward able to approve a contribution submitted by an approved member", async () => {
  const { actor: stewardActor } = await setupRoles();

  // UNMEMBER claims 'clayton' and the steward approves the claim, making
  // UNMEMBER an approved family member. This is the post-change allowed path.
  stewardActor.setIdentity(unmemberIdentity);
  const claim = (await stewardActor.requestProfileClaim("clayton")) as {
    ok: { id: bigint };
  };
  stewardActor.setIdentity(adminIdentity);
  await stewardActor.approveProfileClaim(claim.ok.id);

  // The now-approved member submits an archive item; it lands pending.
  stewardActor.setIdentity(unmemberIdentity);
  const item = await stewardActor.submitArchiveItem(
    "Approved member letter",
    "A letter from an approved member.",
    { Document: null },
    "application/pdf",
    blob,
    "1924",
    [1924n],
    ["letters"],
    ["julia"],
    [],
    { Original: null },
    { FamilyOnly: null },
    { Standard: null },
    [],
  );
  expect(item).toMatchObject({ title: "Approved member letter", status: { Pending: null } });

  // The steward reviews and approves it.
  stewardActor.setIdentity(adminIdentity);
  const pending = await stewardActor.listPendingArchiveItems();
  expect(pending.map((i) => i.id)).toContain(item.id);
  const approved = await stewardActor.approveArchiveItem(item.id);
  expect(approved).toEqual([
    expect.objectContaining({ id: item.id, status: { Approved: null } }),
  ]);
});

// ---------------------------------------------------------------------------
// 4. A Family Steward is allowed to contribute (the admin branch of the
//    approved-family-member rule).
// ---------------------------------------------------------------------------

it("allows a Family Steward to contribute", async () => {
  const { actor: stewardActor } = await setupRoles();

  stewardActor.setIdentity(adminIdentity);
  const item = await stewardActor.submitArchiveItem(
    "Steward letter",
    "A letter submitted by the steward.",
    { Document: null },
    "application/pdf",
    blob,
    "1924",
    [1924n],
    ["letters"],
    ["julia"],
    [],
    { Original: null },
    { FamilyOnly: null },
    { Standard: null },
    [],
  );
  expect(item).toMatchObject({ title: "Steward letter", status: { Pending: null } });
});

// ---------------------------------------------------------------------------
// 5. An approved family member is allowed on the research-intake endpoints and
//    addPhoto. These return a Result (or a value) rather than trapping, so the
//    allowed path is asserted as a successful #ok / value.
// ---------------------------------------------------------------------------

it("allows an approved family member to use the research-intake endpoints and addPhoto", async () => {
  const { actor: memberActor } = await setupRoles();

  // UNMEMBER claims 'clayton' and the steward approves the claim, making
  // UNMEMBER an approved family member.
  memberActor.setIdentity(unmemberIdentity);
  const claim = (await memberActor.requestProfileClaim("clayton")) as {
    ok: { id: bigint };
  };
  memberActor.setIdentity(adminIdentity);
  await memberActor.approveProfileClaim(claim.ok.id);

  memberActor.setIdentity(unmemberIdentity);

  // createSource succeeds and returns the pending source.
  const source = await memberActor.createSource(
    "Approved member source",
    { CensusCitation: null },
    "A source from an approved member.",
    [],
  );
  expect(source).toEqual({
    ok: expect.objectContaining({
      title: "Approved member source",
      status: { Pending: null },
    }),
  });
  const sourceId = (source as { ok: { id: bigint } }).ok.id;

  // createFinding succeeds against the approved member's own source.
  const finding = await memberActor.createFinding(
    "Approved member finding",
    { Documented: null },
    { PersonFact: null },
    { PersonFact: { field: "birthDate", value: "1900", personId: "julia" } },
    sourceId,
    ["julia"],
    [],
  );
  expect(finding).toEqual({
    ok: expect.objectContaining({
      title: "Approved member finding",
      status: { Pending: null },
    }),
  });

  // createNewPersonCandidate succeeds.
  const candidate = await memberActor.createNewPersonCandidate(
    "Approved member candidate",
    "A candidate from an approved member.",
    sourceId,
  );
  expect(candidate).toEqual({
    ok: expect.objectContaining({
      name: "Approved member candidate",
      status: { Pending: null },
    }),
  });

  // createRelationshipProposal succeeds.
  const proposal = await memberActor.createRelationshipProposal(
    "clayton",
    "julia",
    "Father",
    sourceId,
  );
  expect(proposal).toEqual({
    ok: expect.objectContaining({
      fromPersonId: "clayton",
      toPersonId: "julia",
      status: { Pending: null },
    }),
  });

  // createSourceWithUpload succeeds and creates one canonical archive item.
  const upload = await memberActor.createSourceWithUpload(
    "Approved member upload",
    { CensusCitation: null },
    "An upload from an approved member.",
    "application/pdf",
    blob,
    ["census"],
    "1900",
    [1900n],
    ["julia"],
    { FamilyOnly: null },
    { Standard: null },
    [],
  );
  expect(upload).toEqual({
    ok: expect.objectContaining({
      source: expect.objectContaining({ title: "Approved member upload" }),
      archiveItem: expect.objectContaining({ status: { Pending: null } }),
    }),
  });

  // addPhoto succeeds for an approved member on the profile they own. UNMEMBER
  // is approved via the 'clayton' claim, so 'clayton' is the profile they own;
  // 'julia' is seeded #Unclaimed and a non-steward approved member is now
  // correctly rejected there (covered in the photo-authorization lane file).
  const photo = await memberActor.addPhoto("clayton", "approved.png", "image/png", blob);
  expect(photo).toMatchObject({ filename: "approved.png", mimeType: "image/png" });
});
