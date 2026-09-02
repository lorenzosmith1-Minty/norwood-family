import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { profiles } from "./pages/PersonProfilePage";

// Characterization baseline for the underlying family data contract. The
// redesign replaces the multi-generation Family Tree layout and the Heritage
// Branch anchor-navigator layout, but it is explicitly a presentation and
// navigation redesign only — the underlying family data is not modified. These
// tests assert the data contract directly against the profiles record (the
// source of truth), independent of whichever layout consumes it, so a layout
// change cannot silently drop or rewire a person or relationship.
describe("Family data contract characterization", () => {
  it("keeps the founding couple and their eight children in the profiles record", () => {
    expect(profiles.julia).toBeDefined();
    expect(profiles.isaiah).toBeDefined();
    // Julia's profile records her husband and the eight children she raised.
    expect(profiles.julia.family.spouseName).toBe("Isaiah Norwood");
    expect(profiles.julia.family.childrenText).toContain("Clayton");
    expect(profiles.julia.family.childrenText).toContain("Lula E.");
    // The eight children are documented in the family record. Only Clayton has
    // a profile entry; the others are documented members without a profile.
    expect(profiles.clayton).toBeDefined();
    for (const name of [
      "Isaiah Jr.",
      "Edward",
      "Hattie",
      "Pinkie",
      "Louise",
      "Lillie",
      "Lula E.",
    ]) {
      expect(profiles.julia.family.childrenText).toContain(name);
    }
  });

  it("keeps Clayton's two marriages and their children intact", () => {
    const clayton = profiles.clayton;
    expect(clayton.family.spouses).toHaveLength(2);
    const [first, second] = clayton.family.spouses ?? [];
    expect(first.name).toBe("Ms. Hudson");
    expect(first.children).toContain("Elbert");
    expect(second.name).toBe("Erma T. Williams");
    expect(second.children).toContain("Columbus");
    expect(second.children).toContain("Lula Mae");
  });

  it("keeps the Lula Mae + Versie Smith couple and their seven children intact", () => {
    expect(profiles["lula-mae"].family.spouseName).toBe("Versie Smith");
    expect(profiles["versie-smith"].family.spouseName).toBe("Lula Mae Norwood");
    // The seven children of Lula Mae and Versie each have a profile entry.
    for (const id of [
      "lorenzoSmithSr",
      "versieSmithJr",
      "herbertSmith",
      "alonzoSmith",
      "sherriSmith",
      "beatriceSmith",
      "edSmith",
    ]) {
      expect(profiles[id]).toBeDefined();
      expect(profiles[id].facts.some((f) => f.label === "Parents")).toBe(true);
    }
  });

  it("keeps Versie's maternal ancestry: Gertrude as mother, Harvey as grandfather", () => {
    expect(
      profiles["versie-smith"].facts.some((f) =>
        f.value.includes("Gertrude Adams-Hill"),
      ),
    ).toBe(true);
    expect(
      profiles["gertrude-adams-hill"].facts.some((f) =>
        f.value.includes("Harvey Adams Sr."),
      ),
    ).toBe(true);
    expect(profiles["gertrude-adams-hill"].family.childrenText).toContain(
      "Versie Smith",
    );
  });

  it("keeps Harvey Adams Sr.'s two marriages and their children intact", () => {
    const harvey = profiles["harvey-adams-sr"];
    expect(harvey.family.spouses).toHaveLength(2);
    const [first, second] = harvey.family.spouses ?? [];
    expect(first.name).toBe("Mary Louise Sims");
    expect(second.name).toBe("Mary Jane Johnson");
    // Second-marriage children have profile entries.
    expect(profiles["mildred-adams"]).toBeDefined();
    expect(profiles["christine-adams"]).toBeDefined();
    // Mildred's daughters have profile entries.
    for (const id of ["tammy", "punchy", "patricia-rollins"]) {
      expect(profiles[id]).toBeDefined();
    }
  });

  it("keeps every profile's evidence status labeled as family history where recorded", () => {
    // The family-history-only profiles must not be relabeled as documented.
    for (const id of [
      "versie-smith",
      "gertrude-adams-hill",
      "harvey-adams-sr",
      "lula-mae",
      "zelia-mae",
    ]) {
      const evidence = profiles[id].facts.find(
        (f) => f.label === "Evidence status",
      );
      expect(evidence?.value).toBe("Family history");
    }
  });
});
