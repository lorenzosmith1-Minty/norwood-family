import { createActor } from "@/backend";
import type {
  FamilyInvitation,
  FamilyInvitationPreview,
  InvitationRedemptionState,
} from "@/backend";
import { useActor } from "@caffeineai/core-infrastructure";
import {
  type InvalidateQueryFilters,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

/**
 * React Query hooks for the family-invitation redemption flow, following the
 * existing `useActor(createActor)` + `useQuery`/`useMutation` pattern used by
 * `useProfileClaims.ts`. Every operation goes through the real backend actor;
 * no local persistence is used and the raw token is never stored permanently.
 *
 * The raw token is opaque: it is passed straight to the backend, which
 * validates it against the stored digest. Nothing here decodes or inspects it.
 */

export type { InvitationRedemptionState, FamilyInvitationPreview };

/**
 * Query key for a single invite token's preview. The token is part of the key
 * so distinct invites never share a cache entry; it is never persisted.
 */
export function invitationPreviewKey(rawToken: string) {
  return ["invitationPreview", rawToken] as const;
}

/** Query key for a single invite token's redemption state. */
export function invitationRedemptionKey(rawToken: string) {
  return ["invitationRedemption", rawToken] as const;
}

/**
 * Invalidation filter for the invitation caches. React Query matches by key
 * PREFIX, so a bare `["invitationPreview"]` filter would also match every
 * other token's entry. The filter is narrowed to the exact token so consuming
 * one invitation never marks another's cache stale.
 */
export function invitationInvalidation(
  rawToken: string,
): InvalidateQueryFilters {
  return {
    predicate: (query) =>
      (query.queryKey[0] === "invitationPreview" ||
        query.queryKey[0] === "invitationRedemption") &&
      query.queryKey[1] === rawToken,
  };
}

/**
 * Validates a raw invite token and returns the minimal, relationship-safe
 * preview context (invitation id, family display name, target profile safe
 * identity preview, invitation type, status, expiry). Disabled until a token
 * is present.
 */
export function useInvitationPreview(rawToken: string | null) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: invitationPreviewKey(rawToken ?? ""),
    queryFn: async () => {
      if (!actor || !rawToken) return null;
      return actor.validateFamilyInvitationToken(rawToken);
    },
    enabled: !!actor && !isFetching && !!rawToken,
  });
}

/**
 * Resolves a raw invite token to its safe, discriminated redemption state for
 * the invitation landing/terminal UI. Read-only: it never mutates state and
 * never creates a membership. Disabled until a token is present.
 */
export function useInvitationRedemptionState(rawToken: string | null) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: invitationRedemptionKey(rawToken ?? ""),
    queryFn: async () => {
      if (!actor || !rawToken) return null;
      return actor.getInvitationRedemptionState(rawToken);
    },
    enabled: !!actor && !isFetching && !!rawToken,
  });
}

/**
 * Accepts a raw invite token for the authenticated caller. On success the
 * invitation caches for that token are invalidated so the terminal state
 * reflects the consumed invitation.
 */
export function useAcceptInvitation() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rawToken: string): Promise<FamilyInvitation | null> => {
      if (!actor) throw new Error("Backend is not ready");
      const result = await actor.acceptFamilyInvitation(rawToken);
      if (result.__kind__ === "err") throw new Error(result.err);
      return result.ok;
    },
    onSuccess: (_data, rawToken) => {
      void queryClient.invalidateQueries(invitationInvalidation(rawToken));
    },
  });
}

/**
 * Declines a raw invite token for the authenticated caller. On success the
 * invitation caches for that token are invalidated so the terminal state
 * reflects the declined invitation.
 */
export function useDeclineInvitation() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rawToken: string): Promise<FamilyInvitation | null> => {
      if (!actor) throw new Error("Backend is not ready");
      const result = await actor.declineFamilyInvitation(rawToken);
      if (result.__kind__ === "err") throw new Error(result.err);
      return result.ok;
    },
    onSuccess: (_data, rawToken) => {
      void queryClient.invalidateQueries(invitationInvalidation(rawToken));
    },
  });
}
