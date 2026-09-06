mixin () {
  public query func getApiDoc() : async Text {
    "# Norwood Family — Backend API

## Purpose

The backend stores uploaded photos for family members and contributed archive
items. Each person (identified by a `PersonId`, e.g. `\"julia\"`,
`\"clayton\"`) has a gallery of uploaded photos, one of which may be selected as
that person's profile photo. The Family Archive stores contributed items
(photos, documents, audio, video, written stories/notes, research, work or
business material, and other) that wait for admin approval before appearing in
the archive. The file bytes themselves live off-chain in the platform's
immutable object storage; the canister stores only an external reference plus
display metadata.

The backend also supports family profile ownership and relationship
verification. A person profile carries living/deceased and claimed/unclaimed
status; a living unclaimed profile can be claimed by a signed-in user via a
pending profile claim that a Family Steward approves or rejects. A user who
does not already exist can create a minimal profile and propose a relationship
to an existing family member; proposed relationships start pending and are
never treated as confirmed until a Family Steward approves them, at which point
they are recorded in the shared family graph. An approved owner of a living
profile can edit their own personal-profile fields. In-app notification records
track claim and relationship activity. The backend also exposes the persisted
metadata through the Object Query Layer (OQL) and provides the standard
access-control and Internet Identity sign-in surface.

The backend also maintains a stable internal account identity separate from the
person profile. Each signed-in account is identified by its ICP Principal; Google
and Apple are authentication methods bound to that account, never the family
member's identity inside the family graph. This keeps the same person profile
intact if the account's email or authentication provider changes later.

## Public methods

### Photo gallery

- `listPhotos(personId : Text) : async [Photo]` — query. Returns all uploaded
  photos for a person, in upload order. Returns `[]` when the person has no
  gallery.
- `getProfilePhoto(personId : Text) : async ?Photo` — query. Returns the
  person's current profile photo, or `null` when none is set (the frontend then
  shows the initials placeholder).
- `addPhoto(personId : Text, filename : Text, mimeType : Text, blob : Blob) : async Photo` —
  update. Uploads a new photo to a person's gallery and returns the stored
  photo. The signed-in caller is recorded as `uploadedBy`. Photo ids are
  assigned per person as `max-existing-id + 1` (or `0` when the gallery is
  empty). The `blob` is the external storage reference (a `Blob`). When the
  person's gallery has no profile photo yet, the newly added photo is
  automatically set as the profile photo, so the completeness indicator updates
  immediately.
- `setProfilePhoto(personId : Text, photoId : Nat) : async ?Photo` — update.
  Marks the photo with `photoId` as the person's profile photo. Returns the
  newly selected photo, or `null` when no photo with that id exists in the
  person's gallery.
- `removePhoto(personId : Text, photoId : Nat) : async Bool` — update. Removes
  a photo from the person's gallery and returns `true` when a photo was
  removed. If the removed photo was the profile photo, the profile photo is
  cleared (the frontend falls back to the initials placeholder).

### Family Archive

- `submitArchiveItem(title : Text, description : Text, itemType : ArchiveItemType, blob : Blob, era : Text, year : ?Nat, tags : [Text], relatedMemberIds : [Text], relatedBranchId : ?Text, sourceStatus : SourceStatus, privacyLevel : PrivacyLevel) : async ArchiveItem` —
  update. Submits a new archive item. Requires a signed-in (non-anonymous)
  caller; the caller is recorded as the `contributor`. The item is stored in
  `#Pending` state, assigned a fresh id, and `createdAt` is set to the current
  time. It does not appear in the archive until an admin approves it. The
  `blob` is the external storage reference (a `Blob`); the original file bytes
  live off-chain and are preserved as-is.
- `listPendingArchiveItems() : async [ArchiveItem]` — query. Admin only. Returns
  all archive items currently in `#Pending` state.
- `approveArchiveItem(id : Nat) : async ?ArchiveItem` — update. Admin only.
  Moves a pending item to `#Approved` state and returns the updated item, or
  `null` when no pending item with that id exists.
- `rejectArchiveItem(id : Nat) : async ?ArchiveItem` — update. Admin only. Moves
  a pending item to `#Rejected` state and returns the updated item, or `null`
  when no pending item with that id exists.
- `listApprovedArchiveItems() : async [ArchiveItem]` — query. Returns all
  archive items in `#Approved` state (the items visible in the archive).

### Profile ownership and relationship verification

- `getPersonProfile(personId : Text) : async ?PersonProfile` — query. Returns
  the ownership/lifecycle state of a person profile (living/deceased status,
  claimed/unclaimed status, the claiming user when claimed, and the
  owner-editable fields), or `null` when the person is not tracked by the
  backend.
- `requestProfileClaim(personId : Text) : async Result<ProfileClaim, ClaimError>` —
  update. \"This is Me\": creates a pending profile claim for an unclaimed
  living profile without granting ownership. Requires a signed-in caller;
  returns `#err(#NotSignedIn)` for an anonymous caller, `#err(#ProfileNotFound)`
  when the person is not tracked, `#err(#DeceasedProfile)` for a deceased
  profile (deceased profiles can never be claimed), `#err(#AlreadyClaimed)` when
  the profile is already claimed, and `#err(#AlreadyPending)` when a pending
  claim already exists for that person. Duplicate-claim prevention is per
  account + personId: a second `requestProfileClaim` for the same person by the
  same signed-in caller (or by any caller, since only one pending claim may
  exist per person) is rejected with `#err(#AlreadyPending)` rather than
  creating a second claim. On success it records a `#ProfileClaimRequested`
  notification to the caller.
- `listProfileClaims() : async [ProfileClaim]` — query. Family Steward only.
  Lists all profile claim requests for the review area.
- `getMyProfileClaim(personId : Text) : async ?ProfileClaim` — query. Returns
  the current signed-in caller's own claim on the given profile, or `null` when
  the caller has no claim on that profile. Not gated to admin — any signed-in
  caller may query their own claim. This lets the frontend detect whether the
  current user already has a pending claim on a profile without needing Family
  Steward privileges.
- `getMyProfile() : async ?PersonProfile` — query. Returns the signed-in
  caller's own linked/claimed Person Profile, or, when none is linked, the
  caller's pending profile. Resolution order is strict: (1) the profile whose
  `claimedByUserId` equals the caller (an approved claim or a `createMyself`
  profile); (2) a profile created via `createMyself` keyed by the caller's
  principal; (3) a profile with a pending claim by the caller. Returns `null`
  when the caller has no profile. Not gated to admin — any signed-in caller may
  query their own profile. This lets the navbar show the linked or pending
  profile's display name without needing Family Steward privileges. Because a
  pending claim is re-pointed to the canonical `lorenzoSmithJr` personId (see
  the canonical-record note below), a caller with a pending claim on Lorenzo
  Smith Jr. resolves here to that same canonical profile, not to a detached
  test record.
- `getMyRelationshipRequests() : async [RelationshipRequest]` — query. Returns
  the signed-in caller's own pending relationship requests — those involving a
  profile the caller owns or created. Not gated to admin — any signed-in caller
  may query their own pending relationship state. This lets the frontend detect
  \"Family connection pending confirmation\" for the caller's own pending
  profile without needing Family Steward privileges.
- `approveProfileClaim(claimId : Nat) : async ?ProfileClaim` — update. Family
  Steward only. Approves a pending claim, marking the profile claimed and
  associating it with the requesting user. Returns the updated claim, or `null`
  when no pending claim with that id exists. Records a `#ProfileClaimReviewed`
  notification to the claimant.
- `rejectProfileClaim(claimId : Nat) : async ?ProfileClaim` — update. Family
  Steward only. Rejects a pending claim. Returns the updated claim, or `null`
  when no pending claim with that id exists. Records a `#ProfileClaimReviewed`
  notification to the claimant.
- `searchPossibleMatches(name : Text) : async [PersonMatch]` — query. Searches
  the authoritative shared profile data (which includes every seeded family
  member) for possible duplicate matches by name, returning name plus parents
  when known. Names are normalized before matching: case-insensitive,
  punctuation ignored, periods normalized, extra spaces collapsed, and common
  suffix variants recognized (`Jr`/`Jr.`, `Sr`/`Sr.`, `II`/`III`/`IV`), with
  reasonable partial/fuzzy matching (exact, substring containment, or full token
  overlap). For example, searching `\"Lorenzo Smith Jr\"` matches the existing
  `\"Lorenzo Smith Jr.\"` profile. The frontend merges these with its own
  authoritative family graph search.
- `createMyself(name : Text) : async Result<PersonProfile, CreateError>` —
  update. \"Add Myself to This Family\": creates a minimal living person profile
  owned by the signed-in caller. Requires a signed-in caller; returns
  `#err(#NotSignedIn)` for an anonymous caller. The new profile is created
  claimed by the caller; the user must then connect to an existing family member
  via a relationship request.
- `proposeRelationship(fromPersonId : Text, toPersonId : Text, relationshipType : RelationshipType) : async Result<RelationshipRequest, RelationshipError>` —
  update. Proposes a new relationship between two people. The request starts
  `#Pending` and is never treated as confirmed until a Family Steward approves
  it. Requires a signed-in caller; returns `#err(#NotSignedIn)` for an anonymous
  caller, `#err(#PersonNotFound)` when either person is not tracked, and
  `#err(#DuplicateRequest)` when a pending request already exists between the
  same two people. Records a `#RelationshipRequested` notification to the
  caller.
- `listRelationshipRequests() : async [RelationshipRequest]` — query. Family
  Steward only. Lists all relationship requests for the review area.
- `approveRelationshipRequest(requestId : Nat) : async ?RelationshipRequest` —
  update. Family Steward only. Approves a pending relationship request, adding
  the relationship as `#Confirmed` to the shared family graph. Returns the
  updated request, or `null` when no pending request with that id exists.
  Records a `#RelationshipReviewed` notification to the requesting person's
  owner.
- `rejectRelationshipRequest(requestId : Nat) : async ?RelationshipRequest` —
  update. Family Steward only. Rejects a pending relationship request. Returns
  the updated request, or `null` when no pending request with that id exists.
  Records a `#RelationshipReviewed` notification to the requesting person's
  owner.
- `setRelationshipRequestPending(requestId : Nat) : async ?RelationshipRequest` —
  update. Family Steward only. Returns a relationship request to `#Pending`
  state. Returns the updated request, or `null` when no request with that id
  exists.
- `updateOwnProfile(personId : Text, edits : ProfileEdits) : async Result<PersonProfile, EditError>` —
  update. Updates an approved owner's own living profile fields: identity
  (preferred/display name, first, middle, last, suffix, nickname), basic
  information (birth date/year, birthplace, current location, occupation,
  living/deceased status), about (short bio, longer story), timeline, and
  privacy settings. Each `ProfileEdits` field that is `null` leaves the current
  value unchanged. It updates the existing canonical Person record in place —
  it never creates a new person, and it preserves `personId`, claim ownership
  (`claimStatus`/`claimedByUserId`), confirmed relationships, archive links,
  notifications, and verification history. It never rewrites family
  relationships directly; any relationship addition or change must go through
  `proposeRelationship`. A profile already `#Deceased` remains non-editable
  (returns `#err(#DeceasedProfile)`); a living profile may be marked
  `#Deceased` via `edits.livingStatus`, after which it can no longer be edited.
  Requires a signed-in caller; returns `#err(#NotSignedIn)` for an anonymous
  caller, `#err(#ProfileNotFound)` when the person is not tracked,
  `#err(#NotOwner)` when the caller is not the profile's owner, and
  `#err(#DeceasedProfile)` for a deceased profile.
- `listNotifications() : async [Notification]` — query. Returns the in-app
  notification records addressed to the signed-in caller.
- `removeDuplicateProfile(personId : Text) : async Result<(), RemoveError>` —
  update. Family Steward only. Removes a duplicate test-created profile and any
  pending relationship request or pending claim tied only to it, preserving the
  original profile, the confirmed family graph, and the signed-in account.
  Returns `#err(#NotSignedIn)` for an anonymous caller and
  `#err(#ProfileNotFound)` when the person is not tracked. It never removes the
  signed-in account itself and never alters confirmed relationships.

### Account identity

- `getMyAccountId() : async Result<AccountId, AccountError>` — query. Returns the
  signed-in caller's stable internal account id (their ICP Principal). Anonymous
  callers receive `#err(#NotSignedIn)`.
- `getMyAuthMethods() : async Result<AuthMethods, AccountError>` — query. Returns
  the authentication methods (`google`, `apple` booleans) currently bound to the
  signed-in caller's account. Anonymous callers receive `#err(#NotSignedIn)`;
  a signed-in caller with no account yet receives `#err(#AccountNotFound)`.
- `bindAuthMethod(method : AuthMethod) : async Result<Account, AccountError>` —
  update. Binds an authentication method (`#Google` or `#Apple`) to the signed-in
  caller's account, creating the account if it does not yet exist. The account id
  is the caller's stable principal, so the same person profile stays intact if
  the provider changes. Anonymous callers receive `#err(#NotSignedIn)`.

### Object Query Layer (OQL)

- `schema() : async Text` — query. Returns a JSON catalogue of the exposed
  entities and their fields.
- `execute(qJson : Text) : async Result` — query. Runs a JSON-encoded OQL query
  and returns matching rows.

The exposed entities are `photo`, `archiveItem`, `profile`, `claim`,
`relationshipRequest`, `confirmedRelationship`, `notification`, and `account`,
all declared `.controllerOnly()` (see the authorization section). `photo` rows are flattened
photo metadata: `key` (globally-unique \"<personId>:<id>\", the primary key),
`personId`, `id`, `filename`, `mimeType`, `uploadedAt` (nanoseconds since epoch,
`Int`), `uploadedBy` (the uploading principal, rendered as text), and
`isProfilePhoto` (`Bool`). `archiveItem` rows are flattened archive metadata:
`id` (the primary key), `title`, `itemType`, `era`, `year` (optional year, `0`
when absent), `contributor` (the submitting principal, rendered as text),
`sourceStatus`, `privacyLevel`, `status`, and `createdAt` (nanoseconds since
epoch, `Int`). The raw blob bytes are not exposed.

The ownership entities are flattened views of the corresponding records.
`profile` rows (primary key `personId`) carry `name`, `livingStatus`
(`\"Living\"`/`\"Deceased\"`), `claimStatus` (`\"Unclaimed\"`/`\"Claimed\"`),
`claimedByUserId` (the claiming principal rendered as text, `\"\"` when
unclaimed), and the owner-editable fields `preferredName`, `firstName`,
`middleName`, `lastName`, `suffix`, `nickname`, `story`, `shortBio`,
`longerStory`, `occupation`, `birthInfo`, `birthDate`, `birthplace`,
`currentLocation`, and `privacySettings` (each `\"\"` when absent). The
array-valued `timeline` is not exposed (OQL has no array value type). `claim` rows (primary key `id`) carry
`personId`, `requestingUserId` (principal text), `status`
(`\"Pending\"`/`\"Approved\"`/`\"Rejected\"`), `submittedDate` (nanoseconds since
epoch, `Int`), `reviewedBy` (principal text, `\"\"` when unreviewed), and
`reviewedDate` (`Int`, `0` when unreviewed). `relationshipRequest` rows
(primary key `id`) carry `requestingPersonId`, `relatedPersonId`,
`proposedRelationship` (`\"Parent\"`/`\"Child\"`/`\"SpousePartner\"`/`\"Sibling\"`),
`status` (`\"Pending\"`/`\"Approved\"`/`\"Rejected\"`), `submittedDate`,
`reviewer` (principal text, `\"\"` when unreviewed), and `reviewedDate` (`Int`,
`0` when unreviewed). `confirmedRelationship` rows (primary key `id`) carry
`fromPersonId`, `toPersonId`, `relationshipType`
(`\"Parent\"`/`\"Child\"`/`\"SpousePartner\"`/`\"Sibling\"`), and `status`
(`\"Confirmed\"`/`\"Pending\"`/`\"Disputed\"`). `notification` rows (primary key
`id`) carry `recipient` (principal text), `notificationType`
(`\"ProfileClaimRequested\"`/`\"ProfileClaimReviewed\"`/`\"RelationshipRequested\"`/`\"RelationshipReviewed\"`),
`message`, `createdAt` (nanoseconds since epoch, `Int`), and `read` (`Bool`).
`account` rows (primary key `id`, the account's stable principal rendered as
text) carry `google` and `apple` (`Bool`, whether that authentication method is
bound to the account) and `createdAt` (nanoseconds since epoch, `Int`).

### Access control and Internet Identity

- `_initialize_access_control() : async ()` — update. Registers the signed-in
  caller. The first caller to register becomes `#admin`; every later caller
  becomes `#user`. Anonymous callers are ignored.
- `getCallerUserRole() : async UserRole` — query. Returns the caller's role:
  `#guest` for anonymous callers, otherwise the registered role. A signed-in
  but unregistered caller traps with `\"User is not registered\"`.
- `isCallerAdmin() : async Bool` — query. Returns `true` when the caller's role
  is `#admin`. Traps for a signed-in but unregistered caller.
- `assignCallerUserRole(user : Principal, role : UserRole) : async ()` — update.
  Assigns a role to a user. Only an `#admin` caller may do this; otherwise it
  traps with `\"Unauthorized: Only admins can assign user roles\"`.
- `_internet_identity_sign_in_start() : async Blob` and
  `_internet_identity_sign_in_finish() : async Result` — update. Internet
  Identity sign-in flow; finishing also registers the caller via the same
  first-admin rule as `_initialize_access_control`.

### Object storage infrastructure

The backend includes the platform's immutable object-storage mixin, which
exposes the internal maintenance methods
(`_immutableObjectStorageRefillCashier`,
`_immutableObjectStorageUpdateGatewayPrincipals`,
`_immutableObjectStorageBlobsAreLive`,
`_immutableObjectStorageBlobsToDelete`,
`_immutableObjectStorageConfirmBlobDeletion`,
`_immutableObjectStorageCreateCertificate`). These are platform plumbing and
are not intended for application use.

## Authentication and authorization

The photo mutation methods (`addPhoto`, `setProfilePhoto`, `removePhoto`) record
the signed-in caller as the uploader but do not themselves gate on a role; they
are callable by any caller. The photo query methods (`listPhotos`,
`getProfilePhoto`) are readable by any caller. The access-control methods above
enforce the admin/user/guest model described in their entries.

The OQL methods (`schema`, `execute`) enforce authorization per entity against
the live caller. All exposed entities — `photo`, `archiveItem`, `profile`,
`claim`, `relationshipRequest`, `confirmedRelationship`, `notification`, and
`account` — are declared `.controllerOnly()`, so only the platform controller can read their
rows through `schema()`/`execute()`; end users do not read them directly. This
keeps the family and archive metadata private to the platform while still
letting the Data Intelligence agent answer over it.

The archive methods gate on sign-in and role. `submitArchiveItem` requires a
signed-in (non-anonymous) caller and traps with `\"Sign-in required to submit an
archive item\"` for an anonymous caller. `listPendingArchiveItems`,
`approveArchiveItem`, and `rejectArchiveItem` are admin-only and trap with
`\"Unauthorized: Only admins can ...\"` when the caller is not an admin.
`listApprovedArchiveItems` is readable by any caller.

The profile-claim and relationship-request methods gate on sign-in and role.
`requestProfileClaim`, `createMyself`, `proposeRelationship`, and
`updateOwnProfile` require a signed-in (non-anonymous) caller and return
`#err(#NotSignedIn)` for an anonymous caller (they do not trap). The Family
Steward review methods — `listProfileClaims`, `approveProfileClaim`,
`rejectProfileClaim`, `listRelationshipRequests`,
`approveRelationshipRequest`, `rejectRelationshipRequest`,
`setRelationshipRequestPending`, and `removeDuplicateProfile` — are admin-only
and trap with `\"Unauthorized: Only Family Stewards can ...\"` when the caller
is not an admin. `getPersonProfile`, `searchPossibleMatches`,
`getMyProfileClaim`, `getMyProfile`, `getMyRelationshipRequests`, and
`listNotifications` are readable by any caller (`getMyProfileClaim` returns only
the caller's own claim on the requested profile, `getMyProfile` returns only the
caller's own linked or pending profile, `getMyRelationshipRequests` returns only
the caller's own pending relationship requests, and `listNotifications` returns
only the caller's own records).

Registration gates role-guarded access. A direct API caller must call
`_initialize_access_control()` once as a signed-in caller before any
role-guarded call (guarded queries included); the first initializer receives
`#admin` and subsequent callers receive `#user`. An anonymous caller receives
`#guest` from `getCallerUserRole`; a signed-in but unregistered caller traps
with `\"User is not registered\"` on `getCallerUserRole` and `isCallerAdmin`.
A caller can be unregistered while the app already knows it because
registration happens only when a caller signs in through the app's own
frontend — a principal that never did so is unregistered even when it belongs
to the app's owner, and a signed-in caller derived against a different origin
is a different principal than the one the frontend registered.

The app's frontend pins an Internet Identity derivation origin, published at
`/.well-known/ii-derivation-origin` when available. An agent already holding the
user's Internet Identity authorization derives the correct per-app principal
against that origin (for example `icp identity link web <name> --app <host>`).
Such a delegation acts with the user's full authority in this app until it
expires.

Account identity is separate from the person profile. The signed-in caller's ICP
Principal is the stable internal account id (`AccountId`); Google and Apple are
authentication methods (`AuthMethod`) bound to that account, never the family
member's identity inside the family graph. `getMyAccountId` returns the caller's
principal, `getMyAuthMethods` reports which providers are bound, and
`bindAuthMethod` binds a provider to the caller's account (creating it on first
use). Because the account id is the principal rather than an email or provider
identifier, the same person profile stays intact if the account's email or
authentication provider changes later. Profile claims and relationship requests
already reference the caller's stable principal (`requestingUserId`,
`claimedByUserId`), not an email address.

## Units and encodings

- `PersonId` is a `Text` identifier of a person in the family tree (e.g.
  `\"julia\"`, `\"clayton\"`). The canonical Lorenzo Smith Jr. record is
  `\"lorenzoSmithJr\"` — the single authoritative Person record for Lorenzo
  Smith Jr., seeded as the child of Lorenzo Smith Sr. and used consistently by
  the child relationship, Explore Family, Family Tree, Add Myself duplicate
  matching, This is Me claim requests, My Profile, profile routing, and
  notifications. Any runtime-created duplicate Lorenzo Smith Jr. profile is
  migrated away: pending claims and relationship requests referencing a
  duplicate are re-pointed to `\"lorenzoSmithJr\"` (preserving the pending claim
  and its `requestingUserId`), and the duplicate profile is removed, so exactly
  one Lorenzo Smith Jr. Person record remains.
- `PhotoId` is a `Nat`, unique only within a person's gallery.
- `uploadedAt` is an `Int` count of nanoseconds since the Unix epoch
  (`Time.now()`).
- `uploadedBy` is a `Principal` (the uploading caller).
- `blob` is the external storage reference (`Blob`); the actual image bytes
  live off-chain.
- `UserRole` is a variant: `#admin`, `#user`, or `#guest`.
- `ArchiveItemId` is a `Nat`, unique across the whole archive.
- `ArchiveItemType` is a variant: `#Photo`, `#Document`, `#Audio`, `#Video`,
  `#WrittenStoryNote`, `#Research`, `#WorkBusiness`, or `#Other`.
- `SourceStatus` is a variant: `#Original`, `#Copy`, `#Transcribed`, or
  `#Unverified`.
- `PrivacyLevel` is a variant: `#Public`, `#FamilyOnly`, or `#Private`.
- `ArchiveItemStatus` is a variant: `#Pending`, `#Approved`, or `#Rejected`.
- `era` is free text (e.g. `\"early 1900s\"`); `year` is an optional `Nat`.
- `tags` is a list of `Text`; `relatedMemberIds` is a list of member ids (one
  item can link to many members without duplicating the file);
  `relatedBranchId` is an optional branch id.
- `createdAt` is an `Int` count of nanoseconds since the Unix epoch
  (`Time.now()`).
- `LivingStatus` is a variant: `#Living` or `#Deceased`.
- `ClaimStatus` is a variant: `#Unclaimed` or `#Claimed`.
- `ProfileClaimStatus` is a variant: `#Pending`, `#Approved`, or `#Rejected`.
- `RelationshipType` is a variant: `#Parent`, `#Child`, `#SpousePartner`, or
  `#Sibling`.
- `RelationshipStatus` is a variant: `#Confirmed`, `#Pending`, or `#Disputed`.
- `RelationshipRequestStatus` is a variant: `#Pending`, `#Approved`, or
  `#Rejected`.
- `NotificationType` is a variant: `#ProfileClaimRequested`,
  `#ProfileClaimReviewed`, `#RelationshipRequested`, or
  `#RelationshipReviewed`.
- `PersonProfile` fields: `personId` (`Text`), `name` (`Text`),
  `livingStatus`, `claimStatus`, `claimedByUserId` (`?Principal`, `null` when
  unclaimed), and the owner-editable optionals `preferredName`, `firstName`,
  `middleName`, `lastName`, `suffix`, `nickname`, `story`, `shortBio`,
  `longerStory`, `occupation`, `birthInfo`, `birthDate`, `birthplace`,
  `currentLocation`, `timeline` (`?[Text]`), and `privacySettings` (each `null`
  when unset).
- `ProfileClaim` fields: `id` (`Nat`), `personId` (`Text`),
  `requestingUserId` (`Principal`), `status`, `submittedDate` (`Int`,
  nanoseconds since epoch), `reviewedBy` (`?Principal`, `null` when
  unreviewed), and `reviewedDate` (`?Int`, `null` when unreviewed).
- `RelationshipRequest` fields: `id` (`Nat`), `requestingPersonId` (`Text`),
  `relatedPersonId` (`Text`), `proposedRelationship`, `status`,
  `submittedDate` (`Int`), `reviewer` (`?Principal`, `null` when unreviewed),
  and `reviewedDate` (`?Int`, `null` when unreviewed).
- `Relationship` fields: `id` (`Nat`), `fromPersonId` (`Text`),
  `toPersonId` (`Text`), `relationshipType`, and `status`.
- `Notification` fields: `id` (`Nat`), `recipient` (`Principal`),
  `notificationType`, `message` (`Text`), `createdAt` (`Int`), and `read`
  (`Bool`).
- `ProfileEdits` carries the owner-editable optionals `preferredName`,
  `firstName`, `middleName`, `lastName`, `suffix`, `nickname`, `story`,
  `shortBio`, `longerStory`, `occupation`, `birthInfo`, `birthDate`,
  `birthplace`, `currentLocation`, `livingStatus`, `timeline` (`?[Text]`), and
  `privacySettings`; each `null` field leaves the current value unchanged.
  `birthDate` is free text holding either a full date or a year-only value.
- `PersonMatch` fields: `personId` (`Text`), `name` (`Text`), and `parents`
  (`[Text]`).
- `AccountId` is a `Principal` — the signed-in caller's stable internal account
  id, separate from any person in the family graph.
- `AuthMethod` is a variant: `#Google` or `#Apple`.
- `Account` fields: `id` (`AccountId`), `authMethods` (`[AuthMethod]`), and
  `createdAt` (`Int`, nanoseconds since epoch).
- `AuthMethods` fields: `google` (`Bool`) and `apple` (`Bool`).
- `AccountError` is a variant: `#NotSignedIn` or `#AccountNotFound`.
- `RemoveError` is a variant: `#NotSignedIn` or `#ProfileNotFound`.

## Lifecycle and polling

Photo uploads are synchronous: `addPhoto` returns the stored photo once the
metadata is persisted. There is no async job to poll. The frontend can call
`listPhotos` or `getProfilePhoto` after an upload to confirm the result. The
first photo uploaded to a person's gallery is automatically selected as the
profile photo; a later photo becomes the profile photo only when the caller
explicitly calls `setProfilePhoto`.

Archive items follow a submit → approve/reject lifecycle. `submitArchiveItem`
stores the item in `#Pending` state. An admin then calls `approveArchiveItem` or
`rejectArchiveItem` to move it to `#Approved` or `#Rejected`. Only `#Approved`
items are returned by `listApprovedArchiveItems` (the archive view). There is no
async job to poll; the frontend can call `listPendingArchiveItems` (admin) or
`listApprovedArchiveItems` to observe the current state.

Profile claims follow a request → approve/reject lifecycle. `requestProfileClaim`
creates a `#Pending` claim without granting ownership. A Family Steward then
calls `approveProfileClaim` (marking the profile `#Claimed` and associating it
with the requesting user) or `rejectProfileClaim`. Only an approved claim unlocks
owner editing via `updateOwnProfile`. A deceased profile can never be claimed
(`requestProfileClaim` returns `#err(#DeceasedProfile)`). A signed-in caller can
observe their own claim state on a profile at any time via `getMyProfileClaim`
(returns `null` when they have no claim on it), and can resolve their own linked
or pending profile at any time via `getMyProfile`.

While a pending claim exists for a person, that person's profile page shows
`PENDING CLAIM` status (\"Your claim to this profile is awaiting Family Steward
review\") and hides `UNCLAIMED` and the \"This is Me\" action for the claiming
user. The pending claim does not change the profile's `claimStatus` field (it
stays `#Unclaimed` until approval) — the frontend derives the pending state from
`getMyProfileClaim` / `getMyProfile`, not from `claimStatus`. Because the pending
claim is re-pointed to the canonical `lorenzoSmithJr` personId, the profile page,
the father's child card, Explore Family, and My Profile all resolve to that same
canonical record.

Relationship requests follow a propose → approve/reject lifecycle.
`proposeRelationship` creates a `#Pending` request that is never treated as
confirmed. A Family Steward calls `approveRelationshipRequest` (adding the
relationship as `#Confirmed` to the shared family graph),
`rejectRelationshipRequest`, or `setRelationshipRequestPending` (returning it to
`#Pending`). Because all family views read the shared graph, an approved
relationship automatically appears in Explore Family, Family Tree, Heritage, and
profiles without a manual insertion step. There is no async job to poll; the
frontend can call `listProfileClaims` / `listRelationshipRequests` (admin) or
`listNotifications` to observe current state. A regular signed-in caller can
observe their own pending relationship state at any time via
`getMyRelationshipRequests` (returns only the caller's own pending requests)
without needing Family Steward privileges.

## Mutation retry safety, idempotency, and destructive effects

- `addPhoto` is not idempotent: each call appends a new photo with a fresh id.
  Retrying an upload that actually succeeded creates a duplicate photo. The
  first photo added to a gallery (when no profile photo is set) is
  automatically selected as the profile photo.
- `setProfilePhoto` is idempotent: setting the same `photoId` again is a no-op
  that returns the same photo.
- `removePhoto` is idempotent: removing an already-removed (or nonexistent)
  photo returns `false` and changes nothing. Removing the current profile photo
  clears the profile photo selection.
- `removePhoto` is destructive and irreversible: the photo's metadata is
  removed from the gallery. The off-chain blob is not deleted by this call.
- `submitArchiveItem` is not idempotent: each call stores a new item with a
  fresh id. Retrying a submission that actually succeeded creates a duplicate
  item.
- `approveArchiveItem` and `rejectArchiveItem` are idempotent: approving or
  rejecting an already-approved or already-rejected (or nonexistent) item
  returns `null` and changes nothing. They only transition items currently in
  `#Pending` state. Neither is destructive — the item and its original file
  reference are preserved in either terminal state.
- `requestProfileClaim` is not idempotent in effect but guards against
  duplicates: it returns `#err(#AlreadyPending)` when a pending claim already
  exists for the same person, so a retry that actually succeeded does not create
  a second pending claim. It never grants ownership.
- `approveProfileClaim` and `rejectProfileClaim` are idempotent: approving or
  rejecting an already-reviewed (or nonexistent) claim returns `null` and
  changes nothing. They only transition claims currently in `#Pending` state.
  Approving a claim is not destructive — it marks the profile claimed and
  associates it with the claimant; rejecting leaves the profile unclaimed.
  Approving the pending claim on the canonical `lorenzoSmithJr` record sets that
  same profile's `claimStatus` to `#Claimed` and `claimedByUserId` to the
  signed-in claimant's principal; it never creates a new Person record and never
  recreates family relationships, so the child relationship under Lorenzo Smith
  Sr. and the shared family graph remain intact.
- `createMyself` is not idempotent: each call creates a new minimal profile
  keyed by the caller's principal, so a retry that actually succeeded would
  overwrite the caller's existing profile with a fresh one. The frontend should
  confirm the result before retrying.
- `proposeRelationship` is not idempotent in effect but guards against
  duplicates: it returns `#err(#DuplicateRequest)` when a pending request
  already exists between the same two people, so a retry that actually succeeded
  does not create a second pending request.
- `approveRelationshipRequest` and `rejectRelationshipRequest` are idempotent:
  approving or rejecting an already-reviewed (or nonexistent) request returns
  `null` and changes nothing. They only transition requests currently in
  `#Pending` state. Approving a request adds a `#Confirmed` relationship to the
  shared family graph; rejecting does not. `setRelationshipRequestPending`
  returns a request to `#Pending` and is idempotent (setting an already-pending
  request pending is a no-op that returns the updated record).
- `updateOwnProfile` is idempotent: applying the same edits again yields the
  same profile. It updates the existing canonical Person record in place —
  preserving `personId`, claim ownership, confirmed relationships, archive
  links, notifications, and verification history — and never creates a new
  person. It only ever updates the caller's own living profile and never
  rewrites family relationships; any relationship addition or change must go
  through `proposeRelationship`.
- `bindAuthMethod` is idempotent: binding an authentication method that is
  already bound to the account is a no-op that returns the unchanged account.
  It never removes or replaces other bound methods, so a retry that actually
  succeeded does not duplicate a method.

## Errors, traps, limits, and gotchas

- `getCallerUserRole` and `isCallerAdmin` trap with `\"User is not registered\"`
  for a signed-in but unregistered caller.
- `assignCallerUserRole` traps with `\"Unauthorized: Only admins can assign
  user roles\"` when the caller is not an admin.
- `setProfilePhoto` returns `null` (it does not trap) when the photo id does
  not exist in the person's gallery.
- Photo ids are per-person; the same numeric id can refer to different photos
  for different people.
- The OQL `photo` entity's primary key is the composite `key` field, not `id`,
  because `id` is only unique within a person.
- The Family Steward review methods trap with `\"Unauthorized: Only Family
  Stewards can ...\"` when the caller is not an admin. The sign-in-gated
  ownership methods (`requestProfileClaim`, `createMyself`,
  `proposeRelationship`, `updateOwnProfile`) return `#err(#NotSignedIn)` for an
  anonymous caller rather than trapping.
- `requestProfileClaim` returns `#err(#DeceasedProfile)` for a deceased profile
  — deceased profiles can never be claimed. `updateOwnProfile` likewise returns
  `#err(#DeceasedProfile)` for a deceased profile and `#err(#NotOwner)` when the
  caller is not the profile's owner.
- `approveProfileClaim`, `rejectProfileClaim`, `approveRelationshipRequest`,
  `rejectRelationshipRequest`, and `setRelationshipRequestPending` return `null`
  (they do not trap) when the target id does not exist or is not in the expected
  state.
- `removeDuplicateProfile` returns `#err(#NotSignedIn)` for an anonymous caller
  and `#err(#ProfileNotFound)` when the person is not tracked. It is Family
  Steward only and traps with `\"Unauthorized: Only Family Stewards can remove
  duplicate profiles\"` when the caller is not an admin. It removes the profile
  plus any pending relationship request or pending claim tied only to it; it
  never removes the signed-in account and never alters confirmed relationships.
- `getPersonProfile` returns `null` (it does not trap) when the person is not
  tracked by the backend. The backend seeds a profile for every existing family
  member (all unclaimed, with living/deceased status derived from the profile
  data), and additionally tracks profiles created via `createMyself` or claimed
  via an approved claim. The authoritative relationship graph and most display
  content live in the frontend's shared person/family graph; the backend tracks
  ownership/lifecycle state and the owner-editable fields.
- `listNotifications` returns only the signed-in caller's own notification
  records; it is not a global feed.
- `searchPossibleMatches` searches only the backend-tracked profiles; the
  frontend merges these with its own authoritative family graph search to show
  name plus parents when known.
- The OQL ownership entities (`profile`, `claim`, `relationshipRequest`,
  `confirmedRelationship`, `notification`) are flattened views: enumerated
  variants are rendered as their tag text, optional fields render as empty text
  or `0`, and the array-valued `timeline` is not exposed.
- The account identity methods (`getMyAccountId`, `getMyAuthMethods`,
  `bindAuthMethod`) return `#err(#NotSignedIn)` for an anonymous caller rather
  than trapping. `getMyAuthMethods` returns `#err(#AccountNotFound)` for a
  signed-in caller whose account has not been created yet (no `bindAuthMethod`
  call has been made); `getMyAccountId` and `bindAuthMethod` do not require an
  existing account — `bindAuthMethod` creates it on first use.
"
  };
};
