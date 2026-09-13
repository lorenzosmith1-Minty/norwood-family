import List "mo:core/List";
import Principal "mo:core/Principal";

module {
  // Old ReviewStatus: no #NeedsResearch tag.
  type OldReviewStatus = {
    #Pending;
    #Approved;
    #Rejected;
    #Conflicting;
  };

  // New ReviewStatus: adds the #NeedsResearch tag.
  type NewReviewStatus = {
    #Pending;
    #Approved;
    #Rejected;
    #Conflicting;
    #NeedsResearch;
  };

  // Old NotificationType: no research notification variants.
  type OldNotificationType = {
    #ProfileClaimRequested;
    #ProfileClaimReviewed;
    #RelationshipRequested;
    #RelationshipReviewed;
    #BoardReply;
    #BoardMention;
    #NewMessage;
  };

  // New NotificationType: adds the research submission/approval/rejection
  // variants.
  type NewNotificationType = {
    #ProfileClaimRequested;
    #ProfileClaimReviewed;
    #RelationshipRequested;
    #RelationshipReviewed;
    #BoardReply;
    #BoardMention;
    #NewMessage;
    #ResearchSubmission;
    #ResearchApproved;
    #ResearchRejected;
  };

  type SourceType = {
    #CensusCitation;
    #DeedPropertyReference;
    #EmailThread;
    #ResearchNotes;
    #CertificateHeadstoneReference;
    #UploadedDocumentImage;
  };

  type EvidenceLabel = {
    #Documented;
    #FamilyHistoryOralHistory;
    #PersonalMemory;
    #Hypothesis;
    #Conflicting;
    #NeedsResearch;
  };

  type FindingType = {
    #PersonFact;
    #Relationship;
    #TimelineEvent;
    #Story;
    #Mystery;
    #Source;
  };

  type FindingContent = {
    #PersonFact : {
      personId : Text;
      field : Text;
      value : Text;
    };
    #Relationship : {
      fromPersonId : Text;
      toPersonId : Text;
      relationshipType : Text;
    };
    #TimelineEvent : {
      personId : Text;
      title : Text;
      date : ?Text;
      description : Text;
    };
    #Story : {
      title : Text;
      storyText : Text;
      relatedPersonIds : [Text];
    };
    #Mystery : {
      title : Text;
      description : Text;
      relatedPersonIds : [Text];
    };
    #Source : {
      title : Text;
      sourceType : SourceType;
      description : Text;
      archiveItemId : ?Nat;
    };
  };

  type OldSourceRecord = {
    id : Nat;
    title : Text;
    sourceType : SourceType;
    description : Text;
    archiveItemId : ?Nat;
    contributor : Principal;
    status : OldReviewStatus;
    createdAt : Int;
    updatedAt : Int;
  };

  type NewSourceRecord = {
    id : Nat;
    title : Text;
    sourceType : SourceType;
    description : Text;
    archiveItemId : ?Nat;
    contributor : Principal;
    status : NewReviewStatus;
    createdAt : Int;
    updatedAt : Int;
  };

  type OldProposedFinding = {
    id : Nat;
    title : Text;
    evidenceLabel : EvidenceLabel;
    findingType : FindingType;
    content : FindingContent;
    sourceId : Nat;
    personId : ?Text;
    newPersonCandidateId : ?Nat;
    status : OldReviewStatus;
    conflictReviewId : ?Nat;
    submittedBy : Principal;
    submittedAt : Int;
    reviewedBy : ?Principal;
    reviewedAt : ?Int;
    updatedAt : Int;
  };

  type NewProposedFinding = {
    id : Nat;
    title : Text;
    evidenceLabel : EvidenceLabel;
    findingType : FindingType;
    content : FindingContent;
    sourceId : Nat;
    personId : ?Text;
    newPersonCandidateId : ?Nat;
    status : NewReviewStatus;
    conflictReviewId : ?Nat;
    submittedBy : Principal;
    submittedAt : Int;
    reviewedBy : ?Principal;
    reviewedAt : ?Int;
    updatedAt : Int;
  };

  type OldNewPersonCandidate = {
    id : Nat;
    name : Text;
    details : Text;
    sourceId : Nat;
    status : OldReviewStatus;
    submittedBy : Principal;
    submittedAt : Int;
    reviewedBy : ?Principal;
    reviewedAt : ?Int;
  };

  type NewNewPersonCandidate = {
    id : Nat;
    name : Text;
    details : Text;
    sourceId : Nat;
    status : NewReviewStatus;
    submittedBy : Principal;
    submittedAt : Int;
    reviewedBy : ?Principal;
    reviewedAt : ?Int;
  };

  type OldRelationshipProposal = {
    id : Nat;
    fromPersonId : Text;
    toPersonId : Text;
    relationshipType : Text;
    sourceId : Nat;
    status : OldReviewStatus;
    submittedBy : Principal;
    submittedAt : Int;
    reviewedBy : ?Principal;
    reviewedAt : ?Int;
  };

  type NewRelationshipProposal = {
    id : Nat;
    fromPersonId : Text;
    toPersonId : Text;
    relationshipType : Text;
    sourceId : Nat;
    status : NewReviewStatus;
    submittedBy : Principal;
    submittedAt : Int;
    reviewedBy : ?Principal;
    reviewedAt : ?Int;
  };

  type OldConflictReviewItem = {
    id : Nat;
    findingId : Nat;
    field : Text;
    canonicalValue : Text;
    proposedValue : Text;
    status : OldReviewStatus;
    resolvedBy : ?Principal;
    resolvedAt : ?Int;
  };

  type NewConflictReviewItem = {
    id : Nat;
    findingId : Nat;
    field : Text;
    canonicalValue : Text;
    proposedValue : Text;
    status : NewReviewStatus;
    resolvedBy : ?Principal;
    resolvedAt : ?Int;
  };

  type OldNotification = {
    id : Nat;
    recipient : Principal;
    notificationType : OldNotificationType;
    message : Text;
    createdAt : Int;
    read : Bool;
  };

  type NewNotification = {
    id : Nat;
    recipient : Principal;
    notificationType : NewNotificationType;
    message : Text;
    createdAt : Int;
    read : Bool;
  };

  // Subset form: only the collections whose element types gained a variant tag
  // are listed. All other pre-existing stable collections carry through
  // unchanged. This migration widens ReviewStatus with #NeedsResearch and
  // NotificationType with the research notification variants, preserving every
  // existing record.
  type OldActor = {
    researchSources : List.List<OldSourceRecord>;
    proposedFindings : List.List<OldProposedFinding>;
    newPersonCandidates : List.List<OldNewPersonCandidate>;
    relationshipProposals : List.List<OldRelationshipProposal>;
    conflictReviewItems : List.List<OldConflictReviewItem>;
    notifications : List.List<OldNotification>;
  };

  type NewActor = {
    researchSources : List.List<NewSourceRecord>;
    proposedFindings : List.List<NewProposedFinding>;
    newPersonCandidates : List.List<NewNewPersonCandidate>;
    relationshipProposals : List.List<NewRelationshipProposal>;
    conflictReviewItems : List.List<NewConflictReviewItem>;
    notifications : List.List<NewNotification>;
  };

  public func migration(old : OldActor) : NewActor {
    let researchSources = List.empty<NewSourceRecord>();
    for (s in old.researchSources.toArray().values()) {
      researchSources.add({
        id = s.id;
        title = s.title;
        sourceType = s.sourceType;
        description = s.description;
        archiveItemId = s.archiveItemId;
        contributor = s.contributor;
        status = s.status : NewReviewStatus;
        createdAt = s.createdAt;
        updatedAt = s.updatedAt;
      });
    };

    let proposedFindings = List.empty<NewProposedFinding>();
    for (f in old.proposedFindings.toArray().values()) {
      proposedFindings.add({
        id = f.id;
        title = f.title;
        evidenceLabel = f.evidenceLabel;
        findingType = f.findingType;
        content = f.content;
        sourceId = f.sourceId;
        personId = f.personId;
        newPersonCandidateId = f.newPersonCandidateId;
        status = f.status : NewReviewStatus;
        conflictReviewId = f.conflictReviewId;
        submittedBy = f.submittedBy;
        submittedAt = f.submittedAt;
        reviewedBy = f.reviewedBy;
        reviewedAt = f.reviewedAt;
        updatedAt = f.updatedAt;
      });
    };

    let newPersonCandidates = List.empty<NewNewPersonCandidate>();
    for (c in old.newPersonCandidates.toArray().values()) {
      newPersonCandidates.add({
        id = c.id;
        name = c.name;
        details = c.details;
        sourceId = c.sourceId;
        status = c.status : NewReviewStatus;
        submittedBy = c.submittedBy;
        submittedAt = c.submittedAt;
        reviewedBy = c.reviewedBy;
        reviewedAt = c.reviewedAt;
      });
    };

    let relationshipProposals = List.empty<NewRelationshipProposal>();
    for (p in old.relationshipProposals.toArray().values()) {
      relationshipProposals.add({
        id = p.id;
        fromPersonId = p.fromPersonId;
        toPersonId = p.toPersonId;
        relationshipType = p.relationshipType;
        sourceId = p.sourceId;
        status = p.status : NewReviewStatus;
        submittedBy = p.submittedBy;
        submittedAt = p.submittedAt;
        reviewedBy = p.reviewedBy;
        reviewedAt = p.reviewedAt;
      });
    };

    let conflictReviewItems = List.empty<NewConflictReviewItem>();
    for (i in old.conflictReviewItems.toArray().values()) {
      conflictReviewItems.add({
        id = i.id;
        findingId = i.findingId;
        field = i.field;
        canonicalValue = i.canonicalValue;
        proposedValue = i.proposedValue;
        status = i.status : NewReviewStatus;
        resolvedBy = i.resolvedBy;
        resolvedAt = i.resolvedAt;
      });
    };

    let notifications = List.empty<NewNotification>();
    for (n in old.notifications.toArray().values()) {
      notifications.add({
        id = n.id;
        recipient = n.recipient;
        notificationType = n.notificationType : NewNotificationType;
        message = n.message;
        createdAt = n.createdAt;
        read = n.read;
      });
    };

    {
      researchSources;
      proposedFindings;
      newPersonCandidates;
      relationshipProposals;
      conflictReviewItems;
      notifications;
    };
  };
};
