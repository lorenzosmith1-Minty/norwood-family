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
export type Result_2 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: ArchiveError;
};
export type PhotoId = bigint;
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
    description: string;
    privacyLevel: PrivacyLevel;
    primarySpeaker?: OralHistorySpeaker;
    extractedNames?: Array<string>;
    itemType: ArchiveItemType;
    aiSummary?: string;
    searchableTranscript?: string;
    relatedBranchId?: string;
    transcript?: string;
    chapterMarkers?: Array<ChapterMarker>;
    sourceStatus: SourceStatus;
    classification: ArchiveItemClassification;
    contributor: Principal;
}
export interface Result__1 {
    hasMore: boolean;
    rows: Array<Array<Cell>>;
}
export type Result_4 = {
    __kind__: "ok";
    ok: ProfileClaim;
} | {
    __kind__: "err";
    err: ClaimError;
};
export type AccountId = Principal;
export interface StewardRecord {
    assignedAt: bigint;
    assignedBy: Principal;
    stewardAccountId: Principal;
    successorPriority?: bigint;
    roleStatus: StewardRoleStatus;
}
export interface Photo {
    id: PhotoId;
    blob: ExternalBlob;
    mimeType: string;
    filename: string;
    uploadedAt: bigint;
    uploadedBy: Principal;
}
export type Result_6 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: RelationshipAdminError;
};
export interface MergeConflict {
    id: bigint;
    field: string;
    status: MergeConflictStatus;
    alternateValue: string;
    canonicalValue: string;
    resolvedAt?: bigint;
    resolvedBy?: Principal;
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
    location?: string;
    contributor: Principal;
}
export type FindingId = bigint;
export interface SuccessorDesignation {
    status: SuccessorStatus;
    assignedAt: bigint;
    assignedBy: Principal;
    personId: PersonId;
    priority: bigint;
}
export interface ReviewQueue {
    pending: bigint;
    conflicting: bigint;
    approved: bigint;
    rejected: bigint;
}
export type Result_12 = {
    __kind__: "ok";
    ok: MergeResult;
} | {
    __kind__: "err";
    err: MergeError;
};
export interface ProfileClaim {
    id: bigint;
    submittedDate: bigint;
    status: ProfileClaimStatus;
    reviewedDate?: bigint;
    reviewedBy?: Principal;
    personId: PersonId;
    requestingUserId: Principal;
}
export interface OralHistorySpeaker {
    name: string;
    personId?: string;
}
export type MysteryId = bigint;
export interface MergeResult {
    archivedPersonId: PersonId;
    conflicts: Array<MergeConflict>;
    canonicalPersonId: PersonId;
}
export type Result = {
    __kind__: "ok";
    ok: PersonProfile;
} | {
    __kind__: "err";
    err: EditError;
};
export type Result_10 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: DeleteError;
};
export type MessageId = bigint;
export type NotificationId = bigint;
export type Result_8 = {
    __kind__: "ok";
    ok: RelationshipRequest;
} | {
    __kind__: "err";
    err: RelationshipError;
};
export interface Notification {
    id: bigint;
    notificationType: NotificationType;
    createdAt: bigint;
    read: boolean;
    recipient: Principal;
    message: string;
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
    transcript?: string;
    location?: string;
    originatingPersonId: string;
    ingredients: Array<string>;
    relatedPersonIds: Array<string>;
}
export interface Account {
    id: AccountId;
    createdAt: bigint;
    authMethods: Array<AuthMethod>;
}
export type Result_13 = {
    __kind__: "ok";
    ok: AuthMethods;
} | {
    __kind__: "err";
    err: AccountError;
};
export type PostId = bigint;
export type ReplyId = bigint;
export type PersonId = string;
export interface AuthMethods {
    apple: boolean;
    google: boolean;
}
export interface Report {
    status: ReportStatus;
    reportedMessageId: MessageId;
    createdAt: Timestamp;
    reportingAccountId: AccountId;
    reportId: ReportId;
    reason: string;
}
export interface PersonMatch {
    name: string;
    personId: PersonId;
    parents: Array<string>;
}
export type Result_11 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: MergeError;
};
export interface Post {
    status: PostStatus;
    authorAccountId: AccountId;
    postType: PostType;
    title?: string;
    body: string;
    createdAt: Timestamp;
    linkedMediaIds: Array<bigint>;
    privacyScope: PrivacyScope;
    authorPersonId: PersonId;
    updatedAt: Timestamp;
    relatedPersonIds: Array<PersonId>;
    postId: PostId;
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
export interface ConversationSummary {
    otherPersonId: PersonId;
    conversationId: ConversationId;
    unreadCount: bigint;
    otherDisplayName: string;
    latestMessagePreview: string;
    latestMessageAt: Timestamp;
}
export interface ResearchAuditEntry {
    id: bigint;
    action: string;
    findingId?: FindingId;
    sourceId?: SourceId;
    actorId: Principal;
    summary: string;
    timestamp: bigint;
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
export type StoryId = bigint;
export type Result_21 = {
    __kind__: "ok";
    ok: Relationship;
} | {
    __kind__: "err";
    err: RelationshipAdminError;
};
export type Result_18 = {
    __kind__: "ok";
    ok: NewPersonCandidate;
} | {
    __kind__: "err";
    err: ResearchError;
};
export type Result_3 = {
    __kind__: "ok";
    ok: ProfileRemovalRequest;
} | {
    __kind__: "err";
    err: RemovalError;
};
export type Result_23 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: Error_;
};
export type Result_15 = {
    __kind__: "ok";
    ok: SuccessorDesignation;
} | {
    __kind__: "err";
    err: StewardError;
};
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
    shortBio?: string;
    timeline?: Array<string>;
    firstName?: string;
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
export interface ChapterMarker {
    title: string;
    timestamp: bigint;
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
export interface RelationshipRequest {
    id: bigint;
    submittedDate: bigint;
    status: RelationshipRequestStatus;
    reviewedDate?: bigint;
    relatedPersonId: PersonId;
    requestingPersonId: PersonId;
    proposedRelationship: RelationshipType;
    reviewer?: Principal;
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
}
export interface AuditEntry {
    id: bigint;
    affectedPersonIds: Array<PersonId>;
    actionType: AuditActionType;
    summary: string;
    timestamp: bigint;
    actorAccountId: Principal;
}
export type Result_5 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: StewardError;
};
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
export type RecipeId = bigint;
export interface Cell {
    value: Value;
    name: string;
}
export type Result_7 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: RemoveError;
};
export type Result_9 = {
    __kind__: "ok";
    ok: StewardRecord;
} | {
    __kind__: "err";
    err: StewardError;
};
export interface ConflictReviewItem {
    id: bigint;
    field: string;
    status: ReviewStatus;
    findingId: FindingId;
    proposedValue: string;
    canonicalValue: string;
    resolvedAt?: bigint;
    resolvedBy?: Principal;
}
export type SourceId = bigint;
export type Timestamp = bigint;
export interface Reply {
    authorAccountId: AccountId;
    body: string;
    createdAt: Timestamp;
    authorPersonId: PersonId;
    replyId: ReplyId;
    postId: PostId;
}
export type Result_17 = {
    __kind__: "ok";
    ok: RelationshipProposal;
} | {
    __kind__: "err";
    err: ResearchError;
};
export interface StewardIdentity {
    accountId: Principal;
    displayName: string;
    personId: PersonId;
    canonicalName: string;
}
export type Result_16 = {
    __kind__: "ok";
    ok: SourceRecord;
} | {
    __kind__: "err";
    err: ResearchError;
};
export type Result_1 = {
    __kind__: "ok";
    ok: Message;
} | {
    __kind__: "err";
    err: MessageError;
};
export type Result_22 = {
    __kind__: "ok";
    ok: Account;
} | {
    __kind__: "err";
    err: AccountError;
};
export interface Resolution {
    supportingEvidence: Array<string>;
    summary: string;
    resolvedAt: bigint;
    resolvedBy: Principal;
}
export type ReportId = bigint;
export interface RelationshipProposal {
    id: bigint;
    status: ReviewStatus;
    fromPersonId: string;
    submittedAt: bigint;
    submittedBy: Principal;
    sourceId: SourceId;
    reviewedAt?: bigint;
    reviewedBy?: Principal;
    toPersonId: string;
    relationshipType: string;
}
export type Result_19 = {
    __kind__: "ok";
    ok: PersonProfile;
} | {
    __kind__: "err";
    err: CreateError;
};
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
export type ConversationId = bigint;
export type ArchiveItemId = bigint;
export type Result_14 = {
    __kind__: "ok";
    ok: AccountId;
} | {
    __kind__: "err";
    err: AccountError;
};
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
export interface DuplicatePair {
    candidateA: DuplicateCandidate;
    candidateB: DuplicateCandidate;
}
export interface ConversationView {
    messages: Array<Message>;
    participantPersonIds: Array<PersonId>;
    conversationId: ConversationId;
    participantDisplayNames: Array<string>;
}
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
export type MysteryContributionId = bigint;
export interface SourceRecord {
    id: SourceId;
    status: ReviewStatus;
    title: string;
    archiveItemId?: bigint;
    createdAt: bigint;
    description: string;
    sourceType: SourceType;
    updatedAt: bigint;
    contributor: Principal;
}
export interface Message {
    status: MessageStatus;
    messageId: MessageId;
    body: string;
    createdAt: Timestamp;
    conversationId: ConversationId;
    senderAccountId: AccountId;
    senderPersonId: PersonId;
    readAt?: Timestamp;
}
export interface ReportedMessageView {
    report: Report;
    message: Message;
}
export type Result_20 = {
    __kind__: "ok";
    ok: ProposedFinding;
} | {
    __kind__: "err";
    err: ResearchError;
};
export interface Relationship {
    id: bigint;
    status: RelationshipStatus;
    fromPersonId: PersonId;
    toPersonId: PersonId;
    relationshipType: RelationshipType;
}
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
export enum ClaimStatus {
    Unclaimed = "Unclaimed",
    Claimed = "Claimed"
}
export enum CreateError {
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
export enum ReviewStatus {
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
    activateSuccessor(personId: PersonId): Promise<Result_9>;
    /**
     * / Adds a one-level reply to a board post. Approved family members only.
     * / Creates a reply notification for the post author.
     */
    addBoardReply(postId: PostId, body: string): Promise<Reply>;
    /**
     * / Adds a canonical story directly (steward only), already approved.
     */
    addCanonicalStory(title: string, storyText: string, relatedMemberIds: Array<string>, era: string | null, year: bigint | null, location: string | null, evidenceStatus: EvidenceStatus, relatedArchiveItemIds: Array<bigint>): Promise<Story>;
    /**
     * / Uploads a new photo to a person's gallery. The signed-in caller is
     * / recorded as the uploader. When the gallery has no profile photo yet, the
     * / newly added photo is automatically set as the profile photo. Returns the
     * / stored photo.
     */
    addPhoto(personId: PersonId, filename: string, mimeType: string, blob: ExternalBlob): Promise<Photo>;
    /**
     * / Adds a missing relationship to the shared family graph. Family Steward
     * / only.
     */
    addRelationship(fromPersonId: PersonId, toPersonId: PersonId, relationshipType: RelationshipType): Promise<Result_21>;
    /**
     * / Approves a pending archive item (admin only). Returns the updated item, or
     * / `null` when the item does not exist or is not pending.
     */
    approveArchiveItem(id: ArchiveItemId): Promise<ArchiveItem | null>;
    /**
     * / Approves a pending finding (steward only), routing it to its target
     * / surface. A finding labelled `#Conflicting` is never approved directly —
     * / it is routed to a Conflict Review item instead of silently overwriting
     * / canonical data. Returns the updated finding, or `null` when it does not
     * / exist or is not pending.
     */
    approveFinding(id: FindingId): Promise<ProposedFinding | null>;
    /**
     * / Approves a pending profile claim, marking the profile claimed and
     * / associating it with the requesting user. Family Steward only.
     */
    approveProfileClaim(claimId: bigint): Promise<ProfileClaim | null>;
    /**
     * / Approves a profile removal request, archiving the profile. Family Steward
     * / only.
     */
    approveProfileRemoval(requestId: bigint): Promise<ProfileRemovalRequest | null>;
    /**
     * / Approves a pending recipe (steward only). Returns the updated recipe, or
     * / `null` when the recipe does not exist or is not pending.
     */
    approveRecipe(id: RecipeId): Promise<Recipe | null>;
    /**
     * / Approves a relationship request, adding/confirming the relationship in the
     * / shared family graph. Family Steward only.
     */
    approveRelationshipRequest(requestId: bigint): Promise<RelationshipRequest | null>;
    /**
     * / Approves a pending story (steward only). Returns the updated story, or
     * / `null` when the story does not exist or is not pending.
     */
    approveStory(id: StoryId): Promise<Story | null>;
    /**
     * / Archives (hides) a board post. The author or a Family Steward may archive.
     * / Governance actions create audit entries.
     */
    archiveBoardPost(postId: PostId): Promise<Post | null>;
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
    bindAuthMethod(method: AuthMethod): Promise<Result_22>;
    /**
     * / Blocks another member, preventing them from sending new messages to the
     * / caller. Approved family members only.
     */
    blockUser(blockedAccountId: Principal): Promise<void>;
    /**
     * / Returns whether the signed-in caller may message the person identified by
     * / `personId`: the viewer is signed in, the target has an active linked
     * / account, the target is not the viewer, and the target is not archived.
     * / Unclaimed profiles are never messageable. Drives the Message button on a
     * / living claimed Person Profile.
     */
    canMessagePerson(personId: string): Promise<boolean>;
    /**
     * / Corrects the relationship type of an existing relationship. Family Steward
     * / only.
     */
    correctRelationshipType(relationshipId: bigint, relationshipType: RelationshipType): Promise<Result_21>;
    /**
     * / Creates a board post with a type, optional title, body, related family
     * / members, and optional linked existing Archive/media ids. Approved family
     * / members only. Creates a mention notification for related members where
     * / appropriate.
     */
    createBoardPost(postType: PostType, title: string | null, body: string, relatedPersonIds: Array<string>, linkedMediaIds: Array<bigint>): Promise<Post>;
    /**
     * / Creates a canonical mystery directly (steward only).
     */
    createCanonicalMystery(title: string, description: string, relatedMemberIds: Array<string>, relatedBranchId: string | null, knownFacts: Array<string>, possibilities: Array<string>, relatedSourceIds: Array<bigint>, relatedArchiveItemIds: Array<bigint>, status: MysteryStatus): Promise<Mystery>;
    /**
     * / Creates a new proposed finding. Requires sign-in; the signed-in caller is
     * / recorded as the submitter. The finding enters as `#Pending`.
     */
    createFinding(title: string, evidenceLabel: EvidenceLabel, findingType: FindingType, content: FindingContent, sourceId: SourceId, personId: string | null, newPersonCandidateId: bigint | null): Promise<Result_20>;
    /**
     * / "Add Myself to This Family": creates a minimal person profile for a user
     * / who does not already exist. The user must then connect to an existing
     * / family member via a relationship request.
     */
    createMyself(name: string): Promise<Result_19>;
    /**
     * / Creates a new Person candidate. Requires sign-in; the signed-in caller is
     * / recorded as the submitter. The candidate enters as `#Pending`.
     */
    createNewPersonCandidate(name: string, details: string, sourceId: SourceId): Promise<Result_18>;
    /**
     * / Creates a new relationship proposal. Requires sign-in; the signed-in
     * / caller is recorded as the submitter. The proposal enters as `#Pending`.
     */
    createRelationshipProposal(fromPersonId: string, toPersonId: string, relationshipType: string, sourceId: SourceId): Promise<Result_17>;
    /**
     * / Creates a new source record. Requires sign-in; the signed-in caller is
     * / recorded as the contributor. The source enters as `#Pending`.
     */
    createSource(title: string, sourceType: SourceType, description: string, archiveItemId: bigint | null): Promise<Result_16>;
    /**
     * / Designates an approved claimed family member as a successor steward with a
     * / priority/order. A successor is a designation only until activated.
     * / Family Steward only.
     */
    designateSuccessor(personId: PersonId, priority: bigint): Promise<Result_15>;
    execute(qJson: string): Promise<Result__1>;
    getApiDoc(): Promise<string>;
    /**
     * / Returns a single active board post by id. Approved family members only.
     */
    getBoardPost(postId: PostId): Promise<Post | null>;
    getCallerUserRole(): Promise<UserRole>;
    /**
     * / Returns a full conversation view for a participant. Only participants may
     * / read a conversation.
     */
    getConversation(conversationId: ConversationId): Promise<ConversationView | null>;
    /**
     * / Returns a single proposed finding by id.
     */
    getFinding(id: FindingId): Promise<ProposedFinding | null>;
    /**
     * / Returns the stable account id of the signed-in caller. Anonymous callers
     * / receive #NotSignedIn.
     */
    getMyAccountId(): Promise<Result_14>;
    /**
     * / Returns the authentication methods bound to the signed-in caller's account.
     */
    getMyAuthMethods(): Promise<Result_13>;
    /**
     * / Returns the signed-in caller's own linked/claimed Person Profile, or, when
     * / none is linked, the caller's pending profile (created via `createMyself` or
     * / with a pending claim by the caller). Returns `null` when the caller has no
     * / profile. Not gated to admin — any signed-in caller may query their own
     * / profile.
     */
    getMyProfile(): Promise<PersonProfile | null>;
    /**
     * / Returns the current caller's own claim on a specific profile, or `null`
     * / when the caller has no claim on that profile. Not gated to admin — any
     * / signed-in caller may query their own claim.
     */
    getMyProfileClaim(personId: PersonId): Promise<ProfileClaim | null>;
    /**
     * / Returns the signed-in caller's own pending relationship requests (requests
     * / involving a profile the caller owns or created). Not gated to admin — any
     * / signed-in caller may query their own pending relationship state.
     */
    getMyRelationshipRequests(): Promise<Array<RelationshipRequest>>;
    /**
     * / Returns the count of all current pending review items (archive/media,
     * / video/audio, recipes, recipe media, and other contribution types) for the
     * / Steward-facing Pending Contributions badge. Family Steward only. The count
     * / is derived from canonical pending data, so it increments on new pending
     * / items and decrements on Approve/Reject automatically.
     */
    getPendingContributionsCount(): Promise<bigint>;
    /**
     * / Returns the ownership/lifecycle state of a person profile, or `null` when
     * / the person is not tracked.
     */
    getPersonProfile(personId: PersonId): Promise<PersonProfile | null>;
    /**
     * / Returns the person's current profile photo, or `null` when none is set.
     */
    getProfilePhoto(personId: PersonId): Promise<Photo | null>;
    /**
     * / Returns a single recipe by id, or `null` when it does not exist or is not
     * / visible to the caller. Private recipes are only visible to their
     * / contributor or a Family Steward; non-approved recipes are only visible to
     * / a Family Steward.
     */
    getRecipe(id: RecipeId): Promise<Recipe | null>;
    /**
     * / Returns a single relationship request by id.
     */
    getRelationshipRequest(id: bigint): Promise<RelationshipRequest | null>;
    /**
     * / Returns the reported message content for a report. Family Steward only;
     * / reported message content is visible only when a report is filed. Stewards
     * / cannot browse arbitrary private conversations.
     */
    getReportedMessage(reportId: ReportId): Promise<ReportedMessageView | null>;
    /**
     * / Returns the full research intake audit history.
     */
    getResearchAuditLog(): Promise<Array<ResearchAuditEntry>>;
    /**
     * / Returns the review queue badge counts (pending, approved, rejected,
     * / conflicting) across all reviewable research intake items.
     */
    getReviewQueue(): Promise<ReviewQueue>;
    /**
     * / Returns a warning encouraging successor designation when only one steward
     * / exists, or `null` when there are multiple stewards. Family Steward only.
     */
    getSingleStewardWarning(): Promise<string | null>;
    /**
     * / Returns a single source record by id.
     */
    getSource(id: SourceId): Promise<SourceRecord | null>;
    isCallerAdmin(): Promise<boolean>;
    /**
     * / Lists all archive items in approved state (visible in the archive).
     */
    listApprovedArchiveItems(): Promise<Array<ArchiveItem>>;
    /**
     * / Lists all approved recipes visible to the caller. Private recipes are only
     * / visible to their contributor or a Family Steward.
     */
    listApprovedRecipes(): Promise<Array<Recipe>>;
    /**
     * / Lists all approved stories (visible to viewers).
     */
    listApprovedStories(): Promise<Array<Story>>;
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
     * / Lists the account ids the caller has blocked. Approved family members only.
     */
    listBlockedUsers(): Promise<Array<Principal>>;
    /**
     * / Lists active board posts, newest first, optionally filtered by post type.
     * / Approved family members only.
     */
    listBoardPosts(filter: PostType | null): Promise<Array<Post>>;
    /**
     * / Lists the replies to a board post, chronologically. Approved family members
     * / only.
     */
    listBoardReplies(postId: PostId): Promise<Array<Reply>>;
    /**
     * / Lists all confirmed relationships for the frontend to merge into the
     * / shared family graph.
     */
    listConfirmedRelationships(): Promise<Array<Relationship>>;
    /**
     * / Lists all conflict review items (steward only).
     */
    listConflictReviewItems(): Promise<Array<ConflictReviewItem>>;
    /**
     * / Returns the signed-in caller's inbox: one summary per conversation they
     * / participate in, newest activity first. Approved family members only.
     */
    listConversations(): Promise<Array<ConversationSummary>>;
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
     * / Lists all proposed findings (steward only).
     */
    listFindings(): Promise<Array<ProposedFinding>>;
    /**
     * / Returns the person ids of every other member the signed-in caller may
     * / message: living, claimed, linked to an active account, not archived, and
     * / not the caller. Not gated to stewards — any approved member may read it, so
     * / the Private Messages inbox can determine whether any other eligible member
     * / exists. Data-driven: as another relative claims and receives approval they
     * / automatically appear without code changes.
     */
    listMessageableMembers(): Promise<Array<string>>;
    /**
     * / Lists all mysteries (visible to viewers).
     */
    listMysteries(): Promise<Array<Mystery>>;
    /**
     * / Lists all New Person candidates (steward only).
     */
    listNewPersonCandidates(): Promise<Array<NewPersonCandidate>>;
    /**
     * / Lists in-app notification records for the signed-in caller.
     */
    listNotifications(): Promise<Array<Notification>>;
    /**
     * / Lists all archive items in pending state (admin only).
     */
    listPendingArchiveItems(): Promise<Array<ArchiveItem>>;
    /**
     * / Lists all mystery contributions in pending state (steward only).
     */
    listPendingMysteryContributions(): Promise<Array<MysteryContribution>>;
    /**
     * / Lists all recipes in pending state (steward only).
     */
    listPendingRecipes(): Promise<Array<Recipe>>;
    /**
     * / Lists all stories in pending state (steward only).
     */
    listPendingStories(): Promise<Array<Story>>;
    /**
     * / Returns the current relationships for a person. Family Steward only.
     */
    listPersonRelationships(personId: PersonId): Promise<Array<Relationship>>;
    /**
     * / Lists all uploaded photos for a person, in upload order.
     */
    listPhotos(personId: PersonId): Promise<Array<Photo>>;
    /**
     * / Lists all profile claim requests for the Family Steward review area.
     */
    listProfileClaims(): Promise<Array<ProfileClaim>>;
    /**
     * / Lists all profile removal requests for steward review. Family Steward only.
     */
    listProfileRemovalRequests(): Promise<Array<ProfileRemovalRequest>>;
    /**
     * / Lists recipes linked to a person, whether as the originating member or a
     * / related member. Returns only approved recipes visible to the caller;
     * / private recipes are only visible to their contributor or a Family Steward.
     */
    listRecipesForPerson(personId: string): Promise<Array<Recipe>>;
    /**
     * / Lists all relationship proposals (steward only).
     */
    listRelationshipProposals(): Promise<Array<RelationshipProposal>>;
    /**
     * / Lists all relationship requests for the Family Steward review area.
     */
    listRelationshipRequests(): Promise<Array<RelationshipRequest>>;
    /**
     * / Lists all reports. Family Steward only.
     */
    listReports(): Promise<Array<Report>>;
    /**
     * / Lists all source records (steward only).
     */
    listSources(): Promise<Array<SourceRecord>>;
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
     * / Lists all successor designations. Family Steward only.
     */
    listSuccessors(): Promise<Array<SuccessorDesignation>>;
    /**
     * / Lists timeline events aggregated from existing canonical data (visible to
     * / viewers).
     */
    listTimelineEvents(): Promise<Array<TimelineEvent>>;
    /**
     * / Marks all of the caller's messages in a conversation as read. Only
     * / participants may mark a conversation read.
     */
    markConversationRead(conversationId: ConversationId): Promise<void>;
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
    mergeProfiles(canonicalPersonId: PersonId, mergedAwayPersonId: PersonId): Promise<Result_12>;
    /**
     * / Marks two suspected duplicates as not a duplicate. Family Steward only.
     */
    notDuplicate(personIdA: PersonId, personIdB: PersonId): Promise<Result_11>;
    /**
     * / Permanently deletes a profile only when it is empty of archive items,
     * / media, timeline/history, approved relationships, and ownership history,
     * / and explicit confirmation is given. Family Steward only.
     */
    permanentlyDeleteProfile(personId: PersonId, confirmation: boolean): Promise<Result_10>;
    /**
     * / Promotes an existing approved claimed family member to Family Steward.
     * / Family Steward only.
     */
    promoteToSteward(personId: PersonId): Promise<Result_9>;
    /**
     * / Proposes a new relationship between two people. The request starts pending
     * / and is never treated as confirmed until a Family Steward approves it.
     */
    proposeRelationship(fromPersonId: PersonId, toPersonId: PersonId, relationshipType: RelationshipType): Promise<Result_8>;
    /**
     * / Publishes a canonical recipe directly (steward only), already approved.
     * / This is the steward-only add flow; it does not create a second Recipe on
     * / approval.
     */
    publishRecipe(title: string, shortDescription: string, originatingPersonId: string, relatedPersonIds: Array<string>, era: string | null, year: bigint | null, location: string | null, familyBranch: string | null, ingredients: Array<string>, instructions: string, familyStory: string | null, tags: Array<string>, privacyLevel: PrivacyLevel, evidenceStatus: EvidenceStatus, linkedMediaIds: Array<bigint>): Promise<Recipe>;
    /**
     * / Rejects a pending archive item (admin only). Returns the updated item, or
     * / `null` when the item does not exist or is not pending.
     */
    rejectArchiveItem(id: ArchiveItemId): Promise<ArchiveItem | null>;
    /**
     * / Rejects a pending finding (steward only). Returns the updated finding, or
     * / `null` when it does not exist or is not pending.
     */
    rejectFinding(id: FindingId): Promise<ProposedFinding | null>;
    /**
     * / Rejects a pending profile claim. Family Steward only.
     */
    rejectProfileClaim(claimId: bigint): Promise<ProfileClaim | null>;
    /**
     * / Rejects a profile removal request. Family Steward only.
     */
    rejectProfileRemoval(requestId: bigint): Promise<ProfileRemovalRequest | null>;
    /**
     * / Rejects a pending recipe (steward only). Returns the updated recipe, or
     * / `null` when the recipe does not exist or is not pending.
     */
    rejectRecipe(id: RecipeId): Promise<Recipe | null>;
    /**
     * / Rejects a relationship request. Family Steward only.
     */
    rejectRelationshipRequest(requestId: bigint): Promise<RelationshipRequest | null>;
    /**
     * / Rejects a pending story (steward only). Returns the updated story, or
     * / `null` when the story does not exist or is not pending.
     */
    rejectStory(id: StoryId): Promise<Story | null>;
    /**
     * / Removes a reply. Family Steward only. Governance actions create audit
     * / entries.
     */
    removeBoardReply(replyId: ReplyId): Promise<Reply | null>;
    /**
     * / Removes a duplicate test-created profile and any pending relationship
     * / requests or claims tied only to it, preserving the original profile, the
     * / confirmed family graph, and the signed-in account. Family Steward only.
     */
    removeDuplicateProfile(personId: PersonId): Promise<Result_7>;
    /**
     * / Removes a photo from a person's gallery. Returns `true` when a photo was
     * / removed. If the removed photo was the profile photo, the profile photo is
     * / cleared.
     */
    removePhoto(personId: PersonId, photoId: PhotoId): Promise<boolean>;
    /**
     * / Removes an incorrect relationship from the shared family graph. Family
     * / Steward only.
     */
    removeRelationship(relationshipId: bigint): Promise<Result_6>;
    /**
     * / Removes the steward role from another steward, never allowing the last
     * / steward to be removed. Family Steward only.
     */
    removeSteward(stewardAccountId: Principal): Promise<Result_5>;
    /**
     * / Reports a specific message with a reason. Approved family members only.
     */
    reportMessage(messageId: MessageId, reason: string): Promise<Report>;
    /**
     * / "This is Me": creates a pending profile claim for an unclaimed living
     * / profile. Requires sign-in; does not grant ownership until approved.
     */
    requestProfileClaim(personId: PersonId): Promise<Result_4>;
    /**
     * / A claimed living profile owner requests removal of their own profile.
     * / A Family Steward reviews the request.
     */
    requestProfileRemoval(personId: PersonId, reason: string): Promise<Result_3>;
    /**
     * / Resolves a conflict review item (steward only). Returns the updated item,
     * / or `null` when it does not exist.
     */
    resolveConflict(id: bigint): Promise<ConflictReviewItem | null>;
    /**
     * / Resolves a merge conflict by choosing the canonical display value. Family
     * / Steward only.
     */
    resolveMergeConflict(conflictId: bigint, canonicalValue: string): Promise<MergeConflict | null>;
    /**
     * / Restores an archived board post. Family Steward only. Governance actions
     * / create audit entries.
     */
    restoreBoardPost(postId: PostId): Promise<Post | null>;
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
     * / Updates a report's review status. Family Steward only.
     */
    reviewReport(reportId: ReportId, status: ReportStatus): Promise<Report | null>;
    schema(): Promise<string>;
    /**
     * / Searches the authoritative shared profile data for possible duplicate
     * / matches by name, returning name plus parents when known. Names are
     * / normalized before matching (case-insensitive, punctuation ignored, periods
     * / normalized, extra spaces collapsed, suffix variants recognized, partial/
     * / fuzzy allowed).
     */
    searchPossibleMatches(name: string): Promise<Array<PersonMatch>>;
    /**
     * / Sends a private message to the person identified by `personId`, reusing the
     * / existing 1:1 conversation when one exists. Approved family members only.
     * / Creates a new-message notification for the recipient. Blocking prevents new
     * / messages from the blocked user.
     */
    sendMessage(recipientPersonId: string, body: string): Promise<Result_1>;
    /**
     * / Marks the photo with `photoId` as the person's profile photo. Returns the
     * / newly selected photo, or `null` when the photo does not exist.
     */
    setProfilePhoto(personId: PersonId, photoId: PhotoId): Promise<Photo | null>;
    /**
     * / Returns a relationship request to pending state. Family Steward only.
     */
    setRelationshipRequestPending(requestId: bigint): Promise<RelationshipRequest | null>;
    /**
     * / Submits a new archive item. Requires sign-in; the signed-in caller is
     * / recorded as the contributor. The item is stored in pending state and waits
     * / for admin approval before appearing in the archive.
     * /
     * / `classification` marks the item as Oral History (distinct from `itemType`).
     * / When `#OralHistory`, `primarySpeaker` is required (exactly one primary
     * / speaker); when `#Standard`, `primarySpeaker` must be `null`. The reserved
     * / future-ready fields (transcript, searchable transcript, chapter markers,
     * / AI summary, extracted names) are initialized to `null` and are not
     * / populated by any logic yet.
     */
    submitArchiveItem(title: string, description: string, itemType: ArchiveItemType, blob: ExternalBlob, era: string, year: bigint | null, tags: Array<string>, relatedMemberIds: Array<string>, relatedBranchId: string | null, sourceStatus: SourceStatus, privacyLevel: PrivacyLevel, classification: ArchiveItemClassification, primarySpeaker: OralHistorySpeaker | null): Promise<ArchiveItem>;
    /**
     * / Submits a mystery contribution (a note, memory, possible lead, or
     * / source/document reference). Requires sign-in; the signed-in caller is
     * / recorded as the contributor. The contribution is stored in pending state
     * / and waits for a Family Steward to review it before altering the canonical
     * / mystery record.
     */
    submitMysteryContribution(mysteryId: MysteryId, contributionType: MysteryContributionType, text: string): Promise<MysteryContribution>;
    /**
     * / Submits a new recipe. Requires sign-in; the signed-in caller is recorded as
     * / the contributor. The recipe is stored in pending state and waits for a
     * / Family Steward to approve it before becoming visible in Family Recipes.
     */
    submitRecipe(title: string, shortDescription: string, originatingPersonId: string, relatedPersonIds: Array<string>, era: string | null, year: bigint | null, location: string | null, familyBranch: string | null, ingredients: Array<string>, instructions: string, familyStory: string | null, tags: Array<string>, privacyLevel: PrivacyLevel, evidenceStatus: EvidenceStatus, linkedMediaIds: Array<bigint>): Promise<Recipe>;
    /**
     * / Submits a new story. Requires sign-in; the signed-in caller is recorded as
     * / the contributor. The story is stored in pending state and waits for a
     * / Family Steward to approve it before becoming visible.
     */
    submitStory(title: string, storyText: string, relatedMemberIds: Array<string>, era: string | null, year: bigint | null, location: string | null, evidenceStatus: EvidenceStatus, relatedArchiveItemIds: Array<bigint>): Promise<Story>;
    /**
     * / Unblocks another member, allowing them to message the caller again.
     * / Approved family members only.
     */
    unblockUser(blockedAccountId: Principal): Promise<void>;
    /**
     * / Updates the caller's own board post. Approved family members only; the
     * / caller must be the post author.
     */
    updateBoardPost(postId: PostId, postType: PostType, title: string | null, body: string, relatedPersonIds: Array<string>, linkedMediaIds: Array<bigint>): Promise<Post | null>;
    /**
     * / Edits a canonical mystery (steward only). Returns the updated mystery, or
     * / `null` when it does not exist.
     */
    updateCanonicalMystery(id: MysteryId, title: string, description: string, relatedMemberIds: Array<string>, relatedBranchId: string | null, knownFacts: Array<string>, possibilities: Array<string>, relatedSourceIds: Array<bigint>, relatedArchiveItemIds: Array<bigint>, status: MysteryStatus): Promise<Mystery | null>;
    /**
     * / Edits a canonical story (steward only). Returns the updated story, or
     * / `null` when the story does not exist.
     */
    updateCanonicalStory(id: StoryId, title: string, storyText: string, relatedMemberIds: Array<string>, era: string | null, year: bigint | null, location: string | null, evidenceStatus: EvidenceStatus, relatedArchiveItemIds: Array<bigint>): Promise<Story | null>;
    /**
     * / Updates an approved owner's own living profile fields. Never rewrites
     * / family relationships directly.
     */
    updateOwnProfile(personId: PersonId, edits: ProfileEdits): Promise<Result>;
}
