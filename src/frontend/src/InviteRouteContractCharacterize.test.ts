import { describe, expect, it } from "vitest";
import { buildInviteUrl, parseInviteToken } from "./lib/inviteRoute";

// ---------------------------------------------------------------------------
// Characterization baseline for the canonical invite-route parser.
//
// The upcoming change alters what App.tsx DOES with a malformed invite path
// (today it falls through to Home; the new behavior renders the invalid-link
// state) and removes the raw token from the browser URL after consumption.
// Neither of those is the parser's contract, so this file deliberately does NOT
// freeze App's routing decision for a malformed path.
//
// What it protects is the EXISTING `inviteRoute.ts` contract the change must
// not break:
//
//   A. The canonical route is exactly `/invite/<single-non-empty-segment>`.
//      `/invite`, `/invite/`, `/invite/<token>/extra`, and a malformed
//      percent-encoding all parse to `null` — the caller's signal to render a
//      safe invalid state.
//   B. The token is opaque: it is never decoded, split, or interpreted, and a
//      token containing URL-unsafe characters survives a build/parse round trip.
//   C. `buildInviteUrl` encodes the token as a single path segment.
//
// This is a pure unit characterization of the route seam, not a browser
// journey. The page-level rendering of the invalid state is covered by
// InviteRedemptionPageCharacterize.test.tsx.
// ---------------------------------------------------------------------------

describe("parseInviteToken: canonical route shape is unchanged", () => {
  it("parses a single opaque token from the canonical route", () => {
    expect(parseInviteToken("/invite/abc123")).toBe("abc123");
  });

  it("returns null for a bare /invite with no token", () => {
    expect(parseInviteToken("/invite")).toBeNull();
  });

  it("returns null for /invite/ with an empty token", () => {
    expect(parseInviteToken("/invite/")).toBeNull();
  });

  it("returns null for extra path segments after the token", () => {
    expect(parseInviteToken("/invite/abc123/extra")).toBeNull();
  });

  it("returns null for a path that is not the invite route", () => {
    expect(parseInviteToken("/")).toBeNull();
    expect(parseInviteToken("/home")).toBeNull();
    expect(parseInviteToken("/invites/abc123")).toBeNull();
  });

  it("returns null for a malformed percent-encoding instead of throwing", () => {
    expect(() => parseInviteToken("/invite/%E0%A4%A")).not.toThrow();
    expect(parseInviteToken("/invite/%E0%A4%A")).toBeNull();
  });

  it("treats the token as opaque and never splits or interprets it", () => {
    // A token that happens to contain dots, dashes, or underscores is returned
    // verbatim; the parser does not decode it into parts.
    expect(parseInviteToken("/invite/a.b-c_d")).toBe("a.b-c_d");
  });
});

describe("buildInviteUrl: single-segment encoding is unchanged", () => {
  it("builds the canonical route for a plain token", () => {
    expect(buildInviteUrl("abc123")).toBe("/invite/abc123");
  });

  it("encodes URL-unsafe characters as a single path segment", () => {
    // A token with a slash must not create an extra path segment.
    const url = buildInviteUrl("a/b c");
    expect(url.startsWith("/invite/")).toBe(true);
    expect(url.slice("/invite/".length)).not.toContain("/");
    expect(url).toBe("/invite/a%2Fb%20c");
  });

  it("round-trips a URL-unsafe token through build then parse", () => {
    const raw = "tok+en/with=chars&more";
    expect(parseInviteToken(buildInviteUrl(raw))).toBe(raw);
  });
});
