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
display metadata. The backend also exposes the persisted metadata through the
Object Query Layer (OQL) and provides the standard access-control and Internet
Identity sign-in surface.

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

### Object Query Layer (OQL)

- `schema() : async Text` — query. Returns a JSON catalogue of the exposed
  entities and their fields.
- `execute(qJson : Text) : async Result` — query. Runs a JSON-encoded OQL query
  and returns matching rows.

The exposed entities are `photo` and `archiveItem`, both declared
`.controllerOnly()` (see the authorization section). `photo` rows are flattened
photo metadata: `key` (globally-unique \"<personId>:<id>\", the primary key),
`personId`, `id`, `filename`, `mimeType`, `uploadedAt` (nanoseconds since epoch,
`Int`), `uploadedBy` (the uploading principal, rendered as text), and
`isProfilePhoto` (`Bool`). `archiveItem` rows are flattened archive metadata:
`id` (the primary key), `title`, `itemType`, `era`, `year` (optional year, `0`
when absent), `contributor` (the submitting principal, rendered as text),
`sourceStatus`, `privacyLevel`, `status`, and `createdAt` (nanoseconds since
epoch, `Int`). The raw blob bytes are not exposed.

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
the live caller. Both exposed entities — `photo` and `archiveItem` — are
declared `.controllerOnly()`, so only the platform controller can read their
rows through `schema()`/`execute()`; end users do not read them directly. This
keeps the archive metadata private to the platform while still letting the Data
Intelligence agent answer over it.

The archive methods gate on sign-in and role. `submitArchiveItem` requires a
signed-in (non-anonymous) caller and traps with `\"Sign-in required to submit an
archive item\"` for an anonymous caller. `listPendingArchiveItems`,
`approveArchiveItem`, and `rejectArchiveItem` are admin-only and trap with
`\"Unauthorized: Only admins can ...\"` when the caller is not an admin.
`listApprovedArchiveItems` is readable by any caller.

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

## Units and encodings

- `PersonId` is a `Text` identifier of a person in the family tree (e.g.
  `\"julia\"`, `\"clayton\"`).
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
"
  };
};
