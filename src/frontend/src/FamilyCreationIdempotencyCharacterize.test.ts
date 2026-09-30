import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Characterization baseline for the createFamilyWithFounder idempotency seam.
//
// The requested change makes a NON-EMPTY idempotency key REQUIRED on the
// canonical zero-to-family creation flow. That change touches the public
// signature and the retry-safety path, and nothing else about the transaction.
//
// This file deliberately does NOT freeze the current OPTIONALITY of the
// parameter (`idempotencyKey : ?Text`): making it required is exactly the change
// under way, so asserting the optional form here would pin the behavior the
// request intentionally replaces. It also does not assert the new required
// behavior, which does not exist yet.
//
// What it protects is the retry-safety contract the required-key patch must
// preserve while it changes the signature:
//
//   A. The idempotency store is keyed by caller AND client key, so one account's
//      key can never collide with another account's key.
//   B. A replay is resolved BEFORE any stable collection is mutated, so a
//      retried attempt returns the first attempt's records instead of creating
//      duplicates.
//   C. The family-creation nonce advances only on a successful creation, so a
//      rejected request does not consume a nonce and same-name families from the
//      same caller still get distinct ids.
//   D. The public endpoint passes the authenticated caller and the current nonce
//      into the transaction, and advances the nonce only on `#ok`.
//
// This is a static-source characterization, not a real-canister run: the
// frontend suite mocks the actor and has no principals. The real canister's
// idempotency behavior is covered by test/pocketic/family-creation.cover.test.ts
// when the PocketIC lane can run (see the episode's coverageLimits).
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
const mainSource = stripComments(readBackend("main.mo"));

// ---------------------------------------------------------------------------
// A. The idempotency store is caller-scoped.
// ---------------------------------------------------------------------------

describe("idempotency store is caller-scoped (compatibility baseline)", () => {
  it("keys the store by the caller principal and the client key", () => {
    const body = functionBody(creationLib, "idempotencyKeyKey");
    // The caller principal is part of the key, so two accounts using the same
    // client key never share a replay entry.
    expect(body).toContain("caller.toText()");
    expect(body).toContain("key");
  });

  it("stores the created family id under the caller-scoped key", () => {
    const body = functionBody(creationLib, "createFamilyWithFounder");
    expect(body).toContain(
      "idempotency.add(idempotencyKeyKey(caller, key), familyId)",
    );
  });
});

// ---------------------------------------------------------------------------
// B. A replay is resolved before any stable collection is mutated.
// ---------------------------------------------------------------------------

describe("replay resolves before mutation (compatibility baseline)", () => {
  it("looks up the stored family id before creating new records", () => {
    const body = functionBody(creationLib, "createFamilyWithFounder");
    const lookup = body.indexOf(
      "idempotency.get(idempotencyKeyKey(caller, key))",
    );
    const firstWrite = body.indexOf("families.add(");
    expect(lookup).toBeGreaterThan(-1);
    expect(firstWrite).toBeGreaterThan(-1);
    expect(lookup).toBeLessThan(firstWrite);
  });

  it("returns the replayed result instead of falling through to creation", () => {
    const body = functionBody(creationLib, "createFamilyWithFounder");
    // The replay branch returns the rebuilt result and does not continue.
    expect(body).toContain("replayResult(");
    expect(body).toContain("return { result = #ok(result); created = false }");
  });

  it("rebuilds the replay from the family, the caller's membership, and the founder profile", () => {
    const body = functionBody(creationLib, "replayResult");
    expect(body).toContain("families.get(familyId)");
    expect(body).toContain(
      "FamilyMembershipLib.getMembershipForFamily(memberships, familyId, caller)",
    );
    expect(body).toContain(
      "TenancyLib.getProfileForFamily(profiles, familyId, membership.personId)",
    );
    // A replay that can no longer resolve its records returns null so the
    // caller falls through to a fresh creation rather than a partial result.
    expect(body).toContain("return null");
  });
});

// ---------------------------------------------------------------------------
// C. The nonce advances only on a successful creation.
// ---------------------------------------------------------------------------

describe("family-creation nonce advances only on success (compatibility baseline)", () => {
  it("the transaction receives the current nonce and never mutates it", () => {
    const body = functionBody(creationLib, "createFamilyWithFounder");
    // The nonce is an input used to derive the family id; the lib does not own
    // or advance the counter.
    expect(body).toContain("nextFamilyNonce : Nat");
    expect(body).toContain(
      "FamilyLib.generateFamilyId(families, trimmedDisplayName, caller, nextFamilyNonce)",
    );
    expect(body).not.toContain("nextFamilyNonce +=");
    expect(body).not.toContain("nextFamilyNonce :=");
  });

  it("the public endpoint advances the nonce only when a new family was created", () => {
    const body = functionBody(creationApi, "createFamilyWithFounder");
    // The lib reports whether this call actually created a family; the endpoint
    // advances the nonce only in that case, so an idempotent replay does not
    // consume a nonce.
    expect(body).toContain("outcome.created");
    const increment = body.indexOf("nextFamilyNonce += 1");
    const delegate = body.indexOf("FamilyCreationLib.createFamilyWithFounder(");
    expect(increment).toBeGreaterThan(delegate);
    // The increment is guarded by the created flag, not by the result variant.
    expect(body).not.toContain(
      "case (#ok(_)) { familyCreationState.nextFamilyNonce += 1 }",
    );
  });

  it("the endpoint passes the authenticated caller and the current nonce", () => {
    const body = functionBody(creationApi, "createFamilyWithFounder");
    expect(body).toContain("caller,");
    expect(body).toContain("familyCreationState.nextFamilyNonce,");
  });
});

