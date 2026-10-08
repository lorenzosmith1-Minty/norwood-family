import {
  ArrowRight,
  ClipboardCheck,
  Download,
  EyeOff,
  Flag,
  FolderArchive,
  GitMerge,
  Inbox,
  KeyRound,
  Landmark,
  Network,
  ScrollText,
  ShieldCheck,
  UserCheck,
  UserCog,
} from "lucide-react";
import { ExportScope } from "../backend";
import PendingContributionsBadge from "../components/PendingContributionsBadge";
import { useFamilyScopedId } from "../context/FamilyContext";
import { useArchiveBundleDownload } from "../hooks/useArchiveBundleDownload";
import { usePendingArchiveItems } from "../hooks/useArchiveStorage";
import { useExportDownload } from "../hooks/useExportDownload";
import { useMembershipReviews } from "../hooks/useMembershipReviews";
import { useListReports } from "../hooks/useMessaging";
import { useListProfileClaims } from "../hooks/useProfileClaims";
import { useRecoveryRequestCount } from "../hooks/useRecovery";
import { useListRelationshipRequests } from "../hooks/useRelationshipRequests";
import { useGetReviewQueue } from "../hooks/useResearchIntake";
import { useIsSteward } from "../hooks/useStewardAuthority";
import { BUNDLE_TOO_LARGE_MESSAGE } from "../lib/archiveBundleLimits";

interface FamilyStewardHubPageProps {
  onBack: () => void;
  onOpenReview: () => void;
  onOpenPendingContributions: () => void;
  onOpenGovernance: () => void;
  onOpenResearchIntake: () => void;
  onOpenHiddenPosts: () => void;
  onOpenMembershipReviews: () => void;
  /**
   * Opens the Recovery Reviews queue. Optional so existing hub call sites that
   * predate the recovery surface keep compiling; the card is only rendered when
   * a handler is supplied.
   */
  onOpenRecoveryReviews?: () => void;
}

/**
 * A small count pill shown on a steward option card. It reads a canonical
 * backend-derived count and renders a compact badge only when there is at
 * least one pending item, so stewards can see at a glance how much work is
 * waiting in each area without any separate counter state.
 */
function StewardCountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      data-ocid="steward_hub.count_badge"
      aria-label={`${count} pending`}
      className="steward-count-badge"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * "Download family archive" card for the Family Steward hub.
 *
 * Requests the active family's archive through the existing Phase 5A
 * `exportFamilyArchive` action (via the shared export-download hook) and turns
 * the versioned envelope into an ephemeral client-side JSON download. The card
 * is only rendered for an active Steward (the hub itself is Steward-gated), and
 * the backend remains the authorization boundary — a rejection produces no
 * download and only neutral feedback.
 *
 * The full exported JSON is never displayed in the application; it is written
 * only to the ephemeral download blob. While a request is in flight the control
 * is disabled so repeated clicks cannot start overlapping exports.
 */
