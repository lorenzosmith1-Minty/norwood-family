import "@testing-library/jest-dom/vitest";
import {
  type ExportEnvelope,
  ExportFormat,
  type ExportMetadata,
  ExportScope,
} from "@/backend";
import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Phase 5D — post-retrieval ZIP-size cap (repaired contract).
//
// `assembleArchiveZip` checks the PRODUCED ZIP against `MAX_BUNDLE_ZIP_BYTES`
// after compression and throws `BundleTooLargeError` when it is exceeded, so an
// archive whose known sizes passed the preflight but whose assembled ZIP is
// still too large surfaces the neutral "too large for one bundle" outcome
// rather than a generic failure. No partial ZIP is returned.
//
// The real cap is 288 MiB, which is impractical to allocate in a unit test, so
// this file mocks the centralized limits module down to a tiny cap and asserts
// the branch directly. The mock is scoped to this file only; the sibling
// ExportBundleCover.test.ts exercises the real limits.
// ---------------------------------------------------------------------------

vi.mock("@/lib/archiveBundleLimits", () => ({
  MAX_BUNDLE_ASSET_COUNT: 500,
  MAX_BUNDLE_TOTAL_BYTES: 256 * 1024 * 1024,
  MAX_BUNDLE_SINGLE_FILE_BYTES: 64 * 1024 * 1024,
  // A deliberately tiny ZIP cap so a small incompressible payload trips it.
  MAX_BUNDLE_ZIP_BYTES: 16,
  BUNDLE_TOO_LARGE_MESSAGE:
    "This archive is too large for one bundle. The JSON-only download is still available.",
}));

import { BundleTooLargeError, assembleArchiveZip } from "@/lib/archiveBundle";
import { BUNDLE_TOO_LARGE_MESSAGE } from "@/lib/archiveBundleLimits";

function makeEnvelope(payload: unknown): ExportEnvelope {
  const metadata: ExportMetadata = {
    generatedAt: 1_700_000_000_000_000_000n,
    scope: ExportScope.FamilyArchive,
    sourceAppName: "Norwood",
    schemaVersion: 1n,
    sourceAppVersion: "1.0.0",
    familyRef: "Norwood",
    format: ExportFormat.JSON,
  };
  return { metadata, payloadJson: JSON.stringify(payload) };
}

describe("assembleArchiveZip post-retrieval ZIP-size cap", () => {
  it("throws BundleTooLargeError with the neutral message when the produced ZIP exceeds the cap", () => {
    // Incompressible bytes so the produced ZIP is comfortably larger than the
    // mocked 16-byte cap.
    const bytes = new Uint8Array(4096);
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = (i * 131 + 7) % 256;
    }

    let thrown: unknown;
    try {
      assembleArchiveZip({
        envelope: makeEnvelope({ persons: [] }),
        media: [{ mediaRef: "media-1", path: "media/photo.bin", bytes }],
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BundleTooLargeError);
    expect((thrown as Error).message).toBe(BUNDLE_TOO_LARGE_MESSAGE);
    // The neutral message exposes no internal ids or backend detail.
    expect((thrown as Error).message).not.toMatch(
      /media-\d|principal|storage/i,
    );
  });
});
