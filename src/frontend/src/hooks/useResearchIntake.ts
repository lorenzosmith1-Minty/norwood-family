import { type ConflictResolutionAction, createActor } from "@/backend";
import type {
  ConflictReviewItem,
  FindingContent,
  FindingId,
  NewPersonCandidate,
  ProposedFinding,
  RelationshipProposal,
  ResearchAuditEntry,
  Result_3,
  Result_18,
  Result_19,
  Result_20,
  Result_22,
  ReviewQueue,
  ReviewQueueItem,
  SourceId,
  SourceRecord,
} from "@/backend";
import { useFamilyScopedId } from "@/context/FamilyContext";
import type {
  ArchiveItemClassification,
  ArchiveItemType,
  OralHistorySpeaker,
  PrivacyLevel,
} from "@/types/archive";
import { useActor } from "@caffeineai/core-infrastructure";
import type { ExternalBlob } from "@caffeineai/object-storage";
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
 *
 * The SOURCE, FINDING, CANDIDATE, and RELATIONSHIP PROPOSAL hooks are
 * family-aware, following the useArchiveStorage pattern: the active family is
 * read from the centralized FamilyContext and `familyScopedId` is `undefined`
 * for the default family. The default family keeps the exact legacy
 * no-argument call shape and React Query key, while a non-default family
 * routes to the canonical `*ForFamily` endpoint with the familyId included in
 * the key so caches never collide across families. Conflicts/audit hooks are
 * intentionally NOT family-scoped in this build.
 */

/** Lists all source records (steward only). */
export function useListSources() {
  const providersPresent = useProvidersPresent();
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["research", "sources"]
        : ["research", "sources", familyScopedId],
    queryFn: async () => {
      if (!actor) return [] as SourceRecord[];
      return familyScopedId === undefined
        ? actor.listSources()
        : actor.listSourcesForFamily(familyScopedId);
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Returns a single source record by id. */
export function useGetSource(sourceId: SourceId) {
  const providersPresent = useProvidersPresent();
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["research", "sources", sourceId.toString()]
        : ["research", "sources", familyScopedId, sourceId.toString()],
    queryFn: async () => {
      if (!actor) return null;
      return familyScopedId === undefined
        ? actor.getSource(sourceId)
        : actor.getSourceForFamily(familyScopedId, sourceId);
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
    }): Promise<Result_18> => {
      if (!actor) throw new Error("Backend is not ready");
      // The backend exposes no family-scoped createSource endpoint: createSource
      // sets the familyId itself, so the legacy call is used for every family.
      return actor.createSource(title, sourceType, description, archiveItemId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["research", "sources"] });
      void queryClient.invalidateQueries({ queryKey: ["research", "queue"] });
      void queryClient.invalidateQueries({ queryKey: ["research", "audit"] });
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export interface CreateSourceWithUploadInput {
  title: string;
  sourceType: SourceRecord["sourceType"];
  description: string;
  /** The declared MIME type of the uploaded file. */
  mimeType: string;
  blob: ExternalBlob;
  /**
   * The sanitized original filename of the uploaded file, persisted on the
   * created Archive item so its detail view can resolve the preview type and
   * download name.
   */
  filename: string;
  tags: string[];
  era: string;
  year: bigint | null;
  relatedMemberIds: string[];
  privacyLevel: PrivacyLevel;
  classification: ArchiveItemClassification;
  primarySpeaker: OralHistorySpeaker | null;
}

/**
 * Uploads a research source file: creates one canonical Archive item (pending)
 * and links a new Research Source record to it, so no manually typed Archive
 * Item ID is required. Returns the created Source record plus the Archive item.
 */
export function useCreateSourceWithUpload() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSourceWithUploadInput) => {
      if (!actor) throw new Error("Backend is not ready");
      if (familyScopedId === undefined) {
        return actor.createSourceWithUpload(
          input.title,
          input.sourceType,
          input.description,
          input.mimeType,
          input.blob,
          input.tags,
          input.era,
          input.year,
          input.relatedMemberIds,
          input.privacyLevel,
          input.classification,
          input.primarySpeaker,
          input.filename,
        );
      }
      return actor.createSourceWithUploadForFamily(
        familyScopedId,
        input.title,
        input.sourceType,
        input.description,
        input.mimeType,
        input.blob,
        input.tags,
        input.era,
        input.year,
        input.relatedMemberIds,
        input.privacyLevel,
        input.classification,
        input.primarySpeaker,
        input.filename,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["research", "sources"] });
      void queryClient.invalidateQueries({ queryKey: ["research", "queue"] });
      void queryClient.invalidateQueries({ queryKey: ["research", "audit"] });
      // The upload creates a pending Archive item, so the pending/approved
      // archive lists must refresh.
      void queryClient.invalidateQueries({ queryKey: ["archive", "pending"] });
      void queryClient.invalidateQueries({ queryKey: ["archive", "approved"] });
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/**
 * Approves a pending source (Family Steward only), transitioning it to
 * `Approved` so it becomes usable by Proposed Findings. Records a
 * `ResearchApproved` notification to the contributor.
 */
export function useApproveSource() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sourceId: SourceId): Promise<SourceRecord | null> => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.approveSource(sourceId)
        : actor.approveSourceForFamily(familyScopedId, sourceId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["research", "sources"] });
      void queryClient.invalidateQueries({ queryKey: ["research", "queue"] });
      void queryClient.invalidateQueries({ queryKey: ["research", "audit"] });
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/**
 * Rejects a pending source (Family Steward only), transitioning it to
 * `Rejected`. The original Archive item is not deleted. Records a
 * `ResearchRejected` notification to the contributor.
 */
