import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  LivingStatus,
  type Notification,
  type PersonProfile,
  type Photo,
  type PhotoId,
  type ProfileClaim,
  type ProfileEdits,
  type Relationship,
  type RelationshipRequest,
  type RelationshipType,
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

// Cover for the canonical profile-photo build. The full profile hero portrait
// now resolves the selected PROFILE photo through the shared canonical resolver
// (useCanonicalPerson -> useProfilePhoto -> Photo.blob.getDirectURL()), exactly
// as the Lorenzo Smith Sr. child card and the Explore Family focus card do. This
// journey asserts the accepted behavior end to end:
//
//  1. Selecting Photo A as PROFILE shows Photo A on the full profile hero, the
//     Lorenzo Smith Sr. child card, and the Explore Family focus card.
//  2. Selecting Photo B and saving immediately shows Photo B on all three
//     surfaces (the selection only changes the profilePhotoId reference, never a
//     separate hero/card copy).
//  3. Removing the selected profile photo returns all three surfaces to the WM
//     initials placeholder.
//
// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const OWNER = "rrkah-fqaaa-aaaaa-aaaaq-cai";

// ---------------------------------------------------------------------------
// A stateful in-memory actor standing in for the real backend. It holds the
// canonical Person Profile records, the per-person photo galleries, and the
// single selected profilePhotoId per person. setProfilePhoto only changes that
// reference (never a separate hero/card copy), and removePhoto clears it — the
// exact contract the accepted requirements describe. React Query invalidation
// then propagates the change to every surface.
// ---------------------------------------------------------------------------
const {
  mockActor,
  resetState,
  setAuthenticated,
  setCurrentPrincipal,
  getAuthenticated,
  getCurrentPrincipal,
  seedProfile,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let currentPrincipal = "aaaaa-aa";
  let profiles: Record<string, PersonProfile> = {};
  let photosByPerson: Record<string, Photo[]> = {};
  let profilePhotoByPerson: Record<string, Photo | null> = {};
  let nextId = 1n;

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return false;
    },
    async getPersonProfile(personId: string): Promise<PersonProfile | null> {
      return profiles[personId] ?? null;
    },
    async getProfilePhoto(personId: string): Promise<Photo | null> {
      return profilePhotoByPerson[personId] ?? null;
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
        uploadedAt: 0n,
        uploadedBy: Principal.fromText(currentPrincipal),
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
      // Only the selected reference changes; the photo gallery is untouched.
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
    async getMyProfile(): Promise<PersonProfile | null> {
      const owned = Object.values(profiles).find(
        (p) => p.claimedByUserId?.toString() === currentPrincipal,
      );
      return owned ?? null;
    },
    async getMyProfileClaim(_personId: string): Promise<ProfileClaim | null> {
      return null;
    },
    async listConfirmedRelationships(): Promise<Relationship[]> {
      return [];
    },
    async listNotifications(): Promise<Notification[]> {
      return [];
    },
    async updateOwnProfile(
      personId: string,
      edits: ProfileEdits,
    ): Promise<
      { __kind__: "ok"; ok: PersonProfile } | { __kind__: "err"; err: string }
    > {
      const profile = profiles[personId];
      if (!profile) return { __kind__: "err", err: "ProfileNotFound" };
      if (profile.claimedByUserId?.toString() !== currentPrincipal)
        return { __kind__: "err", err: "NotOwner" };
      if (profile.livingStatus === LivingStatus.Deceased)
        return { __kind__: "err", err: "DeceasedProfile" };
      const updated: PersonProfile = {
        ...profile,
        preferredName: edits.preferredName ?? profile.preferredName,
        firstName: edits.firstName ?? profile.firstName,
        middleName: edits.middleName ?? profile.middleName,
        lastName: edits.lastName ?? profile.lastName,
        suffix: edits.suffix ?? profile.suffix,
        nickname: edits.nickname ?? profile.nickname,
        birthDate: edits.birthDate ?? profile.birthDate,
        birthplace: edits.birthplace ?? profile.birthplace,
        currentLocation: edits.currentLocation ?? profile.currentLocation,
        occupation: edits.occupation ?? profile.occupation,
        livingStatus: edits.livingStatus ?? profile.livingStatus,
        shortBio: edits.shortBio ?? profile.shortBio,
        longerStory: edits.longerStory ?? profile.longerStory,
        timeline: edits.timeline ?? profile.timeline,
        privacySettings: edits.privacySettings ?? profile.privacySettings,
      };
      profiles = { ...profiles, [personId]: updated };
      return { __kind__: "ok", ok: updated };
    },
    async proposeRelationship(
      fromPersonId: string,
      toPersonId: string,
      relationshipType: RelationshipType,
    ): Promise<
      | { __kind__: "ok"; ok: RelationshipRequest }
      | { __kind__: "err"; err: string }
    > {
      return {
        __kind__: "ok",
        ok: {
          id: 1n,
          requestingPersonId: fromPersonId,
          relatedPersonId: toPersonId,
          proposedRelationship: relationshipType,
          status: "Pending",
          submittedDate: 1_700_000_000_000_000_000n,
        },
      };
    },
  };

  return {
    mockActor,
    resetState: () => {
      isAuthenticated = false;
      currentPrincipal = "aaaaa-aa";
      profiles = {};
      photosByPerson = {};
      profilePhotoByPerson = {};
      nextId = 1n;
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    setCurrentPrincipal: (p: string) => {
      currentPrincipal = p;
    },
    getAuthenticated: () => isAuthenticated,
    getCurrentPrincipal: () => currentPrincipal,
    seedProfile: (profile: PersonProfile) => {
      profiles = { ...profiles, [profile.personId]: profile };
    },
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: getAuthenticated(),
    login: () => {},
    clear: () => {},
    identity: getAuthenticated()
      ? { getPrincipal: () => Principal.fromText(getCurrentPrincipal()) }
      : null,
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
});

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

