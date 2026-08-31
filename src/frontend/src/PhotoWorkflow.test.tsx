import "@testing-library/jest-dom/vitest";
import type { Photo, PhotoId } from "@/backend";
import type { ExternalBlob } from "@caffeineai/object-storage";
import type { Principal } from "@icp-sdk/core/principal";
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

// A stateful in-memory actor shared by every useActor() call in the app. This
// stands in for the real backend so the photo workflow can be exercised end to
// end (add -> list -> set profile -> remove) without a canister.
const { mockActor, resetPhotos } = vi.hoisted(() => {
  const photosByPerson: Record<string, Photo[]> = {};
  const profilePhotoByPerson: Record<string, Photo | null> = {};
  let nextId = 1n;

  const mockActor = {
    async listPhotos(personId: string): Promise<Photo[]> {
      return [...(photosByPerson[personId] ?? [])];
    },
    async getProfilePhoto(personId: string): Promise<Photo | null> {
      return profilePhotoByPerson[personId] ?? null;
    },
    async addPhoto(
      personId: string,
      filename: string,
      mimeType: string,
      blob: ExternalBlob,
    ): Promise<Photo> {
      const photo: Photo = {
        id: nextId++,
        blob,
        mimeType,
        filename,
        uploadedAt: 0n,
        uploadedBy: {} as Principal,
      };
      photosByPerson[personId] = [...(photosByPerson[personId] ?? []), photo];
      return photo;
    },
    async setProfilePhoto(
      personId: string,
      photoId: PhotoId,
    ): Promise<Photo | null> {
      const photo =
        (photosByPerson[personId] ?? []).find((p) => p.id === photoId) ?? null;
      profilePhotoByPerson[personId] = photo;
      return photo;
    },
    async removePhoto(personId: string, photoId: PhotoId): Promise<boolean> {
      const list = photosByPerson[personId] ?? [];
      const index = list.findIndex((p) => p.id === photoId);
      if (index === -1) return false;
      list.splice(index, 1);
      if (profilePhotoByPerson[personId]?.id === photoId) {
        profilePhotoByPerson[personId] = null;
      }
      return true;
    },
  };

  return {
    mockActor,
    resetPhotos: () => {
      for (const key of Object.keys(photosByPerson)) delete photosByPerson[key];
      for (const key of Object.keys(profilePhotoByPerson)) {
        delete profilePhotoByPerson[key];
      }
      nextId = 1n;
    },
  };
});

// Replace useActor with a hook that always returns the in-memory actor. The
// real useActor depends on useInternetIdentity + createActorWithConfig, which
// are not needed for a deterministic photo-workflow test.
vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
}));

afterEach(cleanup);
beforeEach(resetPhotos);

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

async function openProfile(
  user: ReturnType<typeof userEvent.setup>,
  personCardName: RegExp,
) {
  await user.click(screen.getByRole("button", { name: "Explore the Family" }));
  await user.click(screen.getByRole("button", { name: personCardName }));
}

async function uploadPhoto(
  user: ReturnType<typeof userEvent.setup>,
  filename: string,
) {
  const input = document.querySelector(
    '[data-ocid="profile.add_photo_input"]',
  ) as HTMLInputElement;
  const file = new File(["fake-image-bytes"], filename, { type: "image/png" });
  await user.upload(input, file);
}

function completenessPercent(): string {
  const container = document.querySelector(
    '[data-ocid="profile.completeness"]',
  );
  const pill = container?.querySelector(".completeness-pill");
  return pill?.textContent ?? "";
}

describe("Photo workflow", () => {
  it("adds a photo to the gallery", async () => {
    const user = userEvent.setup();
    renderApp();
    await openProfile(user, /Julia/);

    // The gallery starts empty.
    expect(
      screen.getByText("No photos have been added yet."),
    ).toBeInTheDocument();

    await uploadPhoto(user, "julia-1.png");

    // The uploaded photo appears in the gallery with its filename as alt text.
    expect(
      await screen.findByText("1 photo in the gallery."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "julia-1.png" }),
    ).toBeInTheDocument();
  });

  it("shows multiple photos in the gallery", async () => {
    const user = userEvent.setup();
    renderApp();
    await openProfile(user, /Julia/);

    await uploadPhoto(user, "julia-1.png");
    await uploadPhoto(user, "julia-2.png");

    expect(
      await screen.findByText("2 photos in the gallery."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "julia-1.png" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "julia-2.png" }),
    ).toBeInTheDocument();
  });

  it("sets a photo as the profile photo, updating the header and the tree card", async () => {
    const user = userEvent.setup();
    renderApp();
    await openProfile(user, /Julia/);

    await uploadPhoto(user, "julia-1.png");
    await screen.findByRole("img", { name: "julia-1.png" });

    // Set the uploaded photo as the profile photo.
    await user.click(
      screen.getByRole("button", { name: "Set as Profile Photo" }),
    );

    // The profile header now shows the uploaded photo instead of the default
    // portrait.
    expect(
      await screen.findByRole("img", {
        name: "Julia “Julie” Norwood's profile photo",
      }),
    ).toBeInTheDocument();

    // Navigate back to the tree: Julia's card now shows the uploaded photo.
    await user.click(
      screen.getByRole("button", { name: /Back to Family Tree/ }),
    );
    // The tree card's <img> is wrapped in an aria-hidden span (decorative), so
    // it is not reachable via the accessibility tree. Query it directly via the
    // DOM instead.
    const treeCardImg = document.querySelector(
      '[data-ocid="tree.person.1"] img',
    ) as HTMLImageElement;
    expect(treeCardImg).not.toBeNull();
    expect(treeCardImg.src).toMatch(/^blob:mock-/);
    expect(treeCardImg.alt).toBe("Julia “Julie” Norwood's profile photo");
  });

  it("removing all photos restores the initials placeholder and updates completeness", async () => {
    const user = userEvent.setup();
    renderApp();
    await openProfile(user, /Clayton Child/);

    // Clayton's default portrait is a placeholder, so the Photo field is not
    // complete until a profile photo is uploaded.
    expect(completenessPercent()).toBe("71%");

    // Upload a photo and set it as the profile photo.
    await uploadPhoto(user, "clayton-1.png");
    await screen.findByRole("img", { name: "clayton-1.png" });
    await user.click(
      screen.getByRole("button", { name: "Set as Profile Photo" }),
    );

    // The Photo field is now complete.
    expect(await screen.findByText("86%")).toBeInTheDocument();

    // Remove the photo — the profile photo is cleared.
    await user.click(
      screen.getByRole("button", { name: "Remove clayton-1.png" }),
    );

    // The gallery returns to the empty state and completeness drops back.
    expect(
      await screen.findByText("No photos have been added yet."),
    ).toBeInTheDocument();
    expect(completenessPercent()).toBe("71%");

    // Back on the tree, Clayton's card falls back to the initials placeholder.
    await user.click(
      screen.getByRole("button", { name: /Back to Family Tree/ }),
    );
    const childrenSection = screen.getByRole("region", { name: "Children" });
    const clayton = within(childrenSection).getByRole("button", {
      name: /Clayton/,
    });
    expect(clayton).toHaveTextContent("C");
  });
});
