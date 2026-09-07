import "@testing-library/jest-dom/vitest";
import type { Photo, PhotoId } from "@/backend";
import { ExternalBlob } from "@caffeineai/object-storage";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, configure, render } from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { useEnsureLorenzoProfilePhoto } from "./hooks/usePhotoStorage";

// Cover for the frontend photo-bootstrap branch the production change added:
// on first load, when the canonical lorenzoSmithJr profile has no selected
// profile photo, the app uploads a real bundled portrait to object storage and
// sets it as the profile photo (idempotent, best-effort) so the canonical
// resolver (useCanonicalPerson -> useProfilePhoto) finds it and every card
// surface renders the real photo instead of a broken placeholder.
//
// The accepted behavior covered here:
//
//  1. When lorenzoSmithJr has no profile photo, the hook uploads the bundled
//     portrait (addPhoto) and sets it as the profile photo (setProfilePhoto).
//  2. Idempotency: when lorenzoSmithJr already has a profile photo, the hook
//     does NOT upload or set again.
//
// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";

const { mockActor, resetState, seedProfilePhoto, getProfilePhoto, getPhotos } =
  vi.hoisted(() => {
    let profilePhotos: Record<string, Photo | null> = {};
    let photosByPerson: Record<string, Photo[]> = {};
    let nextId = 1n;

    const mockActor = {
      async getProfilePhoto(personId: string): Promise<Photo | null> {
        return profilePhotos[personId] ?? null;
      },
      async listPhotos(personId: string): Promise<Photo[]> {
        return [...(photosByPerson[personId] ?? [])];
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
          uploadedAt: 1_700_000_000_000_000_000n,
          uploadedBy: Principal.fromText(ACCOUNT),
        };
        photosByPerson[personId] = [...(photosByPerson[personId] ?? []), photo];
        return photo;
      },
      async setProfilePhoto(
        personId: string,
        photoId: PhotoId,
      ): Promise<Photo | null> {
        const photo =
          (photosByPerson[personId] ?? []).find((p) => p.id === photoId) ??
          null;
        profilePhotos[personId] = photo;
        return photo;
      },
    };

    return {
      mockActor,
      resetState: () => {
        profilePhotos = {};
        photosByPerson = {};
        nextId = 1n;
      },
      seedProfilePhoto: (personId: string) => {
        profilePhotos = {
          ...profilePhotos,
          [personId]: {
            id: 99n,
            blob: ExternalBlob.fromBytes(
              new Uint8Array([9, 9, 9]),
              "image/png",
              "existing.png",
            ),
            mimeType: "image/png",
            filename: "existing.png",
            uploadedAt: 1_700_000_000_000_000_000n,
            uploadedBy: Principal.fromText(ACCOUNT),
          },
        };
      },
      getProfilePhoto: (personId: string) => profilePhotos[personId] ?? null,
      getPhotos: (personId: string) => photosByPerson[personId] ?? [],
    };
  });

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: false,
    login: () => {},
    clear: () => {},
    identity: null,
    isInitializing: false,
    isLoggingIn: false,
    isLoginError: false,
    loginError: null,
  }),
}));

afterEach(cleanup);
beforeEach(() => {
  resetState();
  sessionStorage.clear();
  localStorage.clear();
  vi.restoreAllMocks();
});

beforeAll(() => {
  // jsdom does not implement URL.createObjectURL, which ExternalBlob.fromBytes
  // relies on when constructing a blob. Provide a deterministic stand-in.
  let counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${counter++}`);
});

// A tiny harness that mounts the bootstrap hook so its effect runs.
function Harness() {
  useEnsureLorenzoProfilePhoto();
  return <div data-ocid="bootstrap.harness" />;
}

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>,
  );
}

describe("useEnsureLorenzoProfilePhoto first-load photo bootstrap", () => {
  it("uploads the bundled portrait and sets it as the profile photo when lorenzoSmithJr has none", async () => {
    // The bundled portrait asset resolves to real PNG bytes.
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );

    renderWithProviders();

    // The hook fetches the bundled portrait, uploads it (addPhoto), and sets it
    // as the profile photo (setProfilePhoto) for lorenzoSmithJr.
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(getPhotos("lorenzoSmithJr")).toHaveLength(1);
      expect(getProfilePhoto("lorenzoSmithJr")).not.toBeNull();
    });

    const uploaded = getPhotos("lorenzoSmithJr")[0];
    expect(uploaded.filename).toBe("lorenzo-smith-jr.png");
    expect(uploaded.mimeType).toBe("image/png");
    // The uploaded photo is the one set as the profile photo.
    expect(getProfilePhoto("lorenzoSmithJr")?.id).toBe(uploaded.id);
  });

  it("does not upload again when lorenzoSmithJr already has a profile photo (idempotent)", async () => {
    // lorenzoSmithJr already has a selected profile photo.
    seedProfilePhoto("lorenzoSmithJr");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );

    renderWithProviders();

    // Give the effect a chance to run; it must NOT fetch or upload because a
    // profile photo already exists.
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getPhotos("lorenzoSmithJr")).toHaveLength(0);
    // The existing profile photo is untouched.
    expect(getProfilePhoto("lorenzoSmithJr")?.id).toBe(99n);
  });
});
