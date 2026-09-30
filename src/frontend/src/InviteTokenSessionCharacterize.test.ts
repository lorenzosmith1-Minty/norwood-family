import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearInviteToken,
  loadInviteToken,
  loadOriginatingView,
  saveInviteToken,
  saveOriginatingView,
} from "./lib/originatingView";

// ---------------------------------------------------------------------------
// Characterization baseline for the invite-token half of the sessionStorage
// originating-view mechanism.
//
// The upcoming change alters the App.tsx LIFECYCLE around this storage — when
// the saved origin is cleared, and whether a malformed path renders the invalid
// state — but not the storage helpers themselves. This file deliberately does
// NOT freeze App's clear-on-mount behavior.
//
// What it protects is the EXISTING helper contract the change must not break:
//
//   A. `saveInviteToken` persists the raw token under the stable
//      `app.originatingView.v1` key as `{ view: "invite", inviteToken }`, so a
//      value written by the pre-change app is still read by the post-change app
//      within a session.
//   B. `loadInviteToken` returns the token, and `null` for a missing, empty, or
//      non-string token.
//   C. `clearInviteToken` strips ONLY the invite token and preserves the rest
//      of the record (e.g. a profile origin), and clearing an absent token is a
//      no-op.
//   D. Storage failures are swallowed: none of the helpers throw when
//      sessionStorage is unavailable.
//
// This is a unit characterization of the persistence seam, not a browser
// journey. The base view/profile origin contract is covered by
// OriginatingViewSessionCharacterize.test.ts.
// ---------------------------------------------------------------------------

const KEY = "app.originatingView.v1";

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  sessionStorage.clear();
});

describe("invite-token session persistence is unchanged", () => {
  it("saves the raw token under the stable key as an invite origin", () => {
    saveInviteToken("raw-token-123");
    // The key is the cross-version contract.
    expect(sessionStorage.getItem(KEY)).not.toBeNull();
    expect(loadOriginatingView()).toEqual({
      view: "invite",
      inviteToken: "raw-token-123",
    });
  });

  it("loads the saved invite token", () => {
    saveInviteToken("raw-token-123");
    expect(loadInviteToken()).toBe("raw-token-123");
  });

  it("returns null when no invite token has been saved", () => {
    expect(loadInviteToken()).toBeNull();
  });

  it("returns null for an empty-string token", () => {
    saveOriginatingView({ view: "invite", inviteToken: "" });
    expect(loadInviteToken()).toBeNull();
  });

  it("returns null for a non-string token value", () => {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ view: "invite", inviteToken: 42 }),
    );
    expect(loadInviteToken()).toBeNull();
  });

  it("clears only the invite token and preserves the rest of the record", () => {
    saveOriginatingView({
      view: "profile",
      profileId: "lorenzoSmithJr",
      inviteToken: "raw-token-123",
    });
    clearInviteToken();
    expect(loadInviteToken()).toBeNull();
    // The profile origin survives: only the token field is stripped.
    expect(loadOriginatingView()).toEqual({
      view: "profile",
      profileId: "lorenzoSmithJr",
    });
  });

  it("clearing an absent invite token is a no-op that does not throw", () => {
    saveOriginatingView({ view: "family-history" });
    expect(() => clearInviteToken()).not.toThrow();
    expect(loadOriginatingView()).toEqual({ view: "family-history" });
  });

  it("swallows storage failures so the app still works without sessionStorage", () => {
    const original = Object.getOwnPropertyDescriptor(window, "sessionStorage");
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw new Error("sessionStorage is unavailable");
      },
    });
    try {
      expect(() => saveInviteToken("raw-token-123")).not.toThrow();
      expect(loadInviteToken()).toBeNull();
      expect(() => clearInviteToken()).not.toThrow();
    } finally {
      if (original) {
        Object.defineProperty(window, "sessionStorage", original);
      }
    }
  });
});
