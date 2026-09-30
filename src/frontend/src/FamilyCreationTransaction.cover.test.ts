import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Onboarding Phase 1B-1 — createFamilyWithFounder transaction contract
// (static/source-level cover).
//
// The accepted behavior is that `createFamilyWithFounder` creates exactly three
// linked records in one atomic step — the new Family, the founder's first
// PersonProfile inside that family, and an #Active FamilyMembership linking the
// authenticated caller to that founder profile — validates all input before any
// stable collection is mutated, never creates a StewardRecord, and never
// requires the caller to belong to an existing family.
//
// The real-canister behavior is covered by
// `test/pocketic/family-creation.cover.test.ts` when the PocketIC lane can run.
// This file pins the transaction's structural invariants at the source level so
// the contract is still exercised by the gated frontend suite when the lane
// skips (no sidecar / stale wasm), and so a refactor that silently drops one of
// the three records, reorders validation after mutation, or adds a Steward write
// fails here.
//
// It is deliberately a source contract, not a behavioral test: it reads the
// real Motoko sources and asserts the shape of the transaction. It does not
// prove the canister runs.
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

const creationLib = stripComments(
  readBackend(path.join("lib", "family-creation.mo")),
);
const creationApi = stripComments(
  readBackend(path.join("mixins", "family-creation-api.mo")),
);
const creationTypes = stripComments(
  readBackend(path.join("types", "family-creation.mo")),
);
const familyLib = stripComments(readBackend(path.join("lib", "family.mo")));
const migration = readBackend(path.join("migrations", "20261003_000000.mo"));
const apiDoc = readBackend(path.join("mixins", "api-doc.mo"));

// ---------------------------------------------------------------------------
// (1) The transaction creates exactly the three linked records.
// ---------------------------------------------------------------------------

describe("createFamilyWithFounder creates the three linked records", () => {
  it("writes the Family, the founder profile, and the membership", () => {
    const body = functionBody(creationLib, "createFamilyWithFounder");
    // The Family record is added to the families map.
    expect(body).toContain("families.add(familyId, family)");
    // The founder profile is stored under the family-qualified key.
    expect(body).toContain(
      "TenancyLib.putProfileForFamily(profiles, familyId, profile)",
    );
    // The membership is appended to the memberships list.
    expect(body).toContain("memberships.add(membership)");
  });

  it("returns all three records together in the result", () => {
    const body = functionBody(creationLib, "createFamilyWithFounder");
    expect(body).toContain(
      "{ result = #ok({ family; founderProfile = profile; membership }); created = true }",
    );
  });

  it("the result type carries the family, founder profile, and membership", () => {
    expect(creationTypes).toContain("family : FamilyTypes.Family;");
    expect(creationTypes).toContain(
      "founderProfile : OwnershipTypes.PersonProfile;",
    );
    expect(creationTypes).toContain(
      "membership : MembershipTypes.FamilyMembership;",
    );
  });

  it("the founder membership is Active and links the caller to the founder profile", () => {
    const body = functionBody(creationLib, "createFamilyWithFounder");
    expect(body).toContain("accountId = caller");
    expect(body).toContain("personId;");
    expect(body).toContain("status = #Active");
    expect(body).toContain("approvedBy = ?caller");
  });

  it("the founder profile belongs to the new family and is claimed by the caller", () => {
    const body = functionBody(creationLib, "createFamilyWithFounder");
    expect(body).toContain("familyId;");
    expect(body).toContain("claimStatus = #Claimed");
    expect(body).toContain("claimedByUserId = ?caller");
  });
});

// ---------------------------------------------------------------------------
// (2) Validation happens before any stable collection is mutated.
// ---------------------------------------------------------------------------

describe("createFamilyWithFounder validates before mutating", () => {
  it("rejects an anonymous caller before any write", () => {
    const body = functionBody(creationLib, "createFamilyWithFounder");
    const anonymousGuard = body.indexOf("caller.isAnonymous()");
    const firstWrite = body.indexOf("families.add(");
    expect(anonymousGuard).toBeGreaterThan(-1);
    expect(firstWrite).toBeGreaterThan(-1);
    expect(anonymousGuard).toBeLessThan(firstWrite);
    expect(body).toContain("#err(#NotSignedIn)");
  });

  it("rejects a blank display name and blank first/last name before any write", () => {
    const body = functionBody(creationLib, "createFamilyWithFounder");
    const firstWrite = body.indexOf("families.add(");
    const displayNameCheck = body.indexOf('trimmedDisplayName == ""');
    const nameCheck = body.indexOf('firstName == "" or lastName == ""');
    expect(displayNameCheck).toBeGreaterThan(-1);
    expect(nameCheck).toBeGreaterThan(-1);
    expect(displayNameCheck).toBeLessThan(firstWrite);
    expect(nameCheck).toBeLessThan(firstWrite);
    expect(body).toContain("#err(#InvalidInput)");
  });

  it("the public endpoint rejects an anonymous caller before delegating", () => {
    const body = functionBody(creationApi, "createFamilyWithFounder");
    const anonymousGuard = body.indexOf("caller.isAnonymous()");
    const delegate = body.indexOf("FamilyCreationLib.createFamilyWithFounder(");
    expect(anonymousGuard).toBeGreaterThan(-1);
    expect(delegate).toBeGreaterThan(-1);
    expect(anonymousGuard).toBeLessThan(delegate);
    expect(body).toContain("#err(#NotSignedIn)");
  });
});

