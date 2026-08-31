import "@testing-library/jest-dom/vitest";
import {
  type ArchiveItem,
  ArchiveItemStatus,
  ArchiveItemType,
  PrivacyLevel,
  SourceStatus,
} from "@/backend";
import { ExternalBlob } from "@caffeineai/object-storage";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
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

// A stateful in-memory actor standing in for the real backend so the archive
// contribution and admin-approval journeys can be exercised end to end without
// a canister. It implements the archive methods the app's hooks call.
const {
  mockActor,
  resetArchive,
  setAdmin,
  setAuthenticated,
  getAuthenticated,
} = vi.hoisted(() => {
  let items: ArchiveItem[] = [];
  let nextId = 0n;
  let isAdmin = false;
  let isAuthenticated = false;

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return isAdmin;
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
        status: ArchiveItemStatus.Pending,
        createdAt: 1_700_000_000_000_000_000n,
        contributor: Principal.fromText("aaaaa-aa"),
      };
      items = [...items, item];
      return item;
    },
    async listPendingArchiveItems(): Promise<ArchiveItem[]> {
      return items.filter((i) => i.status === ArchiveItemStatus.Pending);
    },
    async listApprovedArchiveItems(): Promise<ArchiveItem[]> {
      return items.filter((i) => i.status === ArchiveItemStatus.Approved);
    },
    async approveArchiveItem(id: bigint): Promise<ArchiveItem | null> {
      const found = items.find((i) => i.id === id);
      if (!found || found.status !== ArchiveItemStatus.Pending) return null;
      const updated = { ...found, status: ArchiveItemStatus.Approved };
      items = items.map((i) => (i.id === id ? updated : i));
      return updated;
    },
    async rejectArchiveItem(id: bigint): Promise<ArchiveItem | null> {
      const found = items.find((i) => i.id === id);
      if (!found || found.status !== ArchiveItemStatus.Pending) return null;
      const updated = { ...found, status: ArchiveItemStatus.Rejected };
      items = items.map((i) => (i.id === id ? updated : i));
      return updated;
    },
  };

  return {
    mockActor,
    resetArchive: () => {
      items = [];
      nextId = 0n;
      isAdmin = false;
      isAuthenticated = false;
    },
    setAdmin: (value: boolean) => {
      isAdmin = value;
    },
    setAuthenticated: (value: boolean) => {
      isAuthenticated = value;
    },
    getAuthenticated: () => isAuthenticated,
  };
});

// Replace the provider seam with the in-memory actor and a controllable
// authentication state. The real useActor/useInternetIdentity depend on an
// InternetIdentityProvider, which is not needed for a deterministic test.
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

async function openAddToHistory(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Add to Our History" }));
}

describe("Archive contribution: anonymous sign-in gate", () => {
  it("prompts an anonymous user to sign in before contributing", async () => {
    const user = userEvent.setup();
    renderApp();

    await openAddToHistory(user);

    expect(
      screen.getByRole("heading", { name: "Sign in to add to our history" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    // The eight type choices are not shown until the user is signed in.
    expect(
      screen.queryByRole("button", { name: /Add Photo/ }),
    ).not.toBeInTheDocument();
  });
});

describe("Archive contribution: signed-in flow", () => {
  it("offers all eight contribution types to a signed-in user", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();

    await openAddToHistory(user);

    expect(
      screen.getByRole("heading", { name: "What would you like to share?" }),
    ).toBeInTheDocument();
    for (const label of [
      "Photo",
      "Document",
      "Audio",
      "Video",
      "Written Story or Note",
      "Research",
      "Work or Business Material",
      "Other",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("submits a file-based contribution and shows the pending confirmation", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();

    await openAddToHistory(user);
    await user.click(screen.getByText("Photo"));

    // A file-based type requires choosing a file.
    const input = document.querySelector(
      '[data-ocid="archive.form.file_input"]',
    ) as HTMLInputElement;
    const file = new File(["fake-photo-bytes"], "wedding.png", {
      type: "image/png",
    });
    await user.upload(input, file);
    expect(await screen.findByText("wedding.png")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Title"), "Wedding portrait");
    await user.type(
      screen.getByLabelText("Description"),
      "The couple on their wedding day.",
    );
    await user.type(
      screen.getByLabelText("Date or approximate era"),
      "circa 1920s",
    );
    await user.type(screen.getByLabelText("Tags"), "wedding, 1920s");

    await user.click(
      screen.getByRole("button", { name: "Submit for approval" }),
    );

    // Confirmation screen: the item is pending, not yet in the archive.
    expect(
      await screen.findByRole("heading", {
        name: "Contribution submitted",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/awaiting admin approval/)).toBeInTheDocument();

    // The submitted item is pending and not approved.
    const pending = await mockActor.listPendingArchiveItems();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      title: "Wedding portrait",
      itemType: ArchiveItemType.Photo,
      status: ArchiveItemStatus.Pending,
    });
    expect(await mockActor.listApprovedArchiveItems()).toEqual([]);
  });

  it("requires a file before a file-based contribution can be submitted", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();

    await openAddToHistory(user);
    await user.click(screen.getByText("Document"));

    await user.type(screen.getByLabelText("Title"), "A letter");
    await user.click(
      screen.getByRole("button", { name: "Submit for approval" }),
    );

    expect(
      await screen.findByText(
        "Please choose a file to upload before submitting.",
      ),
    ).toBeInTheDocument();
    expect(await mockActor.listPendingArchiveItems()).toEqual([]);
  });

  it("submits a written story/note as text without a file upload", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();

    await openAddToHistory(user);
    await user.click(screen.getByText("Written Story or Note"));

    // No file input is shown for the written story/note type.
    expect(
      document.querySelector('[data-ocid="archive.form.file_input"]'),
    ).toBeNull();

    await user.type(
      screen.getByLabelText("Your story or note"),
      "Grandma's recipe for Sunday dinner.",
    );
    await user.type(screen.getByLabelText("Title"), "Sunday dinner");
    await user.click(
      screen.getByRole("button", { name: "Submit for approval" }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "Contribution submitted",
      }),
    ).toBeInTheDocument();
    const pending = await mockActor.listPendingArchiveItems();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      title: "Sunday dinner",
      itemType: ArchiveItemType.WrittenStoryNote,
      status: ArchiveItemStatus.Pending,
    });
  });
});

