import { ShieldCheck, UserCog } from "lucide-react";
import { useState } from "react";
import { ArchivedProfilesTab } from "../components/governance/ArchivedProfilesTab";
import { AuditHistoryTab } from "../components/governance/AuditHistoryTab";
import { DuplicateReviewTab } from "../components/governance/DuplicateReviewTab";
import { RelationshipAdminTab } from "../components/governance/RelationshipAdminTab";
import { ReviewRequestsTab } from "../components/governance/ReviewRequestsTab";
import { StewardManagementTab } from "../components/governance/StewardManagementTab";
import { useIsAdmin } from "../hooks/useArchiveStorage";

type GovernanceTab =
  | "review"
  | "stewards"
  | "duplicates"
  | "relationships"
  | "archived"
  | "audit";

const TABS: { id: GovernanceTab; label: string }[] = [
  { id: "review", label: "Review Requests" },
  { id: "stewards", label: "Steward Management" },
  { id: "duplicates", label: "Duplicate Profiles" },
  { id: "relationships", label: "Relationship Management" },
  { id: "archived", label: "Archived Profiles" },
  { id: "audit", label: "Audit History" },
];

interface FamilyStewardGovernancePageProps {
  onBack: () => void;
}

export function FamilyStewardGovernancePage({
  onBack,
}: FamilyStewardGovernancePageProps) {
  const { data: isAdmin = false, isLoading: adminLoading } = useIsAdmin();
  const [activeTab, setActiveTab] = useState<GovernanceTab>("review");

  if (!adminLoading && !isAdmin) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <button
          type="button"
          data-ocid="governance.back_button"
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span aria-hidden="true">←</span> Back to Home
        </button>
        <div
          data-ocid="governance.unauthorized_state"
          className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center"
        >
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <ShieldCheck
              className="h-7 w-7 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </div>
          <h1 className="font-display text-xl font-semibold text-foreground">
            Family Stewards only
          </h1>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            This governance area is reserved for authorized Family Stewards who
            manage stewards, review duplicates, and keep the family tree safe.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <button
        type="button"
        data-ocid="governance.back_button"
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span aria-hidden="true">←</span> Back to Home
      </button>

      <header className="mb-6">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <UserCog
            className="h-3.5 w-3.5 text-accent-foreground"
            aria-hidden="true"
          />
          Family Governance
        </div>
        <h1 className="font-display text-3xl font-semibold text-foreground">
          Steward Controls
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage stewards and succession, review duplicate profiles, correct
          relationships, and keep the family tree safe.
        </p>
      </header>

      <nav
        data-ocid="governance.tabs"
        className="gov-tabs"
        aria-label="Family Steward areas"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            data-ocid={`governance.tab.${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            aria-pressed={activeTab === tab.id}
            className={`gov-tab ${activeTab === tab.id ? "gov-tab-active" : ""}`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div data-ocid="governance.panel" className="gov-panel mt-6">
        {activeTab === "review" ? (
          <ReviewRequestsTab />
        ) : activeTab === "stewards" ? (
          <StewardManagementTab />
        ) : activeTab === "duplicates" ? (
          <DuplicateReviewTab />
        ) : activeTab === "relationships" ? (
          <RelationshipAdminTab />
        ) : activeTab === "archived" ? (
          <ArchivedProfilesTab />
        ) : (
          <AuditHistoryTab />
        )}
      </div>
    </div>
  );
}
