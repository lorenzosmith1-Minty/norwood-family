import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Characterization baseline for the founding-Steward onboarding hardening
// change.
//
// The requested change hardens three transitions of the existing
// family-scoped founding-Steward onboarding state machine:
//
//   1. decline / cancel set the state to #Undecided (today they set
//      #FounderAccepted);
//   2. acceptFoundingStewardship while the state is #NominationPending returns
//      #InvalidTransition (today it has no such guard);
//   3. getFoundingStewardStatusForFamily never returns #NominationPending with
//      a null activeNomination.
//
// This file deliberately does NOT freeze those three behaviors: they are
// exactly what the change replaces. It also does not assert the new behavior,
// which does not exist yet.
//
// What it protects is the ADJACENT founding-Steward behavior the change must
// not disturb, at the source level, so the hardening cannot silently reshape
// the rest of the state machine:
//
//   A. acceptFoundingStewardship guards and idempotency: anonymous, unknown
//      family, non-founder, no active membership, and the already-active
//      Steward replay that returns the current status without adding a
//      duplicate record; the created record is #Active, founding = true, and
//      stamped with the requested family.
//   B. nominateFoundingSteward guards and the no-zero-Steward invariant: the
//      temporary founding StewardRecord is created for the founder before the
//      nomination is stored, the nomination is #Pending, and the state moves to
//      #NominationPending.
//   C. acceptFoundingStewardNomination: the nominee becomes an #Active Steward
//      with founding = false, the nomination becomes #Accepted, the state moves
//      to #Transferred, and the founder's record is left untouched.
//   D. The read surface: getStatusForFamily returns #FamilyNotFound for an
//      unknown family and buildStatus defaults an unrecorded state to
//      #Undecided; the active/pending nomination lookups are family-scoped.
//   E. The public read authorization: anonymous => #NotSignedIn, unknown family
//      => #FamilyNotFound, non-founder/non-Steward => #NotAuthorized.
//   F. The nomination-id counter advances only on a stored nomination.
//   G. The founding-Steward type contracts the frontend consumes.
//   H. The migration backfills founding = false and starts the new collections
//      empty, so the default Norwood family is never initialized into the
//      onboarding state.
//
// This is a static-source characterization, not a real-canister run: the
// PocketIC lane cannot drive the backend without a compiled wasm, and the
// frontend suite mocks the actor. The real canister's behavior is covered by
// the PocketIC lane when a compiled wasm is present (see coverageLimits).
// ---------------------------------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
// `here` is app/src/frontend/src; the backend sources live at app/src/backend.
const backendRoot = path.resolve(here, "..", "..", "backend");

function readBackend(relativePath: string): string {
  return readFileSync(path.join(backendRoot, relativePath), "utf8");
}

/** Strips `//` line comments and `/* ... *\/` block comments from Motoko source. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/[^\n]*/gu, "");
}

/** The body of a named `func`, from its signature to the closing `};`. */
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`func ${name}(`);
  if (start === -1) {
    throw new Error(`function ${name} not found`);
  }
  const end = source.indexOf("\n  };", start);
  if (end === -1) {
    throw new Error(`end of function ${name} not found`);
  }
  return source.slice(start, end);
}

const foundingLib = stripComments(
  readBackend(path.join("lib", "founding-steward.mo")),
);
const foundingApi = stripComments(
  readBackend(path.join("mixins", "founding-steward-api.mo")),
);
const foundingTypes = stripComments(
  readBackend(path.join("types", "founding-steward.mo")),
);
const foundingMigration = stripComments(
  readBackend(path.join("migrations", "20261004_000000.mo")),
);

// ---------------------------------------------------------------------------
// A. acceptFoundingStewardship guards and idempotency.
// ---------------------------------------------------------------------------

