import type { Story } from "@/types/family-history";
import { Check, LibraryBig, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { DomainEmptyState } from "../components/DomainEmptyState";
import { StoryCard } from "../components/StoryCard";
import { StoryContributionForm } from "../components/StoryContributionForm";
import { StoryDetail } from "../components/StoryDetail";
import {
  type StoryFilter,
  StoryFilterBar,
  matchesStoryFilter,
} from "../components/StoryFilterBar";
import { useIsAdmin } from "../hooks/useArchiveStorage";
import { useAuth } from "../hooks/useAuth";
import {
  useApproveStory,
  useApprovedStories,
  usePendingStories,
  useRejectStory,
} from "../hooks/useFamilyHistory";

interface StoriesPageProps {
  /** Navigates back to the home screen. */
  onBack: () => void;
  /** Navigates to a person's profile. When omitted, names render as plain chips. */
  onOpenProfile?: (id: string) => void;
  /** Story id to open directly in the detail view on mount (e.g. from a timeline link). */
  initialStoryId?: bigint | null;
}

type StoriesView = "browse" | "detail" | "form";

/**
 * Family Stories page. Lists approved narrative family-history entries
 * connected to existing family members, browsable by All Stories, Person,
 * Branch, Era, and Evidence status. Clicking a card opens the full story
 * detail. Signed-in family members can propose new stories (which enter
 * pending review), and Family Stewards can add/edit canonical stories and
 * approve or reject pending submissions.
 */
export function StoriesPage({
  onBack,
  onOpenProfile,
  initialStoryId,
}: StoriesPageProps) {
  const { data: stories = [], isLoading } = useApprovedStories();
  const { data: isAdmin = false } = useIsAdmin();
  const { isAuthenticated } = useAuth();
  const { data: pendingStories = [] } = usePendingStories();
  const approveStory = useApproveStory();
  const rejectStory = useRejectStory();

  const [view, setView] = useState<StoriesView>(
    initialStoryId != null ? "detail" : "browse",
  );
  const [filter, setFilter] = useState<StoryFilter>({});
  const [selectedStoryId, setSelectedStoryId] = useState<bigint | null>(
    initialStoryId ?? null,
  );
  const [editingStory, setEditingStory] = useState<Story | null>(null);

  const filteredStories = useMemo(
    () => stories.filter((story) => matchesStoryFilter(story, filter)),
    [stories, filter],
  );

  const selectedStory =
    stories.find((story) => story.id === selectedStoryId) ?? null;

  const openDetail = (id: bigint) => {
    setSelectedStoryId(id);
    setView("detail");
  };

  const openForm = (story?: Story) => {
    setEditingStory(story ?? null);
    setView("form");
  };

  if (view === "detail" && selectedStory) {
    return (
      <StoryDetail
        story={selectedStory}
        onBack={() => setView("browse")}
        onOpenProfile={onOpenProfile}
        isSteward={isAdmin}
        onEdit={openForm}
      />
    );
  }

  if (view === "form") {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-10">
        <StoryContributionForm
          onClose={() => setView("browse")}
          isSteward={isAdmin}
          initialStory={editingStory ?? undefined}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Family Stories
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The moments and memories that shaped our family.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAuthenticated && (
            <button
              type="button"
              data-ocid="stories.propose_button"
              onClick={() => openForm()}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Propose a Story
            </button>
          )}
          <button
            type="button"
            data-ocid="stories.back_button"
            onClick={onBack}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-border/60 px-4 text-sm font-semibold text-foreground transition-colors hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Back
          </button>
        </div>
      </div>

      {isAdmin && (
        <div className="mb-6 rounded-xl border border-border/60 bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Steward controls
            </h2>
            <button
              type="button"
              data-ocid="stories.add_canonical_button"
              onClick={() => openForm()}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Story
            </button>
          </div>

          {pendingStories.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Pending review ({pendingStories.length})
              </h3>
              {pendingStories.map((story) => (
                <div
                  key={story.id}
                  data-ocid={`stories.pending.${story.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-background p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {story.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {story.storyText}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      data-ocid={`stories.pending.approve.${story.id}`}
                      onClick={() => approveStory.mutate(story.id)}
                      disabled={approveStory.isPending}
                      className="approve-action"
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      Approve
                    </button>
                    <button
                      type="button"
                      data-ocid={`stories.pending.reject.${story.id}`}
                      onClick={() => rejectStory.mutate(story.id)}
                      disabled={rejectStory.isPending}
                      className="reject-action"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {stories.length > 0 && (
        <div className="mb-6">
          <StoryFilterBar
            stories={stories}
            filter={filter}
            onChange={setFilter}
          />
        </div>
      )}

      {isLoading ? (
        <div data-ocid="stories.loading_state" className="flex flex-col gap-4">
          {Array.from({ length: 3 }, (_, i) => `skeleton-${i}`).map((id) => (
            <div
              key={id}
              className="h-40 animate-pulse rounded-xl border border-border/60 bg-card"
            />
          ))}
        </div>
      ) : filteredStories.length > 0 ? (
        <div data-ocid="stories.list" className="flex flex-col gap-4">
          {filteredStories.map((story) => (
            <StoryCard
              key={story.id}
              story={story}
              onOpen={openDetail}
              onOpenProfile={onOpenProfile}
            />
          ))}
        </div>
      ) : (
        <DomainEmptyState
          icon={LibraryBig}
          title={stories.length > 0 ? "No matching stories" : "No stories yet"}
          hint={
            stories.length > 0
              ? "Try clearing or changing your filters."
              : "Your family's stories will live here."
          }
          action={
            isAuthenticated ? (
              <button
                type="button"
                data-ocid="stories.empty_propose_button"
                onClick={() => openForm()}
                className="archive-empty-reset"
              >
                Propose a Story
              </button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
