import { createActor } from "@/backend";
import type { Family } from "@/backend";
import { useActiveFamilyId, useFamilyScopedId } from "@/context/FamilyContext";
import { useActor } from "@caffeineai/core-infrastructure";
import { useQuery } from "@tanstack/react-query";

/**
 * The active family's own record, read through the existing centralized
 * FamilyContext and the existing `getFamily(familyId)` backend binding.
 *
 * This is the single place the frontend resolves a user-visible family name:
 * the record's `displayName` is the authoritative, family-safe label (the
 * backend default family resolves to "Norwood"). Consumers must never derive a
 * name from the technical family id — the id suffix is never user-visible.
 *
 * The read is family-scoped through the centralized active family id, so the
 * family id is always part of the query key and a Family A record never
 * satisfies a Family B read. `family` is `null` while the record is unknown
 * (still resolving, or a mock actor that cannot answer), so callers render a
 * neutral fallback rather than a derived name.
 */
export function useActiveFamilyRecord() {
  const familyId = useActiveFamilyId();
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  const canReadFamily = !!actor && typeof actor.getFamily === "function";
  const query = useQuery({
    queryKey: ["family", familyScopedId ?? ""],
    queryFn: async (): Promise<Family | null> => {
      if (!actor) return null;
      const read = actor.getFamily;
      if (typeof read !== "function") return null;
      return read.call(actor, familyId);
    },
    enabled: !!actor && !isFetching,
  });
  return {
    family: query.data ?? null,
    displayName: query.data?.displayName ?? null,
    isLoading: canReadFamily && query.isLoading,
  };
}
