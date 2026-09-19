import "@testing-library/jest-dom/vitest";
import type { Photo, PhotoId } from "@/backend";
import { ExternalBlob } from "@caffeineai/object-storage";
import { Principal } from "@icp-sdk/core/principal";
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
  useAddPhoto,
  usePhotos,
  useProfilePhoto,
  useRemovePhoto,
  useSetProfilePhoto,
} from "./hooks/usePhotoStorage";

// ---------------------------------------------------------------------------
// Characterization baseline for the photo-authorization hardening change.
//
// The change restricts addPhoto / setProfilePhoto / removePhoto to the approved
// owner of a claimed profile or a Steward, restricts listPhotos to approved
// family membership or a Steward, and keeps getProfilePhoto public only for
// unclaimed/historical profiles. It is a BACKEND authorization change: the
// public method signatures and the frontend hooks that wrap them are unchanged.
//
// This file deliberately does NOT freeze the permissive pre-change behavior
// (setProfilePhoto / removePhoto currently perform no authorization check) —
// that is exactly what the change removes. What it protects instead is the
// API-consumer contract the acceptance criteria name: the existing photo hooks
// keep calling the backend methods with the same argument shapes and keep
// surfacing the same results and cache invalidation.
//
// The role checks themselves live in the PocketIC lane, because the frontend
// suite mocks the actor and has no principals at all. This file is the
// frontend half: a typed local actor mock standing in for the generated
// `_SERVICE`, asserting the exact call each hook makes.
// ---------------------------------------------------------------------------

const PERSON_ID = "julia";
const PHOTO_ID: PhotoId = 7n;

function makePhoto(overrides: Partial<Photo> = {}): Photo {
  return {
    id: PHOTO_ID,
    blob: ExternalBlob.fromBytes(
      new Uint8Array([1, 2, 3]),
      "image/png",
      "julia.png",
    ),
    mimeType: "image/png",
    filename: "julia.png",
    uploadedAt: 1_700_000_000_000_000_000n,
    uploadedBy: Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai"),
    ...overrides,
  };
}

// A typed local actor mock. Each method records its arguments so the test can
// assert the exact call the hook makes, and returns a deterministic value.
const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    listPhotos: unknown[][];
    getProfilePhoto: unknown[][];
    addPhoto: unknown[][];
    setProfilePhoto: unknown[][];
    removePhoto: unknown[][];
  } = {
    listPhotos: [],
    getProfilePhoto: [],
    addPhoto: [],
    setProfilePhoto: [],
    removePhoto: [],
  };

  const mockActor = {
    async listPhotos(...args: unknown[]): Promise<unknown[]> {
      calls.listPhotos.push(args);
      return [];
    },
    async getProfilePhoto(...args: unknown[]): Promise<unknown> {
      calls.getProfilePhoto.push(args);
      return null;
    },
    async addPhoto(...args: unknown[]): Promise<unknown> {
      calls.addPhoto.push(args);
      return null;
    },
    async setProfilePhoto(...args: unknown[]): Promise<unknown> {
      calls.setProfilePhoto.push(args);
      return null;
    },
    async removePhoto(...args: unknown[]): Promise<unknown> {
      calls.removePhoto.push(args);
      return true;
    },
  };

  return {
    mockActor,
    calls,
    resetCalls: () => {
      calls.listPhotos.length = 0;
      calls.getProfilePhoto.length = 0;
      calls.addPhoto.length = 0;
      calls.setProfilePhoto.length = 0;
      calls.removePhoto.length = 0;
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
    defaultOptions: { queries: { retry: false } },
  });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    ),
  };
}

/** Renders a hook and exposes its result on a data-ocid node for assertions. */
function HookProbe<T>({
  useHook,
  renderValue,
}: {
  useHook: () => T;
  renderValue: (value: T) => string;
}) {
  const value = useHook();
  return <div data-testid="probe.value">{renderValue(value)}</div>;
}

