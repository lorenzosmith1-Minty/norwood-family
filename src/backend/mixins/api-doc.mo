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

The backend also provides a private family-wide Message Board and private 1:1
messaging for approved family members. The Message Board lets approved members
post announcements, family questions, research/history leads, photo
identification requests, recipes, reunion/event notices, memorials, and general
conversation, with one-level replies, related-member links, and optional linked
Archive/media. Posts are Family Only; authors can edit/archive their own posts,
and Family Stewards can archive/restore posts and remove replies, with governance
actions recorded in the audit log. Private messaging provides one canonical 1:1
text-only conversation per account pair (reused when the same two users message
again), an inbox with unread counts, blocking/unblocking, and message reporting
that Stewards review. Only participants can read a conversation; Stewards cannot
browse arbitrary private conversations and see reported message content only when
a report is filed. The backend also exposes a Steward-only Pending Contributions
count that aggregates all current pending review items for the Pending
Contributions badge.

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

- `submitArchiveItem(title : Text, description : Text, itemType : ArchiveItemType, blob : Blob, era : Text, year : ?Nat, tags : [Text], relatedMemberIds : [Text], relatedBranchId : ?Text, sourceStatus : SourceStatus, privacyLevel : PrivacyLevel, classification : ArchiveItemClassification, primarySpeaker : ?OralHistorySpeaker) : async ArchiveItem` —
  update. Submits a new archive item. Requires a signed-in (non-anonymous)
  caller; the caller is recorded as the `contributor`. The item is stored in
  `#Pending` state, assigned a fresh id, and `createdAt` is set to the current
  time. It does not appear in the archive until an admin approves it. The
  `blob` is the external storage reference (a `Blob`); the original file bytes
  live off-chain and are preserved as-is.
  `classification` marks the item as Oral History (distinct from `itemType`):
  `#Standard` for ordinary media, `#OralHistory` for oral-history video and
  audio-only oral history. When `classification == #OralHistory`, `primarySpeaker`
  is REQUIRED — exactly one primary speaker — and the call traps with
  `\"A primary speaker is required for Oral History items\"` when it is `null`.
  When `classification == #Standard`, `primarySpeaker` must be `null` and the
  call traps with `\"A primary speaker is only allowed on Oral History items\"`
  when it is not. `primarySpeaker` links to a canonical Person record via its
  optional `personId` when that person exists, and always carries a display
  `name`. Related Family Members (`relatedMemberIds`) may still contain multiple
  people; only the single primary speaker is constrained. The reserved
  future-ready fields (transcript, searchable transcript, chapter markers, AI
  summary, extracted names) are initialized to `null` and are not populated by
  any logic yet.
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

### Family Stories, Family Mysteries, and Travel Through Time

- `listApprovedStories() : async [Story]` — query. Returns all stories in
  `#Approved` state (the stories visible to viewers). Stories reference existing
  person ids and archive item ids; they never create duplicate Person records.
- `listPendingStories() : async [Story]` — query. Family Steward only. Returns
  all stories currently in `#Pending` state.
- `submitStory(title : Text, storyText : Text, relatedMemberIds : [Text], era : ?Text, year : ?Nat, location : ?Text, evidenceStatus : EvidenceStatus, relatedArchiveItemIds : [Nat]) : async Story` —
  update. Submits a new story. Requires a signed-in (non-anonymous) caller; the
  caller is recorded as the `contributor`. The story is stored in `#Pending`
  state and waits for a Family Steward to approve it before becoming visible.
  `evidenceStatus` carries the evidence distinction (`#Documented`,
  `#FamilyHistory`, `#PersonalMemory`, `#Unresolved`) — Family History and
  Personal Memory are never presented as documented fact. Submitting a story
  never overwrites a person's profile story text.
- `approveStory(id : Nat) : async ?Story` — update. Family Steward only. Moves a
  pending story to `#Approved` state and returns the updated story, or `null`
  when no pending story with that id exists.
- `rejectStory(id : Nat) : async ?Story` — update. Family Steward only. Moves a
  pending story to `#Rejected` state and returns the updated story, or `null`
  when no pending story with that id exists.
- `addCanonicalStory(title : Text, storyText : Text, relatedMemberIds : [Text], era : ?Text, year : ?Nat, location : ?Text, evidenceStatus : EvidenceStatus, relatedArchiveItemIds : [Nat]) : async Story` —
  update. Family Steward only. Adds a canonical story directly, already in
  `#Approved` state.
- `updateCanonicalStory(id : Nat, title : Text, storyText : Text, relatedMemberIds : [Text], era : ?Text, year : ?Nat, location : ?Text, evidenceStatus : EvidenceStatus, relatedArchiveItemIds : [Nat]) : async ?Story` —
  update. Family Steward only. Edits a canonical story, preserving its original
  `contributor` and `createdAt`. Returns the updated story, or `null` when no
  story with that id exists.
- `listMysteries() : async [Mystery]` — query. Returns all mysteries (visible to
  viewers). Each mystery keeps `knownFacts`, `possibilities`, and
  `relatedSourceIds`/`relatedArchiveItemIds` separate so a theory never silently
  becomes a confirmed fact.
- `submitMysteryContribution(mysteryId : Nat, contributionType : MysteryContributionType, text : Text) : async MysteryContribution` —
  update. Submits a mystery contribution (a note, memory, possible lead, or
  source/document reference). Requires a signed-in (non-anonymous) caller; the
  caller is recorded as the `contributor`. The contribution is stored in
  `#Pending` state and waits for a Family Steward to review it before altering
  the canonical mystery record.
- `listPendingMysteryContributions() : async [MysteryContribution]` — query.
  Family Steward only. Returns all mystery contributions currently in `#Pending`
  state.
- `reviewMysteryContribution(id : Nat, approve : Bool) : async ?MysteryContribution` —
  update. Family Steward only. Approves or rejects a pending mystery
  contribution, recording the reviewer and review time. Returns the updated
  contribution, or `null` when no pending contribution with that id exists.
- `createCanonicalMystery(title : Text, description : Text, relatedMemberIds : [Text], relatedBranchId : ?Text, knownFacts : [Text], possibilities : [Text], relatedSourceIds : [Nat], relatedArchiveItemIds : [Nat], status : MysteryStatus) : async Mystery` —
  update. Family Steward only. Creates a canonical mystery directly.
- `updateCanonicalMystery(id : Nat, title : Text, description : Text, relatedMemberIds : [Text], relatedBranchId : ?Text, knownFacts : [Text], possibilities : [Text], relatedSourceIds : [Nat], relatedArchiveItemIds : [Nat], status : MysteryStatus) : async ?Mystery` —
  update. Family Steward only. Edits a canonical mystery, preserving its
  original `contributor`, `createdAt`, and any existing `resolution`. Returns the
  updated mystery, or `null` when no mystery with that id exists.
