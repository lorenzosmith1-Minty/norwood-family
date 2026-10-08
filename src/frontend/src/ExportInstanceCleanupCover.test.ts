import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { type ExportInstanceRef, ExportMediaRetrievalError } from "@/backend";

// ---------------------------------------------------------------------------
// Expired export-instance cleanup — source-level cover.
//
// The real-canister PocketIC lane
// (test/pocketic/export-instance-cleanup.cover.test.ts) is the primary coverage
// for the cleanup's runtime behavior: it advances the IC clock past the 7-day
// lifecycle and observes that an expired ref resolves neutrally, that a new
// asset does not redirect it, that another family's active instance survives,
// and that no family media is deleted.
//
// This file covers the two things that lane cannot observe in this environment:
//
//   A. The generated consumer contract the frontend compiles against is
//      unchanged: the retrieval endpoint still takes the opaque instance ref
//      plus the export-local media token, and the neutral instance errors are
//      still on the typed enum.
//   B. The source-level shape of the bounded lazy cleanup: it is a pure
//      function over ONLY the two export-retrieval mapping lists, it prunes by
//      the existing `expiresAt` lifecycle, and it is invoked from BOTH existing
//      export/retrieval operations — never a scheduler or background system.
//
// This is a static-source + typed consumer-contract test. It does NOT exercise
// the real canister; the PocketIC lane is the only place backend runtime
// behavior is observed, and it is recorded in the episode's coverageLimits.
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

const exportLib = stripComments(readBackend(path.join("lib", "export.mo")));
const exportApi = stripComments(
  readBackend(path.join("mixins", "export-api.mo")),
);

/**
 * The body of a top-level `func <name>(` declaration (public or private), up to
 * the next top-level declaration. Comments are already stripped.
 */
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`func ${name}(`);
  expect(start, `${name} must exist`).toBeGreaterThan(-1);
  const privateEnd = source.indexOf("\n  func ", start + 1);
  const publicEnd = source.indexOf("\n  public func ", start + 1);
  const boundary = [privateEnd, publicEnd]
    .filter((index) => index !== -1)
    .sort((a, b) => a - b)[0];
  return source.slice(start, boundary === undefined ? undefined : boundary);
}

// ---------------------------------------------------------------------------
// A. The generated consumer contract is unchanged.
// ---------------------------------------------------------------------------

describe("export-instance cleanup consumer contract (generated bindings)", () => {
  it("keeps the retrieval endpoint on the typed service wrapper", () => {
    const wrapper = readFileSync(path.join(here, "backend.ts"), "utf8");
    expect(wrapper).toContain(
      "retrieveFamilyArchiveMedia(exportInstanceRef: ExportInstanceRef, mediaRef: string): Promise<Result_6>",
    );
  });

  it("keeps both neutral instance errors on the typed consumer enum", () => {
    expect(Object.values(ExportMediaRetrievalError).sort()).toEqual([
      "ExportInstanceExpired",
      "ExportInstanceNotFound",
      "FamilyNotFound",
      "MediaNotFound",
      "MediaUnavailable",
      "NotSignedIn",
      "NotSteward",
    ]);
  });

  it("types the instance ref as an opaque string token", () => {
    const ref: ExportInstanceRef = "export-1";
    expect(typeof ref).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// B. The bounded lazy cleanup is scoped to the two mapping lists and prunes by
//    the existing lifecycle.
// ---------------------------------------------------------------------------

describe("bounded lazy cleanup (source-level)", () => {
  it("declares the cleanup over only the two export-retrieval mapping lists", () => {
    const body = functionBody(exportLib, "pruneExpiredExportInstances");
    // The two collections the cleanup may prune.
    expect(body).toContain(
      "exportInstances : List.List<ExportTypes.ExportInstance>",
    );
    expect(body).toContain(
      "exportMediaBindings : List.List<ExportTypes.ExportMediaBinding>",
    );
    // It takes `now` as a parameter, so it is a pure function of the clock the
    // caller supplies — no hidden scheduler or background trigger.
    expect(body).toContain("now : Int");
  });

  it("prunes by the existing expiresAt lifecycle", () => {
    const body = functionBody(exportLib, "pruneExpiredExportInstances");
    expect(body).toContain("if (now > instance.expiresAt)");
    expect(body).toContain("expiredRefs.add(instance.ref)");
  });

  it("removes the expired instance and every binding that belongs to it", () => {
    const body = functionBody(exportLib, "pruneExpiredExportInstances");
    // Instances are rebuilt without the expired refs.
    expect(body).toContain("exportInstances.clear()");
    expect(body).toContain("if (not expiredRefs.contains(instance.ref))");
    // Bindings are rebuilt without any binding whose instance was pruned.
    expect(body).toContain("exportMediaBindings.clear()");
    expect(body).toContain(
      "if (not expiredRefs.contains(binding.exportInstanceRef))",
    );
  });

  it("never touches family data, audit history, or media bytes", () => {
    const body = functionBody(exportLib, "pruneExpiredExportInstances");
    for (const forbidden of [
      "archiveItems",
      "galleries",
      "exportAudit",
      "profiles",
      "families",
      "blob",
      "bytes",
    ]) {
      expect(body).not.toContain(forbidden);
    }
  });

  it("returns the number of expired instances removed", () => {
    const body = functionBody(exportLib, "pruneExpiredExportInstances");
    expect(body).toContain("expiredRefs.size()");
  });
});

// ---------------------------------------------------------------------------
// C. The cleanup runs during existing export/retrieval operations — never a
//    scheduler or background system.
// ---------------------------------------------------------------------------

describe("cleanup runs during existing operations (source-level)", () => {
  it("runs the cleanup before minting a new export instance", () => {
    const body = functionBody(exportApi, "exportFamilyArchive");
    const pruneIndex = body.indexOf(
      "ExportLib.pruneExpiredExportInstances(exportInstances, exportMediaBindings, Time.now())",
    );
    const mintIndex = body.indexOf("nextExportInstanceRef()");
    expect(pruneIndex).toBeGreaterThan(-1);
    expect(mintIndex).toBeGreaterThan(pruneIndex);
  });

  it("runs the cleanup before resolving a retrieval", () => {
    const body = functionBody(exportApi, "retrieveFamilyArchiveMedia");
    const pruneIndex = body.indexOf(
      "ExportLib.pruneExpiredExportInstances(exportInstances, exportMediaBindings, Time.now())",
    );
    const resolveIndex = body.indexOf("ExportLib.retrieveFamilyArchiveMedia(");
    expect(pruneIndex).toBeGreaterThan(-1);
    expect(resolveIndex).toBeGreaterThan(pruneIndex);
  });

  it("introduces no scheduler or background system", () => {
    // The cleanup is invoked only from the two existing operations; there is no
    // timer, heartbeat, or recurring task anywhere in the export sources.
    const combined = `${exportLib}\n${exportApi}`;
    for (const forbidden of [
      "Timer",
      "setTimer",
      "recurring",
      "heartbeat",
      "schedule",
    ]) {
      expect(combined).not.toContain(forbidden);
    }
  });
});
