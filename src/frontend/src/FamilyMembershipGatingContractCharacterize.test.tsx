import "@testing-library/jest-dom/vitest";
import type { ArchiveItem, ArchiveItemType, SourceRecord } from "@/backend";
import {
  ArchiveItemClassification,
  EvidenceStatus,
  PrivacyLevel,
  SourceStatus,
  SourceType,
} from "@/backend";
import { ExternalBlob } from "@caffeineai/object-storage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
  type SubmitArchiveItemInput,
  useSubmitArchiveItem,
} from "./hooks/useArchiveStorage";
import { type SubmitRecipeInput, useSubmitRecipe } from "./hooks/useRecipes";
import { useCreateSource } from "./hooks/useResearchIntake";
import type { Recipe } from "./types/recipes";

// ---------------------------------------------------------------------------
// Characterization baseline for the family-scoped authorization refactor.
//
// The change makes the backend authorization helpers family-scoped: the
// canonical Steward authority, approved-family membership, and photo/profile
// ownership helpers each take an explicit familyId, and the legacy helpers
// become thin wrappers delegating with DEFAULT_FAMILY_ID ("norwood"). The
// PUBLIC API and its observable default-family behavior must NOT change.
//
// This file freezes the frontend half of the MEMBERSHIP-GATING contract: the
// contribution hooks are the app's consumers of the approved-family-member
// gated public methods, and they must keep calling exactly those methods with
// the same argument shapes and no familyId argument — the default-family call
// the legacy wrapper must keep serving. A refactor that family-qualifies the
// public method signatures, or that changes what the default-family call
// returns, fails here before it reaches a user.
//
// The per-caller authorization rules themselves live in the PocketIC lane,
// because the frontend suite mocks the actor and has no principals at all. This
// is component/integration coverage over a typed local actor mock; it does not
// exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    submitArchiveItem: unknown[][];
    submitRecipe: unknown[][];
    createSource: unknown[][];
  } = {
    submitArchiveItem: [],
    submitRecipe: [],
    createSource: [],
  };

  const mockActor = {
    async submitArchiveItem(...args: unknown[]): Promise<unknown> {
      calls.submitArchiveItem.push(args);
      return null;
    },
    async submitRecipe(...args: unknown[]): Promise<unknown> {
      calls.submitRecipe.push(args);
      return null;
    },
    async createSource(...args: unknown[]): Promise<unknown> {
      calls.createSource.push(args);
      return { __kind__: "ok", ok: {} };
    },
  };

  return {
    mockActor,
    calls,
    resetCalls: () => {
      calls.submitArchiveItem.length = 0;
      calls.submitRecipe.length = 0;
      calls.createSource.length = 0;
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

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("Family-membership gating: contribution hook call contract (characterization)", () => {
  it("useSubmitArchiveItem calls submitArchiveItem with the exact argument order and no familyId", async () => {
    const created = { id: 1n, title: "A letter" } as unknown as ArchiveItem;
    mockActor.submitArchiveItem = vi.fn(async (...args: unknown[]) => {
      calls.submitArchiveItem.push(args);
      return created;
    });

    let mutateAsync: (input: SubmitArchiveItemInput) => Promise<ArchiveItem> =
      async () => created;

    function Probe() {
      mutateAsync = useSubmitArchiveItem().mutateAsync;
      return <div data-testid="probe.value">ready</div>;
    }

    renderWithQueryClient(<Probe />);
    await screen.findByTestId("probe.value");

    const blob = ExternalBlob.fromBytes(
      new Uint8Array([1, 2, 3]),
      "application/pdf",
      "letter.pdf",
    );
    const result = await mutateAsync({
      title: "A letter",
      description: "A letter from 1924.",
      itemType: "Document" as ArchiveItemType,
      mimeType: "application/pdf",
      blob,
      filename: "letter.pdf",
      era: "1924",
      year: 1924n,
      tags: ["letters"],
      relatedMemberIds: ["julia"],
      relatedBranchId: "branch-1",
      sourceStatus: SourceStatus.Original,
      privacyLevel: PrivacyLevel.FamilyOnly,
      classification: ArchiveItemClassification.Standard,
      primarySpeaker: null,
    });

    // The backend method receives the fifteen positional arguments in order and
    // no familyId — the unchanged public signature the change must preserve.
    expect(calls.submitArchiveItem).toEqual([
      [
        "A letter",
        "A letter from 1924.",
        "Document",
        "application/pdf",
        blob,
        "1924",
        1924n,
        ["letters"],
        ["julia"],
        "branch-1",
        SourceStatus.Original,
        PrivacyLevel.FamilyOnly,
        ArchiveItemClassification.Standard,
        null,
        "letter.pdf",
      ],
    ]);
    expect(result).toBe(created);
  });

  it("useSubmitRecipe calls submitRecipe with the exact argument order and no familyId", async () => {
    const created = { id: 2n, title: "A recipe" } as unknown as Recipe;
    mockActor.submitRecipe = vi.fn(async (...args: unknown[]) => {
      calls.submitRecipe.push(args);
      return created;
    });

    let mutateAsync: (input: SubmitRecipeInput) => Promise<Recipe> = async () =>
      created;

    function Probe() {
      mutateAsync = useSubmitRecipe().mutateAsync;
      return <div data-testid="probe.value">ready</div>;
    }

    renderWithQueryClient(<Probe />);
    await screen.findByTestId("probe.value");

    const result = await mutateAsync({
      title: "A recipe",
      shortDescription: "A short description.",
      originatingPersonId: "julia",
      relatedPersonIds: ["julia"],
      era: "1924",
      year: 1924n,
      location: "Norwood",
      familyBranch: "branch-1",
      ingredients: ["flour"],
      instructions: "Mix everything.",
      familyStory: "A story.",
      tags: ["recipes"],
      privacyLevel: PrivacyLevel.FamilyOnly,
      evidenceStatus: EvidenceStatus.FamilyHistory,
      linkedMediaIds: [],
    });

    // The backend method receives the fifteen positional arguments in order and
    // no familyId.
    expect(calls.submitRecipe).toEqual([
      [
        "A recipe",
        "A short description.",
        "julia",
        ["julia"],
        "1924",
        1924n,
        "Norwood",
        "branch-1",
        ["flour"],
        "Mix everything.",
        "A story.",
        ["recipes"],
        PrivacyLevel.FamilyOnly,
        EvidenceStatus.FamilyHistory,
        [],
      ],
    ]);
    expect(result).toBe(created);
  });

  it("useCreateSource calls createSource(title, sourceType, description, archiveItemId) with no familyId", async () => {
    const created = { id: 3n, title: "A source" } as unknown as SourceRecord;
    mockActor.createSource = vi.fn(async (...args: unknown[]) => {
      calls.createSource.push(args);
      return { __kind__: "ok", ok: created };
    });

    let mutateAsync: (input: {
      title: string;
      sourceType: SourceRecord["sourceType"];
      description: string;
      archiveItemId: bigint | null;
    }) => Promise<unknown> = async () => ({ __kind__: "ok", ok: created });

    function Probe() {
      mutateAsync = useCreateSource().mutateAsync;
      return <div data-testid="probe.value">ready</div>;
    }

    renderWithQueryClient(<Probe />);
    await screen.findByTestId("probe.value");

    await mutateAsync({
      title: "A source",
      sourceType: SourceType.CensusCitation,
      description: "A source description.",
      archiveItemId: 7n,
    });

    // The backend method receives exactly the four positional arguments and no
    // familyId — the unchanged public signature the change must preserve.
    expect(calls.createSource).toEqual([
      ["A source", SourceType.CensusCitation, "A source description.", 7n],
    ]);
  });

  it("surfaces the backend family-membership denial unchanged to the caller", async () => {
    // The backend denies a signed-in but unapproved caller with the stable
    // family-membership-required trap. The hook must pass that rejection
    // through without rewriting it, so the page can show the definitive
    // membership-required message.
    const denial = new Error(
      "Family membership required. Claim your family profile and wait for Family Steward approval before contributing family content.",
    );
    mockActor.submitArchiveItem = vi.fn(async (...args: unknown[]) => {
      calls.submitArchiveItem.push(args);
      throw denial;
    });

    let mutateAsync: (input: unknown) => Promise<unknown> = async () =>
      undefined;

    function Probe() {
      mutateAsync = useSubmitArchiveItem().mutateAsync as (
        input: unknown,
      ) => Promise<unknown>;
      return <div data-testid="probe.value">ready</div>;
    }

    renderWithQueryClient(<Probe />);
    await screen.findByTestId("probe.value");

    await expect(
      mutateAsync({
        title: "Denied",
        description: "Denied.",
        itemType: "Document",
        mimeType: "application/pdf",
        blob: ExternalBlob.fromBytes(
          new Uint8Array([1]),
          "application/pdf",
          "denied.pdf",
        ),
        filename: "denied.pdf",
        era: "1924",
        year: null,
        tags: [],
        relatedMemberIds: [],
        relatedBranchId: null,
        sourceStatus: SourceStatus.Original,
        privacyLevel: PrivacyLevel.FamilyOnly,
        classification: ArchiveItemClassification.Standard,
        primarySpeaker: null,
      }),
    ).rejects.toBe(denial);
  });

  it("keeps the contribution hooks idle until a mutation is invoked", async () => {
    // The hooks are mutations, not queries: rendering them must not call the
    // backend. A refactor that turns a contribution hook into an eager query
    // would fire an unauthorized call on mount.
    function Probe() {
      useSubmitArchiveItem();
      useSubmitRecipe();
      useCreateSource();
      return <div data-testid="probe.value">ready</div>;
    }

    renderWithQueryClient(<Probe />);
    await screen.findByTestId("probe.value");

    await waitFor(() => {
      expect(calls.submitArchiveItem).toEqual([]);
      expect(calls.submitRecipe).toEqual([]);
      expect(calls.createSource).toEqual([]);
    });
  });
});