describe("Photo storage hooks: backend call contract (characterization)", () => {
  it("usePhotos calls listPhotos(personId) and surfaces the returned gallery", async () => {
    const photo = makePhoto();
    mockActor.listPhotos = vi.fn(async (...args: unknown[]) => {
      calls.listPhotos.push(args);
      return [photo];
    });

    renderWithQueryClient(
      <HookProbe
        useHook={() => usePhotos(PERSON_ID)}
        renderValue={(result) =>
          result.isSuccess ? String(result.data.length) : "pending"
        }
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("probe.value")).toHaveTextContent("1"),
    );
    // The hook calls the backend with exactly the personId, no extra arguments.
    expect(calls.listPhotos).toEqual([[PERSON_ID]]);
  });

  it("useProfilePhoto calls getProfilePhoto(personId) and surfaces the returned photo", async () => {
    const photo = makePhoto();
    mockActor.getProfilePhoto = vi.fn(async (...args: unknown[]) => {
      calls.getProfilePhoto.push(args);
      return photo;
    });

    renderWithQueryClient(
      <HookProbe
        useHook={() => useProfilePhoto(PERSON_ID)}
        renderValue={(result) =>
          result.isSuccess ? (result.data?.filename ?? "none") : "pending"
        }
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("probe.value")).toHaveTextContent("julia.png"),
    );
    expect(calls.getProfilePhoto).toEqual([[PERSON_ID]]);
  });

  it("useAddPhoto calls addPhoto(personId, filename, mimeType, blob) with the exact argument order", async () => {
    const blob = ExternalBlob.fromBytes(
      new Uint8Array([4, 5, 6]),
      "image/png",
      "new.png",
    );
    const created = makePhoto({ id: 9n, filename: "new.png" });
    mockActor.addPhoto = vi.fn(async (...args: unknown[]) => {
      calls.addPhoto.push(args);
      return created;
    });

    let mutateAsync: (variables: {
      personId: string;
      blob: ExternalBlob;
      filename: string;
      mimeType: string;
    }) => Promise<Photo> = async () => created;

    function AddProbe() {
      const mutation = useAddPhoto();
      mutateAsync = mutation.mutateAsync;
      return <div data-testid="probe.value">ready</div>;
    }

    renderWithQueryClient(<AddProbe />);
    await screen.findByTestId("probe.value");

    const result = await mutateAsync({
      personId: PERSON_ID,
      blob,
      filename: "new.png",
      mimeType: "image/png",
    });

    // The backend method receives the personId, filename, mimeType, and blob in
    // that order — the unchanged public signature the change must preserve.
    expect(calls.addPhoto).toEqual([[PERSON_ID, "new.png", "image/png", blob]]);
    expect(result).toBe(created);
  });

  it("useSetProfilePhoto calls setProfilePhoto(personId, photoId) and returns the selected photo", async () => {
    const selected = makePhoto();
    mockActor.setProfilePhoto = vi.fn(async (...args: unknown[]) => {
      calls.setProfilePhoto.push(args);
      return selected;
    });

    let mutateAsync: (variables: {
      personId: string;
      photoId: PhotoId;
    }) => Promise<Photo | null> = async () => selected;

    function SetProbe() {
      const mutation = useSetProfilePhoto();
      mutateAsync = mutation.mutateAsync;
      return <div data-testid="probe.value">ready</div>;
    }

    renderWithQueryClient(<SetProbe />);
    await screen.findByTestId("probe.value");

    const result = await mutateAsync({
      personId: PERSON_ID,
      photoId: PHOTO_ID,
    });

    expect(calls.setProfilePhoto).toEqual([[PERSON_ID, PHOTO_ID]]);
    expect(result).toBe(selected);
  });

  it("useRemovePhoto calls removePhoto(personId, photoId) and returns the boolean result", async () => {
    mockActor.removePhoto = vi.fn(async (...args: unknown[]) => {
      calls.removePhoto.push(args);
      return true;
    });

    let mutateAsync: (variables: {
      personId: string;
      photoId: PhotoId;
    }) => Promise<boolean> = async () => true;

    function RemoveProbe() {
      const mutation = useRemovePhoto();
      mutateAsync = mutation.mutateAsync;
      return <div data-testid="probe.value">ready</div>;
    }

    renderWithQueryClient(<RemoveProbe />);
    await screen.findByTestId("probe.value");

    const result = await mutateAsync({
      personId: PERSON_ID,
      photoId: PHOTO_ID,
    });

    expect(calls.removePhoto).toEqual([[PERSON_ID, PHOTO_ID]]);
    expect(result).toBe(true);
  });

  it("invalidates both the photos and profilePhoto query keys after add/set/remove", async () => {
    // The gallery and the profile-photo surfaces read two separate query keys.
    // A mutation that invalidates only one leaves the other stale, so this
    // freezes the invalidation contract that keeps every photo surface in sync.
    const invalidateSpy = vi.spyOn(QueryClient.prototype, "invalidateQueries");

    let add: (v: {
      personId: string;
      blob: ExternalBlob;
      filename: string;
      mimeType: string;
    }) => Promise<Photo> = async () => makePhoto();
    let set: (v: {
      personId: string;
      photoId: PhotoId;
    }) => Promise<Photo | null> = async () => null;
    let remove: (v: {
      personId: string;
      photoId: PhotoId;
    }) => Promise<boolean> = async () => true;

    function MutationsProbe() {
      add = useAddPhoto().mutateAsync;
      set = useSetProfilePhoto().mutateAsync;
      remove = useRemovePhoto().mutateAsync;
      return <div data-testid="probe.value">ready</div>;
    }

    renderWithQueryClient(<MutationsProbe />);
    await screen.findByTestId("probe.value");

    const blob = ExternalBlob.fromBytes(
      new Uint8Array([7]),
      "image/png",
      "x.png",
    );
    await add({
      personId: PERSON_ID,
      blob,
      filename: "x.png",
      mimeType: "image/png",
    });
    await set({ personId: PERSON_ID, photoId: PHOTO_ID });
    await remove({ personId: PERSON_ID, photoId: PHOTO_ID });

    const invalidatedKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey,
    );
    expect(invalidatedKeys).toContainEqual(["photos", PERSON_ID]);
    expect(invalidatedKeys).toContainEqual(["profilePhoto", PERSON_ID]);

    invalidateSpy.mockRestore();
  });
});