// ---------------------------------------------------------------------------
// C2. The stored-key format and the replay fall-through are stable, so keys
//     written before the required-key patch still replay after it.
//
// The patch changes the parameter from optional to required and rejects an
// empty key; it must NOT change how a non-empty key is composed or what happens
// when a stored key can no longer be resolved. These assertions pin the
// non-empty-key path only — they do not assert the current optionality or the
// current acceptance of an empty key, which are the behavior under change.
// ---------------------------------------------------------------------------

describe("idempotency key format and replay fall-through (compatibility baseline)", () => {
  it("composes the store key as caller text, a separator, and the client key", () => {
    const body = functionBody(creationLib, "idempotencyKeyKey");
    // The exact composition is what makes a key stored by an earlier build
    // replayable by a later one; a changed separator would silently orphan
    // every previously stored key.
    expect(body).toContain('caller.toText() # "::" # key');
  });

  it("requires a non-empty idempotency key on the canonical creation path", () => {
    // The public endpoint takes a required `Text` key, not an optional one.
    const signature = creationApi.slice(
      creationApi.indexOf("func createFamilyWithFounder("),
      creationApi.indexOf(
        ") : async Result.Result<CreationTypes.FamilyCreationResult",
      ),
    );
    expect(signature).toContain("idempotencyKey : Text");
    expect(signature).not.toContain("idempotencyKey : ?Text");

    // The lib trims the key and rejects a blank/whitespace-only value with
    // #InvalidInput before any stable collection is mutated.
    const body = functionBody(creationLib, "createFamilyWithFounder");
    const blankKeyCheck = body.indexOf('key == ""');
    const firstWrite = body.indexOf("families.add(");
    expect(blankKeyCheck).toBeGreaterThan(-1);
    expect(firstWrite).toBeGreaterThan(-1);
    expect(blankKeyCheck).toBeLessThan(firstWrite);
    expect(body).toContain("#err(#InvalidInput)");
  });

  it("stores the key unconditionally after the three records are written", () => {
    const body = functionBody(creationLib, "createFamilyWithFounder");
    // The key is required, so the idempotency entry is written on every
    // successful creation — there is no `case null` branch that skips it.
    expect(body).toContain(
      "idempotency.add(idempotencyKeyKey(caller, key), familyId)",
    );
    expect(body).not.toContain("switch (idempotencyKey)");
  });

  it("falls through to a fresh creation when a stored key cannot be resolved", () => {
    const body = functionBody(creationLib, "createFamilyWithFounder");
    // The replay switch has a `case null {}` arm that continues to creation
    // rather than returning an error, so a stale key does not block onboarding.
    const replaySwitch = body.slice(
      body.indexOf("switch (replayResult("),
      body.indexOf("// --- Atomic creation"),
    );
    expect(replaySwitch).toContain(
      "case (?result) { return { result = #ok(result); created = false } }",
    );
    expect(replaySwitch).toContain("case null {}");
    // The fall-through reaches the creation write, not an early return.
    expect(body.indexOf("families.add(")).toBeGreaterThan(
      body.indexOf("case null {}"),
    );
  });

  it("stores the key only after the three records are written", () => {
    const body = functionBody(creationLib, "createFamilyWithFounder");
    // The idempotency entry is recorded after the family, profile, and
    // membership writes, so a key is never stored for a creation that did not
    // complete.
    const membershipWrite = body.indexOf("memberships.add(membership)");
    const keyWrite = body.indexOf(
      "idempotency.add(idempotencyKeyKey(caller, key), familyId)",
    );
    expect(membershipWrite).toBeGreaterThan(-1);
    expect(keyWrite).toBeGreaterThan(-1);
    expect(keyWrite).toBeGreaterThan(membershipWrite);
  });
});

// ---------------------------------------------------------------------------
// D. The stable state the idempotency path depends on stays declared.
// ---------------------------------------------------------------------------

describe("family-creation stable state (compatibility baseline)", () => {
  it("main.mo declares the idempotency map and the nonce state", () => {
    expect(mainSource).toContain(
      "familyCreationIdempotency : Map.Map<Text, Text>",
    );
    expect(mainSource).toContain(
      "familyCreationState : { var nextFamilyNonce : Nat }",
    );
  });

  it("main.mo composes the family-creation mixin with both stable fields", () => {
    expect(mainSource).toContain(
      "FamilyCreationApi(families, profiles, memberships, familyCreationIdempotency, familyCreationState)",
    );
  });
});
