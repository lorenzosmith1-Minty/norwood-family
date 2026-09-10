import type { ReactNode } from "react";

interface EraSectionProps {
  /** Display heading for the era, e.g. "Early 1900s". */
  title: string;
  /** Year range caption, e.g. "1900–1929". */
  years: string;
  /** The era's timeline event cards. */
  children: ReactNode;
}

/**
 * One chronological era in the Travel Through Time view. Renders a framed
 * era plate (era-section) with a tracked heading and a vertical timeline rail
 * (timeline-rail) holding the era's event cards.
 */
export function EraSection({ title, years, children }: EraSectionProps) {
  return (
    <section data-ocid="era_section" className="era-section">
      <div className="era-head">
        <h2 className="era-title">{title}</h2>
        <span className="era-years">{years}</span>
      </div>
      <div className="timeline-rail">{children}</div>
    </section>
  );
}
