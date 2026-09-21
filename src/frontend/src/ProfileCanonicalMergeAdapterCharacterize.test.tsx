import "@testing-library/jest-dom/vitest";
import {
  type PersonProfile as BackendPersonProfile,
  ClaimStatus,
  LivingStatus,
} from "@/backend";
import { Principal } from "@icp-sdk/core/principal";
import { describe, expect, it } from "vitest";
import { resolveCanonicalPersonProfile } from "./hooks/useCanonicalPerson";
import {
  type PersonProfile,
  backendProfileToPersonProfile,
  lulaMaeProfile,
} from "./pages/PersonProfilePage";

// Characterization baseline for the canonical Person read adapter that the
// Person Profile page routes through. The upcoming build makes the main profile
// page for seeded/static profiles resolve via
// resolveCanonicalPersonProfile(backendProfile, profiles[profileId]) so a saved
// edit (e.g. a preferred-name change) propagates to the profile page. That fix
// routes the page through this adapter, so its merge contract is the adjacent
// working behavior that must NOT regress:
//
//  1. The backend editable fields (preferredName, currentLocation, occupation,
//     birthDate, birthplace, story, timeline) WIN over the static canonical
//     record — the backend is the source of truth for owner-editable fields.
//  2. The static canonical record FILLS THE GAPS for seeded profiles whose
//     backend record carries only `name` (display name, location, story,
//     relationships, timeline all survive the merge).
//  3. Location, story, and relationships (family) remain intact after the
//     merge — the acceptance criterion "Location, story, and relationships
//     remain intact after the edit".
//  4. The static canonical record is NOT mutated: the merge returns a new
//     object and leaves the input canonical record untouched.
//  5. backendProfileToPersonProfile (the backend-only path) preserves its
//     existing behavior for genuinely new / graph-only people.
//
// These tests assert the adapter contract directly, independent of any page
// layout, so the profile-page propagation change cannot silently break the
// merge the fix depends on.

const OWNER = "rrkah-fqaaa-aaaaa-aaaaq-cai";

