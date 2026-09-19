import { createIdentity, type PocketIc } from "@dfinity/pic";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";

// ---------------------------------------------------------------------------
// Shared helpers for the PocketIC backend lane.
//
// These live in their own module because the lane's tests are split across
// several files, and each file creates its own PocketIC instance. Installing a
// canister replays the whole migration chain and is the single most expensive
// operation in the lane; a single file that installs ~26 canisters exhausts the
// shared sidecar's pid ceiling, at which point the replica stops accepting
// connections and every later test fails with `fetch failed`. Splitting the
// tests across files lets each instance be torn down (releasing its canisters
// and threads) before the next file starts.
//
// Everything here is parameterized by the caller's `pic` rather than owning an
// instance, so each test file keeps its own replica and its own teardown.
// ---------------------------------------------------------------------------

export const BACKEND_WASM = process.env.BACKEND_WASM ?? "";

// The canister id type, derived from the identity helper rather than importing
// `Principal` directly: `@icp-sdk/core` is a frontend-package dependency and a
// bare import of it from `app/test/` does not resolve in the lane.
export type CanisterId = ReturnType<ReturnType<typeof createIdentity>["getPrincipal"]>;

// Deterministic identities. ADMIN is the first caller to
// _initialize_access_control, so ADMIN becomes the Family Steward. CONTRIBUTOR
// is a regular #user that the helpers below promote to an approved family
// member by claiming a seeded profile.
export const adminIdentity = createIdentity("archive-admin-seed");
export const contributorIdentity = createIdentity("archive-contributor-seed");
export const ADMIN = adminIdentity.getPrincipal();
export const CONTRIBUTOR = contributorIdentity.getPrincipal();

export const memberAIdentity = createIdentity("board-member-a-seed");
export const memberBIdentity = createIdentity("board-member-b-seed");
export const MEMBER_A = memberAIdentity.getPrincipal();
export const MEMBER_B = memberBIdentity.getPrincipal();

// Deterministic identities for the profile-claim flow. CLAIMANT claims the
// canonical lorenzoSmithJr profile; STEWARD is a separate caller that becomes
// the Family Steward (first caller to _initialize_access_control) and approves
// the claim.
export const claimantIdentity = createIdentity("lorenzo-claimant-seed");
export const stewardIdentity = createIdentity("lorenzo-steward-seed");
export const CLAIMANT = claimantIdentity.getPrincipal();
export const STEWARD = stewardIdentity.getPrincipal();

export const blob = new Uint8Array([10, 20, 30]);

/**
 * Registers ADMIN as the first caller (the first-admin rule makes it #admin)
 * and CONTRIBUTOR as a regular #user on the given canister, then makes
 * CONTRIBUTOR an APPROVED family member by claiming a seeded living, unclaimed
 * profile and having the steward approve the claim. Family-content contribution
 * endpoints require approved-family membership rather than mere sign-in, so
 * every contribution test must seed an approved contributor.
 *
 * Idempotent: several tests share a canister and call this more than once, so it
 * only requests a claim when CONTRIBUTOR has none yet and only approves a claim
 * that is still pending.
 */
export async function registerApprovedContributor(target: _SERVICE): Promise<void> {
  target.setIdentity(adminIdentity);
  await target._initialize_access_control();
  // Family Steward authority is a separate, explicit bootstrap: registering the
  // first caller as #admin no longer confers Steward powers. Claim the Steward
  // role so the approvals below (and the callers' own steward actions) succeed.
  await target.claimSteward();
  target.setIdentity(contributorIdentity);
  await target._initialize_access_control();

  const existing = await target.getMyProfileClaim("clayton");
  if (existing.length > 0) {
    if ("Approved" in existing[0].status) {
      return;
    }
    target.setIdentity(adminIdentity);
    await target.approveProfileClaim(existing[0].id);
    return;
  }
  const requested = await target.requestProfileClaim("clayton");
  if ("ok" in requested) {
    target.setIdentity(adminIdentity);
    await target.approveProfileClaim(requested.ok.id);
  }
}

/**
 * Registers the given identity as the first caller (the first-admin rule makes
 * it #admin) and then claims the Family Steward role for it.
 *
 * Steward authority is no longer implied by the platform-admin role: the
 * canonical active-Steward check is the only source of Steward powers, and the
 * one-time `claimSteward` bootstrap is how the first caller acquires them.
 * Idempotent: a caller that already holds the Steward role is left as-is.
 */
export async function initializeAsSteward(
  target: _SERVICE,
  identity: ReturnType<typeof createIdentity>,
): Promise<void> {
  target.setIdentity(identity);
  await target._initialize_access_control();
  const claimed = await target.claimSteward();
  if ("err" in claimed) {
    const message = JSON.stringify(claimed.err);
    if (!message.includes("AlreadySteward") && !message.includes("StewardAlreadyExists")) {
      throw new Error(`claimSteward failed: ${message}`);
    }
  }
}

