import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
import type { ExternalBlob } from "@caffeineai/object-storage";
export type { ExternalBlob } from "@caffeineai/object-storage";
export interface Account {
    id: AccountId;
    createdAt: bigint;
    authMethods: Array<AuthMethod>;
}
export type AccountId = Principal;
export interface ArchiveItem {
    id: ArchiveItemId;
    era: string;
    status: ArchiveItemStatus;
    title: string;
    relatedMemberIds: Array<string>;
    blob: ExternalBlob;
    createdAt: bigint;
    tags: Array<string>;
    year?: bigint;
    mimeType?: string;
    description: string;
    privacyLevel: PrivacyLevel;
    filename?: string;
    primarySpeaker?: OralHistorySpeaker;
    extractedNames?: Array<string>;
    itemType: ArchiveItemType;
    aiSummary?: string;
    searchableTranscript?: string;
    relatedBranchId?: string;
    familyId: string;
    transcript?: string;
    chapterMarkers?: Array<ChapterMarker>;
    sourceStatus: SourceStatus;
    classification: ArchiveItemClassification;
    contributor: Principal;
}
export type ArchiveItemId = bigint;
export interface ArchiveSearchFilter {
    era?: string;
    relatedMemberId?: string;
    tags: Array<string>;
    searchTerm?: string;
    itemType?: ArchiveItemType;
}
export interface ArchiveSearchQuery {
    era?: string;
    relatedMemberId?: string;
    tags: Array<string>;
    searchTerm?: string;
    itemType?: ArchiveItemType;
    familyId: string;
}
export interface AuditEntry {
    id: bigint;
    affectedPersonIds: Array<PersonId>;
    actionType: AuditActionType;
    summary: string;
    timestamp: bigint;
    actorAccountId: Principal;
}
export interface AuthMethods {
    apple: boolean;
    google: boolean;
}
export interface BoardMediaUpload {
    era: string;
    title: string;
    relatedMemberIds: Array<string>;
    blob: ExternalBlob;
    tags: Array<string>;
    year?: bigint;
    mimeType: string;
    description: string;
    privacyLevel: PrivacyLevel;
    filename: string;
    primarySpeaker?: OralHistorySpeaker;
    itemType: ArchiveItemType;
    relatedBranchId?: string;
    familyId: FamilyId;
    sourceStatus: SourceStatus;
    classification: ArchiveItemClassification;
}
export interface Cell {
    value: Value;
    name: string;
}
export interface ChapterMarker {
    title: string;
    timestamp: bigint;
}
export interface ClaimEligibility {
    eligible: boolean;
    reason?: ClaimPersistenceError;
}
export interface ConflictReviewItem {
    id: bigint;
    field: string;
    status: ReviewStatus;
    evidenceLabel: EvidenceLabel;
    findingId: FindingId;
    proposedValue: string;
    stewardNotes: string;
    proposedSourceId?: bigint;
    personId?: string;
    canonicalValue: string;
    familyId: string;
    resolvedAt?: bigint;
    resolvedBy?: Principal;
    existingSourceId?: bigint;
}
export interface Conversation {
    participantAccountIds: Array<AccountId>;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    participantPersonIds: Array<PersonId>;
    conversationId: ConversationId;
    familyId: FamilyId;
}
export type ConversationId = bigint;
export interface ConversationSummary {
    otherPersonId: PersonId;
    conversationId: ConversationId;
    unreadCount: bigint;
    otherDisplayName: string;
    latestMessagePreview: string;
    latestMessageAt: Timestamp;
}
export interface ConversationView {
    messages: Array<Message>;
    participantPersonIds: Array<PersonId>;
    conversationId: ConversationId;
    participantDisplayNames: Array<string>;
}
export interface DisputedFact {
    field: string;
    status: ReviewStatus;
    proposedValue: string;
    canonicalValue: string;
}
export interface DuplicateCandidate {
    deathDate?: string;
    ownerAccount?: Principal;
    birthDate?: string;
    claimStatus: string;
    name: string;
    archiveLinks: Array<string>;
    children: Array<string>;
    sourceCount: bigint;
    personId: PersonId;
    spouses: Array<string>;
    photoCount: bigint;
    timelineCount: bigint;
    parents: Array<string>;
}
export interface DuplicatePair {
    candidateA: DuplicateCandidate;
    candidateB: DuplicateCandidate;
}
export type Error_ = {
    __kind__: "FrontendOriginsNotConfigured";
    FrontendOriginsNotConfigured: null;
} | {
    __kind__: "MixedSsoSources";
    MixedSsoSources: {
        otherKeys: Array<string>;
        ssoKeys: Array<string>;
    };
} | {
    __kind__: "Stale";
    Stale: {
        ageNs: bigint;
    };
} | {
    __kind__: "MalformedCandid";
    MalformedCandid: null;
} | {
    __kind__: "AmbiguousAttribute";
    AmbiguousAttribute: {
        field: string;
        sources: Array<string>;
    };
} | {
    __kind__: "NoAttributes";
    NoAttributes: null;
} | {
    __kind__: "UnknownNonce";
    UnknownNonce: null;
} | {
    __kind__: "UntrustedSsoSource";
    UntrustedSsoSource: {
        domain: string;
    };
} | {
    __kind__: "MissingField";
    MissingField: string;
} | {
    __kind__: "FrontendOriginMismatch";
    FrontendOriginMismatch: {
        got: string;
        expected: Array<string>;
    };
};
export interface Family {
    id: FamilyId;
    status: FamilyStatus;
    displayName: string;
    createdAt: bigint;
    createdBy: Principal;
}
export type FamilyId = string;
export type FindingContent = {
    __kind__: "Story";
    Story: {
        title: string;
        storyText: string;
        relatedPersonIds: Array<string>;
    };
} | {
    __kind__: "TimelineEvent";
    TimelineEvent: {
        title: string;
        date?: string;
        description: string;
        personId: string;
    };
} | {
    __kind__: "PersonFact";
    PersonFact: {
        field: string;
        value: string;
        personId: string;
    };
} | {
    __kind__: "Source";
    Source: {
        title: string;
        archiveItemId?: bigint;
        description: string;
        sourceType: SourceType;
    };
} | {
    __kind__: "Mystery";
    Mystery: {
        title: string;
        description: string;
        relatedPersonIds: Array<string>;
    };
} | {
    __kind__: "Relationship";
    Relationship: {
        fromPersonId: string;
        toPersonId: string;
        relationshipType: string;
    };
};
export type FindingId = bigint;
export interface MergeConflict {
    id: bigint;
    field: string;
    status: MergeConflictStatus;
    alternateValue: string;
    canonicalValue: string;
    resolvedAt?: bigint;
    resolvedBy?: Principal;
}
export interface MergeResult {
    archivedPersonId: PersonId;
    conflicts: Array<MergeConflict>;
    canonicalPersonId: PersonId;
}
export interface Message {
    status: MessageStatus;
    messageId: MessageId;
    body: string;
    createdAt: Timestamp;
    conversationId: ConversationId;
    senderAccountId: AccountId;
    senderPersonId: PersonId;
    familyId: FamilyId;
    readAt?: Timestamp;
}
export type MessageId = bigint;
export interface Mystery {
    id: MysteryId;
    status: MysteryStatus;
    title: string;
    relatedMemberIds: Array<string>;
    createdAt: bigint;
    relatedArchiveItemIds: Array<bigint>;
    description: string;
    resolution?: Resolution;
    updatedAt: bigint;
    knownFacts: Array<string>;
    possibilities: Array<string>;
    relatedBranchId?: string;
    relatedSourceIds: Array<bigint>;
    contributor: Principal;
}
export interface MysteryContribution {
    id: MysteryContributionId;
    status: MysteryContributionStatus;
    createdAt: bigint;
    text: string;
    mysteryId: MysteryId;
    reviewedAt?: bigint;
    reviewedBy?: Principal;
    contributionType: MysteryContributionType;
    contributor: Principal;
}
export type MysteryContributionId = bigint;
export type MysteryId = bigint;
export interface NewPersonCandidate {
    id: bigint;
    status: ReviewStatus;
    name: string;
    submittedAt: bigint;
    submittedBy: Principal;
    sourceId: SourceId;
    reviewedAt?: bigint;
    reviewedBy?: Principal;
    details: string;
    familyId: string;
}
export interface Notification {
    id: bigint;
    notificationType: NotificationType;
    createdAt: bigint;
    read: boolean;
    recipient: Principal;
    message: string;
}
export type NotificationId = bigint;
export interface OralHistorySpeaker {
    name: string;
    personId?: string;
}
export type PersonId = string;
export interface PersonMatch {
    name: string;
    personId: PersonId;
    parents: Array<string>;
}
export interface PersonProfile {
    occupation?: string;
    privacySettings?: string;
    nickname?: string;
    claimedByUserId?: Principal;
    birthDate?: string;
    birthInfo?: string;
    claimStatus: ClaimStatus;
    livingStatus: LivingStatus;
    name: string;
    longerStory?: string;
    personId: PersonId;
    story?: string;
    middleName?: string;
    suffix?: string;
    preferredName?: string;
    currentLocation?: string;
    birthplace?: string;
    lastName?: string;
    familyId: string;
    shortBio?: string;
    timeline?: Array<string>;
    firstName?: string;
}
export interface Photo {
    id: PhotoId;
    blob: ExternalBlob;
    mimeType: string;
    filename: string;
    uploadedAt: bigint;
    uploadedBy: Principal;
}
export type PhotoId = bigint;
export interface Post {
    status: PostStatus;
    authorAccountId: AccountId;
    postType: PostType;
    title?: string;
    body: string;
    createdAt: Timestamp;
    tags: Array<string>;
    linkedMediaIds: Array<bigint>;
    privacyScope: PrivacyScope;
    authorPersonId: PersonId;
    updatedAt: Timestamp;
    familyId: FamilyId;
    relatedPersonIds: Array<PersonId>;
    postId: PostId;
}
export type PostId = bigint;
export interface ProfileClaim {
    id: bigint;
    submittedDate: bigint;
    status: ProfileClaimStatus;
    reviewedDate?: bigint;
    reviewedBy?: Principal;
    personId: PersonId;
    requestingUserId: Principal;
    familyId: string;
}
export interface ProfileEdits {
    occupation?: string;
    privacySettings?: string;
    nickname?: string;
    birthDate?: string;
    birthInfo?: string;
    livingStatus?: LivingStatus;
    longerStory?: string;
    story?: string;
    middleName?: string;
    suffix?: string;
    preferredName?: string;
    currentLocation?: string;
    birthplace?: string;
    lastName?: string;
    shortBio?: string;
    timeline?: Array<string>;
    firstName?: string;
}
export interface ProfileRemovalRequest {
    id: bigint;
    submittedDate: bigint;
    status: ProfileRemovalStatus;
    reviewedDate?: bigint;
    reviewedBy?: Principal;
    personId: PersonId;
    requestingUserId: Principal;
    reason: string;
}
export interface ProposedFinding {
    id: FindingId;
    status: ReviewStatus;
    title: string;
    evidenceLabel: EvidenceLabel;
    newPersonCandidateId?: bigint;
    content: FindingContent;
    conflictReviewId?: bigint;
    submittedAt: bigint;
    submittedBy: Principal;
    sourceId: SourceId;
    reviewedAt?: bigint;
    reviewedBy?: Principal;
    updatedAt: bigint;
    personId?: string;
    findingType: FindingType;
    familyId: string;
}
export interface Recipe {
    era?: string;
    status: RecipeStatus;
    title: string;
    recipeId: RecipeId;
    aiDerivedText?: string;
    createdAt: bigint;
    tags: Array<string>;
    year?: bigint;
    contributorAccountId: Principal;
    privacyLevel: PrivacyLevel;
    linkedMediaIds: Array<bigint>;
    instructions: string;
    ocrText?: string;
    familyBranch?: string;
    familyStory?: string;
    updatedAt: bigint;
    evidenceStatus: EvidenceStatus;
    shortDescription: string;
    extractedIngredients?: Array<string>;
    familyId: FamilyId;
    transcript?: string;
    location?: string;
    originatingPersonId: string;
    ingredients: Array<string>;
    relatedPersonIds: Array<string>;
}
export type RecipeId = bigint;
export interface Relationship {
    id: bigint;
    status: RelationshipStatus;
    fromPersonId: PersonId;
    familyId: string;
    toPersonId: PersonId;
    relationshipType: RelationshipType;
}
export interface RelationshipProposal {
    id: bigint;
    status: ReviewStatus;
    fromPersonId: string;
    submittedAt: bigint;
    submittedBy: Principal;
    sourceId: SourceId;
    reviewedAt?: bigint;
    reviewedBy?: Principal;
    familyId: string;
    toPersonId: string;
    relationshipType: string;
}
export interface RelationshipRequest {
    id: bigint;
    submittedDate: bigint;
    status: RelationshipRequestStatus;
    reviewedDate?: bigint;
    relatedPersonId: PersonId;
    requestingPersonId: PersonId;
    proposedRelationship: RelationshipType;
    reviewer?: Principal;
    familyId: string;
}
export interface Reply {
    authorAccountId: AccountId;
    body: string;
    createdAt: Timestamp;
    authorPersonId: PersonId;
    replyId: ReplyId;
    familyId: FamilyId;
    postId: PostId;
}
export type ReplyId = bigint;
export interface Report {
    status: ReportStatus;
    reportedMessageId: MessageId;
    createdAt: Timestamp;
    reportingAccountId: AccountId;
    familyId: FamilyId;
    reportId: ReportId;
    reason: string;
}
export type ReportId = bigint;
export interface ReportedMessageView {
    report: Report;
    message: Message;
}
export interface ResearchAuditEntry {
    id: bigint;
    action: string;
    findingId?: FindingId;
    sourceId?: SourceId;
    actorId: Principal;
    summary: string;
    timestamp: bigint;
    familyId: string;
}
export type ResearchError = {
    __kind__: "invalidState";
    invalidState: string;
} | {
    __kind__: "notAuthorized";
    notAuthorized: null;
} | {
    __kind__: "notFound";
    notFound: bigint;
};
export interface Resolution {
    supportingEvidence: Array<string>;
    summary: string;
    resolvedAt: bigint;
    resolvedBy: Principal;
}
export type Result = {
    __kind__: "ok";
    ok: PersonProfile;
} | {
    __kind__: "err";
    err: EditError;
};
export type Result_1 = {
    __kind__: "ok";
    ok: Message;
} | {
    __kind__: "err";
    err: MessageError;
};
export type Result_10 = {
    __kind__: "ok";
    ok: StewardRecord;
} | {
    __kind__: "err";
    err: StewardError;
};
export type Result_11 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: DeleteError;
};
export type Result_12 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: MergeError;
};
export type Result_13 = {
    __kind__: "ok";
    ok: MergeResult;
} | {
    __kind__: "err";
    err: MergeError;
};
export type Result_14 = {
    __kind__: "ok";
    ok: AuthMethods;
} | {
    __kind__: "err";
    err: AccountError;
};
export type Result_15 = {
    __kind__: "ok";
    ok: AccountId;
} | {
    __kind__: "err";
    err: AccountError;
};
export type Result_16 = {
    __kind__: "ok";
    ok: SuccessorDesignation;
} | {
    __kind__: "err";
    err: StewardError;
};
export type Result_17 = {
    __kind__: "ok";
    ok: SourceUploadResult;
} | {
    __kind__: "err";
    err: ResearchError;
};
export type Result_18 = {
    __kind__: "ok";
    ok: SourceRecord;
} | {
    __kind__: "err";
    err: ResearchError;
};
export type Result_19 = {
    __kind__: "ok";
    ok: RelationshipProposal;
} | {
    __kind__: "err";
    err: ResearchError;
};
export type Result_2 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: ArchiveError;
};
export type Result_20 = {
    __kind__: "ok";
    ok: NewPersonCandidate;
} | {
    __kind__: "err";
    err: ResearchError;
};
export type Result_21 = {
    __kind__: "ok";
    ok: PersonProfile;
} | {
    __kind__: "err";
    err: CreateError;
};
export type Result_22 = {
    __kind__: "ok";
    ok: ProposedFinding;
} | {
    __kind__: "err";
    err: ResearchError;
};
export type Result_23 = {
    __kind__: "ok";
    ok: Conversation;
} | {
    __kind__: "err";
    err: MessageError;
};
export type Result_24 = {
    __kind__: "ok";
    ok: Relationship;
} | {
    __kind__: "err";
    err: RelationshipAdminError;
};
export type Result_25 = {
    __kind__: "ok";
    ok: StewardClaimResult;
} | {
    __kind__: "err";
    err: StewardClaimError;
};
export type Result_26 = {
    __kind__: "ok";
    ok: Account;
} | {
    __kind__: "err";
    err: AccountError;
};
export type Result_27 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: Error_;
};
export type Result_3 = {
    __kind__: "ok";
    ok: ConflictReviewItem;
} | {
    __kind__: "err";
    err: ResearchError;
};
export type Result_4 = {
    __kind__: "ok";
    ok: ProfileRemovalRequest;
} | {
    __kind__: "err";
    err: RemovalError;
};
export type Result_5 = {
    __kind__: "ok";
    ok: ProfileClaim;
} | {
    __kind__: "err";
    err: ClaimError;
};
export type Result_6 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: StewardError;
};
export type Result_7 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: RelationshipAdminError;
};
export type Result_8 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: RemoveError;
};
export type Result_9 = {
    __kind__: "ok";
    ok: RelationshipRequest;
} | {
    __kind__: "err";
    err: RelationshipError;
};
export interface Result__1 {
    hasMore: boolean;
    rows: Array<Array<Cell>>;
}
export interface ReviewQueue {
    pending: bigint;
    conflicting: bigint;
    approved: bigint;
    rejected: bigint;
    needsResearch: bigint;
    items: Array<ReviewQueueItem>;
}
export interface ReviewQueueItem {
    id: bigint;
    provenance: string;
    status: ReviewStatus;
    title: string;
    evidenceLabel?: EvidenceLabel;
    kind: ReviewItemKind;
    createdAt: bigint;
    actions: Array<ReviewAction>;
    summary: string;
    contributor?: Principal;
}
export type SourceId = bigint;
export interface SourceRecord {
    id: SourceId;
    status: ReviewStatus;
    title: string;
    archiveItemId?: bigint;
    createdAt: bigint;
    description: string;
    sourceType: SourceType;
    updatedAt: bigint;
    familyId: string;
    contributor: Principal;
}
export interface SourceUploadResult {
    source: SourceRecord;
    archiveItem: ArchiveItem;
}
export interface StewardAuditEntry {
    id: bigint;
    field?: string;
    affectedPersonIds: Array<string>;
    proposedValue?: string;
    stewardNotes?: string;
    kind: StewardAuditKind;
    proposedSourceId?: bigint;
    actionType: string;
    resolution?: string;
    existingValue?: string;
    summary: string;
    personId?: string;
    timestamp: bigint;
    actorAccountId: Principal;
    existingSourceId?: bigint;
}
export interface StewardClaimResult {
    stewardAccountId: Principal;
    claimedAt: bigint;
    claimedBy: Principal;
}
export interface StewardIdentity {
    accountId: Principal;
    displayName: string;
    personId: PersonId;
    canonicalName: string;
}
export interface StewardRecord {
    assignedAt: bigint;
    assignedBy: Principal;
    stewardAccountId: Principal;
    successorPriority?: bigint;
    roleStatus: StewardRoleStatus;
    familyId: string;
}
export interface Story {
    id: StoryId;
    era?: string;
    status: StoryStatus;
    title: string;
    relatedMemberIds: Array<string>;
    storyText: string;
    createdAt: bigint;
    year?: bigint;
    relatedArchiveItemIds: Array<bigint>;
    updatedAt: bigint;
    evidenceStatus: EvidenceStatus;
    familyId: FamilyId;
    location?: string;
    contributor: Principal;
}
export type StoryId = bigint;
export interface SuccessorDesignation {
    status: SuccessorStatus;
    assignedAt: bigint;
    assignedBy: Principal;
    personId: PersonId;
    priority: bigint;
}
export interface TimelineEvent {
    id: string;
    era?: string;
    title: string;
    year?: bigint;
    linkTarget: TimelineLinkTarget;
    description: string;
    evidenceStatus: EvidenceStatus;
    eventType: TimelineEventType;
}
export type TimelineLinkTarget = {
    __kind__: "Story";
    Story: StoryId;
} | {
    __kind__: "Mystery";
    Mystery: MysteryId;
} | {
    __kind__: "Person";
    Person: string;
} | {
    __kind__: "ArchiveItem";
    ArchiveItem: bigint;
};
export type Timestamp = bigint;
export type Value = {
    __kind__: "int";
    int: bigint;
} | {
    __kind__: "nat";
    nat: bigint;
} | {
    __kind__: "float";
    float: number;
} | {
    __kind__: "bool";
    bool: boolean;
} | {
    __kind__: "null";
    null: null;
} | {
    __kind__: "text";
    text: string;
};
export enum AccountError {
    AccountNotFound = "AccountNotFound",
    NotSignedIn = "NotSignedIn"
}
export enum ArchiveError {
    NotArchived = "NotArchived",
    ProfileNotFound = "ProfileNotFound",
    AlreadyArchived = "AlreadyArchived",
    NotSignedIn = "NotSignedIn"
}
export enum ArchiveItemClassification {
    OralHistory = "OralHistory",
    Standard = "Standard"
}
export enum ArchiveItemStatus {
    Approved = "Approved",
    Rejected = "Rejected",
    Pending = "Pending"
}
export enum ArchiveItemType {
    Research = "Research",
    Photo = "Photo",
    Document = "Document",
    WorkBusiness = "WorkBusiness",
    WrittenStoryNote = "WrittenStoryNote",
    Audio = "Audio",
    Other = "Other",
    Video = "Video"
}
export enum AuditActionType {
    ProfileRemovalRequested = "ProfileRemovalRequested",
    ClaimRejected = "ClaimRejected",
    RelationshipTypeCorrected = "RelationshipTypeCorrected",
    RelationshipRequestPending = "RelationshipRequestPending",
    StewardPromoted = "StewardPromoted",
    BoardReplyRemoved = "BoardReplyRemoved",
    SuccessorActivated = "SuccessorActivated",
    StewardRemoved = "StewardRemoved",
    RelationshipRequestApproved = "RelationshipRequestApproved",
    DuplicateMerged = "DuplicateMerged",
    ProfilePermanentlyDeleted = "ProfilePermanentlyDeleted",
    RelationshipRequestRejected = "RelationshipRequestRejected",
    ProfileArchived = "ProfileArchived",
    ProfileRestored = "ProfileRestored",
    BoardPostArchived = "BoardPostArchived",
    BoardPostRestored = "BoardPostRestored",
    RelationshipAdded = "RelationshipAdded",
    RelationshipRemoved = "RelationshipRemoved",
    ProfileRemovalReviewed = "ProfileRemovalReviewed",
    ClaimApproved = "ClaimApproved",
    SuccessorDesignated = "SuccessorDesignated"
}
export enum AuthMethod {
    Google = "Google",
    Apple = "Apple"
}
export enum ClaimError {
    AlreadyPending = "AlreadyPending",
    ProfileNotFound = "ProfileNotFound",
    AlreadyClaimed = "AlreadyClaimed",
    NotSignedIn = "NotSignedIn",
    DeceasedProfile = "DeceasedProfile"
}
export enum ClaimPersistenceError {
    AlreadyOwned = "AlreadyOwned",
    AlreadyPending = "AlreadyPending",
    ProfileNotFound = "ProfileNotFound",
    NotSignedIn = "NotSignedIn",
    ApprovedOwnerExists = "ApprovedOwnerExists"
}
export enum ClaimStatus {
    Unclaimed = "Unclaimed",
    Claimed = "Claimed"
}
export enum ConflictResolutionAction {
    NeedsResearch = "NeedsResearch",
    PreserveBoth = "PreserveBoth",
    ReplaceExisting = "ReplaceExisting",
    KeepExisting = "KeepExisting"
}
export enum CreateError {
    AlreadyOwned = "AlreadyOwned",
    NotSignedIn = "NotSignedIn"
}
export enum DeleteError {
    HasOwnershipHistory = "HasOwnershipHistory",
    ProfileNotFound = "ProfileNotFound",
    HasMedia = "HasMedia",
    HasArchiveItems = "HasArchiveItems",
    NotSignedIn = "NotSignedIn",
    ConfirmationRequired = "ConfirmationRequired",
    HasTimeline = "HasTimeline",
    HasApprovedRelationships = "HasApprovedRelationships"
}
export enum EditError {
    ProfileNotFound = "ProfileNotFound",
    NotSignedIn = "NotSignedIn",
    NotOwner = "NotOwner",
    DeceasedProfile = "DeceasedProfile"
}
export enum EvidenceLabel {
    NeedsResearch = "NeedsResearch",
    Conflicting = "Conflicting",
    Hypothesis = "Hypothesis",
    Documented = "Documented",
    FamilyHistoryOralHistory = "FamilyHistoryOralHistory",
    PersonalMemory = "PersonalMemory"
}
export enum EvidenceStatus {
    Unresolved = "Unresolved",
    Documented = "Documented",
    FamilyHistory = "FamilyHistory",
    PersonalMemory = "PersonalMemory"
}
export enum FamilyStatus {
    active = "active",
    archived = "archived"
}
export enum FindingType {
    Story = "Story",
    TimelineEvent = "TimelineEvent",
    PersonFact = "PersonFact",
    Source = "Source",
    Mystery = "Mystery",
    Relationship = "Relationship"
}
export enum LivingStatus {
    Living = "Living",
    Deceased = "Deceased"
}
export enum MergeConflictStatus {
    Resolved = "Resolved",
    Pending = "Pending"
}
export enum MergeError {
    NotDuplicate = "NotDuplicate",
    ProfileNotFound = "ProfileNotFound",
    NotSignedIn = "NotSignedIn",
    SameProfile = "SameProfile"
}
export enum MessageError {
    ConversationNotFound = "ConversationNotFound",
    RecipientArchived = "RecipientArchived",
    NotApprovedMember = "NotApprovedMember",
    RecipientNotClaimed = "RecipientNotClaimed",
    NotSignedIn = "NotSignedIn",
    BlockedByRecipient = "BlockedByRecipient",
    NotParticipant = "NotParticipant",
    CannotMessageSelf = "CannotMessageSelf",
    RecipientNotFound = "RecipientNotFound"
}
export enum MessageStatus {
    Blocked = "Blocked",
    Sent = "Sent"
}
export enum MysteryContributionStatus {
    Approved = "Approved",
    Rejected = "Rejected",
    Pending = "Pending"
}
export enum MysteryContributionType {
    Lead = "Lead",
    Note = "Note",
    Memory = "Memory",
    Source = "Source"
}
export enum MysteryStatus {
    Researching = "Researching",
    Open = "Open",
    PartiallyResolved = "PartiallyResolved",
    Resolved = "Resolved"
}
export enum NotificationType {
    ResearchSubmission = "ResearchSubmission",
    ResearchApproved = "ResearchApproved",
    ArchiveApproved = "ArchiveApproved",
    ResearchRejected = "ResearchRejected",
    ArchiveRejected = "ArchiveRejected",
    RelationshipRequested = "RelationshipRequested",
    BoardMention = "BoardMention",
    RelationshipReviewed = "RelationshipReviewed",
    BoardReply = "BoardReply",
    NewMessage = "NewMessage",
    ProfileClaimReviewed = "ProfileClaimReviewed",
    ProfileClaimRequested = "ProfileClaimRequested"
}
export enum PostStatus {
    Active = "Active",
    Archived = "Archived"
}
export enum PostType {
    Announcement = "Announcement",
    Recipe = "Recipe",
    ResearchHistory = "ResearchHistory",
    FamilyQuestion = "FamilyQuestion",
    Memorial = "Memorial",
    General = "General",
    Other = "Other",
    ReunionEvent = "ReunionEvent",
    PhotoIdentification = "PhotoIdentification"
}
export enum PrivacyLevel {
    Private = "Private",
    Public = "Public",
    FamilyOnly = "FamilyOnly"
}
export enum PrivacyScope {
    FamilyOnly = "FamilyOnly"
}
export enum ProfileClaimStatus {
    Approved = "Approved",
    Rejected = "Rejected",
    Pending = "Pending"
}
export enum ProfileRemovalStatus {
    Approved = "Approved",
    Rejected = "Rejected",
    Pending = "Pending"
}
export enum RecipeStatus {
    Approved = "Approved",
    Rejected = "Rejected",
    Archived = "Archived",
    Pending = "Pending"
}
export enum RelationshipAdminError {
    RelationshipNotFound = "RelationshipNotFound",
    NotSignedIn = "NotSignedIn",
    DuplicateRelationship = "DuplicateRelationship",
    PersonNotFound = "PersonNotFound"
}
export enum RelationshipError {
    DuplicateRequest = "DuplicateRequest",
    NotSignedIn = "NotSignedIn",
    PersonNotFound = "PersonNotFound"
}
export enum RelationshipRequestStatus {
    Approved = "Approved",
    Rejected = "Rejected",
    Pending = "Pending"
}
export enum RelationshipStatus {
    Disputed = "Disputed",
    Confirmed = "Confirmed",
    Pending = "Pending"
}
export enum RelationshipType {
    Parent = "Parent",
    Sibling = "Sibling",
    SpousePartner = "SpousePartner",
    Child = "Child"
}
export enum RemovalError {
    AlreadyPending = "AlreadyPending",
    ProfileNotFound = "ProfileNotFound",
    NotSignedIn = "NotSignedIn",
    NotOwner = "NotOwner",
    DeceasedProfile = "DeceasedProfile"
}
export enum RemoveError {
    ProfileNotFound = "ProfileNotFound",
    NotSignedIn = "NotSignedIn"
}
export enum ReportStatus {
    Dismissed = "Dismissed",
    Reviewed = "Reviewed",
    Pending = "Pending"
}
export enum ReviewAction {
    NeedsResearch = "NeedsResearch",
    Approve = "Approve",
    Reject = "Reject"
}
export enum ReviewItemKind {
    Source = "Source",
    RelationshipProposal = "RelationshipProposal",
    ConflictReview = "ConflictReview",
    NewPersonCandidate = "NewPersonCandidate",
    Finding = "Finding"
}
export enum ReviewStatus {
    NeedsResearch = "NeedsResearch",
    Conflicting = "Conflicting",
    Approved = "Approved",
    Rejected = "Rejected",
    Pending = "Pending"
}
export enum SourceStatus {
    Copy = "Copy",
    Unverified = "Unverified",
    Transcribed = "Transcribed",
    Original = "Original"
}
export enum SourceType {
    CertificateHeadstoneReference = "CertificateHeadstoneReference",
    DeedPropertyReference = "DeedPropertyReference",
    ResearchNotes = "ResearchNotes",
    EmailThread = "EmailThread",
    UploadedDocumentImage = "UploadedDocumentImage",
    CensusCitation = "CensusCitation"
}
export enum StewardAuditKind {
    ConflictResolution = "ConflictResolution",
    Governance = "Governance"
}
export enum StewardClaimError {
    StewardAlreadyExists = "StewardAlreadyExists",
    AlreadySteward = "AlreadySteward",
    NotSignedIn = "NotSignedIn"
}
export enum StewardError {
    LastSteward = "LastSteward",
    NotSteward = "NotSteward",
    AlreadySteward = "AlreadySteward",
    NotSignedIn = "NotSignedIn",
    NotApprovedClaimedMember = "NotApprovedClaimedMember",
    NotDesignated = "NotDesignated"
}
export enum StewardRoleStatus {
    Active = "Active",
    Removed = "Removed"
}
export enum StoryStatus {
    Approved = "Approved",
    Rejected = "Rejected",
    Pending = "Pending"
}
export enum SuccessorStatus {
    Activated = "Activated",
    Removed = "Removed",
    Designated = "Designated"
}
export enum TimelineEventType {
    MilitaryService = "MilitaryService",
    Story = "Story",
    Birth = "Birth",
    FamilyEvent = "FamilyEvent",
    Migration = "Migration",
    Mystery = "Mystery",
    Death = "Death",
    PhotoDocument = "PhotoDocument",
    Marriage = "Marriage",
    CensusDocument = "CensusDocument",
    Location = "Location"
}
export enum UserRole {
    admin = "admin",
    user = "user",
    guest = "guest"
}
export interface backendInterface {
    /**
     * / Activates/promotes a designated successor into the active steward role.
     * / Family Steward only.
     */
    activateSuccessor(personId: PersonId): Promise<Result_10>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `addBoardReplyForFamily`.
     */
    addBoardReply(postId: PostId, body: string): Promise<Reply>;
    /**
     * / Adds a one-level reply to a board post in `familyId`. Approved members of
     * / `familyId` only. The parent post must belong to `familyId` and the new
     * / reply's `familyId` is the requested `familyId`, so a Family B post can
     * / never be replied to through a Family A context. Creates a reply
     * / notification for the post author.
     */
    addBoardReplyForFamily(familyId: FamilyId, postId: PostId, body: string): Promise<Reply>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `addCanonicalStoryForFamily`.
     */
    addCanonicalStory(title: string, storyText: string, relatedMemberIds: Array<string>, era: string | null, year: bigint | null, location: string | null, evidenceStatus: EvidenceStatus, relatedArchiveItemIds: Array<bigint>): Promise<Story>;
    /**
     * / Adds a canonical story directly into `familyId` (Steward only), already
     * / approved. Active Steward of `familyId` only. The new story's `familyId` is
     * / the requested `familyId`; every related person must belong to `familyId`,
     * / and every linked Archive media id must belong to `familyId`.
     */
    addCanonicalStoryForFamily(familyId: FamilyId, title: string, storyText: string, relatedMemberIds: Array<string>, era: string | null, year: bigint | null, location: string | null, evidenceStatus: EvidenceStatus, relatedArchiveItemIds: Array<bigint>): Promise<Story>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `addPhotoForFamily`.
     */
    addPhoto(personId: PersonId, filename: string, mimeType: string, blob: ExternalBlob): Promise<Photo>;
    /**
     * / Uploads a new photo to a person's gallery in `familyId`. Requires the
     * / approved owner of that claimed profile or a Steward of `familyId`; the
     * / caller is recorded as the uploader.
     */
    addPhotoForFamily(familyId: FamilyId, personId: PersonId, filename: string, mimeType: string, blob: ExternalBlob): Promise<Photo>;
    /**
     * / Adds a missing relationship to the shared family graph. Family Steward
     * / only.
     */
    addRelationship(fromPersonId: PersonId, toPersonId: PersonId, relationshipType: RelationshipType): Promise<Result_24>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `approveArchiveItemForFamily`.
     */
    approveArchiveItem(id: ArchiveItemId): Promise<ArchiveItem | null>;
    /**
     * / Approves the pending archive item with `id` in `familyId`. Requires an
     * / active Steward of `familyId`; a Steward of another family cannot approve
     * / it. Returns the updated item, or `null` when no pending item with that id
     * / belongs to `familyId`. On the actual transition out of pending, notifies
     * / only the contributor; a repeated call on an already-reviewed item returns
     * / `null` and creates no notification.
     */
    approveArchiveItemForFamily(familyId: FamilyId, id: ArchiveItemId): Promise<ArchiveItem | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `approveFindingForFamily`.
     */
    approveFinding(id: FindingId): Promise<ProposedFinding | null>;
    /**
     * / Approves the pending finding with `findingId` in `familyId`. Requires an
     * / active Steward of `familyId`. The linked Source and referenced
     * / PersonProfile must both belong to `familyId`. A finding labelled
     * / `#Conflicting` is routed to a Conflict Review item carrying the same
     * / `familyId` instead of silently overwriting canonical data. An approved
     * / finding promotes into the canonical profile through the family-qualified
     * / profile lookup, verifying `profile.familyId == familyId` and updating only
     * / that family's profile. Returns the updated finding, or `null` when no
     * / pending finding with that id belongs to `familyId`.
     */
    approveFindingForFamily(familyId: FamilyId, findingId: FindingId): Promise<ProposedFinding | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `approveNewPersonCandidateForFamily`.
     */
    approveNewPersonCandidate(id: bigint): Promise<NewPersonCandidate | null>;
    /**
     * / Approves the pending candidate with `candidateId` in `familyId`. Requires
     * / an active Steward of `familyId`. The linked Source must belong to
     * / `familyId`. Approval creates exactly one canonical Person record
     * / (PersonProfile) in the candidate's own `familyId` through the
     * / family-qualified profile storage, so a Family A candidate never creates or
     * / alters a Family B profile. Returns the updated candidate, or `null` when no
     * / pending candidate with that id belongs to `familyId`.
     */
    approveNewPersonCandidateForFamily(familyId: FamilyId, candidateId: bigint): Promise<NewPersonCandidate | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `approveProfileClaimForFamily`.
     */
    approveProfileClaim(claimId: bigint): Promise<ProfileClaim | null>;
    /**
     * / Approves a pending profile claim in `familyId`. Steward of `familyId`
     * / only.
     */
    approveProfileClaimForFamily(familyId: FamilyId, claimId: bigint): Promise<ProfileClaim | null>;
    /**
     * / Approves a profile removal request, archiving the profile. Family Steward
     * / only.
     */
    approveProfileRemoval(requestId: bigint): Promise<ProfileRemovalRequest | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `approveRecipeForFamily`.
     */
    approveRecipe(recipeId: RecipeId): Promise<Recipe | null>;
    /**
     * / Approves a pending recipe in `familyId`. Active Steward of `familyId` only;
     * / a Steward of another family cannot approve the recipe. Returns the updated
     * / recipe, or `null` when no pending recipe with that id belongs to
     * / `familyId`. A recipe in another family is never touched.
     */
    approveRecipeForFamily(familyId: FamilyId, recipeId: RecipeId): Promise<Recipe | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `approveRelationshipProposalForFamily`. Deprecated single-family form:
     * / delegates with `FamilyTypes.DEFAULT_FAMILY_ID`. Contains no duplicated
     * / business logic.
     */
    approveRelationshipProposal(id: bigint): Promise<RelationshipProposal | null>;
    /**
     * / Approves the pending relationship proposal with `proposalId` in `familyId`.
     * / Requires an active Steward of `familyId`; a Steward of one family can never
     * / approve another family's proposal. The proposal must belong to `familyId`,
     * / both referenced people must still belong to `familyId` at approval time,
     * / and the linked Source, when present, must belong to `familyId`. On success
     * / the proposal transitions to `#Approved` with `reviewedBy`/`reviewedAt` and
     * / exactly one confirmed relationship is created inside `familyId` only, using
     * / the existing Tenancy 1C-A family-scoped relationship implementation; no
     * / cross-family graph edge is ever created. Returns the updated proposal, or
     * / `null` when no pending proposal with that id belongs to `familyId` or a
     * / family-boundary check fails.
     */
    approveRelationshipProposalForFamily(familyId: FamilyId, proposalId: bigint): Promise<RelationshipProposal | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `approveRelationshipRequestForFamily`.
     */
    approveRelationshipRequest(requestId: bigint): Promise<RelationshipRequest | null>;
    /**
     * / Approves a relationship request in `familyId`. Steward of `familyId` only.
     */
    approveRelationshipRequestForFamily(familyId: FamilyId, requestId: bigint): Promise<RelationshipRequest | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `approveSourceForFamily`.
     */
    approveSource(id: SourceId): Promise<SourceRecord | null>;
    /**
     * / Approves the pending source with `sourceId` in `familyId`. Requires an
     * / active Steward of `familyId`. When the source links an Archive item that
     * / belongs to the same family, that item is transitioned from `#Pending` to
     * / `#Approved` in the same action with no Archive notification; exactly one
     * / `#ResearchApproved` notification is recorded to the contributor. Returns
     * / the updated source, or `null` when no pending source with that id belongs
     * / to `familyId`.
     */
    approveSourceForFamily(familyId: FamilyId, sourceId: SourceId): Promise<SourceRecord | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `approveStoryForFamily`.
     */
    approveStory(id: StoryId): Promise<Story | null>;
    /**
     * / Approves a pending story in `familyId`. Active Steward of `familyId` only;
     * / a Steward of another family cannot approve the story. Returns the updated
     * / story, or `null` when no pending story with that id belongs to `familyId`.
     * / A story in another family is never touched.
     */
    approveStoryForFamily(familyId: FamilyId, storyId: StoryId): Promise<Story | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `archiveBoardPostForFamily`.
     */
    archiveBoardPost(postId: PostId): Promise<Post | null>;
    /**
     * / Archives (hides) a board post in `familyId`. The author or an active
     * / Steward of `familyId` may archive. A post in another family is never
     * / touched. Governance actions create audit entries.
     */
    archiveBoardPostForFamily(familyId: FamilyId, postId: PostId): Promise<Post | null>;
    /**
     * / Archives a profile, removing it from normal family browsing while
     * / preserving relationships, media, timeline, sources, and ownership history.
     * / Family Steward only.
     */
    archiveProfile(personId: PersonId): Promise<Result_2>;
    assignCallerUserRole(user: Principal, role: UserRole): Promise<void>;
    /**
     * / Binds an authentication method (Google or Apple) to the signed-in caller's
     * / account. The account id is the caller's stable principal, so the same
     * / person profile stays intact if the provider changes.
     */
    bindAuthMethod(method: AuthMethod): Promise<Result_26>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `blockUserForFamily`.
     */
    blockUser(blockedAccountId: Principal): Promise<void>;
    /**
     * / Blocks another member within `familyId`. Approved members of `familyId`
     * / only.
     */
    blockUserForFamily(familyId: FamilyId, blockedAccountId: Principal): Promise<void>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `canClaimProfileForFamily`.
     */
    canClaimProfile(personId: PersonId): Promise<ClaimEligibility>;
    /**
     * / Whether the caller may claim a profile in `familyId`, enforcing approved
     * / ownership authority and the no-duplicate-claims rule within that family.
     */
    canClaimProfileForFamily(familyId: FamilyId, personId: PersonId): Promise<ClaimEligibility>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `canMessagePersonForFamily`.
     * / An anonymous caller resolves `false` rather than trapping, preserving the
     * / documented `canMessagePerson` contract.
     */
    canMessagePerson(personId: string): Promise<boolean>;
    /**
     * / Returns whether the signed-in caller may message the person identified by
     * / `personId` within `familyId`. Approved members of `familyId` only.
     */
    canMessagePersonForFamily(familyId: FamilyId, personId: string): Promise<boolean>;
    /**
     * / One-time "Claim Family Steward" bootstrap. Any signed-in account may claim
     * / while no active Steward exists; no approved family profile is required.
     * / Succeeds only when no active Steward exists, creating an ACTIVE
     * / `StewardRecord` for the claimer. Once any active Steward exists the claim
     * / permanently refuses. Tenancy 1B: delegates to the canonical family-scoped
     * / helper with the default family id.
     */
    claimSteward(): Promise<Result_25>;
    /**
     * / Corrects the relationship type of an existing relationship. Family Steward
     * / only.
     */
    correctRelationshipType(relationshipId: bigint, relationshipType: RelationshipType): Promise<Result_24>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `createBoardPostForFamily`.
     */
    createBoardPost(postType: PostType, title: string | null, body: string, relatedPersonIds: Array<string>, linkedMediaIds: Array<bigint>, tags: Array<string>): Promise<Post>;
    /**
     * / Creates a board post in `familyId` with a type, optional title, body,
     * / related family members, optional linked existing Archive/media ids, and
     * / free-form tags. Approved members or Stewards of `familyId` only. The new
     * / post's `familyId` is the requested `familyId`; every related person and
     * / every linked media id must belong to `familyId`. Creates a mention
     * / notification for related members where appropriate.
     */
    createBoardPostForFamily(familyId: FamilyId, postType: PostType, title: string | null, body: string, relatedPersonIds: Array<string>, linkedMediaIds: Array<bigint>, tags: Array<string>): Promise<Post>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `createBoardPostWithMediaForFamily`. Deprecated single-family form:
     * / delegates to the canonical family-scoped endpoint with
     * / `FamilyTypes.DEFAULT_FAMILY_ID`, so current Norwood behavior is unchanged.
     */
    createBoardPostWithMedia(postType: PostType, title: string | null, body: string, relatedPersonIds: Array<string>, existingArchiveItemIds: Array<bigint>, newUploads: Array<BoardMediaUpload>, tags: Array<string>): Promise<Post>;
    /**
     * / Creates a board post that attaches existing Archive items (by id) and/or
     * / new uploads, all scoped to `familyId`. Each new upload creates one
     * / canonical Archive item (pending) in `familyId` linked to the post; the
     * / underlying file is never duplicated. Existing Archive items are attached
     * / by id without re-uploading, and only when they belong to `familyId`.
     * / Approved members or Stewards of `familyId` only.
     */
    createBoardPostWithMediaForFamily(familyId: FamilyId, postType: PostType, title: string | null, body: string, relatedPersonIds: Array<string>, existingArchiveItemIds: Array<bigint>, newUploads: Array<BoardMediaUpload>, tags: Array<string>): Promise<Post>;
    /**
     * / Creates a canonical mystery directly (steward only).
     */
    createCanonicalMystery(title: string, description: string, relatedMemberIds: Array<string>, relatedBranchId: string | null, knownFacts: Array<string>, possibilities: Array<string>, relatedSourceIds: Array<bigint>, relatedArchiveItemIds: Array<bigint>, status: MysteryStatus): Promise<Mystery>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `createConversationForFamily`.
     */
    createConversation(recipientPersonId: string): Promise<Result_23>;
    /**
     * / Creates a 1:1 conversation in `familyId` between the caller and the person
     * / identified by `recipientPersonId`. Approved members of `familyId` only;
     * / both participants must belong to `familyId`.
     */
    createConversationForFamily(familyId: FamilyId, recipientPersonId: string): Promise<Result_23>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `createFindingForFamily`.
     */
    createFinding(title: string, evidenceLabel: EvidenceLabel, findingType: FindingType, content: FindingContent, sourceId: SourceId, personId: string | null, newPersonCandidateId: bigint | null): Promise<Result_22>;
    /**
     * / Creates a new proposed finding in `familyId`. Requires an approved member
     * / of `familyId`; the caller is recorded as the submitter. The linked
     * / SourceRecord must belong to `familyId` and the referenced PersonProfile must
     * / belong to `familyId`, so a Source in Family A can never create a Finding
     * / against a profile in Family B. The finding enters as `#Pending` and its
     * / `familyId` is the requested `familyId`.
     */
    createFindingForFamily(familyId: FamilyId, title: string, evidenceLabel: EvidenceLabel, findingType: FindingType, content: FindingContent, sourceId: SourceId, personId: string | null, newPersonCandidateId: bigint | null): Promise<Result_22>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `createMyselfForFamily`.
     */
    createMyself(name: string): Promise<Result_21>;
    /**
     * / "Add Myself to This Family": creates a minimal person profile in
     * / `familyId` for a user who does not already exist there.
     */
    createMyselfForFamily(familyId: FamilyId, name: string): Promise<Result_21>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `createNewPersonCandidateForFamily`.
     */
    createNewPersonCandidate(name: string, details: string, sourceId: SourceId): Promise<Result_20>;
    /**
     * / Creates a new New Person candidate in `familyId`. Requires an approved
     * / member of `familyId`; the caller is recorded as the submitter. The linked
     * / SourceRecord must belong to `familyId` and any referenced people must belong
     * / to `familyId`, so a Source or person in Family A can never create a
     * / Candidate in Family B. The candidate enters as `#Pending` and its `familyId`
     * / is the requested `familyId`.
     */
    createNewPersonCandidateForFamily(familyId: FamilyId, name: string, details: string, sourceId: SourceId): Promise<Result_20>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `createRelationshipProposalForFamily`.
     */
    createRelationshipProposal(fromPersonId: string, toPersonId: string, relationshipType: string, sourceId: SourceId): Promise<Result_19>;
    /**
     * / Creates a new relationship proposal in `familyId`. Requires an approved
     * / member of `familyId`; the caller is recorded as the submitter. Both
     * / referenced people must belong to `familyId` and the linked SourceRecord must
     * / belong to `familyId`, so a Source or person in Family A can never create a
     * / Proposal in Family B. The proposal enters as `#Pending` and its `familyId`
     * / is the requested `familyId`. No approval or confirmed relationship is
     * / created by this flow.
     */
    createRelationshipProposalForFamily(familyId: FamilyId, fromPersonId: string, toPersonId: string, relationshipType: string, sourceId: SourceId): Promise<Result_19>;
    /**
     * / Creates a new source record. Requires an approved family member; the caller
     * / is recorded as the contributor. The source enters as `#Pending`.
     */
    createSource(title: string, sourceType: SourceType, description: string, archiveItemId: bigint | null): Promise<Result_18>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `createSourceWithUploadForFamily`. Deprecated single-family form:
     * / delegates to the canonical family-scoped endpoint with
     * / `FamilyTypes.DEFAULT_FAMILY_ID`, so current Norwood behavior is unchanged.
     */
    createSourceWithUpload(title: string, sourceType: SourceType, description: string, mimeType: string, blob: ExternalBlob, tags: Array<string>, era: string, year: bigint | null, relatedMemberIds: Array<string>, privacyLevel: PrivacyLevel, classification: ArchiveItemClassification, primarySpeaker: OralHistorySpeaker | null, filename: string): Promise<Result_17>;
    /**
     * / Uploads a research source file into `familyId`: creates one canonical
     * / Archive item (pending) in that family and links a new Research Source
     * / record to it, so no manually typed Archive Item ID is required. Requires
     * / an approved member or Steward of `familyId`; the caller is recorded as the
     * / contributor of both records. Every `relatedMemberIds` entry must belong to
     * / `familyId`.
     */
    createSourceWithUploadForFamily(familyId: FamilyId, title: string, sourceType: SourceType, description: string, mimeType: string, blob: ExternalBlob, tags: Array<string>, era: string, year: bigint | null, relatedMemberIds: Array<string>, privacyLevel: PrivacyLevel, classification: ArchiveItemClassification, primarySpeaker: OralHistorySpeaker | null, filename: string): Promise<Result_17>;
    /**
     * / Designates an approved claimed family member as a successor steward with a
     * / priority/order. A successor is a designation only until activated.
     * / Family Steward only.
     */
    designateSuccessor(personId: PersonId, priority: bigint): Promise<Result_16>;
    execute(qJson: string): Promise<Result__1>;
    getApiDoc(): Promise<string>;
    /**
     * / Returns the archive item with `id` when it belongs to `familyId` and is
     * / visible to the caller under the archive privacy rules, or `null`
     * / otherwise. Requires an approved member or active Steward of `familyId`. A
     * / record that exists under another family is never returned, so an
     * / `archiveItemId` alone cannot cross the family boundary.
     */
    getArchiveItemForFamily(familyId: FamilyId, id: ArchiveItemId): Promise<ArchiveItem | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `getBoardPostForFamily`.
     */
    getBoardPost(postId: PostId): Promise<Post | null>;
    /**
     * / Returns a single active board post by id when it belongs to `familyId`.
     * / Approved members of `familyId` only. A post that exists under another
     * / family is never returned, so a `postId` alone cannot cross the family
     * / boundary.
     */
    getBoardPostForFamily(familyId: FamilyId, postId: PostId): Promise<Post | null>;
    getCallerUserRole(): Promise<UserRole>;
    /**
     * / Returns the conflict with `conflictId` when it belongs to `familyId`, or
     * / `null` otherwise. Requires an active Steward of `familyId`, matching the
     * / pre-tenancy Steward-only conflict-read behavior. A record that exists under
     * / another family is never returned, so a `conflictId` alone cannot cross the
     * / family boundary.
     */
    getConflictReviewItemForFamily(familyId: FamilyId, conflictId: bigint): Promise<ConflictReviewItem | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `getConversationForFamily`.
     */
    getConversation(conversationId: ConversationId): Promise<ConversationView | null>;
    /**
     * / Returns a full conversation view for a participant when the conversation
     * / belongs to `familyId`, or `null` otherwise. Approved members of `familyId`
     * / only.
     */
    getConversationForFamily(familyId: FamilyId, conversationId: ConversationId): Promise<ConversationView | null>;
    /**
     * / Returns the family with the given id, or `null` when it is not tracked.
     * / Read-only: this never creates a family.
     */
    getFamily(familyId: FamilyId): Promise<Family | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `getFindingForFamily`.
     */
    getFinding(id: FindingId): Promise<ProposedFinding | null>;
    /**
     * / Returns the finding with `findingId` when it belongs to `familyId`, or
     * / `null` otherwise. Requires an active Steward of `familyId`, matching the
     * / pre-tenancy Steward-only finding-read behavior. A record that exists under
     * / another family is never returned, so a `findingId` alone cannot cross the
     * / family boundary.
     */
    getFindingForFamily(familyId: FamilyId, findingId: FindingId): Promise<ProposedFinding | null>;
    /**
     * / Returns the stable account id of the signed-in caller. Anonymous callers
     * / receive #NotSignedIn.
     */
    getMyAccountId(): Promise<Result_15>;
    /**
     * / Returns the authentication methods bound to the signed-in caller's account.
     */
    getMyAuthMethods(): Promise<Result_14>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `getMyProfileForFamily`.
     */
    getMyProfile(): Promise<PersonProfile | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `getMyProfileClaimForFamily`.
     */
    getMyProfileClaim(personId: PersonId): Promise<ProfileClaim | null>;
    /**
     * / Returns the caller's own claim on a specific profile in `familyId`, or
     * / `null` when the caller has no claim on that profile in that family. No
     * / cross-family claim lookup by personId alone.
     */
    getMyProfileClaimForFamily(familyId: FamilyId, personId: PersonId): Promise<ProfileClaim | null>;
    /**
     * / Returns the signed-in caller's own linked/claimed Person Profile in
     * / `familyId`, or their pending profile in that family, or `null` when the
     * / caller has no profile in `familyId`.
     */
    getMyProfileForFamily(familyId: FamilyId): Promise<PersonProfile | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `getMyRelationshipRequestsForFamily`.
     */
    getMyRelationshipRequests(): Promise<Array<RelationshipRequest>>;
    /**
     * / Returns the signed-in caller's own pending relationship requests in
     * / `familyId` — those involving a profile the caller owns or created in that
     * / family.
     */
    getMyRelationshipRequestsForFamily(familyId: FamilyId): Promise<Array<RelationshipRequest>>;
    /**
     * / Returns the candidate with `candidateId` when it belongs to `familyId`, or
     * / `null` otherwise. Requires an active Steward of `familyId`, matching the
     * / pre-tenancy Steward-only candidate-read behavior. A record that exists
     * / under another family is never returned, so a `candidateId` alone cannot
     * / cross the family boundary.
     */
    getNewPersonCandidateForFamily(familyId: FamilyId, candidateId: bigint): Promise<NewPersonCandidate | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
     * / delegates to the canonical family-scoped implementation with the default
     * / family id so current Norwood behavior is unchanged. Contains no duplicated
     * / business logic.
     */
    getPendingContributionsCount(): Promise<bigint>;
    /**
     * / Returns the count of all current pending review items (archive/media,
     * / video/audio, recipes, recipe media, stories, and mystery contributions)
     * / for the Steward-facing Pending Contributions badge, scoped to `familyId`.
     * / Research Intake review items are NOT included — they resolve exclusively
     * / through the Research Review Queue (getReviewQueue) — and neither is a
     * / pending Archive item linked to a Research Source, which is reviewed through
     * / that same queue. Family Steward of `familyId` only: a Steward of one family
     * / cannot read another family's pending count. The count is derived from
     * / canonical pending data, so it increments on new pending items and
     * / decrements on Approve/Reject automatically, and it always agrees with the
     * / Pending Contributions list.
     */
    getPendingContributionsCountForFamily(familyId: FamilyId): Promise<bigint>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `getPersonProfileForFamily`.
     */
    getPersonProfile(personId: PersonId): Promise<PersonProfile | null>;
    /**
     * / Returns the ownership/lifecycle state of a person profile in `familyId`,
     * / or `null` when the person is not tracked in that family. A personId in
     * / Family A never returns a profile from Family B.
     */
    getPersonProfileForFamily(familyId: FamilyId, personId: PersonId): Promise<PersonProfile | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `getProfilePhotoForFamily`.
     */
    getProfilePhoto(personId: PersonId): Promise<Photo | null>;
    /**
     * / Returns the person's current profile photo in `familyId`, or `null` when
     * / none is set. The single designated portrait of an unclaimed/historical
     * / profile in `familyId` stays readable by guests so claim discovery works;
     * / for a claimed profile only an approved member or Steward of `familyId` may
     * / read it. The lookup confirms the profile belongs to `familyId`.
     */
    getProfilePhotoForFamily(familyId: FamilyId, personId: PersonId): Promise<Photo | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `getRecipeForFamily`.
     */
    getRecipe(recipeId: RecipeId): Promise<Recipe | null>;
    /**
     * / Returns a single recipe by id when it belongs to `familyId` and is visible
     * / to the caller. Approved members of `familyId` only. A recipe that exists
     * / under another family is never returned, so a `recipeId` alone cannot cross
     * / the family boundary.
     */
    getRecipeForFamily(familyId: FamilyId, recipeId: RecipeId): Promise<Recipe | null>;
    /**
     * / Returns the proposal with `proposalId` when it belongs to `familyId`, or
     * / `null` otherwise. Requires an active Steward of `familyId`, matching the
     * / pre-tenancy Steward-only proposal-read behavior. A record that exists under
     * / another family is never returned, so a `proposalId` alone cannot cross the
     * / family boundary.
     */
    getRelationshipProposalForFamily(familyId: FamilyId, proposalId: bigint): Promise<RelationshipProposal | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `getRelationshipRequestForFamily`.
     */
    getRelationshipRequest(id: bigint): Promise<RelationshipRequest | null>;
    /**
     * / Returns a single relationship request by id within `familyId`, or `null`
     * / when absent or when the request belongs to another family.
     */
    getRelationshipRequestForFamily(familyId: FamilyId, id: bigint): Promise<RelationshipRequest | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `getReportedMessageForFamily`.
     */
    getReportedMessage(reportId: ReportId): Promise<ReportedMessageView | null>;
    /**
     * / Returns the reported message content for a report in `familyId`. Active
     * / Steward of `familyId` only.
     */
    getReportedMessageForFamily(familyId: FamilyId, reportId: ReportId): Promise<ReportedMessageView | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `getResearchAuditLogForFamily`. Deprecated single-family form: delegates
     * / with `FamilyTypes.DEFAULT_FAMILY_ID`, so current Norwood behavior for
     * / familyId "norwood" is unchanged. Contains no duplicated business logic and
     * / will be removed once the frontend passes an explicit familyId everywhere.
     */
    getResearchAuditLog(): Promise<Array<ResearchAuditEntry>>;
    /**
     * / Returns the research intake audit history for `familyId`. Requires an
     * / active Steward of `familyId`, using the existing Steward-access denial
     * / behavior evaluated for that family. Only entries whose `familyId` equals
     * / `familyId` are returned, so Family A audit activity is never listed or
     * / exposed through Family B. This is the canonical family-scoped audit read.
     */
    getResearchAuditLogForFamily(familyId: FamilyId): Promise<Array<ResearchAuditEntry>>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `getReviewQueueForFamily`.
     */
    getReviewQueue(): Promise<ReviewQueue>;
    /**
     * / Returns the review queue for `familyId`. Requires an active Steward of
     * / `familyId`. The Sources section and every source-derived count are
     * / restricted to sources whose `familyId` equals `familyId` (byte-identical to
     * / Tenancy 1C-B2-A), the Findings section and every finding-derived count are
     * / restricted to findings whose `familyId` equals `familyId`, and the New
     * / Person Candidates section and every candidate-derived count are restricted
     * / to candidates whose `familyId` equals `familyId` (Tenancy 1C-B2-B2), so the
     * / returned queue never mixes source, finding, or candidate counts across
     * / families. The Relationships and Conflicts categories keep their existing
     * / behavior unchanged in this build.
     */
    getReviewQueueForFamily(familyId: FamilyId): Promise<ReviewQueue>;
    /**
     * / Returns a warning encouraging successor designation when only one steward
     * / exists, or `null` when there are multiple stewards. Family Steward only.
     */
    getSingleStewardWarning(): Promise<string | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `getSourceForFamily`.
     */
    getSource(id: SourceId): Promise<SourceRecord | null>;
    /**
     * / Returns the source with `sourceId` when it belongs to `familyId`, or `null`
     * / otherwise. Requires an active Steward of `familyId`, matching the
     * / pre-tenancy Steward-only source-read behavior. A record that exists under
     * / another family is never returned, so a `sourceId` alone cannot cross the
     * / family boundary.
     */
    getSourceForFamily(familyId: FamilyId, sourceId: SourceId): Promise<SourceRecord | null>;
    /**
     * / Returns the merged Family Steward Audit History: every governance audit
     * / entry plus every conflict-resolution action (Keep Existing, Replace
     * / Existing, Preserve Both/Unresolved, Needs Research) merged
     * / chronologically, newest first, without duplicating records. Each
     * / conflict-resolution entry carries person, field, existing value, proposed
     * / value, resolution, steward notes, steward identity, timestamp, and
     * / provenance/source refs where available. Family Steward only.
     */
    getStewardAuditHistory(): Promise<Array<StewardAuditEntry>>;
    /**
     * / Returns a single story by id when it belongs to `familyId`. Approved
     * / members of `familyId` only. A story that exists under another family is
     * / never returned, so a `storyId` alone cannot cross the family boundary.
     */
    getStoryForFamily(familyId: FamilyId, storyId: StoryId): Promise<Story | null>;
    /**
     * / Whether any active Family Steward exists. Public so the frontend can show
     * / or hide the one-time "Claim Family Steward" control. Tenancy 1B: delegates
     * / to the canonical family-scoped helper with the default family id.
     */
    hasActiveSteward(): Promise<boolean>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `hasApprovedOwnerForFamily`.
     */
    hasApprovedOwner(personId: PersonId): Promise<boolean>;
    /**
     * / Whether a profile in `familyId` already has an approved owner. Approved
     * / ownership is authoritative within that family only.
     */
    hasApprovedOwnerForFamily(familyId: FamilyId, personId: PersonId): Promise<boolean>;
    isCallerAdmin(): Promise<boolean>;
    /**
     * / Whether the caller is an active Norwood Family Steward. Public so the
     * / frontend can ask "am I an active Norwood Family Steward?". Returns `false`
     * / for an anonymous caller and for an account holding only the platform admin
     * / role. Tenancy 1B: delegates to the canonical family-scoped helper with the
     * / default family id; multi-family bootstrap UI is not exposed yet.
     */
    isCallerSteward(): Promise<boolean>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `listApprovedArchiveItemsForFamily`.
     */
    listApprovedArchiveItems(): Promise<Array<ArchiveItem>>;
    /**
     * / Lists all archive items in `familyId` in approved state visible to the
     * / caller. Privacy is enforced server-side: guests and non-approved members
     * / see only Public items; FamilyOnly items require approved family membership
     * / in `familyId`; Private items are visible only to their contributor or an
     * / active Steward of `familyId`. Only items whose `familyId` equals
     * / `familyId` are returned.
     */
    listApprovedArchiveItemsForFamily(familyId: FamilyId): Promise<Array<ArchiveItem>>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `listApprovedRecipesForFamily`.
     */
    listApprovedRecipes(): Promise<Array<Recipe>>;
    /**
     * / Lists every approved recipe in `familyId` visible to the caller. Approved
     * / members of `familyId` only. Private recipes are only visible to their
     * / contributor or a Family Steward. A recipe whose `familyId` differs is never
     * / returned.
     */
    listApprovedRecipesForFamily(familyId: FamilyId): Promise<Array<Recipe>>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `listApprovedStoriesForFamily`.
     */
    listApprovedStories(): Promise<Array<Story>>;
    /**
     * / Lists every approved story in `familyId` (visible to viewers). Approved
     * / members of `familyId` only. A story whose `familyId` differs is never
     * / returned.
     */
    listApprovedStoriesForFamily(familyId: FamilyId): Promise<Array<Story>>;
    /**
     * / Returns the ids of all archived profiles so normal family browsing can
     * / filter them out. Not gated to stewards — any caller may read archived ids.
     */
    listArchivedProfileIds(): Promise<Array<PersonId>>;
    /**
     * / Lists all archived profiles. Family Steward only.
     */
    listArchivedProfiles(): Promise<Array<PersonProfile>>;
    /**
     * / Returns the governance audit log. Audit History is strictly steward-only.
     */
    listAuditHistory(): Promise<Array<AuditEntry>>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `listBlockedUsersForFamily`.
     */
    listBlockedUsers(): Promise<Array<Principal>>;
    /**
     * / Lists the account ids the caller has blocked in `familyId`. Approved
     * / members of `familyId` only.
     */
    listBlockedUsersForFamily(familyId: FamilyId): Promise<Array<Principal>>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `listBoardPostsForFamily`.
     */
    listBoardPosts(filter: PostType | null): Promise<Array<Post>>;
    /**
     * / Lists active board posts in `familyId`, newest first, optionally filtered
     * / by post type. Approved members of `familyId` only. A post whose `familyId`
     * / differs is never returned, so Family A posts never appear in a Family B
     * / call.
     */
    listBoardPostsForFamily(familyId: FamilyId, filter: PostType | null): Promise<Array<Post>>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `listBoardRepliesForFamily`.
     */
    listBoardReplies(postId: PostId): Promise<Array<Reply>>;
    /**
     * / Lists the replies to a board post in `familyId`, chronologically. Approved
     * / members of `familyId` only. The parent post must belong to `familyId` and
     * / every returned reply must carry `familyId` too, so a `postId` alone cannot
     * / cross the family boundary.
     */
    listBoardRepliesForFamily(familyId: FamilyId, postId: PostId): Promise<Array<Reply>>;
    /**
     * / Public claim-discovery read: minimal profile data for `familyId` only,
     * / preserving the existing minimal-data behavior.
     */
    listClaimDiscoveryProfilesForFamily(familyId: FamilyId): Promise<Array<PersonProfile>>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `listConfirmedRelationshipsForFamily`.
     */
    listConfirmedRelationships(): Promise<Array<Relationship>>;
    /**
     * / Lists the confirmed relationships of `familyId` for the frontend to merge
     * / into the shared family graph. Relationships from other families are never
     * / included.
     */
    listConfirmedRelationshipsForFamily(familyId: FamilyId): Promise<Array<Relationship>>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `listConflictReviewItemsForFamily`.
     */
    listConflictReviewItems(): Promise<Array<ConflictReviewItem>>;
    /**
     * / Lists every conflict review item in `familyId`. Requires an active Steward
     * / of `familyId`, matching the pre-tenancy Steward-only conflict-read
     * / behavior. A conflict whose `familyId` differs is never returned, so Family
     * / A conflicts never appear in a Family B call.
     */
    listConflictReviewItemsForFamily(familyId: FamilyId): Promise<Array<ConflictReviewItem>>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `listConflictsForPersonForFamily`.
     */
    listConflictsForPerson(personId: string): Promise<Array<ConflictReviewItem>>;
    /**
     * / Lists the unresolved conflict review items (`#Conflicting` and
     * / `#NeedsResearch`) affecting a given Person in `familyId`, so the frontend
     * / can surface them alongside canonical values on the person profile and
     * / source history views. Requires a signed-in (non-anonymous) caller;
     * / anonymous callers receive `[]`. Only conflicts whose `familyId` equals
     * / `familyId` are returned, so Family A conflicts never appear in a Family B
     * / call. Resolved conflicts are never returned.
     */
    listConflictsForPersonForFamily(familyId: FamilyId, personId: string): Promise<Array<ConflictReviewItem>>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `listConversationsForFamily`.
     */
    listConversations(): Promise<Array<ConversationSummary>>;
    /**
     * / Returns the signed-in caller's inbox in `familyId`, newest activity first.
     * / Approved members of `familyId` only.
     */
    listConversationsForFamily(familyId: FamilyId): Promise<Array<ConversationSummary>>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `listDisputedFactsForPersonForFamily`.
     */
    listDisputedFactsForPerson(personId: string): Promise<Array<DisputedFact>>;
    /**
     * / Returns the facts on a Person Profile in `familyId` that have an unresolved
     * / conflict, so the Person Profile can show a subtle disputed indicator on
     * / each disputed fact. Requires a signed-in (non-anonymous) caller; anonymous
     * / callers receive `[]`. Only conflicts whose `familyId` equals `familyId`
     * / contribute, so a disputed indicator in one family never reflects another
     * / family's conflicts. Resolved conflicts are never returned.
     */
    listDisputedFactsForPersonForFamily(familyId: FamilyId, personId: string): Promise<Array<DisputedFact>>;
    /**
     * / Lists suspected duplicate Person records with comparison data. Family
     * / Steward only.
     */
    listDuplicateCandidates(): Promise<Array<DuplicatePair>>;
    /**
     * / Returns the eligible promotion/successor candidate list: all people who
     * / are living, have an APPROVED/CLAIMED profile, are linked to a valid
     * / account, are not already an active Steward, and are not archived. This is
     * / data-driven — as additional family members claim and receive approval they
     * / automatically appear without code changes. Family Steward only.
     */
    listEligibleStewardCandidates(): Promise<Array<StewardIdentity>>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `listFindingsForFamily`.
     */
    listFindings(): Promise<Array<ProposedFinding>>;
    /**
     * / Lists every proposed finding in `familyId`. Requires an active Steward of
     * / `familyId`, matching the pre-tenancy Steward-only finding-read behavior. A
     * / finding whose `familyId` differs is never returned, so Family A findings
     * / never appear in a Family B call.
     */
    listFindingsForFamily(familyId: FamilyId): Promise<Array<ProposedFinding>>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `listHiddenBoardPostsForFamily`.
     */
    listHiddenBoardPosts(): Promise<Array<Post>>;
    /**
     * / Lists all hidden (moderated) board posts in `familyId` for the Steward-only
     * / Hidden/Moderated Posts view. Active Steward of `familyId` only. A post
     * / whose `familyId` differs is never returned.
     */
    listHiddenBoardPostsForFamily(familyId: FamilyId): Promise<Array<Post>>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `listMessageableMembersForFamily`. An anonymous caller resolves `[]` rather
     * / than trapping, preserving the documented `listMessageableMembers` contract.
     */
    listMessageableMembers(): Promise<Array<string>>;
    /**
     * / Returns the person ids of every other member the signed-in caller may
     * / message within `familyId`. Approved members of `familyId` only.
     */
    listMessageableMembersForFamily(familyId: FamilyId): Promise<Array<string>>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `listMessagesForFamily`.
     */
    listMessages(conversationId: ConversationId): Promise<Array<Message>>;
    /**
     * / Lists the messages of a conversation in `familyId`, oldest first. Approved
     * / members of `familyId` only.
     */
    listMessagesForFamily(familyId: FamilyId, conversationId: ConversationId): Promise<Array<Message>>;
    /**
     * / Lists all mysteries (visible to viewers).
     */
    listMysteries(): Promise<Array<Mystery>>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `listNewPersonCandidatesForFamily`.
     */
    listNewPersonCandidates(): Promise<Array<NewPersonCandidate>>;
    /**
     * / Lists every New Person candidate in `familyId`. Requires an active Steward
     * / of `familyId`, matching the pre-tenancy Steward-only candidate-read
     * / behavior. A candidate whose `familyId` differs is never returned, so Family
     * / A candidates never appear in a Family B call.
     */
    listNewPersonCandidatesForFamily(familyId: FamilyId): Promise<Array<NewPersonCandidate>>;
    /**
     * / Lists in-app notification records for the signed-in caller. Notifications
     * / are recipient-addressed and are not family-scoped.
     */
    listNotifications(): Promise<Array<Notification>>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `listPendingArchiveItemsForFamily`.
     */
    listPendingArchiveItems(): Promise<Array<ArchiveItem>>;
    /**
     * / Lists all archive items in `familyId` in pending state. Requires an active
     * / Steward of `familyId`. Pending items whose id is referenced by a Research
     * / Source are excluded: those are reviewed through the Research Intake queue,
     * / so approving or rejecting the Source cascades to the linked Archive item
     * / and the item is never actionable here. Only items whose `familyId` equals
     * / `familyId` are returned.
     */
    listPendingArchiveItemsForFamily(familyId: FamilyId): Promise<Array<ArchiveItem>>;
    /**
     * / Lists all mystery contributions in pending state (steward only).
     */
    listPendingMysteryContributions(): Promise<Array<MysteryContribution>>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `listPendingRecipesForFamily`.
     */
    listPendingRecipes(): Promise<Array<Recipe>>;
    /**
     * / Lists every recipe in `familyId` currently in pending state. Active Steward
     * / of `familyId` only. A recipe whose `familyId` differs is never returned.
     */
    listPendingRecipesForFamily(familyId: FamilyId): Promise<Array<Recipe>>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `listPendingStoriesForFamily`.
     */
    listPendingStories(): Promise<Array<Story>>;
    /**
     * / Lists every story in `familyId` currently in pending state. Active Steward
     * / of `familyId` only. A story whose `familyId` differs is never returned.
     */
    listPendingStoriesForFamily(familyId: FamilyId): Promise<Array<Story>>;
    /**
     * / Returns the current relationships for a person. Family Steward only.
     */
    listPersonRelationships(personId: PersonId): Promise<Array<Relationship>>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `listPhotosForFamily`.
     */
    listPhotos(personId: PersonId): Promise<Array<Photo>>;
    /**
     * / Lists all uploaded photos for a person in `familyId`, in upload order.
     * / Requires an approved member or active Steward of `familyId`; the full
     * / gallery is never public.
     */
    listPhotosForFamily(familyId: FamilyId, personId: PersonId): Promise<Array<Photo>>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `listProfileClaimsForFamily`.
     */
    listProfileClaims(): Promise<Array<ProfileClaim>>;
    /**
     * / Lists the profile claim requests of `familyId` for the Steward review
     * / area. Steward of `familyId` only.
     */
    listProfileClaimsForFamily(familyId: FamilyId): Promise<Array<ProfileClaim>>;
    /**
     * / Lists all profile removal requests for steward review. Family Steward only.
     */
    listProfileRemovalRequests(): Promise<Array<ProfileRemovalRequest>>;
    /**
     * / Lists the profiles of `familyId` for Explore Family / Person Profile
     * / hydration. Requires an approved member or active Steward of `familyId`.
     */
    listProfilesForFamily(familyId: FamilyId): Promise<Array<PersonProfile>>;
    /**
     * / Lists every recipe in `familyId`, newest first. Approved members of
     * / `familyId` only. A recipe whose `familyId` differs is never returned, so
     * / Family A recipes never appear in a Family B call.
     */
    listRecipesForFamily(familyId: FamilyId): Promise<Array<Recipe>>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `listRecipesForPersonForFamily`.
     */
    listRecipesForPerson(personId: string): Promise<Array<Recipe>>;
    /**
     * / Lists approved recipes in `familyId` linked to a person, whether as the
     * / originating member or a related member. Approved members of `familyId`
     * / only. A recipe whose `familyId` differs is never returned.
     */
    listRecipesForPersonForFamily(familyId: FamilyId, personId: string): Promise<Array<Recipe>>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `listRelationshipProposalsForFamily`.
     */
    listRelationshipProposals(): Promise<Array<RelationshipProposal>>;
    /**
     * / Lists every relationship proposal in `familyId`. Requires an active Steward
     * / of `familyId`, matching the pre-tenancy Steward-only proposal-read
     * / behavior. A proposal whose `familyId` differs is never returned, so Family A
     * / proposals never appear in a Family B call.
     */
    listRelationshipProposalsForFamily(familyId: FamilyId): Promise<Array<RelationshipProposal>>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `listRelationshipRequestsForFamily`.
     */
    listRelationshipRequests(): Promise<Array<RelationshipRequest>>;
    /**
     * / Lists the relationship requests of `familyId` for the Steward review area.
     * / Steward of `familyId` only.
     */
    listRelationshipRequestsForFamily(familyId: FamilyId): Promise<Array<RelationshipRequest>>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `listReportsForFamily`.
     */
    listReports(): Promise<Array<Report>>;
    /**
     * / Lists all reports in `familyId`. Active Steward of `familyId` only.
     */
    listReportsForFamily(familyId: FamilyId): Promise<Array<Report>>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `listSourcesForFamily`.
     */
    listSources(): Promise<Array<SourceRecord>>;
    /**
     * / Lists every source record in `familyId`. Requires an active Steward of
     * / `familyId`, matching the pre-tenancy Steward-only source-read behavior. A
     * / source whose `familyId` differs is never returned, so Family A sources
     * / never appear in a Family B call.
     */
    listSourcesForFamily(familyId: FamilyId): Promise<Array<SourceRecord>>;
    /**
     * / Returns each current Steward and designated Successor enriched with the
     * / linked approved Person identity (personId, preferred/display name, and
     * / canonical full person name), resolved via steward accountId -> approved
     * / linked personId (PersonProfile.claimedByUserId) -> canonical Person
     * / Profile. The internal account id is carried only for authorization/audit.
     * / Family Steward only.
     */
    listStewardIdentities(): Promise<Array<StewardIdentity>>;
    /**
     * / Lists all current Family Stewards with role status and account identity.
     * / Family Steward only.
     */
    listStewards(): Promise<Array<StewardRecord>>;
    /**
     * / Lists every story in `familyId`, newest first. Approved members of
     * / `familyId` only. A story whose `familyId` differs is never returned, so
     * / Family A stories never appear in a Family B call.
     */
    listStoriesForFamily(familyId: FamilyId): Promise<Array<Story>>;
    /**
     * / Lists all successor designations. Family Steward only.
     */
    listSuccessors(): Promise<Array<SuccessorDesignation>>;
    /**
     * / Lists timeline events aggregated from existing canonical data (visible to
     * / viewers).
     */
    listTimelineEvents(): Promise<Array<TimelineEvent>>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `markConversationReadForFamily`.
     */
    markConversationRead(conversationId: ConversationId): Promise<void>;
    /**
     * / Marks all of the caller's messages in a conversation in `familyId` as read.
     * / Approved members of `familyId` only; the caller must be a participant.
     */
    markConversationReadForFamily(familyId: FamilyId, conversationId: ConversationId): Promise<void>;
    /**
     * / Marks a mystery resolved (steward only), recording the resolution summary
     * / and supporting evidence while preserving the prior theories/history.
     * / Returns the updated mystery, or `null` when it does not exist.
     */
    markMysteryResolved(id: MysteryId, summary: string, supportingEvidence: Array<string>): Promise<Mystery | null>;
    /**
     * / Marks one of the signed-in caller's notifications as read. Returns the
     * / updated notification, or `null` when it does not exist or is not addressed
     * / to the caller.
     */
    markNotificationRead(id: NotificationId): Promise<Notification | null>;
    /**
     * / Merges two duplicate profiles into one canonical record, preserving all
     * / valid relationships, media, timeline, stories, sources, archive references,
     * / and ownership/claim history without duplicating shared items. Conflicting
     * / fields are preserved as conflict/review items. The merged-away record is
     * / archived rather than hard-deleted. Family Steward only.
     */
    mergeProfiles(canonicalPersonId: PersonId, mergedAwayPersonId: PersonId): Promise<Result_13>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `needsResearchFindingForFamily`.
     */
    needsResearchFinding(id: FindingId): Promise<ProposedFinding | null>;
    /**
     * / Marks the pending finding with `findingId` in `familyId` as needing
     * / research. Requires an active Steward of `familyId`. Returns the updated
     * / finding, or `null` when no pending finding with that id belongs to
     * / `familyId`.
     */
    needsResearchFindingForFamily(familyId: FamilyId, findingId: FindingId): Promise<ProposedFinding | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `needsResearchNewPersonCandidateForFamily`.
     */
    needsResearchNewPersonCandidate(id: bigint): Promise<NewPersonCandidate | null>;
    /**
     * / Marks the pending candidate with `candidateId` in `familyId` as needing
     * / research. Requires an active Steward of `familyId`. No canonical Person is
     * / created. Returns the updated candidate, or `null` when no pending candidate
     * / with that id belongs to `familyId`.
     */
    needsResearchNewPersonCandidateForFamily(familyId: FamilyId, candidateId: bigint): Promise<NewPersonCandidate | null>;
    /**
     * / Marks a pending Relationship proposal as needing research (Family Steward
     * / only), transitioning it to `#NeedsResearch` while preserving the proposal.
     * / The canonical graph is left unchanged. Returns the updated proposal, or
     * / `null` when it does not exist or is not pending.
     */
    needsResearchRelationshipProposal(id: bigint): Promise<RelationshipProposal | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `needsResearchSourceForFamily`.
     */
    needsResearchSource(id: SourceId): Promise<SourceRecord | null>;
    /**
     * / Marks the pending source with `sourceId` in `familyId` as needing research.
     * / Requires an active Steward of `familyId`. Returns the updated source, or
     * / `null` when no pending source with that id belongs to `familyId`.
     */
    needsResearchSourceForFamily(familyId: FamilyId, sourceId: SourceId): Promise<SourceRecord | null>;
    /**
     * / Marks two suspected duplicates as not a duplicate. Family Steward only.
     */
    notDuplicate(personIdA: PersonId, personIdB: PersonId): Promise<Result_12>;
    /**
     * / Permanently deletes a profile only when it is empty of archive items,
     * / media, timeline/history, approved relationships, and ownership history,
     * / and explicit confirmation is given. Family Steward only.
     */
    permanentlyDeleteProfile(personId: PersonId, confirmation: boolean): Promise<Result_11>;
    /**
     * / Promotes an existing approved claimed family member to Family Steward.
     * / Family Steward only.
     */
    promoteToSteward(personId: PersonId): Promise<Result_10>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `proposeRelationshipForFamily`.
     */
    proposeRelationship(fromPersonId: PersonId, toPersonId: PersonId, relationshipType: RelationshipType): Promise<Result_9>;
    /**
     * / Proposes a new relationship between two people in `familyId`. Both
     * / referenced people must belong to `familyId`.
     */
    proposeRelationshipForFamily(familyId: FamilyId, fromPersonId: PersonId, toPersonId: PersonId, relationshipType: RelationshipType): Promise<Result_9>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `publishRecipeForFamily`.
     */
    publishRecipe(title: string, shortDescription: string, originatingPersonId: string, relatedPersonIds: Array<string>, era: string | null, year: bigint | null, location: string | null, familyBranch: string | null, ingredients: Array<string>, instructions: string, familyStory: string | null, tags: Array<string>, privacyLevel: PrivacyLevel, evidenceStatus: EvidenceStatus, linkedMediaIds: Array<bigint>): Promise<Recipe>;
    /**
     * / Publishes a canonical recipe directly into `familyId` (Steward only),
     * / already approved. Active Steward of `familyId` only. The new recipe's
     * / `familyId` is the requested `familyId`; the originating person and every
     * / related person must belong to `familyId`, and every linked Archive media id
     * / must belong to `familyId`.
     */
    publishRecipeForFamily(familyId: FamilyId, title: string, shortDescription: string, originatingPersonId: string, relatedPersonIds: Array<string>, era: string | null, year: bigint | null, location: string | null, familyBranch: string | null, ingredients: Array<string>, instructions: string, familyStory: string | null, tags: Array<string>, privacyLevel: PrivacyLevel, evidenceStatus: EvidenceStatus, linkedMediaIds: Array<bigint>): Promise<Recipe>;
    /**
     * / Reconciles stale claim notifications for a claim: when the claim is
     * / `#Approved`, marks the pending `#ProfileClaimRequested` notification for
     * / the claimant as read/resolved. The profile status stays `#Claimed` and no
     * / new claim is created. Returns the number of notifications reconciled.
     */
    reconcileClaimNotifications(claimId: bigint): Promise<bigint>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `rejectArchiveItemForFamily`.
     */
    rejectArchiveItem(id: ArchiveItemId): Promise<ArchiveItem | null>;
    /**
     * / Rejects the pending archive item with `id` in `familyId`. Requires an
     * / active Steward of `familyId`; a Steward of another family cannot reject
     * / it. Returns the updated item, or `null` when no pending item with that id
     * / belongs to `familyId`. The rejected record is retained, not deleted. On the
     * / actual transition out of pending, notifies only the contributor; a repeated
     * / call on an already-reviewed item returns `null` and creates no
     * / notification.
     */
    rejectArchiveItemForFamily(familyId: FamilyId, id: ArchiveItemId): Promise<ArchiveItem | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `rejectFindingForFamily`.
     */
    rejectFinding(id: FindingId): Promise<ProposedFinding | null>;
    /**
     * / Rejects the pending finding with `findingId` in `familyId`. Requires an
     * / active Steward of `familyId`. Returns the updated finding, or `null` when
     * / no pending finding with that id belongs to `familyId`.
     */
    rejectFindingForFamily(familyId: FamilyId, findingId: FindingId): Promise<ProposedFinding | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `rejectNewPersonCandidateForFamily`.
     */
    rejectNewPersonCandidate(id: bigint): Promise<NewPersonCandidate | null>;
    /**
     * / Rejects the pending candidate with `candidateId` in `familyId`. Requires an
     * / active Steward of `familyId`. No canonical Person is created. Returns the
     * / updated candidate, or `null` when no pending candidate with that id belongs
     * / to `familyId`.
     */
    rejectNewPersonCandidateForFamily(familyId: FamilyId, candidateId: bigint): Promise<NewPersonCandidate | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `rejectProfileClaimForFamily`.
     */
    rejectProfileClaim(claimId: bigint): Promise<ProfileClaim | null>;
    /**
     * / Rejects a pending profile claim in `familyId`. Steward of `familyId` only.
     */
    rejectProfileClaimForFamily(familyId: FamilyId, claimId: bigint): Promise<ProfileClaim | null>;
    /**
     * / Rejects a profile removal request. Family Steward only.
     */
    rejectProfileRemoval(requestId: bigint): Promise<ProfileRemovalRequest | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `rejectRecipeForFamily`.
     */
    rejectRecipe(recipeId: RecipeId): Promise<Recipe | null>;
    /**
     * / Rejects a pending recipe in `familyId`. Active Steward of `familyId` only;
     * / a Steward of another family cannot reject the recipe. Returns the updated
     * / recipe, or `null` when no pending recipe with that id belongs to
     * / `familyId`. A recipe in another family is never touched.
     */
    rejectRecipeForFamily(familyId: FamilyId, recipeId: RecipeId): Promise<Recipe | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `rejectRelationshipProposalForFamily`. Deprecated single-family form:
     * / delegates with `FamilyTypes.DEFAULT_FAMILY_ID`. Contains no duplicated
     * / business logic.
     */
    rejectRelationshipProposal(id: bigint): Promise<RelationshipProposal | null>;
    /**
     * / Rejects the pending relationship proposal with `proposalId` in `familyId`.
     * / Requires an active Steward of `familyId`. The proposal must belong to
     * / `familyId`; a proposal whose `familyId` differs is treated as not found.
     * / Only that proposal is transitioned to `#Rejected` with
     * / `reviewedBy`/`reviewedAt`; no confirmed relationship is created. Returns
     * / the updated proposal, or `null` when no pending proposal with that id
     * / belongs to `familyId`.
     */
    rejectRelationshipProposalForFamily(familyId: FamilyId, proposalId: bigint): Promise<RelationshipProposal | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `rejectRelationshipRequestForFamily`.
     */
    rejectRelationshipRequest(requestId: bigint): Promise<RelationshipRequest | null>;
    /**
     * / Rejects a relationship request in `familyId`. Steward of `familyId` only.
     */
    rejectRelationshipRequestForFamily(familyId: FamilyId, requestId: bigint): Promise<RelationshipRequest | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `rejectSourceForFamily`.
     */
    rejectSource(id: SourceId): Promise<SourceRecord | null>;
    /**
     * / Rejects the pending source with `sourceId` in `familyId`. Requires an
     * / active Steward of `familyId`. When the source links an Archive item that
     * / belongs to the same family, that item is transitioned from `#Pending` to
     * / `#Rejected` in the same action with no Archive notification; exactly one
     * / `#ResearchRejected` notification is recorded to the contributor. Returns
     * / the updated source, or `null` when no pending source with that id belongs
     * / to `familyId`.
     */
    rejectSourceForFamily(familyId: FamilyId, sourceId: SourceId): Promise<SourceRecord | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `rejectStoryForFamily`.
     */
    rejectStory(id: StoryId): Promise<Story | null>;
    /**
     * / Rejects a pending story in `familyId`. Active Steward of `familyId` only;
     * / a Steward of another family cannot reject the story. Returns the updated
     * / story, or `null` when no pending story with that id belongs to `familyId`.
     * / A story in another family is never touched.
     */
    rejectStoryForFamily(familyId: FamilyId, storyId: StoryId): Promise<Story | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `removeBoardReplyForFamily`.
     */
    removeBoardReply(replyId: ReplyId): Promise<Reply | null>;
    /**
     * / Removes a reply in `familyId`. Active Steward of `familyId` only. A reply
     * / in another family is never touched, so a `replyId` alone cannot cross the
     * / family boundary. Governance actions create audit entries.
     */
    removeBoardReplyForFamily(familyId: FamilyId, replyId: ReplyId): Promise<Reply | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `removeDuplicateProfileForFamily`.
     */
    removeDuplicateProfile(personId: PersonId): Promise<Result_8>;
    /**
     * / Removes a duplicate test-created profile in `familyId`. Steward of
     * / `familyId` only.
     */
    removeDuplicateProfileForFamily(familyId: FamilyId, personId: PersonId): Promise<Result_8>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `removePhotoForFamily`.
     */
    removePhoto(personId: PersonId, photoId: PhotoId): Promise<boolean>;
    /**
     * / Removes a photo from a person's gallery in `familyId`. Requires the
     * / approved owner of that claimed profile or a Steward of `familyId`.
     */
    removePhotoForFamily(familyId: FamilyId, personId: PersonId, photoId: PhotoId): Promise<boolean>;
    /**
     * / Removes an incorrect relationship from the shared family graph. Family
     * / Steward only.
     */
    removeRelationship(relationshipId: bigint): Promise<Result_7>;
    /**
     * / Removes the steward role from another steward, never allowing the last
     * / steward to be removed. Family Steward only.
     */
    removeSteward(stewardAccountId: Principal): Promise<Result_6>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `reportMessageForFamily`.
     */
    reportMessage(messageId: MessageId, reason: string): Promise<Report>;
    /**
     * / Reports a specific message within `familyId`. Approved members of
     * / `familyId` only; the caller must be a participant of the message's
     * / conversation.
     */
    reportMessageForFamily(familyId: FamilyId, messageId: MessageId, reason: string): Promise<Report>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `requestProfileClaimForFamily`.
     */
    requestProfileClaim(personId: PersonId): Promise<Result_5>;
    /**
     * / "This is Me": creates a pending profile claim for an unclaimed living
     * / profile in `familyId`. Requires sign-in; does not grant ownership until
     * / approved. The claim belongs to exactly `familyId`.
     */
    requestProfileClaimForFamily(familyId: FamilyId, personId: PersonId): Promise<Result_5>;
    /**
     * / A claimed living profile owner requests removal of their own profile.
     * / A Family Steward reviews the request.
     */
    requestProfileRemoval(personId: PersonId, reason: string): Promise<Result_4>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `resolveConflictForFamily`.
     */
    resolveConflict(id: bigint, action: ConflictResolutionAction, notes: string): Promise<Result_3>;
    /**
     * / Resolves a conflict review item in `familyId` (Steward of `familyId` only)
     * / with an explicit decision. `#KeepExisting` leaves canonical data unchanged
     * / and resolves the conflict; `#ReplaceExisting` writes the proposed value
     * / into the canonical profile in `familyId` exactly once (preserving the old
     * / value and its provenance in the conflict/audit history and the new Source);
     * / `#PreserveBoth` keeps both values visible as an unresolved `#Conflicting`
     * / conflict; `#NeedsResearch` leaves canonical data unchanged and retains the
     * / conflict with `#NeedsResearch` status. Every conflict action validates that
     * / the conflict and its linked Finding, linked Source, and referenced
     * / PersonProfile all belong to `familyId`. Every resolution records an audit
     * / entry. Returns the updated item, or `#err(#notFound(id))` when no conflict
     * / with that id belongs to `familyId`.
     */
    resolveConflictForFamily(familyId: FamilyId, id: bigint, action: ConflictResolutionAction, notes: string): Promise<Result_3>;
    /**
     * / Resolves a merge conflict by choosing the canonical display value. Family
     * / Steward only.
     */
    resolveMergeConflict(conflictId: bigint, canonicalValue: string): Promise<MergeConflict | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `restoreBoardPostForFamily`.
     */
    restoreBoardPost(postId: PostId): Promise<Post | null>;
    /**
     * / Restores an archived board post in `familyId`. Active Steward of `familyId`
     * / only. A post in another family is never touched. Governance actions create
     * / audit entries.
     */
    restoreBoardPostForFamily(familyId: FamilyId, postId: PostId): Promise<Post | null>;
    /**
     * / Restores an archived profile to normal family browsing. Family Steward
     * / only.
     */
    restoreProfile(personId: PersonId): Promise<Result_2>;
    /**
     * / Approves or rejects a pending mystery contribution (steward only). Returns
     * / the updated contribution, or `null` when it does not exist or is not
     * / pending.
     */
    reviewMysteryContribution(id: MysteryContributionId, approve: boolean): Promise<MysteryContribution | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `reviewReportForFamily`.
     */
    reviewReport(reportId: ReportId, status: ReportStatus): Promise<Report | null>;
    /**
     * / Updates a report's review status within `familyId`. Active Steward of
     * / `familyId` only.
     */
    reviewReportForFamily(familyId: FamilyId, reportId: ReportId, status: ReportStatus): Promise<Report | null>;
    schema(): Promise<string>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for the canonical
     * / `searchArchiveItemsForFamily` endpoint (owned by the Archive API). This
     * / deprecated single-family form delegates to the canonical family-scoped
     * / implementation with `FamilyTypes.DEFAULT_FAMILY_ID`, so current Norwood
     * / behavior is unchanged.
     */
    searchArchiveItems(filter: ArchiveSearchFilter): Promise<Array<ArchiveItem>>;
    /**
     * / Searches/filters approved archive items in `familyId` by title query, tags,
     * / item type, related family member, and era. Requires an approved member or
     * / active Steward of `familyId`. Returns only `#Approved` items whose
     * / `familyId` equals `familyId` and that are visible to the caller under the
     * / archive privacy rules.
     */
    searchArchiveItemsForFamily(familyId: FamilyId, filter: ArchiveSearchQuery): Promise<Array<ArchiveItem>>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `searchBoardPostsByTagsForFamily`.
     */
    searchBoardPostsByTags(tags: Array<string>): Promise<Array<Post>>;
    /**
     * / Lists active board posts in `familyId` that carry ANY of the given tags.
     * / Approved members of `familyId` only. Only posts whose `familyId` equals
     * / `familyId` are considered.
     */
    searchBoardPostsByTagsForFamily(familyId: FamilyId, tags: Array<string>): Promise<Array<Post>>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `searchPossibleMatchesForFamily`.
     */
    searchPossibleMatches(name: string): Promise<Array<PersonMatch>>;
    /**
     * / Searches the authoritative shared profile data of `familyId` for possible
     * / duplicate matches by name. Only profiles belonging to `familyId` are
     * / considered.
     */
    searchPossibleMatchesForFamily(familyId: FamilyId, name: string): Promise<Array<PersonMatch>>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `sendMessageForFamily`.
     */
    sendMessage(recipientPersonId: string, body: string): Promise<Result_1>;
    /**
     * / Sends a private message to the person identified by `recipientPersonId`
     * / within `familyId`, reusing the existing 1:1 conversation when one exists.
     * / Approved members of `familyId` only.
     */
    sendMessageForFamily(familyId: FamilyId, recipientPersonId: string, body: string): Promise<Result_1>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `setProfilePhotoForFamily`.
     */
    setProfilePhoto(personId: PersonId, photoId: PhotoId): Promise<Photo | null>;
    /**
     * / Marks the photo with `photoId` as the person's profile photo in `familyId`.
     * / Requires the approved owner of that claimed profile or a Steward of
     * / `familyId`.
     */
    setProfilePhotoForFamily(familyId: FamilyId, personId: PersonId, photoId: PhotoId): Promise<Photo | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `setRelationshipRequestPendingForFamily`.
     */
    setRelationshipRequestPending(requestId: bigint): Promise<RelationshipRequest | null>;
    /**
     * / Returns a relationship request in `familyId` to pending state. Steward of
     * / `familyId` only.
     */
    setRelationshipRequestPendingForFamily(familyId: FamilyId, requestId: bigint): Promise<RelationshipRequest | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `submitArchiveItemForFamily`.
     */
    submitArchiveItem(title: string, description: string, itemType: ArchiveItemType, mimeType: string, blob: ExternalBlob, era: string, year: bigint | null, tags: Array<string>, relatedMemberIds: Array<string>, relatedBranchId: string | null, sourceStatus: SourceStatus, privacyLevel: PrivacyLevel, classification: ArchiveItemClassification, primarySpeaker: OralHistorySpeaker | null, filename: string): Promise<ArchiveItem>;
    /**
     * / Submits a new archive item into `familyId`. Requires an approved member or
     * / active Steward of `familyId`; the caller is recorded as the contributor.
     * / The stored item's `familyId` is the requested `familyId`, and every
     * / `relatedMemberIds` entry must belong to that same family — Family A may
     * / never reference Family B people. The item is stored in pending state and
     * / waits for Steward approval before appearing in the archive.
     */
    submitArchiveItemForFamily(familyId: FamilyId, title: string, description: string, itemType: ArchiveItemType, mimeType: string, blob: ExternalBlob, era: string, year: bigint | null, tags: Array<string>, relatedMemberIds: Array<string>, relatedBranchId: string | null, sourceStatus: SourceStatus, privacyLevel: PrivacyLevel, classification: ArchiveItemClassification, primarySpeaker: OralHistorySpeaker | null, filename: string): Promise<ArchiveItem>;
    /**
     * / Submits a mystery contribution (a note, memory, possible lead, or
     * / source/document reference). Requires an approved family member; the caller
     * / is recorded as the contributor. The contribution is stored in pending state
     * / and waits for a Family Steward to review it before altering the canonical
     * / mystery record.
     */
    submitMysteryContribution(mysteryId: MysteryId, contributionType: MysteryContributionType, text: string): Promise<MysteryContribution>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `submitRecipeForFamily`.
     */
    submitRecipe(title: string, shortDescription: string, originatingPersonId: string, relatedPersonIds: Array<string>, era: string | null, year: bigint | null, location: string | null, familyBranch: string | null, ingredients: Array<string>, instructions: string, familyStory: string | null, tags: Array<string>, privacyLevel: PrivacyLevel, evidenceStatus: EvidenceStatus, linkedMediaIds: Array<bigint>): Promise<Recipe>;
    /**
     * / Submits a new recipe into `familyId`. Approved members or Stewards of
     * / `familyId` only. The new recipe's `familyId` is the requested `familyId`;
     * / the originating person and every related person must belong to `familyId`,
     * / and every linked Archive media id must belong to `familyId`. The recipe is
     * / stored in pending state and waits for a Steward of `familyId` to approve
     * / it.
     */
    submitRecipeForFamily(familyId: FamilyId, title: string, shortDescription: string, originatingPersonId: string, relatedPersonIds: Array<string>, era: string | null, year: bigint | null, location: string | null, familyBranch: string | null, ingredients: Array<string>, instructions: string, familyStory: string | null, tags: Array<string>, privacyLevel: PrivacyLevel, evidenceStatus: EvidenceStatus, linkedMediaIds: Array<bigint>): Promise<Recipe>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `submitStoryForFamily`.
     */
    submitStory(title: string, storyText: string, relatedMemberIds: Array<string>, era: string | null, year: bigint | null, location: string | null, evidenceStatus: EvidenceStatus, relatedArchiveItemIds: Array<bigint>): Promise<Story>;
    /**
     * / Submits a new story into `familyId`. Approved members or Stewards of
     * / `familyId` only. The new story's `familyId` is the requested `familyId`;
     * / every related person must belong to `familyId`, and every linked Archive
     * / media id must belong to `familyId`. The story is stored in pending state
     * / and waits for a Steward of `familyId` to approve it.
     */
    submitStoryForFamily(familyId: FamilyId, title: string, storyText: string, relatedMemberIds: Array<string>, era: string | null, year: bigint | null, location: string | null, evidenceStatus: EvidenceStatus, relatedArchiveItemIds: Array<bigint>): Promise<Story>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `unblockUserForFamily`.
     */
    unblockUser(blockedAccountId: Principal): Promise<void>;
    /**
     * / Unblocks another member within `familyId`. Approved members of `familyId`
     * / only.
     */
    unblockUserForFamily(familyId: FamilyId, blockedAccountId: Principal): Promise<void>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for `updateBoardPostForFamily`.
     */
    updateBoardPost(postId: PostId, postType: PostType, title: string | null, body: string, relatedPersonIds: Array<string>, linkedMediaIds: Array<bigint>, tags: Array<string>): Promise<Post | null>;
    /**
     * / Updates the caller's own board post in `familyId`. Approved members of
     * / `familyId` only; the caller must be the post author. A post in another
     * / family is never touched, so a `postId` alone cannot cross the family
     * / boundary.
     */
    updateBoardPostForFamily(familyId: FamilyId, postId: PostId, postType: PostType, title: string | null, body: string, relatedPersonIds: Array<string>, linkedMediaIds: Array<bigint>, tags: Array<string>): Promise<Post | null>;
    /**
     * / Edits a canonical mystery (steward only). Returns the updated mystery, or
     * / `null` when it does not exist.
     */
    updateCanonicalMystery(id: MysteryId, title: string, description: string, relatedMemberIds: Array<string>, relatedBranchId: string | null, knownFacts: Array<string>, possibilities: Array<string>, relatedSourceIds: Array<bigint>, relatedArchiveItemIds: Array<bigint>, status: MysteryStatus): Promise<Mystery | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `updateCanonicalStoryForFamily`.
     */
    updateCanonicalStory(id: StoryId, title: string, storyText: string, relatedMemberIds: Array<string>, era: string | null, year: bigint | null, location: string | null, evidenceStatus: EvidenceStatus, relatedArchiveItemIds: Array<bigint>): Promise<Story | null>;
    /**
     * / Edits a canonical story in `familyId` (Steward only). Active Steward of
     * / `familyId` only; a Steward of another family cannot edit the story. Returns
     * / the updated story, or `null` when no story with that id belongs to
     * / `familyId`. A story in another family is never touched.
     */
    updateCanonicalStoryForFamily(familyId: FamilyId, id: StoryId, title: string, storyText: string, relatedMemberIds: Array<string>, era: string | null, year: bigint | null, location: string | null, evidenceStatus: EvidenceStatus, relatedArchiveItemIds: Array<bigint>): Promise<Story | null>;
    /**
     * / TEMPORARY Tenancy 1C compatibility wrapper for
     * / `updateOwnProfileForFamily`.
     */
    updateOwnProfile(personId: PersonId, edits: ProfileEdits): Promise<Result>;
    /**
     * / Updates an approved owner's own living profile fields in `familyId`, or,
     * / for a Steward of `familyId`, the fields of an unclaimed/historical profile
     * / in that family.
     */
    updateOwnProfileForFamily(familyId: FamilyId, personId: PersonId, edits: ProfileEdits): Promise<Result>;
}