- `markMysteryResolved(id : Nat, summary : Text, supportingEvidence : [Text]) : async ?Mystery` —
  update. Family Steward only. Marks a mystery `#Resolved`, recording a
  resolution summary and supporting evidence while preserving the prior
  theories/history (the research trail is never deleted). Returns the updated
  mystery, or `null` when no mystery with that id exists.
- `listTimelineEvents() : async [TimelineEvent]` — query. Returns timeline
  events aggregated from existing canonical data only: PersonProfile timeline
  entries, ArchiveItem year/era, Story era/date, and Mystery records. Empty eras
  are never fabricated. Each event carries an evidence badge and a link target
  (Person Profile, Story, Archive Item, or Mystery).

### Family Recipes

- `submitRecipe(title : Text, shortDescription : Text, originatingPersonId : Text, relatedPersonIds : [Text], era : ?Text, year : ?Nat, location : ?Text, familyBranch : ?Text, ingredients : [Text], instructions : Text, familyStory : ?Text, tags : [Text], privacyLevel : PrivacyLevel, evidenceStatus : EvidenceStatus, linkedMediaIds : [Nat]) : async Recipe` —
  update. Submits a new family recipe. Requires a signed-in (non-anonymous)
  caller; the caller is recorded as the `contributorAccountId`. The recipe is
  stored in `#Pending` state and waits for a Family Steward to approve it before
  appearing in Family Recipes. `originatingPersonId` must reference a canonical
  Person record — the call traps with `\"Originating family member not found\"`
  when that person is not tracked. `relatedPersonIds` may include multiple
  people, each a canonical Person id. `linkedMediaIds` reference canonical
  Archive/media records by id only — no media file is duplicated, and one
  uploaded media file remains one canonical archive record even when linked to
  multiple recipes or profiles. The reserved future-ready fields (`ocrText`,
  `transcript`, `extractedIngredients`, `aiDerivedText`) are initialized to
  `null` and are not populated by any logic yet; original source material is
  always preserved separately from any future AI-derived text.
- `listPendingRecipes() : async [Recipe]` — query. Family Steward only. Returns
  all recipes currently in `#Pending` state.
- `approveRecipe(id : Nat) : async ?Recipe` — update. Family Steward only. Moves
  a pending recipe to `#Approved` state and returns the updated recipe, or `null`
  when no pending recipe with that id exists. Approval does not create a second
  Recipe — the same canonical record transitions to `#Approved`.
- `rejectRecipe(id : Nat) : async ?Recipe` — update. Family Steward only. Moves
  a pending recipe to `#Rejected` state and returns the updated recipe, or `null`
  when no pending recipe with that id exists.
- `listApprovedRecipes() : async [Recipe]` — query. Returns all recipes in
  `#Approved` state (the recipes visible in Family Recipes).
- `getRecipe(id : Nat) : async ?Recipe` — query. Returns a single recipe by id,
  or `null` when it does not exist.
- `listRecipesForPerson(personId : Text) : async [Recipe]` — query. Returns the
  approved recipes linked to a person, whether as the originating member or a
  related member. Returns only `#Approved` recipes for public views.
- `publishRecipe(title : Text, shortDescription : Text, originatingPersonId : Text, relatedPersonIds : [Text], era : ?Text, year : ?Nat, location : ?Text, familyBranch : ?Text, ingredients : [Text], instructions : Text, familyStory : ?Text, tags : [Text], privacyLevel : PrivacyLevel, evidenceStatus : EvidenceStatus, linkedMediaIds : [Nat]) : async Recipe` —
  update. Family Steward only. Publishes a canonical recipe directly, already in
  `#Approved` state. This is the steward-only add flow; it does not create a
  second Recipe on approval. `originatingPersonId` must reference a canonical
  Person record — the call traps with `\"Originating family member not found\"`
  when that person is not tracked.

### Family Message Board

- `listBoardPosts(filter : ?PostType) : async [Post]` — query. Approved family
  members only. Returns all active board posts, newest first, optionally filtered
  by post type. Archived posts are never returned.
- `getBoardPost(postId : PostId) : async ?Post` — query. Approved family members
  only. Returns a single active board post by id, or `null` when it does not
  exist or is archived.
- `createBoardPost(postType : PostType, title : ?Text, body : Text, relatedPersonIds : [Text], linkedMediaIds : [Nat]) : async Post` —
  update. Approved family members only. Creates a board post with a type,
  optional title, body, related family members, and optional linked existing
  Archive/media ids. The signed-in caller is recorded as the author (both the
  stable `authorAccountId` for authorization and the canonical `authorPersonId`
  for rendering the Person Profile identity). The post is created `#Active` with
  `privacyScope = #FamilyOnly`. A mention notification is created for each
  related member who has a linked account (other than the author), avoiding
  duplicates.
- `updateBoardPost(postId : PostId, postType : PostType, title : ?Text, body : Text, relatedPersonIds : [Text], linkedMediaIds : [Nat]) : async ?Post` —
  update. Approved family members only; the caller must be the post author. Edits
  the caller's own board post and returns the updated post, or `null` when the
  post does not exist. Traps with `\"Unauthorized: Only the post author can edit
  this post\"` when the caller is not the author.
- `archiveBoardPost(postId : PostId) : async ?Post` — update. Approved family
  members only. Archives (hides) a board post. The post author or a Family
  Steward may archive. Returns the updated post, or `null` when it does not
  exist. Traps with `\"Unauthorized: Only the post author or a Family Steward can
  archive this post\"` when the caller is neither. Records a `#BoardPostArchived`
  audit entry.
- `restoreBoardPost(postId : PostId) : async ?Post` — update. Family Steward
  only. Restores an archived board post. Returns the updated post, or `null`
  when it does not exist. Records a `#BoardPostRestored` audit entry.
- `listBoardReplies(postId : PostId) : async [Reply]` — query. Approved family
  members only. Returns the one-level replies to a board post, chronologically.
- `addBoardReply(postId : PostId, body : Text) : async Reply` — update. Approved
  family members only. Adds a one-level reply to an active board post. Traps with
  `\"Post not found\"` when the post does not exist or is archived. Creates a
  `#BoardReply` notification for the post author (unless they replied to their
  own post).
- `removeBoardReply(replyId : ReplyId) : async ?Reply` — update. Family Steward
  only. Removes a reply. Returns the removed reply, or `null` when it does not
  exist. Records a `#BoardReplyRemoved` audit entry.

### Private Messaging

- `canMessagePerson(personId : Text) : async Bool` — query. Returns whether the
  signed-in caller may message the person identified by `personId`: the viewer is
  signed in, the target has an active linked account, the target is not the
  viewer, and the target is not archived. Unclaimed profiles are never
  messageable. Drives the Message button on a living claimed Person Profile.
  Returns `false` for an anonymous caller.