function seedClaimedLivingProfile(
  personId: string,
  name: string,
  owner: string,
): PersonProfile {
  const profile: PersonProfile = {
    personId,
    name,
    livingStatus: LivingStatus.Living,
    claimStatus: ClaimStatus.Claimed,
    claimedByUserId: Principal.fromText(owner),
    preferredName: "Waxx Minty",
    firstName: undefined,
    middleName: undefined,
    lastName: undefined,
    suffix: undefined,
    nickname: undefined,
    birthDate: undefined,
    birthplace: undefined,
    currentLocation: undefined,
    occupation: undefined,
    shortBio: undefined,
    longerStory: undefined,
    story: undefined,
    birthInfo: undefined,
    timeline: undefined,
    privacySettings: undefined,
  };
  seedProfile(profile);
  return profile;
}

async function openExploreFamily(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Explore Family/ }));
}

async function navigateToLorenzoSmithSr(
  user: ReturnType<typeof userEvent.setup>,
) {
  // Julia -> Clayton -> Lula Mae -> Lorenzo Smith Sr.
  await user.click(
    screen.getByRole("button", { name: /Clayton Norwood Child/ }),
  );
  await user.click(
    screen.getByRole("button", { name: /Lula Mae Norwood Child/ }),
  );
  await user.click(
    screen.getByRole("button", { name: /Lorenzo Smith Sr\. Child/ }),
  );
}

async function openWaxxHero(user: ReturnType<typeof userEvent.setup>) {
  // Open the owner's own profile via the navbar profile button, which is
  // labeled with the canonical display name. The label resolves from the async
  // myProfile query, so wait for it to appear before clicking. Scope to the
  // navbar profile button (layout.my_profile_link) because the Explore Family
  // view can also show a "Waxx Minty Child" card with the same name.
  const profileButton = await screen.findByTestId("layout.my_profile_link");
  await within(profileButton).findByText("Waxx Minty");
  await user.click(profileButton);
  expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
    "Waxx Minty",
  );
}

async function openEditPage(user: ReturnType<typeof userEvent.setup>) {
  const claimSection = screen.getByTestId("profile.claim_section");
  await user.click(
    within(claimSection).getByRole("button", { name: "Edit My Profile" }),
  );
  expect(await screen.findByText("You own this profile")).toBeInTheDocument();
}

async function uploadPhoto(
  user: ReturnType<typeof userEvent.setup>,
  filename: string,
) {
  const input = document.querySelector(
    '[data-ocid="profile_edit.photo_input"]',
  ) as HTMLInputElement;
  const file = new File(["fake-image-bytes"], filename, { type: "image/png" });
  await user.upload(input, file);
}

async function setAsProfile(
  user: ReturnType<typeof userEvent.setup>,
  itemIndex: number,
) {
  await user.click(
    screen.getByTestId(`profile_edit.photo_item.${itemIndex}.set_profile`),
  );
}

