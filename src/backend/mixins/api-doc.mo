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

The backend also provides Family Governance & Safety Controls for real family
use. Family Stewards (the `#admin` role) manage steward succession, safe profile
removal/archive/restore, duplicate-profile review and merge, relationship
administration, and a steward-only governance audit log. A successor steward is
a designation only until a current steward explicitly activates them; there is
no automatic stewardship transfer based on inactivity. Profile removal is never
a simple destructive delete — it flows through a steward-reviewed request or an
explicit archive, and permanent deletion is allowed only for empty error-created
profiles with explicit confirmation.

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
  pending claim on a duplicate Lorenzo Smith Jr. profile is dropped (see the
  canonical-record note below) and the caller's approved claim resolves to the
  canonical `lorenzoSmithJr` personId, a caller who owns Lorenzo Smith Jr.
  resolves here to that same canonical profile, not to a detached test record.
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

### Family Governance (Steward Management, Succession, Removal, Merge, Relationships, Audit)

- `listStewards() : async [StewardRecord]` — query. Family Steward only. Lists
  all steward governance records with role status and account identity.
- `promoteToSteward(personId : Text) : async Result<StewardRecord, StewardError>` —
  update. Family Steward only. Promotes an existing approved claimed family
  member (a profile with `claimStatus == #Claimed` and a claiming owner) to
  Family Steward. Returns `#err(#NotApprovedClaimedMember)` when the person is
  not an approved claimed member and `#err(#AlreadySteward)` when the member's
  account is already an active steward.
- `removeSteward(stewardAccountId : Principal) : async Result<(), StewardError>` —
  update. Family Steward only. Removes the steward role from another steward,
  never allowing the last active steward to be removed (returns
  `#err(#LastSteward)` when only one active steward remains). Returns
  `#err(#NotSteward)` when the account is not an active steward.
- `designateSuccessor(personId : Text, priority : Nat) : async Result<SuccessorDesignation, StewardError>` —
  update. Family Steward only. Designates an approved claimed family member as a
  successor steward with a priority/order. A successor is a designation only —
  not an active steward until explicitly activated. Returns
  `#err(#NotApprovedClaimedMember)` when the person is not an approved claimed
  member.
- `activateSuccessor(personId : Text) : async Result<StewardRecord, StewardError>` —
  update. Family Steward only. Activates/promotes a designated successor into
  the active steward role. Returns `#err(#NotDesignated)` when the person has no
  `#Designated` successor record, `#err(#NotApprovedClaimedMember)` when the
  person is not an approved claimed member, and `#err(#AlreadySteward)` when the
  member's account is already an active steward.
- `listSuccessors() : async [SuccessorDesignation]` — query. Family Steward
  only. Lists all successor designations.
- `getSingleStewardWarning() : async ?Text` — query. Family Steward only.
  Returns a warning encouraging successor designation when only one active
  steward exists, or `null` when there are multiple stewards.
- `listStewardIdentities() : async [StewardIdentity]` — query. Family Steward
  only. Returns each current Steward and designated Successor enriched with the
  linked approved Person identity, resolved via steward accountId -> approved
  linked personId (`PersonProfile.claimedByUserId`) -> canonical Person Profile.
  Each `StewardIdentity` carries `personId`, `displayName` (the family-facing
  identity: preferred/display name, falling back to the canonical full person
  name), `canonicalName` (the canonical full person name), and `accountId` (the
  internal account principal, carried only for authorization/audit and never the
  primary displayed identity). Current Stewards are those with
  `roleStatus == #Active`; designated Successors are those with
  `status == #Designated`. A steward or successor whose account/person cannot be
  resolved to an approved claimed Person profile is omitted.
- `listEligibleStewardCandidates() : async [StewardIdentity]` — query. Family
  Steward only. Returns the eligible promotion/successor candidate list: all
  people who are living, have an APPROVED/CLAIMED profile
  (`claimStatus == #Claimed`), are linked to a valid account
  (`claimedByUserId` is set), are not already an active Steward, and are not
  archived. This is data-driven — as additional family members claim and receive
  approval they automatically appear without code changes. Each candidate is a
  `StewardIdentity` as described above.