function FamilyArchiveDownloadCard() {
  const { phase, isPreparing, start, reset } = useExportDownload();
  const bundle = useArchiveBundleDownload();

  const statusCopy =
    phase === "preparing"
      ? "Preparing export…"
      : phase === "ready"
        ? "Download ready — download started."
        : phase === "denied"
          ? "You do not have permission to download this archive."
          : phase === "failed"
            ? "Export failed — try again."
            : null;

  const statusTone =
    phase === "ready"
      ? "status-approved"
      : phase === "denied" || phase === "failed"
        ? "status-rejected"
        : "status-pending";

  // The bundle hook already produces the exact required progress copy
  // ("Preparing archive…", "Retrieving media X of Y", "Creating archive…",
  // "Download started", "Archive could not be created"). The too-large outcome
  // is rendered from the shared neutral message so the copy stays in one place.
  const bundleStatusCopy =
    bundle.phase === "too-large" ? BUNDLE_TOO_LARGE_MESSAGE : bundle.statusCopy;

  const bundleStatusTone =
    bundle.state === "ready"
      ? "status-approved"
      : bundle.state === "error"
        ? "status-rejected"
        : "status-pending";

  const bundleStatusOcid =
    bundle.state === "ready"
      ? "steward_hub.download_bundle_success_state"
      : bundle.state === "too-large"
        ? "steward_hub.download_bundle_too_large_state"
        : bundle.state === "error"
          ? "steward_hub.download_bundle_error_state"
          : "steward_hub.download_bundle_progress_state";

  return (
    <div
      data-ocid="steward_hub.download_archive_card"
      className="hub-option hub-accent-steward"
    >
      <span className="hub-option-head">
        <span className="hub-option-icon">
          <Download className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className="hub-option-title">Download family archive</span>
      </span>
      <span className="hub-option-desc">
        Download a portable copy of this family&apos;s archive.
      </span>
      <button
        type="button"
        data-ocid="steward_hub.download_archive_button"
        onClick={() => start(ExportScope.FamilyArchive)}
        disabled={isPreparing}
        aria-busy={isPreparing}
        className="preview-download mt-1 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPreparing ? "Preparing export…" : "Download archive"}
      </button>
      {statusCopy ? (
        <output
          data-ocid={
            phase === "ready"
              ? "steward_hub.download_archive_success_state"
              : phase === "preparing"
                ? "steward_hub.download_archive_loading_state"
                : "steward_hub.download_archive_error_state"
          }
          aria-live="polite"
          className={`status-pill ${statusTone}`}
        >
          {statusCopy}
        </output>
      ) : null}
      {phase === "denied" || phase === "failed" ? (
        <button
          type="button"
          data-ocid="steward_hub.download_archive_retry_button"
          onClick={reset}
          className="preview-download"
        >
          Try again
        </button>
      ) : null}

      <span className="hub-option-desc mt-3">
        Download the archive as a ZIP bundle with its media files included.
      </span>
      <button
        type="button"
        data-ocid="steward_hub.download_bundle_button"
        onClick={bundle.start}
        disabled={bundle.isGenerating}
        aria-busy={bundle.isGenerating}
        className="preview-download mt-1 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {bundle.isGenerating
          ? "Preparing archive…"
          : "Download family archive bundle"}
      </button>
      {bundleStatusCopy ? (
        <output
          data-ocid={bundleStatusOcid}
          aria-live="polite"
          className={`status-pill ${bundleStatusTone}`}
        >
          {bundleStatusCopy}
        </output>
      ) : null}
      {bundle.state === "error" || bundle.state === "too-large" ? (
        <button
          type="button"
          data-ocid="steward_hub.download_bundle_retry_button"
          onClick={bundle.reset}
          className="preview-download"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

/**
 * Family Steward hub: groups every administrative function for authorized
 * Family Stewards behind large option cards that mirror the Home navigation
 * cards. Each option reuses its existing page/function — this hub only routes
 * to it. The page is admin-gated: normal family members never see any Steward
 * controls. Pending counts are derived from canonical backend records and shown
 * by category (profile claims, archive items, relationship requests, reported
 * messages) so stewards can gauge the workload at a glance.
 */
export function FamilyStewardHubPage({
  onBack,
  onOpenReview,
  onOpenPendingContributions,
  onOpenGovernance,
  onOpenResearchIntake,
  onOpenHiddenPosts,
  onOpenMembershipReviews,
  onOpenRecoveryReviews,
}: FamilyStewardHubPageProps) {
  const { data: isSteward = false } = useIsSteward();
  const familyId = useFamilyScopedId();
  const { data: claims = [] } = useListProfileClaims(familyId);
  const { data: requests = [] } = useListRelationshipRequests(familyId);
  const { data: reports = [] } = useListReports();
  const { data: pendingArchiveItems = [] } = usePendingArchiveItems();
  const { data: reviewQueue } = useGetReviewQueue();
  const { data: membershipReviews = [] } = useMembershipReviews();
  // Ordinary Account Recovery requests awaiting a Steward decision. Derived
  // from the canonical Steward queue so the hub card and the Recovery Reviews
  // page always agree.
  const pendingRecoveryCount = useRecoveryRequestCount();

  const pendingClaims = claims.filter((c) => c.status === "Pending").length;
  const pendingRequests = requests.filter((r) => r.status === "Pending").length;
  const pendingReports = reports.filter((r) => r.status === "Pending").length;
  const pendingArchiveCount = pendingArchiveItems.length;
  // Research intake items awaiting steward review: pending items, items flagged
  // as needing further research, and unresolved conflicts. This matches the
  // canonical definition used by the StewardActionBadge nav pill
  // (reviewQueue.pending + reviewQueue.needsResearch + reviewQueue.conflicting),
  // so the hub card and the nav badge always agree.
  const pendingResearchCount = reviewQueue
    ? Number(reviewQueue.pending) +
      Number(reviewQueue.needsResearch) +
      Number(reviewQueue.conflicting)
    : 0;
  // Membership-confirmation cases awaiting Steward review. The canonical
  // Steward read already returns only unresolved (#StewardReviewRequired)
  // cases, so the count is the list length and the hub card always agrees with
  // the Membership Reviews page.
  const pendingMembershipReviewCount = membershipReviews.length;

  // Normal family members must never see Steward controls. The nav link is
  // already gated to Stewards; this guard is defense-in-depth so a direct
  // navigation to the hub still renders nothing for non-Stewards. Authority is
  // the canonical active-Steward check, never the platform admin role.
  if (!isSteward) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <header className="hub-header mb-8">
          <button
            type="button"
            data-ocid="steward_hub.back_button"
            onClick={onBack}
            aria-label="Back to Home"
            className="hub-back"
          >
            <ArrowRight className="h-5 w-5 rotate-180" aria-hidden="true" />
          </button>
          <div className="min-w-0">
            <h1 className="hub-title">Family Steward</h1>
            <p className="hub-subtitle">
              Review, govern, and keep the family archive safe.
            </p>
          </div>
        </header>
        <div
          data-ocid="steward_hub.unauthorized_state"
          className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 px-6 py-16 text-center"
        >
          <p className="font-display text-xl font-semibold text-foreground">
            Steward access only
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            The Family Steward area is reserved for authorized Stewards. If you
            believe this is a mistake, contact a current Steward.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <header className="hub-header mb-8">
        <button
          type="button"
          data-ocid="steward_hub.back_button"
          onClick={onBack}
          aria-label="Back to Home"
          className="hub-back"
        >
          <ArrowRight className="h-5 w-5 rotate-180" aria-hidden="true" />
        </button>
        <div className="min-w-0">
          <h1 className="hub-title">Family Steward</h1>
          <p className="hub-subtitle">
            Review, govern, and keep the family archive safe.
          </p>
        </div>
      </header>

      <div data-ocid="steward_hub.grid" className="hub-grid">
        <button
          type="button"
          data-ocid="steward_hub.research_intake_option"
          onClick={onOpenResearchIntake}
          className="hub-option hub-accent-steward"
        >
          <span className="hub-option-head">
            <span className="hub-option-icon">
              <ScrollText
                className="h-5 w-5"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </span>
            <span className="hub-option-title">Research Intake</span>
            <StewardCountBadge count={pendingResearchCount} />
            <span className="hub-option-arrow" aria-hidden="true">
              →
            </span>
          </span>
          <span className="hub-option-desc">
            Record sources, proposed findings, and new person candidates.
          </span>
        </button>

        <button
          type="button"
          data-ocid="steward_hub.review_option"
          onClick={onOpenReview}
          className="hub-option hub-accent-steward"
        >
          <span className="hub-option-head">
            <span className="hub-option-icon">
              <ClipboardCheck
                className="h-5 w-5"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </span>
            <span className="hub-option-title">Review Requests</span>
            <StewardCountBadge count={pendingClaims} />
            <span className="hub-option-arrow" aria-hidden="true">
              →
            </span>
          </span>
          <span className="hub-option-desc">
            Confirm profile claims and family connections.
          </span>
        </button>

        <button
          type="button"
          data-ocid="steward_hub.membership_reviews_option"
          onClick={onOpenMembershipReviews}
          className="hub-option hub-accent-steward"
        >
          <span className="hub-option-head">
            <span className="hub-option-icon">
              <UserCheck
                className="h-5 w-5"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </span>
            <span className="hub-option-title">Membership Reviews</span>
            <StewardCountBadge count={pendingMembershipReviewCount} />
            <span className="hub-option-arrow" aria-hidden="true">
              →
            </span>
          </span>
          <span className="hub-option-desc">
            Resolve membership cases that need a Steward decision.
          </span>
        </button>

        {onOpenRecoveryReviews ? (
          <button
            type="button"
            data-ocid="steward_hub.recovery_reviews_option"
            onClick={onOpenRecoveryReviews}
            className="hub-option hub-accent-steward"
          >
            <span className="hub-option-head">
              <span className="hub-option-icon">
                <KeyRound
                  className="h-5 w-5"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </span>
              <span className="hub-option-title">Recovery Reviews</span>
              <StewardCountBadge count={pendingRecoveryCount} />
              <span className="hub-option-arrow" aria-hidden="true">
                →
              </span>
            </span>
            <span className="hub-option-desc">
              Decide requests from family members who need access to a profile
              restored.
            </span>
          </button>
        ) : null}

        <button
          type="button"
          data-ocid="steward_hub.pending_option"
          onClick={onOpenPendingContributions}
          className="hub-option hub-accent-steward"
        >
          <span className="hub-option-head">
            <span className="hub-option-icon">
              <Inbox
                className="h-5 w-5"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </span>
            <span className="hub-option-title">Pending Contributions</span>
            <StewardCountBadge count={pendingArchiveCount} />
            <span className="hub-option-arrow" aria-hidden="true">
              →
            </span>
          </span>
          <span className="hub-option-desc">
            Approve or reject new archive contributions.
          </span>
          <PendingContributionsBadge />
        </button>

        <FamilyArchiveDownloadCard />

        <button
          type="button"
          data-ocid="steward_hub.governance_option"
          onClick={onOpenGovernance}
          className="hub-option hub-accent-steward"
        >
          <span className="hub-option-head">
            <span className="hub-option-icon">
              <Landmark
                className="h-5 w-5"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </span>
            <span className="hub-option-title">Family Governance</span>
            <span className="hub-option-arrow" aria-hidden="true">
              →
            </span>
          </span>
          <span className="hub-option-desc">
            Manage stewards, successors, and safety controls.
          </span>
        </button>

        <button
          type="button"
          data-ocid="steward_hub.stewards_option"
          onClick={onOpenGovernance}
          className="hub-option hub-accent-steward"
        >
          <span className="hub-option-head">
            <span className="hub-option-icon">
              <UserCog
                className="h-5 w-5"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </span>
            <span className="hub-option-title">Steward Management</span>
            <span className="hub-option-arrow" aria-hidden="true">
              →
            </span>
          </span>
          <span className="hub-option-desc">
            Promote and remove Family Stewards.
          </span>
        </button>

        <button
          type="button"
          data-ocid="steward_hub.duplicates_option"
          onClick={onOpenGovernance}
          className="hub-option hub-accent-steward"
        >
          <span className="hub-option-head">
            <span className="hub-option-icon">
              <GitMerge
                className="h-5 w-5"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </span>
            <span className="hub-option-title">Duplicate Profiles</span>
            <span className="hub-option-arrow" aria-hidden="true">
              →
            </span>
          </span>
          <span className="hub-option-desc">
            Review and merge duplicate family profiles.
          </span>
        </button>

        <button
          type="button"
          data-ocid="steward_hub.relationships_option"
          onClick={onOpenGovernance}
          className="hub-option hub-accent-steward"
        >
          <span className="hub-option-head">
            <span className="hub-option-icon">
              <Network
                className="h-5 w-5"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </span>
            <span className="hub-option-title">Relationship Management</span>
            <StewardCountBadge count={pendingRequests} />
            <span className="hub-option-arrow" aria-hidden="true">
              →
            </span>
          </span>
          <span className="hub-option-desc">
            Add, correct, and remove family relationships.
          </span>
        </button>

        <button
          type="button"
          data-ocid="steward_hub.archived_option"
          onClick={onOpenGovernance}
          className="hub-option hub-accent-steward"
        >
          <span className="hub-option-head">
            <span className="hub-option-icon">
              <FolderArchive
                className="h-5 w-5"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </span>
            <span className="hub-option-title">Archived Profiles</span>
            <span className="hub-option-arrow" aria-hidden="true">
              →
            </span>
          </span>
          <span className="hub-option-desc">
            Restore or permanently remove archived profiles.
          </span>
        </button>

        <button
          type="button"
          data-ocid="steward_hub.audit_option"
          onClick={onOpenGovernance}
          className="hub-option hub-accent-steward"
        >
          <span className="hub-option-head">
            <span className="hub-option-icon">
              <ShieldCheck
                className="h-5 w-5"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </span>
            <span className="hub-option-title">Audit History</span>
            <span className="hub-option-arrow" aria-hidden="true">
              →
            </span>
          </span>
          <span className="hub-option-desc">
            Review the steward action log.
          </span>
        </button>

        <button
          type="button"
          data-ocid="steward_hub.reported_option"
          onClick={onOpenReview}
          className="hub-option hub-accent-steward"
        >
          <span className="hub-option-head">
            <span className="hub-option-icon">
              <Flag className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span className="hub-option-title">Reported Messages</span>
            <StewardCountBadge count={pendingReports} />
            <span className="hub-option-arrow" aria-hidden="true">
              →
            </span>
          </span>
          <span className="hub-option-desc">
            Review messages reported by family members.
          </span>
        </button>

        <button
          type="button"
          data-ocid="steward_hub.hidden_posts_option"
          onClick={onOpenHiddenPosts}
          className="hub-option hub-accent-steward"
        >
          <span className="hub-option-head">
            <span className="hub-option-icon">
              <EyeOff
                className="h-5 w-5"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </span>
            <span className="hub-option-title">Hidden / Moderated Posts</span>
            <span className="hub-option-arrow" aria-hidden="true">
              →
            </span>
          </span>
          <span className="hub-option-desc">
            Review hidden posts and restore them to the Message Board.
          </span>
        </button>
      </div>
    </div>
  );
}
