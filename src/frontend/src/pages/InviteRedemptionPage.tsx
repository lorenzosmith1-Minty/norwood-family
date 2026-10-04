import { useActor } from "@caffeineai/core-infrastructure";
import {
  CheckCircle2,
  Clock,
  Mail,
  ShieldAlert,
  TreePine,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { InvitationType, MembershipStatus, createActor } from "../backend";
import type { FamilyMembership } from "../backend";
import { AppleLogo, GoogleLogo } from "../components/LoginSurface";
import { MembershipConfirmationStatusCard } from "../components/MembershipConfirmationStatusCard";
import { useAuth } from "../hooks/useAuth";
import {
  useAcceptInvitation,
  useDeclineInvitation,
  useInvitationPreview,
  useInvitationRedemptionState,
} from "../hooks/useInvitation";
import type {
  FamilyInvitationPreview,
  InvitationRedemptionState,
} from "../hooks/useInvitation";
import { useMyMembershipForFamily } from "../hooks/useMembershipConfirmation";
import { saveInviteToken } from "../lib/originatingView";

/**
 * The invitation redemption landing page for the canonical `/invite/<raw-token>`
 * route. It resolves the opaque token to a safe, discriminated redemption state
 * through the backend and renders one of:
 *
 * - a loading state while the token is being validated,
 * - the safe invitation preview with Accept / Decline for a signed-in visitor,
 * - a sign-in gate for a signed-out visitor (the token is resumed after auth),
 * - a terminal state for an already-accepted, declined, cancelled, or expired
 *   invitation, or an invalid token.
 *
 * The preview deliberately exposes only the family display name, the target
 * profile's safe display name, the invitation type as a family-safe label, and
 * the expiry/status. It never surfaces the family tree, Archive, member list,
 * private stories, sensitive relationship context (adopted, foster, step,
 * biological, guardian), or Steward-only data.
 */

interface InviteRedemptionPageProps {
  /** The raw, opaque invite token parsed from the URL, or null when absent. */
  rawToken: string | null;
  /** Whether the visitor is currently authenticated. */
  isAuthenticated: boolean;
  /** Starts the sign-in flow, preserving the pending invitation. */
  onSignIn: () => void;
  /** Called once the invitation has been consumed or abandoned. */
  onConsumed: () => void;
}

/** The family-safe label for an invitation type. Never a relationship label. */
function invitationTypeLabel(type: InvitationType): string {
  return type === InvitationType.FoundingSteward
    ? "Steward nomination"
    : "Family member";
}

/** A short, human expiry line derived from the backend nanosecond timestamp. */
function expiryLabel(expiresAt: bigint): string {
  const ms = Number(expiresAt / 1_000_000n);
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "—";
  const days = Math.ceil((ms - Date.now()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days <= 30) return `In ${days} days`;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * The result of looking up the caller's own membership in the invitation's
 * family, used to disambiguate the shared `#AlreadyMember` error.
 *
 * - `pending`: the lookup is still in flight; no terminal state may render yet.
 * - `member`: the caller holds a membership in this family.
 * - `none`: the caller holds no membership in this family.
 * - `unknown`: the lookup failed; the caller's membership cannot be determined.
 */
type CallerMembershipLookup =
  | { kind: "pending" }
  | { kind: "member"; membership: FamilyMembership }
  | { kind: "none" }
  | { kind: "unknown" };

/**
 * Whether a caller's membership is the "already connected" case: it belongs to
 * the invitation's target profile AND is active. A membership for a different
 * person, or one that is Suspended, Left, or otherwise not active, is an
 * incompatible state and must render the generic conflict/recovery state
 * instead of claiming the caller is already connected.
 */
function isAlreadyConnectedMembership(
  membership: FamilyMembership,
  targetPersonId: string,
): boolean {
  return (
    membership.personId === targetPersonId &&
    membership.status === MembershipStatus.Active
  );
}

/** The privacy-safe preview detail list shared by the signed-out and signed-in
 *  views. Only family name, invited profile, invitation type, and expiry. */
function InviteDetails({ preview }: { preview: FamilyInvitationPreview }) {
  return (
    <dl className="invite-details">
      <div className="invite-detail-row">
        <dt className="invite-detail-label">Family</dt>
        <dd className="invite-detail-value">{preview.familyDisplayName}</dd>
      </div>
      <div className="invite-detail-row">
        <dt className="invite-detail-label">Invited profile</dt>
        <dd className="invite-detail-value">{preview.targetDisplayName}</dd>
      </div>
      <div className="invite-detail-row">
        <dt className="invite-detail-label">Invitation</dt>
        <dd className="invite-detail-value">
          {invitationTypeLabel(preview.invitationType)}
        </dd>
      </div>
      <div className="invite-detail-row">
        <dt className="invite-detail-label">Expires</dt>
        <dd className="invite-detail-value">
          {expiryLabel(preview.expiresAt)}
        </dd>
      </div>
    </dl>
  );
}

/** The signed-out gate: the preview stays visible, with the existing sign-in
 *  surface below it. The raw token is persisted before sign-in so the
 *  invitation resumes automatically after authentication. */
function SignInGate({
  preview,
  rawToken,
  onSignIn,
}: {
  preview: FamilyInvitationPreview;
  rawToken: string;
  onSignIn: () => void;
}) {
  const {
    signInWithGoogle,
    signInWithApple,
    isLoggingIn,
    isLoginError,
    loginError,
  } = useAuth();

  const begin = (provider: "google" | "apple") => {
    // Persist the raw token through the existing short-lived session mechanism
    // so the invitation resumes after the auth redirect. Never permanent.
    saveInviteToken(rawToken);
    onSignIn();
    if (provider === "google") signInWithGoogle();
    else signInWithApple();
  };

  return (
    <div className="invite-screen" data-ocid="invite.page">
      <div className="invite-card" data-ocid="invite.card">
        <span className="invite-crest" aria-hidden="true">
          <TreePine className="h-7 w-7" strokeWidth={1.75} />
        </span>
        <div className="flex flex-col items-center gap-2">
          <h1 className="invite-title">
            You&rsquo;re invited to {preview.familyDisplayName}
          </h1>
          <p className="invite-hint">
            A signed-out visitor can see this invitation. Sign in to accept it.
          </p>
        </div>
        <div className="invite-rule" aria-hidden="true" />
        <InviteDetails preview={preview} />
        <span className="invite-type-badge">
          {invitationTypeLabel(preview.invitationType)}
        </span>
      </div>

      <div className="invite-gate" data-ocid="invite.signin_gate">
        <div className="flex flex-col items-center gap-1">
          <p className="invite-gate-title">Sign in to accept</p>
          <p className="invite-gate-hint">
            Your invitation will be waiting for you after you sign in.
          </p>
        </div>
        <div className="signin-stack w-full">
          <button
            type="button"
            data-ocid="invite.google_button"
            onClick={() => begin("google")}
            disabled={isLoggingIn}
            className="signin-btn signin-google"
          >
            <span className="signin-logo">
              <GoogleLogo />
            </span>
            Continue with Google
          </button>
          <button
            type="button"
            data-ocid="invite.apple_button"
            onClick={() => begin("apple")}
            disabled={isLoggingIn}
            className="signin-btn signin-apple"
          >
            <span className="signin-logo">
              <AppleLogo />
            </span>
            Continue with Apple
          </button>
        </div>
        {isLoginError ? (
          <p
            className="signin-footnote"
            data-ocid="invite.signin_error_state"
            role="alert"
          >
            We couldn&rsquo;t sign you in
            {loginError ? ` (${loginError.message})` : ""}. Please try again.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** The signed-in valid invitation: the preview plus Accept / Decline. */
function ValidInvitation({
  preview,
  isPending,
  error,
  onAccept,
  onDecline,
}: {
  preview: FamilyInvitationPreview;
  isPending: boolean;
  error: string | null;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="invite-screen" data-ocid="invite.page">
      <div className="invite-card" data-ocid="invite.card">
        <span className="invite-crest" aria-hidden="true">
          <Mail className="h-7 w-7" strokeWidth={1.75} />
        </span>
        <div className="flex flex-col items-center gap-2">
          <h1 className="invite-title">
            You&rsquo;re invited to {preview.familyDisplayName}
          </h1>
          <p className="invite-hint">
            {preview.invitationType === InvitationType.FoundingSteward
              ? "This invitation also nominates you as a founding steward."
              : "Accept to join this family."}
          </p>
        </div>
        <div className="invite-rule" aria-hidden="true" />
        <InviteDetails preview={preview} />
        <span className="invite-type-badge">
          {invitationTypeLabel(preview.invitationType)}
        </span>
      </div>

      {error ? (
        <p
          role="alert"
          data-ocid="invite.error_state"
          className="w-full rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-center text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div className="invite-actions">
        <button
          type="button"
          data-ocid="invite.accept_button"
          onClick={onAccept}
          disabled={isPending}
          className="invite-accept"
        >
          {isPending ? "Working…" : "Accept invitation"}
        </button>
        <button
          type="button"
          data-ocid="invite.decline_button"
          onClick={onDecline}
          disabled={isPending}
          className="invite-decline"
        >
          Decline
        </button>
      </div>
    </div>
  );
}

/** A terminal outcome panel: one calm plate with a status dot-pill. */
function InviteNotice({
  icon,
  title,
  body,
  statusLabel,
  statusTone = "neutral",
  action,
  ocid,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  statusLabel: string;
  statusTone?: "neutral" | "success" | "expired" | "cancelled" | "declined";
  action?: React.ReactNode;
  ocid: string;
}) {
  const toneClass =
    statusTone === "neutral" ? "" : `invite-status-${statusTone}`;
  return (
    <div className="invite-screen" data-ocid="invite.page">
      <div className="invite-notice" data-ocid={ocid}>
        <span className="invite-notice-mark" aria-hidden="true">
          {icon}
        </span>
        <div className="flex flex-col items-center gap-2">
          <h1 className="invite-notice-title">{title}</h1>
          <p className="invite-notice-hint">{body}</p>
        </div>
        <span className={`invite-status ${toneClass}`}>{statusLabel}</span>
        {action}
      </div>
    </div>
  );
}

/** The MembershipPending state shown after a #FamilyMember acceptance. It
 *  renders the applicant-safe confirmation status card inside the existing
 *  limited onboarding state, so a Pending member sees where their confirmation
 *  stands without receiving normal family navigation. */
function MembershipPendingState({ onConsumed }: { onConsumed: () => void }) {
  const { data: membership } = useMyMembershipForFamily();
  return (
    <div className="invite-screen" data-ocid="invite.page">
      <div
        className="invite-notice"
        data-ocid="invite.membership_pending_state"
      >
        <span className="invite-notice-mark" aria-hidden="true">
          <Clock className="h-7 w-7" strokeWidth={1.75} />
        </span>
        <div className="flex flex-col items-center gap-2">
          <h1 className="invite-notice-title">
            Waiting for family confirmation
          </h1>
          <p className="invite-notice-hint">
            Your family connection is waiting for a family member to confirm it.
            If there is a disagreement, a Family Steward will review it.
          </p>
        </div>
        <span className="invite-status">Pending</span>
        <MembershipConfirmationStatusCard
          membershipId={membership?.id ?? null}
          membershipStatus={membership?.status ?? null}
        />
        <button
          type="button"
          data-ocid="invite.continue_button"
          onClick={onConsumed}
          className="invite-accept"
        >
          Go to Norwood
        </button>
      </div>
    </div>
  );
}

/** The Steward-nomination handoff shown after a #FoundingSteward acceptance.
 *  It surfaces the nomination without granting Steward authority or
 *  auto-accepting it, and it never directs a non-Steward nominee into the
 *  Steward-only area. */
function StewardNominationState({ onConsumed }: { onConsumed: () => void }) {
  return (
    <InviteNotice
      ocid="invite.steward_nomination_state"
      icon={<TreePine className="h-7 w-7" strokeWidth={1.75} />}
      title="You&rsquo;re nominated as a founding steward"
      body="Your nomination is preserved. Your membership is awaiting confirmation, and Steward authority has not been granted. Once your membership requirements are satisfied, you can review and accept the nomination."
      statusLabel="Steward nomination"
      action={
        <button
          type="button"
          data-ocid="invite.continue_button"
          onClick={onConsumed}
          className="invite-accept"
        >
          Go to Norwood
        </button>
      }
    />
  );
}

/** The claimed/unavailable terminal state: the invited profile was claimed by
 *  another account after the invitation was issued. It never attaches the
 *  caller and never reveals who claimed the profile. */
function ClaimedUnavailableState({ onConsumed }: { onConsumed: () => void }) {
  return (
    <InviteNotice
      ocid="invite.claimed_unavailable_state"
      icon={<ShieldAlert className="h-7 w-7" strokeWidth={1.75} />}
      title="This invitation is no longer available"
      body="The invited profile has already been connected to another account. Ask the person who invited you for a new link."
      statusLabel="Unavailable"
      statusTone="cancelled"
      action={
        <button
          type="button"
          data-ocid="invite.continue_button"
          onClick={onConsumed}
          className="invite-accept"
        >
          Go to Norwood
        </button>
      }
    />
  );
}

/** Maps a FamilyInvitationError message to a safe terminal state. Never
 *  reveals whether unrelated accounts or families exist. */
function errorNotice(message: string, onConsumed: () => void) {
  const normalized = message.toLowerCase();
  if (normalized.includes("alreadymember")) {
    return (
      <InviteNotice
        ocid="invite.already_member_state"
        icon={<CheckCircle2 className="h-7 w-7" strokeWidth={1.75} />}
        title="Already connected"
        body="You're already connected to this family. There's nothing more to accept."
        statusLabel="Already connected"
        statusTone="success"
        action={
          <button
            type="button"
            data-ocid="invite.continue_button"
            onClick={onConsumed}
            className="invite-accept"
          >
            Go to Norwood
          </button>
        }
      />
    );
  }
  if (normalized.includes("expired")) {
    return (
      <InviteNotice
        ocid="invite.expired_state"
        icon={<Clock className="h-7 w-7" strokeWidth={1.75} />}
        title="Invitation expired"
        body="This invitation has expired. Ask the person who invited you to send a new link."
        statusLabel="Expired"
        statusTone="expired"
      />
    );
  }
  if (normalized.includes("invalidtoken")) {
    return (
      <InviteNotice
        ocid="invite.invalid_state"
        icon={<ShieldAlert className="h-7 w-7" strokeWidth={1.75} />}
        title="This invitation isn't valid"
        body="The invitation link is invalid or has already been used. Ask the person who invited you to send a new link."
        statusLabel="Invalid link"
        statusTone="declined"
      />
    );
  }
  // #NotAuthorized / #FamilyNotFound / #InvalidTransition, an incompatible
  // caller membership, and any other conflict: a generic recovery state with no
  // invitation change. The `"conflict"` sentinel is used by the AlreadyMember
  // disambiguation for an incompatible membership.
  return (
    <InviteNotice
      ocid="invite.conflict_state"
      icon={<ShieldAlert className="h-7 w-7" strokeWidth={1.75} />}
      title="We couldn't complete this invitation"
      body="This invitation can't be accepted with the account you're signed in with. Sign in with the invited account, or ask the person who invited you for a new link."
      statusLabel="Needs attention"
      statusTone="cancelled"
    />
  );
}

export function InviteRedemptionPage({
  rawToken,
  isAuthenticated,
  onSignIn,
  onConsumed,
}: InviteRedemptionPageProps) {
  // Signed-out visitors see the safe preview; signed-in visitors revalidate the
  // token against the backend and never trust the pre-sign-in preview.
  const previewQuery = useInvitationPreview(isAuthenticated ? null : rawToken);
  const redemptionQuery = useInvitationRedemptionState(
    isAuthenticated ? rawToken : null,
  );
  const accept = useAcceptInvitation();
  const decline = useDeclineInvitation();
  const { actor } = useActor(createActor);

  // The post-acceptance outcome. A successful accept does NOT navigate away:
  // the invite surface owns the pending-membership and steward-nomination
  // onboarding states, and the user leaves through an explicit affordance.
  const [acceptedOutcome, setAcceptedOutcome] = useState<
    "membershipPending" | "stewardNomination" | null
  >(null);
  // The accept error tag, captured so the AlreadyMember / claimed-unavailable
  // terminal states are reachable for a signed-in caller even though
  // getInvitationRedemptionState never emits them.
  const [acceptErrorTag, setAcceptErrorTag] = useState<string | null>(null);
  // The caller's own membership in the invitation's family, looked up only when
  // the shared #AlreadyMember error is observed. It disambiguates the error
  // into the safe "Already connected" state, the generic conflict/recovery
  // state, or the claimed/unavailable state. It never reveals whether unrelated
  // accounts or families exist, and it never exposes who owns another profile.
  const [callerMembership, setCallerMembership] =
    useState<CallerMembershipLookup>({ kind: "pending" });

  const isPending = accept.isPending || decline.isPending;
  const mutationError =
    accept.error instanceof Error
      ? accept.error.message
      : decline.error instanceof Error
        ? decline.error.message
        : null;

  if (!rawToken) {
    return (
      <InviteNotice
        ocid="invite.invalid_state"
        icon={<ShieldAlert className="h-7 w-7" strokeWidth={1.75} />}
        title="Invitation link not found"
        body="This invitation link is missing its token. Ask the person who invited you to send a new link."
        statusLabel="Invalid link"
        statusTone="declined"
      />
    );
  }

  // ---- Signed-out: safe preview + sign-in gate ----------------------------
  if (!isAuthenticated) {
    if (previewQuery.isLoading || !previewQuery.data) {
      return (
        <div className="invite-screen" data-ocid="invite.page">
          <div
            data-ocid="invite.loading_state"
            className="invite-card"
            aria-label="Validating invitation"
          >
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-accent" />
            <p className="invite-hint">Checking your invitation…</p>
          </div>
        </div>
      );
    }
    const previewResult = previewQuery.data;
    if (previewResult.__kind__ === "err") {
      // The signed-out preview error path maps #AlreadyMember to the safe
      // "Already connected" state rather than a generic invalid state.
      return errorNotice(previewResult.err, onConsumed);
    }
    return (
      <SignInGate
        preview={previewResult.ok}
        rawToken={rawToken}
        onSignIn={onSignIn}
      />
    );
  }

  // ---- Post-acceptance onboarding states ----------------------------------
  if (acceptedOutcome === "membershipPending") {
    return <MembershipPendingState onConsumed={onConsumed} />;
  }
  if (acceptedOutcome === "stewardNomination") {
    return <StewardNominationState onConsumed={onConsumed} />;
  }

  // ---- Signed-in: revalidated redemption state ----------------------------
  if (redemptionQuery.isLoading || !redemptionQuery.data) {
    return (
      <div className="invite-screen" data-ocid="invite.page">
        <div
          data-ocid="invite.loading_state"
          className="invite-card"
          aria-label="Validating invitation"
        >
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-accent" />
          <p className="invite-hint">Checking your invitation…</p>
        </div>
      </div>
    );
  }

  const redemptionResult = redemptionQuery.data;
  if (redemptionResult.__kind__ === "err") {
    return errorNotice(redemptionResult.err, onConsumed);
  }

  const state: InvitationRedemptionState = redemptionResult.ok;

  // The accept error path is the only place the shared #AlreadyMember tag is
  // observable. The caller's own membership is queried safely before any
  // terminal state renders:
  //   - a membership for the invitation's target profile that is Active is the
  //     "already connected" case,
  //   - a membership for a different person, or one that is Suspended, Left, or
  //     otherwise not active, is an incompatible state and renders the generic
  //     conflict/recovery state,
  //   - no membership means the invited profile was claimed by another account,
  //     so the claimed/unavailable state applies.
  // The UI never exposes who owns another profile.
  if (acceptErrorTag === "AlreadyMember") {
    if (callerMembership.kind === "pending") {
      return (
        <div className="invite-screen" data-ocid="invite.page">
          <div
            data-ocid="invite.loading_state"
            className="invite-card"
            aria-label="Checking your membership"
          >
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-accent" />
            <p className="invite-hint">Checking your membership…</p>
          </div>
        </div>
      );
    }
    if (callerMembership.kind === "member") {
      if (
        state.__kind__ === "Valid" &&
        isAlreadyConnectedMembership(
          callerMembership.membership,
          state.Valid.targetPersonId,
        )
      ) {
        return errorNotice("AlreadyMember", onConsumed);
      }
      return errorNotice("conflict", onConsumed);
    }
    if (callerMembership.kind === "none") {
      return <ClaimedUnavailableState onConsumed={onConsumed} />;
    }
    // The lookup failed: the caller's membership cannot be determined, so the
    // honest, recoverable generic conflict state applies rather than asserting
    // that the profile was claimed by someone else.
    return errorNotice("conflict", onConsumed);
  }

  switch (state.__kind__) {
    case "Valid":
      return (
        <ValidInvitation
          preview={state.Valid}
          isPending={isPending}
          error={mutationError}
          onAccept={() => {
            setAcceptErrorTag(null);
            setCallerMembership({ kind: "pending" });
            accept.mutate(rawToken, {
              onSuccess: (invitation) => {
                if (
                  invitation?.invitationType === InvitationType.FoundingSteward
                ) {
                  // Surface the Steward nomination and hand off to the existing
                  // authenticated nominee-acceptance flow; never grant Steward
                  // authority or auto-accept the nomination.
                  setAcceptedOutcome("stewardNomination");
                  return;
                }
                // #FamilyMember: membership is pending confirmation. Show the
                // pending-membership onboarding state; the user leaves through
                // the explicit continue affordance.
                setAcceptedOutcome("membershipPending");
              },
              onError: (error) => {
                const tag =
                  error instanceof Error ? error.message : String(error);
                setAcceptErrorTag(tag);
                if (tag === "AlreadyMember") {
                  // Disambiguate the shared #AlreadyMember tag by querying the
                  // caller's own membership in this family. The lookup is
                  // awaited before any terminal state renders, so the UI never
                  // guesses between "already connected", an incompatible
                  // membership, and a profile claimed by another account.
                  void (async () => {
                    if (!actor) {
                      setCallerMembership({ kind: "unknown" });
                      return;
                    }
                    try {
                      const result = await actor.getMyMembershipForFamily(
                        state.Valid.familyId,
                      );
                      if (result.__kind__ === "ok" && result.ok !== null) {
                        setCallerMembership({
                          kind: "member",
                          membership: result.ok,
                        });
                      } else {
                        setCallerMembership({ kind: "none" });
                      }
                    } catch {
                      setCallerMembership({ kind: "unknown" });
                    }
                  })();
                }
              },
            });
          }}
          onDecline={() => {
            decline.mutate(rawToken, { onSuccess: onConsumed });
          }}
        />
      );
    case "AlreadyAccepted":
      return (
        <InviteNotice
          ocid="invite.already_accepted_state"
          icon={<CheckCircle2 className="h-7 w-7" strokeWidth={1.75} />}
          title="Invitation accepted"
          body="This invitation has already been accepted. Family access may still be waiting for membership confirmation."
          statusLabel="Accepted"
          statusTone="success"
          action={
            <button
              type="button"
              data-ocid="invite.continue_button"
              onClick={onConsumed}
              className="invite-accept"
            >
              Go to Norwood
            </button>
          }
        />
      );
    case "Declined":
      return (
        <InviteNotice
          ocid="invite.declined_state"
          icon={<XCircle className="h-7 w-7" strokeWidth={1.75} />}
          title="Invitation declined"
          body="This invitation was declined. Ask the person who invited you if you'd like a new link."
          statusLabel="Declined"
          statusTone="declined"
        />
      );
    case "Cancelled":
      return (
        <InviteNotice
          ocid="invite.cancelled_state"
          icon={<XCircle className="h-7 w-7" strokeWidth={1.75} />}
          title="Invitation cancelled"
          body="This invitation was cancelled by the person who sent it."
          statusLabel="Cancelled"
          statusTone="cancelled"
        />
      );
    case "Expired":
      return (
        <InviteNotice
          ocid="invite.expired_state"
          icon={<Clock className="h-7 w-7" strokeWidth={1.75} />}
          title="Invitation expired"
          body="This invitation has expired. Ask the person who invited you to send a new link."
          statusLabel="Expired"
          statusTone="expired"
        />
      );
    default:
      return (
        <InviteNotice
          ocid="invite.invalid_state"
          icon={<ShieldAlert className="h-7 w-7" strokeWidth={1.75} />}
          title="This invitation isn't valid"
          body="The invitation link is invalid or has already been used. Ask the person who invited you to send a new link."
          statusLabel="Invalid link"
          statusTone="declined"
        />
      );
  }
}

// MembershipPendingState, StewardNominationState, and ClaimedUnavailableState
// are the post-acceptance outcomes. They are rendered by the invite surface
// once the acceptance mutation resolves; exported here so the invite surface
// owns their presentation.
export {
  MembershipPendingState,
  StewardNominationState,
  ClaimedUnavailableState,
};
