/**
 * sessionStorage persistence for the view the user was on when they started a
 * Google / Apple sign-in. A full-page auth redirect reloads the app at the
 * default 'home' view; this module lets App.tsx restore the originating view
 * (e.g. 'add-myself' or a 'profile' view with its person id) so the app
 * returns to the exact state after the redirect and the auto-submit effects
 * (Add Myself draft, ClaimButton pending claim) fire automatically.
 */

export interface OriginatingView {
  /** The view to restore after the auth redirect. */
  view: string;
  /** The person id to restore when the originating view is a profile. */
  profileId?: string;
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
