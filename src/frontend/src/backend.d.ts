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
export type Result_2 = {
    __kind__: "ok";
    ok: ProfileRemovalRequest;
} | {
    __kind__: "err";
    err: RemovalError;
};
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
export type PhotoId = bigint;
export interface Result__1 {
    hasMore: boolean;
    rows: Array<Array<Cell>>;
}
export interface ChapterMarker {
    title: string;
    timestamp: bigint;
}
export type Result_5 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: RelationshipAdminError;
};
export interface AuditEntry {
    id: bigint;
    affectedPersonIds: Array<PersonId>;
    actionType: AuditActionType;
    summary: string;
    timestamp: bigint;
    actorAccountId: Principal;
}
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
export type Result_4 = {
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
export type AccountId = Principal;
export interface Cell {
    value: Value;
    name: string;
}
export interface StewardRecord {
    assignedAt: bigint;
    assignedBy: Principal;
    stewardAccountId: Principal;
    successorPriority?: bigint;
    roleStatus: StewardRoleStatus;
}
export type Result_7 = {
    __kind__: "ok";
    ok: RelationshipRequest;
} | {
    __kind__: "err";
    err: RelationshipError;
};
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
    err: RemoveError;
};
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
export interface ProfileClaim {
    id: bigint;
    submittedDate: bigint;
    status: ProfileClaimStatus;
    reviewedDate?: bigint;
    reviewedBy?: Principal;
    personId: PersonId;
    requestingUserId: Principal;
}
export interface SuccessorDesignation {
    status: SuccessorStatus;
    assignedAt: bigint;
    assignedBy: Principal;
    personId: PersonId;
    priority: bigint;
}
export type Result_9 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: DeleteError;
};
export type Result_12 = {
    __kind__: "ok";
    ok: AuthMethods;
} | {
    __kind__: "err";
    err: AccountError;
};
export interface OralHistorySpeaker {
    name: string;
    personId?: string;
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
    err: MergeError;
};
export type NotificationId = bigint;
export type Result_8 = {
    __kind__: "ok";
    ok: StewardRecord;
} | {
    __kind__: "err";
    err: StewardError;
};
export interface Notification {
    id: bigint;
    notificationType: NotificationType;
    createdAt: bigint;
    read: boolean;
    recipient: Principal;
    message: string;
}
export type MysteryId = bigint;
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
export type Result_17 = {
    __kind__: "ok";
    ok: Account;
} | {
    __kind__: "err";
    err: AccountError;
};
export type Result_13 = {
    __kind__: "ok";
    ok: AccountId;
} | {
    __kind__: "err";
    err: AccountError;
};
export interface StewardIdentity {
    accountId: Principal;
    displayName: string;
    personId: PersonId;
    canonicalName: string;
}
export type PersonId = string;
export interface AuthMethods {
    apple: boolean;
    google: boolean;
}
export type Result_16 = {
    __kind__: "ok";
    ok: Relationship;
} | {
    __kind__: "err";
    err: RelationshipAdminError;
};
export type Result_1 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: ArchiveError;
};
export type Result_11 = {
    __kind__: "ok";
    ok: MergeResult;
} | {
    __kind__: "err";
    err: MergeError;
};
export interface Resolution {
    supportingEvidence: Array<string>;
    summary: string;
    resolvedAt: bigint;
    resolvedBy: Principal;
}
export interface PersonMatch {
    name: string;
    personId: PersonId;
    parents: Array<string>;
}
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
export type ArchiveItemId = bigint;
export type Result_14 = {
    __kind__: "ok";
    ok: SuccessorDesignation;
} | {
    __kind__: "err";
    err: StewardError;
};
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
export interface Account {
    id: AccountId;
    createdAt: bigint;
    authMethods: Array<AuthMethod>;
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
export interface DuplicatePair {
    candidateA: DuplicateCandidate;
    candidateB: DuplicateCandidate;
}
export type StoryId = bigint;
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
export type Result_18 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: Error_;
};
export type Result_3 = {
    __kind__: "ok";
    ok: ProfileClaim;
} | {
    __kind__: "err";
    err: ClaimError;
};
export type Result_15 = {
    __kind__: "ok";
    ok: PersonProfile;
} | {
    __kind__: "err";
    err: CreateError;
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
    SuccessorActivated = "SuccessorActivated",
    StewardRemoved = "StewardRemoved",
    RelationshipRequestApproved = "RelationshipRequestApproved",
    DuplicateMerged = "DuplicateMerged",
    ProfilePermanentlyDeleted = "ProfilePermanentlyDeleted",
    RelationshipRequestRejected = "RelationshipRequestRejected",
    ProfileArchived = "ProfileArchived",
    ProfileRestored = "ProfileRestored",
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
export enum EvidenceStatus {
    Unresolved = "Unresolved",
    Documented = "Documented",
    FamilyHistory = "FamilyHistory",
    PersonalMemory = "PersonalMemory"
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
    RelationshipReviewed = "RelationshipReviewed",
    ProfileClaimReviewed = "ProfileClaimReviewed",
    ProfileClaimRequested = "ProfileClaimRequested"
}
export enum PrivacyLevel {
    Private = "Private",
    Public = "Public",
    FamilyOnly = "FamilyOnly"
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
export enum SourceStatus {
    Copy = "Copy",
    Unverified = "Unverified",
    Transcribed = "Transcribed",
    Original = "Original"
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
    activateSuccessor(personId: PersonId): Promise<Result_8>;
    addCanonicalStory(title: string, storyText: string, relatedMemberIds: Array<string>, era: string | null, year: bigint | null, location: string | null, evidenceStatus: EvidenceStatus, relatedArchiveItemIds: Array<bigint>): Promise<Story>;
    addPhoto(personId: PersonId, filename: string, mimeType: string, blob: ExternalBlob): Promise<Photo>;
    addRelationship(fromPersonId: PersonId, toPersonId: PersonId, relationshipType: RelationshipType): Promise<Result_16>;
    approveArchiveItem(id: ArchiveItemId): Promise<ArchiveItem | null>;
    approveProfileClaim(claimId: bigint): Promise<ProfileClaim | null>;
    approveProfileRemoval(requestId: bigint): Promise<ProfileRemovalRequest | null>;
    approveRelationshipRequest(requestId: bigint): Promise<RelationshipRequest | null>;
    approveStory(id: StoryId): Promise<Story | null>;
    archiveProfile(personId: PersonId): Promise<Result_1>;
    assignCallerUserRole(user: Principal, role: UserRole): Promise<void>;
    bindAuthMethod(method: AuthMethod): Promise<Result_17>;
    correctRelationshipType(relationshipId: bigint, relationshipType: RelationshipType): Promise<Result_16>;
    createCanonicalMystery(title: string, description: string, relatedMemberIds: Array<string>, relatedBranchId: string | null, knownFacts: Array<string>, possibilities: Array<string>, relatedSourceIds: Array<bigint>, relatedArchiveItemIds: Array<bigint>, status: MysteryStatus): Promise<Mystery>;
    createMyself(name: string): Promise<Result_15>;
    designateSuccessor(personId: PersonId, priority: bigint): Promise<Result_14>;
    execute(qJson: string): Promise<Result__1>;
    getApiDoc(): Promise<string>;
    getCallerUserRole(): Promise<UserRole>;
    getMyAccountId(): Promise<Result_13>;
    getMyAuthMethods(): Promise<Result_12>;
    getMyProfile(): Promise<PersonProfile | null>;
    getMyProfileClaim(personId: PersonId): Promise<ProfileClaim | null>;
    /**
     * / Renders an audit action type variant as its tag text for OQL rows.
     */
    getMyRelationshipRequests(): Promise<Array<RelationshipRequest>>;
    getPersonProfile(personId: PersonId): Promise<PersonProfile | null>;
    getProfilePhoto(personId: PersonId): Promise<Photo | null>;
    getRelationshipRequest(id: bigint): Promise<RelationshipRequest | null>;
    getSingleStewardWarning(): Promise<string | null>;
    isCallerAdmin(): Promise<boolean>;
    listApprovedArchiveItems(): Promise<Array<ArchiveItem>>;
    listApprovedStories(): Promise<Array<Story>>;
    listArchivedProfileIds(): Promise<Array<PersonId>>;
    listArchivedProfiles(): Promise<Array<PersonProfile>>;
    listAuditHistory(): Promise<Array<AuditEntry>>;
    listConfirmedRelationships(): Promise<Array<Relationship>>;
    listDuplicateCandidates(): Promise<Array<DuplicatePair>>;
    listEligibleStewardCandidates(): Promise<Array<StewardIdentity>>;
    listMysteries(): Promise<Array<Mystery>>;
    listNotifications(): Promise<Array<Notification>>;
    listPendingArchiveItems(): Promise<Array<ArchiveItem>>;
    listPendingMysteryContributions(): Promise<Array<MysteryContribution>>;
    listPendingStories(): Promise<Array<Story>>;
    listPersonRelationships(personId: PersonId): Promise<Array<Relationship>>;
    listPhotos(personId: PersonId): Promise<Array<Photo>>;
    listProfileClaims(): Promise<Array<ProfileClaim>>;
    listProfileRemovalRequests(): Promise<Array<ProfileRemovalRequest>>;
    listRelationshipRequests(): Promise<Array<RelationshipRequest>>;
    listStewardIdentities(): Promise<Array<StewardIdentity>>;
    listStewards(): Promise<Array<StewardRecord>>;
    listSuccessors(): Promise<Array<SuccessorDesignation>>;
    listTimelineEvents(): Promise<Array<TimelineEvent>>;
    markMysteryResolved(id: MysteryId, summary: string, supportingEvidence: Array<string>): Promise<Mystery | null>;
    markNotificationRead(id: NotificationId): Promise<Notification | null>;
    mergeProfiles(canonicalPersonId: PersonId, mergedAwayPersonId: PersonId): Promise<Result_11>;
    notDuplicate(personIdA: PersonId, personIdB: PersonId): Promise<Result_10>;
    permanentlyDeleteProfile(personId: PersonId, confirmation: boolean): Promise<Result_9>;
    promoteToSteward(personId: PersonId): Promise<Result_8>;
    proposeRelationship(fromPersonId: PersonId, toPersonId: PersonId, relationshipType: RelationshipType): Promise<Result_7>;
    rejectArchiveItem(id: ArchiveItemId): Promise<ArchiveItem | null>;
    rejectProfileClaim(claimId: bigint): Promise<ProfileClaim | null>;
    rejectProfileRemoval(requestId: bigint): Promise<ProfileRemovalRequest | null>;
    rejectRelationshipRequest(requestId: bigint): Promise<RelationshipRequest | null>;
    rejectStory(id: StoryId): Promise<Story | null>;
    removeDuplicateProfile(personId: PersonId): Promise<Result_6>;
    removePhoto(personId: PersonId, photoId: PhotoId): Promise<boolean>;
    removeRelationship(relationshipId: bigint): Promise<Result_5>;
    removeSteward(stewardAccountId: Principal): Promise<Result_4>;
    requestProfileClaim(personId: PersonId): Promise<Result_3>;
    requestProfileRemoval(personId: PersonId, reason: string): Promise<Result_2>;
    resolveMergeConflict(conflictId: bigint, canonicalValue: string): Promise<MergeConflict | null>;
    restoreProfile(personId: PersonId): Promise<Result_1>;
    reviewMysteryContribution(id: MysteryContributionId, approve: boolean): Promise<MysteryContribution | null>;
    schema(): Promise<string>;
    searchPossibleMatches(name: string): Promise<Array<PersonMatch>>;
    setProfilePhoto(personId: PersonId, photoId: PhotoId): Promise<Photo | null>;
    setRelationshipRequestPending(requestId: bigint): Promise<RelationshipRequest | null>;
    submitArchiveItem(title: string, description: string, itemType: ArchiveItemType, blob: ExternalBlob, era: string, year: bigint | null, tags: Array<string>, relatedMemberIds: Array<string>, relatedBranchId: string | null, sourceStatus: SourceStatus, privacyLevel: PrivacyLevel, classification: ArchiveItemClassification, primarySpeaker: OralHistorySpeaker | null): Promise<ArchiveItem>;
    submitMysteryContribution(mysteryId: MysteryId, contributionType: MysteryContributionType, text: string): Promise<MysteryContribution>;
    submitStory(title: string, storyText: string, relatedMemberIds: Array<string>, era: string | null, year: bigint | null, location: string | null, evidenceStatus: EvidenceStatus, relatedArchiveItemIds: Array<bigint>): Promise<Story>;
    updateCanonicalMystery(id: MysteryId, title: string, description: string, relatedMemberIds: Array<string>, relatedBranchId: string | null, knownFacts: Array<string>, possibilities: Array<string>, relatedSourceIds: Array<bigint>, relatedArchiveItemIds: Array<bigint>, status: MysteryStatus): Promise<Mystery | null>;
    updateCanonicalStory(id: StoryId, title: string, storyText: string, relatedMemberIds: Array<string>, era: string | null, year: bigint | null, location: string | null, evidenceStatus: EvidenceStatus, relatedArchiveItemIds: Array<bigint>): Promise<Story | null>;
    updateOwnProfile(personId: PersonId, edits: ProfileEdits): Promise<Result>;
}