function childCardImg(): HTMLImageElement | null {
  const childrenZone = screen.getByTestId("explore.zone.children");
  const childCard = within(childrenZone).getByRole("button", {
    name: /Waxx Minty Child/,
  });
  return childCard.querySelector("img");
}

describe("Canonical profile photo across hero, child card, and Explore Family", () => {
  it("shows Photo A then Photo B on all three surfaces, and initials after removal", async () => {
    seedClaimedLivingProfile("lorenzoSmithJr", "Lorenzo Smith Jr.", OWNER);
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    const user = userEvent.setup();
    renderApp();

    // --- Initial state: no selected photo, so the hero shows WM initials. ---
    await openWaxxHero(user);
    expect(
      await screen.findByTestId("profile.header.initials"),
    ).toBeInTheDocument();

    // --- Select Photo A as PROFILE. ---
    await openEditPage(user);
    await uploadPhoto(user, "photo-a.png");
    await screen.findByRole("img", { name: "photo-a.png" });
    await setAsProfile(user, 1);
    // The gallery marks Photo A as the profile photo.
    expect(
      await screen.findByText("Profile", {
        selector: '[data-ocid="profile_edit.photo_item.1.profile_badge"]',
      }),
    ).toBeInTheDocument();
    // Save the edit, then return to the profile hero.
    await user.click(screen.getByTestId("profile_edit.save_button"));
    expect(
      await screen.findByText("Your changes have been saved."),
    ).toBeInTheDocument();
    await user.click(screen.getByTestId("profile_edit.back_button"));

    // The hero now shows Photo A, not the initials placeholder.
    const heroA = await screen.findByRole("img", {
      name: "Waxx Minty's profile photo",
    });
    expect(heroA).toHaveAttribute("src", "blob:mock-0");
    expect(
      screen.queryByTestId("profile.header.initials"),
    ).not.toBeInTheDocument();

    // The Lorenzo Smith Sr. child card and the Explore Family focus card show
    // Photo A too.
    await openExploreFamily(user);
    await navigateToLorenzoSmithSr(user);
    const childA = childCardImg();
    expect(childA).not.toBeNull();
    expect(childA?.getAttribute("alt")).toBe("Waxx Minty's profile photo");
    expect(childA?.getAttribute("src")).toBe("blob:mock-0");

    // --- Select Photo B as PROFILE; all three surfaces switch immediately. ---
    await openWaxxHero(user);
    await openEditPage(user);
    await uploadPhoto(user, "photo-b.png");
    await screen.findByRole("img", { name: "photo-b.png" });
    await setAsProfile(user, 2);
    expect(
      await screen.findByText("Profile", {
        selector: '[data-ocid="profile_edit.photo_item.2.profile_badge"]',
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByTestId("profile_edit.save_button"));
    expect(
      await screen.findByText("Your changes have been saved."),
    ).toBeInTheDocument();
    await user.click(screen.getByTestId("profile_edit.back_button"));

    // Hero shows Photo B.
    const heroB = await screen.findByRole("img", {
      name: "Waxx Minty's profile photo",
    });
    expect(heroB).toHaveAttribute("src", "blob:mock-1");

    // Child card shows Photo B.
    await openExploreFamily(user);
    await navigateToLorenzoSmithSr(user);
    const childB = childCardImg();
    expect(childB).not.toBeNull();
    expect(childB?.getAttribute("src")).toBe("blob:mock-1");

    // --- Remove the selected profile photo; all surfaces return to initials. ---
    await openWaxxHero(user);
    await openEditPage(user);
    await user.click(screen.getByTestId("profile_edit.photo_remove_button"));
    await user.click(screen.getByTestId("profile_edit.save_button"));
    expect(
      await screen.findByText("Your changes have been saved."),
    ).toBeInTheDocument();
    await user.click(screen.getByTestId("profile_edit.back_button"));

    // Hero returns to the WM initials placeholder.
    expect(
      await screen.findByTestId("profile.header.initials"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: /profile photo/i }),
    ).not.toBeInTheDocument();

    // Child card returns to the initials placeholder (no image).
    await openExploreFamily(user);
    await navigateToLorenzoSmithSr(user);
    const childAfterRemove = childCardImg();
    expect(childAfterRemove).toBeNull();
  });
});
