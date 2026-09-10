import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface DomainEmptyStateProps {
  /** Icon shown in the circular mark above the title. */
  icon: LucideIcon;
  /** Headline for the empty state. */
  title: string;
  /** Supporting hint text. */
  hint: string;
  /** Optional primary action rendered below the hint. */
  action?: ReactNode;
}

/**
 * Shared polished empty state for the three family-history pages (Family
 * Stories, Family Mysteries, Travel Through Time). Uses the domain-empty
 * utility classes from index.css so all three pages read as one family.
 */
export function DomainEmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: DomainEmptyStateProps) {
  return (
    <div data-ocid="domain.empty_state" className="domain-empty">
      <span className="domain-empty-mark" aria-hidden="true">
        <Icon className="h-6 w-6" strokeWidth={1.75} />
      </span>
      <h2 className="domain-empty-title">{title}</h2>
      <p className="domain-empty-hint">{hint}</p>
      {action}
    </div>
  );
}