describe("acceptFoundingStewardship keeps its guards and idempotency (compatibility baseline)", () => {
  it("rejects anonymous callers, unknown families, non-founders, and callers without an active membership", () => {
    const body = functionBody(foundingLib, "acceptFoundingStewardship");
    expect(body).toContain("caller.isAnonymous()");
    expect(body).toContain("#err(#NotSignedIn)");
    expect(body).toContain("families.get(familyId) == null");
    expect(body).toContain("#err(#FamilyNotFound)");
    expect(body).toContain("isFounderOfFamily(families, caller, familyId)");
    expect(body).toContain("#err(#NotFounder)");
    expect(body).toContain(
      "hasActiveMembershipForFamily(memberships, familyId, caller)",
    );
    expect(body).toContain("#err(#NotAuthorized)");
  });

  it("replays idempotently for an already-active Steward without adding a duplicate record", () => {
    const body = functionBody(foundingLib, "acceptFoundingStewardship");
    // The replay branch returns the current status and never reaches the
    // `stewards.add` below it.
    const replay = body.indexOf(
      "isActiveStewardForFamily(stewards, caller, familyId)",
    );
    const add = body.indexOf("stewards.add(");
    expect(replay).toBeGreaterThan(-1);
    expect(add).toBeGreaterThan(-1);
    expect(replay).toBeLessThan(add);
    expect(body).toContain(
      "#ok(buildStatus(states, emptyNominations(), familyId))",
    );
  });

  it("refuses a family that already has a different active Steward", () => {
    const body = functionBody(foundingLib, "acceptFoundingStewardship");
    expect(body).toContain("hasNoActiveStewardForFamily(stewards, familyId)");
    expect(body).toContain("#err(#AlreadySteward)");
  });

  it("creates an #Active founding StewardRecord stamped with the requested family", () => {
    const body = functionBody(foundingLib, "acceptFoundingStewardship");
    expect(body).toContain("roleStatus = #Active");
    expect(body).toContain("stewardAccountId = caller");
    expect(body).toContain("founding = true");
    expect(body).toContain("familyId;");
    expect(body).toContain("states.add(familyId, #FounderAccepted)");
  });
});

// ---------------------------------------------------------------------------
// B. nominateFoundingSteward guards and the no-zero-Steward invariant.
// ---------------------------------------------------------------------------

