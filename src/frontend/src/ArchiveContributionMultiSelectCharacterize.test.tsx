import "@testing-library/jest-dom/vitest";
import {
  type ArchiveItem,
  type ArchiveItemClassification,
  ArchiveItemStatus,
  type ArchiveItemType,
  type OralHistorySpeaker,
  type PrivacyLevel,
  type SourceStatus,
} from "@/backend";
import type { ExternalBlob } from "@caffeineai/object-storage";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  configure,
  render,
  screen,
  within,
} from "@testing-library/react";
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

// Characterization baseline for the archive contribution form's "Related family
// members" multi-select and the top navigation structure, both of which the
// upcoming Family Videos & Oral History build must NOT disturb.
//
// The upcoming build adds a Speaker field to the archive contribution form for
// Oral History items. That form already carries a multi-select of related
// family members that follows the Norwood UX rule (immediate checkmark on tap,
// saved selections reopen selected). This baseline freezes that behavior so the
// Speaker-field work cannot regress it.
//
// It also freezes the navigation invariant that Family Archive remains the
// primary archive navigation parent: the new Family Videos & Oral History page
// must be reachable from Family Archive / Home / Person Profiles, NOT as a
// permanent top-level navbar pill. This asserts the current navbar has exactly
// the existing pills and no "Family Videos" pill.

// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const { mockActor, resetArchive, setAuthenticated, getAuthenticated } =
  vi.hoisted(() => {
    let items: ArchiveItem[] = [];
    let nextId = 0n;
    let isAuthenticated = false;

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
        items = [...items, item];
        return item;
      },
      async listPendingArchiveItems(): Promise<ArchiveItem[]> {
        return items.filter((i) => i.status === ArchiveItemStatus.Pending);
      },
      async listApprovedArchiveItems(): Promise<ArchiveItem[]> {
        return items.filter((i) => i.status === ArchiveItemStatus.Approved);
      },
    };

    return {
      mockActor,
      resetArchive: () => {
        items = [];
        nextId = 0n;
        isAuthenticated = false;
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

/** Opens the archive contribution form for a signed-in user. */
async function openContributionForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Add to Our History" }));
  await user.click(screen.getByText("Photo"));
  await screen.findByRole("heading", { name: "Add photo" });
}

/** Returns the related-family-member chip button for a profile id. */
function memberChip(personId: string) {
  return screen.getByRole("button", {
    name: new RegExp(`^${personId}`, "i"),
  });
}

describe("Archive contribution form: Norwood multi-select UX rule", () => {
  it("shows an immediate checkmark on a member chip when tapped", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();
    await openContributionForm(user);

    const julia = memberChip("julia");
    expect(julia).toHaveAttribute("aria-pressed", "false");

    await user.click(julia);
    // Immediate checkmark: the chip is pressed the moment it is tapped.
    expect(julia).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps multiple members selected at the same time", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();
    await openContributionForm(user);

    await user.click(memberChip("julia"));
    await user.click(memberChip("clayton"));
    await user.click(memberChip("isaiah"));

    expect(memberChip("julia")).toHaveAttribute("aria-pressed", "true");
    expect(memberChip("clayton")).toHaveAttribute("aria-pressed", "true");
    expect(memberChip("isaiah")).toHaveAttribute("aria-pressed", "true");
    expect(memberChip("erma")).toHaveAttribute("aria-pressed", "false");
  });

  it("deselects a member on a second tap, leaving others selected", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();
    await openContributionForm(user);

    await user.click(memberChip("julia"));
    await user.click(memberChip("clayton"));
    await user.click(memberChip("julia"));

    expect(memberChip("julia")).toHaveAttribute("aria-pressed", "false");
    expect(memberChip("clayton")).toHaveAttribute("aria-pressed", "true");
  });

  it("submits the selected members with the contribution", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();
    await openContributionForm(user);

    await user.click(memberChip("julia"));
    await user.click(memberChip("clayton"));

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

    const pending = await mockActor.listPendingArchiveItems();
    expect(pending).toHaveLength(1);
    expect(pending[0].relatedMemberIds).toEqual(
      expect.arrayContaining(["julia", "clayton"]),
    );
  });
});

describe("Navigation: Family Archive stays the primary archive parent", () => {
  it("does not add a top-level Family Videos navbar pill", () => {
    renderApp();

    // Scope to the top navigation bar (the <header> that owns the layout nav
    // links), not the home-page hero header or the home-page cards that reuse
    // the same labels.
    const header = screen
      .getByTestId("layout.explore_link")
      .closest("header") as HTMLElement;

    // The existing primary nav pills remain.
    for (const label of [
      "Explore Family",
      "Heritage Branch",
      "Family Archive",
      "Family Stories",
      "Family Mysteries",
      "Travel Through Time",
      "Add Myself",
      "Notifications",
    ]) {
      expect(
        within(header).getByRole("button", { name: label }),
      ).toBeInTheDocument();
    }

    // The new Family Videos & Oral History page must NOT be a top-level pill.
    expect(
      within(header).queryByRole("button", { name: /Family Videos/i }),
    ).not.toBeInTheDocument();
    expect(
      within(header).queryByRole("button", { name: /Oral History/i }),
    ).not.toBeInTheDocument();
  });
});
