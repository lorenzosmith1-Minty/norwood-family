/**
 * Canonical invite-route parsing and construction.
 *
 * The single supported invite-link shape is `/invite/<raw-token>`. The raw
 * token is the ONLY invite data carried in the URL — no familyId, personId,
 * email, or other identity data is embedded alongside it. The token is treated
 * as an opaque, URL-safe string: it is never decoded, split, or interpreted
 * here, and it is only ever handed to the backend for validation against the
 * stored digest.
 */

/** The path segment that introduces the canonical invite route. */
const INVITE_PATH_PREFIX = "/invite/";

/** The bare invite path with no trailing slash. */
const INVITE_PATH_BARE = "/invite";

/**
 * Whether a pathname belongs to the invite route at all, including malformed
 * invite paths that fail canonical parsing.
 *
 * This is deliberately broader than `parseInviteToken`: it matches `/invite`,
 * `/invite/`, `/invite/<token>/extra`, and a malformed percent-encoding, so a
 * caller can render the safe invalid-invite state for a malformed invite path
 * instead of silently falling through to Home. It matches `/invite` only as a
 * whole path segment, so an unrelated path such as `/invites/<token>` is not
 * treated as an invite route.
 */
export function isInvitePath(pathname: string): boolean {
  return (
    pathname === INVITE_PATH_BARE ||
    pathname.startsWith(INVITE_PATH_PREFIX) ||
    pathname.startsWith(`${INVITE_PATH_BARE}/`)
  );
}

/**
 * Parses the canonical invite route from a pathname.
 *
 * Returns the raw token when the pathname is exactly `/invite/<token>` with a
 * single non-empty segment, and `null` for any other path (including a bare
 * `/invite` or `/invite/` with no token, extra segments, or a malformed
 * encoding). A `null` result is the caller's signal to render the safe
 * invalid-invite state rather than a blank or error screen.
 */
export function parseInviteToken(pathname: string): string | null {
  if (!pathname.startsWith(INVITE_PATH_PREFIX)) return null;
  const remainder = pathname.slice(INVITE_PATH_PREFIX.length);
  // Reject a missing token, a trailing slash, or any extra path segment: the
  // token is the only path segment the canonical route allows.
  if (remainder.length === 0 || remainder.includes("/")) return null;
  let token: string;
  try {
    token = decodeURIComponent(remainder);
  } catch {
    // A malformed percent-encoding is not a valid invite route.
    return null;
  }
  return token.length > 0 ? token : null;
}

/**
 * Builds the canonical invite URL for a raw token. The token is encoded as a
 * single opaque path segment so URL-unsafe characters survive the round trip.
 */
export function buildInviteUrl(rawToken: string): string {
  return `${INVITE_PATH_PREFIX}${encodeURIComponent(rawToken)}`;
}
