import { createActor } from "@/backend";
import type {
  ConflictReviewItem,
  FindingContent,
  FindingId,
  NewPersonCandidate,
  ProposedFinding,
  RelationshipProposal,
  ResearchAuditEntry,
  Result_16,
  Result_17,
  Result_18,
  Result_20,
  ReviewQueue,
  SourceId,
  SourceRecord,
} from "@/backend";
import { useActor } from "@caffeineai/core-infrastructure";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useProvidersPresent } from "./usePhotoStorage";

/**
 * React Query hooks for the Historical Research Intake workspace, following the
 * existing useActor(createActor) + useQuery/useMutation pattern used by
 * useGovernance and useArchiveStorage. Every operation goes through the real
 * backend actor; no local persistence is used.
 *
 * Query keys are namespaced under "research" so a mutation in one surface can
 * invalidate the shared lists (sources, findings, candidates, relationship
 * proposals, conflicts, review queue, audit log) that the other surfaces read.
 */

/** Lists all source records (steward only). */
export function useListSources() {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["research", "sources"],
    queryFn: async () => {
      if (!actor) return [] as SourceRecord[];
      return actor.listSources();
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Returns a single source record by id. */
export function useGetSource(sourceId: SourceId) {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["research", "sources", sourceId.toString()],
    queryFn: async () => {
      if (!actor) return null;
      return actor.getSource(sourceId);
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Creates a new source record. */
export function useCreateSource() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      title,
      sourceType,
      description,
      archiveItemId,
    }: {
      title: string;
      sourceType: SourceRecord["sourceType"];
      description: string;
      archiveItemId: bigint | null;
    }): Promise<Result_16> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.createSource(title, sourceType, description, archiveItemId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["research", "sources"] });
      void queryClient.invalidateQueries({ queryKey: ["research", "audit"] });
    },
  });
}

/** Lists all proposed findings (steward only). */
export function useListFindings() {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["research", "findings"],
    queryFn: async () => {
      if (!actor) return [] as ProposedFinding[];
      return actor.listFindings();
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Returns a single proposed finding by id. */
export function useGetFinding(findingId: FindingId) {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["research", "findings", findingId.toString()],
    queryFn: async () => {
      if (!actor) return null;
      return actor.getFinding(findingId);
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Creates a new proposed finding. */
export function useCreateFinding() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      title,
      evidenceLabel,
      findingType,
      content,
      sourceId,
      personId,
      newPersonCandidateId,
    }: {
      title: string;
      evidenceLabel: ProposedFinding["evidenceLabel"];
      findingType: ProposedFinding["findingType"];
      content: FindingContent;
      sourceId: SourceId;
      personId: string | null;
      newPersonCandidateId: bigint | null;
    }): Promise<Result_20> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.createFinding(
        title,
        evidenceLabel,
        findingType,
        content,
        sourceId,
        personId,
        newPersonCandidateId,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["research", "findings"],
      });
      void queryClient.invalidateQueries({ queryKey: ["research", "queue"] });
      void queryClient.invalidateQueries({ queryKey: ["research", "audit"] });
    },
  });
}

/** Approves a pending finding, routing it to its target surface. */
export function useApproveFinding() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      findingId: FindingId,
    ): Promise<ProposedFinding | null> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.approveFinding(findingId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["research", "findings"],
      });
      void queryClient.invalidateQueries({ queryKey: ["research", "queue"] });
      void queryClient.invalidateQueries({ queryKey: ["research", "audit"] });
    },
  });
}

/** Rejects a pending finding. */
export function useRejectFinding() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      findingId: FindingId,
    ): Promise<ProposedFinding | null> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.rejectFinding(findingId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["research", "findings"],
      });
      void queryClient.invalidateQueries({ queryKey: ["research", "queue"] });
      void queryClient.invalidateQueries({ queryKey: ["research", "audit"] });
    },
  });
}

/** Lists all New Person candidates (steward only). */
export function useListNewPersonCandidates() {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["research", "candidates"],
    queryFn: async () => {
      if (!actor) return [] as NewPersonCandidate[];
      return actor.listNewPersonCandidates();
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Creates a new Person candidate. */
export function useCreateNewPersonCandidate() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      name,
      details,
      sourceId,
    }: {
      name: string;
      details: string;
      sourceId: SourceId;
    }): Promise<Result_18> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.createNewPersonCandidate(name, details, sourceId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["research", "candidates"],
      });
      void queryClient.invalidateQueries({ queryKey: ["research", "queue"] });
      void queryClient.invalidateQueries({ queryKey: ["research", "audit"] });
    },
  });
}

/** Lists all relationship proposals (steward only). */
export function useListRelationshipProposals() {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["research", "relationshipProposals"],
    queryFn: async () => {
      if (!actor) return [] as RelationshipProposal[];
      return actor.listRelationshipProposals();
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Creates a new relationship proposal. */
export function useCreateRelationshipProposal() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      fromPersonId,
      toPersonId,
      relationshipType,
      sourceId,
    }: {
      fromPersonId: string;
      toPersonId: string;
      relationshipType: string;
      sourceId: SourceId;
    }): Promise<Result_17> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.createRelationshipProposal(
        fromPersonId,
        toPersonId,
        relationshipType,
        sourceId,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["research", "relationshipProposals"],
      });
      void queryClient.invalidateQueries({ queryKey: ["research", "queue"] });
      void queryClient.invalidateQueries({ queryKey: ["research", "audit"] });
    },
  });
}

/** Lists all conflict review items (steward only). */
export function useListConflictReviewItems() {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["research", "conflicts"],
    queryFn: async () => {
      if (!actor) return [] as ConflictReviewItem[];
      return actor.listConflictReviewItems();
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Resolves a conflict review item. */
export function useResolveConflict() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      conflictId: bigint,
    ): Promise<ConflictReviewItem | null> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.resolveConflict(conflictId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["research", "conflicts"],
      });
      void queryClient.invalidateQueries({ queryKey: ["research", "queue"] });
      void queryClient.invalidateQueries({ queryKey: ["research", "audit"] });
    },
  });
}

/** Returns the review queue badge counts across all reviewable items. */
export function useGetReviewQueue() {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["research", "queue"],
    queryFn: async () => {
      if (!actor) return null;
      return actor.getReviewQueue();
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Returns the full research intake audit history. */
export function useGetResearchAuditLog() {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["research", "audit"],
    queryFn: async () => {
      if (!actor) return [] as ResearchAuditEntry[];
      return actor.getResearchAuditLog();
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

export type {
  ConflictReviewItem,
  FindingContent,
  FindingId,
  NewPersonCandidate,
  ProposedFinding,
  RelationshipProposal,
  ResearchAuditEntry,
  ReviewQueue,
  SourceId,
  SourceRecord,
};
