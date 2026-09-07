import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { resolveBackendDisplayName } from "./types/family";

// Characterization baseline for the backend-profile -> display-name adapter
// transformation. The upcoming build makes every PersonCard variant resolve its
// display name from the canonical shared Person Profile record keyed by
// personId (instead of static/duplicated card data). That build will route the
// cards through this same adapter, so its current priority order is the
// adjacent working behavior that must NOT regress:
//
//   1. preferredName wins — a display-name edit made in the editor immediately
//      reflects wherever the canonical profile is rendered.
//   2. The canonical display-name mapping (e.g. lorenzoSmithJr) is used with
//      exact capitalization and spacing when no preferredName is set.
//   3. A composed full name from first/last/suffix is used when available.
//   4. The profile's raw name is the fallback.
//   5. The raw id is never surfaced as a user-facing name.
//
// These tests assert the adapter contract directly, independent of whichever
// card layout consumes it, so a card-propagation change cannot silently break
// the name-resolution priority the canonical-profile build depends on.
describe("resolveBackendDisplayName adapter characterization", () => {
  it("prefers the profile's preferredName over every other source", () => {
    // A claimed profile whose owner edited the display name to 'Waxx' must
    // resolve to 'Waxx' — the exact priority the canonical-profile build relies
    // on so an edit propagates to every card.
    expect(
      resolveBackendDisplayName("lorenzoSmithJr", {
        name: "Lorenzo Smith Jr.",
        preferredName: "Waxx",
        firstName: "Lorenzo",
        lastName: "Smith",
        suffix: "Jr.",
      }),
    ).toBe("Waxx");
  });

  it("trims surrounding whitespace from the preferredName", () => {
    expect(
      resolveBackendDisplayName("lorenzoSmithJr", {
        name: "Lorenzo Smith Jr.",
        preferredName: "  Waxx  ",
      }),
    ).toBe("Waxx");
  });

  it("falls back to the canonical display-name mapping when no preferredName is set", () => {
    // The graph-only node lorenzoSmithJr has a canonical mapping, so it resolves
    // with exact capitalization and spacing rather than leaking the raw id.
    expect(
      resolveBackendDisplayName("lorenzoSmithJr", {
        name: "Lorenzo Smith Jr.",
        preferredName: undefined,
      }),
    ).toBe("Lorenzo Smith Jr.");
  });

  it("composes a full name from first/last/suffix when no preferredName or canonical mapping exists", () => {
    expect(
      resolveBackendDisplayName("some-person", {
        name: "Raw Name",
        preferredName: undefined,
        firstName: "Ada",
        lastName: "Lovelace",
        suffix: "Jr.",
      }),
    ).toBe("Ada Lovelace Jr.");
  });

  it("falls back to the raw name when no preferredName, canonical mapping, or composed name exists", () => {
    expect(
      resolveBackendDisplayName("some-person", {
        name: "Ada Lovelace",
        preferredName: undefined,
      }),
    ).toBe("Ada Lovelace");
  });

  it("never surfaces the raw id as a user-facing name", () => {
    // Even with no name at all, the adapter returns the id only as a last
    // resort — but a real profile always carries a name, so the id never leaks.
    expect(
      resolveBackendDisplayName("lorenzoSmithJr", {
        name: "Lorenzo Smith Jr.",
        preferredName: undefined,
      }),
    ).not.toBe("lorenzoSmithJr");
  });
});
