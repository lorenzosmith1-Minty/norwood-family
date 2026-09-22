import { createActor } from "@/backend";
import { useFamilyScopedId } from "@/context/FamilyContext";
import { useActor } from "@caffeineai/core-infrastructure";
import { useQuery } from "@tanstack/react-query";
import { useIsSteward } from "./useStewardAuthority";

/**
 * React Query hook for the Family Steward Pending Contributions badge. It
 * reads the canonical pending-review count from the backend
 * (getPendingContributionsCount) and is gated to active Family Stewards so
 * guests and non-steward members never trigger the steward-only query.
 *
 * The active family comes from the centralized FamilyContext. For the default
 * family (`familyScopedId` undefined) the legacy no-argument endpoint is used
 * with the exact legacy query key; a non-default family routes to the
 * family-scoped count endpoint with the familyId included in the key so caches
 * never collide across families.
 *
 * The backend returns a bigint; it is converted to a number here so the badge
 * can render it directly.
 */

/** The number of pending contributions awaiting steward review, or 0 for non-stewards. */
export function usePendingCount() {
  const { data: isSteward = false } = useIsSteward();
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["pendingContributionsCount", familyScopedId ?? ""],
    queryFn: async () => {
      if (!actor) return 0;
      const count =
        familyScopedId === undefined
          ? await actor.getPendingContributionsCount()
          : await actor.getPendingContributionsCountForFamily(familyScopedId);
      return Number(count);
    },
    enabled: isSteward && !!actor && !isFetching,
  });
}
