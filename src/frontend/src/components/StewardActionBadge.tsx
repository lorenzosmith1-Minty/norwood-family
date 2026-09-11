import { ReportStatus } from "@/backend";
import { useIsAdmin, usePendingArchiveItems } from "../hooks/useArchiveStorage";
import { useListReports } from "../hooks/useMessaging";
import { useListProfileClaims } from "../hooks/useProfileClaims";
import { useListRelationshipRequests } from "../hooks/useRelationshipRequests";

/**
 * The aggregate action badge shown on the Family Steward nav pill. It sums the
 * pending steward-review work across every category — pending profile claims,
 * pending archive contributions, pending relationship requests, and pending
 * reported messages — and renders a small red pill (same alert style as the
 * Notifications badge) only when at least one action awaits review.
 *
 * Every count is derived from canonical backend records; no separate counter
 * state is kept. The component only mounts inside the steward nav link (which
 * is gated to authorized Stewards), so the steward-only queries never fire for
 * a non-steward caller.
 */
export function StewardActionBadge() {
  const { data: isAdmin = false } = useIsAdmin();
  const { data: claims = [] } = useListProfileClaims();
  const { data: requests = [] } = useListRelationshipRequests();
  const { data: reports = [] } = useListReports();
  const { data: pendingArchive = [] } = usePendingArchiveItems();

  if (!isAdmin) return null;

  const count =
    claims.filter((claim) => claim.status === "Pending").length +
    requests.filter((request) => request.status === "Pending").length +
    reports.filter((report) => report.status === ReportStatus.Pending).length +
    pendingArchive.length;

  if (count <= 0) return null;

  return (
    <span
      data-ocid="steward_action_badge"
      aria-label={`${count} steward action${count === 1 ? "" : "s"} awaiting review`}
      className="pending-badge"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