- `requestProfileRemoval(personId : Text, reason : Text) : async Result<ProfileRemovalRequest, RemovalError>` —
  update. A claimed living profile owner requests removal of their own profile;
  a Family Steward reviews the request. Returns `#err(#NotSignedIn)` for an
  anonymous caller, `#err(#ProfileNotFound)` when the person is not tracked,
  `#err(#DeceasedProfile)` for a deceased profile, `#err(#NotOwner)` when the
  caller is not the profile's owner, and `#err(#AlreadyPending)` when a pending
  removal request already exists for that person.
- `listProfileRemovalRequests() : async [ProfileRemovalRequest]` — query. Family
  Steward only. Lists all profile removal requests for review.
- `approveProfileRemoval(requestId : Nat) : async ?ProfileRemovalRequest` —
  update. Family Steward only. Approves a pending removal request, archiving the
  profile. Returns the updated request, or `null` when no pending request with
  that id exists.
- `rejectProfileRemoval(requestId : Nat) : async ?ProfileRemovalRequest` —
  update. Family Steward only. Rejects a pending removal request. Returns the
  updated request, or `null` when no pending request with that id exists.
- `archiveProfile(personId : Text) : async Result<(), ArchiveError>` — update.
  Family Steward only. Archives a profile, removing it from normal family
  browsing while preserving relationships, media, timeline, sources, and
  ownership history. Returns `#err(#ProfileNotFound)` when the person is not
  tracked and `#err(#AlreadyArchived)` when already archived.
- `restoreProfile(personId : Text) : async Result<(), ArchiveError>` — update.
  Family Steward only. Restores an archived profile to normal family browsing.
  Returns `#err(#NotArchived)` when the profile is not archived.
- `listArchivedProfiles() : async [PersonProfile]` — query. Family Steward only.
  Lists the profiles currently archived.
- `permanentlyDeleteProfile(personId : Text, confirmation : Bool) : async Result<(), DeleteError>` —
  update. Family Steward only. Permanently deletes a profile only when it is
  empty of archive items, media, timeline/history, approved relationships, and
  ownership history, and explicit confirmation is given. Returns
  `#err(#ConfirmationRequired)` when `confirmation` is `false`,
  `#err(#HasTimeline)` when the profile has timeline entries,
  `#err(#HasApprovedRelationships)` when it has confirmed relationships,
  `#err(#HasOwnershipHistory)` when it is claimed or has a claiming owner, and
  `#err(#ProfileNotFound)` when the person is not tracked.
- `listDuplicateCandidates() : async [DuplicatePair]` — query. Family Steward
  only. Lists suspected duplicate Person records with comparison data (names,
  birth/death details, parents, spouses, children, claim status, owner account,
  and timeline counts).
- `notDuplicate(personIdA : Text, personIdB : Text) : async Result<(), MergeError>` —
  update. Family Steward only. Marks two suspected duplicates as not a
  duplicate. No persistent state changes.
- `mergeProfiles(canonicalPersonId : Text, mergedAwayPersonId : Text) : async Result<MergeResult, MergeError>` —
  update. Family Steward only. Merges two duplicate profiles into one canonical
  record, moving/linking all valid relationships, media, timeline, stories,
  sources, archive references, and ownership/claim history without duplicating
  shared items. Conflicting fields are preserved as conflict/review items. The
  merged-away record is archived rather than hard-deleted. Returns
  `#err(#SameProfile)` when both ids are equal and `#err(#ProfileNotFound)` when
  either person is not tracked.
- `resolveMergeConflict(conflictId : Nat, canonicalValue : Text) : async ?MergeConflict` —
  update. Family Steward only. Resolves a merge conflict by choosing the
  canonical display value. Returns the updated conflict, or `null` when no
  pending conflict with that id exists.
- `listPersonRelationships(personId : Text) : async [Relationship]` — query.
  Family Steward only. Returns the current relationships for a person.
- `addRelationship(fromPersonId : Text, toPersonId : Text, relationshipType : RelationshipType) : async Result<Relationship, RelationshipAdminError>` —
  update. Family Steward only. Adds a missing relationship to the shared family
  graph. Returns `#err(#DuplicateRelationship)` when an identical relationship
  already exists.
