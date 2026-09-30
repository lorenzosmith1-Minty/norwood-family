import "@testing-library/jest-dom/vitest";
import {
  ArchiveItemClassification,
  PrivacyLevel,
  type Result_32,
  type SourceRecord,
  SourceType,
} from "@/backend";
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
// Cover for the non-upload Research Source creation family routing.
//
// The accepted change makes NON-UPLOAD source creation family-aware:
//
//   - the default family keeps the legacy `createSource(title, sourceType,
//     description, archiveItemId)` path with exactly four positional arguments
//     and no familyId;
//   - a non-default family calls
//     `createSourceForFamily(activeFamilyId, title, sourceType, description,
//     archiveItemId)` with the active family id first and the same payload
//     after it;
//   - the active family id is read from the centralized FamilyContext and
//     passed through unchanged;
//   - upload-backed creation (`createSourceWithUpload` /
//     `createSourceWithUploadForFamily`) is unchanged.
//
// This file asserts the accepted behavior directly. The default-family legacy
// shape and the upload fork are also frozen by
// ResearchSourceCreateFamilyRoutingCharacterize.test.tsx; the assertions here
// re-check them as the "must remain unchanged" half of the same contract.
//
// This is component/integration coverage over a typed local actor mock. It
// proves the frontend consumer contract — which endpoint each hook calls and
// with which arguments — and does not exercise the real canister (see
// coverageLimits).
// ---------------------------------------------------------------------------

const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    createSource: unknown[][];
    createSourceForFamily: unknown[][];
    createSourceWithUpload: unknown[][];
    createSourceWithUploadForFamily: unknown[][];
  } = {
    createSource: [],
    createSourceForFamily: [],
    createSourceWithUpload: [],
    createSourceWithUploadForFamily: [],
  };

  const mockActor = {
    async createSource(...args: unknown[]): Promise<unknown> {
      calls.createSource.push(args);
      return { __kind__: "ok", ok: {} };
    },
    async createSourceForFamily(...args: unknown[]): Promise<unknown> {
      calls.createSourceForFamily.push(args);
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
      calls.createSourceForFamily.length = 0;
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

function makeSource(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    familyId: FAMILY_A,
    id: 1n,
    title: "A source",
    sourceType: SourceType.CensusCitation,
    description: "A source description.",
    archiveItemId: 7n,
    contributor: undefined as unknown as SourceRecord["contributor"],
    status: undefined as unknown as SourceRecord["status"],
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
    ...overrides,
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

describe("useCreateSource: non-default family routes to createSourceForFamily (cover)", () => {
  it("Family A calls createSourceForFamily('test-family-a', ...) with the active id first", async () => {
    const { result } = renderHook(() => useCreateSource(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    await result.current.mutateAsync({
      title: "A source",
      sourceType: SourceType.CensusCitation,
      description: "A source description.",
      archiveItemId: 7n,
    });

    expect(calls.createSourceForFamily).toEqual([
      [
        FAMILY_A,
        "A source",
        SourceType.CensusCitation,
        "A source description.",
        7n,
      ],
    ]);
    // The legacy path must NOT be used for a non-default family.
    expect(calls.createSource).toEqual([]);
  });

  it("Family B calls createSourceForFamily('test-family-b', ...) with the active id first", async () => {
    const { result } = renderHook(() => useCreateSource(), {
      wrapper: wrapperFor(FAMILY_B),
    });

    await result.current.mutateAsync({
      title: "B source",
      sourceType: SourceType.ResearchNotes,
      description: "B source description.",
      archiveItemId: null,
    });

    expect(calls.createSourceForFamily).toEqual([
      [
        FAMILY_B,
        "B source",
        SourceType.ResearchNotes,
        "B source description.",
        null,
      ],
    ]);
    expect(calls.createSource).toEqual([]);
  });

  it("passes the active family id through unchanged and never hard-codes a family", async () => {
    const { result } = renderHook(() => useCreateSource(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    await result.current.mutateAsync({
      title: "A source",
      sourceType: SourceType.CensusCitation,
      description: "A source description.",
      archiveItemId: 7n,
    });

    // The first argument is exactly the FamilyContext value, not a literal.
    expect(calls.createSourceForFamily[0][0]).toBe(FAMILY_A);
    expect(calls.createSourceForFamily[0][0]).not.toBe(DEFAULT_FAMILY_ID);
  });

  it("surfaces the backend #err result unchanged on the non-default path", async () => {
    const denial: Result_32 = {
      __kind__: "err",
      err: { __kind__: "notAuthorized", notAuthorized: null },
    };
    mockActor.createSourceForFamily = vi.fn(async (...args: unknown[]) => {
      calls.createSourceForFamily.push(args);
      return denial;
    });

    const { result } = renderHook(() => useCreateSource(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    const returned = await result.current.mutateAsync({
      title: "Denied source",
      sourceType: SourceType.CensusCitation,
      description: "Denied.",
      archiveItemId: null,
    });

    expect(returned).toBe(denial);
  });
});

describe("useCreateSource: default family keeps the legacy path (cover)", () => {
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
    expect(calls.createSourceForFamily).toEqual([]);
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
    expect(calls.createSourceForFamily).toEqual([]);
  });

  it("returns the created source from the legacy path unchanged", async () => {
    const created = makeSource({ id: 3n });
    mockActor.createSource = vi.fn(async (...args: unknown[]) => {
      calls.createSource.push(args);
      return { __kind__: "ok", ok: created } satisfies Result_32;
    });

    const { result } = renderHook(() => useCreateSource(), {
      wrapper: wrapperFor(DEFAULT_FAMILY_ID),
    });

    const returned = await result.current.mutateAsync({
      title: "A source",
      sourceType: SourceType.CensusCitation,
      description: "A source description.",
      archiveItemId: 7n,
    });

    expect(returned).toEqual({ __kind__: "ok", ok: created });
  });
});

describe("useCreateSourceWithUpload: upload-backed creation stays unchanged (cover)", () => {
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
});
