import { Loader2, UserCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import {
  useMyProfileClaim,
  useRequestProfileClaim,
} from "../hooks/useProfileClaims";
import { saveOriginatingView } from "../lib/originatingView";
import type { BackendPersonProfile } from "../types/ownership";

/**
 * sessionStorage key for the pending claim flag. The flag is persisted so a
 * full-page auth redirect (Google / Apple one-click sign-in) returns the user
 * to the profile and submits the claim for this exact person automatically.
 */
const PENDING_CLAIM_STORAGE_KEY = "claimButton.pendingClaim.v1";

/** Read the persisted pending-claim flag, tolerating missing/corrupt data. */
function loadPendingClaim(): boolean {
  try {
    return sessionStorage.getItem(PENDING_CLAIM_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/** Official multicolor Google "G" mark. */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}

/** Monochrome Apple logo, tinted by the button's foreground color. */
function AppleLogo() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="h-5 w-5"
    >
      <path d="M17.05 20.28c-.98.95-2.05.86-3.08.38-1.09-.5-2.08-.53-3.2 0-1.44.62-2.2.44-3.06-.38C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

/**
 * The "This is Me" claim action for a person profile. It requires sign-in and
 * creates a pending profile claim without granting ownership. Deceased
 * profiles are never claimable and render no action. A profile already owned
 * by the signed-in user shows an owned state; a pending claim by the user
 * shows a pending state.
 *
 * The claim flow never creates a duplicate Person Profile: it calls
 * `requestProfileClaim(personId)`, which records a pending Profile Claim
 * against the EXISTING profile and leaves the existing family relationships
 * intact. It does NOT call `createMyself` (that path is reserved for genuinely
 * new people with no existing profile). After a Family Steward approves the
 * claim, the account is linked to that existing Person Profile.
 *
 * When the user is not signed in, the action offers the same two consumer
 * sign-in options as the rest of the app — "Continue with Google" and
 * "Continue with Apple" — and, once signed in, automatically submits the
 * claim for this exact profile. Claims are never auto-approved; they remain
 * pending for the existing steward review flow.
 */
export interface ClaimButtonProps {
  /** The person whose profile is being claimed. */
  personId: string;
  /** The backend profile record (livingStatus, claimStatus, claimedByUserId). */
  profile: BackendPersonProfile | null | undefined;
  /** Compact variant for tight layouts (smaller padding). */
  variant?: "default" | "compact";
}

export function ClaimButton({
  personId,
  profile,
  variant = "default",
}: ClaimButtonProps) {
  const {
    isAuthenticated,
    accountId,
    signInWithGoogle,
    signInWithApple,
    isLoggingIn,
    isLoginError,
    loginError,
  } = useAuth();
  const { data: myClaim } = useMyProfileClaim(personId);
  const claim = useRequestProfileClaim();

  const [activeProvider, setActiveProvider] = useState<
    "google" | "apple" | null
  >(null);
  // Set when the user starts a sign-in from this action so the claim is
  // submitted automatically for this exact profile once sign-in completes. The
  // flag is persisted to sessionStorage so it survives the full-page auth
  // redirect and the auto-submit effect fires after remount.
  const [pendingClaim, setPendingClaim] = useState(loadPendingClaim);

  const currentPrincipal = accountId;

  const ownedByCurrentUser = useMemo(() => {
    if (!profile?.claimedByUserId || !currentPrincipal) return false;
    return profile.claimedByUserId.toString() === currentPrincipal;
  }, [profile?.claimedByUserId, currentPrincipal]);

  const pendingByCurrentUser = useMemo(
    () =>
      myClaim?.personId === personId &&
      myClaim.status === "Pending" &&
      myClaim.requestingUserId.toString() === currentPrincipal,
    [myClaim, personId, currentPrincipal],
  );

  // After a successful sign-in, submit the claim for this exact profile.
  useEffect(() => {
    if (isAuthenticated && pendingClaim) {
      setPendingClaim(false);
      try {
        sessionStorage.removeItem(PENDING_CLAIM_STORAGE_KEY);
      } catch {
        // ignore storage failures
      }
      claim.mutate(personId);
    }
  }, [isAuthenticated, pendingClaim, claim, personId]);

  // Deceased profiles are never claimable.
  if (profile?.livingStatus === "Deceased") {
    return null;
  }

  const compact = variant === "compact";

  // Owned by the signed-in user: show an owned state, not a claim action.
  if (ownedByCurrentUser) {
    return (
      <span
        data-ocid="claim_button.owned"
        className="claim-badge claim-badge-claimed"
      >
        <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
        You own this profile
      </span>
    );
  }

  // A pending claim by the user is awaiting steward review.
  if (pendingByCurrentUser) {
    return (
      <span
        data-ocid="claim_button.pending"
        className="claim-badge claim-badge-pending"
      >
        Claim pending
      </span>
    );
  }

  // Signed in: submit the claim directly.
  if (isAuthenticated) {
    return (
      <button
        type="button"
        data-ocid="claim_button.this_is_me"
        onClick={() => claim.mutate(personId)}
        disabled={claim.isPending}
        className={`this-is-me-action ${compact ? "px-4 py-2 text-xs" : ""}`}
      >
        {claim.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <UserCheck className="h-4 w-4" aria-hidden="true" />
        )}
        {claim.isPending ? "Submitting…" : "This is Me"}
      </button>
    );
  }

  // Not signed in: offer the same Google/Apple sign-in options, then
  // auto-submit the claim once the user is authenticated.
  const handleSignIn = (provider: "google" | "apple") => {
    setActiveProvider(provider);
    setPendingClaim(true);
    try {
      sessionStorage.setItem(PENDING_CLAIM_STORAGE_KEY, "true");
    } catch {
      // ignore storage failures
    }
    if (provider === "google") {
      signInWithGoogle();
    } else {
      signInWithApple();
    }
    // Persist the originating view (this profile) so the app returns to the
    // exact profile after the full-page auth redirect and the auto-submit
    // effect fires automatically.
    saveOriginatingView({ view: "profile", profileId: personId });
  };

  const googlePending = isLoggingIn && activeProvider === "google";
  const applePending = isLoggingIn && activeProvider === "apple";

  return (
    <div className="w-full" data-ocid="claim_button.signin">
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
        Sign in to confirm this is you. Your claim stays pending until a family
        steward reviews it.
      </p>
      <div className="signin-stack">
        <button
          type="button"
          data-ocid="claim_button.google_button"
          onClick={() => handleSignIn("google")}
          disabled={isLoggingIn}
          className="signin-btn signin-google"
        >
          <span className="signin-logo">
            {googlePending ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            ) : (
              <GoogleLogo />
            )}
          </span>
          {googlePending ? "Signing in…" : "Continue with Google"}
        </button>

        <div className="signin-divider" aria-hidden="true">
          or
        </div>

        <button
          type="button"
          data-ocid="claim_button.apple_button"
          onClick={() => handleSignIn("apple")}
          disabled={isLoggingIn}
          className="signin-btn signin-apple"
        >
          <span className="signin-logo">
            {applePending ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            ) : (
              <AppleLogo />
            )}
          </span>
          {applePending ? "Signing in…" : "Continue with Apple"}
        </button>
      </div>

      {isLoginError ? (
        <p
          className="signin-footnote mt-3"
          data-ocid="claim_button.signin_error"
          role="alert"
        >
          We couldn't sign you in{loginError ? ` (${loginError.message})` : ""}.
          Please try again.
        </p>
      ) : (
        <p className="signin-footnote mt-3">
          Your claim is never auto-approved — a family steward reviews it before
          you gain ownership.
        </p>
      )}
    </div>
  );
}