- `removeRelationship(relationshipId : Nat) : async Result<(), RelationshipAdminError>` —
  update. Family Steward only. Removes an incorrect relationship from the shared
  family graph. Returns `#err(#RelationshipNotFound)` when no relationship with
  that id exists.
- `correctRelationshipType(relationshipId : Nat, relationshipType : RelationshipType) : async Result<Relationship, RelationshipAdminError>` —
  update. Family Steward only. Corrects the relationship type of an existing
  relationship. Returns `#err(#RelationshipNotFound)` when no relationship with
  that id exists.
- `listAuditHistory() : async [AuditEntry]` — query. Family Steward only.
  Returns the governance audit log. Audit History is strictly steward-only.

### Object Query Layer (OQL)

- `schema() : async Text` — query. Returns a JSON catalogue of the exposed
  entities and their fields.
- `execute(qJson : Text) : async Result` — query. Runs a JSON-encoded OQL query
  and returns matching rows.

The exposed entities are `photo`, `archiveItem`, `profile`, `claim`,
`relationshipRequest`, `confirmedRelationship`, `notification`, `account`,
`steward`, `successor`, `removalRequest`, `auditLog`, `mergeConflict`, and
`archivedProfile`, all declared `.controllerOnly()` (see the authorization
section). `photo` rows are flattened
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