// ---------------------------------------------------------------------------
// (3) No StewardRecord is created.
// ---------------------------------------------------------------------------

describe("createFamilyWithFounder creates no StewardRecord", () => {
  it("the transaction never touches the stewards collection", () => {
    const body = functionBody(creationLib, "createFamilyWithFounder");
    expect(body).not.toContain("stewards");
    expect(body).not.toContain("StewardRecord");
    expect(body).not.toContain("claimSteward");
  });

  it("the public endpoint never touches the stewards collection", () => {
    const body = functionBody(creationApi, "createFamilyWithFounder");
    expect(body).not.toContain("stewards");
    expect(body).not.toContain("StewardRecord");
  });
});

// ---------------------------------------------------------------------------
// (4) The caller is always the authenticated caller; no account parameter.
// ---------------------------------------------------------------------------

describe("createFamilyWithFounder cannot name another account as founder", () => {
  it("the public endpoint takes no account/principal parameter", () => {
    const signature = creationApi.slice(
      creationApi.indexOf("func createFamilyWithFounder("),
      creationApi.indexOf(
        ") : async Result.Result<CreationTypes.FamilyCreationResult",
      ),
    );
    expect(signature).toContain("displayName : Text");
    expect(signature).toContain("input : CreationTypes.FounderProfileInput");
    expect(signature).toContain("idempotencyKey : Text");
    // No caller-supplied account/principal/founder argument.
    expect(signature).not.toMatch(/accountId\s*:/u);
    expect(signature).not.toMatch(/founder\s*:\s*Principal/u);
    expect(signature).not.toMatch(/principal\s*:/iu);
  });

  it("the endpoint passes the authenticated caller into the transaction", () => {
    const body = functionBody(creationApi, "createFamilyWithFounder");
    expect(body).toContain("caller,");
  });
});

// ---------------------------------------------------------------------------
// (5) Family id generation: unique, safe, not derived from displayName alone.
// ---------------------------------------------------------------------------

describe("family id generation", () => {
  it("is a slug plus a nonce/principal-derived suffix, never the display name alone", () => {
    const body = functionBody(familyLib, "generateFamilyId");
    expect(body).toContain("slug(displayName)");
    expect(body).toContain("suffixFor(caller, nonce)");
    expect(body).toContain('base # "-" # suffix');
    // Collision handling extends the suffix until the id is free.
    expect(body).toContain("families.get(candidate) != null");
  });

  it("hashes the caller principal rather than embedding its text", () => {
    const body = functionBody(familyLib, "suffixFor");
    expect(body).toContain("caller.toBlob()");
    // The raw principal text is never concatenated into the id.
    expect(body).not.toContain("caller.toText()");
  });

  it("keeps only lowercase alphanumerics in the slug", () => {
    const body = functionBody(familyLib, "isSlugChar");
    expect(body).toContain("c >= 'a' and c <= 'z'");
    expect(body).toContain("c >= '0' and c <= '9'");
  });
});

// ---------------------------------------------------------------------------
// (6) Retry safety: the idempotency store is caller-scoped.
// ---------------------------------------------------------------------------

describe("retry safety", () => {
  it("keys the idempotency store by caller and client key", () => {
    const body = functionBody(creationLib, "idempotencyKeyKey");
    expect(body).toContain("caller.toText()");
    expect(body).toContain("key");
  });

  it("replays the stored result before creating new records", () => {
    const body = functionBody(creationLib, "createFamilyWithFounder");
    const replay = body.indexOf("replayResult(");
    const firstWrite = body.indexOf("families.add(");
    expect(replay).toBeGreaterThan(-1);
    expect(firstWrite).toBeGreaterThan(-1);
    expect(replay).toBeLessThan(firstWrite);
  });
});

// ---------------------------------------------------------------------------
// (7) The migration is a no-op for existing data.
// ---------------------------------------------------------------------------

describe("family-creation migration", () => {
  it("introduces only the idempotency map and nonce state", () => {
    expect(migration).toContain(
      "familyCreationIdempotency : Map.Map<Text, Text>",
    );
    expect(migration).toContain(
      "familyCreationState : { var nextFamilyNonce : Nat }",
    );
    expect(migration).toContain("familyCreationIdempotency = Map.empty()");
    expect(migration).toContain("nextFamilyNonce = 0");
  });

  it("does not read, reseed, or reset the default family or its records", () => {
    // Comments describe the no-op intent; the executable body is what must not
    // touch the pre-existing collections.
    const body = stripComments(migration);
    expect(body).not.toContain("norwood");
    expect(body).not.toContain("families");
    expect(body).not.toContain("memberships");
    expect(body).not.toContain("stewards");
  });
});

// ---------------------------------------------------------------------------
// (8) API documentation describes the operation and its no-Stewardship stance.
// ---------------------------------------------------------------------------

describe("API documentation", () => {
  it("documents createFamilyWithFounder as the zero-to-family foundation", () => {
    expect(apiDoc).toContain("createFamilyWithFounder");
    expect(apiDoc).toContain("zero-to-family");
    expect(apiDoc).toContain("founder's first `PersonProfile`");
    expect(apiDoc).toContain("`#Active` `FamilyMembership`");
  });

  it("states that Stewardship is intentionally not assigned", () => {
    expect(apiDoc).toContain("does NOT assign");
    expect(apiDoc).toContain("Stewardship");
  });
});
