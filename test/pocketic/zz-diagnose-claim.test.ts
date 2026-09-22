import { PocketIc } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";
import {
  BACKEND_WASM,
  blob,
  contributorIdentity,
  registerApprovedContributor,
} from "./lane-helpers";

// ---------------------------------------------------------------------------
// Legacy Archive/Research compatibility wrappers (real-canister regression).
//
// The Tenancy 1C-B1 build made the family-scoped `*ForFamily` endpoints
// canonical and left the no-argument legacy endpoints as TEMPORARY wrappers
// delegating with `FamilyTypes.DEFAULT_FAMILY_ID`. An earlier revision of that
// change had the wrappers call their public `*ForFamily` siblings directly, so
// the callee's `{ caller }` became the canister principal and the real caller
// was denied. The fix extracted internal functions that take the caller
// explicitly.
//
// This file drives the two legacy wrappers that were affected —
// `createSourceWithUpload` and `submitArchiveItem` — against the real canister
// as an approved Norwood contributor, and asserts they succeed and record the
// real caller. It is the regression guard for that class of bug: a wrapper that
// re-introduces the direct-sibling call traps here instead of shipping.
//
// The family-scoped boundary itself is covered by
// `archive-family-isolation.cover.test.ts`; this file only protects the legacy
// default-family path.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

let pic: PocketIc | undefined;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
});

afterAll(async () => {
  await pic?.tearDown();
});

it("lets an approved contributor use the legacy createSourceWithUpload wrapper", async () => {
  const setup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const actor = setup.actor;
  await registerApprovedContributor(actor);

  actor.setIdentity(contributorIdentity);

  const upload = await actor.createSourceWithUpload(
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

  // The wrapper must succeed for the real caller rather than trap with the
  // canister principal's identity.
  expect("ok" in upload).toBe(true);
  if ("ok" in upload) {
    expect(upload.ok.source.id).toBeGreaterThanOrEqual(0n);
    expect(upload.ok.archiveItem.id).toBeGreaterThanOrEqual(0n);
    expect(upload.ok.archiveItem.familyId).toBe("norwood");
  }
});

it("lets an approved contributor use the legacy submitArchiveItem wrapper", async () => {
  const setup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const actor = setup.actor;
  await registerApprovedContributor(actor);

  actor.setIdentity(contributorIdentity);

  const item = await actor.submitArchiveItem(
    "A letter from 1924.",
    "A letter from 1924.",
    { Document: null },
    "application/pdf",
    blob,
    "1924",
    [1924n],
    ["letters"],
    ["julia"],
    ["branch-1"],
    { Original: null },
    { FamilyOnly: null },
    { Standard: null },
    [],
    "letter.pdf",
  );

  // The legacy wrapper stores the item in the default Norwood family and
  // records the real caller as its contributor.
  expect(item.familyId).toBe("norwood");
  expect(item.status).toEqual({ Pending: null });
  expect(item.contributor).toEqual(contributorIdentity.getPrincipal());
});
