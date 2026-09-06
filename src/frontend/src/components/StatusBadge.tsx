import { resolveStatusBadge } from "../types/ownership";

/**
 * A reusable, data-driven status badge for the profile-ownership and
 * relationship-verification workflows. It renders claim status (Unclaimed /
 * Claimed / Pending), relationship verification status (Confirmed / Pending /
 * Disputed), or relationship-request status (Pending / Approved / Rejected)
 * using the design tokens already added to index.css (.claim-badge and
 * .rel-status pills). Unknown statuses render nothing rather than a broken
 * badge.
 */
export interface StatusBadgeProps {
  /** Which status vocabulary the badge belongs to. */
  kind: "claim" | "relationship" | "relationshipRequest";
  /** The raw status string, e.g. "Unclaimed", "Confirmed", "Approved". */
  status: string;
}

export function StatusBadge({ kind, status }: StatusBadgeProps) {
  const resolved = resolveStatusBadge(kind, status);
  if (!resolved) return null;
  return (
    <span
      data-ocid="status_badge"
      className={`${resolved.base} ${resolved.tone}`}
    >
      {resolved.label}
    </span>
  );
}
