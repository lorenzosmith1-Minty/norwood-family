import { createActor } from "@/backend";
import type {
  ArchiveItemType,
  PrivacyLevel,
  SourceStatus,
} from "@/types/archive";
import { useActor } from "@caffeineai/core-infrastructure";
import type { ExternalBlob } from "@caffeineai/object-storage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useProvidersPresent } from "./usePhotoStorage";

export { useProvidersPresent };

/** True when the signed-in caller is an admin (used to gate the admin nav link). */
export function useIsAdmin() {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["isAdmin"],
    queryFn: async () => {
      if (!actor) return false;
      return actor.isCallerAdmin();
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Lists pending contributions awaiting admin approval. */
export function usePendingArchiveItems() {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["archive", "pending"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listPendingArchiveItems();
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Lists approved archive items that are part of the archive. */
export function useApprovedArchiveItems() {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["archive", "approved"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listApprovedArchiveItems();
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

export interface SubmitArchiveItemInput {
  title: string;
  description: string;
  itemType: ArchiveItemType;
  blob: ExternalBlob;
  era: string;
  year: bigint | null;
  tags: string[];
  relatedMemberIds: string[];
  relatedBranchId: string | null;
  sourceStatus: SourceStatus;
  privacyLevel: PrivacyLevel;
}

/** Submits a new contribution in a pending state awaiting admin approval. */
export function useSubmitArchiveItem() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubmitArchiveItemInput) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.submitArchiveItem(
        input.title,
        input.description,
        input.itemType,
        input.blob,
        input.era,
        input.year,
        input.tags,
        input.relatedMemberIds,
        input.relatedBranchId,
        input.sourceStatus,
        input.privacyLevel,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["archive", "pending"] });
      void queryClient.invalidateQueries({ queryKey: ["archive", "approved"] });
    },
  });
}

/** Approves a pending contribution, moving it into the archive. */
export function useApproveArchiveItem() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.approveArchiveItem(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["archive", "pending"] });
      void queryClient.invalidateQueries({ queryKey: ["archive", "approved"] });
    },
  });
}

/** Rejects a pending contribution, excluding it from the archive. */
export function useRejectArchiveItem() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.rejectArchiveItem(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["archive", "pending"] });
    },
  });
}
