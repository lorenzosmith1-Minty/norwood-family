import "@testing-library/jest-dom/vitest";
import { ArchiveItemClassification, PrivacyLevel, SourceType } from "@/backend";
import { DEFAULT_FAMILY_ID, FamilyProvider } from "@/context/FamilyContext";
import { ExternalBlob } from "@caffeineai/object-storage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  type CreateSourceWithUploadInput,
  useCreateSource,
  useCreateSourceWithUpload,
} from "./hooks/useResearchIntake";

// ---------------------------------------------------------------------------
// Characterization baseline for the family-routing of Research Source creation.
//
// The requested change makes NON-UPLOAD source creation family-aware: the
// default family keeps the legacy `createSource(...)` path, and a non-default
// family routes to `createSourceForFamily(activeFamilyId, ...)` with the
// existing payload and UX preserved. Upload-backed creation
// (`createSourceWithUpload` / `createSourceWithUploadForFamily`) must remain
// UNCHANGED.
//
// This file freezes the ADJACENT behavior the change must not disturb:
//
//   1. `useCreateSourceWithUpload` keeps its existing family fork exactly:
//      the default family calls `createSourceWithUpload(...)` with the 13
//      positional payload arguments and no familyId, and a non-default family
//      calls `createSourceWithUploadForFamily(activeFamilyId, ...)` with the
//      active family id first and the same 13 payload arguments after it.
//
//   2. The active family id is read from the centralized FamilyContext and
//      passed through unchanged: Family A and Family B each route to their own
//      id, and the default family never sends a familyId.
//
//   3. The non-upload `useCreateSource` default-family path keeps calling the
//      legacy `createSource(title, sourceType, description, archiveItemId)`
//      with exactly four positional arguments and no familyId.
//
// It deliberately does NOT freeze the current non-default `useCreateSource`
// behavior (which still calls the legacy `createSource`): routing that branch
// to `createSourceForFamily` is exactly the change under way, so asserting the
// old shape would pin the bug. The non-default `useCreateSource` branch is
// covered by the change's own cover, not here.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract — it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    createSource: unknown[][];
    createSourceWithUpload: unknown[][];
    createSourceWithUploadForFamily: unknown[][];
  } = {
    createSource: [],
    createSourceWithUpload: [],
    createSourceWithUploadForFamily: [],
  };

  const mockActor = {
    async createSource(...args: unknown[]): Promise<unknown> {
      calls.createSource.push(args);
      return { __kind__: "ok", ok: {} };
    },
    async createSourceWithUpload(...args: unknown[]): Promise<unknown> {
      calls.createSourceWithUpload.push(args);
      return { __kind__: "ok", ok: {} };
    },
    async createSourceWithUploadForFamily(
      ...args: unknown[]
    ): Promise<unknown> {
      calls.createSourceWithUploadForFamily.push(args);
      return { __kind__: "ok", ok: {} };
    },
  };

  return {
    mockActor,
    calls,
    resetCalls: () => {
      calls.createSource.length = 0;
      calls.createSourceWithUpload.length = 0;
      calls.createSourceWithUploadForFamily.length = 0;
    },
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
}));

afterEach(cleanup);
beforeEach(resetCalls);

beforeAll(() => {
  // jsdom does not implement URL.createObjectURL, which ExternalBlob.fromBytes
  // relies on when a blob is constructed. Provide a deterministic stand-in.
  let counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${counter++}`);
});

function wrapperFor(familyId?: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    return (
      <QueryClientProvider client={queryClient}>
        <FamilyProvider familyId={familyId}>{children}</FamilyProvider>
      </QueryClientProvider>
    );
  };
}

// Built lazily: `ExternalBlob.fromBytes` needs `URL.createObjectURL`, which is
// installed in `beforeAll` and is not available at module-evaluation time.
function makeUploadInput(): CreateSourceWithUploadInput {
  return {
    title: "1900 census",
    sourceType: SourceType.CensusCitation,
    description: "Census record.",
    mimeType: "image/png",
    blob: ExternalBlob.fromBytes(
      new Uint8Array([4, 5, 6]),
      "application/pdf",
      "census.pdf",
    ),
    filename: "census.pdf",
    tags: ["census"],
    era: "1900",
    year: 1900n,
    relatedMemberIds: ["julia"],
    privacyLevel: PrivacyLevel.FamilyOnly,
    classification: ArchiveItemClassification.Standard,
    primarySpeaker: null,
  };
}

/** The 13 payload arguments, in the exact order the hook forwards them. */
function expectedUploadPayload(input: CreateSourceWithUploadInput): unknown[] {
  return [
    input.title,
    input.sourceType,
    input.description,
    input.mimeType,
    input.blob,
    input.tags,
    input.era,
    input.year,
    input.relatedMemberIds,
    input.privacyLevel,
    input.classification,
    input.primarySpeaker,
    input.filename,
  ];
}

describe("useCreateSourceWithUpload: family fork stays unchanged (characterization)", () => {
  it("default family calls createSourceWithUpload with the 13 payload args and no familyId", async () => {
    const input = makeUploadInput();
    const { result } = renderHook(() => useCreateSourceWithUpload(), {
      wrapper: wrapperFor(DEFAULT_FAMILY_ID),
    });

    await result.current.mutateAsync(input);

    expect(calls.createSourceWithUpload).toEqual([
      expectedUploadPayload(input),
    ]);
    expect(calls.createSourceWithUploadForFamily).toEqual([]);
  });

  it("Family A calls createSourceWithUploadForFamily('test-family-a', ...) with the active id first", async () => {
    const input = makeUploadInput();
    const { result } = renderHook(() => useCreateSourceWithUpload(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    await result.current.mutateAsync(input);

    expect(calls.createSourceWithUploadForFamily).toEqual([
      [FAMILY_A, ...expectedUploadPayload(input)],
    ]);
    expect(calls.createSourceWithUpload).toEqual([]);
  });

  it("Family B calls createSourceWithUploadForFamily('test-family-b', ...) with the active id first", async () => {
    const input = makeUploadInput();
    const { result } = renderHook(() => useCreateSourceWithUpload(), {
      wrapper: wrapperFor(FAMILY_B),
    });

    await result.current.mutateAsync(input);

    expect(calls.createSourceWithUploadForFamily).toEqual([
      [FAMILY_B, ...expectedUploadPayload(input)],
    ]);
    expect(calls.createSourceWithUpload).toEqual([]);
  });
});

describe("useCreateSource: default-family legacy path stays unchanged (characterization)", () => {
  it("default family calls createSource(title, sourceType, description, archiveItemId) with no familyId", async () => {
    const { result } = renderHook(() => useCreateSource(), {
      wrapper: wrapperFor(DEFAULT_FAMILY_ID),
    });

    await result.current.mutateAsync({
      title: "A source",
      sourceType: SourceType.CensusCitation,
      description: "A source description.",
      archiveItemId: 7n,
    });

    expect(calls.createSource).toEqual([
      ["A source", SourceType.CensusCitation, "A source description.", 7n],
    ]);
  });

  it("passes a null archiveItemId through unchanged on the default-family path", async () => {
    const { result } = renderHook(() => useCreateSource(), {
      wrapper: wrapperFor(DEFAULT_FAMILY_ID),
    });

    await result.current.mutateAsync({
      title: "Unlinked source",
      sourceType: SourceType.ResearchNotes,
      description: "No archive link.",
      archiveItemId: null,
    });

    expect(calls.createSource).toEqual([
      ["Unlinked source", SourceType.ResearchNotes, "No archive link.", null],
    ]);
  });
});