export function useRejectSource() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sourceId: SourceId): Promise<SourceRecord | null> => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.rejectSource(sourceId)
        : actor.rejectSourceForFamily(familyScopedId, sourceId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["research", "sources"] });
      void queryClient.invalidateQueries({ queryKey: ["research", "queue"] });
      void queryClient.invalidateQueries({ queryKey: ["research", "audit"] });
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/**
 * Marks a pending source as needing research (Family Steward only),
 * transitioning it to `NeedsResearch` while preserving the source and its
 * notes.
 */
export function useNeedsResearchSource() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sourceId: SourceId): Promise<SourceRecord | null> => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.needsResearchSource(sourceId)
        : actor.needsResearchSourceForFamily(familyScopedId, sourceId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["research", "sources"] });
      void queryClient.invalidateQueries({ queryKey: ["research", "queue"] });
      void queryClient.invalidateQueries({ queryKey: ["research", "audit"] });
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/** Lists all proposed findings (steward only). */
export function useListFindings() {
  const providersPresent = useProvidersPresent();
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["research", "findings"]
        : ["research", "findings", familyScopedId],
    queryFn: async () => {
      if (!actor) return [] as ProposedFinding[];
      return familyScopedId === undefined
        ? actor.listFindings()
        : actor.listFindingsForFamily(familyScopedId);
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Returns a single proposed finding by id. */
export function useGetFinding(findingId: FindingId) {
  const providersPresent = useProvidersPresent();
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["research", "findings", findingId.toString()]
        : ["research", "findings", familyScopedId, findingId.toString()],
    queryFn: async () => {
      if (!actor) return null;
      return familyScopedId === undefined
        ? actor.getFinding(findingId)
        : actor.getFindingForFamily(familyScopedId, findingId);
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Creates a new proposed finding. */
export function useCreateFinding() {
  const familyScopedId = useFamilyScopedId();
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
    }): Promise<Result_22> => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.createFinding(
            title,
            evidenceLabel,
            findingType,
            content,
            sourceId,
            personId,
            newPersonCandidateId,
          )
        : actor.createFindingForFamily(
            familyScopedId,
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
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/** Approves a pending finding, routing it to its target surface. */
export function useApproveFinding() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      findingId: FindingId,
    ): Promise<ProposedFinding | null> => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.approveFinding(findingId)
        : actor.approveFindingForFamily(familyScopedId, findingId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["research", "findings"],
      });
      void queryClient.invalidateQueries({ queryKey: ["research", "sources"] });
      void queryClient.invalidateQueries({ queryKey: ["research", "queue"] });
      void queryClient.invalidateQueries({ queryKey: ["research", "audit"] });
      // Approving a finding can route it to the Conflict Review surface, so the
      // conflict list must refresh immediately.
      void queryClient.invalidateQueries({
        queryKey: ["research", "conflicts"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/** Rejects a pending finding. */
export function useRejectFinding() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      findingId: FindingId,
    ): Promise<ProposedFinding | null> => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.rejectFinding(findingId)
        : actor.rejectFindingForFamily(familyScopedId, findingId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["research", "findings"],
      });
      void queryClient.invalidateQueries({ queryKey: ["research", "sources"] });
      void queryClient.invalidateQueries({ queryKey: ["research", "queue"] });
      void queryClient.invalidateQueries({ queryKey: ["research", "audit"] });
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/**
 * Marks a pending finding as needing research (Family Steward only),
 * transitioning it to `NeedsResearch` while keeping it in the review queue.
 * Records a `FindingNeedsResearch` audit entry.
 */
export function useNeedsResearchFinding() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      findingId: FindingId,
    ): Promise<ProposedFinding | null> => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.needsResearchFinding(findingId)
        : actor.needsResearchFindingForFamily(familyScopedId, findingId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["research", "findings"],
      });
      void queryClient.invalidateQueries({ queryKey: ["research", "sources"] });
      void queryClient.invalidateQueries({ queryKey: ["research", "queue"] });
      void queryClient.invalidateQueries({ queryKey: ["research", "audit"] });
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/** Lists all New Person candidates (steward only). */
export function useListNewPersonCandidates() {
  const providersPresent = useProvidersPresent();
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["research", "candidates"]
        : ["research", "candidates", familyScopedId],
    queryFn: async () => {
      if (!actor) return [] as NewPersonCandidate[];
      return familyScopedId === undefined
        ? actor.listNewPersonCandidates()
        : actor.listNewPersonCandidatesForFamily(familyScopedId);
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Creates a new Person candidate. */
export function useCreateNewPersonCandidate() {
  const familyScopedId = useFamilyScopedId();
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
    }): Promise<Result_20> => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.createNewPersonCandidate(name, details, sourceId)
        : actor.createNewPersonCandidateForFamily(
            familyScopedId,
            name,
            details,
            sourceId,
          );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["research", "candidates"],
      });
      void queryClient.invalidateQueries({ queryKey: ["research", "queue"] });
      void queryClient.invalidateQueries({ queryKey: ["research", "audit"] });
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/**
 * Approves a pending New Person candidate (Family Steward only), creating one
 * canonical Person record that preserves the candidate's source/provenance and
 * recording the approval in the audit history. The candidate transitions to
 * `Approved` and is removed from the pending count immediately.
 */
