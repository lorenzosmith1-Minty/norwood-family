import type { Mystery } from "@/types/family-history";
import { MysteryStatus } from "@/types/family-history";
import {
  MYSTERY_CONTRIBUTION_TYPE_LABELS,
  MYSTERY_STATUS_LABELS,
} from "@/types/family-history";
import { Check, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { DomainEmptyState } from "../components/DomainEmptyState";
import { MysteryCard } from "../components/MysteryCard";
import { MysteryContributionForm } from "../components/MysteryContributionForm";
import { MysteryDetail } from "../components/MysteryDetail";
import { useIsAdmin } from "../hooks/useArchiveStorage";
import { useAuth } from "../hooks/useAuth";
import {
  useCreateCanonicalMystery,
  useMysteries,
  usePendingMysteryContributions,
  useReviewMysteryContribution,
} from "../hooks/useFamilyHistory";

interface MysteriesPageProps {
  /** Navigates back to the home screen. */
  onBack: () => void;
  /** Navigates to a related person's profile (wired by the app shell). */
  onOpenProfile?: (id: string) => void;
  /** Mystery id to open directly in the detail view on mount (e.g. from a timeline link). */
  initialMysteryId?: bigint | null;
}

type StatusFilter = "All" | MysteryStatus;

const STATUS_FILTERS: StatusFilter[] = [
  "All",
  MysteryStatus.Open,
  MysteryStatus.Researching,
  MysteryStatus.PartiallyResolved,
  MysteryStatus.Resolved,
];

/** Shortens a contributor principal to a readable, copy-safe label. */
function formatContributor(contributor: Mystery["contributor"]): string {
  const text = contributor.toText();
  return text.length > 18 ? `${text.slice(0, 5)}…${text.slice(-4)}` : text;
}

/**
 * Family Mysteries page. Lists unresolved family-history questions as cards
 * (filterable by status), opens a full detail view on click, and lets signed-in
 * family members contribute notes, memories, leads, or sources that pass
 * through steward review. Family Stewards get additional controls to create
 * canonical mysteries and review pending contributions — hidden from others.
 */
export function MysteriesPage({
  onBack,
  onOpenProfile,
  initialMysteryId,
}: MysteriesPageProps) {
  const { data: mysteries = [], isLoading } = useMysteries();
  const { isAuthenticated } = useAuth();
  const { data: isAdmin = false } = useIsAdmin();

  const [filter, setFilter] = useState<StatusFilter>("All");
  const [selectedId, setSelectedId] = useState<bigint | null>(
    initialMysteryId ?? null,
  );
  const [showContribute, setShowContribute] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showReview, setShowReview] = useState(false);

  const selected = useMemo(
    () => mysteries.find((m) => m.id === selectedId) ?? null,
    [mysteries, selectedId],
  );

  const filtered = useMemo(
    () =>
      filter === "All"
        ? mysteries
        : mysteries.filter((m) => m.status === filter),
    [mysteries, filter],
  );

  if (selected) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10">
        <MysteryDetail
          mystery={selected}
          onBack={() => {
            setSelectedId(null);
            setShowContribute(false);
          }}
          onOpenProfile={onOpenProfile}
          onContribute={() => setShowContribute(true)}
          isAdmin={isAdmin}
          isAuthenticated={isAuthenticated}
        />
        {showContribute && (
          <div className="mt-5">
            <MysteryContributionForm
              mysteryId={selected.id}
              onClose={() => setShowContribute(false)}
              onSubmitted={() => setShowContribute(false)}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Family Mysteries
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The questions we are still working to answer.
          </p>
        </div>
        <button
          type="button"
          data-ocid="mysteries.back_button"
          onClick={onBack}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-border/60 px-4 text-sm font-semibold text-foreground transition-colors hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Back
        </button>
      </div>

      {isAdmin && (
        <div
          data-ocid="mysteries.steward_panel"
          className="mb-6 flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4"
        >
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Steward controls
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-ocid="mysteries.create_button"
              onClick={() => setShowCreate((v) => !v)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-border/60 px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {showCreate ? "Close create" : "Create mystery"}
            </button>
            <button
              type="button"
              data-ocid="mysteries.review_button"
              onClick={() => setShowReview((v) => !v)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-border/60 px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              {showReview ? "Close review" : "Review contributions"}
            </button>
          </div>

          {showCreate && (
            <CreateMysteryForm onDone={() => setShowCreate(false)} />
          )}
          {showReview && <ReviewContributions />}
        </div>
      )}

      <div className="filter-bar mb-6">
        {STATUS_FILTERS.map((status) => (
          <button
            key={status}
            type="button"
            data-ocid="mysteries.filter_tab"
            onClick={() => setFilter(status)}
            className={`filter-tab min-h-[44px] ${
              filter === status ? "filter-tab-active" : ""
            }`}
          >
            {status === "All" ? "All" : MYSTERY_STATUS_LABELS[status]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div
          data-ocid="mysteries.loading_state"
          className="flex flex-col gap-4"
        >
          {Array.from({ length: 3 }, (_, i) => `skeleton-${i}`).map((id) => (
            <div
              key={id}
              className="h-32 animate-pulse rounded-xl border border-border/60 bg-muted"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <DomainEmptyState
          icon={Search}
          title={
            filter === "All"
              ? "No mysteries yet"
              : `No ${MYSTERY_STATUS_LABELS[filter].toLowerCase()} mysteries`
          }
          hint="Unanswered questions and ongoing family research will appear here."
        />
      ) : (
        <div data-ocid="mysteries.list" className="flex flex-col gap-4">
          {filtered.map((mystery) => (
            <MysteryCard
              key={mystery.id.toString()}
              mystery={mystery}
              onOpen={() => setSelectedId(mystery.id)}
              onOpenProfile={onOpenProfile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CreateMysteryForm({ onDone }: { onDone: () => void }) {
  const create = useCreateCanonicalMystery();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<MysteryStatus>(MysteryStatus.Open);
  const [knownFacts, setKnownFacts] = useState("");
  const [possibilities, setPossibilities] = useState("");

  const splitLines = (value: string) =>
    value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

  const handleSubmit = () => {
    if (!title.trim()) return;
    create.mutate(
      {
        title: title.trim(),
        description: description.trim(),
        relatedMemberIds: [],
        relatedBranchId: null,
        knownFacts: splitLines(knownFacts),
        possibilities: splitLines(possibilities),
        relatedSourceIds: [],
        relatedArchiveItemIds: [],
        status,
      },
      {
        onSuccess: () => {
          setTitle("");
          setDescription("");
          setKnownFacts("");
          setPossibilities("");
          onDone();
        },
      },
    );
  };

  return (
    <div
      data-ocid="mysteries.create_form"
      className="flex flex-col gap-3 rounded-lg border border-border/60 p-3"
    >
      <label htmlFor="create-title" className="field-label">
        Question
      </label>
      <input
        id="create-title"
        data-ocid="mysteries.create_title_input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What are we trying to find out?…"
        className="form-input"
      />
      <label htmlFor="create-description" className="field-label">
        Description
      </label>
      <textarea
        id="create-description"
        data-ocid="mysteries.create_description_input"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Background and context…"
        className="form-textarea"
      />
      <label htmlFor="create-status" className="field-label">
        Status
      </label>
      <select
        id="create-status"
        data-ocid="mysteries.create_status_select"
        value={status}
        onChange={(e) => setStatus(e.target.value as MysteryStatus)}
        className="form-select"
      >
        {(
          [
            MysteryStatus.Open,
            MysteryStatus.Researching,
            MysteryStatus.PartiallyResolved,
          ] as MysteryStatus[]
        ).map((s) => (
          <option key={s} value={s}>
            {MYSTERY_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      <label htmlFor="create-known" className="field-label">
        Known facts (one per line)
      </label>
      <textarea
        id="create-known"
        data-ocid="mysteries.create_known_input"
        value={knownFacts}
        onChange={(e) => setKnownFacts(e.target.value)}
        placeholder="What existing evidence supports…"
        className="form-textarea"
      />
      <label htmlFor="create-possibilities" className="field-label">
        Possibilities (one per line)
      </label>
      <textarea
        id="create-possibilities"
        data-ocid="mysteries.create_possibilities_input"
        value={possibilities}
        onChange={(e) => setPossibilities(e.target.value)}
        placeholder="Family theories and research hypotheses…"
        className="form-textarea"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-ocid="mysteries.create_submit_button"
          onClick={handleSubmit}
          disabled={!title.trim() || create.isPending}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: "oklch(var(--primary))" }}
        >
          {create.isPending ? "Creating…" : "Create mystery"}
        </button>
        <button
          type="button"
          data-ocid="mysteries.create_cancel_button"
          onClick={onDone}
          className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-border/60 px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Cancel
        </button>
      </div>
      {create.isError && (
        <p className="text-xs text-destructive">
          Could not create the mystery. Please try again.
        </p>
      )}
    </div>
  );
}

function ReviewContributions() {
  const { data: pending = [], isLoading } = usePendingMysteryContributions();
  const review = useReviewMysteryContribution();

  return (
    <div
      data-ocid="mysteries.review_panel"
      className="flex flex-col gap-3 rounded-lg border border-border/60 p-3"
    >
      <h3 className="text-sm font-semibold text-foreground">
        Pending contributions
      </h3>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No contributions awaiting review.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {pending.map((contribution) => (
            <li
              key={contribution.id.toString()}
              data-ocid="mysteries.review_item"
              className="flex flex-col gap-2 rounded-lg border border-border/60 p-3"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="tag-chip">
                  {
                    MYSTERY_CONTRIBUTION_TYPE_LABELS[
                      contribution.contributionType
                    ]
                  }
                </span>
                <span>Mystery #{contribution.mysteryId.toString()}</span>
                <span>by {formatContributor(contribution.contributor)}</span>
              </div>
              <p className="text-sm leading-relaxed text-foreground">
                {contribution.text}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-ocid="mysteries.approve_button"
                  onClick={() =>
                    review.mutate({ id: contribution.id, approve: true })
                  }
                  disabled={review.isPending}
                  className="approve-action min-h-[44px]"
                >
                  Approve
                </button>
                <button
                  type="button"
                  data-ocid="mysteries.reject_button"
                  onClick={() =>
                    review.mutate({ id: contribution.id, approve: false })
                  }
                  disabled={review.isPending}
                  className="reject-action min-h-[44px]"
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {review.isError && (
        <p className="text-xs text-destructive">
          Could not review the contribution. Please try again.
        </p>
      )}
    </div>
  );
}