/**
 * Seeds a `#Conflicting` PersonFact finding on the canonical lorenzoSmithJr
 * profile (whose preferredName is 'Waxx Minty' from the 20260907_000000.mo
 * migration) and routes it to Conflict Review by approving it as a steward.
 * Returns the created conflict review item id and the finding id.
 */
export async function routeConflictingFindingToReview(
  conflictActor: _SERVICE,
): Promise<{ conflictId: bigint; findingId: bigint }> {
  await registerApprovedContributor(conflictActor);

  // A signed-in contributor creates a source and a `#Conflicting` PersonFact
  // finding that disagrees with the canonical preferredName 'Waxx Minty'.
  conflictActor.setIdentity(contributorIdentity);
  const sourceCreated = await conflictActor.createSource(
    "1900 census, Norwood household",
    { CensusCitation: null },
    "Census record listing the Norwood family.",
    [],
  );
  const sourceId = (sourceCreated as { ok: { id: bigint } }).ok.id;
  const findingCreated = await conflictActor.createFinding(
    "Preferred name of Lorenzo Smith Jr.",
    { Conflicting: null },
    { PersonFact: null },
    {
      PersonFact: {
        field: "preferredName",
        value: "Lorenzo Smith Jr.",
        personId: "lorenzoSmithJr",
      },
    },
    sourceId,
    ["lorenzoSmithJr"],
    [],
  );
  const findingId = (findingCreated as { ok: { id: bigint } }).ok.id;

  // A steward approves the `#Conflicting` finding, which routes it to Conflict
  // Review instead of silently overwriting canonical data.
  conflictActor.setIdentity(adminIdentity);
  await conflictActor.approveFinding(findingId);

  const items = await conflictActor.listConflictReviewItems();
  const conflict = items.find((c) => c.findingId === findingId);
  if (conflict === undefined) {
    throw new Error("conflict review item was not created for the routed finding");
  }
  return { conflictId: conflict.id, findingId };
}

/**
 * Creates a profile via createMyself as the given identity, then edits its
 * structured fields via updateOwnProfile. Returns the created personId.
 *
 * `createMyself` is not idempotent — each call creates a new minimal profile —
 * so callers must pass a distinct identity per profile they want to create.
 */
export async function createAndEditProfile(
  dupActor: _SERVICE,
  identity: ReturnType<typeof createIdentity>,
  name: string,
  edits: {
    firstName?: string;
    lastName?: string;
    nickname?: string;
    birthDate?: string;
    birthplace?: string;
    currentLocation?: string;
    occupation?: string;
  },
): Promise<string> {
  dupActor.setIdentity(identity);
  const created = (await dupActor.createMyself(name)) as {
    ok: { personId: string };
  };
  const personId = created.ok.personId;
  // updateOwnProfile resolves the caller's steward status via isAdmin, which
  // requires the caller to be registered (the real app registers every signed-in
  // user through the Internet Identity sign-in flow). Register this identity as
  // a #user before editing; ADMIN was already registered first, so this does not
  // make the caller a steward.
  await dupActor._initialize_access_control();
  await dupActor.updateOwnProfile(personId, {
    preferredName: [],
    firstName: edits.firstName ? [edits.firstName] : [],
    middleName: [],
    lastName: edits.lastName ? [edits.lastName] : [],
    suffix: [],
    nickname: edits.nickname ? [edits.nickname] : [],
    birthDate: edits.birthDate ? [edits.birthDate] : [],
    birthplace: edits.birthplace ? [edits.birthplace] : [],
    currentLocation: edits.currentLocation ? [edits.currentLocation] : [],
    occupation: edits.occupation ? [edits.occupation] : [],
    livingStatus: [],
    shortBio: [],
    longerStory: [],
    story: [],
    birthInfo: [],
    timeline: [],
    privacySettings: [],
  });
  return personId;
}

/**
 * A lazily-created canister shared by tests that are mutually compatible.
 * Installing a canister is the lane's most expensive operation, so tests that
 * do not depend on a pristine canister share one instead of each paying for an
 * install. The factory is per-file: each test file owns its own instance and
 * tears it down in `afterAll`.
 */
export function createSharedCanister(getPic: () => PocketIc | undefined): () => Promise<_SERVICE> {
  let shared: _SERVICE | undefined;
  return async () => {
    if (shared === undefined) {
      const pic = getPic();
      if (pic === undefined) {
        throw new Error("shared canister requested before the PocketIC instance was created");
      }
      const setup = await pic.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
      shared = setup.actor;
    }
    return shared;
  };
}
