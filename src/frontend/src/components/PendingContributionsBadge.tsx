import { usePendingCount } from "../hooks/usePendingCount";

/**
 * The numeric badge shown on the Pending Contributions nav item for Family
 * Stewards. It reads the backend's aggregate pending-review count and renders
 * a small red pill (same alert style as the Notifications badge) only when
 * there is at least one pending item. Non-stewards never see it.
 *
 * The component is self-contained so the Layout can import and render it next
 * to the Pending Contributions link.
 */
export default function PendingContributionsBadge() {
  const { data: count = 0 } = usePendingCount();
  if (count <= 0) return null;

  return (
    <span
      data-ocid="pending_contributions_badge"
      aria-label={`${count} pending contribution${count === 1 ? "" : "s"}`}
      className="pending-badge"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
