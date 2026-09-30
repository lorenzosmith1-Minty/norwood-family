import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearOriginatingView,
  loadOriginatingView,
  saveOriginatingView,
} from "./lib/originatingView";

// ---------------------------------------------------------------------------
// Characterization baseline for the sessionStorage originating-view mechanism.
//
// Phase 1C-2 adds a canonical `/invite/<raw-token>` route and a safe signed-out
// invite preview, and the accepted design extends THIS mechanism with an
// invite-token field so a signed-out visitor who starts sign-in from an invite
// link is returned to the invite after the auth redirect. Adding that field is
// exactly the change under way, so this file deliberately does NOT freeze the
// absence of an invite-token field, nor the exact serialized shape of the
// stored object.
//
// What it protects is the EXISTING contract the invite work must not break:
//
//   A. The storage key stays `app.originatingView.v1`, so a value written by
//      the pre-change app is still read by the post-change app (and vice
//      versa) within a session.
//   B. A saved `{ view }` round-trips exactly, and a saved `{ view, profileId }`
//      round-trips with the profileId preserved — the profile-origin flow the
//      ClaimButton and Add Myself auto-submit effects depend on.
//   C. `loadOriginatingView` tolerates missing, corrupt, and structurally
//      invalid data by returning null rather than throwing.
//   D. `clearOriginatingView` removes the persisted value, and clearing an
//      absent value is a no-op that does not throw.
//   E. Storage failures (e.g. private mode) are swallowed: save/load/clear
//      never throw when sessionStorage is unavailable.
//
// This is a unit characterization of the persistence seam, not a browser
// journey. The end-to-end return-to-page journey is covered by
// NavbarReturnToPageCharacterize.test.tsx.
// ---------------------------------------------------------------------------

const KEY = "app.originatingView.v1";

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  sessionStorage.clear();
});

describe("originating-view session persistence is unchanged", () => {
  it("uses the stable app.originatingView.v1 storage key", () => {
    saveOriginatingView({ view: "family-history" });
    // The key is the cross-version contract: a value written before the invite
    // change must still be readable after it.
    expect(sessionStorage.getItem(KEY)).not.toBeNull();
    expect(loadOriginatingView()).toEqual({ view: "family-history" });
  });

  it("round-trips a view-only origin exactly", () => {
    saveOriginatingView({ view: "add-myself" });
    expect(loadOriginatingView()).toEqual({ view: "add-myself" });
  });

  it("round-trips a profile origin with its profileId preserved", () => {
    saveOriginatingView({ view: "profile", profileId: "lorenzoSmithJr" });
    expect(loadOriginatingView()).toEqual({
      view: "profile",
      profileId: "lorenzoSmithJr",
    });
  });

  it("overwrites a previous origin rather than accumulating stale state", () => {
    saveOriginatingView({ view: "profile", profileId: "julia" });
    saveOriginatingView({ view: "family-history" });
    expect(loadOriginatingView()).toEqual({ view: "family-history" });
  });

  it("returns null when nothing has been saved", () => {
    expect(loadOriginatingView()).toBeNull();
  });

  it("returns null for corrupt JSON instead of throwing", () => {
    sessionStorage.setItem(KEY, "{not valid json");
    expect(loadOriginatingView()).toBeNull();
  });

  it("returns null for a structurally invalid value with no string view", () => {
    sessionStorage.setItem(KEY, JSON.stringify({ profileId: "julia" }));
    expect(loadOriginatingView()).toBeNull();
    sessionStorage.setItem(KEY, JSON.stringify({ view: 42 }));
    expect(loadOriginatingView()).toBeNull();
    sessionStorage.setItem(KEY, JSON.stringify(null));
    expect(loadOriginatingView()).toBeNull();
  });

  it("clears the persisted origin", () => {
    saveOriginatingView({ view: "family-history" });
    clearOriginatingView();
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(loadOriginatingView()).toBeNull();
  });

  it("clearing an absent origin is a no-op that does not throw", () => {
    expect(() => clearOriginatingView()).not.toThrow();
    expect(loadOriginatingView()).toBeNull();
  });

  it("swallows storage failures so the app still works without sessionStorage", () => {
    const original = Object.getOwnPropertyDescriptor(window, "sessionStorage");
    // Simulate an unavailable sessionStorage (private mode / blocked storage):
    // every access throws. The helpers must degrade to no-ops, never throw.
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw new Error("sessionStorage is unavailable");
      },
    });
    try {
      expect(() => saveOriginatingView({ view: "home" })).not.toThrow();
      expect(loadOriginatingView()).toBeNull();
      expect(() => clearOriginatingView()).not.toThrow();
    } finally {
      if (original) {
        Object.defineProperty(window, "sessionStorage", original);
      }
    }
  });
});