- `listConversations() : async [ConversationSummary]` — query. Approved family
  members only. Returns the signed-in caller's inbox: one summary per
  conversation they participate in, newest activity first, with the other
  participant's identity, latest message preview, timestamp, and unread count.
- `getConversation(conversationId : ConversationId) : async ?ConversationView` —
  query. Approved family members only. Returns a full conversation view
  (participant identity plus message history) for a participant, or `null` when
  the conversation does not exist or the caller is not a participant. Only
  participants may read a conversation.
- `sendMessage(recipientPersonId : Text, body : Text) : async Result<Message, MessageError>` —
  update. Approved family members only. Sends a private message to the person
  identified by `recipientPersonId`, reusing the existing canonical 1:1
  conversation for the account pair when one exists. Creates a `#NewMessage`
  notification for the recipient. Returns `#err(#BlockedByRecipient)` when the
  recipient has blocked the sender (no message is stored).
- `markConversationRead(conversationId : ConversationId) : async ()` — update.
  Approved family members only. Marks all of the caller's messages in a
  conversation as read. Traps with `\"Conversation not found\"` when the
  conversation does not exist and `\"Unauthorized: Only participants can mark a
  conversation read\"` when the caller is not a participant.
- `blockUser(blockedAccountId : Principal) : async ()` — update. Approved family
  members only. Blocks another member, preventing them from sending new messages
  to the caller. Idempotent — blocking an already-blocked account is a no-op.
- `unblockUser(blockedAccountId : Principal) : async ()` — update. Approved
  family members only. Unblocks another member, allowing them to message the
  caller again.
- `listBlockedUsers() : async [Principal]` — query. Approved family members only.
  Returns the account ids the caller has blocked.
- `reportMessage(messageId : MessageId, reason : Text) : async Report` — update.
  Approved family members only. Reports a specific message with a reason. Only a
  participant of the message's conversation may report it. Traps with
  `\"Message not found\"` when the message does not exist, `\"Conversation not
  found\"` when its conversation does not exist, and `\"Unauthorized: Only
  conversation participants can report a message\"` when the caller is not a
  participant. The report is stored `#Pending`.
- `listReports() : async [Report]` — query. Family Steward only. Lists all
  reports.
- `reviewReport(reportId : ReportId, status : ReportStatus) : async ?Report` —
  update. Family Steward only. Updates a report's review status. Returns the
  updated report, or `null` when it does not exist.
- `getReportedMessage(reportId : ReportId) : async ?ReportedMessageView` —
  query. Family Steward only. Returns the reported message content for a report.
  Reported message content is visible only when a report is filed; Stewards
  cannot browse arbitrary private conversations. Returns `null` when the report
  or message does not exist.

### Pending Contributions

- `getPendingContributionsCount() : async Nat` — query. Family Steward only.
  Returns the count of all current pending review items (archive/media, video/
  audio, recipes, recipe media, stories, and mystery contributions) for the
  Steward-facing Pending Contributions badge. The count is derived from canonical
  pending data, so it increments on new pending items and decrements on
  Approve/Reject automatically.

### Object Query Layer (OQL)

- `schema() : async Text` — query. Returns a JSON catalogue of the exposed
  entities and their fields.
- `execute(qJson : Text) : async Result` — query. Runs a JSON-encoded OQL query
  and returns matching rows.