describe("nominateFoundingSteward keeps its guards and temporary-Steward invariant (compatibility baseline)", () => {
  it("rejects anonymous callers, unknown families, non-founders, and callers without an active membership", () => {
    const body = functionBody(foundingLib, "nominateFoundingSteward");
    expect(body).toContain("caller.isAnonymous()");
    expect(body).toContain("#err(#NotSignedIn)");
    expect(body).toContain("families.get(familyId) == null");
    expect(body).toContain("#err(#FamilyNotFound)");
    expect(body).toContain("isFounderOfFamily(families, caller, familyId)");
    expect(body).toContain("#err(#NotFounder)");
    expect(body).toContain(
      "hasActiveMembershipForFamily(memberships, familyId, caller)",
    );
    expect(body).toContain("#err(#NotAuthorized)");
  });

  it("rejects a blank nominee id and a nominee from another family", () => {
    const body = functionBody(foundingLib, "nominateFoundingSteward");
    expect(body).toContain("nomineePersonId.trim(");
    expect(body).toContain("#err(#InvalidInput)");
    expect(body).toContain(
      "nomineeBelongsToFamily(profiles, claims, nomineePersonId, familyId)",
    );
    expect(body).toContain("#err(#NomineeNotInFamily)");
  });

  it("rejects a second pending nomination for the same family", () => {
    const body = functionBody(foundingLib, "nominateFoundingSteward");
    expect(body).toContain(
      "getActiveNominationForFamily(nominations, familyId)",
    );
    expect(body).toContain("#err(#InvalidTransition)");
  });

  it("creates the founder's temporary founding StewardRecord before storing the nomination", () => {
    const body = functionBody(foundingLib, "nominateFoundingSteward");
    const guard = body.indexOf(
      "isActiveStewardForFamily(stewards, caller, familyId)",
    );
    const add = body.indexOf("stewards.add(");
    const store = body.indexOf("nominations.add(nomination)");
    expect(guard).toBeGreaterThan(-1);
    expect(add).toBeGreaterThan(-1);
    expect(store).toBeGreaterThan(-1);
    // The temporary record is added only when the founder is not already a
    // Steward, and always before the nomination is persisted.
    expect(add).toBeLessThan(store);
    expect(body).toContain("founding = true");
  });

  it("stores a #Pending nomination and moves the state to #NominationPending", () => {
    const body = functionBody(foundingLib, "nominateFoundingSteward");
    expect(body).toContain("status = #Pending");
    expect(body).toContain("nominations.add(nomination)");
    expect(body).toContain("states.add(familyId, #NominationPending)");
    // The nominee is not made a Steward here: the only `stewards.add` is the
    // founder's temporary record.
    expect(body.match(/stewards\.add\(/gu)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// C. acceptFoundingStewardNomination.
// ---------------------------------------------------------------------------

describe("acceptFoundingStewardNomination keeps its nominee-activation behavior (compatibility baseline)", () => {
  it("rejects anonymous callers and unknown families", () => {
    const body = functionBody(foundingLib, "acceptFoundingStewardNomination");
    expect(body).toContain("caller.isAnonymous()");
    expect(body).toContain("#err(#NotSignedIn)");
    expect(body).toContain("families.get(familyId) == null");
    expect(body).toContain("#err(#FamilyNotFound)");
  });

  it("resolves the pending nomination family-scoped and rejects a missing one", () => {
    const body = functionBody(foundingLib, "acceptFoundingStewardNomination");
    expect(body).toContain(
      "getPendingNominationForFamily(nominations, familyId, nominationId)",
    );
    expect(body).toContain("#err(#NominationNotFound)");
  });

  it("requires the caller to be the nominated account with an active membership", () => {
    const body = functionBody(foundingLib, "acceptFoundingStewardNomination");
    expect(body).toContain(
      "nomineeAccountForFamily(profiles, familyId, nomination.nomineePersonId)",
    );
    expect(body).toContain("account != caller");
    expect(body).toContain("#err(#NotAuthorized)");
    expect(body).toContain("#err(#NomineeNotActiveMember)");
    expect(body).toContain(
      "hasActiveMembershipForFamily(memberships, familyId, caller)",
    );
  });

  it("activates the nominee with founding = false, marks the nomination #Accepted, and moves to #Transferred", () => {
    const body = functionBody(foundingLib, "acceptFoundingStewardNomination");
    expect(body).toContain("roleStatus = #Active");
    expect(body).toContain("founding = false");
    expect(body).toContain("status = #Accepted");
    expect(body).toContain("states.add(familyId, #Transferred)");
    // The founder's record is never removed or mutated here.
    expect(body).not.toContain("stewards.remove");
    expect(body).not.toContain("roleStatus = #Removed");
  });
});

// ---------------------------------------------------------------------------
// D. The read surface.
// ---------------------------------------------------------------------------

describe("the founding-Steward read surface is family-scoped (compatibility baseline)", () => {
  it("getStatusForFamily returns #FamilyNotFound for an unknown family", () => {
    const body = functionBody(foundingLib, "getStatusForFamily");
    expect(body).toContain("families.get(familyId) == null");
    expect(body).toContain("#err(#FamilyNotFound)");
  });

  it("buildStatus defaults an unrecorded state to #Undecided and reads the active nomination", () => {
    const body = functionBody(foundingLib, "buildStatus");
    expect(body).toContain("states.get(familyId) ?? #Undecided");
    expect(body).toContain(
      "getActiveNominationForFamily(nominations, familyId)",
    );
  });

  it("the active and pending nomination lookups match on familyId and #Pending", () => {
    const active = functionBody(foundingLib, "getActiveNominationForFamily");
    expect(active).toContain("n.familyId == familyId");
    expect(active).toContain("n.status == #Pending");

    const pending = functionBody(foundingLib, "getPendingNominationForFamily");
    expect(pending).toContain("n.familyId == familyId");
    expect(pending).toContain("n.id == nominationId");
    expect(pending).toContain("n.status == #Pending");
  });

  it("hasStateForFamily distinguishes a recorded state from the default family", () => {
    const body = functionBody(foundingLib, "hasStateForFamily");
    expect(body).toContain("states.get(familyId) != null");
  });
});

// ---------------------------------------------------------------------------
// E. Public read authorization.
// ---------------------------------------------------------------------------

describe("the founding-Steward read endpoint is founder/Steward scoped (compatibility baseline)", () => {
  it("gates anonymous, unknown-family, and unrelated callers before reading", () => {
    const body = functionBody(foundingApi, "getFoundingStewardStatusForFamily");
    expect(body).toContain("caller.isAnonymous()");
    expect(body).toContain("#err(#NotSignedIn)");
    expect(body).toContain("families.get(familyId) == null");
    expect(body).toContain("#err(#FamilyNotFound)");
    expect(body).toContain(
      "FoundingStewardLib.isFounderOfFamily(families, caller, familyId)",
    );
    expect(body).toContain(
      "FoundingStewardLib.isActiveStewardForFamily(stewards, caller, familyId)",
    );
    expect(body).toContain("#err(#NotAuthorized)");
    // The platform admin role is never consulted.
    expect(body).not.toContain("isAdmin");
    expect(body).not.toContain("accessControl");
  });

  it("delegates the read to the founding-Steward domain lib", () => {
    const body = functionBody(foundingApi, "getFoundingStewardStatusForFamily");
    expect(body).toContain("FoundingStewardLib.getStatusForFamily(");
  });
});

// ---------------------------------------------------------------------------
// F. The nomination-id counter advances only on a stored nomination.
// ---------------------------------------------------------------------------

describe("the nomination-id counter advances only on a stored nomination (compatibility baseline)", () => {
  it("increments nextNominationId only for an #ok result", () => {
    const body = functionBody(foundingApi, "nominateFoundingSteward");
    expect(body).toContain("foundingStewardState.nextNominationId");
    expect(body).toContain(
      "case (#ok(_)) { foundingStewardState.nextNominationId += 1 }",
    );
    expect(body).toContain("case (#err(_)) {}");
  });
});

// ---------------------------------------------------------------------------
// G. The founding-Steward type contracts.
// ---------------------------------------------------------------------------

describe("the founding-Steward type contracts (compatibility baseline)", () => {
  it("FoundingStewardState keeps its four variants", () => {
    const state = foundingTypes.slice(
      foundingTypes.indexOf("public type FoundingStewardState = {"),
      foundingTypes.indexOf(
        "};",
        foundingTypes.indexOf("public type FoundingStewardState = {"),
      ),
    );
    for (const variant of [
      "#Undecided;",
      "#FounderAccepted;",
      "#NominationPending;",
      "#Transferred;",
    ]) {
      expect(state).toContain(variant);
    }
  });

  it("FoundingStewardNominationStatus keeps its four variants", () => {
    const status = foundingTypes.slice(
      foundingTypes.indexOf("public type FoundingStewardNominationStatus = {"),
      foundingTypes.indexOf(
        "};",
        foundingTypes.indexOf(
          "public type FoundingStewardNominationStatus = {",
        ),
      ),
    );
    for (const variant of [
      "#Pending;",
      "#Accepted;",
      "#Declined;",
      "#Cancelled;",
    ]) {
      expect(status).toContain(variant);
    }
  });

  it("FoundingStewardNomination keeps its nine fields", () => {
    const nomination = foundingTypes.slice(
      foundingTypes.indexOf("public type FoundingStewardNomination = {"),
      foundingTypes.indexOf(
        "};",
        foundingTypes.indexOf("public type FoundingStewardNomination = {"),
      ),
    );
    for (const field of [
      "id : Nat;",
      "familyId : FamilyId;",
      "founderAccountId : Principal;",
      "nomineePersonId : PersonId;",
      "nomineeAccountId : ?Principal;",
      "nomineeEmail : ?Text;",
      "status : FoundingStewardNominationStatus;",
      "createdAt : Int;",
      "updatedAt : Int;",
    ]) {
      expect(nomination).toContain(field);
    }
  });

  it("FoundingStewardStatus keeps its three fields", () => {
    const status = foundingTypes.slice(
      foundingTypes.indexOf("public type FoundingStewardStatus = {"),
      foundingTypes.indexOf(
        "};",
        foundingTypes.indexOf("public type FoundingStewardStatus = {"),
      ),
    );
    for (const field of [
      "familyId : FamilyId;",
      "state : FoundingStewardState;",
      "activeNomination : ?FoundingStewardNomination;",
    ]) {
      expect(status).toContain(field);
    }
  });

  it("FoundingStewardError keeps its ten variants", () => {
    const error = foundingTypes.slice(
      foundingTypes.indexOf("public type FoundingStewardError = {"),
      foundingTypes.indexOf(
        "};",
        foundingTypes.indexOf("public type FoundingStewardError = {"),
      ),
    );
    for (const variant of [
      "#NotSignedIn;",
      "#FamilyNotFound;",
      "#NotAuthorized;",
      "#NotFounder;",
      "#AlreadySteward;",
      "#NominationNotFound;",
      "#InvalidTransition;",
      "#NomineeNotInFamily;",
      "#NomineeNotActiveMember;",
      "#InvalidInput;",
    ]) {
      expect(error).toContain(variant);
    }
  });
});

// ---------------------------------------------------------------------------
// H. The migration backfills founding = false and starts the new state empty.
// ---------------------------------------------------------------------------

describe("the founding-Steward migration is additive (compatibility baseline)", () => {
  it("backfills founding = false on every pre-existing StewardRecord", () => {
    expect(foundingMigration).toContain("founding = false;");
    // The pre-existing fields carry through unchanged.
    for (const field of [
      "familyId = s.familyId;",
      "stewardAccountId = s.stewardAccountId;",
      "roleStatus = s.roleStatus;",
      "successorPriority = s.successorPriority;",
      "assignedBy = s.assignedBy;",
      "assignedAt = s.assignedAt;",
    ]) {
      expect(foundingMigration).toContain(field);
    }
  });

  it("starts the onboarding collections empty so Norwood is never initialized into the state", () => {
    expect(foundingMigration).toContain("foundingStewardStates = Map.empty();");
    expect(foundingMigration).toContain(
      "foundingStewardNominations = List.empty();",
    );
    expect(foundingMigration).toContain(
      "foundingStewardState = { var nextNominationId = 0 };",
    );
  });
});
