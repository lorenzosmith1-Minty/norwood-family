import { StewardClaimError } from "@/backend";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import {
  useClaimSteward,
  useHasActiveSteward,
} from "../hooks/useStewardAuthority";

interface ClaimStewardControlProps {
  /** True when the caller holds a valid, non-anonymous identity. */
  isAuthenticated: boolean;
  /**
   * True while the signed-in caller's account state is still resolving. The
   * control stays hidden until the active-Steward state is known so it never
   * flashes for a caller who cannot claim.
   */
  isHydrating?: boolean;
  /** Called after a successful claim so the app can land on the Steward hub. */
  onClaimed: () => void;
}

/** Human-readable copy for each backend claim failure. */
function claimErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message === "Backend is not ready") {
    return "The archive is still connecting. Please try again in a moment.";
  }
  if (error === StewardClaimError.StewardAlreadyExists) {
    return "A Family Steward already exists, so this claim is no longer available.";
  }
  if (error === StewardClaimError.AlreadySteward) {
    return "You are already an active Family Steward.";
  }
  if (error === StewardClaimError.NotSignedIn) {
    return "Please sign in before claiming Family Steward.";
  }
  return "We could not complete the claim. Please try again.";
}

/**
 * One-time "Claim Family Steward" bootstrap control.
 *
 * Shown only to a signed-in caller while no active Steward exists. Any
 * signed-in account may claim — no approved family profile is required. Once
 * an active Steward exists the control is hidden permanently. On success the
 * caller lands directly on the Family Steward hub with full Steward powers.
 */
export function ClaimStewardControl({
  isAuthenticated,
  isHydrating = false,
  onClaimed,
}: ClaimStewardControlProps) {
  const { data: hasActiveSteward, isLoading } = useHasActiveSteward();
  const claim = useClaimSteward();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Hidden for signed-out callers, while account state is resolving, and
  // permanently once any active Steward exists.
  if (!isAuthenticated || isHydrating || isLoading || hasActiveSteward) {
    return null;
  }

  const handleClaim = () => {
    setErrorMessage(null);
    claim.mutate(undefined, {
      onSuccess: (result) => {
        if (result.__kind__ === "ok") {
          onClaimed();
          return;
        }
        setErrorMessage(claimErrorMessage(result.err));
      },
      onError: (error) => {
        setErrorMessage(claimErrorMessage(error));
      },
    });
  };

  return (
    <section
      data-ocid="steward_claim.panel"
      aria-labelledby="steward-claim-heading"
      className="mx-auto w-full max-w-2xl px-4 pt-8"
    >
      <div className="rounded-xl border border-accent/40 bg-accent/10 px-6 py-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent-foreground">
            <ShieldCheck
              className="h-5 w-5"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </span>
          <div className="min-w-0">
            <h2
              id="steward-claim-heading"
              className="font-display text-lg font-semibold text-foreground"
            >
              No Family Steward yet
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The Norwood family archive has no active Steward. Any signed-in
              family member may claim this role once to begin reviewing
              contributions and governing the archive.
            </p>
            <button
              type="button"
              data-ocid="steward_claim.claim_button"
              onClick={handleClaim}
              disabled={claim.isPending}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ShieldCheck
                className="h-4 w-4"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              {claim.isPending ? "Claiming…" : "Claim Family Steward"}
            </button>
            {errorMessage ? (
              <p
                data-ocid="steward_claim.error_state"
                role="alert"
                className="mt-3 text-sm font-medium text-destructive"
              >
                {errorMessage}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
