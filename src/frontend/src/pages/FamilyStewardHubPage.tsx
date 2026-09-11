import {
  ArrowRight,
  ClipboardCheck,
  Flag,
  FolderArchive,
  GitMerge,
  Inbox,
  Landmark,
  Network,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import PendingContributionsBadge from "../components/PendingContributionsBadge";
import { useIsAdmin, usePendingArchiveItems } from "../hooks/useArchiveStorage";
import { useListReports } from "../hooks/useMessaging";
import { useListProfileClaims } from "../hooks/useProfileClaims";
import { useListRelationshipRequests } from "../hooks/useRelationshipRequests";

interface FamilyStewardHubPageProps {
  onBack: () => void;
  onOpenReview: () => void;
  onOpenPendingContributions: () => void;
  onOpenGovernance: () => void;
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
}: FamilyStewardHubPageProps) {
  const { data: isAdmin = false } = useIsAdmin();
  const { data: claims = [] } = useListProfileClaims();
  const { data: requests = [] } = useListRelationshipRequests();
  const { data: reports = [] } = useListReports();
  const { data: pendingArchiveItems = [] } = usePendingArchiveItems();

  const pendingClaims = claims.filter((c) => c.status === "Pending").length;
  const pendingRequests = requests.filter((r) => r.status === "Pending").length;
  const pendingReports = reports.filter((r) => r.status === "Pending").length;
  const pendingArchiveCount = pendingArchiveItems.length;

  // Normal family members must never see Steward controls. The nav link is
  // already gated to Stewards; this guard is defense-in-depth so a direct
  // navigation to the hub still renders nothing for non-Stewards.
  if (!isAdmin) {
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
      </div>
    </div>
  );
}
