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
    claimedByUserId?: Principal;
    birthInfo?: string;
    claimStatus: ClaimStatus;
    livingStatus: LivingStatus;
    name: string;
    personId: PersonId;
    story?: string;
    preferredName?: string;
    timeline?: Array<string>;
}
export type Result_2 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: RemoveError;
};
export interface ProfileEdits {
    occupation?: string;
    privacySettings?: string;
    birthInfo?: string;
    story?: string;
    preferredName?: string;
    timeline?: Array<string>;
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
export type PersonId = string;
export type Result_5 = {
    __kind__: "ok";
    ok: AccountId;
} | {
    __kind__: "err";
    err: AccountError;
};
export type Result_1 = {
    __kind__: "ok";
    ok: ProfileClaim;
} | {
    __kind__: "err";
    err: ClaimError;
};
export interface PersonMatch {
    name: string;
    personId: PersonId;
    parents: Array<string>;
}
export type Result_4 = {
    __kind__: "ok";
    ok: AuthMethods;
} | {
    __kind__: "err";
    err: AccountError;
};
export interface AuthMethods {
    apple: boolean;
    google: boolean;
}
export interface Cell {
    value: Value;
    name: string;
}
export type ArchiveItemId = bigint;
export type Result_7 = {
    __kind__: "ok";
    ok: Account;
} | {
    __kind__: "err";
    err: AccountError;
};
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
    itemType: ArchiveItemType;
    relatedBranchId?: string;
    sourceStatus: SourceStatus;
    contributor: Principal;
}
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
export type AccountId = Principal;
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
    ok: PersonProfile;
} | {
    __kind__: "err";
    err: CreateError;
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
export interface Account {
    id: AccountId;
    createdAt: bigint;
    authMethods: Array<AuthMethod>;
}
export type Result = {
    __kind__: "ok";
    ok: PersonProfile;
} | {
    __kind__: "err";
    err: EditError;
};
export type Result_3 = {
    __kind__: "ok";
    ok: RelationshipRequest;
} | {
    __kind__: "err";
    err: RelationshipError;
};
export type NotificationId = bigint;
export type Result_8 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: Error_;
};
export interface Notification {
    id: bigint;
    notificationType: NotificationType;
    createdAt: bigint;
    read: boolean;
    recipient: Principal;
    message: string;
}
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
export enum EditError {
    ProfileNotFound = "ProfileNotFound",
    NotSignedIn = "NotSignedIn",
    NotOwner = "NotOwner",
    DeceasedProfile = "DeceasedProfile"
}
export enum LivingStatus {
    Living = "Living",
    Deceased = "Deceased"
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
export enum UserRole {
    admin = "admin",
    user = "user",
    guest = "guest"
}
export interface backendInterface {
    addPhoto(personId: PersonId, filename: string, mimeType: string, blob: ExternalBlob): Promise<Photo>;
    approveArchiveItem(id: ArchiveItemId): Promise<ArchiveItem | null>;
    approveProfileClaim(claimId: bigint): Promise<ProfileClaim | null>;
    approveRelationshipRequest(requestId: bigint): Promise<RelationshipRequest | null>;
    assignCallerUserRole(user: Principal, role: UserRole): Promise<void>;
    bindAuthMethod(method: AuthMethod): Promise<Result_7>;
    createMyself(name: string): Promise<Result_6>;
    execute(qJson: string): Promise<Result__1>;
    getApiDoc(): Promise<string>;
    getCallerUserRole(): Promise<UserRole>;
    getMyAccountId(): Promise<Result_5>;
    getMyAuthMethods(): Promise<Result_4>;
    getMyProfile(): Promise<PersonProfile | null>;
    getMyProfileClaim(personId: PersonId): Promise<ProfileClaim | null>;
    getMyRelationshipRequests(): Promise<Array<RelationshipRequest>>;
    getPersonProfile(personId: PersonId): Promise<PersonProfile | null>;
    getProfilePhoto(personId: PersonId): Promise<Photo | null>;
    getRelationshipRequest(id: bigint): Promise<RelationshipRequest | null>;
    isCallerAdmin(): Promise<boolean>;
    listApprovedArchiveItems(): Promise<Array<ArchiveItem>>;
    listConfirmedRelationships(): Promise<Array<Relationship>>;
    listNotifications(): Promise<Array<Notification>>;
    listPendingArchiveItems(): Promise<Array<ArchiveItem>>;
    listPhotos(personId: PersonId): Promise<Array<Photo>>;
    listProfileClaims(): Promise<Array<ProfileClaim>>;
    listRelationshipRequests(): Promise<Array<RelationshipRequest>>;
    markNotificationRead(id: NotificationId): Promise<Notification | null>;
    proposeRelationship(fromPersonId: PersonId, toPersonId: PersonId, relationshipType: RelationshipType): Promise<Result_3>;
    rejectArchiveItem(id: ArchiveItemId): Promise<ArchiveItem | null>;
    rejectProfileClaim(claimId: bigint): Promise<ProfileClaim | null>;
    rejectRelationshipRequest(requestId: bigint): Promise<RelationshipRequest | null>;
    removeDuplicateProfile(personId: PersonId): Promise<Result_2>;
    removePhoto(personId: PersonId, photoId: PhotoId): Promise<boolean>;
    requestProfileClaim(personId: PersonId): Promise<Result_1>;
    schema(): Promise<string>;
    searchPossibleMatches(name: string): Promise<Array<PersonMatch>>;
    setProfilePhoto(personId: PersonId, photoId: PhotoId): Promise<Photo | null>;
    setRelationshipRequestPending(requestId: bigint): Promise<RelationshipRequest | null>;
    submitArchiveItem(title: string, description: string, itemType: ArchiveItemType, blob: ExternalBlob, era: string, year: bigint | null, tags: Array<string>, relatedMemberIds: Array<string>, relatedBranchId: string | null, sourceStatus: SourceStatus, privacyLevel: PrivacyLevel): Promise<ArchiveItem>;
    updateOwnProfile(personId: PersonId, edits: ProfileEdits): Promise<Result>;
}
