/**
 * sessionStorage persistence for the view the user was on when they started a
 * Google / Apple sign-in. A full-page auth redirect reloads the app at the
 * default 'home' view; this module lets App.tsx restore the originating view
 * (e.g. 'add-myself' or a 'profile' view with its person id) so the app
 * returns to the exact state after the redirect and the auto-submit effects
 * (Add Myself draft, ClaimButton pending claim) fire automatically.
 *
 * The same short-lived mechanism carries an invite token across the sign-in
 * redirect: when a signed-out visitor opens `/invite/<raw-token>`, the raw
 * token is persisted here so the invitation resumes automatically after
 * authentication. The raw token is deliberately kept in sessionStorage ONLY —
 * never localStorage — and is cleared as soon as the invitation is consumed or
 * abandoned.
 */

export interface OriginatingView {
  /** The view to restore after the auth redirect. */
  view: string;
  /** The person id to restore when the originating view is a profile. */
  profileId?: string;
  /**
   * The raw invite token to resume after the auth redirect. Present only when
   * the originating view is the invite view. Never persisted to localStorage.
   */
  inviteToken?: string;
}

const ORIGINATING_VIEW_KEY = "app.originatingView.v1";

/** Persist the originating view before initiating a Google / Apple sign-in. */
export function saveOriginatingView(origin: OriginatingView): void {
  try {
    sessionStorage.setItem(ORIGINATING_VIEW_KEY, JSON.stringify(origin));
  } catch {
    // sessionStorage may be unavailable (e.g. private mode); the app still
    // works, it just won't return to the originating view after a redirect.
  }
}

/** Read the persisted originating view, tolerating missing/corrupt data. */
export function loadOriginatingView(): OriginatingView | null {
  try {
    const raw = sessionStorage.getItem(ORIGINATING_VIEW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OriginatingView;
    if (!parsed || typeof parsed.view !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Clear the persisted originating view once it has been restored. */
export function clearOriginatingView(): void {
  try {
    sessionStorage.removeItem(ORIGINATING_VIEW_KEY);
  } catch {
    // ignore storage failures
  }
}

/**
 * Persist the raw invite token before a sign-in redirect so the invitation
 * resumes automatically after authentication. Stored in sessionStorage only,
 * alongside the originating invite view.
 */
export function saveInviteToken(rawToken: string): void {
  saveOriginatingView({ view: "invite", inviteToken: rawToken });
}

/**
 * Read the persisted invite token, tolerating missing/corrupt data. Returns
 * `null` when no invite token is pending.
 */
export function loadInviteToken(): string | null {
  const origin = loadOriginatingView();
  if (!origin || typeof origin.inviteToken !== "string") return null;
  return origin.inviteToken.length > 0 ? origin.inviteToken : null;
}

/**
 * Clear the persisted invite token once the invitation has been consumed or
 * abandoned, so a raw token is never retained beyond its short-lived purpose.
 */
export function clearInviteToken(): void {
  const origin = loadOriginatingView();
  if (!origin) return;
  if (origin.inviteToken === undefined) return;
  const { inviteToken: _inviteToken, ...rest } = origin;
  saveOriginatingView(rest);
}
