import { createActor } from "@/backend";
import { useActor } from "@caffeineai/core-infrastructure";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useProvidersPresent } from "./usePhotoStorage";

/**
 * Canonical Norwood Family Steward authority hooks.
 *
 * Family Steward authority is the Norwood Steward record — a caller is a
 * Steward only when the backend reports an ACTIVE StewardRecord for their
 * account. The platform admin role (`isCallerAdmin`) is a separate concern and
 * must never be used to gate Family Steward navigation or screens.
 *
 * These hooks are the single frontend source of truth for that authority:
 * `useIsSteward` answers "am I an active Steward?" and `useHasActiveSteward`
 * answers "does any active Steward exist yet?" (which drives the one-time
 * bootstrap claim control).
 *
 * Tenancy 1C-A: the backend exposes no family-scoped Steward-authority
 * endpoints — `isCallerSteward`, `hasActiveSteward`, and `claimSteward` remain
 * the public contract and resolve the default family internally. These hooks
 * therefore keep calling those methods with no familyId argument; the active
 * family is not threaded here because there is no family-scoped endpoint to
 * receive it.
 */

/** True when the signed-in caller is an active Norwood Family Steward. */
export function useIsSteward() {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["isSteward"],
    queryFn: async () => {
      if (!actor) return false;
      return actor.isCallerSteward();
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/**
 * True when at least one active Family Steward exists. While this is false any
 * signed-in account may perform the one-time "Claim Family Steward" bootstrap;
 * once it is true the claim control is hidden permanently.
 */
export function useHasActiveSteward() {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["hasActiveSteward"],
    queryFn: async () => {
      if (!actor) return false;
      return actor.hasActiveSteward();
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/**
 * Performs the one-time "Claim Family Steward" bootstrap. Any signed-in
 * account may claim while no active Steward exists; no approved family profile
 * is required. On success the caller's Steward authority and the global
 * active-Steward flag are both invalidated so the Family Steward navigation
 * entry appears immediately.
 */
export function useClaimSteward() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.claimSteward();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["isSteward"] });
      void queryClient.invalidateQueries({ queryKey: ["hasActiveSteward"] });
      // The Steward hub reads the steward roster and audit history; refresh
      // them so the newly claimed Steward sees a fully populated hub.
      void queryClient.invalidateQueries({
        queryKey: ["governance", "stewards"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["governance", "stewardIdentities"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["governance", "auditHistory"],
      });
    },
  });
}