describe("Admin approval flow", () => {
  it("shows the admin link only to an admin and lists pending contributions", async () => {
    setAuthenticated(true);
    setAdmin(true);
    const user = userEvent.setup();
    renderApp();

    // Seed one pending item through the actor.
    await mockActor.submitArchiveItem(
      "A family letter",
      "A letter from 1924.",
      ArchiveItemType.Document,
      ExternalBlob.fromBytes(
        new Uint8Array([1, 2, 3]),
        "text/plain",
        "letter.txt",
      ),
      "1924",
      null,
      ["letters"],
      ["julia"],
      null,
      SourceStatus.Original,
      PrivacyLevel.FamilyOnly,
    );

    await user.click(
      await screen.findByRole("button", { name: "Pending Contributions" }),
    );

    expect(
      screen.getByRole("heading", { name: "Pending Contributions" }),
    ).toBeInTheDocument();
    expect(screen.getByText("A family letter")).toBeInTheDocument();
    expect(screen.getByText("Document")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("approves a pending contribution, moving it into the archive", async () => {
    setAuthenticated(true);
    setAdmin(true);
    const user = userEvent.setup();
    renderApp();

    const submitted = await mockActor.submitArchiveItem(
      "A family letter",
      "A letter from 1924.",
      ArchiveItemType.Document,
      ExternalBlob.fromBytes(
        new Uint8Array([1, 2, 3]),
        "text/plain",
        "letter.txt",
      ),
      "1924",
      null,
      ["letters"],
      ["julia"],
      null,
      SourceStatus.Original,
      PrivacyLevel.FamilyOnly,
    );

    await user.click(
      await screen.findByRole("button", { name: "Pending Contributions" }),
    );
    await user.click(screen.getByRole("button", { name: "Approve" }));

    // The item leaves the pending list and joins the approved archive.
    expect(await mockActor.listPendingArchiveItems()).toEqual([]);
    const approved = await mockActor.listApprovedArchiveItems();
    expect(approved).toHaveLength(1);
    expect(approved[0]).toMatchObject({
      id: submitted.id,
      status: ArchiveItemStatus.Approved,
    });
  });

  it("rejects a pending contribution, excluding it from the archive", async () => {
    setAuthenticated(true);
    setAdmin(true);
    const user = userEvent.setup();
    renderApp();

    const submitted = await mockActor.submitArchiveItem(
      "Duplicate photo",
      "Already in the archive.",
      ArchiveItemType.Photo,
      ExternalBlob.fromBytes(new Uint8Array([9]), "image/png", "dup.png"),
      "1920s",
      null,
      [],
      [],
      null,
      SourceStatus.Copy,
      PrivacyLevel.Public,
    );

    await user.click(
      await screen.findByRole("button", { name: "Pending Contributions" }),
    );
    await user.click(screen.getByRole("button", { name: "Reject" }));

    // The item is rejected and excluded from both pending and approved lists.
    expect(await mockActor.listPendingArchiveItems()).toEqual([]);
    expect(await mockActor.listApprovedArchiveItems()).toEqual([]);
    expect(submitted.status).toBe(ArchiveItemStatus.Pending);
  });

  it("shows an empty state when there are no pending contributions", async () => {
    setAuthenticated(true);
    setAdmin(true);
    const user = userEvent.setup();
    renderApp();

    await user.click(
      await screen.findByRole("button", { name: "Pending Contributions" }),
    );

    expect(
      screen.getByRole("heading", { name: "Nothing awaiting review" }),
    ).toBeInTheDocument();
  });
});
