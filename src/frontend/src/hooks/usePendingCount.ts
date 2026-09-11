import { createActor } from "@/backend";
import { useActor } from "@caffeineai/core-infrastructure";
import { useQuery } from "@tanstack/react-query";
import { useIsAdmin } from "./useArchiveStorage";

/**
 * React Query hook for the Family Steward Pending Contributions badge. It
 * reads the canonical pending-review count from the backend
 * (getPendingContributionsCount) and is gated to Family Stewards (admins) so
 * guests and non-steward members never trigger the steward-only query.
 *
 * The backend returns a bigint; it is converted to a number here so the badge
 * can render it directly.
 */

/** The number of pending contributions awaiting steward review, or 0 for non-stewards. */
export function usePendingCount() {
  const { data: isAdmin = false } = useIsAdmin();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["pendingContributionsCount"],
    queryFn: async () => {
      if (!actor) return 0;
      const count = await actor.getPendingContributionsCount();
      return Number(count);
    },
    enabled: isAdmin && !!actor && !isFetching,
  });
}