export function useApproveNewPersonCandidate() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      candidateId: bigint,
    ): Promise<NewPersonCandidate | null> => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.approveNewPersonCandidate(candidateId)
        : actor.approveNewPersonCandidateForFamily(familyScopedId, candidateId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["research", "candidates"],
      });
      void queryClient.invalidateQueries({ queryKey: ["research", "queue"] });
      void queryClient.invalidateQueries({ queryKey: ["research", "audit"] });
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/**
 * Rejects a pending New Person candidate (Family Steward only). No Person is
 * created; the candidate and its audit trail are preserved with status
 * `Rejected`.
 */
export function useRejectNewPersonCandidate() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      candidateId: bigint,
    ): Promise<NewPersonCandidate | null> => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.rejectNewPersonCandidate(candidateId)
        : actor.rejectNewPersonCandidateForFamily(familyScopedId, candidateId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["research", "candidates"],
      });
      void queryClient.invalidateQueries({ queryKey: ["research", "queue"] });
      void queryClient.invalidateQueries({ queryKey: ["research", "audit"] });
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/**
 * Marks a pending New Person candidate as needing research (Family Steward
 * only), preserving the candidate with status `NeedsResearch` and creating no
 * Person.
 */
export function useNeedsResearchNewPersonCandidate() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      candidateId: bigint,
    ): Promise<NewPersonCandidate | null> => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.needsResearchNewPersonCandidate(candidateId)
        : actor.needsResearchNewPersonCandidateForFamily(
            familyScopedId,
            candidateId,
          );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["research", "candidates"],
      });
      void queryClient.invalidateQueries({ queryKey: ["research", "queue"] });
      void queryClient.invalidateQueries({ queryKey: ["research", "audit"] });
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/** Lists all relationship proposals (steward only). */
export function useListRelationshipProposals() {
  const providersPresent = useProvidersPresent();
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["research", "relationshipProposals"]
        : ["research", "relationshipProposals", familyScopedId],
    queryFn: async () => {
      if (!actor) return [] as RelationshipProposal[];
      return familyScopedId === undefined
        ? actor.listRelationshipProposals()
        : actor.listRelationshipProposalsForFamily(familyScopedId);
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Creates a new relationship proposal. */
export function useCreateRelationshipProposal() {
  const familyScopedId = useFamilyScopedId();
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
    }): Promise<Result_19> => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.createRelationshipProposal(
            fromPersonId,
            toPersonId,
            relationshipType,
            sourceId,
          )
        : actor.createRelationshipProposalForFamily(
            familyScopedId,
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
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/**
 * Approves a pending relationship proposal (Family Steward only), creating or
 * updating the canonical relationship exactly once, preserving its
 * source/provenance, updating the family graph, recording the approval in the
 * audit history, and marking the proposal `Approved`. Duplicate canonical
 * relationships are prevented. Pending counts decrement immediately.
 */
export function useApproveRelationshipProposal() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      proposalId: bigint,
    ): Promise<RelationshipProposal | null> => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.approveRelationshipProposal(proposalId)
        : actor.approveRelationshipProposalForFamily(
            familyScopedId,
            proposalId,
          );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["research", "relationshipProposals"],
      });
      void queryClient.invalidateQueries({ queryKey: ["research", "queue"] });
      void queryClient.invalidateQueries({ queryKey: ["research", "audit"] });
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/**
 * Rejects a pending relationship proposal (Family Steward only). The family
 * graph is left unchanged and the proposal and its audit trail are preserved
 * with status `Rejected`.
 */