The exposed entities are `photo`, `archiveItem`, `profile`, `claim`,
`relationshipRequest`, `confirmedRelationship`, `notification`, `account`,
`steward`, `successor`, `removalRequest`, `auditLog`, `mergeConflict`,
`archivedProfile`, `dismissedPair`, `story`, `mystery`, `mysteryContribution`,
`recipe`, `boardPost`, `boardReply`, `conversation`, `message`, `block`, and
`report`.
Most are declared `.controllerOnly()` (see the authorization section); the
`conversation` entity is `.controllerOrScoped()` and the `message` entity is
`.scopedPerUser()`, both with a participant-only visibility rule. `photo` rows are flattened
photo metadata: `key` (globally-unique \"<personId>:<id>\", the primary key),
`personId`, `id`, `filename`, `mimeType`, `uploadedAt` (nanoseconds since epoch,
`Int`), `uploadedBy` (the uploading principal, rendered as text), and
`isProfilePhoto` (`Bool`). `archiveItem` rows are flattened archive metadata:
`id` (the primary key), `title`, `itemType`, `era`, `year` (optional year, `0`
when absent), `contributor` (the submitting principal, rendered as text),
`sourceStatus`, `privacyLevel`, `status`, `createdAt` (nanoseconds since
epoch, `Int`), `classification` (`\"Standard\"`/`\"OralHistory\"`), and
`primarySpeakerName` (the primary speaker's display name, `\"\"` when the item is
not Oral History). The raw blob bytes are not exposed.

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
`personId` — the id of each archived profile. `dismissedPair` rows (primary key
`key`, the composite `\"<personIdA>:<personIdB>\"`) carry `personIdA` and
`personIdB` — the two Person ids a steward dismissed as \"Not a duplicate\", so
the pair does not reappear in the duplicate review list.

The family-history entities are flattened views of the corresponding records.
`story` rows (primary key `id`) carry `title`, `storyText`,
`relatedMemberCount` (`Nat`, the number of related member ids),
`era` (free text, `\"\"` when absent), `year` (`Nat`, `0` when absent),
`location` (`\"\"` when absent), `contributor` (principal text),
`evidenceStatus` (`\"Documented\"`/`\"FamilyHistory\"`/`\"PersonalMemory\"`/`\"Unresolved\"`),
`relatedArchiveItemCount` (`Nat`), `createdAt` (`Int`, nanoseconds since epoch),
`updatedAt` (`Int`), and `status` (`\"Pending\"`/`\"Approved\"`/`\"Rejected\"`).
`mystery` rows (primary key `id`) carry `title`, `description`,
`relatedMemberCount` (`Nat`), `relatedBranchId` (`\"\"` when absent),
`knownFactCount` (`Nat`), `possibilityCount` (`Nat`), `relatedSourceCount`
(`Nat`), `relatedArchiveItemCount` (`Nat`), `status`
(`\"Open\"`/`\"Researching\"`/`\"PartiallyResolved\"`/`\"Resolved\"`), `contributor`
(principal text), `createdAt` (`Int`), `updatedAt` (`Int`), and `resolved`
(`Bool`, whether the mystery has a resolution). `mysteryContribution` rows
(primary key `id`) carry `mysteryId` (`Nat`), `contributionType`
(`\"Note\"`/`\"Memory\"`/`\"Lead\"`/`\"Source\"`), `text`, `contributor` (principal
text), `status` (`\"Pending\"`/`\"Approved\"`/`\"Rejected\"`), `createdAt` (`Int`),
`reviewedBy` (principal text, `\"\"` when unreviewed), and `reviewedAt` (`Int`,
`0` when unreviewed). The array-valued fields (`relatedMemberIds`,
`knownFacts`, `possibilities`, `relatedSourceIds`, `relatedArchiveItemIds`)
are exposed as counts since OQL has no array value type.

The recipe entity is a flattened view of the corresponding records. `recipe`
rows (primary key `recipeId`, a `Nat`) carry `title`, `shortDescription`,
`originatingPersonId` (the canonical Person id of the primary originating
family member), `relatedPersonCount` (`Nat`, the number of related member ids),
`contributorAccountId` (the contributing account principal rendered as text),
`era` (free text, `\"\"` when absent), `year` (`Nat`, `0` when absent),
`location` (`\"\"` when absent), `familyBranch` (`\"\"` when absent),
`ingredientCount` (`Nat`), `tagCount` (`Nat`), `privacyLevel`
(`\"Public\"`/`\"FamilyOnly\"`/`\"Private\"`), `evidenceStatus`
(`\"Documented\"`/`\"FamilyHistory\"`/`\"PersonalMemory\"`/`\"Unresolved\"`),
`linkedMediaCount` (`Nat`, the number of linked canonical Archive/media ids),
`status` (`\"Pending\"`/`\"Approved\"`/`\"Rejected\"`/`\"Archived\"`), `createdAt`
(`Int`, nanoseconds since epoch), and `updatedAt` (`Int`). The array-valued
fields (`relatedPersonIds`, `ingredients`, `tags`, `linkedMediaIds`) are exposed
as counts since OQL has no array value type. The reserved future-ready fields
(`ocrText`, `transcript`, `extractedIngredients`, `aiDerivedText`) are not
exposed.

The board entities are flattened views of the corresponding records.
`boardPost` rows (primary key `postId`, a `Nat`) carry `authorAccountId` (the
author's account principal rendered as text), `authorPersonId` (the canonical
Person id of the author), `title` (`\"\"` when absent), `body`, `postType`
(`\"General\"`/`\"Announcement\"`/`\"FamilyQuestion\"`/`\"ResearchHistory\"`/`\"PhotoIdentification\"`/`\"Recipe\"`/`\"ReunionEvent\"`/`\"Memorial\"`/`\"Other\"`),
`relatedPersonCount` (`Nat`, the number of related member ids),
`linkedMediaCount` (`Nat`, the number of linked Archive/media ids), `createdAt`
(`Int`, nanoseconds since epoch), `updatedAt` (`Int`), `status`
(`\"Active\"`/`\"Archived\"`), and `privacyScope` (`\"FamilyOnly\"`). The
array-valued fields (`relatedPersonIds`, `linkedMediaIds`) are exposed as counts
since OQL has no array value type. `boardReply` rows (primary key `replyId`, a
`Nat`) carry `postId`, `authorAccountId` (principal text), `authorPersonId`,
`body`, and `createdAt` (`Int`).

The messaging entities are flattened views of the corresponding records.
`conversation` rows (primary key `conversationId`, a `Nat`) carry
`participantCount` (`Nat`, the number of participant account ids), `createdAt`
(`Int`), and `updatedAt` (`Int`). The array-valued fields
(`participantAccountIds`, `participantPersonIds`) are exposed as counts since
OQL has no array value type. `message` rows (primary key `messageId`, a `Nat`)
carry `conversationId`, `senderAccountId` (principal text), `senderPersonId`,
`body`, `createdAt` (`Int`), `readAt` (`Int`, `0` when unread), and `status`
(`\"Sent\"`/`\"Blocked\"`). `block` rows (primary key `key`, the composite
`\"<blockerAccountId>:<blockedAccountId>\"`) carry `blockerAccountId` (principal
text), `blockedAccountId` (principal text), and `createdAt` (`Int`). `report`
rows (primary key `reportId`, a `Nat`) carry `reportingAccountId` (principal
text), `reportedMessageId` (`Nat`), `reason`, `createdAt` (`Int`), and `status`
(`\"Pending\"`/`\"Reviewed\"`/`\"Dismissed\"`).

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
the live caller. Most exposed entities — `photo`, `archiveItem`, `profile`,
`claim`, `relationshipRequest`, `confirmedRelationship`, `notification`,
`account`, `steward`, `successor`, `removalRequest`, `auditLog`,
`mergeConflict`, `archivedProfile`, `dismissedPair`, `story`, `mystery`,
`mysteryContribution`, `recipe`, `boardPost`, `boardReply`, `block`, and
`report` — are declared `.controllerOnly()`, so only the platform controller can read their
rows through `schema()`/`execute()`; end users do not read them directly. This
keeps the family, archive, governance, board, block, and report metadata private
to the platform while still letting the Data Intelligence agent answer over it.
The `conversation` entity is declared `.controllerOrScoped()` with a
participant-only visibility rule: the platform controller reads all rows, while
a signed-in caller reads only the conversations they participate in. The
`message` entity is declared `.scopedPerUser()` with a participant-only
visibility rule, so a signed-in caller reads only the messages in conversations
they participate in and the platform controller/agent is blind to message
content. This preserves private-messaging privacy — no user can read another
user's private conversations or messages through OQL, and no private message
content is steward-readable unless reported.

The archive methods gate on sign-in and role. `submitArchiveItem` requires a
signed-in (non-anonymous) caller and traps with `\"Sign-in required to submit an
archive item\"` for an anonymous caller. It also validates the Oral History
speaker: it traps with `\"A primary speaker is required for Oral History
items\"` when `classification == #OralHistory` and `primarySpeaker` is `null`,
and with `\"A primary speaker is only allowed on Oral History items\"` when
`classification == #Standard` and `primarySpeaker` is not `null`.
`listPendingArchiveItems`,
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

The Family Stories and Family Mysteries methods gate on sign-in and role.
`submitStory` and `submitMysteryContribution` require a signed-in (non-anonymous)
caller and trap with `\"Sign-in required to submit a story\"` / `\"Sign-in
required to contribute to a mystery\"` for an anonymous caller. The Family
Steward methods — `listPendingStories`, `approveStory`, `rejectStory`,
`addCanonicalStory`, `updateCanonicalStory`, `listPendingMysteryContributions`,
`reviewMysteryContribution`, `createCanonicalMystery`,
`updateCanonicalMystery`, and `markMysteryResolved` — are admin-only and trap
with `\"Unauthorized: Only Family Stewards can ...\"` when the caller is not an
admin. `listApprovedStories`, `listMysteries`, and `listTimelineEvents` are
readable by any caller (respecting the existing privacy conventions).

The Family Recipes methods gate on sign-in and role. `submitRecipe` requires a
signed-in (non-anonymous) caller and traps with `\"Sign-in required to submit a
recipe\"` for an anonymous caller. The Family Steward methods —
`listPendingRecipes`, `approveRecipe`, `rejectRecipe`, and `publishRecipe` — are
admin-only and trap with `\"Unauthorized: Only Family Stewards can ...\"` when
the caller is not an admin. `listApprovedRecipes`, `getRecipe`, and
`listRecipesForPerson` are readable by any caller (respecting the existing
privacy conventions).

The Family Message Board methods gate on sign-in and approved-membership. The
member methods — `listBoardPosts`, `getBoardPost`, `createBoardPost`,
`updateBoardPost`, `archiveBoardPost`, `listBoardReplies`, and `addBoardReply` —
require a signed-in approved family member and trap with `\"Unauthorized: You
must be signed in\"` for an anonymous caller and `\"Unauthorized: Only approved
family members can access the message board\"` when the caller is not an
approved member. `updateBoardPost` additionally requires the caller to be the
post author (trapping with `\"Unauthorized: Only the post author can edit this
post\"`), and `archiveBoardPost` requires the author or a Family Steward
(trapping with `\"Unauthorized: Only the post author or a Family Steward can
archive this post\"`). The steward methods — `restoreBoardPost` and
`removeBoardReply` — are admin-only and trap with `\"Unauthorized: Only Family
Stewards can perform this action\"` when the caller is not an admin. Board
governance actions (`archiveBoardPost`, `restoreBoardPost`, `removeBoardReply`)
record audit entries in the steward-only audit log.

The Private Messaging methods gate on sign-in and approved-membership. The
member methods — `listConversations`, `getConversation`, `sendMessage`,
`markConversationRead`, `blockUser`, `unblockUser`, `listBlockedUsers`, and
`reportMessage` — require a signed-in approved family member and trap with
`\"Unauthorized: You must be signed in\"` for an anonymous caller and
`\"Unauthorized: Only approved family members can use private messaging\"` when
the caller is not an approved member. `getConversation` returns `null` (it does
not trap) when the caller is not a participant, and `markConversationRead` traps
with `\"Unauthorized: Only participants can mark a conversation read\"` when the
caller is not a participant. `reportMessage` traps with `\"Unauthorized: Only
conversation participants can report a message\"` when the caller is not a
participant of the message's conversation. The steward methods — `listReports`,
`reviewReport`, and `getReportedMessage` — are admin-only and trap with
`\"Unauthorized: Only Family Stewards can perform this action\"` when the caller
is not an admin. Stewards cannot browse arbitrary private conversations; they see
reported message content only when a report is filed (via `getReportedMessage`).

The Pending Contributions method `getPendingContributionsCount` is Family
Steward only: it traps with `\"Unauthorized: You must be signed in\"` for an
anonymous caller and `\"Unauthorized: Only Family Stewards can view the pending
contributions count\"` when the caller is not an admin.

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
- `ArchiveItemClassification` is a variant: `#Standard` or `#OralHistory`. It is
  distinct from `itemType` because Oral History applies to both oral-history
  video and audio-only oral history.
- `OralHistorySpeaker` fields: `personId` (`?Text`, a link to the canonical
  Person record when that person exists, `null` otherwise) and `name` (`Text`,
  the display name of the speaker). Exactly one primary speaker is allowed for
  MVP; it is required when `classification == #OralHistory` and forbidden when
  `classification == #Standard`.
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
  `#ProfileClaimReviewed`, `#RelationshipRequested`, `#RelationshipReviewed`,
  `#BoardReply`, `#BoardMention`, or `#NewMessage`.
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
- `StoryId`, `MysteryId`, and `MysteryContributionId` are `Nat`, unique across
  their respective collections.
- `EvidenceStatus` is a variant: `#Documented`, `#FamilyHistory`,
  `#PersonalMemory`, or `#Unresolved`. Family History and Personal Memory are
  never presented as documented fact — the `evidenceStatus` field carries this
  distinction.
- `StoryStatus` is a variant: `#Pending`, `#Approved`, or `#Rejected`.
- `Story` fields: `id` (`Nat`), `title` (`Text`), `storyText` (`Text`),
  `relatedMemberIds` (`[Text]`, existing person ids — never creates duplicate
  Person records), `era` (`?Text`, approximate date/era as free text), `year`
  (`?Nat`), `location` (`?Text`), `contributor` (`Principal`), `evidenceStatus`,
  `relatedArchiveItemIds` (`[Nat]`), `createdAt` (`Int`, nanoseconds since
  epoch), `updatedAt` (`Int`), and `status`.
- `MysteryStatus` is a variant: `#Open`, `#Researching`, `#PartiallyResolved`,
  or `#Resolved`.
- `MysteryContributionType` is a variant: `#Note`, `#Memory`, `#Lead`, or
  `#Source`.
- `MysteryContributionStatus` is a variant: `#Pending`, `#Approved`, or
  `#Rejected`.
- `Resolution` fields: `summary` (`Text`), `supportingEvidence` (`[Text]`),
  `resolvedAt` (`Int`, nanoseconds since epoch), and `resolvedBy` (`Principal`).
- `Mystery` fields: `id` (`Nat`), `title` (`Text`), `description` (`Text`),
  `relatedMemberIds` (`[Text]`), `relatedBranchId` (`?Text`), `knownFacts`
  (`[Text]`), `possibilities` (`[Text]`, competing theories/possibilities kept
  separate from known facts), `relatedSourceIds` (`[Nat]`),
  `relatedArchiveItemIds` (`[Nat]`), `status`, `contributor` (`Principal`),
  `createdAt` (`Int`), `updatedAt` (`Int`), and `resolution` (`?Resolution`,
  `null` until resolved).
- `MysteryContribution` fields: `id` (`Nat`), `mysteryId` (`Nat`),
  `contributionType`, `text` (`Text`), `contributor` (`Principal`), `status`,
  `createdAt` (`Int`), `reviewedBy` (`?Principal`, `null` when unreviewed), and
  `reviewedAt` (`?Int`, `null` when unreviewed).
- `RecipeId` is a `Nat`, unique across the whole recipe collection.
- `RecipeStatus` is a variant: `#Pending`, `#Approved`, `#Rejected`, or
  `#Archived`.
- `Recipe` fields: `recipeId` (`Nat`), `title` (`Text`), `shortDescription`
  (`Text`), `originatingPersonId` (`Text`, the single primary originating family
  member linked to a canonical Person record — no Person data is duplicated
  inside the Recipe), `relatedPersonIds` (`[Text]`, related family members, each
  a canonical Person id), `contributorAccountId` (`Principal`, the signed-in
  account that contributed the recipe), `era` (`?Text`, approximate era as free
  text), `year` (`?Nat`), `location` (`?Text`), `familyBranch` (`?Text`),
  `ingredients` (`[Text]`), `instructions` (`Text`), `familyStory` (`?Text`),
  `tags` (`[Text]`), `privacyLevel` (`#Public`/`#FamilyOnly`/`#Private`),
  `evidenceStatus` (`#Documented`/`#FamilyHistory`/`#PersonalMemory`/`#Unresolved`),
  `linkedMediaIds` (`[Nat]`, references to canonical Archive/media records — no
  media is duplicated), `status` (`RecipeStatus`), `createdAt` (`Int`,
  nanoseconds since epoch), `updatedAt` (`Int`), and the reserved future-ready
  fields `ocrText` (`?Text`), `transcript` (`?Text`), `extractedIngredients`
  (`?[Text]`), and `aiDerivedText` (`?Text`) — all `null` and not populated by
  any logic yet, kept separate from the original source material.
- `PostId` and `ReplyId` are `Nat`, unique across their respective collections.
- `PostType` is a variant: `#General`, `#Announcement`, `#FamilyQuestion`,
  `#ResearchHistory`, `#PhotoIdentification`, `#Recipe`, `#ReunionEvent`,
  `#Memorial`, or `#Other`.
- `PostStatus` is a variant: `#Active` or `#Archived`.
- `PrivacyScope` is a variant: `#FamilyOnly` (every board post is Family Only for
  MVP).
- `Post` fields: `postId` (`Nat`), `authorAccountId` (`Principal`, the stable
  account id used for authorization — never exposed to the UI), `authorPersonId`
  (`Text`, the canonical Person id used to render the Person Profile identity),
  `title` (`?Text`), `body` (`Text`), `postType`, `relatedPersonIds` (`[Text]`,
  canonical Person ids), `linkedMediaIds` (`[Nat]`, references to canonical
  Archive/media records), `createdAt` (`Int`, nanoseconds since epoch),
  `updatedAt` (`Int`), `status`, and `privacyScope`.
- `Reply` fields: `replyId` (`Nat`), `postId` (`Nat`), `authorAccountId`
  (`Principal`), `authorPersonId` (`Text`), `body` (`Text`), and `createdAt`
  (`Int`, nanoseconds since epoch).
- `BoardError` is a variant: `#NotSignedIn`, `#NotApprovedMember`,
  `#PostNotFound`, `#NotAuthor`, or `#NotSteward`.
- `ConversationId`, `MessageId`, and `ReportId` are `Nat`, unique across their
  respective collections.
- `Conversation` fields: `conversationId` (`Nat`), `participantAccountIds`
  (`[Principal]`, exactly two for a 1:1 conversation), `participantPersonIds`
  (`[Text]`, the canonical Person ids of the two participants), `createdAt`
  (`Int`), and `updatedAt` (`Int`).
- `MessageStatus` is a variant: `#Sent` or `#Blocked` (a send attempt prevented
  because the recipient blocked the sender).
- `Message` fields: `messageId` (`Nat`), `conversationId` (`Nat`),
  `senderAccountId` (`Principal`), `senderPersonId` (`Text`), `body` (`Text`),
  `createdAt` (`Int`), `readAt` (`?Int`, `null` until read), and `status`.
- `Block` fields: `blockerAccountId` (`Principal`), `blockedAccountId`
  (`Principal`), and `createdAt` (`Int`).
- `ReportStatus` is a variant: `#Pending`, `#Reviewed`, or `#Dismissed`.
- `Report` fields: `reportId` (`Nat`), `reportingAccountId` (`Principal`),
  `reportedMessageId` (`MessageId`), `reason` (`Text`), `createdAt` (`Int`), and
  `status`.
- `ConversationSummary` fields: `conversationId` (`Nat`), `otherPersonId`
  (`Text`), `otherDisplayName` (`Text`), `latestMessagePreview` (`Text`),
  `latestMessageAt` (`Int`), and `unreadCount` (`Nat`).
- `ConversationView` fields: `conversationId` (`Nat`), `participantPersonIds`
  (`[Text]`), `participantDisplayNames` (`[Text]`), and `messages` (`[Message]`).
- `ReportedMessageView` fields: `report` (`Report`) and `message` (`Message`).
- `MessageError` is a variant: `#NotSignedIn`, `#NotApprovedMember`,
  `#RecipientNotFound`, `#RecipientNotClaimed`, `#RecipientArchived`,
  `#CannotMessageSelf`, `#BlockedByRecipient`, `#NotParticipant`, or
  `#ConversationNotFound`.
- `TimelineEventType` is a variant: `#Birth`, `#Death`, `#Marriage`,
  `#FamilyEvent`, `#Migration`, `#MilitaryService`, `#CensusDocument`, `#Story`,
  `#PhotoDocument`, `#Location`, or `#Mystery`.
- `TimelineLinkTarget` is a variant: `#Person : Text`, `#Story : Nat`,
  `#ArchiveItem : Nat`, or `#Mystery : Nat`.
- `TimelineEvent` fields: `id` (`Text`, a stable per-source id such as
  `\"person-<personId>-<index>\"`, `\"archive-<id>\"`, `\"story-<id>\"`, or
  `\"mystery-<id>\"`), `eventType`, `title` (`Text`), `description` (`Text`),
  `era` (`?Text`), `year` (`?Nat`), `evidenceStatus`, and `linkTarget`.

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
`listApprovedArchiveItems` to observe the current state. An Oral History item
(`classification == #OralHistory`) must carry exactly one primary speaker at
submission time; the speaker is fixed at submission and does not change through
the approval lifecycle.

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

Family Stories follow a submit → approve/reject lifecycle. `submitStory` stores
the story in `#Pending` state. A Family Steward then calls `approveStory` or
`rejectStory` to move it to `#Approved` or `#Rejected`. Only `#Approved` stories
are returned by `listApprovedStories` (the Family Stories view). Stewards add
canonical stories directly via `addCanonicalStory` (already `#Approved`) and edit
them via `updateCanonicalStory`. There is no async job to poll; the frontend can
call `listPendingStories` (steward) or `listApprovedStories` to observe the
current state.

Family Mysteries follow a steward-driven lifecycle. Stewards create canonical
mysteries via `createCanonicalMystery` and edit them via
`updateCanonicalMystery`. Family members contribute a note, memory, possible
lead, or source reference via `submitMysteryContribution`, which stores the
contribution in `#Pending` state; a Family Steward then calls
`reviewMysteryContribution` to approve or reject it before it alters the
canonical mystery record. A mystery's `status` moves through `#Open`,
`#Researching`, `#PartiallyResolved`, and `#Resolved`. Marking a mystery
`#Resolved` via `markMysteryResolved` records a resolution summary and supporting
evidence while preserving the prior theories/history — the research trail is
never deleted. There is no async job to poll; the frontend can call
`listMysteries` (viewers) or `listPendingMysteryContributions` (steward) to
observe the current state.

Family Recipes follow a submit → approve/reject lifecycle. `submitRecipe` stores
the recipe in `#Pending` state. A Family Steward then calls `approveRecipe` or
`rejectRecipe` to move it to `#Approved` or `#Rejected`. Only `#Approved`
recipes are returned by `listApprovedRecipes` (the Family Recipes view) and by
`listRecipesForPerson` (the per-person view). Stewards publish canonical recipes
directly via `publishRecipe` (already `#Approved`). Approval transitions the
same canonical Recipe record — it never creates a second Recipe. There is no
async job to poll; the frontend can call `listPendingRecipes` (steward),
`listApprovedRecipes`, `getRecipe`, or `listRecipesForPerson` to observe the
current state.

Travel Through Time is a read-only chronological view. `listTimelineEvents`
aggregates events from existing canonical data only — PersonProfile timeline
entries, ArchiveItem year/era, Story era/date, and Mystery records. Empty eras
are never fabricated; only actual stored data is surfaced. Each event carries an
evidence badge and a link target so clicking it opens the relevant Person
Profile, Story, Archive Item, or Mystery.

Board posts follow an active → archived lifecycle. `createBoardPost` stores the
post `#Active`. `archiveBoardPost` (author or Family Steward) moves it to
`#Archived`, hiding it from `listBoardPosts`/`getBoardPost`; `restoreBoardPost`
(Family Steward) returns it to `#Active`. Replies are one-level and shown
chronologically under each post; `removeBoardReply` (Family Steward) removes a
reply. There is no async job to poll; the frontend can call `listBoardPosts`,
`getBoardPost`, or `listBoardReplies` to observe the current state. Board
governance actions record audit entries readable only by Family Stewards.

Private messaging is synchronous and conversation-based. `sendMessage` reuses the
existing canonical 1:1 conversation for the account pair when one exists, so the
same two users always share one conversation. `listConversations` returns the
caller's inbox (newest activity first) with an unread count; `getConversation`
returns the full history for a participant. `markConversationRead` sets `readAt`
on the caller's incoming messages, which clears the unread badge. Blocking
(`blockUser`) prevents the blocked user from sending new messages to the blocker
(`sendMessage` returns `#err(#BlockedByRecipient)` and stores nothing);
`unblockUser` re-enables messaging. Reports (`reportMessage`) are stored
`#Pending`; a Family Steward reviews them via `reviewReport` and sees the
reported message content via `getReportedMessage`. There is no async job to
poll; the frontend can call `listConversations`, `getConversation`,
`listBlockedUsers`, or `listReports` (steward) to observe the current state.

The Pending Contributions count is derived on demand. `getPendingContributionsCount`
counts all current pending review items (pending archive/media, pending recipes,
pending stories, and pending mystery contributions) from canonical pending data.
It increments when a new pending item is submitted and decrements when an item is
approved or rejected, automatically — there is no separate counter to maintain.
The frontend calls it to render the Steward-facing Pending Contributions badge
and hides the badge when the count is `0`.

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
  item. For an Oral History item the `primarySpeaker` is validated at
  submission: it must be present (exactly one) when `classification ==
  #OralHistory` and must be `null` when `classification == #Standard`; a
  violation traps and stores nothing.
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
- `submitStory` is not idempotent: each call stores a new story with a fresh id.
  Retrying a submission that actually succeeded creates a duplicate story.
- `approveStory` and `rejectStory` are idempotent: approving or rejecting an
  already-approved or already-rejected (or nonexistent) story returns `null` and
  changes nothing. They only transition stories currently in `#Pending` state.
  Neither is destructive — the story is preserved in either terminal state.
- `addCanonicalStory` is not idempotent: each call stores a new canonical story
  with a fresh id. `updateCanonicalStory` is idempotent: applying the same edit
  again yields the same story, preserving the original `contributor` and
  `createdAt`.
- `submitMysteryContribution` is not idempotent: each call stores a new
  contribution with a fresh id. Retrying a submission that actually succeeded
  creates a duplicate contribution.
- `reviewMysteryContribution` is idempotent: reviewing an already-reviewed (or
  nonexistent) contribution returns `null` and changes nothing. It only
  transitions contributions currently in `#Pending` state.
- `createCanonicalMystery` is not idempotent: each call stores a new mystery
  with a fresh id. `updateCanonicalMystery` is idempotent: applying the same edit
  again yields the same mystery, preserving the original `contributor`,
  `createdAt`, and any existing `resolution`.
- `markMysteryResolved` is idempotent: marking an already-resolved (or
  nonexistent) mystery resolved returns `null` and changes nothing. It preserves
  the prior theories/history and never deletes the research trail.
- `submitRecipe` is not idempotent: each call stores a new recipe with a fresh
  id. Retrying a submission that actually succeeded creates a duplicate recipe.
  It validates `originatingPersonId` at submission: it traps with `\"Originating
  family member not found\"` when that person is not tracked, and stores nothing.
- `approveRecipe` and `rejectRecipe` are idempotent: approving or rejecting an
  already-approved or already-rejected (or nonexistent) recipe returns `null`
  and changes nothing. They only transition recipes currently in `#Pending`
  state. Neither is destructive — the recipe and its linked media references are
  preserved in either terminal state, and approval never creates a second Recipe.
- `publishRecipe` is not idempotent: each call stores a new canonical recipe with
  a fresh id, already in `#Approved` state.
- `createBoardPost` is not idempotent: each call stores a new post with a fresh
  id. Retrying a submission that actually succeeded creates a duplicate post.
- `updateBoardPost` is idempotent: applying the same edit again yields the same
  post. It only ever edits the caller's own post.
- `archiveBoardPost` is idempotent: archiving an already-archived (or
  nonexistent) post returns `null` and changes nothing. It is not destructive —
  the post is retained and can be restored. `restoreBoardPost` is idempotent:
  restoring a non-archived (or nonexistent) post returns `null` and changes
  nothing.
- `addBoardReply` is not idempotent: each call adds a new reply with a fresh id.
  Retrying a reply that actually succeeded creates a duplicate reply.
- `removeBoardReply` is idempotent: removing an already-removed (or nonexistent)
  reply returns `null` and changes nothing. It is destructive and irreversible —
  the reply is removed from the board.
- `sendMessage` is not idempotent: each call stores a new message with a fresh
  id. Retrying a send that actually succeeded creates a duplicate message. It
  reuses the existing canonical 1:1 conversation for the account pair, so it
  never creates a second conversation. When the recipient has blocked the sender
  it returns `#err(#BlockedByRecipient)` and stores nothing.
- `markConversationRead` is idempotent: marking an already-read conversation read
  is a no-op.
- `blockUser` is idempotent: blocking an already-blocked account is a no-op.
  `unblockUser` is idempotent: unblocking a non-blocked account is a no-op.
- `reportMessage` is not idempotent: each call stores a new report with a fresh
  id. Retrying a report that actually succeeded creates a duplicate report.
- `reviewReport` is idempotent: reviewing an already-reviewed (or nonexistent)
  report returns `null` and changes nothing.
- `getPendingContributionsCount` is a read-only query with no side effects; it is
  always idempotent.

## Errors, traps, limits, and gotchas

- `getCallerUserRole` and `isCallerAdmin` trap with `\"User is not registered\"`
  for a signed-in but unregistered caller.
- `assignCallerUserRole` traps with `\"Unauthorized: Only admins can assign
  user roles\"` when the caller is not an admin.
- `setProfilePhoto` returns `null` (it does not trap) when the photo id does
  not exist in the person's gallery.
- `submitArchiveItem` traps with `\"A primary speaker is required for Oral
  History items\"` when `classification == #OralHistory` and `primarySpeaker` is
  `null`, and with `\"A primary speaker is only allowed on Oral History items\"`
  when `classification == #Standard` and `primarySpeaker` is not `null`. These
  traps store nothing, so a rejected submission leaves no partial item. The
  speaker field is hidden in the UI for media not classified as Oral History,
  but the backend still enforces the invariant regardless of the client.
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
  existing account —   `bindAuthMethod` creates it on first use.
- `submitStory` traps with `\"Sign-in required to submit a story\"` for an
  anonymous caller, and `submitMysteryContribution` traps with `\"Sign-in
  required to contribute to a mystery\"` for an anonymous caller. The Family
  Steward family-history methods trap with `\"Unauthorized: Only Family Stewards
  can ...\"` when the caller is not an admin.
- `approveStory`, `rejectStory`, `updateCanonicalStory`,
  `reviewMysteryContribution`, `updateCanonicalMystery`, and
  `markMysteryResolved` return `null` (they do not trap) when the target id does
  not exist or is not in the expected state.
- Stories and Mysteries reference existing person ids and archive item ids; they
  never create duplicate Person records or duplicate source files.
- `submitRecipe` traps with `\"Sign-in required to submit a recipe\"` for an
  anonymous caller, and with `\"Originating family member not found\"` when
  `originatingPersonId` does not reference a tracked canonical Person record.
  `publishRecipe` traps with `\"Unauthorized: Only Family Stewards can publish
  recipes\"` when the caller is not an admin, and with `\"Originating family
  member not found\"` when the originating person is not tracked. The Family
  Steward recipe methods (`listPendingRecipes`, `approveRecipe`, `rejectRecipe`,
  `publishRecipe`) trap with `\"Unauthorized: Only Family Stewards can ...\"`
  when the caller is not an admin.
- `approveRecipe`, `rejectRecipe`, and `getRecipe` return `null` (they do not
  trap) when the target id does not exist or is not in the expected state.
- Recipes reference canonical Person records by `personId` only and canonical
  Archive/media records by id only; they never create duplicate Person records
  or duplicate media files. One uploaded media file remains one canonical
  archive record even when linked to multiple recipes or profiles. The reserved
  future-ready fields (`ocrText`, `transcript`, `extractedIngredients`,
  `aiDerivedText`) are not populated by any logic yet; original source material
  is always preserved separately from any future AI-derived text.
- The OQL `recipe` entity is a flattened view: enumerated variants render as
  their tag text, optional fields render as empty text or `0`, and the
  array-valued fields (`relatedPersonIds`, `ingredients`, `tags`,
  `linkedMediaIds`) are exposed as counts since OQL has no array value type.
- The board and messaging methods gate on approved family membership. The member
  board methods trap with `\"Unauthorized: You must be signed in\"` for an
  anonymous caller and `\"Unauthorized: Only approved family members can access
  the message board\"` when the caller is not an approved member. The member
  messaging methods trap with `\"Unauthorized: You must be signed in\"` for an
  anonymous caller and `\"Unauthorized: Only approved family members can use
  private messaging\"` when the caller is not an approved member. The steward
  board/messaging methods (`restoreBoardPost`, `removeBoardReply`, `listReports`,
  `reviewReport`, `getReportedMessage`) and `getPendingContributionsCount` trap
  with `\"Unauthorized: Only Family Stewards can perform this action\"` (or the
  equivalent pending-count message) when the caller is not an admin.
- `getBoardPost` returns `null` (it does not trap) when the post does not exist
  or is archived. `updateBoardPost` returns `null` when the post does not exist
  and traps with `\"Unauthorized: Only the post author can edit this post\"` when
  the caller is not the author. `archiveBoardPost` returns `null` when the post
  does not exist and traps with `\"Unauthorized: Only the post author or a Family
  Steward can archive this post\"` when the caller is neither. `restoreBoardPost`
  and `removeBoardReply` return `null` when the target does not exist.
- `addBoardReply` traps with `\"Post not found\"` when the post does not exist or
  is archived. `getConversation` returns `null` (it does not trap) when the
  conversation does not exist or the caller is not a participant.
  `markConversationRead` traps with `\"Conversation not found\"` when the
  conversation does not exist and `\"Unauthorized: Only participants can mark a
  conversation read\"` when the caller is not a participant. `reportMessage`
  traps with `\"Message not found\"`, `\"Conversation not found\"`, or
  `\"Unauthorized: Only conversation participants can report a message\"` as
  appropriate. `reviewReport` and `getReportedMessage` return `null` when the
  report (or message) does not exist.
- `sendMessage` returns `#err(#BlockedByRecipient)` when the recipient has
  blocked the sender; no message is stored. It returns `#err(#RecipientArchived)`
  for an archived or deceased recipient, `#err(#RecipientNotClaimed)` for an
  unclaimed profile, `#err(#CannotMessageSelf)` when messaging oneself, and
  `#err(#RecipientNotFound)` when the person is not tracked.
- Board posts and replies reference canonical Person ids (`authorPersonId`,
  `relatedPersonIds`) and canonical Archive/media ids (`linkedMediaIds`) only;
  they never create duplicate Person records or duplicate media files. Raw
  account ids are stored for authorization but never exposed to the UI — the
  frontend renders the canonical Person Profile identity.
- The OQL board and messaging entities are flattened views: enumerated variants
  render as their tag text, optional fields render as empty text or `0`, and the
  array-valued fields (`relatedPersonIds`, `linkedMediaIds`,
  `participantAccountIds`, `participantPersonIds`) are exposed as counts since
  OQL has no array value type. The `conversation` entity is
  `.controllerOrScoped()` and the `message` entity is `.scopedPerUser()`, both
  with a participant-only rule, so a signed-in caller reads only their own
  conversations/messages through OQL and the platform controller/agent is blind
  to message content; the `block` entity's
  primary key is the composite `key` (`\"<blocker>:<blocked>\"`) because a block
  is a pair with no single unique id.
"
  };
};
