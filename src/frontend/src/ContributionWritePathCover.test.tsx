import "@testing-library/jest-dom/vitest";
import {
  type ArchiveItem,
  ArchiveItemClassification,
  ArchiveItemStatus,
  ArchiveItemType,
  type OralHistorySpeaker,
  PrivacyLevel,
  SourceStatus,
} from "@/backend";
import { ExternalBlob } from "@caffeineai/object-storage";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, configure, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import App from "./App";

// Cover for the contribution write-path repair: success must only be shown
// after the backend confirms durable storage. The archive contribution form
// drives useSubmitArchiveItem, whose mutationFn awaits actor.submitArchiveItem
// and whose onSuccess flips the form into the "Contribution submitted"
// confirmation. This test freezes that contract: while the backend call is
// still in flight (not yet durably stored), the form must NOT show the success
// screen; the confirmation appears only once the backend resolves.
//
// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const { mockActor, resetArchive, setAuthenticated, getAuthenticated } =
  vi.hoisted(() => {
    let isAuthenticated = false;
    let nextId = 0n;

    const mockActor = {
      async isCallerAdmin(): Promise<boolean> {
        return false;
      },
      async submitArchiveItem(
        title: string,
        description: string,
        itemType: ArchiveItemType,
        blob: ExternalBlob,
        era: string,
        year: bigint | null,
        tags: string[],
        relatedMemberIds: string[],
        relatedBranchId: string | null,
        sourceStatus: SourceStatus,
        privacyLevel: PrivacyLevel,
        classification: ArchiveItemClassification,
        primarySpeaker: OralHistorySpeaker | null,
      ): Promise<ArchiveItem> {
        const item: ArchiveItem = {
          id: nextId++,
          title,
          description,
          itemType,
          blob,
          era,
          year: year ?? undefined,
          tags,
          relatedMemberIds,
          relatedBranchId: relatedBranchId ?? undefined,
          sourceStatus,
          privacyLevel,
          classification,
          primarySpeaker: primarySpeaker ?? undefined,
          status: ArchiveItemStatus.Pending,
          createdAt: 1_700_000_000_000_000_000n,
          contributor: Principal.fromText("aaaaa-aa"),
        };
        return item;
      },
      async listPendingArchiveItems(): Promise<ArchiveItem[]> {
        return [];
      },
      async listApprovedArchiveItems(): Promise<ArchiveItem[]> {
        return [];
      },
    };

    return {
      mockActor,
      resetArchive: () => {
        isAuthenticated = false;
        nextId = 0n;
      },
      setAuthenticated: (value: boolean) => {
        isAuthenticated = value;
      },
      getAuthenticated: () => isAuthenticated,
    };
  });

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: getAuthenticated(),
    login: () => {},
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

afterEach(cleanup);
beforeEach(resetArchive);

beforeAll(() => {
  // jsdom does not implement URL.createObjectURL, which ExternalBlob.fromBytes
  // relies on when a file is uploaded. Provide a deterministic stand-in.
  let counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${counter++}`);

  // jsdom's File does not implement Blob.prototype.arrayBuffer, which the
  // upload path uses to read the file bytes. Polyfill it via FileReader so the
  // workflow can be exercised end to end in the test environment.
  if (typeof File.prototype.arrayBuffer !== "function") {
    File.prototype.arrayBuffer = function arrayBuffer(): Promise<ArrayBuffer> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
      });
    };
  }
});

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

async function openContributionForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Add to Our History" }));
  await user.click(screen.getByText("Photo"));
  await screen.findByRole("heading", { name: "Add photo" });
}

describe("Contribution write path: success only after durable storage", () => {
  it("does not show the success confirmation while the backend call is in flight, then shows it once the backend resolves", async () => {
    setAuthenticated(true);

    // Defer the backend's submitArchiveItem so we can observe the pending
    // state before durable storage is confirmed.
    let resolveSubmit!: (item: ArchiveItem) => void;
    const deferred = new Promise<ArchiveItem>((resolve) => {
      resolveSubmit = resolve;
    });
    const originalSubmit = mockActor.submitArchiveItem.bind(mockActor);
    mockActor.submitArchiveItem = vi.fn(async (_args) => {
      return deferred;
    });

    const user = userEvent.setup();
    renderApp();
    await openContributionForm(user);

    const input = document.querySelector(
      '[data-ocid="archive.form.file_input"]',
    ) as HTMLInputElement;
    const file = new File(["fake-photo-bytes"], "wedding.png", {
      type: "image/png",
    });
    await user.upload(input, file);
    await user.type(screen.getByLabelText("Title"), "Wedding portrait");

    await user.click(
      screen.getByRole("button", { name: "Submit for approval" }),
    );

    // The backend has not yet confirmed durable storage, so the success
    // confirmation must NOT be shown.
    expect(
      screen.queryByRole("heading", { name: "Contribution submitted" }),
    ).not.toBeInTheDocument();

    // The backend confirms durable storage by resolving the write.
    resolveSubmit(
      await originalSubmit(
        "Wedding portrait",
        "",
        ArchiveItemType.Photo,
        ExternalBlob.fromBytes(
          new Uint8Array([1, 2, 3]),
          "image/png",
          "wedding.png",
        ),
        "",
        null,
        [],
        [],
        null,
        SourceStatus.Unverified,
        PrivacyLevel.FamilyOnly,
        ArchiveItemClassification.Standard,
        null,
      ),
    );

    // Only now does the success confirmation appear.
    expect(
      await screen.findByRole("heading", { name: "Contribution submitted" }),
    ).toBeInTheDocument();
  });
});