The governance entities are flattened views of the corresponding records.
`steward` rows (primary key `stewardAccountId`, the steward's account principal
rendered as text) carry `roleStatus` (`\"Active\"`/`\"Removed\"`),
`successorPriority` (the steward's own designated successor priority, `0` when
none), `assignedBy` (the promoting steward's principal rendered as text), and
`assignedAt` (nanoseconds since epoch, `Int`). `successor` rows (primary key
`personId`) carry `priority` (`Nat`, the order in which the successor should be
considered for activation), `assignedBy` (principal text), `assignedAt` (`Int`),
and `status` (`\"Designated\"`/`\"Activated\"`/`\"Removed\"`). `removalRequest`
rows (primary key `id`) carry `personId`, `requestingUserId` (principal text),
`reason`, `status` (`\"Pending\"`/`\"Approved\"`/`\"Rejected\"`),
`submittedDate` (`Int`), `reviewedBy` (principal text, `\"\"` when unreviewed),
and `reviewedDate` (`Int`, `0` when unreviewed). `auditLog` rows (primary key
`id`) carry `actionType` (the audit action tag text, e.g.
`\"ClaimApproved\"`/`\"StewardPromoted\"`/`\"ProfileArchived\"`/`\"DuplicateMerged\"`),
`actorAccountId` (principal text), `affectedPersonCount` (`Nat`, the number of
affected person ids), `timestamp` (nanoseconds since epoch, `Int`), and
`summary`. `mergeConflict` rows (primary key `id`) carry `field`,
`canonicalValue`, `alternateValue`, `status` (`\"Pending\"`/`\"Resolved\"`),
`resolvedBy` (principal text, `\"\"` when unresolved), and `resolvedAt` (`Int`,
`0` when unresolved). `archivedProfile` rows (primary key `personId`) carry only
`personId` — the id of each archived profile.

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
`claim`, `relationshipRequest`, `confirmedRelationship`, `notification`,
`account`, `steward`, `successor`, `removalRequest`, `auditLog`,
`mergeConflict`, and `archivedProfile` — are declared `.controllerOnly()`, so only the platform controller can read their
rows through `schema()`/`execute()`; end users do not read them directly. This
keeps the family, archive, and governance metadata private to the platform while
still letting the Data Intelligence agent answer over it.

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

The Family Governance methods are steward-only. `listStewards`,
`promoteToSteward`, `removeSteward`, `designateSuccessor`, `activateSuccessor`,
`listSuccessors`, `getSingleStewardWarning`, `listStewardIdentities`,
`listEligibleStewardCandidates`, `listProfileRemovalRequests`,
`approveProfileRemoval`, `rejectProfileRemoval`, `archiveProfile`,
`restoreProfile`, `listArchivedProfiles`, `permanentlyDeleteProfile`,
`listDuplicateCandidates`, `notDuplicate`, `mergeProfiles`,
`resolveMergeConflict`, `listPersonRelationships`, `addRelationship`,
`removeRelationship`, `correctRelationshipType`, and `listAuditHistory` all trap
with `\"Unauthorized: Only Family Stewards can ...\"` when the caller is not an
admin. `requestProfileRemoval` is the one governance method a normal family
member calls: it requires a signed-in (non-anonymous) caller and returns
`#err(#NotSignedIn)` for an anonymous caller (it does not trap), and it only
ever requests removal of the caller's own claimed living profile.

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
  migrated away: approved and rejected claims referencing a duplicate are
  re-pointed to `\"lorenzoSmithJr\"` (preserving the approved ownership
  relationship), pending claims on a duplicate are dropped (manual-test
  artifacts), relationship requests referencing a duplicate are re-pointed to
  `\"lorenzoSmithJr\"`, the duplicate's gallery (photos + profile photo) is
  consolidated into the canonical gallery, and the duplicate profile is removed,
  so exactly one Lorenzo Smith Jr. Person record remains. A deploy-time
  seed-safety guard runs on every install/upgrade and preserves any real-runtime
  `lorenzoSmithJr` record — its claim/ownership link, display name, profile
  photo, uploaded gallery, profile edits, privacy settings, and timeline/story
  data — and never overwrites it. Seed/demo initialization runs only where data
  is genuinely absent (`profiles.get(personId) == null`). If an approved claim
  on `\"lorenzoSmithJr\"` exists — including an approved claim that was keyed
  under a duplicate Lorenzo Smith Jr. profile and is re-pointed to the canonical
  personId — the guard restores `claimStatus = #Claimed` and `claimedByUserId`
  from that approved claim; it never fabricates an account principal or
  auto-approves a pending claim. A pending claim created on a duplicate profile
  during manual testing is dropped so no duplicate pending claim remains.
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
- `StewardRecord` fields: `stewardAccountId` (`Principal`, the steward's
  account), `roleStatus` (`#Active`/`#Removed`), `successorPriority` (`?Nat`,
  the steward's own designated successor priority, `null` when none),
  `assignedBy` (`Principal`, the promoting steward), and `assignedAt` (`Int`,
  nanoseconds since epoch).
- `SuccessorDesignation` fields: `personId` (`Text`), `priority` (`Nat`, the
  order in which the successor should be considered for activation),
  `assignedBy` (`Principal`), `assignedAt` (`Int`), and `status`
  (`#Designated`/`#Activated`/`#Removed`). A successor is a designation only —
  not an active steward until a current steward explicitly activates them.
- `StewardIdentity` fields: `personId` (`Text`), `displayName` (`Text`, the
  family-facing identity — preferred/display name, falling back to the canonical
  full person name), `canonicalName` (`Text`, the canonical full person name),
  and `accountId` (`Principal`, the internal account principal carried only for
  authorization/audit and never the primary displayed identity).
- `ProfileRemovalRequest` fields: `id` (`Nat`), `personId` (`Text`),
  `requestingUserId` (`Principal`), `reason` (`Text`), `status`
  (`#Pending`/`#Approved`/`#Rejected`), `submittedDate` (`Int`), `reviewedBy`
  (`?Principal`, `null` when unreviewed), and `reviewedDate` (`?Int`, `null`
  when unreviewed).
- `AuditEntry` fields: `id` (`Nat`), `actionType` (`AuditActionType` variant),
  `actorAccountId` (`Principal`), `affectedPersonIds` (`[Text]`), `timestamp`
  (`Int`, nanoseconds since epoch), and `summary` (`Text`).
- `AuditActionType` is a variant: `#ClaimApproved`, `#ClaimRejected`,
  `#RelationshipRequestApproved`, `#RelationshipRequestRejected`,
  `#StewardPromoted`, `#StewardRemoved`, `#SuccessorDesignated`,
  `#SuccessorActivated`, `#ProfileArchived`, `#ProfileRestored`,
  `#ProfilePermanentlyDeleted`, `#ProfileRemovalRequested`,
  `#ProfileRemovalReviewed`, `#DuplicateMerged`, `#RelationshipAdded`,
  `#RelationshipRemoved`, or `#RelationshipTypeCorrected`.
- `MergeConflict` fields: `id` (`Nat`), `field` (`Text`), `canonicalValue`
  (`Text`), `alternateValue` (`Text`), `status` (`#Pending`/`#Resolved`),
  `resolvedBy` (`?Principal`, `null` when unresolved), and `resolvedAt` (`?Int`,
  `null` when unresolved).
- `DuplicateCandidate` fields: `personId` (`Text`), `name` (`Text`),
  `birthDate` (`?Text`), `deathDate` (`?Text`), `parents` (`[Text]`), `spouses`
  (`[Text]`), `children` (`[Text]`), `claimStatus` (`Text`), `ownerAccount`
  (`?Principal`), `photoCount` (`Nat`), `timelineCount` (`Nat`), `sourceCount`
  (`Nat`), and `archiveLinks` (`[Text]`).
- `DuplicatePair` fields: `candidateA` and `candidateB` (each a
  `DuplicateCandidate`).
- `MergeResult` fields: `canonicalPersonId` (`Text`), `archivedPersonId`
  (`Text`), and `conflicts` (`[MergeConflict]`).
- `StewardError` is a variant: `#NotSignedIn`, `#NotSteward`,
  `#NotApprovedClaimedMember`, `#LastSteward`, `#AlreadySteward`, or
  `#NotDesignated`.
- `RemovalError` is a variant: `#NotSignedIn`, `#ProfileNotFound`, `#NotOwner`,
  `#DeceasedProfile`, or `#AlreadyPending`.
- `ArchiveError` is a variant: `#NotSignedIn`, `#ProfileNotFound`,
  `#AlreadyArchived`, or `#NotArchived`.
- `DeleteError` is a variant: `#NotSignedIn`, `#ProfileNotFound`,
  `#HasArchiveItems`, `#HasMedia`, `#HasTimeline`, `#HasApprovedRelationships`,
  `#HasOwnershipHistory`, or `#ConfirmationRequired`.
- `MergeError` is a variant: `#NotSignedIn`, `#ProfileNotFound`, `#SameProfile`,
  or `#NotDuplicate`.
- `RelationshipAdminError` is a variant: `#NotSignedIn`, `#PersonNotFound`,
  `#RelationshipNotFound`, or `#DuplicateRelationship`.

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
`getMyProfileClaim` / `getMyProfile`, not from `claimStatus`. Because a pending
claim on a duplicate Lorenzo Smith Jr. profile is dropped and the caller's
approved claim resolves to the canonical `lorenzoSmithJr` personId, the profile
page, the father's child card, Explore Family, and My Profile all resolve to
that same canonical record.

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

Governance actions follow steward-driven lifecycles. Steward succession:
`promoteToSteward` makes an approved claimed member an active steward directly;
`designateSuccessor` records a successor as a `#Designated` designation only,
and `activateSuccessor` promotes a designated successor into the active steward
role (marking the designation `#Activated`). A successor is never an active
steward until explicitly activated — there is no automatic transfer based on
inactivity. Safe profile removal: a claimed living profile owner calls
`requestProfileRemoval` to create a `#Pending` request; a Family Steward then
calls `approveProfileRemoval` (which archives the profile) or
`rejectProfileRemoval`. Archive/restore: `archiveProfile` removes a profile from
normal browsing while preserving its data; `restoreProfile` returns it.
Permanent deletion (`permanentlyDeleteProfile`) is allowed only when the profile
is empty of archive items, media, timeline/history, approved relationships, and
ownership history, and explicit confirmation is given. Duplicate review:
`listDuplicateCandidates` returns suspected pairs; a steward either calls
`notDuplicate` or `mergeProfiles` (which archives the merged-away record and
records any field conflicts as `#Pending` `MergeConflict` items, later resolved
via `resolveMergeConflict`). Relationship administration: a steward can
`addRelationship`, `removeRelationship`, or `correctRelationshipType` directly
on the shared family graph; normal family members continue to use the pending
`proposeRelationship` flow requiring steward approval. Every governance action
records an `AuditEntry` in the audit log, readable only by Family Stewards via
`listAuditHistory`. There is no async job to poll; the frontend can call the
relevant list methods to observe current state.

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
- `promoteToSteward` is not idempotent in effect but guards against duplicates:
  it returns `#err(#AlreadySteward)` when the member's account is already an
  active steward, so a retry that actually succeeded does not create a second
  steward record.
- `removeSteward` is idempotent: removing an already-removed (or nonexistent)
  steward returns `#err(#NotSteward)` and changes nothing. It never allows the
  last active steward to be removed (`#err(#LastSteward)`).
- `designateSuccessor` is not idempotent: each call appends a new designation
  record for the person. `activateSuccessor` is idempotent in effect — it
  returns `#err(#NotDesignated)` when the person has no `#Designated` record,
  and `#err(#AlreadySteward)` when the member is already an active steward.
- `requestProfileRemoval` is not idempotent in effect but guards against
  duplicates: it returns `#err(#AlreadyPending)` when a pending removal request
  already exists for the person.
- `approveProfileRemoval` and `rejectProfileRemoval` are idempotent: approving
  or rejecting an already-reviewed (or nonexistent) request returns `null` and
  changes nothing. They only transition requests currently in `#Pending` state.
  Approving a removal archives the profile; rejecting leaves it unarchived.
- `archiveProfile` is idempotent: archiving an already-archived profile returns
  `#err(#AlreadyArchived)` and changes nothing. `restoreProfile` is idempotent:
  restoring a non-archived profile returns `#err(#NotArchived)` and changes
  nothing.
- `permanentlyDeleteProfile` is destructive and irreversible: it removes the
  profile record entirely. It is allowed only when the profile is empty of
  archive items, media, timeline/history, approved relationships, and ownership
  history, and explicit confirmation is given; otherwise it returns the
  corresponding `#err(...)` without deleting anything. It never automatically
  deletes relatives when another profile is removed.
- `notDuplicate` is idempotent and makes no persistent state changes.
- `mergeProfiles` is not idempotent: merging the same pair twice would re-run
  the merge. It archives the merged-away record rather than hard-deleting it,
  re-points relationships to the canonical record without duplicating shared
  items, and preserves conflicting field values as `#Pending` `MergeConflict`
  items. It never creates a new Person record.
- `resolveMergeConflict` is idempotent: resolving an already-resolved (or
  nonexistent) conflict returns `null` and changes nothing. It only transitions
  conflicts currently in `#Pending` state.
- `addRelationship` is not idempotent in effect but guards against duplicates:
  it returns `#err(#DuplicateRelationship)` when an identical relationship
  already exists. `removeRelationship` is idempotent: removing a nonexistent
  relationship returns `#err(#RelationshipNotFound)` and changes nothing.
  `correctRelationshipType` is idempotent: correcting to the same type is a
  no-op that returns the updated record.

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
- The Family Governance methods trap with `\"Unauthorized: Only Family Stewards
  can ...\"` when the caller is not an admin. `requestProfileRemoval` is the one
  governance method a normal family member calls; it returns `#err(#NotSignedIn)`
  for an anonymous caller rather than trapping, and only ever requests removal
  of the caller's own claimed living profile.
- `approveProfileRemoval`, `rejectProfileRemoval`, and `resolveMergeConflict`
  return `null` (they do not trap) when the target id does not exist or is not
  in the expected state.
- `permanentlyDeleteProfile` returns `#err(#ConfirmationRequired)` when
  `confirmation` is `false`, and `#err(#HasTimeline)`,
  `#err(#HasApprovedRelationships)`, or `#err(#HasOwnershipHistory)` when the
  profile still has timeline entries, confirmed relationships, or ownership
  history respectively. It never automatically deletes relatives.
- `mergeProfiles` returns `#err(#SameProfile)` when both ids are equal and
  `#err(#ProfileNotFound)` when either person is not tracked. It never creates a
  new Person record and archives the merged-away record rather than hard-deleting
  it.
- The OQL governance entities (`steward`, `successor`, `removalRequest`,
  `auditLog`, `mergeConflict`, `archivedProfile`) are flattened views:
  enumerated variants are rendered as their tag text, optional fields render as
  empty text or `0`, and the array-valued `affectedPersonIds` is exposed as the
  `affectedPersonCount` (`Nat`) since OQL has no array value type.
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