// Lula Mae's backend record carries only `name` (all owner-editable fields
// null), exactly like the seeded profiles. The static canonical record for
// 'lula-mae' supplies the display name 'Lula Mae Norwood', the Location fact
// 'New York / New Jersey', a story, a family (spouse Versie Smith), and a
// timeline entry.
function seedLulaMaeBackendProfile(): BackendPersonProfile {
  return {
    familyId: "norwood",
    personId: "lula-mae",
    name: "Lula Mae Norwood",
    livingStatus: LivingStatus.Living,
    claimStatus: ClaimStatus.Claimed,
    claimedByUserId: Principal.fromText(OWNER),
    preferredName: undefined,
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
}

describe("resolveCanonicalPersonProfile merge adapter", () => {
  it("lets the backend preferred name win over the static canonical name", () => {
    const backend = seedLulaMaeBackendProfile();
    backend.preferredName = "Lula Mae";
    const resolved = resolveCanonicalPersonProfile(backend, lulaMaeProfile);

    // The backend preferredName wins over the canonical 'Lula Mae Norwood'.
    expect(resolved.name).toBe("Lula Mae");
  });

  it("fills the display name from the canonical record when the backend carries only name", () => {
    const resolved = resolveCanonicalPersonProfile(
      seedLulaMaeBackendProfile(),
      lulaMaeProfile,
    );

    // The backend record carries only `name`; the canonical record supplies the
    // display name.
    expect(resolved.name).toBe("Lula Mae Norwood");
  });

  it("keeps location, story, and relationships intact when the backend carries only name", () => {
    const resolved = resolveCanonicalPersonProfile(
      seedLulaMaeBackendProfile(),
      lulaMaeProfile,
    );

    // The Location fact survives the merge (backend has no currentLocation).
    const locationFact = resolved.facts.find((f) => f.label === "Location");
    expect(locationFact?.value).toBe("New York / New Jersey");

    // The story survives the merge.
    expect(resolved.story).toContain(
      "Lula Mae Norwood was the daughter of Clayton Norwood",
    );

    // The family relationships survive the merge.
    expect(resolved.family.spouseName).toBe("Versie Smith");
    expect(resolved.family.spouseRole).toBe("Husband");

    // The timeline survives the merge.
    expect(resolved.timeline.length).toBeGreaterThan(0);
  });

  it("lets a backend currentLocation win over the canonical Location fact", () => {
    const backend = seedLulaMaeBackendProfile();
    backend.currentLocation = "Brooklyn, NY";
    const resolved = resolveCanonicalPersonProfile(backend, lulaMaeProfile);

    // The backend currentLocation wins over the canonical 'New York / New
    // Jersey' fact.
    const locationFact = resolved.facts.find((f) => f.label === "Location");
    expect(locationFact?.value).toBe("Brooklyn, NY");
  });

  it("does not mutate the static canonical record", () => {
    // Snapshot the canonical record before the merge.
    const before = JSON.stringify(lulaMaeProfile);
    resolveCanonicalPersonProfile(seedLulaMaeBackendProfile(), lulaMaeProfile);
    // The static canonical record is unchanged — the merge returns a new object.
    expect(JSON.stringify(lulaMaeProfile)).toBe(before);
  });

  it("lets a backend story win over the canonical story", () => {
    const backend = seedLulaMaeBackendProfile();
    backend.longerStory = "A newly edited personal story.";
    const resolved = resolveCanonicalPersonProfile(backend, lulaMaeProfile);

    expect(resolved.story).toBe("A newly edited personal story.");
  });
});

describe("backendProfileToPersonProfile (backend-only path)", () => {
  it("builds a display record from the backend alone for a person with no canonical record", () => {
    const backend: BackendPersonProfile = {
      familyId: "norwood",
      personId: "new-person",
      name: "New Person",
      livingStatus: LivingStatus.Living,
      claimStatus: ClaimStatus.Claimed,
      claimedByUserId: Principal.fromText(OWNER),
      preferredName: "New Preferred",
      currentLocation: "Chicago",
      occupation: "Engineer",
      story: "A new account-owned profile.",
      timeline: ["Entry one"],
      birthDate: undefined,
      birthplace: undefined,
      shortBio: undefined,
      longerStory: undefined,
      firstName: undefined,
      middleName: undefined,
      lastName: undefined,
      suffix: undefined,
      nickname: undefined,
      birthInfo: undefined,
      privacySettings: undefined,
    };

    const resolved = backendProfileToPersonProfile(backend);

    // The backend-only path preserves the existing behavior: the preferred name
    // wins, the location/occupation become facts, the story and timeline carry
    // through, and the id is preserved.
    expect(resolved.id).toBe("new-person");
    expect(resolved.name).toBe("New Preferred");
    expect(resolved.facts).toEqual(
      expect.arrayContaining([
        { label: "Location", value: "Chicago" },
        { label: "Occupation", value: "Engineer" },
      ]),
    );
    expect(resolved.story).toBe("A new account-owned profile.");
    expect(resolved.timeline[0]?.detail).toBe("Entry one");
  });

  it("falls back to the raw name when no preferredName is set on a backend-only person", () => {
    const backend: BackendPersonProfile = {
      familyId: "norwood",
      personId: "new-person",
      name: "New Person",
      livingStatus: LivingStatus.Living,
      claimStatus: ClaimStatus.Unclaimed,
      claimedByUserId: undefined,
      preferredName: undefined,
      currentLocation: undefined,
      occupation: undefined,
      story: undefined,
      timeline: undefined,
      birthDate: undefined,
      birthplace: undefined,
      shortBio: undefined,
      longerStory: undefined,
      firstName: undefined,
      middleName: undefined,
      lastName: undefined,
      suffix: undefined,
      nickname: undefined,
      birthInfo: undefined,
      privacySettings: undefined,
    };

    const resolved = backendProfileToPersonProfile(backend);

    expect(resolved.name).toBe("New Person");
    expect(resolved.facts).toEqual([]);
    expect(resolved.story).toBe("");
  });
});
