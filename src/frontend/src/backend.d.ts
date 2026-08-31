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
export type PhotoId = bigint;
export type Result__1 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: Error_;
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
export type PersonId = string;
export type ArchiveItemId = bigint;
export interface Result {
    hasMore: boolean;
    rows: Array<Array<Cell>>;
}
export interface Cell {
    value: Value;
    name: string;
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
export interface Photo {
    id: PhotoId;
    blob: ExternalBlob;
    mimeType: string;
    filename: string;
    uploadedAt: bigint;
    uploadedBy: Principal;
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
export enum PrivacyLevel {
    Private = "Private",
    Public = "Public",
    FamilyOnly = "FamilyOnly"
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
    assignCallerUserRole(user: Principal, role: UserRole): Promise<void>;
    execute(qJson: string): Promise<Result>;
    getApiDoc(): Promise<string>;
    getCallerUserRole(): Promise<UserRole>;
    getProfilePhoto(personId: PersonId): Promise<Photo | null>;
    isCallerAdmin(): Promise<boolean>;
    listApprovedArchiveItems(): Promise<Array<ArchiveItem>>;
    listPendingArchiveItems(): Promise<Array<ArchiveItem>>;
    listPhotos(personId: PersonId): Promise<Array<Photo>>;
    rejectArchiveItem(id: ArchiveItemId): Promise<ArchiveItem | null>;
    removePhoto(personId: PersonId, photoId: PhotoId): Promise<boolean>;
    schema(): Promise<string>;
    setProfilePhoto(personId: PersonId, photoId: PhotoId): Promise<Photo | null>;
    submitArchiveItem(title: string, description: string, itemType: ArchiveItemType, blob: ExternalBlob, era: string, year: bigint | null, tags: Array<string>, relatedMemberIds: Array<string>, relatedBranchId: string | null, sourceStatus: SourceStatus, privacyLevel: PrivacyLevel): Promise<ArchiveItem>;
}
