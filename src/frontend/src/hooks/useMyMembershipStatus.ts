import { createActor } from "@/backend";
import type { FamilyMembership } from "@/backend";
import { useActiveFamilyId, useFamilyScopedId } from "@/context/FamilyContext";
import { useActor } from "@caffeineai/core-infrastructure";
import { useQuery } from "@tanstack/react-query";

/**
 * The signed-in caller's own membership in the ACTIVE family, used by the
 * app-shell routing rule to decide between the normal family application and
 * the limited membership-status shell.
 *
 * The read is family-scoped through the centralized active family id, so an
 * account can be Active in one family and Pending in another and each family
 * resolves its own shell. The family id is always part of the query key, so a
 * Family A membership never satisfies a Family B read.
 *
 * `membership` is `null` when the caller has no membership in the active
 * family (a guest, or a signed-in account that has not joined this family).
 * `isLoading` is true while the read is still resolving, so the shell never
 * flashes the wrong experience before the membership is known.
 *
 * The read tolerates a mock actor that does not implement
 * `getMyMembershipForFamily` (the tester-owned App tests stub only a minimal
 * actor): a missing method resolves to `null` instead of throwing, so the
 * normal family shell still renders. When the actor cannot answer the
 * membership question at all there is nothing to wait for, so `isLoading` is
 * reported as false in that case — otherwise the app-shell gate would hold the
 * neutral loading state forever for an actor that will never resolve a
 * membership.
 */
export function useMyMembershipStatus() {
  const familyScopedId = useFamilyScopedId();
  const familyId = useActiveFamilyId();
  const { actor, isFetching } = useActor(createActor);
  // Whether the connected actor can actually answer the membership question.
  // A mock/minimal actor without the method has no membership to resolve, so
  // the read is treated as already settled (null) rather than perpetually
  // loading.
  const canReadMembership =
    !!actor && typeof actor.getMyMembershipForFamily === "function";
  const query = useQuery({
    queryKey: ["myMembership", familyScopedId ?? ""],
    queryFn: async (): Promise<FamilyMembership | null> => {
      if (!actor) return null;
      const read = actor.getMyMembershipForFamily;
      if (typeof read !== "function") return null;
      const result = await read.call(actor, familyId);
      return result.__kind__ === "ok" ? result.ok : null;
    },
    enabled: !!actor && !isFetching,
  });
  return {
    membership: query.data ?? null,
    isLoading: canReadMembership && query.isLoading,
  };
}