export function useRejectRelationshipProposal() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      proposalId: bigint,
    ): Promise<RelationshipProposal | null> => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.rejectRelationshipProposal(proposalId)
        : actor.rejectRelationshipProposalForFamily(familyScopedId, proposalId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["research", "relationshipProposals"],
      });
      void queryClient.invalidateQueries({ queryKey: ["research", "queue"] });
      void queryClient.invalidateQueries({ queryKey: ["research", "audit"] });
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/**
 * Marks a pending relationship proposal as needing research (Family Steward
 * only), leaving the canonical graph unchanged and preserving the proposal with
 * status `NeedsResearch`.
 */
export function useNeedsResearchRelationshipProposal() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      proposalId: bigint,
    ): Promise<RelationshipProposal | null> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.needsResearchRelationshipProposal(proposalId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["research", "relationshipProposals"],
      });
      void queryClient.invalidateQueries({ queryKey: ["research", "queue"] });
      void queryClient.invalidateQueries({ queryKey: ["research", "audit"] });
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
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

/** Resolves a conflict review item with an explicit action and steward notes. */
export function useResolveConflict() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      conflictId,
      action,
      notes,
    }: {
      conflictId: bigint;
      action: ConflictResolutionAction;
      notes: string;
    }): Promise<Result_3> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.resolveConflict(conflictId, action, notes);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["research", "conflicts"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["research", "findings"],
      });
      void queryClient.invalidateQueries({ queryKey: ["research", "sources"] });
      void queryClient.invalidateQueries({ queryKey: ["research", "queue"] });
      void queryClient.invalidateQueries({ queryKey: ["research", "audit"] });
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      // Resolving a conflict records a ConflictResolved entry in the merged
      // Steward Audit History, so that query must refresh immediately.
      void queryClient.invalidateQueries({
        queryKey: ["governance", "stewardAuditHistory"],
      });
    },
  });
}

/**
 * Lists the unresolved (Conflicting / NeedsResearch) conflict review items for
 * a single person, so the person profile and source history views can surface
 * them alongside the canonical values. Requires a signed-in caller; returns an
 * empty list for anonymous callers.
 */
export function useListConflictsForPerson(personId: string) {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["research", "conflicts", "person", personId],
    queryFn: async () => {
      if (!actor) return [] as ConflictReviewItem[];
      return actor.listConflictsForPerson(personId);
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Returns the review queue badge counts across all reviewable items. */
export function useGetReviewQueue() {
  const providersPresent = useProvidersPresent();
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["research", "queue"]
        : ["research", "queue", familyScopedId],
    queryFn: async () => {
      if (!actor) return null;
      return familyScopedId === undefined
        ? actor.getReviewQueue()
        : actor.getReviewQueueForFamily(familyScopedId);
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
  Result_3,
  ReviewQueue,
  ReviewQueueItem,
  SourceId,
  SourceRecord,
};
