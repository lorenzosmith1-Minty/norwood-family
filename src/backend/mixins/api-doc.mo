mixin () {
  public query func getApiDoc() : async Text {
    "# Norwood Family — Backend API

## Purpose

The backend stores uploaded photos for family members and contributed archive
items. Each person (identified by a `PersonId`, e.g. `\"julia\"`,
`\"clayton\"`) has a gallery of uploaded photos, one of which may be selected as
that person's profile photo. The Family Archive stores contributed items
(photos, documents, audio, video, written stories/notes, research, work or
business material, and other) that wait for Family Steward approval before
appearing in
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
use. Family Steward authority is the Norwood Steward record: a caller is a
Family Steward only when they match an ACTIVE persisted `StewardRecord` in the
`stewards` list whose `familyId` is the family being checked. It is explicitly
distinct from the platform admin role (`AccessControl.isAdmin`), which carries
zero family-governance power. Family Stewards manage steward succession, safe
profile removal/archive/restore, duplicate-profile review and merge,
relationship administration, and a steward-only governance audit log. A
successor steward is a designation only until a current steward explicitly
activates them; there is no automatic stewardship transfer based on inactivity.
Profile removal is never a simple destructive delete — it flows through a
steward-reviewed request or an explicit archive, and permanent deletion is
allowed only for empty error-created profiles with explicit confirmation.

Steward authority is bootstrapped once per family. While a family has no active
Steward, any signed-in account may claim that family's Steward role via
`claimSteward`; no approved family profile is required. Once that family has any
active Steward the claim permanently refuses. The public Steward authority
surface is `isCallerSteward`/`hasActiveSteward` (query) and `claimSteward`
(update); these operate on the default family (`\"norwood\"`).

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

### Family tenancy

- `getFamily(familyId : Text) : async ?Family` — query. Returns the family with
  the given id, or `null` when it is not tracked. Read-only: it never creates a
  family. The single existing Norwood family has id `\"norwood\"` and display
  name `\"Norwood\"`; it is created once by the migration chain and is never
  duplicated or reset by later upgrades.
  A `Family` carries `id`, `displayName`, `createdAt`, `createdBy`, and
  `status` (`#active` or `#archived`).
- `createFamilyWithFounder(displayName : Text, input : FounderProfileInput, idempotencyKey : Text) : async Result<FamilyCreationResult, FamilyCreationError>` —
  update. The zero-to-family creation foundation: it creates a brand-new
  `Family`, the founder's first `PersonProfile` inside that family, and an
  `#Active` `FamilyMembership` linking the authenticated caller to that founder
  profile — all in one atomic transaction. It intentionally does NOT assign
  Stewardship: no `StewardRecord` is created, and Steward selection happens in
  Onboarding Phase 1B-2. See the Family Creation section below for the full
  contract.

### Founding Steward onboarding

Every newly created family begins the founding-Steward decision in the
`#Undecided` onboarding state. The family creator first creates the Family, the
founder's `PersonProfile`, and an `#Active` `FamilyMembership`
(`createFamilyWithFounder`), then chooses one of two paths:

- **Accept Stewardship** — `acceptFoundingStewardship` creates an active
  `StewardRecord` for the founder and sets the onboarding state to
  `#FounderAccepted`.
- **Ask another member** — `nominateFoundingSteward` persists a `#Pending`
  nomination and ensures the founder holds a temporary founding `StewardRecord`,
  so the family is never left with zero active Stewards. The onboarding state
  becomes `#NominationPending`.

The onboarding state is PROGRESS TRACKING ONLY. `StewardRecord` remains the
single source of actual Steward authority; the onboarding state never grants or
removes authority by itself. A `StewardRecord` created by this onboarding flow
carries `founding = true` as a role-context marker (the founder's temporary
founding record); a nominee who accepts becomes a full Steward with
`founding = false`. The flag never changes authority — a founding Steward is a
full active Steward exactly like any other. The default Norwood family is never
initialized into this state and its onboarding logic is never re-run.

While a nomination is pending the founder retains full governance authority. The
nominee becomes an active Steward only after an authenticated acceptance
(`acceptFoundingStewardNomination`), which marks the nomination `#Accepted` and
advances the onboarding state to `#Transferred`. The founder is NOT
automatically removed from Stewardship on acceptance — both remain active
Stewards until a later explicit transfer/co-Steward/step-down decision using the
existing `removeStewardForFamily` safeguards. A nominee may decline
(`declineFoundingStewardNomination`) and the founder may cancel
(`cancelFoundingStewardNomination`); in both cases the founder remains Steward
and may nominate someone else. No email is sent and no invite-link redemption
exists in this phase.

- `getFoundingStewardStatusForFamily(familyId : Text) : async Result<FoundingStewardStatus, FoundingStewardError>` —
  query. Returns the family's onboarding state (`#Undecided`,
  `#FounderAccepted`, `#NominationPending`, or `#Transferred`) plus the active
  pending nomination when one exists. A family with no recorded state reads as
  `#Undecided`. Requires a signed-in caller; anonymous callers receive
  `#err(#NotSignedIn)`.
- `acceptFoundingStewardship(familyId : Text) : async Result<FoundingStewardStatus, FoundingStewardError>` —
  update. The family founder accepts founding Stewardship for their own family.
  Requires an authenticated caller who is the family's creator/founder, holds an
  `#Active` `FamilyMembership` in that family, and the family currently has no
  active Steward. Creates an active `StewardRecord` for the caller and sets the
  onboarding state to `#FounderAccepted`. Idempotent: a repeat call returns the
  current state and never creates a duplicate `StewardRecord`. It does not alter
  the caller's `PersonProfile` or `FamilyMembership`. Errors: `#NotSignedIn`,
  `#FamilyNotFound`, `#NotFounder`, `#NotAuthorized`, `#AlreadySteward`.
- `nominateFoundingSteward(familyId : Text, nomineePersonId : Text, nomineeEmail : ?Text) : async Result<FoundingStewardStatus, FoundingStewardError>` —
  update. The founder nominates a `PersonProfile` belonging to their own family
  as founding Steward, optionally supplying an email for an unclaimed nominee.
  Persists a `#Pending` nomination and ensures the founder holds a temporary
  founding `StewardRecord` so the family is never left with zero active
  Stewards. The nominee is NOT made Steward at nomination time and no email is
  sent. A nominee profile from another family is rejected with
  `#err(#NomineeNotInFamily)`. Errors: `#NotSignedIn`, `#FamilyNotFound`,
  `#NotFounder`, `#NomineeNotInFamily`, `#InvalidInput`.
- `acceptFoundingStewardNomination(familyId : Text, nominationId : Nat) : async Result<FoundingStewardStatus, FoundingStewardError>` —
  update. The authenticated nominee accepts a pending nomination. Requires the
  nominee's account to be linked to the nominated `PersonProfile` through an
  `#Active` `FamilyMembership` in that family, and the nomination to be
  `#Pending`. Activates a `StewardRecord` for the nominee, marks the nomination
  `#Accepted`, and advances the onboarding state to `#Transferred`. The founder
  is not automatically removed. Errors: `#NotSignedIn`, `#FamilyNotFound`,
  `#NominationNotFound`, `#InvalidTransition`, `#NomineeNotActiveMember`,
  `#NotAuthorized`.
- `declineFoundingStewardNomination(familyId : Text, nominationId : Nat) : async Result<FoundingStewardStatus, FoundingStewardError>` —
  update. The nominee declines a pending nomination. The nomination becomes
  `#Declined`, the founder remains Steward, and the founder may nominate someone
  else. Errors: `#NotSignedIn`, `#FamilyNotFound`, `#NominationNotFound`,
  `#InvalidTransition`, `#NotAuthorized`.
- `cancelFoundingStewardNomination(familyId : Text, nominationId : Nat) : async Result<FoundingStewardStatus, FoundingStewardError>` —
  update. The founder cancels a pending nomination. The nomination becomes
  `#Cancelled` and the founder remains Steward. Errors: `#NotSignedIn`,
  `#FamilyNotFound`, `#NotFounder`, `#NominationNotFound`, `#InvalidTransition`.

Nominee selection and display rely only on normal family-safe profile identity;
sensitive relationship context (adopted/foster/step/biological/guardian) is
never surfaced as a nomination label.

### Membership confirmation (trusted relative)

A pending new family member may be confirmed by an existing trusted relative.
The rule is:

    Pending Membership
      -> trusted relative confirms
      -> if no dispute: Active Membership
    If dispute:
      -> Steward Review
      -> Steward decides

A membership activated through relative confirmation remains challengeable by
another qualifying trusted relative: a later `#Disputed` decision moves the
membership from `#Active` to `#Suspended` and escalates the case to the Steward.
A Steward `#Approve` then restores the membership to `#Active`.

The confirmation case state maps to the membership-confirmation outcomes as
follows: `#AwaitingConfirmation` = Pending (no decision yet);
`#ApprovedByRelative` = Confirmed (at least one valid `#Confirmed` and no
`#Disputed`); `#RejectedByRelative` = Rejected/Disputed (a standalone
trusted-relative `#Disputed` with no `#Confirmed`, which never activates the
membership and leaves it pending/reviewable); `#StewardReviewRequired` =
NeedsStewardReview (conflicting `#Confirmed` + `#Disputed` evidence, which never
auto-activates); and `#ResolvedBySteward` = a later Steward outcome, which is NOT
equivalent to `#RejectedByRelative`. A standalone rejection is persisted
explicitly on the confirmation record as `rejectedByAccountId`/`rejectedAt`,
distinct from the Steward resolution record.

Relationship confirmation is a separate record from `FamilyMembership`,
`ProfileClaim`, `StewardRecord`, and `FamilyInvitation`. A confirmation records
only the SIMPLE relationship type used to qualify the confirmer
(Parent/Child, Sibling, SpousePartner); sensitive relationship context
(Biological/Adoptive/Foster/Step/Guardian) is never inspected or surfaced.
Confirmation state tracks resolution without duplicating
`FamilyMembership.status`: the membership remains the single source of truth for
whether an account is `#Pending`/`#Active`/`#Suspended`/`#Left`.

A confirmer must be authenticated, hold an `#Active` `FamilyMembership` in the
same family, and have a `#Confirmed` direct relationship to the pending person
in that family. The confirmer identity and the qualifying relationship are
derived server-side from the caller; a caller can never spoof another confirmer.
One confirmer holds at most one decision per membership (a repeat call safely
updates the existing decision in place). A single disputed response never
permanently removes the applicant and never deletes the membership; the Steward
is the final arbiter for split decisions.

- `confirmPendingMembership(familyId : Text, membershipId : Nat, decision : ConfirmationDecision) : async Result<MembershipConfirmation, MembershipConfirmationError>` —
  update. Records the signed-in caller's trusted-relative decision
  (`#Confirmed` or `#Disputed`) about a membership in `familyId`. A decision is
  accepted when the membership is `#Pending`, OR when it is `#Active` and the
  confirmation case shows it was activated through trusted-relative confirmation
  (`#ApprovedByRelative`) and has not been finally resolved by a Steward. A
  Steward-approved final membership, a `#Suspended` membership unrelated to this
  confirmation case, and a `#Left` membership are all rejected with
  `#err(#MembershipNotPending)`. The caller, the confirmer person, and the
  qualifying relationship are derived server-side. Rejects with
  `#err(#NotSignedIn)` for an anonymous caller, `#err(#MembershipNotFound)` when
  the membership does not belong to `familyId`, `#err(#NoActiveMembership)` when
  the caller has no `#Active` membership in `familyId`, `#err(#SelfConfirmation)`
  when the caller's own person is the pending person, and
  `#err(#NoQualifyingRelationship)` when no `#Confirmed` direct relationship
  exists between the caller's person and the pending person in that family. A
  repeat call from the same confirmer safely updates that confirmer's existing
  decision in place (at most one active decision per confirmer per membership).
  When the resulting state is `#ApprovedByRelative` (at least one `#Confirmed`
  and no `#Disputed`), a `#Pending` membership is activated through the existing
  secure `FamilyMembership` activation path, recording `approvedBy` (the
  confirming account) and `approvedAt` without bypassing profile-ownership
  invariants. If that activation fails, the case is NOT reported as
  `#ApprovedByRelative`; the decision is rolled back and
  `#err(#ActivationFailed)` is returned so the membership and confirmation state
  stay internally consistent. When a `#Disputed` and a `#Confirmed` conflict, the
  confirmation state becomes `#StewardReviewRequired`; a `#Pending` membership
  stays `#Pending`, and a relative-activated `#Active` membership is transitioned
  to `#Suspended`. When a `#Disputed` stands alone (no `#Confirmed`), the state
  becomes `#RejectedByRelative`: the membership is never activated, a `#Pending`
  membership stays `#Pending` and reviewable, and a relative-activated `#Active`
  membership is transitioned to `#Suspended`. The membership and every
  previously recorded confirmation are preserved.
- `resolveMembershipConfirmation(familyId : Text, membershipId : Nat, resolution : MembershipConfirmationResolution) : async Result<FamilyMembership, MembershipConfirmationError>` —
  update. Active Steward of `familyId` only; anonymous callers get
  `#err(#NotSignedIn)` and non-Stewards get `#err(#NotSteward)`. A Steward of
  another family cannot resolve this family's case. `#Approve` activates a
  `#Pending` membership through the existing secure activation path, and
  restores a membership suspended by this confirmation dispute back to `#Active`
  through a narrow, confirmation-scoped restore path (there is no unrestricted
  reactivation). Either way it persists a Steward resolution record, so the
  confirmation state reads `#ResolvedBySteward`. A real activation or restore
  failure is surfaced as `#err(#ActivationFailed)` rather than collapsed into
  `#MembershipNotPending`. `#Reject` leaves the membership non-`#Active` (a
  `#Pending` membership stays `#Pending`, a confirmation-suspended membership
  stays `#Suspended`, and a relative-activated `#Active` membership is
  suspended) and persists a Steward resolution record, so the state reads
  `#ResolvedBySteward` and the rejection is distinguishable from
  `#NeedsMoreInformation`. `#NeedsMoreInformation` persists no resolution
  record, keeping the membership `#Pending` or `#Suspended` as appropriate and
  the case open at `#StewardReviewRequired`. The membership is never deleted.
- `getMyMembershipConfirmationState(familyId : Text, membershipId : Nat) : async Result<MembershipConfirmationApplicantView, MembershipConfirmationError>` —
  query. Returns the REDACTED, applicant-safe confirmation view for
  `membershipId` in `familyId`: the derived case state
  (`#AwaitingConfirmation`, `#ApprovedByRelative`, `#RejectedByRelative`,
  `#StewardReviewRequired`, or `#ResolvedBySteward`), the caller's own decision
  and simple relationship label (Parent/Child, Sibling, SpousePartner), and
  timestamps. It never exposes a
  confirmer account principal, sensitive relationship context, private notes, or
  unrelated profile information. Allowed only when the caller is the pending
  membership's own account; anonymous callers get `#err(#NotSignedIn)` and any
  other caller gets `#err(#NotAuthorized)`. A confirmation in another family is
  never returned.
- `getMembershipConfirmationStateForSteward(familyId : Text, membershipId : Nat) : async Result<(MembershipConfirmationState, [MembershipConfirmation], ?MembershipConfirmationResolutionRecord), MembershipConfirmationError>` —
  query. Returns the FULL, Steward-authorized confirmation record for
  `membershipId` in `familyId`: the derived case state, every recorded decision,
  and any persisted Steward resolution. Allowed only when the caller is an
  active Steward of `familyId`; anonymous callers get `#err(#NotSignedIn)` and
  any other caller gets `#err(#NotAuthorized)`. Confirmations and resolutions
  from other families are never returned.
- `getMyConfirmationForMembership(familyId : Text, membershipId : Nat) : async Result<?MembershipConfirmation, MembershipConfirmationError>` —
  query. Returns the signed-in caller's own recorded decision for `membershipId`
  in `familyId`, or `null` when the caller has not decided. Anonymous callers get
  `#err(#NotSignedIn)`.
- `listMyEligibleMembershipConfirmationsForFamily(familyId : Text) : async Result<[EligibleMembershipConfirmationView], MembershipConfirmationError>` —
  query. Returns the privacy-safe list of confirmation requests the signed-in
  caller is currently eligible to act on in `familyId`. The caller is derived
  server-side; the frontend never passes a confirmer account, confirmer person,
  or relationship id. Eligibility is computed from the caller's own `#Active`
  `FamilyMembership` in `familyId`, the caller's `personId`, the confirmed
  relationships in `familyId`, and the target membership's state — never from
  notification message text. Returns only actionable cases: `#Pending`
  memberships awaiting trusted-relative confirmation, and `#Active` memberships
  approved by a relative that remain challengeable under the 1D-H rule. Excludes
  self-confirmation, cases the caller has already decided, other-family
  memberships, Steward-resolved cases, `#Left` memberships, unrelated
  `#Suspended` memberships, and cases with no qualifying relationship. Each
  `EligibleMembershipConfirmationView` carries only `familyId`, `membershipId`,
  `pendingPersonId`, `displayName`, optional `profilePhoto`, optional
  `birthYear`, `simpleRelationship` (Parent/Child, Sibling, SpousePartner), and
  `confirmationState`. It never exposes an applicant or confirmer account
  principal, raw relationship context, sensitive relationship metadata, private
  profile notes, or unrelated family data. Anonymous callers get
  `#err(#NotSignedIn)`; a caller with no `#Active` membership in `familyId` gets
  `#err(#NoActiveMembership)`. The result is a pure read: it never mutates
  state, and it is scoped to `familyId`, so a Family A request never appears in
  a Family B result. The `displayName` is the pending person's family-safe
  profile name (falling back to the person id when no profile is tracked);
  `profilePhoto` and `birthYear` are currently always `null` because the
  canonical `PersonProfile` record carries no profile-photo reference or birth
  year field.
- `listMembershipConfirmationReviewsForSteward(familyId : Text) : async Result<[MembershipConfirmationReviewView], MembershipConfirmationError>` —
  query. Returns the privacy-safe list of unresolved confirmation cases in
  `familyId` that require Steward review. Allowed only when the caller is an
  active Steward of `familyId`; anonymous callers get `#err(#NotSignedIn)` and
  any other caller gets `#err(#NotAuthorized)`. The caller identity is derived
  server-side from the query `{ caller }` parameter, never from a caller-supplied
  id, and a Steward of another family cannot read this family's cases. Cases
  whose derived confirmation state is `#StewardReviewRequired` (a conflicting
  `#Confirmed` + `#Disputed` with no persisted Steward resolution) or
  `#RejectedByRelative` (a standalone trusted-relative rejection/dispute) are
  returned; `#ResolvedBySteward`, `#ApprovedByRelative`, and
  `#AwaitingConfirmation` cases are excluded. Each
  `MembershipConfirmationReviewView` carries only `familyId`,
  `membershipId`, `pendingPersonId`, `applicantDisplayName`, `simpleRelationship`
  (Parent/Child, Sibling, SpousePartner), `membershipStatus`, a
  `confirmationHistory` list (each entry with a simple relationship label, a
  server-resolved confirmer display name, the `#Confirmed`/`#Disputed` decision,
  and the decision timestamp), `confirmedCount`, `disputedCount`, and
  `confirmationState`. Confirmer display names are resolved server-side from the
  family's person profiles (falling back to a neutral label). The response never
  exposes an applicant or confirmer account principal, a confirmer person id, a
  relationship id, raw relationship context, sensitive relationship metadata
  (Biological/Adoptive/Foster/Step/Guardian), private profile notes, or unrelated
  family data. The result is a pure read: it never mutates state, and it is
  scoped to `familyId`, so a Family A case never appears in a Family B result.

A FoundingSteward nominee whose membership becomes `#Active` through
trusted-relative confirmation keeps the existing nomination intact and may then
accept the nomination; confirmation itself grants no Steward authority.

The OQL `membershipConfirmation` entity is a flattened, `.controllerOnly()` view
of every recorded trusted-relative decision: `familyId`, `id`, `membershipId`,
`pendingPersonId`, `confirmerAccountId`, `confirmerPersonId`, `decision` (the
`#Confirmed`/`#Disputed` tag text), `relationshipId`, `rejectedByAccountId`
(the rejecting account when the decision is `#Disputed`, else `\"\"`),
`rejectedAt` (the rejection timestamp when the decision is `#Disputed`, else
`0`), `createdAt`, and `updatedAt`. The OQL `membershipConfirmationResolution`
entity is a flattened,
`.controllerOnly()` view of the persisted Steward resolutions, keyed by
`membershipId`: `familyId`, `membershipId`, `resolution` (the
`#Approve`/`#Reject`/`#NeedsMoreInformation` tag text), `resolvedByAccountId`,
and `resolvedAt`. Both are `.controllerOnly()`, so only the platform controller
reads their rows through `schema()`/`execute()`; end users read confirmation
data only through the redacted applicant view or the Steward-authorized view
described above. The `familyId` column carries the tenant boundary, so a
controller-side query can separate Family A confirmations from Family B
confirmations.

### Photo gallery

Every photo endpoint is family-scoped: it takes the requested `familyId` and
evaluates authority and data access against that family. A person id in one
family never returns or mutates a gallery in another family, and the same
`personId` text may safely exist in two families with independent galleries.
The single-family endpoints listed after the family-scoped ones are TEMPORARY
Tenancy 1C compatibility wrappers that delegate with the default family id
(`\"norwood\"`); they are deprecated and will be removed once every caller passes
an explicit `familyId`.

- `listPhotosForFamily(familyId : Text, personId : Text) : async [Photo]` —
  query. Returns all uploaded photos for a person in `familyId`, in upload
  order. Requires an approved member or active Steward of `familyId`; anonymous
  and signed-in but unapproved callers are rejected with a trap. Any approved
  member of `familyId` may view the full gallery of any person profile in that
  family, including other claimed people. Returns `[]` when the person has no
  gallery in `familyId`.
- `getProfilePhotoForFamily(familyId : Text, personId : Text) : async ?Photo` —
  query. Returns the person's current profile photo in `familyId`, or `null`
  when none is set (the frontend then shows the initials placeholder). The
  lookup confirms the profile belongs to `familyId`. For an unclaimed/historical
  profile in `familyId` the single designated portrait remains readable by
  guests so Add Myself / claim discovery works. For a claimed profile it
  requires an approved member or Steward of `familyId`; anonymous and unapproved
  callers are rejected with a trap. Guests never receive any gallery photo other
  than the single designated portrait of an unclaimed/historical profile.
- `addPhotoForFamily(familyId : Text, personId : Text, filename : Text, mimeType : Text, blob : Blob) : async Photo` —
  update. Uploads a new photo to a person's gallery in `familyId` and returns
  the stored photo. Requires the approved owner of that claimed profile, or a
  Steward of `familyId` acting on an unclaimed/historical profile; anonymous
  callers, unapproved callers, approved members who do not own the profile, and
  a Steward attempting to modify a profile claimed by another user are all
  rejected with a trap. For an unclaimed/historical profile only a Steward of
  `familyId` may add photos. The caller is recorded as `uploadedBy`. Photo ids
  are assigned per person per family as `max-existing-id + 1` (or `0` when the
  gallery is empty). The `blob` is the external storage reference (a `Blob`).
  When the person's gallery has no profile photo yet, the newly added photo is
  automatically set as the profile photo, so the completeness indicator updates
  immediately.
- `setProfilePhotoForFamily(familyId : Text, personId : Text, photoId : Nat) : async ?Photo` —
  update. Marks the photo with `photoId` as the person's profile photo in
  `familyId`. Requires the approved owner of that claimed profile, or a Steward
  of `familyId` acting on an unclaimed/historical profile; anonymous callers,
  unapproved callers, approved members who do not own the profile, and a Steward
  attempting to modify a profile claimed by another user are all rejected with a
  trap. For an unclaimed/historical profile only a Steward of `familyId` may set
  the portrait. Returns the newly selected photo, or `null` when no photo with
  that id exists in the person's gallery in `familyId`.
- `removePhotoForFamily(familyId : Text, personId : Text, photoId : Nat) : async Bool` —
  update. Removes a photo from the person's gallery in `familyId` and returns
  `true` when a photo was removed. Requires the approved owner of that claimed
  profile, or a Steward of `familyId` acting on an unclaimed/historical profile;
  anonymous callers, unapproved callers, approved members who do not own the
  profile, and a Steward attempting to modify a profile claimed by another user
  are all rejected with a trap. For an unclaimed/historical profile only a
  Steward of `familyId` may remove photos. If the removed photo was the profile
  photo, the profile photo is cleared (the frontend falls back to the initials
  placeholder).

The following single-family endpoints are TEMPORARY Tenancy 1C compatibility
wrappers. Each delegates to its family-scoped counterpart with the default
family id (`\"norwood\"`), so current Norwood behavior is unchanged.

- `listPhotos(personId : Text) : async [Photo]` — query. Returns all uploaded
  photos for a person, in upload order. Requires an approved family member (a
  caller holding at least one `#Approved` profile claim, or a Family Steward);
  anonymous and signed-in but unapproved callers are rejected with a trap. Any
  approved family member may view the full gallery of any person profile,
  including other claimed people. Returns `[]` when the person has no gallery.
- `getProfilePhoto(personId : Text) : async ?Photo` — query. Returns the
  person's current profile photo, or `null` when none is set (the frontend then
  shows the initials placeholder). For an unclaimed/historical profile the
  single designated portrait remains readable by guests so Add Myself / claim
  discovery works. For a claimed profile it requires an approved family member
  or a Family Steward; anonymous and unapproved callers are rejected with a
  trap. Guests never receive any gallery photo other than the single designated
  portrait of an unclaimed/historical profile.
- `addPhoto(personId : Text, filename : Text, mimeType : Text, blob : Blob) : async Photo` —
  update. Uploads a new photo to a person's gallery and returns the stored
  photo. Requires the approved owner of that claimed profile, or a Family
  Steward acting on an unclaimed/historical profile; anonymous callers,
  unapproved callers, approved family members who do not own the profile, and a
  Family Steward attempting to modify a profile claimed by another user are all
  rejected with a trap. For an
  unclaimed/historical profile only a Family Steward may add photos. The caller
  is recorded as `uploadedBy`. Photo ids are
  assigned per person as `max-existing-id + 1` (or `0` when the gallery is
  empty). The `blob` is the external storage reference (a `Blob`). When the
  person's gallery has no profile photo yet, the newly added photo is
  automatically set as the profile photo, so the completeness indicator updates
  immediately.
- `setProfilePhoto(personId : Text, photoId : Nat) : async ?Photo` — update.
  Marks the photo with `photoId` as the person's profile photo. Requires the
  approved owner of that claimed profile, or a Family Steward acting on an
  unclaimed/historical profile; anonymous
  callers, unapproved callers, approved family members who do not own the
  profile, and a Family Steward attempting to modify a profile claimed by
  another user are all rejected with a trap. For an unclaimed/historical profile
  only a Family Steward may set the portrait. Returns the
  newly selected photo, or `null` when no photo with that id exists in the
  person's gallery.
- `removePhoto(personId : Text, photoId : Nat) : async Bool` — update. Removes
  a photo from the person's gallery and returns `true` when a photo was
  removed. Requires the approved owner of that claimed profile, or a Family
  Steward acting on an unclaimed/historical profile; anonymous callers,
  unapproved callers, approved family members who do not own the profile, and a
  Family Steward attempting to modify a profile claimed by another user are all
  rejected with a trap. For an
  unclaimed/historical profile only a Family Steward may remove photos. If the
  removed photo was the profile photo, the profile photo is
  cleared (the frontend falls back to the initials placeholder).
### Family Archive

Every archive endpoint is family-scoped: it takes the requested `familyId` and
evaluates authority and data access against that family. An `archiveItemId`
alone is never a tenant boundary — a lookup that finds a record belonging to
another family behaves exactly like a lookup that found nothing, so Family A can
never read, submit to, review, approve, reject, or mutate Family B Archive data.
The single-family endpoints listed after the family-scoped ones are TEMPORARY
Tenancy 1C compatibility wrappers that delegate with the default family id
(`\"norwood\"`); they are deprecated and will be removed once every caller passes
an explicit `familyId`.

- `submitArchiveItemForFamily(familyId : Text, title : Text, description : Text, itemType : ArchiveItemType, mimeType : Text, blob : Blob, era : Text, year : ?Nat, tags : [Text], relatedMemberIds : [Text], relatedBranchId : ?Text, sourceStatus : SourceStatus, privacyLevel : PrivacyLevel, classification : ArchiveItemClassification, primarySpeaker : ?OralHistorySpeaker, filename : Text) : async ArchiveItem` —
  update. Submits a new archive item into `familyId`. Requires an approved
  member or active Steward of `familyId`; an anonymous caller is rejected with a
  trap carrying `\"Unauthorized: You must be signed in\"`, and a signed-in but
  unapproved caller is rejected with a trap carrying the stable, non-technical
  `\"Family membership required. Claim your family profile and wait for Family
  Steward approval before contributing family content.\"` so the frontend can
  present a definitive family-membership-required outcome rather than a generic
  retry. The caller is recorded as the `contributor`. The stored item's
  `familyId` is the requested `familyId`, and every `relatedMemberIds` entry must
  belong to that same family — Family A may never reference Family B people; a
  related member that does not belong to `familyId` traps with
  `\"Unauthorized: Related family members must belong to the same family\"` and
  stores nothing. The item is stored in `#Pending` state, assigned a fresh id,
  and `createdAt` is set to the current time. It does not appear in the archive
  until a Steward of `familyId` approves it. The `blob` is the external storage
  reference (a `Blob`); the original file bytes live off-chain and are preserved
  as-is. The validated MIME type and the sanitized `filename` are persisted on
  the item itself as `mimeType` and `filename`, because `ExternalBlob` runtime
  metadata is not reliably available after the blob has been stored and returned;
  the frontend uses these persisted fields to decide whether a safe inline
  preview is offered. `filename` is sanitized (path separators and control
  characters removed, length capped) and the MIME type is normalized (trimmed and
  lower-cased) before it is stored. The allowed document MIME list is
  `application/pdf`, `text/plain`, `text/csv`, `application/msword`,
  `application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
  `application/vnd.ms-excel`, and
  `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`. Word,
  Excel, and CSV files are accepted and stored but are never rendered inline;
  only PDF and plain text are previewed.
  `title` and `description` are required. `era` is OPTIONAL: an empty or
  whitespace-only value is accepted and stored as `\"\"`; a non-empty value is
  trimmed and must be at most 150 characters, and an overlong value is rejected
  (never silently truncated). `tags` and `relatedMemberIds` are bounded lists.
  `classification` marks the item as Oral History (distinct from `itemType`):
  `#Standard` for ordinary media, `#OralHistory` for oral-history video and
  audio-only oral history. When `classification == #OralHistory`, `primarySpeaker`
  is REQUIRED — exactly one primary speaker — and the call traps with
  `\"A primary speaker is required for Oral History items\"` when it is `null`.
  When `classification == #Standard`, `primarySpeaker` must be `null` and the
  call traps with
  `\"A primary speaker is only allowed on Oral History items\"`
  when it is not. `primarySpeaker` links to a canonical Person record via its
  optional `personId` when that person exists, and always carries a display
  `name`. Related Family Members (`relatedMemberIds`) may still contain multiple
  people; only the single primary speaker is constrained. The reserved
  future-ready fields (transcript, searchable transcript, chapter markers, AI
  summary, extracted names) are initialized to `null` and are not populated by
  any logic yet.
- `listPendingArchiveItemsForFamily(familyId : Text) : async [ArchiveItem]` —
  query. Active Steward of `familyId` only. Returns all archive items in
  `familyId` currently in `#Pending` state **except** those whose id is
  referenced by a Research Source's `archiveItemId`. A Research-linked item is
  reviewed through the Research Intake queue (approving or rejecting the Source
  cascades to the linked item), so it is not actionable here. Ordinary archive
  contributions with no linked Research Source are listed unchanged. Only items
  whose `familyId` equals `familyId` are returned, so pending Archive A never
  appears in Family B.
- `approveArchiveItemForFamily(familyId : Text, id : Nat) : async ?ArchiveItem` —
  update. Active Steward of `familyId` only; a Steward of another family cannot
  approve the item. Moves a pending item in `familyId` to `#Approved` state and
  returns the updated item, or `null` when no pending item with that id belongs
  to `familyId`. On the actual transition out of `#Pending`, records exactly one
  `#ArchiveApproved` notification addressed only to the item's `contributor`,
  with the message `Your archive contribution \"<title>\" was approved.` A
  repeated call on an already-reviewed item returns `null` and creates no
  notification.
- `rejectArchiveItemForFamily(familyId : Text, id : Nat) : async ?ArchiveItem` —
  update. Active Steward of `familyId` only; a Steward of another family cannot
  reject the item. Moves a pending item in `familyId` to `#Rejected` state and
  returns the updated item, or `null` when no pending item with that id belongs
  to `familyId`. The rejected record is retained, not deleted. On the actual
  transition out of `#Pending`, records exactly one `#ArchiveRejected`
  notification addressed only to the item's `contributor`, with the message
  `Your archive contribution \"<title>\" was not approved.` A repeated call on an
  already-reviewed item returns `null` and creates no notification.
- `listApprovedArchiveItemsForFamily(familyId : Text) : async [ArchiveItem]` —
  query. Returns the archive items in `familyId` in `#Approved` state visible to
  the caller under the archive privacy rules. Privacy is enforced server-side:
  `#Public` items are returned to everyone; `#FamilyOnly` items are returned only
  to approved members of `familyId` (a caller holding at least one `#Approved`
  profile claim in that family) or active Stewards of `familyId`; `#Private`
  items are returned only to their contributor or an active Steward of
  `familyId`. Guests and non-approved members see only `#Public` items. Only
  items whose `familyId` equals `familyId` are returned, so approved Archive A
  never appears in Family B.
- `getArchiveItemForFamily(familyId : Text, id : Nat) : async ?ArchiveItem` —
  query. Requires an approved member or active Steward of `familyId`. Returns the
  archive item with `id` when it belongs to `familyId` and is visible to the
  caller under the archive privacy rules, or `null` otherwise. A record that
  exists under another family is never returned, so an `archiveItemId` alone
  cannot cross the family boundary.
- `searchArchiveItemsForFamily(familyId : Text, filter : ArchiveSearchFilter) : async [ArchiveItem]` —
  query. Requires an approved member or active Steward of `familyId`.
  Searches/filters approved archive items in `familyId` by title query, tags,
  item type, related family member, and era. Returns only `#Approved` items whose
  `familyId` equals `familyId` and that are visible to the caller under the
  archive privacy rules (same server-side enforcement as
  `listApprovedArchiveItemsForFamily`). `filter.searchTerm` matches the item
  title case-insensitively and by substring; `filter.tags` matches items carrying
  ALL of the given tags, each matched case-insensitively and by substring against
  the item's canonical `tags` list; `filter.itemType`, `filter.relatedMemberId`,
  and `filter.era` filter by category, linked family member, and era
  respectively. Every field is optional — a `null`/empty field does not constrain
  the result.

The following single-family endpoints are TEMPORARY Tenancy 1C compatibility
wrappers. Each delegates to its family-scoped counterpart with the default
family id (`\"norwood\"`), so current Norwood behavior is unchanged. They contain
no business logic of their own.

- `submitArchiveItem(title : Text, description : Text, itemType : ArchiveItemType, mimeType : Text, blob : Blob, era : Text, year : ?Nat, tags : [Text], relatedMemberIds : [Text], relatedBranchId : ?Text, sourceStatus : SourceStatus, privacyLevel : PrivacyLevel, classification : ArchiveItemClassification, primarySpeaker : ?OralHistorySpeaker, filename : Text) : async ArchiveItem` —
  update. TEMPORARY Tenancy 1C compatibility wrapper for
  `submitArchiveItemForFamily`, delegating with the default family id
  (`\"norwood\"`). Submits a new archive item. Requires an approved family member
  (a caller holding at least one `#Approved` profile claim, or a Family Steward);
  an anonymous caller is rejected with a trap carrying
  `\"Unauthorized: You must be signed in\"`, and a signed-in but unapproved
  caller is rejected with a trap carrying the stable, non-technical
  `\"Family membership required. Claim your family profile and wait for Family
  Steward approval before contributing family content.\"` so the frontend can
  present a definitive family-membership-required outcome rather than a generic
  retry. The caller is recorded as the `contributor`. The item is stored in
  `#Pending` state, assigned a fresh id, and `createdAt` is set to the current
  time. It does not appear in the archive until a Family Steward approves it. The
  `blob` is the external storage reference (a `Blob`); the original file bytes
  live off-chain and are preserved as-is. The validated MIME type and the
  sanitized `filename` are persisted on the item itself as `mimeType` and
  `filename`, because `ExternalBlob` runtime metadata is not reliably available
  after the blob has been stored and returned; the frontend uses these persisted
  fields to decide whether a safe inline preview is offered. `filename` is
  sanitized (path separators and control characters removed, length capped) and
  the MIME type is normalized (trimmed and lower-cased) before it is stored. The
  allowed document MIME list is `application/pdf`, `text/plain`, `text/csv`,
  `application/msword`,
  `application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
  `application/vnd.ms-excel`, and
  `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`. Word,
  Excel, and CSV files are accepted and stored but are never rendered inline;
  only PDF and plain text are previewed.
  `title` and `description` are required. `era` is OPTIONAL: an empty or
  whitespace-only value is accepted and stored as `\"\"`; a non-empty value is
  trimmed and must be at most 150 characters, and an overlong value is rejected
  (never silently truncated). `tags` and `relatedMemberIds` are bounded lists.
  `classification` marks the item as Oral History (distinct from `itemType`):
  `#Standard` for ordinary media, `#OralHistory` for oral-history video and
  audio-only oral history. When `classification == #OralHistory`, `primarySpeaker`
  is REQUIRED — exactly one primary speaker — and the call traps with
  `\"A primary speaker is required for Oral History items\"` when it is `null`.
  When `classification == #Standard`, `primarySpeaker` must be `null` and the
  call traps with
  `\"A primary speaker is only allowed on Oral History items\"`
  when it is not. `primarySpeaker` links to a canonical Person record via its
  optional `personId` when that person exists, and always carries a display
  `name`. Related Family Members (`relatedMemberIds`) may still contain multiple
  people; only the single primary speaker is constrained. The reserved
  future-ready fields (transcript, searchable transcript, chapter markers, AI
  summary, extracted names) are initialized to `null` and are not populated by
  any logic yet.
- `listPendingArchiveItems() : async [ArchiveItem]` — query. TEMPORARY Tenancy 1C
  compatibility wrapper for `listPendingArchiveItemsForFamily`, delegating with
  the default family id (`\"norwood\"`). Family Steward only. Returns all archive
  items currently in `#Pending` state **except** those whose id is referenced by
  a Research Source's `archiveItemId`. A Research-linked item is reviewed through
  the Research Intake queue (approving or rejecting the Source cascades to the
  linked item), so it is not actionable here. Ordinary archive contributions with
  no linked Research Source are listed unchanged.
- `approveArchiveItem(id : Nat) : async ?ArchiveItem` — update. TEMPORARY
  Tenancy 1C compatibility wrapper for `approveArchiveItemForFamily`, delegating
  with the default family id (`\"norwood\"`). Family Steward only. Moves a pending
  item to `#Approved` state and returns the updated item, or `null` when no
  pending item with that id exists. On the actual transition out of `#Pending`,
  records exactly one `#ArchiveApproved` notification addressed only to the
  item's `contributor`, with the message
  `Your archive contribution \"<title>\" was approved.` A repeated call on an
  already-reviewed item returns `null` and creates no notification.
- `rejectArchiveItem(id : Nat) : async ?ArchiveItem` — update. TEMPORARY Tenancy
  1C compatibility wrapper for `rejectArchiveItemForFamily`, delegating with the
  default family id (`\"norwood\"`). Family Steward only. Moves a pending item to
  `#Rejected` state and returns the updated item, or `null` when no pending item
  with that id exists. The rejected record is retained, not deleted. On the
  actual transition out of `#Pending`, records exactly one `#ArchiveRejected`
  notification addressed only to the item's `contributor`, with the message
  `Your archive contribution \"<title>\" was not approved.` A repeated call on an
  already-reviewed item returns `null` and creates no notification.
- `listApprovedArchiveItems() : async [ArchiveItem]` — query. TEMPORARY Tenancy
  1C compatibility wrapper for `listApprovedArchiveItemsForFamily`, delegating
  with the default family id (`\"norwood\"`). Returns the archive items in
  `#Approved` state visible to the caller under the archive privacy rules.
  Privacy is enforced server-side: `#Public` items are returned to everyone;
  `#FamilyOnly` items are returned only to approved family members (a caller
  holding at least one `#Approved` profile claim) or Family Stewards; `#Private`
  items are returned only to their contributor or a Family Steward. Guests and
  non-approved members see only `#Public` items.

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
  claim already exists for that person. Duplicate-claim prevention is enforced
  server-side: a caller who already owns the profile (an approved claim) or who
  already has a pending claim on it is rejected with `#err(#AlreadyClaimed)` /
  `#err(#AlreadyPending)` respectively rather than creating a second claim, and
  a profile with an approved owner cannot be claimed by anyone else (also
  `#err(#AlreadyClaimed)`). On success it records a `#ProfileClaimRequested`
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
  `#err(#NotSignedIn)` for an anonymous caller and `#err(#AlreadyOwned)` when the
  caller already owns a profile (an approved claim) or has a pending claim on
  one — the no-duplicate-ownership rule prevents a caller from creating a second
  profile while an active ownership path exists. The new profile is created
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
  `proposeRelationship`. A caller may edit a profile when they are its owner
  (`claimedByUserId == caller`) or when they are a Family Steward and the
  profile is unclaimed (`claimedByUserId == null`). A Family Steward may NOT
  edit a profile claimed by another user — such a call returns
  `#err(#NotOwner)`. A profile already `#Deceased` is non-editable for an owner
  (returns `#err(#DeceasedProfile)`); a living profile may be marked
  `#Deceased` via `edits.livingStatus`, after which it can no longer be edited
  by its owner. A Family Steward editing an unclaimed/historical profile may
  update it even when it is `#Deceased` — the deceased guard does not block the
  steward-editable path, so a steward can correct or complete an unclaimed
  deceased/historical profile. Requires a signed-in caller; returns
  `#err(#NotSignedIn)` for an anonymous caller, `#err(#ProfileNotFound)` when
  the person is not tracked, `#err(#NotOwner)` when the caller is neither the
  profile's owner nor a Family Steward editing an unclaimed profile, and
  `#err(#DeceasedProfile)` for a deceased profile when the caller is not on the
  steward-editable path.
- `listNotifications() : async [Notification]` — query. TEMPORARY Tenancy 1C
  compatibility wrapper for `listNotificationsForFamily`; returns the in-app
  notification records addressed to the signed-in caller in the default family
  (`\"norwood\"`).
- `removeDuplicateProfile(personId : Text) : async Result<(), RemoveError>` —
  update. Family Steward only. Removes a duplicate test-created profile and any
  pending relationship request or pending claim tied only to it, preserving the
  original profile, the confirmed family graph, and the signed-in account.
  Returns `#err(#NotSignedIn)` for an anonymous caller and
  `#err(#ProfileNotFound)` when the person is not tracked. It never removes the
  signed-in account itself and never alters confirmed relationships.

#### Family-scoped profile, claim, and relationship methods (canonical)

The methods above are TEMPORARY Tenancy 1C compatibility wrappers: each delegates
to its family-scoped counterpart with the default family (`\"norwood\"`). The
family-scoped forms below are the canonical API and take an explicit
`familyId : Text` as their first argument. Authority and data access are
evaluated against the requested `familyId`, and a `personId` in one family never
returns or mutates a record in another family. Profile storage is keyed by the
family-qualified key (`familyId::personId`) for every non-default family, while
the default family keeps the legacy bare `personId` key so existing Norwood data
stays readable.

- `getPersonProfileForFamily(familyId : Text, personId : Text) : async ?PersonProfile` —
  query. Family-scoped form of `getPersonProfile`. Returns the profile only when
  it belongs to `familyId`; a `personId` in Family A never returns a profile from
  Family B.
- `getMyProfileForFamily(familyId : Text) : async ?PersonProfile` — query.
  Family-scoped form of `getMyProfile`. Returns the signed-in caller's own
  linked/claimed profile in `familyId`, or their pending profile in that family,
  or `null` when the caller has no profile there. Ownership in one family never
  surfaces a profile from another.
- `listProfilesForFamily(familyId : Text) : async [PersonProfile]` — query.
  Lists the profiles of `familyId` for Explore Family / Person Profile
  hydration. Requires the caller to be an approved member of `familyId` or an
  active Steward of `familyId`; profiles from other families are never included.
- `listClaimDiscoveryProfilesForFamily(familyId : Text) : async [PersonProfile]` —
  query. Public claim-discovery read preserving the existing minimal-data
  behavior, scoped to `familyId`.
- `requestProfileClaimForFamily(familyId : Text, personId : Text) : async Result<ProfileClaim, ClaimError>` —
  update. Family-scoped form of `requestProfileClaim`. The claim belongs to
  exactly `familyId`; approved ownership in another family does not block an
  independent claim here. Same error variants as `requestProfileClaim`.
- `listProfileClaimsForFamily(familyId : Text) : async [ProfileClaim]` — query.
  Family Steward of `familyId` only. Lists the claim requests of `familyId`;
  claims from other families are never included.
- `getMyProfileClaimForFamily(familyId : Text, personId : Text) : async ?ProfileClaim` —
  query. Returns the caller's own claim on a specific profile in `familyId`, or
  `null`. There is no cross-family claim lookup by `personId` alone.
- `approveProfileClaimForFamily(familyId : Text, claimId : Nat) : async ?ProfileClaim` —
  update. Family Steward of `familyId` only. Approves a pending claim in
  `familyId`; the claim must belong to that family.
- `rejectProfileClaimForFamily(familyId : Text, claimId : Nat) : async ?ProfileClaim` —
  update. Family Steward of `familyId` only. Rejects a pending claim in
  `familyId`.
- `searchPossibleMatchesForFamily(familyId : Text, name : Text) : async [PersonMatch]` —
  query. Family-scoped form of `searchPossibleMatches`; only profiles belonging
  to `familyId` are considered.
- `createMyselfForFamily(familyId : Text, name : Text) : async Result<PersonProfile, CreateError>` —
  update. Family-scoped form of `createMyself`. The created profile belongs to
  `familyId`; ownership in another family does not block creation here.
- `proposeRelationshipForFamily(familyId : Text, fromPersonId : Text, toPersonId : Text, relationshipType : RelationshipType) : async Result<RelationshipRequest, RelationshipError>` —
  update. Family-scoped form of `proposeRelationship`. Both referenced people
  must belong to `familyId`; the request belongs to `familyId` and starts
  `#Pending`.
- `listRelationshipRequestsForFamily(familyId : Text) : async [RelationshipRequest]` —
  query. Family Steward of `familyId` only. Lists the relationship requests of
  `familyId`; requests from other families are never included.
- `approveRelationshipRequestForFamily(familyId : Text, requestId : Nat) : async ?RelationshipRequest` —
  update. Family Steward of `familyId` only. Approves a pending request in
  `familyId`, adding the relationship to that family's graph.
- `rejectRelationshipRequestForFamily(familyId : Text, requestId : Nat) : async ?RelationshipRequest` —
  update. Family Steward of `familyId` only. Rejects a pending request in
  `familyId`.
- `setRelationshipRequestPendingForFamily(familyId : Text, requestId : Nat) : async ?RelationshipRequest` —
  update. Family Steward of `familyId` only. Returns a request in `familyId` to
  `#Pending`.
- `getMyRelationshipRequestsForFamily(familyId : Text) : async [RelationshipRequest]` —
  query. Returns the caller's own pending relationship requests in `familyId`.
- `updateOwnProfileForFamily(familyId : Text, personId : Text, edits : ProfileEdits) : async Result<PersonProfile, EditError>` —
  update. Family-scoped form of `updateOwnProfile`. Updates an approved owner's
  own living profile fields in `familyId`, or, for a Steward of `familyId`, the
  fields of an unclaimed/historical profile in that family.
- `removeDuplicateProfileForFamily(familyId : Text, personId : Text) : async Result<(), RemoveError>` —
  update. Family Steward of `familyId` only. Removes a duplicate profile in
  `familyId` and any pending relationship requests or claims tied only to it.
- `listConfirmedRelationshipsForFamily(familyId : Text) : async [Relationship]` —
  query. Lists the confirmed relationships of `familyId`; relationships from
  other families are never included.
- `getRelationshipRequestForFamily(familyId : Text, id : Nat) : async ?RelationshipRequest` —
  query. Returns a relationship request in `familyId`, or `null`.

#### Family-scoped notification methods (canonical)

Every notification record carries a `familyId` naming the family whose activity
produced it. The methods below are the canonical notification API and take an
explicit `familyId : Text` as their first argument. A notification is only ever
read, counted, or mutated when its `familyId` equals the requested family AND its
`recipient` is the caller, so a `notificationId` alone never crosses a family
boundary and Family A notifications never appear in a Family B read or count.
The legacy `listNotifications` and `markNotificationRead` are TEMPORARY Tenancy
1C compatibility wrappers that delegate here with the default family
(`\"norwood\"`).

- `listNotificationsForFamily(familyId : Text) : async [Notification]` — query.
  Lists the signed-in caller's notifications in `familyId`, newest first. Only
  notifications whose `familyId` equals `familyId` and whose recipient is the
  caller are returned.
- `listUnreadNotificationsForFamily(familyId : Text) : async [Notification]` —
  query. Lists the signed-in caller's unread notifications in `familyId`, newest
  first.
- `unreadNotificationCountForFamily(familyId : Text) : async Nat` — query. Counts
  the signed-in caller's unread notifications in `familyId`; Family B unread
  notifications never inflate a Family A count.
- `getNotificationForFamily(familyId : Text, id : Nat) : async ?Notification` —
  query. Returns the signed-in caller's notification with `id` in `familyId`, or
  `null` when no notification with that id belongs to `familyId` and is addressed
  to the caller. A notification id from another family never resolves here.
- `markNotificationReadForFamily(familyId : Text, id : Nat) : async ?Notification` —
  update. Marks the signed-in caller's notification with `id` in `familyId` as
  read. Returns the updated notification, or `null` when no notification with
  that id belongs to `familyId` and is addressed to the caller. A Family A action
  can never mutate a Family B notification.
- `markAllNotificationsReadForFamily(familyId : Text) : async Nat` — update. Marks
  every unread notification addressed to the signed-in caller in `familyId` as
  read and returns the number marked. Notifications in other families are never
  touched.
- `dismissNotificationForFamily(familyId : Text, id : Nat) : async Bool` — update.
  Dismisses (deletes) the signed-in caller's notification with `id` in
  `familyId`. Returns `true` when a matching notification was removed, `false`
  when none belongs to `familyId` and is addressed to the caller. A Family A
  action can never delete a Family B notification.

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

### Family Steward authority

- `isCallerSteward() : async Bool` — query. Returns `true` only when the caller
  matches an ACTIVE persisted `StewardRecord` in the `stewards` list for the
  default family (`\"norwood\"`). Returns `false` for an anonymous caller and for
  an account holding only the platform admin role. This is the canonical Steward
  authority check; the platform admin role is never consulted.
- `hasActiveSteward() : async Bool` — query. Returns `true` when the default
  family has any active Family Steward. Public so the frontend can show or hide
  the one-time \"Claim Family Steward\" control. Not gated to admin — any caller
  may query it.
- `claimSteward() : async Result<StewardClaimResult, StewardClaimError>` —
  update. One-time \"Claim Family Steward\" bootstrap for the default family.
  Any signed-in account may claim while that family has no active Steward; no
  approved family profile is required. Succeeds only when the family has no
  active Steward, creating an ACTIVE `StewardRecord` for the claimer and
  recording the assignment in the audit log. Once the family has any active
  Steward the claim permanently refuses. Returns `#err(#NotSignedIn)` for an
  anonymous caller, `#err(#StewardAlreadyExists)` when an active Steward already
  exists and the caller is not one, and `#err(#AlreadySteward)` when the caller
  already holds an active Steward record. On success returns
  `#ok(StewardClaimResult)`.

### Family Governance (Steward Management, Succession, Removal, Merge, Relationships, Audit)

The canonical governance mutation paths are family-scoped: `promoteToStewardForFamily`,
`designateSuccessorForFamily`, `activateSuccessorForFamily`, and
`addRelationshipForFamily` take an explicit `familyId` as their first argument and
evaluate Steward authority and data access against that family. A Steward of one
family can never promote, designate, activate, or relate a member of another
family, and every record they create is stamped with the requested `familyId`.
Successor designations carry a `familyId`, so the same `personId` may hold
independent designations in different families and a designation from one family
can never activate a Steward in another. The family-scoped successor reads
`listSuccessorsForFamily` and `listStewardIdentitiesForFamily` only ever return
records stamped with the requested `familyId`. The legacy no-`familyId` forms
(`promoteToSteward`, `designateSuccessor`, `activateSuccessor`,
`listSuccessors`, `listStewardIdentities`, `addRelationship`) are TEMPORARY
Tenancy 1C compatibility wrappers that delegate with the default family id
(`\"norwood\"`); they contain no business logic of their own.

- `listStewardsForFamily(familyId : Text) : async [StewardRecord]` — query.
  Active Steward of `familyId` only. Lists the steward governance records of
  `familyId` with role status and account identity. Only records whose `familyId`
  equals `familyId` are returned, so a Steward of one family can never read
  another family's roster; existing ordering and record shape are preserved.
- `listStewards() : async [StewardRecord]` — query. TEMPORARY Tenancy 1C
  compatibility wrapper for `listStewardsForFamily`, delegating with the default
  family id (`\"norwood\"`). Family Steward only. Lists all steward governance
  records of the default family with role status and account identity.
- `promoteToStewardForFamily(familyId : Text, personId : Text) : async Result<StewardRecord, StewardError>` —
  update. Active Steward of `familyId` only. Promotes an approved claimed member
  of `familyId` (a profile in that family with `claimStatus == #Claimed` and a
  claiming owner) to Family Steward. The target profile is resolved through the
  family-qualified profile lookup, the duplicate-Steward check is filtered by
  `familyId`, and the new `StewardRecord` is stamped with `familyId`. Returns
  `#err(#NotApprovedClaimedMember)` when the person is not an approved claimed
  member of `familyId` and `#err(#AlreadySteward)` when the member's account is
  already an active steward of `familyId`. A Steward of one family can never
  promote a member of another family.
- `promoteToSteward(personId : Text) : async Result<StewardRecord, StewardError>` —
  update. TEMPORARY Tenancy 1C compatibility wrapper for
  `promoteToStewardForFamily`, delegating with the default family id
  (`\"norwood\"`). Family Steward only. Promotes an existing approved claimed
  family member to Family Steward. Returns `#err(#NotApprovedClaimedMember)` when
  the person is not an approved claimed member and `#err(#AlreadySteward)` when
  the member's account is already an active steward.
- `removeSteward(stewardAccountId : Principal) : async Result<(), StewardError>` —
  update. Family Steward only. Removes the steward role from another steward,
  never allowing the last active steward to be removed (returns
  `#err(#LastSteward)` when only one active steward remains). Returns
  `#err(#NotSteward)` when the account is not an active steward.
- `designateSuccessorForFamily(familyId : Text, personId : Text, priority : Nat) : async Result<SuccessorDesignation, StewardError>` —
  update. Active Steward of `familyId` only. Designates an approved claimed
  member of `familyId` as a successor steward with a priority/order. The target
  profile is resolved through the family-qualified profile lookup, the
  duplicate-designation check is scoped by `familyId`, and the new
  `SuccessorDesignation` is stamped with `familyId`. A successor is a
  designation only — not an active steward until explicitly activated. The same
  `personId` may hold independent successor designations in different families.
  Returns `#err(#NotApprovedClaimedMember)` when the person is not an approved
  claimed member of `familyId`, `#err(#AlreadySteward)` when the member's
  account is already an active steward of `familyId`, and
  `#err(#AlreadyDesignated)` when that person already has a `#Designated`
  successor record in `familyId`.
- `designateSuccessor(personId : Text, priority : Nat) : async Result<SuccessorDesignation, StewardError>` —
  update. TEMPORARY Tenancy 1C compatibility wrapper for
  `designateSuccessorForFamily`, delegating with the default family id
  (`\"norwood\"`). Family Steward only. Designates an approved claimed family
  member as a successor steward with a priority/order. A successor is a
  designation only — not an active steward until explicitly activated. Returns
  `#err(#NotApprovedClaimedMember)` when the person is not an approved claimed
  member.
- `activateSuccessorForFamily(familyId : Text, personId : Text) : async Result<StewardRecord, StewardError>` —
  update. Active Steward of `familyId` only. Activates/promotes a designated
  successor into the active steward role in `familyId`. The successor
  designation lookup requires `designation.familyId == familyId` AND
  `designation.personId == personId` AND `designation.status == #Designated`,
  and all Steward and profile lookups are filtered by `familyId`, so a
  designation from one family can never activate a Steward in another. The
  activated `StewardRecord` remains in `familyId`. Activating a successor in one
  family never modifies another family's state. Returns `#err(#NotDesignated)`
  when the person has no `#Designated` successor record in `familyId`,
  `#err(#NotApprovedClaimedMember)` when the person is not an approved claimed
  member of `familyId`, and `#err(#AlreadySteward)` when the member's account is
  already an active steward of `familyId`.
- `activateSuccessor(personId : Text) : async Result<StewardRecord, StewardError>` —
  update. TEMPORARY Tenancy 1C compatibility wrapper for
  `activateSuccessorForFamily`, delegating with the default family id
  (`\"norwood\"`). Family Steward only. Activates/promotes a designated successor
  into the active steward role. Returns `#err(#NotDesignated)` when the person
  has no `#Designated` successor record, `#err(#NotApprovedClaimedMember)` when
  the person is not an approved claimed member, and `#err(#AlreadySteward)` when
  the member's account is already an active steward.
- `listSuccessorsForFamily(familyId : Text) : async [SuccessorDesignation]` —
  query. Active Steward of `familyId` only. Lists the successor designations in
  `familyId`; a designation stamped with another family is never returned, so
  Family A never sees Family B designations.
- `listSuccessors() : async [SuccessorDesignation]` — query. TEMPORARY Tenancy
  1C compatibility wrapper for `listSuccessorsForFamily`, delegating with the
  default family id (`\"norwood\"`). Family Steward only. Lists all successor
  designations in the default family.
- `getSingleStewardWarning() : async ?Text` — query. Family Steward only.
  Returns a warning encouraging successor designation when only one active
  steward exists, or `null` when there are multiple stewards.
- `listStewardIdentitiesForFamily(familyId : Text) : async [StewardIdentity]` —
  query. Active Steward of `familyId` only. Returns each current Steward and
  designated Successor of `familyId` enriched with the linked approved Person
  identity, resolved via steward accountId -> approved linked personId
  (`PersonProfile.claimedByUserId`) -> canonical Person Profile. Only Steward
  records and successor designations stamped with `familyId` are considered, so
  Family A never sees Family B identities. Each `StewardIdentity` carries
  `personId`, `displayName` (the family-facing identity: preferred/display name,
  falling back to the canonical full person name), `canonicalName` (the
  canonical full person name), and `accountId` (the internal account principal,
  carried only for authorization/audit and never the primary displayed
  identity). Current Stewards are those with `roleStatus == #Active`; designated
  Successors are those with `status == #Designated`. A steward or successor
  whose account/person cannot be resolved to an approved claimed Person profile
  is omitted.
- `listStewardIdentities() : async [StewardIdentity]` — query. TEMPORARY
  Tenancy 1C compatibility wrapper for `listStewardIdentitiesForFamily`,
  delegating with the default family id (`\"norwood\"`). Family Steward only.
  Returns each current Steward and designated Successor of the default family
  enriched with the linked approved Person identity, as described above.
- `listEligibleStewardCandidates() : async [StewardIdentity]` — query. Family
  Steward only. Returns the eligible promotion/successor candidate list: all
  people who are living, have an APPROVED/CLAIMED profile
  (`claimStatus == #Claimed`), are linked to a valid account
  (`claimedByUserId` is set), are not already an active Steward, and are not
  archived. This is data-driven — as additional family members claim and receive
  approval they automatically appear without code changes. Each candidate is a
  `StewardIdentity` as described above.
- `requestProfileRemovalForFamily(familyId : Text, personId : Text, reason : Text) : async Result<ProfileRemovalRequest, RemovalError>` —
  update. Requests removal of a profile in `familyId`. The target profile must
  belong to `familyId`, and the request is stamped with `familyId`, so a
  `personId` alone never crosses a family boundary. Returns `#err(#NotSignedIn)`
  for an anonymous caller, `#err(#ProfileNotFound)` when the person is not
  tracked in `familyId`, `#err(#DeceasedProfile)` for a deceased profile,
  `#err(#NotOwner)` when the caller is not the profile's owner, and
  `#err(#AlreadyPending)` when a pending removal request already exists for that
  person in `familyId`.
- `requestProfileRemoval(personId : Text, reason : Text) : async Result<ProfileRemovalRequest, RemovalError>` —
  update. TEMPORARY Tenancy 1C compatibility wrapper for
  `requestProfileRemovalForFamily`, delegating with the default family id
  (`\"norwood\"`). A claimed living profile owner requests removal of their own
  profile; a Family Steward reviews the request. Returns `#err(#NotSignedIn)` for
  an anonymous caller, `#err(#ProfileNotFound)` when the person is not tracked,
  `#err(#DeceasedProfile)` for a deceased profile, `#err(#NotOwner)` when the
  caller is not the profile's owner, and `#err(#AlreadyPending)` when a pending
  removal request already exists for that person.
- `listProfileRemovalRequestsForFamily(familyId : Text) : async [ProfileRemovalRequest]` —
  query. Active Steward of `familyId` only. Lists the profile removal requests of
  `familyId` for review; a request stamped with another family is never returned.
- `listProfileRemovalRequests() : async [ProfileRemovalRequest]` — query.
  TEMPORARY Tenancy 1C compatibility wrapper for
  `listProfileRemovalRequestsForFamily`, delegating with the default family id
  (`\"norwood\"`). Family Steward only. Lists all profile removal requests for
  review.
- `approveProfileRemovalForFamily(familyId : Text, requestId : Nat) : async ?ProfileRemovalRequest` —
  update. Active Steward of `familyId` only. Approves a pending removal request
  in `familyId`, archiving the profile. The request must belong to `familyId`, so
  a request id alone never crosses a family boundary. Returns the updated
  request, or `null` when no pending request with that id exists in `familyId`.
- `approveProfileRemoval(requestId : Nat) : async ?ProfileRemovalRequest` —
  update. TEMPORARY Tenancy 1C compatibility wrapper for
  `approveProfileRemovalForFamily`, delegating with the default family id
  (`\"norwood\"`). Family Steward only. Approves a pending removal request,
  archiving the profile. Returns the updated request, or `null` when no pending
  request with that id exists.
- `rejectProfileRemovalForFamily(familyId : Text, requestId : Nat) : async ?ProfileRemovalRequest` —
  update. Active Steward of `familyId` only. Rejects a pending removal request in
  `familyId`. The request must belong to `familyId`, so a request id alone never
  crosses a family boundary. Returns the updated request, or `null` when no
  pending request with that id exists in `familyId`.
- `rejectProfileRemoval(requestId : Nat) : async ?ProfileRemovalRequest` —
  update. TEMPORARY Tenancy 1C compatibility wrapper for
  `rejectProfileRemovalForFamily`, delegating with the default family id
  (`\"norwood\"`). Family Steward only. Rejects a pending removal request.
  Returns the updated request, or `null` when no pending request with that id
  exists.
- `archiveProfileForFamily(familyId : Text, personId : Text) : async Result<(), ArchiveError>` —
  update. Active Steward of `familyId` only. Archives a profile in `familyId`,
  removing it from normal family browsing while preserving relationships, media,
  timeline, sources, and ownership history. The target profile must belong to
  `familyId`, so a `personId` alone never crosses a family boundary. Returns
  `#err(#ProfileNotFound)` when the person is not tracked in `familyId` and
  `#err(#AlreadyArchived)` when already archived.
- `archiveProfile(personId : Text) : async Result<(), ArchiveError>` — update.
  TEMPORARY Tenancy 1C compatibility wrapper for `archiveProfileForFamily`,
  delegating with the default family id (`\"norwood\"`). Family Steward only.
  Archives a profile, removing it from normal family browsing while preserving
  relationships, media, timeline, sources, and ownership history. Returns
  `#err(#ProfileNotFound)` when the person is not tracked and
  `#err(#AlreadyArchived)` when already archived.
- `restoreProfileForFamily(familyId : Text, personId : Text) : async Result<(), ArchiveError>` —
  update. Active Steward of `familyId` only. Restores an archived profile in
  `familyId` to normal family browsing. The target profile must belong to
  `familyId`, so a `personId` alone never crosses a family boundary. Returns
  `#err(#NotArchived)` when the profile is not archived in `familyId`.
- `restoreProfile(personId : Text) : async Result<(), ArchiveError>` — update.
  TEMPORARY Tenancy 1C compatibility wrapper for `restoreProfileForFamily`,
  delegating with the default family id (`\"norwood\"`). Family Steward only.
  Restores an archived profile to normal family browsing. Returns
  `#err(#NotArchived)` when the profile is not archived.
- `listArchivedProfilesForFamily(familyId : Text) : async [PersonProfile]` —
  query. Active Steward of `familyId` only. Lists the archived profiles of
  `familyId`; only archived profiles belonging to `familyId` are returned.
- `listArchivedProfiles() : async [PersonProfile]` — query. TEMPORARY Tenancy 1C
  compatibility wrapper for `listArchivedProfilesForFamily`, delegating with the
  default family id (`\"norwood\"`). Family Steward only. Lists the profiles
  currently archived.
- `listArchivedProfileIdsForFamily(familyId : Text) : async [PersonId]` — query.
  Not gated to stewards — any caller may read archived ids. Returns the ids of
  the archived profiles of `familyId` so normal family browsing can filter them
  out; only archived ids whose profile belongs to `familyId` are returned, so one
  family's archived ids never hide another family's profiles.
- `listArchivedProfileIds() : async [PersonId]` — query. TEMPORARY Tenancy 1C
  compatibility wrapper for `listArchivedProfileIdsForFamily`, delegating with
  the default family id (`\"norwood\"`). Not gated to stewards. Returns the ids of
  the archived profiles of the default family.
- `getArchivedProfileForFamily(familyId : Text, personId : Text) : async ?PersonProfile` —
  query. Active Steward of `familyId` only. Returns the archived profile for
  `personId` in `familyId`, or `null` when the person is not archived in that
  family. A `personId` alone never crosses a family boundary.
- `permanentlyDeleteProfileForFamily(familyId : Text, personId : Text, confirmation : Bool) : async Result<(), DeleteError>` —
  update. Active Steward of `familyId` only. Permanently deletes a profile in
  `familyId` only when it is empty of archive items, media, timeline/history,
  approved relationships, and ownership history, and explicit confirmation is
  given. The target profile must belong to `familyId`, so a `personId` alone
  never crosses a family boundary. Returns `#err(#ConfirmationRequired)` when
  `confirmation` is `false`, `#err(#HasTimeline)` when the profile has timeline
  entries, `#err(#HasApprovedRelationships)` when it has confirmed
  relationships, `#err(#HasOwnershipHistory)` when it is claimed or has a
  claiming owner, and `#err(#ProfileNotFound)` when the person is not tracked in
  `familyId`.
- `permanentlyDeleteProfile(personId : Text, confirmation : Bool) : async Result<(), DeleteError>` —
  update. TEMPORARY Tenancy 1C compatibility wrapper for
  `permanentlyDeleteProfileForFamily`, delegating with the default family id
  (`\"norwood\"`). Family Steward only. Permanently deletes a profile only when it
  is empty of archive items, media, timeline/history, approved relationships, and
  ownership history, and explicit confirmation is given. Returns
  `#err(#ConfirmationRequired)` when `confirmation` is `false`,
  `#err(#HasTimeline)` when the profile has timeline entries,
  `#err(#HasApprovedRelationships)` when it has confirmed relationships,
  `#err(#HasOwnershipHistory)` when it is claimed or has a claiming owner, and
  `#err(#ProfileNotFound)` when the person is not tracked.
- `listDuplicateCandidatesForFamily(familyId : Text) : async [DuplicatePair]` —
  query. Active Steward of `familyId` only. Lists suspected duplicate Person
  records of `familyId` with comparison data (names, birth/death details,
  parents, spouses, children, claim status, owner account, and timeline counts).
  Only profiles belonging to `familyId` are compared, so a Family A duplicate
  candidate never includes a Family B profile.
- `listDuplicateCandidates() : async [DuplicatePair]` — query. TEMPORARY Tenancy
  1C compatibility wrapper for `listDuplicateCandidatesForFamily`, delegating
  with the default family id (`\"norwood\"`). Family Steward only. Lists suspected
  duplicate Person records with comparison data (names, birth/death details,
  parents, spouses, children, claim status, owner account, and timeline counts).
- `notDuplicateForFamily(familyId : Text, personIdA : Text, personIdB : Text) : async Result<(), MergeError>` —
  update. Active Steward of `familyId` only. Marks two suspected duplicates in
  `familyId` as not a duplicate. Both people must belong to `familyId`, and the
  dismissal is stamped with `familyId`, so a dismissal in one family never hides
  a candidate in another.
- `notDuplicate(personIdA : Text, personIdB : Text) : async Result<(), MergeError>` —
  update. TEMPORARY Tenancy 1C compatibility wrapper for `notDuplicateForFamily`,
  delegating with the default family id (`\"norwood\"`). Family Steward only.
  Marks two suspected duplicates as not a duplicate.
- `mergeProfilesForFamily(familyId : Text, canonicalPersonId : Text, mergedAwayPersonId : Text) : async Result<MergeResult, MergeError>` —
  update. Active Steward of `familyId` only. Merges two duplicate profiles in
  `familyId` into one canonical record, moving/linking all valid relationships,
  media, timeline, stories, sources, archive references, and ownership/claim
  history without duplicating shared items. Both profiles must belong to
  `familyId`, so a merge never crosses families and Family B remains unchanged.
  Conflicting fields are preserved as conflict/review items. The merged-away
  record is archived rather than hard-deleted. Returns `#err(#SameProfile)` when
  both ids are equal and `#err(#ProfileNotFound)` when either person is not
  tracked in `familyId`.
- `mergeProfiles(canonicalPersonId : Text, mergedAwayPersonId : Text) : async Result<MergeResult, MergeError>` —
  update. TEMPORARY Tenancy 1C compatibility wrapper for `mergeProfilesForFamily`,
  delegating with the default family id (`\"norwood\"`). Family Steward only.
  Merges two duplicate profiles into one canonical record, moving/linking all
  valid relationships, media, timeline, stories, sources, archive references, and
  ownership/claim history without duplicating shared items. Conflicting fields
  are preserved as conflict/review items. The merged-away record is archived
  rather than hard-deleted. Returns `#err(#SameProfile)` when both ids are equal
  and `#err(#ProfileNotFound)` when either person is not tracked.
- `resolveMergeConflictForFamily(familyId : Text, conflictId : Nat, canonicalValue : Text) : async ?MergeConflict` —
  update. Active Steward of `familyId` only. Resolves a merge conflict in
  `familyId` by choosing the canonical display value. The conflict must belong to
  `familyId`, so a conflict id alone never crosses a family boundary. Returns the
  updated conflict, or `null` when no pending conflict with that id exists in
  `familyId`.
- `resolveMergeConflict(conflictId : Nat, canonicalValue : Text) : async ?MergeConflict` —
  update. TEMPORARY Tenancy 1C compatibility wrapper for
  `resolveMergeConflictForFamily`, delegating with the default family id
  (`\"norwood\"`). Family Steward only. Resolves a merge conflict by choosing the
  canonical display value. Returns the updated conflict, or `null` when no
  pending conflict with that id exists.
- `listPersonRelationshipsForFamily(familyId : Text, personId : Text) : async [Relationship]` —
  query. Active Steward of `familyId` only. Returns the current relationships
  for a person in `familyId`. The target profile must belong to `familyId`, and
  only relationships stamped with `familyId` are returned, so a `personId` alone
  never crosses a family boundary and Family A never sees Family B
  relationships. Existing relationship ordering and record shape are preserved.
  Returns `[]` when the person does not belong to `familyId`.
- `listPersonRelationships(personId : Text) : async [Relationship]` — query.
  TEMPORARY Tenancy 1C compatibility wrapper for
  `listPersonRelationshipsForFamily`, delegating with the default family id
  (`\"norwood\"`). Family Steward only. Returns the current relationships for a
  person in the default family.
- `addRelationshipForFamily(familyId : Text, fromPersonId : Text, toPersonId : Text, relationshipType : RelationshipType) : async Result<Relationship, RelationshipAdminError>` —
  update. Active Steward of `familyId` only. Adds a missing relationship to
  `familyId`'s family graph. Both people must belong to `familyId`, the duplicate
  check is filtered by `familyId`, and the new `Relationship` is stamped with
  `familyId`, so no cross-family relationship edge can be created. Returns
  `#err(#PersonNotFound)` when either person does not belong to `familyId` and
  `#err(#DuplicateRelationship)` when an identical relationship already exists in
  `familyId`.
- `addRelationship(fromPersonId : Text, toPersonId : Text, relationshipType : RelationshipType) : async Result<Relationship, RelationshipAdminError>` —
  update. TEMPORARY Tenancy 1C compatibility wrapper for
  `addRelationshipForFamily`, delegating with the default family id
  (`\"norwood\"`). Family Steward only. Adds a missing relationship to the shared
  family graph. Returns `#err(#DuplicateRelationship)` when an identical
  relationship already exists.
- `removeRelationshipForFamily(familyId : Text, relationshipId : Nat) : async Result<(), RelationshipAdminError>` —
  update. Active Steward of `familyId` only. Removes an incorrect relationship
  from `familyId`'s family graph. The relationship must belong to `familyId`, so
  a `relationshipId` alone never crosses a family boundary and only that
  family's relationship is removed. Existing audit/governance behavior is
  preserved. Returns `#err(#RelationshipNotFound)` when no relationship with that
  id belongs to `familyId`.
- `removeRelationship(relationshipId : Nat) : async Result<(), RelationshipAdminError>` —
  update. TEMPORARY Tenancy 1C compatibility wrapper for
  `removeRelationshipForFamily`, delegating with the default family id
  (`\"norwood\"`). Family Steward only. Removes an incorrect relationship from the
  shared family graph. Returns `#err(#RelationshipNotFound)` when no relationship
  with that id exists.
- `correctRelationshipTypeForFamily(familyId : Text, relationshipId : Nat, relationshipType : RelationshipType) : async Result<Relationship, RelationshipAdminError>` —
  update. Active Steward of `familyId` only. Corrects the relationship type of an
  existing relationship in `familyId`. The relationship must belong to
  `familyId` and both referenced people must still belong to `familyId`, so a
  `relationshipId` alone never crosses a family boundary and only that family's
  relationship is updated. Existing correction/audit semantics are preserved.
  Returns `#err(#RelationshipNotFound)` when no relationship with that id belongs
  to `familyId` and `#err(#PersonNotFound)` when either referenced person no
  longer belongs to `familyId`.
- `correctRelationshipType(relationshipId : Nat, relationshipType : RelationshipType) : async Result<Relationship, RelationshipAdminError>` —
  update. TEMPORARY Tenancy 1C compatibility wrapper for
  `correctRelationshipTypeForFamily`, delegating with the default family id
  (`\"norwood\"`). Family Steward only. Corrects the relationship type of an
  existing relationship. Returns `#err(#RelationshipNotFound)` when no
  relationship with that id exists.
- `listAuditHistoryForFamily(familyId : Text) : async [AuditEntry]` — query.
  Active Steward of `familyId` only; a Steward of one family can never read
  another family's audit history. Returns only the governance audit entries
  whose `familyId` equals `familyId`, preserving the existing entry shape,
  chronological ordering, and action labels/details.
- `listAuditHistory() : async [AuditEntry]` — query. TEMPORARY Tenancy 1C
  compatibility wrapper for `listAuditHistoryForFamily`, delegating with the
  default family id (`\"norwood\"`). Family Steward only. Returns the governance
  audit log of the default family. Audit History is strictly steward-only.
- `getStewardAuditHistoryForFamily(familyId : Text) : async [StewardAuditEntry]` —
  query. Active Steward of `familyId` only; a Steward of one family can never
  read another family's audit history. Returns the merged Family Steward Audit
  History for `familyId`: every governance audit entry belonging to `familyId`
  plus every conflict-resolution action (Keep Existing, Replace Existing,
  Preserve Both/Unresolved, Needs Research) belonging to `familyId`, merged
  chronologically, newest first, without duplicating records. Both sources are
  filtered by `familyId` before merging, so Family A audit activity is never
  returned through Family B. Each conflict-resolution entry is enriched from its
  linked Conflict Review item so it carries the affected person, disputed field,
  existing value, proposed value, resolution action, steward notes, steward
  identity (the resolving steward's account principal), timestamp, and
  provenance/source refs where available. Governance audit entries carry their
  own `familyId` tenant-boundary field, stamped when the entry is appended, so
  each entry belongs directly to the family it acted on; it is additionally
  attributed to `familyId` through the family-scoped data it references when at
  least one of its affected people belongs to that family (a profile or an
  approved claim in that family). The default Norwood family is the legacy
  family tree, so every governance entry attributes to it, preserving the
  pre-tenancy default behavior; a non-default family only ever receives entries
  whose affected people are tracked in that family, so an entry with no affected
  people (such as a steward removal) never leaks into a non-default history.
  This is a computed read over the existing governance audit log and research
  audit log — it does not add or alter any persisted records, and the existing
  `listAuditHistory` endpoint is unchanged.
- `getStewardAuditHistory() : async [StewardAuditEntry]` — query. TEMPORARY
  Tenancy 1C compatibility wrapper for `getStewardAuditHistoryForFamily`,
  delegating with the default family id (`\"norwood\"`). Family Steward of the
  default family only. Returns the merged Family Steward Audit History for the
  default family, with the same entry shapes, chronological ordering, and
  conflict-resolution enrichment described above. It contains no merge logic of
  its own and will be removed once every caller passes an explicit `familyId`.

### Family Stories, Family Mysteries, and Travel Through Time

The Family Stories surface is family-scoped. Every canonical Story endpoint takes
an explicit `familyId` as its first argument and only ever reads or mutates a
story whose `familyId` equals it, so a `storyId` alone never crosses a family
boundary: a foreign-family id behaves exactly like a not-found id (`?null` or
`[]`), never a distinguishable error that would leak another family's existence.
The legacy no-`familyId` Story endpoints listed after the canonical ones are
TEMPORARY Tenancy 1C compatibility wrappers that delegate with the default
Norwood family (`\"norwood\"`); they contain no logic of their own and will be
removed in a later build once every caller passes an explicit `familyId`.

Family Mysteries are family-scoped. Every canonical Mystery endpoint takes an
explicit `familyId` as its first argument and only ever reads or mutates a
mystery or contribution whose `familyId` equals it, so a `mysteryId` or
`contributionId` alone never crosses a family boundary: a foreign-family id
behaves exactly like a not-found id (`?null` or `[]`), never a distinguishable
error that would leak another family's existence. The legacy no-`familyId`
Mystery endpoints listed after the canonical ones are TEMPORARY Tenancy 1C
compatibility wrappers that delegate with the default Norwood family
(`\"norwood\"`); they contain no logic of their own and will be removed in a
later build once every caller passes an explicit `familyId`.

Canonical family-scoped Mystery methods:

- `listMysteriesForFamily(familyId : Text) : async [Mystery]` — query. Returns
  every mystery in `familyId`, newest first. Requires an approved member or
  active Steward of `familyId`; anonymous and signed-in but unapproved callers
  are rejected with a trap. A mystery whose `familyId` differs is never returned,
  so Family A mysteries never appear in a Family B call. Each mystery keeps
  `knownFacts`, `possibilities`, and `relatedSourceIds`/`relatedArchiveItemIds`
  separate so a theory never silently becomes a confirmed fact.
- `getMysteryForFamily(familyId : Text, mysteryId : Nat) : async ?Mystery` —
  query. Requires an approved member or active Steward of `familyId`. Returns the
  mystery with `mysteryId` when it belongs to `familyId`, or `null` otherwise. A
  mystery that exists under another family is never returned, so a `mysteryId`
  alone cannot cross the family boundary.
- `listMysteryContributionsForFamily(familyId : Text, mysteryId : Nat) : async [MysteryContribution]` —
  query. Requires an approved member or active Steward of `familyId`. Returns
  every contribution to `mysteryId` in `familyId`. A contribution whose
  `familyId` differs, or whose target mystery belongs to another family, is never
  returned.
- `listPendingMysteryContributionsForFamily(familyId : Text) : async [MysteryContribution]` —
  query. Active Steward of `familyId` only. Returns every mystery contribution in
  `familyId` currently in `#Pending` state. A contribution whose `familyId`
  differs is never returned.
- `submitMysteryContributionForFamily(familyId : Text, mysteryId : Nat, contributionType : MysteryContributionType, text : Text) : async MysteryContribution` —
  update. Submits a mystery contribution (a note, memory, possible lead, or
  source/document reference) to a mystery in `familyId`. Requires an approved
  member or active Steward of `familyId`; anonymous and signed-in but unapproved
  callers are rejected with a trap. The target mystery must belong to `familyId`
  — a Family A member can never contribute to a Family B mystery, and a
  foreign-family `mysteryId` traps with `\"Mystery not found\"`. The caller is
  recorded as the `contributor`, and the stored contribution's `familyId` is the
  requested `familyId`. The contribution is stored in `#Pending` state and waits
  for a Steward of `familyId` to review it before altering the canonical mystery
  record.
- `reviewMysteryContributionForFamily(familyId : Text, id : Nat, approve : Bool) : async ?MysteryContribution` —
  update. Active Steward of `familyId` only; a Steward of another family cannot
  review the contribution. Approves or rejects a pending mystery contribution in
  `familyId`, recording the reviewer and review time. Returns the updated
  contribution, or `null` when no pending contribution with that id belongs to
  `familyId`.
- `createCanonicalMysteryForFamily(familyId : Text, title : Text, description : Text, relatedMemberIds : [Text], relatedBranchId : ?Text, knownFacts : [Text], possibilities : [Text], relatedSourceIds : [Nat], relatedArchiveItemIds : [Nat], status : MysteryStatus) : async Mystery` —
  update. Active Steward of `familyId` only. Creates a canonical mystery directly
  in `familyId`. The new mystery's `familyId` is the requested `familyId`; every
  related person must belong to `familyId`, and every linked Archive media id
  must belong to `familyId`.
- `updateCanonicalMysteryForFamily(familyId : Text, id : Nat, title : Text, description : Text, relatedMemberIds : [Text], relatedBranchId : ?Text, knownFacts : [Text], possibilities : [Text], relatedSourceIds : [Nat], relatedArchiveItemIds : [Nat], status : MysteryStatus) : async ?Mystery` —
  update. Active Steward of `familyId` only; a Steward of another family cannot
  edit the mystery. Edits a canonical mystery in `familyId`, preserving its
  original `contributor`, `createdAt`, and any existing `resolution`. Returns the
  updated mystery, or `null` when no mystery with that id belongs to `familyId`.
- `markMysteryResolvedForFamily(familyId : Text, id : Nat, summary : Text, supportingEvidence : [Text]) : async ?Mystery` —
  update. Active Steward of `familyId` only; a Steward of another family cannot
  resolve the mystery. Marks a mystery in `familyId` `#Resolved`, recording a
  resolution summary and supporting evidence while preserving the prior
  theories/history (the research trail is never deleted). Returns the updated
  mystery, or `null` when no mystery with that id belongs to `familyId`.
- `listTimelineEventsForFamily(familyId : Text) : async [TimelineEvent]` — query.
  Requires an approved member or active Steward of `familyId`. Returns timeline
  events aggregated from existing canonical data in `familyId` only: PersonProfile
  timeline entries, ArchiveItem year/era, Story era/date, and Mystery records.
  Empty eras are never fabricated. Each event carries an evidence badge and a link
  target (Person Profile, Story, Archive Item, or Mystery).

The following single-family endpoints are TEMPORARY Tenancy 1C compatibility
wrappers. Each delegates to its family-scoped counterpart with the default family
id (`\"norwood\"`), so current Norwood behavior is unchanged. They contain no
business logic of their own.

- `listMysteries() : async [Mystery]` — query. TEMPORARY Tenancy 1C compatibility
  wrapper for `listMysteriesForFamily`, delegating with the default family id
  (`\"norwood\"`). Preserves the pre-tenancy behavior exactly: it is an ungated
  public query. Returns all mysteries (visible to viewers). Each mystery keeps
  `knownFacts`, `possibilities`, and
  `relatedSourceIds`/`relatedArchiveItemIds` separate so a theory never silently
  becomes a confirmed fact.
- `submitMysteryContribution(mysteryId : Nat, contributionType : MysteryContributionType, text : Text) : async MysteryContribution` —
  update. TEMPORARY Tenancy 1C compatibility wrapper for
  `submitMysteryContributionForFamily`, delegating with the default family id
  (`\"norwood\"`). Submits a mystery contribution (a note, memory, possible lead,
  or source/document reference). Requires an approved family member (a caller
  holding at least one `#Approved` profile claim, or a Family Steward);
  anonymous and signed-in but unapproved callers are rejected with a trap. The
  caller is recorded as the `contributor`. The contribution is stored in
  `#Pending` state and waits for a Family Steward to review it before altering
  the canonical mystery record.
- `listPendingMysteryContributions() : async [MysteryContribution]` — query.
  TEMPORARY Tenancy 1C compatibility wrapper for
  `listPendingMysteryContributionsForFamily`, delegating with the default family
  id (`\"norwood\"`). Family Steward only. Returns all mystery contributions
  currently in `#Pending` state.
- `reviewMysteryContribution(id : Nat, approve : Bool) : async ?MysteryContribution` —
  update. TEMPORARY Tenancy 1C compatibility wrapper for
  `reviewMysteryContributionForFamily`, delegating with the default family id
  (`\"norwood\"`). Family Steward only. Approves or rejects a pending mystery
  contribution, recording the reviewer and review time. Returns the updated
  contribution, or `null` when no pending contribution with that id exists.
- `createCanonicalMystery(title : Text, description : Text, relatedMemberIds : [Text], relatedBranchId : ?Text, knownFacts : [Text], possibilities : [Text], relatedSourceIds : [Nat], relatedArchiveItemIds : [Nat], status : MysteryStatus) : async Mystery` —
  update. TEMPORARY Tenancy 1C compatibility wrapper for
  `createCanonicalMysteryForFamily`, delegating with the default family id
  (`\"norwood\"`). Family Steward only. Creates a canonical mystery directly.
- `updateCanonicalMystery(id : Nat, title : Text, description : Text, relatedMemberIds : [Text], relatedBranchId : ?Text, knownFacts : [Text], possibilities : [Text], relatedSourceIds : [Nat], relatedArchiveItemIds : [Nat], status : MysteryStatus) : async ?Mystery` —
  update. TEMPORARY Tenancy 1C compatibility wrapper for
  `updateCanonicalMysteryForFamily`, delegating with the default family id
  (`\"norwood\"`). Family Steward only. Edits a canonical mystery, preserving its
  original `contributor`, `createdAt`, and any existing `resolution`. Returns the
  updated mystery, or `null` when no mystery with that id exists.
- `markMysteryResolved(id : Nat, summary : Text, supportingEvidence : [Text]) : async ?Mystery` —
  update. TEMPORARY Tenancy 1C compatibility wrapper for
  `markMysteryResolvedForFamily`, delegating with the default family id
  (`\"norwood\"`). Family Steward only. Marks a mystery `#Resolved`, recording a
  resolution summary and supporting evidence while preserving the prior
  theories/history (the research trail is never deleted). Returns the updated
  mystery, or `null` when no mystery with that id exists.
- `listTimelineEvents() : async [TimelineEvent]` — query. TEMPORARY Tenancy 1C
  compatibility wrapper for `listTimelineEventsForFamily`, delegating with the
  default family id (`\"norwood\"`). Preserves the pre-tenancy behavior exactly:
  it is an ungated public query. Returns timeline events aggregated from
  existing canonical data only: PersonProfile timeline entries, ArchiveItem
  year/era, Story era/date, and Mystery records. Empty eras are never fabricated.
  Each event carries an evidence badge and a link target (Person Profile, Story,
  Archive Item, or Mystery).

Canonical family-scoped Story methods:

- `listStoriesForFamily(familyId : Text) : async [Story]` — query. Returns every
  story in `familyId`, newest first. Requires an approved member or active
  Steward of `familyId`; anonymous and signed-in but unapproved callers are
  rejected with a trap. A story whose `familyId` differs is never returned, so
  Family A stories never appear in a Family B call.
- `getStoryForFamily(familyId : Text, storyId : Nat) : async ?Story` — query.
  Requires an approved member or active Steward of `familyId`. Returns the story
  with `storyId` when it belongs to `familyId`, or `null` otherwise. A story that
  exists under another family is never returned, so a `storyId` alone cannot
  cross the family boundary.
- `listPendingStoriesForFamily(familyId : Text) : async [Story]` — query. Active
  Steward of `familyId` only. Returns every story in `familyId` currently in
  `#Pending` state. A story whose `familyId` differs is never returned.
- `listApprovedStoriesForFamily(familyId : Text) : async [Story]` — query.
  Requires an approved member or active Steward of `familyId`. Returns every
  approved story in `familyId` (the stories visible to viewers). A story whose
  `familyId` differs is never returned.
- `submitStoryForFamily(familyId : Text, title : Text, storyText : Text, relatedMemberIds : [Text], era : ?Text, year : ?Nat, location : ?Text, evidenceStatus : EvidenceStatus, relatedArchiveItemIds : [Nat]) : async Story` —
  update. Submits a new story into `familyId`. Requires an approved member or
  active Steward of `familyId`; anonymous and signed-in but unapproved callers
  are rejected with a trap. The caller is recorded as the `contributor`. The
  stored story's `familyId` is the requested `familyId`, and every
  `relatedMemberIds` entry must belong to that same family — Family A may never
  reference Family B people; a related member that does not belong to `familyId`
  traps with `\"Unauthorized: Related family members must belong to the same
  family\"` and stores nothing. Every `relatedMemberIds` entry must also resolve
  to an existing person in `familyId`; a related member that does not exist
  traps with `\"Related family member not found\"` and stores nothing. Every
  `relatedArchiveItemIds` entry must resolve
  to an Archive item in `familyId`; a media id from another family traps with
  `\"Unauthorized: Linked media must belong to the same family\"`. The story is
  stored in `#Pending` state and waits for a Steward of `familyId` to approve it
  before becoming visible. `evidenceStatus` carries the evidence distinction
  (`#Documented`, `#FamilyHistory`, `#PersonalMemory`, `#Unresolved`) — Family
  History and Personal Memory are never presented as documented fact. Submitting
  a story never overwrites a person's profile story text.
- `addCanonicalStoryForFamily(familyId : Text, title : Text, storyText : Text, relatedMemberIds : [Text], era : ?Text, year : ?Nat, location : ?Text, evidenceStatus : EvidenceStatus, relatedArchiveItemIds : [Nat]) : async Story` —
  update. Active Steward of `familyId` only. Adds a canonical story directly into
  `familyId`, already in `#Approved` state. The same related-person and
  linked-media family-boundary rules as `submitStoryForFamily` apply.
- `updateCanonicalStoryForFamily(familyId : Text, id : Nat, title : Text, storyText : Text, relatedMemberIds : [Text], era : ?Text, year : ?Nat, location : ?Text, evidenceStatus : EvidenceStatus, relatedArchiveItemIds : [Nat]) : async ?Story` —
  update. Active Steward of `familyId` only; a Steward of another family cannot
  edit the story. Edits a canonical story in `familyId`, preserving its original
  `contributor` and `createdAt`. Returns the updated story, or `null` when no
  story with that id belongs to `familyId`. A story in another family is never
  touched.
- `approveStoryForFamily(familyId : Text, storyId : Nat) : async ?Story` —
  update. Active Steward of `familyId` only; a Steward of another family cannot
  approve the story. Moves a pending story in `familyId` to `#Approved` state and
  returns the updated story, or `null` when no pending story with that id belongs
  to `familyId`. A story in another family is never touched.
- `rejectStoryForFamily(familyId : Text, storyId : Nat) : async ?Story` —
  update. Active Steward of `familyId` only; a Steward of another family cannot
  reject the story. Moves a pending story in `familyId` to `#Rejected` state and
  returns the updated story, or `null` when no pending story with that id belongs
  to `familyId`. A story in another family is never touched.

The following single-family Story endpoints are TEMPORARY Tenancy 1C
compatibility wrappers. Each delegates to its family-scoped counterpart with the
default family id (`\"norwood\"`), so current Norwood behavior is unchanged. They
contain no business logic of their own.

- `listApprovedStories() : async [Story]` — query. TEMPORARY Tenancy 1C
  compatibility wrapper for `listApprovedStoriesForFamily`, delegating with the
  default family id (`\"norwood\"`). Returns all stories in `#Approved` state
  (the stories visible to viewers). Stories reference existing person ids and
  archive item ids; they never create duplicate Person records.
- `listPendingStories() : async [Story]` — query. TEMPORARY Tenancy 1C
  compatibility wrapper for `listPendingStoriesForFamily`, delegating with the
  default family id (`\"norwood\"`). Family Steward only. Returns all stories
  currently in `#Pending` state.
- `submitStory(title : Text, storyText : Text, relatedMemberIds : [Text], era : ?Text, year : ?Nat, location : ?Text, evidenceStatus : EvidenceStatus, relatedArchiveItemIds : [Nat]) : async Story` —
  update. TEMPORARY Tenancy 1C compatibility wrapper for `submitStoryForFamily`,
  delegating with the default family id (`\"norwood\"`). Submits a new story.
  Requires an approved family member (a caller holding at least one `#Approved`
  profile claim, or a Family Steward); anonymous and signed-in but unapproved
  callers are rejected with a trap. The caller is recorded as the `contributor`.
  The story is stored in `#Pending` state and waits for a Family Steward to
  approve it before becoming visible. `evidenceStatus` carries the evidence
  distinction (`#Documented`, `#FamilyHistory`, `#PersonalMemory`,
  `#Unresolved`) — Family History and Personal Memory are never presented as
  documented fact. Submitting a story never overwrites a person's profile story
  text.
- `approveStory(id : Nat) : async ?Story` — update. TEMPORARY Tenancy 1C
  compatibility wrapper for `approveStoryForFamily`, delegating with the default
  family id (`\"norwood\"`). Family Steward only. Moves a pending story to
  `#Approved` state and returns the updated story, or `null` when no pending
  story with that id exists.
- `rejectStory(id : Nat) : async ?Story` — update. TEMPORARY Tenancy 1C
  compatibility wrapper for `rejectStoryForFamily`, delegating with the default
  family id (`\"norwood\"`). Family Steward only. Moves a pending story to
  `#Rejected` state and returns the updated story, or `null` when no pending
  story with that id exists.
- `addCanonicalStory(title : Text, storyText : Text, relatedMemberIds : [Text], era : ?Text, year : ?Nat, location : ?Text, evidenceStatus : EvidenceStatus, relatedArchiveItemIds : [Nat]) : async Story` —
  update. TEMPORARY Tenancy 1C compatibility wrapper for
  `addCanonicalStoryForFamily`, delegating with the default family id
  (`\"norwood\"`). Family Steward only. Adds a canonical story directly, already
  in `#Approved` state.
- `updateCanonicalStory(id : Nat, title : Text, storyText : Text, relatedMemberIds : [Text], era : ?Text, year : ?Nat, location : ?Text, evidenceStatus : EvidenceStatus, relatedArchiveItemIds : [Nat]) : async ?Story` —
  update. TEMPORARY Tenancy 1C compatibility wrapper for
  `updateCanonicalStoryForFamily`, delegating with the default family id
  (`\"norwood\"`). Family Steward only. Edits a canonical story, preserving its
  original `contributor` and `createdAt`. Returns the updated story, or `null`
  when no story with that id exists.

### Family Recipes

The recipes surface is family-scoped. Every canonical endpoint takes an explicit
`familyId` as its first argument and only ever reads or mutates a recipe whose
`familyId` equals it, so a `recipeId` alone never crosses a family boundary: a
foreign-family id behaves exactly like a not-found id (`?null` or `[]`), never a
distinguishable error that would leak another family's existence. The legacy
no-`familyId` endpoints listed after the canonical ones are TEMPORARY Tenancy 1C
compatibility wrappers that delegate with the default Norwood family
(`\"norwood\"`); they contain no logic of their own and will be removed in a
later build once every caller passes an explicit `familyId`.

- `submitRecipeForFamily(familyId : FamilyId, title : Text, shortDescription : Text, originatingPersonId : Text, relatedPersonIds : [Text], era : ?Text, year : ?Nat, location : ?Text, familyBranch : ?Text, ingredients : [Text], instructions : Text, familyStory : ?Text, tags : [Text], privacyLevel : PrivacyLevel, evidenceStatus : EvidenceStatus, linkedMediaIds : [Nat]) : async Recipe` —
  update. Submits a new family recipe into `familyId`. Requires an approved
  member or Steward of `familyId`; a member of one family cannot submit into
  another. The new recipe's `familyId` is the requested `familyId`, the caller is
  recorded as the `contributorAccountId`, and the recipe is stored in `#Pending`
  state. `originatingPersonId` and every `relatedPersonIds` entry must belong to
  `familyId`, and every `linkedMediaIds` entry must resolve to an Archive item in
  `familyId`; a foreign-family person or media id is rejected with a trap. The
  reserved future-ready fields (`ocrText`, `transcript`, `extractedIngredients`,
  `aiDerivedText`) are initialized to `null` and are not populated by any logic
  yet.
- `publishRecipeForFamily(familyId : FamilyId, ...) : async Recipe` — update.
  Active Steward of `familyId` only. Publishes a canonical recipe directly into
  `familyId`, already in `#Approved` state. Same person and media family-boundary
  checks as `submitRecipeForFamily`.
- `listRecipesForFamily(familyId : FamilyId) : async [Recipe]` — query. Approved
  members of `familyId` only. Returns every recipe in `familyId`, newest first.
- `listPendingRecipesForFamily(familyId : FamilyId) : async [Recipe]` — query.
  Active Steward of `familyId` only. Returns the `#Pending` recipes in
  `familyId`.
- `listApprovedRecipesForFamily(familyId : FamilyId) : async [Recipe]` — query.
  Approved members of `familyId` only. Returns the `#Approved` recipes in
  `familyId` visible to the caller (private recipes only to their contributor or
  a Steward).
- `getRecipeForFamily(familyId : FamilyId, recipeId : Nat) : async ?Recipe` —
  query. Approved members of `familyId` only. Returns the recipe when it belongs
  to `familyId` and is visible to the caller, or `null` otherwise.
- `listRecipesForPersonForFamily(familyId : FamilyId, personId : Text) : async [Recipe]` —
  query. Approved members of `familyId` only. Returns the approved recipes in
  `familyId` linked to a person, whether as the originating member or a related
  member.
- `approveRecipeForFamily(familyId : FamilyId, recipeId : Nat) : async ?Recipe` —
  update. Active Steward of `familyId` only; a Steward of another family cannot
  approve the recipe. Moves a pending recipe in `familyId` to `#Approved` and
  returns it, or `null` when no pending recipe with that id belongs to
  `familyId`. Approval transitions the same canonical record — it never creates a
  second Recipe.
- `rejectRecipeForFamily(familyId : FamilyId, recipeId : Nat) : async ?Recipe` —
  update. Active Steward of `familyId` only. Moves a pending recipe in `familyId`
  to `#Rejected` and returns it, or `null` when no pending recipe with that id
  belongs to `familyId`.

TEMPORARY Tenancy 1C compatibility wrappers (delegate with `familyId = \"norwood\"`):
`submitRecipe`, `publishRecipe`, `listPendingRecipes`, `approveRecipe`,
`rejectRecipe`, `listApprovedRecipes`, `getRecipe`, and `listRecipesForPerson`.
Their signatures and behavior are unchanged from before tenancy.

### Family Message Board

The board is family-scoped. Every canonical endpoint takes an explicit
`familyId` as its first argument and only ever reads or mutates a post or reply
whose `familyId` equals it, so a `postId` or `replyId` alone never crosses a
family boundary: a foreign-family id behaves exactly like a not-found id. The
legacy no-`familyId` endpoints listed after the canonical ones are TEMPORARY
Tenancy 1C compatibility wrappers that delegate with the default Norwood family
(`\"norwood\"`); they contain no logic of their own and will be removed in a
later build once every caller passes an explicit `familyId`.

Authorization model: reads and creation require an approved member of `familyId`
(a caller holding at least one `#Approved` profile claim in that family) or an
active Steward of `familyId`; Steward-only actions are `listHiddenBoardPostsForFamily`,
`restoreBoardPostForFamily`, and `removeBoardReplyForFamily`; `updateBoardPostForFamily`
is author-only (the caller must be the post's `authorAccountId`); and
`archiveBoardPostForFamily` is allowed for the post author or an active Steward
of `familyId`. A Steward of one family can never moderate another family's
board.

Board gotchas:

- The family boundary is enforced by `record.familyId`, never by `postId` or
  `replyId` alone. A lookup that finds a record belonging to another family
  behaves exactly like a lookup that found nothing: the single-record reads
  (`getBoardPostForFamily`) return the existing safe not-found `?null` rather
  than a distinct error, and the mutations return `null` (or, for
  `addBoardReplyForFamily`, trap with `\"Post not found\"`) without touching the
  foreign record.
- Every related person reference (`relatedPersonIds`) and every linked media id
  (`linkedMediaIds`, `existingArchiveItemIds`, and each new upload's
  `relatedMemberIds`) must belong to the same `familyId`; a foreign-family
  reference traps with `\"Unauthorized: Related family members must belong to the
  same family\"` or `\"Unauthorized: Linked media must belong to the same family\"`
  and stores nothing.
- Family ids and principals are never exposed in user-facing errors. The
  membership and media denials carry only the stable, non-technical messages
  above, with no family id or principal detail.

Canonical family-scoped endpoints:

- `listBoardPostsForFamily(familyId : FamilyId, filter : ?PostType) : async [Post]` —
  query. Approved members of `familyId` only. Returns active posts in `familyId`,
  newest first, optionally filtered by post type.
- `searchBoardPostsByTagsForFamily(familyId : FamilyId, tags : [Text]) : async [Post]` —
  query. Approved members of `familyId` only. Returns active posts in `familyId`
  carrying ANY of the given tags.
- `getBoardPostForFamily(familyId : FamilyId, postId : PostId) : async ?Post` —
  query. Approved members of `familyId` only. Returns the active post when it
  belongs to `familyId`, or `null` otherwise (including when it exists under
  another family).
- `listHiddenBoardPostsForFamily(familyId : FamilyId) : async [Post]` — query.
  Active Steward of `familyId` only. Returns hidden (moderated) posts in
  `familyId`.
- `listBoardRepliesForFamily(familyId : FamilyId, postId : PostId) : async [Reply]` —
  query. Approved members of `familyId` only. Returns the replies to a post in
  `familyId`, chronologically; `[]` when the parent post does not belong to
  `familyId`.
- `createBoardPostForFamily(familyId : FamilyId, postType : PostType, title : ?Text, body : Text, relatedPersonIds : [Text], linkedMediaIds : [Nat], tags : [Text]) : async Post` —
  update. Approved members or Stewards of `familyId` only. Creates a post whose
  `familyId` is `familyId`; every related person and every linked media id must
  belong to `familyId`. Creates mention notifications as before.
- `updateBoardPostForFamily(familyId : FamilyId, postId : PostId, postType : PostType, title : ?Text, body : Text, relatedPersonIds : [Text], linkedMediaIds : [Nat], tags : [Text]) : async ?Post` —
  update. Approved members of `familyId` only; the caller must be the post
  author. Returns the updated post, or `null` when no post with that id belongs
  to `familyId`.
- `archiveBoardPostForFamily(familyId : FamilyId, postId : PostId) : async ?Post` —
  update. The post author or an active Steward of `familyId` may archive.
- `restoreBoardPostForFamily(familyId : FamilyId, postId : PostId) : async ?Post` —
  update. Active Steward of `familyId` only.
- `addBoardReplyForFamily(familyId : FamilyId, postId : PostId, body : Text) : async Reply` —
  update. Approved members of `familyId` only. The parent post must belong to
  `familyId`; the new reply's `familyId` is `familyId`.
- `removeBoardReplyForFamily(familyId : FamilyId, replyId : ReplyId) : async ?Reply` —
  update. Active Steward of `familyId` only.

TEMPORARY Tenancy 1C compatibility wrappers (default Norwood family only):

- `listBoardPosts(filter : ?PostType) : async [Post]` — query. Approved family
  members only. Returns all active board posts, newest first, optionally filtered
  by post type. Archived posts are never returned.
- `getBoardPost(postId : PostId) : async ?Post` — query. Approved family members
  only. Returns a single active board post by id, or `null` when it does not
  exist or is archived.
- `createBoardPost(postType : PostType, title : ?Text, body : Text, relatedPersonIds : [Text], linkedMediaIds : [Nat], tags : [Text]) : async Post` —
  update. Approved family members only. Creates a board post with a type,
  optional title, body, related family members, optional linked existing
  Archive/media ids, and free-form tags. The signed-in caller is recorded as the
  author (both the stable `authorAccountId` for authorization and the canonical
  `authorPersonId` for rendering the Person Profile identity). The post is
  created `#Active` with `privacyScope = #FamilyOnly`. A mention notification is
  created for each related member who has a linked account (other than the
  author), avoiding duplicates. `tags` is a free-form list of `Text` labels
  stored on the canonical post; it may be empty. When linking an Archive item,
  the frontend may offer/inherit that item's existing tags, but the backend does
  not duplicate Archive tags or media records — the post's `tags` are its own
  labels and `linkedMediaIds` reference canonical Archive/media records by id
  only.
- `updateBoardPost(postId : PostId, postType : PostType, title : ?Text, body : Text, relatedPersonIds : [Text], linkedMediaIds : [Nat], tags : [Text]) : async ?Post` —
  update. Approved family members only; the caller must be the post author. Edits
  the caller's own board post, replacing its `tags` with the supplied list, and
  returns the updated post, or `null` when the post does not exist. Traps with
  `\"Unauthorized: Only the post author can edit this post\"` when the caller is
  not the author.
- `searchBoardPostsByTags(tags : [Text]) : async [Post]` — query. Approved
  family members only. Returns all active board posts that carry ANY of the given
  tags (a post matches when at least one of its tags equals at least one of the
  requested tags). Returns `[]` when no active post matches, or when `tags` is
  empty. Archived (hidden) posts are never returned.
- `archiveBoardPost(postId : PostId) : async ?Post` — update. Approved family
  members only. Hides (archives) a board post as Steward moderation. The post
  author or a Family Steward may archive. Hiding removes the post from the normal
  family board while preserving the post, its replies, and its attachments; it is
  never permanently deleted through Hide. The hidden post appears only in the
  Steward-only Hidden / Moderated Posts view (`listHiddenBoardPosts`). Returns
  the updated post, or `null` when it does not exist. Traps with
  `\"Unauthorized: Only the post author or a Family Steward can archive this
  post\"` when the caller is neither. Records a `#BoardPostArchived` audit entry.
- `listHiddenBoardPosts() : async [Post]` — query. Family Steward only. Returns
  all hidden (moderated) board posts for the Steward-only Hidden / Moderated
  Posts view. Hidden posts are preserved with their replies and attachments and
  are never permanently deleted; they are searchable/filterable by title or tag
  and shown with the full post and replies intact for review before restoring.
- `restoreBoardPost(postId : PostId) : async ?Post` — update. Family Steward
  only. Unhides / restores an archived board post back to the normal family
  board. Returns the updated post, or `null` when it does not exist. Records a
  `#BoardPostRestored` audit entry. Hide and Archive remain separate concepts:
  Archive refers to the Family Archive of contributed items, while Hide is
  Steward moderation of a board post.
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

Private messaging is family-scoped. Every canonical endpoint takes an explicit
`familyId` as its first argument and only ever reads or mutates a conversation,
message, block, or report whose `familyId` equals it, so a `conversationId` or
`messageId` alone never crosses a family boundary: a foreign-family id behaves
exactly like a not-found id. The legacy no-`familyId` endpoints listed after the
canonical ones are TEMPORARY Tenancy 1C compatibility wrappers that delegate with
the default Norwood family (`\"norwood\"`); they contain no logic of their own and
will be removed in a later build once every caller passes an explicit `familyId`.

Authorization model: reads and creation require an approved member of `familyId`
(a caller holding at least one `#Approved` profile claim in that family) or an
active Steward of `familyId`; participant-only actions additionally require the
caller to be a participant of the conversation; Steward-only actions are
`listReportsForFamily`, `reviewReportForFamily`, and
`getReportedMessageForFamily`. A Steward of one family can never moderate another
family's reports or messages, and a participant of one family can never mutate
another family's conversation or message.

Messaging gotchas:

- The family boundary is enforced by `record.familyId`, never by
  `conversationId` or `messageId` alone. A lookup that finds a record belonging
  to another family behaves exactly like a lookup that found nothing: the
  single-record reads (`getConversationForFamily`) return the existing safe
  not-found `?null` rather than a distinct error, and the mutations return `null`
  (or, for `markConversationReadForFamily` and `reportMessageForFamily`, trap
  with the existing `\"Conversation not found\"` / `\"Message not found\"`
  messages) without touching the foreign record.
- A conversation's participants must all belong to the same `familyId`; a
  conversation mixing participants from two families is rejected, and a message
  is only ever stored with the `familyId` of its conversation.
- Family ids and principals are never exposed in user-facing errors.

Canonical family-scoped endpoints:

- `canMessagePersonForFamily(familyId : FamilyId, personId : Text) : async Bool` —
  query. Approved members of `familyId` only. Returns whether the signed-in
  caller may message the person within `familyId`. Returns `false` for an
  anonymous caller (it does not trap).
- `listMessageableMembersForFamily(familyId : FamilyId) : async [Text]` — query.
  Approved members of `familyId` only. Returns the person ids of every other
  member the caller may message within `familyId`. Returns `[]` for an anonymous
  caller (it does not trap).
- `listConversationsForFamily(familyId : FamilyId) : async [ConversationSummary]` —
  query. Approved members of `familyId` only. Returns the caller's inbox in
  `familyId`, newest activity first.
- `getConversationForFamily(familyId : FamilyId, conversationId : ConversationId) : async ?ConversationView` —
  query. Approved members of `familyId` only. Returns the full conversation view
  when it belongs to `familyId` and the caller is a participant, or `null`
  otherwise (including when it exists under another family).
- `listMessagesForFamily(familyId : FamilyId, conversationId : ConversationId) : async [Message]` —
  query. Approved members of `familyId` only. Returns the messages of a
  conversation in `familyId`, oldest first; `[]` when the conversation does not
  belong to `familyId`.
- `createConversationForFamily(familyId : FamilyId, recipientPersonId : Text) : async Result<Conversation, MessageError>` —
  update. Approved members of `familyId` only. Creates a 1:1 conversation in
  `familyId` between the caller and the recipient, reusing the existing canonical
  conversation for the account pair when one exists. Both participants must
  belong to `familyId`.
- `sendMessageForFamily(familyId : FamilyId, recipientPersonId : Text, body : Text) : async Result<Message, MessageError>` —
  update. Approved members of `familyId` only. Sends a private message within
  `familyId`, reusing the existing canonical 1:1 conversation when one exists.
  Returns `#err(#BlockedByRecipient)` when the recipient has blocked the sender
  (no message is stored).
- `markConversationReadForFamily(familyId : FamilyId, conversationId : ConversationId) : async ()` —
  update. Approved members of `familyId` only; the caller must be a participant.
  Marks the caller's messages in the conversation as read.
- `blockUserForFamily(familyId : FamilyId, blockedAccountId : Principal) : async ()` —
  update. Approved members of `familyId` only. Blocks another member within
  `familyId`. Idempotent.
- `unblockUserForFamily(familyId : FamilyId, blockedAccountId : Principal) : async ()` —
  update. Approved members of `familyId` only. Unblocks another member within
  `familyId`.
- `listBlockedUsersForFamily(familyId : FamilyId) : async [Principal]` — query.
  Approved members of `familyId` only. Returns the account ids the caller has
  blocked in `familyId`.
- `reportMessageForFamily(familyId : FamilyId, messageId : MessageId, reason : Text) : async Report` —
  update. Approved members of `familyId` only; the caller must be a participant
  of the message's conversation. Reports a specific message within `familyId`.
- `listReportsForFamily(familyId : FamilyId) : async [Report]` — query. Active
  Steward of `familyId` only. Lists the reports of `familyId`.
- `reviewReportForFamily(familyId : FamilyId, reportId : ReportId, status : ReportStatus) : async ?Report` —
  update. Active Steward of `familyId` only. Updates a report's review status
  within `familyId`.
- `getReportedMessageForFamily(familyId : FamilyId, reportId : ReportId) : async ?ReportedMessageView` —
  query. Active Steward of `familyId` only. Returns the reported message content
  for a report in `familyId`.

TEMPORARY Tenancy 1C compatibility wrappers (default Norwood family only):

- `canMessagePerson(personId : Text) : async Bool` — query. Approved family
  members only. Returns whether the signed-in caller may message the person
  identified by `personId`: the viewer is signed in, the target has an active
  linked account, the target is not the viewer, and the target is not archived.
  Unclaimed profiles are never messageable. Drives the Message button on a living
  claimed Person Profile. Returns `false` for an anonymous caller.
- `listMessageableMembers() : async [Text]` — query. Approved family members
  only. Returns the person ids of every other member the caller may message.
  Returns `[]` for an anonymous caller (it does not trap).
- `listConversations() : async [ConversationSummary]` — query. Approved family
  members only. Returns the signed-in caller's inbox: one summary per
  conversation they participate in, newest activity first, with the other
  participant's identity, latest message preview, timestamp, and unread count.
- `getConversation(conversationId : ConversationId) : async ?ConversationView` —
  query. Approved family members only. Returns a full conversation view
  (participant identity plus message history) for a participant, or `null` when
  the conversation does not exist or the caller is not a participant. Only
  participants may read a conversation.
- `listMessages(conversationId : ConversationId) : async [Message]` — query.
  Approved family members only. Returns the messages of a conversation, oldest
  first.
- `createConversation(recipientPersonId : Text) : async Result<Conversation, MessageError>` —
  update. Approved family members only. Creates a 1:1 conversation with the
  person identified by `recipientPersonId`, reusing the existing canonical
  conversation for the account pair when one exists.
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

- `getPendingContributionsCountForFamily(familyId : Text) : async Nat` — query.
  Active Steward of `familyId` only; a Steward of one family cannot read another
  family's pending count. Returns the count of all current pending review items
  (archive/media, video/audio, recipes, recipe media, stories, and mystery
  contributions) in `familyId` for the Steward-facing Pending Contributions
  badge. Research Intake review items (Sources, Proposed Findings, New Person
  Candidates, Relationship Proposals, and Conflict Review items) are NOT counted
  here — they resolve exclusively through the Research Review Queue
  (`getReviewQueue`) — and neither is a pending Archive item linked to a Research
  Source, which is reviewed through that same queue. The count is derived from
  canonical pending data, so it increments on new pending items and decrements on
  Approve/Reject automatically, and it always agrees with the Pending
  Contributions list (`listPendingArchiveItemsForFamily`).
- `getPendingContributionsCount() : async Nat` — query. TEMPORARY Tenancy 1C
  compatibility wrapper for `getPendingContributionsCountForFamily`, delegating
  with the default family id (`\"norwood\"`). Family Steward only. Returns the
  count of all current pending review items (archive/media, video/audio, recipes,
  recipe media, stories, and mystery contributions) for the Steward-facing
  Pending Contributions badge. Research Intake review items (Sources, Proposed
  Findings, New Person Candidates, Relationship Proposals, and Conflict Review
  items) are NOT counted here — they resolve exclusively through the Research
  Review Queue (`getReviewQueue`). The count is derived from canonical pending
  data, so it increments on new pending items and decrements on Approve/Reject
  automatically.

### Family Membership

`FamilyMembership` is the canonical account-to-family membership state: it links
an account (`accountId`, an ICP Principal) to a person profile (`personId`)
inside one family (`familyId`). It is deliberately separate from the other
identity concepts:

- `Account` is the stable internal identity (an ICP Principal) plus its bound
  authentication methods.
- `PersonProfile` is the family-tree person record and its ownership state.
- `ProfileClaim` is the legacy claim workflow, retained temporarily for
  compatibility (see below).
- `StewardRecord` is family governance authority, not membership.

Membership is never inferred from `StewardRecord`, and an account may hold
independent memberships in multiple families, each mapping to a different
`personId`. A membership in Family A never implies membership in Family B, and
an `accountId` alone is never treated as global family membership.

A `FamilyMembership` carries `id`, `familyId`, `accountId`, `personId`,
`status`, `joinedAt`, `approvedBy`, `approvedAt`, `createdAt`, and `updatedAt`.
`status` is one of `#Pending`, `#Active`, `#Suspended`, or `#Left`. `joinedAt`,
`approvedBy`, and `approvedAt` are set when the membership becomes `#Active`;
`createdAt`/`updatedAt` are nanosecond timestamps.

Invariants enforced server-side:

- `familyId` is mandatory and `personId` must belong to that `familyId`.
- At most one `#Active` membership may exist per `familyId` + `accountId`.
- At most one `#Active` membership may exist per `familyId` + `personId`.
- `#Pending`, `#Suspended`, and `#Left` memberships grant no normal family
  access; only `#Active` satisfies `hasActiveMembershipForFamily`.
- The same `personId` text may exist independently in two families without
  cross-family leakage.

Membership is not public directory data. Every read below is gated on the caller
being the target account or an active Steward of the requested family, and every
read returns `Result<_, MembershipError>`: an anonymous caller receives
`#err(#NotSignedIn)`, and a signed-in caller who is neither the target account
nor an active Steward of `familyId` receives `#err(#NotAuthorized)`. Denials are
uniform and non-leaking — the same `#err(#NotAuthorized)` is returned whether or
not the target account belongs to another family, so a caller can never use these
endpoints to probe whether an account is a member of some other family. Anonymous
callers cannot enumerate account ids, person ids, or family memberships.

- `getMembershipForFamily(familyId : Text, accountId : Principal) : async Result<?FamilyMembership, MembershipError>` —
  query. Returns the account's membership in `familyId` only, or `null` when the
  account has no membership in that family. Allowed only when `accountId` equals
  the caller, or the caller is an active Steward of `familyId`. A membership in
  another family is never returned.
- `getMyMembershipForFamily(familyId : Text) : async Result<?FamilyMembership, MembershipError>` —
  query. Returns the signed-in caller's own membership in `familyId`, or `null`
  when the caller has no membership in that family. Self only: a signed-in caller
  may read only their own membership.
- `listMembershipsForAccount(accountId : Principal) : async Result<[FamilyMembership], MembershipError>` —
  query. Returns every membership held by `accountId` across all families. Self
  only; any other account is denied with `#err(#NotAuthorized)`. Unrestricted
  cross-account reads stay internal to library code and are never exposed as a
  public endpoint.
- `listFamilyMembersForFamily(familyId : Text) : async Result<[FamilyMembership], MembershipError>` —
  query. Returns the memberships of one family only; memberships from other
  families are never included. Requires an approved active family member or an
  active Steward of `familyId`.
- `hasActiveMembershipForFamily(familyId : Text, accountId : Principal) : async Result<Bool, MembershipError>` —
  query. Returns `true` only when `accountId` holds an `#Active` membership in
  `familyId`. Returns `false` for `#Pending`, `#Suspended`, and `#Left`
  memberships, and for a membership in another family. Retained public for
  compatibility but restricted to self or an active Steward of `familyId`, so it
  cannot be used to probe arbitrary membership.
- `createPendingMembershipForFamily(familyId : Text, accountId : Principal, personId : Text) : async Result<FamilyMembership, MembershipError>` —
  update. Creates a `#Pending` membership for `accountId` linked to `personId`
  in `familyId`. Active Steward of `familyId` only. Returns
  `#err(#NotSignedIn)` for an anonymous caller, `#err(#NotAuthorized)` when the
  caller is not an active Steward of `familyId`, `#err(#PersonNotInFamily)` when
  `personId` does not belong to `familyId`, `#err(#AlreadyMember)` when the
  account already has a membership in that family, and
  `#err(#ProfileAlreadyOwned)` when an `#Active` membership already owns that
  person profile in that family.
- `activateMembershipForFamily(familyId : Text, membershipId : Nat) : async Result<FamilyMembership, MembershipError>` —
  update. Activates a `#Pending` membership in `familyId` through the authorized
  family approval path. Active Steward of `familyId` only; there is no
  unrestricted self-promotion to `#Active`. The persisted `approvedBy` is always
  the real authenticated caller (the approving Steward) and `approvedAt` is the
  current time; a caller-supplied approver identity is never trusted. Returns
  `#err(#NotSignedIn)` for an anonymous caller, `#err(#NotAuthorized)` when the
  caller is not an active Steward of `familyId`, `#err(#MembershipNotFound)` when
  no membership with that id belongs to `familyId`, `#err(#InvalidTransition)`
  when the membership is not `#Pending`, and `#err(#ProfileAlreadyOwned)` when
  another `#Active` membership already owns the person profile in that family. On
  success it sets `status = #Active`, `joinedAt`, `approvedBy = ?caller`, and
  `approvedAt = ?now`.
- `leaveFamilyMembership(familyId : Text, membershipId : Nat) : async Result<FamilyMembership, MembershipError>` —
  update. Sets an `#Active` membership in `familyId` to `#Left`. The caller may
  be the membership's own account, or an active Steward of `familyId` recording a
  leave for a member of that family. Returns `#err(#NotSignedIn)` for an
  anonymous caller, `#err(#MembershipNotFound)` when no membership with that id
  belongs to `familyId`, `#err(#NotAuthorized)` when the caller is neither the
  membership's account nor an active Steward of `familyId`, and
  `#err(#InvalidTransition)` when the membership is not `#Active`.
- `suspendMembershipForFamily(familyId : Text, membershipId : Nat) : async Result<FamilyMembership, MembershipError>` —
  update. Sets an `#Active` membership in `familyId` to `#Suspended`. Active
  Steward of `familyId` only. Returns `#err(#NotSignedIn)` for an anonymous
  caller, `#err(#NotAuthorized)` when the caller is not an active Steward of
  `familyId`, `#err(#MembershipNotFound)` when no membership with that id
  belongs to `familyId`, and `#err(#InvalidTransition)` when the membership is
  not `#Active`.

The OQL `familyMembership` entity is a flattened, `.controllerOnly()` view:
enumerated status renders as its tag text and optional fields render as empty
text or `0` when absent.

#### ProfileClaim compatibility

`ProfileClaim` remains temporarily for compatibility and the existing claim
workflow. This phase only establishes `FamilyMembership`; it does NOT switch the
application's family authorization from approved `ProfileClaim`s to
`FamilyMembership`. Existing family-scoped authorization helpers continue to use
the current claim-based compatibility logic, and the canonical membership
helpers above are provided so later onboarding/security phases can adopt them.
Migration from claim-based membership checks to `FamilyMembership` is a later
onboarding/security phase.

The migration chain backfills one `#Active` membership for every `#Approved`
`ProfileClaim` in the default family (`\"norwood\"`), preserving the
`ProfileClaim` records, Steward records, profile ids, relationships, and all
other existing data unchanged. Historical `ProfileClaim` data is not assumed to
be perfect, so the backfill enforces both `#Active` invariants — at most one
`#Active` membership per `familyId` + `accountId`, and at most one `#Active`
membership per `familyId` + `personId` — with a deterministic conflict rule:
claims are processed in ascending claim id order, and the earliest approved claim
wins both the account slot and the person slot; any later approved claim that
collides on either slot is skipped and creates no membership record. The
backfill never deletes or rewrites historical `ProfileClaim` records. The
backfill is idempotent: a repeated upgrade creates no duplicate membership.

### Family Creation (zero-to-family onboarding foundation)

`createFamilyWithFounder` is the canonical backend transaction for a brand-new
authenticated user to start a family. It is the foundation of onboarding and
creates exactly three linked records in one atomic step:

1. the new `Family` record,
2. the founder's first `PersonProfile` inside that family, and
3. an `#Active` `FamilyMembership` linking the authenticated account to that
   founder profile.

It reuses the existing `Family`, `PersonProfile`, and `FamilyMembership` models
— there is no parallel family type — and it deliberately does NOT assign
Stewardship. After a successful call the family temporarily exists with a founder
profile and an active founder membership but no permanent Steward decision;
Steward selection (\"Would you like to start as Family Steward?\") is implemented
in Onboarding Phase 1B-2 and is not bypassed here.

- `createFamilyWithFounder(displayName : Text, input : FounderProfileInput, idempotencyKey : Text) : async Result<FamilyCreationResult, FamilyCreationError>` —
  update. Creates a brand-new family with the authenticated caller as founder.

  **Authentication.** The caller must be signed in. An anonymous caller receives
  `#err(#NotSignedIn)` and nothing is created.

  **Authorization.** The founder account is always the authenticated caller.
  There is no account parameter, so a caller can never name another account as
  founder. The caller does not need to belong to any existing family to create a
  new family, and an account that already belongs to another family (including
  Norwood) may create a new family without changing its existing membership or
  data. One account may simultaneously hold `#Active` memberships in multiple
  families.

  **Input.** `displayName` is the new family's display name; it is trimmed and
  must be non-empty. `input` is a `FounderProfileInput`:
  `firstName` and `lastName` are REQUIRED (each trimmed and non-empty);
  `middleName`, `suffix`, `preferredName`, `birthDate`, `birthYear`,
  `birthplace`, and `currentLocation` are optional. Parents, siblings, partner,
  and children are deliberately not collected here — those belong to later
  \"Add Family Member\" steps. A blank display name or a missing first/last name
  receives `#err(#InvalidInput)`.

  **Result.** On success returns `#ok(FamilyCreationResult)` carrying the three
  created records together — `family`, `founderProfile`, and `membership` — so a
  later onboarding UI can continue. The founder profile is created claimed by the
  caller (`claimStatus == #Claimed`, `claimedByUserId == caller`) and living, and
  the membership is `#Active` with `accountId == caller`,
  `personId == founderProfile.personId`, `joinedAt` set to the creation time, and
  `approvedBy`/`approvedAt` set to the caller/creation time (the founding
  membership is self-approved by the system).

  **Family-id generation.** The family id is unique, stable, URL/storage safe,
  and not derived only from `displayName`: it is built from a slug of the display
  name plus a unique suffix, and it never exposes an internal account principal.
  Two families may share the same display name and still receive distinct ids.

  **Atomicity.** All inputs are validated before any stable collection is
  mutated, so a rejected request leaves no orphan family, orphan profile, or
  incomplete membership. If founder-profile or membership creation cannot
  complete, no partial family is left behind.

  **Retry / idempotency.** `idempotencyKey` is REQUIRED and must be non-empty.
  A blank or whitespace-only key receives `#err(#InvalidInput)` and creates
  nothing, so the canonical creation path can never create a family without
  retry protection. When the key was already used by this caller, the previously
  created family/profile/membership are returned instead of creating duplicate
  records, so a retried or double-submitted onboarding attempt is safe. The
  idempotency index is keyed by caller plus key, so one account's key never
  collides with another account's key, and two different callers may reuse the
  same key independently. A replay does not advance the family-creation nonce;
  the nonce advances only when a new family is actually created.

  **Errors.** `#err(#NotSignedIn)` for an anonymous caller; `#err(#InvalidInput)`
  for a blank display name or missing first/last name; `#err(#AlreadyMember)` and
  `#err(#ProfileAlreadyOwned)` for the membership-model conflicts that can still
  arise during the atomic creation step.

  **Non-goal.** No `StewardRecord` is created by this operation. Steward
  selection is a later onboarding phase.

### Family Invitation (secure onboarding transport)

A `FamilyInvitation` is a secure onboarding TRANSPORT record. It carries a
one-time invite token (persisted only as a hash) that lets an invited person
reach the onboarding flow for exactly one family and one target person profile.

It is deliberately separate from every other onboarding/identity record:

- `PersonProfile` is the family-tree person record and its ownership state.
- `ProfileClaim` is the legacy claim workflow retained for compatibility.
- `FamilyMembership` is the canonical account-to-family membership state.
- `StewardRecord` is the single source of Steward authority.
- `FoundingStewardNomination` is the Phase 1B-2 founding-Steward progress
  record.

An invitation never grants family access by itself. Accepting one only
establishes the connection to onboarding (at most a `#Pending`
`FamilyMembership`); it never creates Steward authority and never bypasses the
existing founding-Steward acceptance rule. No email, SMS, or landing page is
part of this surface — the raw token is returned once so a later phase can
deliver it.

**Invitation model.** `FamilyInvitation` carries `id`, `familyId`, `personId`,
`invitedEmail?`, `invitedByAccountId`, `invitedByPersonId?`, `invitationType`,
`tokenHash`, `status`, `createdAt`, `expiresAt`, `acceptedAt?`,
`acceptedByAccountId?`, and `cancelledAt?`. `invitationType` is
`#FamilyMember` or `#FoundingSteward`; `status` is `#Pending`, `#Accepted`,
`#Declined`, `#Cancelled`, or `#Expired`. An invitation belongs to exactly one
family, and its `personId` must belong to that same family.

**Token safety.** The raw invite token is generated from IC secure randomness
(the management canister `raw_rand`, 256 bits of entropy) and is URL-safe. It is
never derived from the caller principal, invitation id, timestamp, `familyId`,
`personId`, or email. Only a cryptographic digest (SHA-256) of the raw token is
persisted; the raw token is returned exactly once from the create/resend API and
is never stored or logged. Token lookup is by digest only, so a wrong token
never resolves an invitation.

- `createFamilyInvitation(familyId : Text, personId : Text, invitedEmail : ?Text) : async Result<FamilyInvitationCreateOutcome, FamilyInvitationError>` —
  update. Creates a `#Pending` `#FamilyMember` invitation for an unclaimed
  profile in `familyId`.

  **Authentication.** The caller must be signed in; an anonymous caller receives
  `#err(#NotSignedIn)`.

  **Authorization.** The caller must be an approved member or an active Steward
  of `familyId`; otherwise `#err(#NotAuthorized)`. The target profile must
  belong to `familyId`; a person from another family receives
  `#err(#PersonNotInFamily)`.

  **Claimed-profile rule.** If the target already has an `#Active` membership
  owner in that family, or is already claimed through the legacy
  `ProfileClaim` / `PersonProfile.claimedByUserId` ownership path, no join
  invitation is created and the call returns `#ok(#AlreadyMember)` (or
  `#ok(#RelationshipNotificationRequired)`), which a later UI can convert into a
  normal relationship notification. No duplicate invitation flow is sent to an
  existing member.

  **Duplicate / resend safety.** A repeat create for the same `familyId` +
  `personId` + `invitationType` reuses the existing active `#Pending` invitation
  (`created = false`) rather than creating a duplicate. An invitation whose
  `expiresAt <= now` is not active: it is transitioned to `#Expired` (preserved
  for history) and a fresh `#Pending` invitation with a new token and a fresh
  expiry is created. Because only the token digest is stored, a reused result
  carries an empty `rawToken`; use `resendFamilyInvitation` when a fresh
  deliverable token is needed.

  **Result.** On success returns `#ok(#Created(FamilyInvitationCreated))`
  carrying the invitation, the one-time `rawToken`, and `created = true` when a
  new invitation was stored. No membership is created.

- `createFoundingStewardInvitation(familyId : Text, personId : Text, nomineeEmail : ?Text) : async Result<FamilyInvitationCreateOutcome, FamilyInvitationError>` —
  update. Creates a `#Pending` `#FoundingSteward` invitation linked to the
  existing Phase 1B-2 nomination for `familyId` + `personId`.

  **Authorization.** The caller must be the family founder or an active Steward
  of `familyId`; otherwise `#err(#NotAuthorized)`.

  **Linkage.** The nomination must exist and be `#Pending` for that family and
  nominee; otherwise `#err(#NominationNotFound)` / `#err(#NomineeMismatch)`.
  Nomination state is never duplicated inside the invitation. Creating the
  invitation grants no Steward authority: the nominee still becomes Steward only
  through the existing authenticated founding-Steward acceptance rule.

- `validateFamilyInvitationToken(rawToken : Text) : async Result<FamilyInvitationPreview, FamilyInvitationError>` —
  query. Validates a raw token and returns only the minimal, relationship-safe
  preview context needed for later onboarding: invitation id, family display
  name, target profile safe identity preview (its display name), invitation
  type, status, and expiry. It never exposes the private family tree, Archive
  data, other member identities, sensitive relationship context (adoptive /
  foster / step / biological / guardian labels or private notes), or
  Steward-only data. A wrong, unknown, cancelled, declined, or accepted token
  returns `#err(#InvalidToken)`; an expired token returns `#err(#Expired)`.

- `getInvitationRedemptionState(rawToken : Text) : async Result<InvitationRedemptionState, FamilyInvitationError>` —
  query. Resolves a raw token to a safe, discriminated redemption state for the
  invitation landing/terminal UI. Read-only: it never mutates state and never
  creates a membership. `InvitationRedemptionState` is `#Valid(preview)` for a
  `#Pending`, unexpired invitation (where `preview` is the same minimal,
  relationship-safe `FamilyInvitationPreview` returned by
  `validateFamilyInvitationToken`), or one of the terminal states `#Expired`,
  `#Cancelled`, `#Declined`, `#AlreadyAccepted`, `#InvalidToken`. An unknown,
  empty, or wrong token returns `#ok(#InvalidToken)`. The state never carries
  `tokenHash`, any member identity beyond the existing preview fields, or any
  signal about whether unrelated accounts or families exist. `#err(#FamilyNotFound)`
  is returned only when a resolved `#Pending` invitation's family record is
  missing (an internal inconsistency), never as a probe for other families.

  **Redemption flow.** The frontend may call this query while signed out to
  render a safe preview, then re-call it after authentication to revalidate the
  token before accepting; the pre-sign-in preview state is never trusted.
  Acceptance proceeds only when the state is `#Valid` (still `#Pending`,
  unexpired, not cancelled, not declined, not previously accepted).

- `acceptFamilyInvitation(rawToken : Text) : async Result<FamilyInvitation, FamilyInvitationError>` —
  update. Accepts a raw token for the authenticated caller.

  **Authentication.** The caller must be signed in; an anonymous caller receives
  `#err(#NotSignedIn)`.

  **Preconditions.** The token must be valid, `#Pending`, and unexpired, and the
  target profile must still be unclaimed (no active membership owner and no
  legacy `ProfileClaim` / `PersonProfile.claimedByUserId` ownership). A wrong
  token returns `#err(#InvalidToken)`, an expired token `#err(#Expired)`, a
  non-pending token `#err(#InvalidTransition)`, and an already-claimed target
  `#err(#AlreadyMember)`.

  **Membership matching.** When the caller already holds a membership in the
  invitation's family, it is reused only when it is `#Pending` and its
  `personId` equals the invitation's `personId`. Any other existing membership —
  a different `personId`, or an `#Active`, `#Suspended`, or `#Left` status —
  rejects acceptance with `#err(#AlreadyMember)` and the invitation stays
  `#Pending`.

  **Effect.** Creates or reuses a `#Pending` `FamilyMembership` linking the
  caller, `familyId`, and `personId`. It never auto-activates the membership.
  For `#FoundingSteward` the membership follows the existing
  membership/founding-Steward rule without bypassing nominee acceptance. The
  invitation is marked `#Accepted` only when acceptance succeeds, and an
  accepted invitation can never be reused.

  **Founding-Steward handoff.** The returned `FamilyInvitation` carries its
  `invitationType`, so a `#FoundingSteward` acceptance signals to the frontend
  that this invitation is also a Steward nomination. Acceptance does NOT grant
  Steward authority and does NOT auto-accept the nomination: the nominee still
  becomes an active Steward only through the existing authenticated
  `acceptFoundingStewardNomination` flow, and only once its membership
  requirements are satisfied. Possession of the invite token alone never
  creates Steward authority.

  **Onboarding state.** A successful `#FamilyMember` acceptance returns the
  accepted invitation and establishes or reuses only the valid same-profile
  `#Pending` membership; the frontend should present a `MembershipPending`
  onboarding state. Acceptance does not grant normal family access — the next
  phase handles confirmation/approval.

  **Alternate outcomes.** A caller who already owns the invited profile or holds
  a valid `#Active` membership receives `#err(#AlreadyMember)` with no duplicate
  membership created (a safe \"Already connected\" result). A caller with a
  conflicting membership/profile state (a different `personId`, or a
  non-`#Pending` status) also receives `#err(#AlreadyMember)`; the invitation
  stays `#Pending` and no unrelated membership details are revealed. A target
  profile claimed after the invite was issued returns `#err(#AlreadyMember)`
  and never attaches the caller.

- `declineFamilyInvitation(rawToken : Text) : async Result<FamilyInvitation, FamilyInvitationError>` —
  update. The invited user declines a raw token. The invitation becomes
  `#Declined` and can never be accepted afterwards. Anonymous callers receive
  `#err(#NotSignedIn)`.

- `cancelFamilyInvitation(familyId : Text, invitationId : Nat) : async Result<FamilyInvitation, FamilyInvitationError>` —
  update. The inviter or an active Steward of `familyId` cancels a `#Pending`
  invitation. The invitation becomes `#Cancelled` and can never be accepted
  afterwards. A non-pending invitation returns `#err(#InvalidTransition)`; an
  unauthorized caller returns `#err(#NotAuthorized)`; an unknown id in that
  family returns `#err(#InvitationNotFound)`.

- `resendFamilyInvitation(familyId : Text, personId : Text, invitationType : InvitationType) : async Result<FamilyInvitationCreated, FamilyInvitationError>` —
  update. Rotates the token of an existing active `#Pending` invitation for the
  same `familyId` + `personId` + `invitationType`, returning the new raw token
  once. The old token stops resolving, and `expiresAt` is refreshed to a full
  TTL from now, so a resend never issues an already-expired token. This is the
  explicit resend operation, so a resend never silently creates a duplicate
  invitation. Requires the same authority as create; a missing pending
  invitation returns `#err(#InvitationNotFound)`.

  **Already-expired rule.** An invitation whose `expiresAt <= now` is not an
  active `#Pending` invitation and is not resent. It is transitioned to
  `#Expired` (preserved for history) and the call returns `#err(#Expired)`; the
  caller must use `createFamilyInvitation` to issue a fresh invitation.

**Expiration.** The default invitation lifetime is 30 days. An invitation whose
`expiresAt <= now` is never treated as an active `#Pending` invitation: it is
ignored by duplicate-pending lookup, fails validation and acceptance, and
creates no membership. Expired records are preserved for audit/history and are
never automatically deleted.

**Privacy.** Invitation previews use relationship-safe/public-safe identity
only. Public/simple family labels remain unchanged, and the existence of an
invitation never reveals unrelated family membership.

### Historical Research Intake

- `createSource(title : Text, sourceType : SourceType, description : Text, archiveItemId : ?Nat) : async Result<SourceRecord, ResearchError>` —
  update. Creates a lightweight source record so every fact retains provenance.
  Requires an approved family member (a caller holding at least one `#Approved`
  profile claim, or a Family Steward); returns `#err(#notAuthorized)` for an
  anonymous or signed-in but unapproved caller. The caller is recorded as the
  `contributor`. The
  source enters as `#Pending` and is never auto-approved. `archiveItemId` is
  optional — a source may link to an Archive item without requiring one.
- `listSourcesForFamily(familyId : Text) : async [SourceRecord]` — query.
  Requires an approved member or active Steward of `familyId`. Lists every source
  record whose `familyId` equals `familyId`; a source belonging to another family
  is never returned.
- `getSourceForFamily(familyId : Text, sourceId : SourceId) : async ?SourceRecord` —
  query. Requires an approved member or active Steward of `familyId`. Returns the
  source with `sourceId` when it belongs to `familyId`, or `null` otherwise. A
  record that exists under another family is never returned, so a `sourceId`
  alone cannot cross the family boundary. The source record carries the
  contributor principal and description, so anonymous and signed-in but
  non-member callers are rejected with a trap.
- `listSources() : async [SourceRecord]` — query. TEMPORARY Tenancy 1C
  compatibility wrapper for `listSourcesForFamily`, delegating with the default
  family id (`\"norwood\"`). Family Steward or approved member only. Lists all
  source records in the default family.
- `getSource(id : SourceId) : async ?SourceRecord` — query. TEMPORARY Tenancy 1C
  compatibility wrapper for `getSourceForFamily`, delegating with the default
  family id (`\"norwood\"`). Family Steward or approved member only. Returns a
  single source record by id, or `null` when it does not exist. The source record
  carries the contributor principal and description, so anonymous and signed-in
  but non-member callers are rejected with a trap.
- `createFinding(title : Text, evidenceLabel : EvidenceLabel, findingType : FindingType, content : FindingContent, sourceId : SourceId, personId : ?Text, newPersonCandidateId : ?Nat) : async Result<ProposedFinding, ResearchError>` —
  update. TEMPORARY Tenancy 1C compatibility wrapper for
  `createFindingForFamily`, delegating with the default family id (`\"norwood\"`).
  Creates a proposed finding carrying exactly one evidence label and a
  required source link. Requires an approved family member (a caller holding at
  least one `#Approved` profile claim, or a Family Steward); returns
  `#err(#notAuthorized)` for an anonymous or signed-in but unapproved caller and
  `#err(#notFound(sourceId))`
  when the referenced source does not exist. The finding may match an existing
  canonical Person (`personId`) or reference a New Person Candidate
  (`newPersonCandidateId`). The finding enters as `#Pending` and is never
  auto-approved.
- `listFindings() : async [ProposedFinding]` — query. TEMPORARY Tenancy 1C
  compatibility wrapper for `listFindingsForFamily`, delegating with the default
  family id (`\"norwood\"`). Family Steward only. Lists all proposed findings in
  the default family.
- `getFinding(id : FindingId) : async ?ProposedFinding` — query. TEMPORARY
  Tenancy 1C compatibility wrapper for `getFindingForFamily`, delegating with the
  default family id (`\"norwood\"`). Family Steward only. Returns a single
  proposed finding by id, or `null` when it does not exist. The finding carries
  its content, submitter principal, and review metadata, so anonymous and
  signed-in but non-steward callers are rejected with a trap.
- `approveFinding(id : FindingId) : async ?ProposedFinding` — update. TEMPORARY
  Tenancy 1C compatibility wrapper for `approveFindingForFamily`, delegating with
  the default family id (`\"norwood\"`). Family Steward only. Approves a pending
  finding, routing it to its target surface
  (Profile, family graph, Timeline / Travel Through Time, Family Stories, Family
  Mysteries, or Profile Sources / Archive). A finding labelled `#Conflicting` is
  never approved directly — it is routed to a Conflict Review item instead of
  silently overwriting canonical data, and the finding is marked `#Conflicting`
  with a `conflictReviewId` link. Returns the updated finding, or `null` when it
  does not exist or is not pending.
- `rejectFinding(id : FindingId) : async ?ProposedFinding` — update. TEMPORARY
  Tenancy 1C compatibility wrapper for `rejectFindingForFamily`, delegating with
  the default family id (`\"norwood\"`). Family Steward only. Rejects a pending
  finding. Returns the updated finding, or `null` when it does not exist or is
  not pending.
- `needsResearchFinding(id : FindingId) : async ?ProposedFinding` — update.
  TEMPORARY Tenancy 1C compatibility wrapper for
  `needsResearchFindingForFamily`, delegating with the default family id
  (`\"norwood\"`). Family Steward only. Marks a pending finding as needing
  research, transitioning it to `#NeedsResearch` while preserving the finding and
  its content. The finding remains in the Research Review Queue with status
  `NEEDS_RESEARCH` and a `FindingNeedsResearch` audit entry is recorded. Returns
  the updated finding, or `null` when it does not exist or is not pending.

#### Family-scoped Proposed Finding methods (canonical)

Every proposed finding is family-scoped: it carries a required `familyId`, and
every family-scoped read and review requires `ProposedFinding.familyId` to equal
the requested `familyId`. A `findingId` alone is never a tenant boundary — a
lookup that finds a finding belonging to another family behaves exactly like a
lookup that found nothing, so Family A findings can never be read, reviewed,
resolved, or promoted into Family B. The single-family finding endpoints above
are TEMPORARY Tenancy 1C compatibility wrappers that delegate with the default
family id (`\"norwood\"`); they are deprecated and will be removed once every
caller passes an explicit `familyId`.

- `createFindingForFamily(familyId : Text, title : Text, evidenceLabel : EvidenceLabel, findingType : FindingType, content : FindingContent, sourceId : SourceId, personId : ?Text, newPersonCandidateId : ?Nat) : async Result<ProposedFinding, ResearchError>` —
  update. Creates a proposed finding in `familyId`. Requires an approved member
  of `familyId`; returns `#err(#notAuthorized)` for an anonymous or signed-in but
  unapproved caller and `#err(#notFound(sourceId))` when the referenced source
  does not exist in `familyId`. The linked SourceRecord must belong to `familyId`
  and the referenced PersonProfile must belong to `familyId`, so a Source in
  Family A can never create a Finding against a profile in Family B. The stored
  finding's `familyId` is the requested `familyId`, and it enters as `#Pending`.
- `listFindingsForFamily(familyId : Text) : async [ProposedFinding]` — query.
  Requires an active Steward of `familyId`. Lists every proposed finding whose
  `familyId` equals `familyId`; a finding belonging to another family is never
  returned.
- `getFindingForFamily(familyId : Text, findingId : FindingId) : async ?ProposedFinding` —
  query. Requires an active Steward of `familyId`. Returns the finding with
  `findingId` when it belongs to `familyId`, or `null` otherwise. A record that
  exists under another family is never returned, so a `findingId` alone cannot
  cross the family boundary.
- `approveFindingForFamily(familyId : Text, findingId : FindingId) : async ?ProposedFinding` —
  update. Requires an active Steward of `familyId`; a Steward of another family
  cannot approve the finding. The linked Source and referenced PersonProfile must
  both belong to `familyId`. A finding labelled `#Conflicting` is routed to a
  Conflict Review item carrying the same `familyId` instead of silently
  overwriting canonical data. An approved finding promotes into the canonical
  profile through the family-qualified profile lookup, verifying
  `profile.familyId == familyId` and updating only that family's profile, so a
  Family A finding never mutates a same-personId profile in Family B. Returns the
  updated finding, or `null` when no pending finding with that id belongs to
  `familyId`.
- `rejectFindingForFamily(familyId : Text, findingId : FindingId) : async ?ProposedFinding` —
  update. Requires an active Steward of `familyId`. Rejects the pending finding
  with `findingId` in `familyId`. Returns the updated finding, or `null` when no
  pending finding with that id belongs to `familyId`.
- `needsResearchFindingForFamily(familyId : Text, findingId : FindingId) : async ?ProposedFinding` —
  update. Requires an active Steward of `familyId`. Marks the pending finding
  with `findingId` in `familyId` as needing research, transitioning it to
  `#NeedsResearch` while preserving the finding and its content. Returns the
  updated finding, or `null` when no pending finding with that id belongs to
  `familyId`.

#### Family-scoped New Person Candidate methods (canonical)

Every canonical candidate endpoint takes the requested `familyId` explicitly.
Authority and data access are evaluated against that family, and a
`candidateId` alone is never a tenant boundary — a lookup that finds a candidate
belonging to another family behaves exactly like a lookup that found nothing, so
Family A candidates can never be read, reviewed, or converted into profiles in
Family B. The single-family candidate endpoints listed after these are
TEMPORARY Tenancy 1C compatibility wrappers that delegate with the default
family id (`\"norwood\"`); they are deprecated and will be removed once every
caller passes an explicit `familyId`.

- `createNewPersonCandidateForFamily(familyId : Text, name : Text, details : Text, sourceId : SourceId) : async Result<NewPersonCandidate, ResearchError>` —
  update. Creates a candidate for a Person not yet in the canonical set, in
  `familyId`. Requires an approved member of `familyId` (a caller holding at
  least one `#Approved` profile claim in that family, or an active Steward of
  it); returns `#err(#notAuthorized)` for an anonymous or unapproved caller and
  `#err(#notFound(sourceId))` when the referenced source does not belong to
  `familyId`. The candidate enters as `#Pending` and its stored `familyId` is
  the requested `familyId`; approved candidates become canonical Person records
  in that same family.
- `listNewPersonCandidatesForFamily(familyId : Text) : async [NewPersonCandidate]` —
  query. Active Steward of `familyId` only. Lists the New Person candidates of
  `familyId`; candidates from other families are never included.
- `getNewPersonCandidateForFamily(familyId : Text, candidateId : Nat) : async ?NewPersonCandidate` —
  query. Active Steward of `familyId` only. Returns the candidate with
  `candidateId` when it belongs to `familyId`, or `null` otherwise. A record
  that exists under another family is never returned, so a `candidateId` alone
  cannot cross the family boundary.
- `approveNewPersonCandidateForFamily(familyId : Text, candidateId : Nat) : async ?NewPersonCandidate` —
  update. Active Steward of `familyId` only; a Steward of another family cannot
  approve the candidate. Approves a pending candidate in `familyId`, creating
  exactly one canonical Person record (PersonProfile) in that same family
  through the family-qualified profile storage, preserving the candidate's
  Source/provenance, recording the approval in Audit History, and marking the
  candidate `#Approved`. The new profile is unclaimed and living by default, and
  its personId is generated so it never collides with a same-personId profile in
  another family. Approving a candidate never auto-creates relationships.
  Returns the updated candidate, or `null` when no pending candidate with that
  id belongs to `familyId`.
- `rejectNewPersonCandidateForFamily(familyId : Text, candidateId : Nat) : async ?NewPersonCandidate` —
  update. Active Steward of `familyId` only. Rejects a pending candidate in
  `familyId`, marking it `#Rejected`. No canonical Person is created; the
  candidate and its audit trail are preserved. Returns the updated candidate, or
  `null` when no pending candidate with that id belongs to `familyId`.
- `needsResearchNewPersonCandidateForFamily(familyId : Text, candidateId : Nat) : async ?NewPersonCandidate` —
  update. Active Steward of `familyId` only. Marks a pending candidate in
  `familyId` as needing research, transitioning it to `#NeedsResearch` while
  preserving the candidate. No canonical Person is created. Returns the updated
  candidate, or `null` when no pending candidate with that id belongs to
  `familyId`.

Candidate duplicate detection is family-scoped. A candidate is compared only
against canonical Person profiles whose `familyId` equals the candidate's own
`familyId`, so a same name/person details in another family never blocks
approval of a candidate in this family. Empty/missing comparison fields continue
to follow the existing duplicate-profile rules: an empty candidate name never
matches, and an empty candidate `details` constrains the match by name alone
rather than matching every profile. The broader Duplicate Profiles Steward tool
is unchanged by this scoping.

The following single-family candidate endpoints are TEMPORARY Tenancy 1C
compatibility wrappers. Each delegates to its family-scoped counterpart with the
default family id (`\"norwood\"`), so current Norwood behavior is unchanged.

- `approveNewPersonCandidate(id : Nat) : async ?NewPersonCandidate` — update.
  Family Steward only. Approves a pending New Person candidate, creating exactly
  one canonical Person record (PersonProfile) that preserves the candidate's
  Source/provenance, recording the approval in Audit History, and marking the
  candidate `#Approved`. The new profile is unclaimed and living by default.
  Approving a candidate never auto-creates relationships — a relationship is
  only added when a separately approved Relationship Proposal exists. Returns
  the updated candidate, or `null` when it does not exist or is not pending.
- `rejectNewPersonCandidate(id : Nat) : async ?NewPersonCandidate` — update.
  Family Steward only. Rejects a pending New Person candidate, marking it
  `#Rejected`. No canonical Person is created; the candidate and its audit trail
  are preserved. Returns the updated candidate, or `null` when it does not exist
  or is not pending.
- `needsResearchNewPersonCandidate(id : Nat) : async ?NewPersonCandidate` —
  update. Family Steward only. Marks a pending New Person candidate as needing
  research, transitioning it to `#NeedsResearch` while preserving the candidate.
  No canonical Person is created. Returns the updated candidate, or `null` when
  it does not exist or is not pending.
- `approveRelationshipProposalForFamily(familyId : Text, proposalId : Nat) : async ?RelationshipProposal` —
  update. Family Steward of `familyId` only. Approves a pending Relationship
  proposal that belongs to `familyId`, creating exactly one confirmed
  relationship inside `familyId` only (reusing the Tenancy 1C-A family-scoped
  relationship implementation; no cross-family graph edge is ever created),
  recording the approval in Audit History, and marking the proposal `#Approved`
  with `reviewedBy`/`reviewedAt`. Denied — returning `null`, the existing safe
  not-found behavior — when the proposal belongs to another family, when the
  caller is not an active Steward of `familyId`, when either referenced person
  no longer belongs to `familyId`, or when the linked Source does not belong to
  `familyId`. Duplicate canonical relationships are prevented: when an identical
  confirmed relationship already exists in `familyId`, no second relationship is
  added.
- `rejectRelationshipProposalForFamily(familyId : Text, proposalId : Nat) : async ?RelationshipProposal` —
  update. Family Steward of `familyId` only. Rejects a pending Relationship
  proposal that belongs to `familyId`, transitioning only that proposal to
  `#Rejected` with `reviewedBy`/`reviewedAt`. No confirmed relationship is
  created and the family graph is left unchanged. Denied — returning `null` —
  for a proposal belonging to another family or for a non-Steward caller.
- `approveRelationshipProposal(id : Nat) : async ?RelationshipProposal` —
  update. TEMPORARY Tenancy 1C compatibility wrapper for
  `approveRelationshipProposalForFamily`; delegates with the default family id
  (`\"norwood\"`). Family Steward only. Contains no business logic of its own.
- `rejectRelationshipProposal(id : Nat) : async ?RelationshipProposal` — update.
  TEMPORARY Tenancy 1C compatibility wrapper for
  `rejectRelationshipProposalForFamily`; delegates with the default family id
  (`\"norwood\"`). Family Steward only. Contains no business logic of its own.
- `needsResearchRelationshipProposal(id : Nat) : async ?RelationshipProposal` —
  update. Family Steward only. Marks a pending Relationship proposal as needing
  research, transitioning it to `#NeedsResearch` while preserving the proposal.
  The canonical graph is left unchanged. Returns the updated proposal, or `null`
  when it does not exist or is not pending.
- `createNewPersonCandidate(name : Text, details : Text, sourceId : SourceId) : async Result<NewPersonCandidate, ResearchError>` —
  update. Creates a candidate for a Person not yet in the canonical set. Requires
  an approved family member (a caller holding at least one `#Approved` profile
  claim, or a Family Steward); returns `#err(#notAuthorized)` for an anonymous or
  signed-in but unapproved caller and `#err(#notFound(sourceId))` when the
  referenced source
  does not exist. The candidate enters as `#Pending`; approved candidates become
  canonical Person records.
- `listNewPersonCandidates() : async [NewPersonCandidate]` — query. Family
  Steward only. Lists all New Person candidates.
- `createRelationshipProposal(fromPersonId : Text, toPersonId : Text, relationshipType : Text, sourceId : SourceId) : async Result<RelationshipProposal, ResearchError>` —
  update. Proposes a relationship between two Persons. Requires an approved
  family member (a caller holding at least one `#Approved` profile claim, or a
  Family Steward); returns `#err(#notAuthorized)` for an anonymous or signed-in
  but unapproved caller
  and `#err(#notFound(sourceId))` when the referenced source does not exist. The
  proposal enters as `#Pending`; approved proposals route to the family graph.
- `listRelationshipProposals() : async [RelationshipProposal]` — query. Family
  Steward only. Lists all relationship proposals.
Every conflict endpoint is family-scoped: it takes the requested `familyId` and
evaluates authority and data access against that family. A `conflictId` alone is
never a tenant boundary — a lookup that finds a record belonging to another
family behaves exactly like a lookup that found nothing, so Family A can never
read, resolve, or use a conflict to modify canonical data in Family B. Every
conflict action validates that the conflict and its linked Finding, linked
Source, and referenced PersonProfile all belong to the requested family; IDs
alone are never trusted. The single-family endpoints listed after the
family-scoped ones are TEMPORARY Tenancy 1C compatibility wrappers that delegate
with the default family id (`\"norwood\"`); they are deprecated and will be
removed once every caller passes an explicit `familyId`.

- `listConflictReviewItemsForFamily(familyId : Text) : async [ConflictReviewItem]` —
  query. Active Steward of `familyId` only. Lists the conflict review items in
  `familyId` (findings that contradict existing canonical data and were routed
  to review instead of silently overwriting it). Each item captures the affected
  Person (`personId`), the disputed `field`, the existing `canonicalValue` and
  the `proposedValue`, the provenance/source of each side when available
  (`existingSourceId`, `proposedSourceId`), the proposed finding's
  `evidenceLabel`, and any `stewardNotes`. Items are created `#Conflicting`
  (unresolved) and canonical data is never altered at creation. Only items whose
  `familyId` equals `familyId` are returned, so Family A conflicts never appear
  in a Family B call.
- `getConflictReviewItemForFamily(familyId : Text, conflictId : Nat) : async ?ConflictReviewItem` —
  query. Active Steward of `familyId` only. Returns the conflict with
  `conflictId` when it belongs to `familyId`, or `null` otherwise. A record that
  exists under another family is never returned, so a `conflictId` alone cannot
  cross the family boundary.
- `listConflictsForPersonForFamily(familyId : Text, personId : Text) : async [ConflictReviewItem]` —
  query. Returns the unresolved conflict review items (`#Conflicting` and
  `#NeedsResearch`) affecting a given Person in `familyId`, so the frontend can
  surface them alongside canonical values on the person profile and source
  history views. Requires a signed-in (non-anonymous) caller; anonymous callers
  receive `[]`. Only conflicts whose `familyId` equals `familyId` are returned.
  Resolved conflicts are never returned.
- `listDisputedFactsForPersonForFamily(familyId : Text, personId : Text) : async [DisputedFact]` —
  query. Returns the facts on a Person Profile in `familyId` that have an
  unresolved conflict (`#Conflicting` or `#NeedsResearch`), so the Person
  Profile can show a subtle disputed indicator on each disputed fact. Each
  `DisputedFact` carries the disputed `field`, the `canonicalValue` (which may be
  blank when no canonical value exists yet and only a proposed value is
  present), the `proposedValue`, and the unresolved `status`. Requires a
  signed-in (non-anonymous) caller; anonymous callers receive `[]`. Only
  conflicts whose `familyId` equals `familyId` contribute, so a disputed
  indicator in one family never reflects another family's conflicts. Resolved
  conflicts are never returned. This is a read-only view — it never resolves or
  alters conflicts.
- `resolveConflictForFamily(familyId : Text, id : Nat, action : ConflictResolutionAction, notes : Text) : async Result<ConflictReviewItem, ResearchError>` —
  update. Active Steward of `familyId` only. Resolves a conflict review item in
  `familyId` with an explicit decision. `#KeepExisting` leaves canonical data
  unchanged and resolves the conflict (the proposed research and its provenance
  are preserved). `#ReplaceExisting` writes the proposed value into the canonical
  profile in `familyId` exactly once, preserving the old value and its provenance
  in the conflict/audit history and the new Source, and records the actor and
  timestamp; it never mutates a same-`personId` profile in another family.
  `#PreserveBoth` keeps both values visible as an unresolved `#Conflicting`
  conflict without silently choosing either. `#NeedsResearch` leaves canonical
  data unchanged and retains the conflict with `#NeedsResearch` status. Every
  conflict action validates that the conflict and its linked Finding, linked
  Source, and referenced PersonProfile all belong to `familyId`. Every resolution
  records an audit entry. Returns `#ok(updatedItem)` on success,
  `#err(#notFound(id))` when no conflict with that id belongs to `familyId`, and
  `#err(#invalidState(...))` when a `#ReplaceExisting` resolution targets a
  Person Fact whose field cannot be mapped to a canonical Person field — in that
  case the conflict is left unresolved and canonical data is not altered.

The following single-family endpoints are TEMPORARY Tenancy 1C compatibility
wrappers. Each delegates to its family-scoped counterpart with the default
family id (`\"norwood\"`), so current Norwood behavior is unchanged. They contain
no business logic of their own.

- `listConflictReviewItems() : async [ConflictReviewItem]` — query. TEMPORARY
  Tenancy 1C compatibility wrapper for `listConflictReviewItemsForFamily`,
  delegating with the default family id (`\"norwood\"`). Family Steward only.
  Lists all conflict review items.
- `listConflictsForPerson(personId : Text) : async [ConflictReviewItem]` —
  query. TEMPORARY Tenancy 1C compatibility wrapper for
  `listConflictsForPersonForFamily`, delegating with the default family id
  (`\"norwood\"`). Returns the unresolved conflict review items affecting a given
  Person. Requires a signed-in (non-anonymous) caller; anonymous callers receive
  `[]`.
- `listDisputedFactsForPerson(personId : Text) : async [DisputedFact]` — query.
  TEMPORARY Tenancy 1C compatibility wrapper for
  `listDisputedFactsForPersonForFamily`, delegating with the default family id
  (`\"norwood\"`). Returns the facts on a Person Profile that have an unresolved
  conflict. Requires a signed-in (non-anonymous) caller; anonymous callers
  receive `[]`.
- `resolveConflict(id : Nat, action : ConflictResolutionAction, notes : Text) : async Result<ConflictReviewItem, ResearchError>` —
  update. TEMPORARY Tenancy 1C compatibility wrapper for
  `resolveConflictForFamily`, delegating with the default family id
  (`\"norwood\"`). Family Steward only. Resolves a conflict review item with an
  explicit decision.
- `getReviewQueueForFamily(familyId : Text) : async ReviewQueue` — query.
  Requires an active Steward of `familyId`. Returns the review queue badge counts
  (`pending`, `approved`, `rejected`, `conflicting`, `needsResearch`) and the
  full list of reviewable items (`items`). The Sources section and every
  source-derived count are restricted to sources whose `familyId` equals
  `familyId`, the Findings section and every finding-derived count are
  restricted to findings whose `familyId` equals `familyId`, the New Person
  Candidates section and every candidate-derived count are restricted to
  candidates whose `familyId` equals `familyId`, the Relationships section is
  restricted to proposals whose `familyId` equals `familyId`, and the Conflicts
  section and every conflict-derived count are restricted to conflicts whose
  `familyId` equals `familyId`, so the queue never mixes source, finding,
  candidate, relationship-proposal, or conflict counts across families. Every
  pending item appears with its type,
  title/summary, contributor, provenance, created date, evidence label, and
  available steward actions. Because the queue exposes contributor principals,
  proposed findings content, and provenance, it is gated to Family Stewards and
  traps with `\"Unauthorized: You must be signed in\"` for an anonymous caller
  and `\"Unauthorized: Only Family Stewards can perform this action\"` when the
  caller is not an active Family Steward (an ACTIVE persisted `StewardRecord`).
- `getReviewQueue() : async ReviewQueue` — query. TEMPORARY Tenancy 1C
  compatibility wrapper for `getReviewQueueForFamily`, delegating with the
  default family id (`\"norwood\"`). Family Steward only. Returns the review
  queue badge counts and the full list of reviewable items aggregated across all
  reviewable research intake records, including pending Sources. Every pending
  item appears with its type, title/summary, contributor, provenance, created
  date, evidence label, and available steward actions. Because the queue exposes
  contributor principals, proposed findings content, and provenance, it is gated
  to Family Stewards and traps with `\"Unauthorized: You must be signed in\"` for
  an anonymous caller and `\"Unauthorized: Only Family Stewards can perform this
  action\"` when the caller is not an active Family Steward (an ACTIVE persisted
  `StewardRecord`).
- `approveSourceForFamily(familyId : Text, sourceId : SourceId) : async ?SourceRecord` —
  update. Requires an active Steward of `familyId`. Approves the pending source
  with `sourceId` in `familyId`, transitioning it to `#Approved` so it becomes
  usable by Proposed Findings. When the source links an Archive item
  (`archiveItemId`) that belongs to the SAME family, that item is transitioned
  from `#Pending` to `#Approved` in the same action — the single approval covers
  both records. The linked item keeps its metadata, blob, and ids, no second
  Archive item is created, and no `#ArchiveApproved` notification is emitted.
  Records exactly one `#ResearchApproved` notification to the contributor. An
  `archiveItemId` pointing at another family's item is never followed. Returns
  the updated source, or `null` when no pending source with that id belongs to
  `familyId`.
- `rejectSourceForFamily(familyId : Text, sourceId : SourceId) : async ?SourceRecord` —
  update. Requires an active Steward of `familyId`. Rejects the pending source
  with `sourceId` in `familyId`, transitioning it to `#Rejected`. When the source
  links an Archive item (`archiveItemId`) that belongs to the SAME family, that
  item is transitioned from `#Pending` to `#Rejected` in the same action — the
  single rejection covers both records. The linked item's record and provenance
  are preserved, no second Archive item is created, and no `#ArchiveRejected`
  notification is emitted. Records exactly one `#ResearchRejected` notification
  to the contributor. An `archiveItemId` pointing at another family's item is
  never followed. Returns the updated source, or `null` when no pending source
  with that id belongs to `familyId`.
- `needsResearchSourceForFamily(familyId : Text, sourceId : SourceId) : async ?SourceRecord` —
  update. Requires an active Steward of `familyId`. Marks the pending source with
  `sourceId` in `familyId` as needing research, transitioning it to
  `#NeedsResearch` while preserving the source and its notes. Returns the updated
  source, or `null` when no pending source with that id belongs to `familyId`.
- `approveSource(id : SourceId) : async ?SourceRecord` — update. TEMPORARY
  Tenancy 1C compatibility wrapper for `approveSourceForFamily`, delegating with
  the default family id (`\"norwood\"`). Family Steward only. Approves a pending
  source, transitioning it to `#Approved` so it becomes usable by Proposed
  Findings. When the source links an Archive item (`archiveItemId`), that item is
  transitioned from `#Pending` to `#Approved` in the same action — the single
  approval covers both records. The linked item keeps its metadata, blob, and
  ids, no second Archive item is created, and no `#ArchiveApproved` notification
  is emitted. Records exactly one `#ResearchApproved` notification to the
  contributor. Returns the updated source, or `null` when it does not exist or is
  not pending.
- `rejectSource(id : SourceId) : async ?SourceRecord` — update. TEMPORARY Tenancy
  1C compatibility wrapper for `rejectSourceForFamily`, delegating with the
  default family id (`\"norwood\"`). Family Steward only. Rejects a pending
  source, transitioning it to `#Rejected`. When the source links an Archive item
  (`archiveItemId`), that item is transitioned from `#Pending` to `#Rejected` in
  the same action — the single rejection covers both records. The linked item's
  record and provenance are preserved, no second Archive item is created, and no
  `#ArchiveRejected` notification is emitted. Records exactly one
  `#ResearchRejected` notification to the contributor. Returns the updated
  source, or `null` when it does not exist or is not pending.
- `needsResearchSource(id : SourceId) : async ?SourceRecord` — update. TEMPORARY
  Tenancy 1C compatibility wrapper for `needsResearchSourceForFamily`, delegating
  with the default family id (`\"norwood\"`). Family Steward only. Marks a pending
  source as needing research, transitioning it to `#NeedsResearch` while
  preserving the source and its notes. Returns the updated source, or `null` when
  it does not exist or is not pending.
- `getResearchAuditLogForFamily(familyId : Text) : async [ResearchAuditEntry]` —
  query. Requires an active Steward of `familyId`. Returns only the research
  intake audit entries whose `familyId` equals `familyId`, recording provenance
  and approval actions for every finding and its review lifecycle. Because the
  audit log records provenance and approval actions, it is gated to Family
  Stewards of that family and traps with `\"Unauthorized: You must be signed in\"`
  for an anonymous caller and `\"Unauthorized: Only Family Stewards can perform
  this action\"` when the caller is not an active Family Steward (an ACTIVE
  persisted `StewardRecord`) of `familyId`. Family A audit activity is never
  returned through a Family B call.
- `getResearchAuditLog() : async [ResearchAuditEntry]` — query. TEMPORARY
  Tenancy 1C compatibility wrapper for `getResearchAuditLogForFamily`, delegating
  with the default family id (`\"norwood\"`). Family Steward only. Returns the
  research intake audit history for the default family, recording provenance and
  approval actions for every finding and its review lifecycle. Because the audit
  log records provenance and approval actions, it is gated to Family Stewards
  and traps with `\"Unauthorized: You must be signed in\"` for an anonymous
  caller and `\"Unauthorized: Only Family Stewards can perform this action\"`
  when the caller is not an active Family Steward (an ACTIVE persisted
  `StewardRecord`).

### Archive search, source upload, board media, and claim notification reconciliation

- `searchArchiveItemsForFamily(familyId : Text, filter : ArchiveSearchFilter) : async [ArchiveItem]` —
  query. Requires an approved member or active Steward of `familyId`.
  Searches/filters approved archive items in `familyId` by title query, tags,
  item type, related family member, and era. Returns only `#Approved` items whose
  `familyId` equals `familyId` and that are visible to the caller under the
  archive privacy rules (same server-side enforcement as
  `listApprovedArchiveItemsForFamily`: `#Public` to everyone, `#FamilyOnly` to
  approved members of `familyId` or active Stewards of `familyId`, `#Private` to
  their contributor or an active Steward of `familyId`).
  `filter.searchTerm` matches the item title case-insensitively and by
  substring; `filter.tags`
  matches items carrying ALL of the given tags, each matched case-insensitively
  and by substring against the item's canonical `tags` list; `filter.itemType`,
  `filter.relatedMemberId`, and `filter.era` filter by category, linked family
  member, and era respectively. Every field is optional — a `null`/empty field
  does not constrain the result. The single-family `searchArchiveItems` is a
  TEMPORARY Tenancy 1C compatibility wrapper delegating with the default family
  id (`\"norwood\"`).
- `createSourceWithUpload(title : Text, sourceType : SourceType, description : Text, mimeType : Text, blob : Blob, tags : [Text], era : Text, year : ?Nat, relatedMemberIds : [Text], privacyLevel : PrivacyLevel, classification : ArchiveItemClassification, primarySpeaker : ?OralHistorySpeaker, filename : Text) : async Result<SourceUploadResult, ResearchError>` —
  update. Uploads a research source file: creates exactly ONE canonical Archive
  item (in `#Pending` state) from the uploaded file and links a new Research
  Source record to it via `archiveItemId`, so no manually typed Archive Item ID
  is required. The Archive item's `itemType` is derived from the source type
  (`#ResearchNotes` becomes `#Research`; the other source types become
  `#Document`), and the caller is recorded as the `contributor` of both records
  (provenance). The validated MIME type and the sanitized `filename` are
  persisted on the created Archive item as `mimeType` and `filename`, so the
  frontend can offer a safe inline preview without relying on `ExternalBlob`
  runtime metadata. Requires an approved family member (a caller holding at least one
  `#Approved` profile claim, or a Family Steward); returns
  `#err(#notAuthorized)` for an anonymous or signed-in but unapproved caller —
  a distinguishable, non-technical authorization outcome the frontend maps to a
  definitive family-membership-required message. `title` and `description` are
  required. `era` is OPTIONAL: an empty or whitespace-only value is accepted and
  stored as `\"\"`; a non-empty value is trimmed and must be at most 150
  characters, and an overlong value is rejected (never silently truncated). As
  with `submitArchiveItem`,
  `classification == #OralHistory` requires a `primarySpeaker` (returns
  `#err(#invalidState(\"A primary speaker is required for Oral History items\"))`
  when `null`) and `classification == #Standard` forbids one (returns
  `#err(#invalidState(\"A primary speaker is only allowed on Oral History items\"))`
  when present). The result carries both the created `source` and the
  canonical `archiveItem`.
- `createBoardPostWithMediaForFamily(familyId : FamilyId, postType : PostType, title : ?Text, body : Text, relatedPersonIds : [Text], existingArchiveItemIds : [Nat], newUploads : [BoardMediaUpload], tags : [Text]) : async Post` —
  update. Canonical family-scoped form of `createBoardPostWithMedia`. Creates a
  board post whose `familyId` is `familyId`, attaching existing Archive items (by
  id, no re-upload) and/or new uploads, all scoped to `familyId`. Every related
  person, every existing Archive item id, and every new upload's related people
  must belong to `familyId`; a foreign-family id traps with `\"Unauthorized:
  Linked media must belong to the same family\"`. Approved members or Stewards of
  `familyId` only.
- `createBoardPostWithMedia(postType : PostType, title : ?Text, body : Text, relatedPersonIds : [Text], existingArchiveItemIds : [Nat], newUploads : [BoardMediaUpload]) : async Post` —
  update. TEMPORARY Tenancy 1C compatibility wrapper for
  `createBoardPostWithMediaForFamily`; delegates with the default Norwood family
  (`\"norwood\"`). Creates a board post that attaches existing Archive items (by
  id, no re-upload) and/or new uploads. Each `newUploads` entry creates exactly
  ONE canonical Archive item (in `#Pending` state) linked to the post; the
  underlying file is never duplicated. Each upload's validated MIME type and
  sanitized `filename` are persisted on the created Archive item as `mimeType`
  and `filename`. Existing Archive items are attached by
  id without re-uploading. The post's `linkedMediaIds` is the union of the
  existing ids that resolve to a real Archive item and the ids of the newly
  created items. Approved family members only: traps with `\"Unauthorized: You
  must be signed in\"` for an anonymous caller and `\"Unauthorized: Only
  approved family members can access the message board\"` when the caller is not
  an approved member.
- `reconcileClaimNotificationsForFamily(familyId : Text, claimId : Nat) : async Nat` —
  update. Reconciles stale claim notifications for a claim in `familyId`. When
  the claim is `#Approved`, marks the pending `#ProfileClaimRequested`
  notification for the claimant as read/resolved so it no longer reads \"pending
  review\"; the `#ProfileClaimReviewed` notification already reflects the final
  approved state. The profile status stays `#Claimed` and no new claim is
  created. The claim is located with a family-qualified lookup, so a `claimId`
  alone can never cross the family boundary: a claim belonging to another family
  is never found and nothing is reconciled. Returns the number of notifications
  reconciled (0 when the claim does not exist in `familyId` or is not
  `#Approved`). Requires an approved member of `familyId` (a caller holding at
  least one `#Approved` profile claim in `familyId`, or a Steward of
  `familyId`); traps with `\"Unauthorized: You must be signed in\"` for an
  anonymous caller and with the stable, non-technical `\"Family membership
  required. Claim your family profile and wait for Family Steward approval
  before contributing family content.\"` for a signed-in but unapproved caller,
  so the frontend can present a definitive family-membership-required outcome
  rather than a generic retry.
- `reconcileClaimNotifications(claimId : Nat) : async Nat` — update. TEMPORARY
  compatibility wrapper for `reconcileClaimNotificationsForFamily`; delegates
  with the default Norwood family (`\"norwood\"`). Reconciles stale claim
  notifications for a claim. When the claim is `#Approved`, marks
  the pending `#ProfileClaimRequested` notification for the claimant as
  read/resolved so it no longer reads \"pending review\"; the `#ProfileClaimReviewed`
  notification already reflects the final approved state. The profile status
  stays `#Claimed` and no new claim is created. Returns the number of
  notifications reconciled (0 when the claim does not exist or is not
  `#Approved`). Requires an approved family member (a caller holding at least one
  `#Approved` profile claim, or a Family Steward); traps with
  `\"Unauthorized: You must be signed in\"` for an anonymous caller and with the
  stable, non-technical `\"Family membership required. Claim your family profile
  and wait for Family Steward approval before contributing family content.\"`
  for a signed-in but unapproved caller, so the frontend can present a
  definitive family-membership-required outcome rather than a generic retry.

### Data Export / Portability (Phase 5A / 5C / 5C-H1)

- `retrieveFamilyArchiveMedia(exportInstanceRef : Text, mediaRef : Text) : async Result<ExportMediaRetrieval, ExportMediaRetrievalError>` —
  update. Retrieves the bytes of a single asset bound to a specific
  FamilyArchive export instance, for an active Family Steward of that instance's
  family. Anonymous callers get `#err(#NotSignedIn)`; a non-Steward, or a
  Steward of another family, gets `#err(#NotSteward)`. Possession of an
  export-instance reference alone never bypasses Steward authorization, and a
  Family A export instance never retrieves Family B assets. `exportInstanceRef`
  is the opaque reference returned by `exportFamilyArchive`; `mediaRef` is the
  export-local media token (`media-1`, `media-2`, …) from that instance's
  manifest. The token is resolved ONLY against the instance's stored bindings —
  never against a rebuilt current family-media manifest — so an old export's
  `media-2` keeps meaning the same asset after family media is added, deleted,
  or reordered. An unknown instance gets `#err(#ExportInstanceNotFound)`; an
  expired instance gets `#err(#ExportInstanceExpired)`; a token not bound to
  that instance gets `#err(#MediaNotFound)`; a bound asset whose bytes are
  missing gets `#err(#MediaUnavailable)`. An export instance has a bounded
  lifecycle of 7 days from generation; once that window has elapsed the instance
  is expired and its bindings are no longer resolvable — an expired instance
  never falls back to resolving `media-N` against a rebuilt current manifest.
  Before resolving, this call performs a bounded lazy cleanup that removes any
  expired export instances and their media bindings from the temporary
  export-retrieval mapping state; a ref that was expired and is pruned by that
  cleanup resolves neutrally as `#err(#ExportInstanceNotFound)`, while a
  still-present expired ref resolves as `#err(#ExportInstanceExpired)`. The
  cleanup touches only the temporary export-instance mapping — never family
  archive media, profile photos, archive items, export audit history, or media
  bytes. The bytes are returned directly to the
  authorized caller for this call only: no public or permanent media URL is
  created and no storage secret is exposed. Read-only: no family, profile,
  archive, or media data is mutated.
- `exportMyData(familyId : Text) : async Result<ExportEnvelope, ExportError>` —
  update. Exports the authenticated requester's own Norwood identity data in
  `familyId`. Anonymous callers get `#err(#NotSignedIn)`. The caller's own
  Person/Profile is resolved server-side in `familyId` (by direct ownership or an
  `#Approved` profile claim); a caller with no profile in this family gets
  `#err(#NotAuthorized)`. A caller-supplied person id is never accepted, so a
  known id cannot bypass authorization. Inclusion: the caller's own profile
  projection, their family memberships, relationships involving their
  Person/Profile, archive/history items authored by or attached to their profile,
  their own uploaded media metadata, and their own recovery history/status.
  Exclusion: other users' account principals, others' private recovery
  information, Steward-only governance records, secrets/tokens, and
  authentication-provider data. Read-only: no family/profile/archive data is
  mutated; the only write is the export audit entry.
- `exportFamilyArchive(familyId : Text) : async Result<ExportFamilyArchiveResult, ExportError>` —
  update. Exports the portable FamilyArchive dataset of `familyId`. Requires an
  active Family Steward of `familyId`; anonymous callers get
  `#err(#NotSignedIn)` and a non-Steward (including a Steward of another family)
  gets `#err(#NotSteward)`. A known family id never bypasses authorization.
  Inclusion: family metadata, Person/Profile records, family relationships,
  archive/history entries, family stories, sources, photo/media metadata, and
  recipes/oral-history metadata present in that family. Exclusion: authentication
  credentials, invite tokens, recovery secrets, internal authorization secrets,
  raw account principals, and platform-only operational data. On success the
  result carries the existing versioned `envelope` plus an opaque
  `exportInstanceRef` that binds this generated manifest to later media
  retrieval; the reference reveals no family id, media/storage id, internal
  record id, or storage secret. The instance has a bounded lifecycle of 7 days
  from generation, after which media retrieval against it returns the neutral
  `#ExportInstanceExpired`. Before minting a new instance, this call performs a
  bounded lazy cleanup that removes any expired export instances and their media
  bindings from the temporary export-retrieval mapping state, so that state
  cannot accumulate indefinitely; the cleanup touches only that temporary
  mapping — never family archive media, profile photos, archive items, export
  audit history, or media bytes. Read-only with respect to family/profile/archive
  data; the writes are the export audit entry and the new export-instance
  mapping (instance record plus its media bindings).

Both endpoints return a self-describing, versioned `ExportEnvelope`:
`metadata` carries `schemaVersion` (currently `1`), `generatedAt` (a nanosecond
timestamp), `scope` (`#MyData`/`#FamilyArchive`), `format` (`#JSON`), `familyRef`
(the portable family display name, never the internal family id), and
`sourceAppName`/`sourceAppVersion`; `payloadJson` is the serialized portable
payload as JSON text. Relationships between exported records are preserved
through stable portable record references (`ExportRecordRef`), never through raw
account principals or internal secret ids. Media is metadata/reference only —
no bytes are carried in the envelope, and the media manifest is kept separate so
binary packaging can be added later without breaking the format.

The `mediaManifest` category is a versioned, additive list of portable media
entries. Each entry carries an export-local media reference (`media-N`), a
portable `mediaKind` (`ProfilePhoto` or `ArchiveItem`), a title, an optional
MIME type and filename, an optional byte size, an optional export-local
`relatedPersonRef` and `relatedArchiveRef`, an optional created/uploaded
timestamp, an `availability` state (`Available` or `Unavailable`), and an opaque
export-local `reference`. It never exposes a raw internal media or storage
identifier. A missing or unavailable asset is represented neutrally as
`Unavailable` and never invalidates the rest of the export. The
`mediaManifestSummary` object records the asset count, the aggregate known byte
size, and the unavailable count so later packaging can enforce limits. The
exportable media types are the assets already legitimately stored as
family/archive content: profile photos and archive/history items (photos,
documents, audio, video, and other family-history media).

Every export attempt (success AND failure) is recorded in the export audit
history with the scope, family, requesting account, timestamp, and
success/failure status. The exported payload itself is never stored in audit
history. Errors are stable and family-facing: `#NotSignedIn`, `#NotAuthorized`,
`#NotSteward`, `#FamilyNotFound`, `#UnsupportedScope`, `#UnsupportedFormat`,
`#ExportFailed`.

### Object Query Layer (OQL)

- `schema() : async Text` — query. Returns a JSON catalogue of the exposed
  entities and their fields.
- `execute(qJson : Text) : async Result` — query. Runs a JSON-encoded OQL query
  and returns matching rows.

The exposed entities are `family`, `photo`, `archiveItem`, `profile`, `claim`,
`relationshipRequest`, `confirmedRelationship`, `notification`, `account`,
`steward`, `foundingStewardState`, `foundingStewardNomination`,
`familyMembership`, `familyInvitation`, `membershipConfirmation`,
`membershipConfirmationResolution`, `successor`,
`removalRequest`, `auditLog`, `mergeConflict`,
`archivedProfile`, `dismissedPair`, `story`, `mystery`, `mysteryContribution`,
`recipe`, `boardPost`, `boardReply`, `conversation`, `message`, `block`,
`report`, `researchSource`, `proposedFinding`, `newPersonCandidate`,
`relationshipProposal`, `conflictReviewItem`, `researchAuditLog`,
`recoveryRequest`, `recoveryVerification`, and `recoveryAuditLog`.
The export audit history and the Phase 5C-H1 export-instance state
(`exportInstances`, `exportMediaBindings`) are deliberately NOT exposed as OQL
entities: they store raw account principals, family ids, and internal media
source keys, and they have no public read endpoint, so exposing them would leak
internal identifiers. They are reachable only through the authorized export and
media-retrieval methods described in the Data Export / Portability section.
Most are declared `.controllerOnly()` (see the authorization section); the
`archiveItem`, `conversation`, `researchSource`, `recoveryRequest`,
`recoveryVerification`, and `recoveryAuditLog` entities are
`.controllerOrScoped()` and the `message` entity is `.scopedPerUser()`.
`archiveItem` uses a privacy-reflecting row-visibility rule (see the
authorization section); `researchSource` and the three recovery entities use a
family-membership row-visibility rule; `conversation` and `message` use a
participant-only visibility rule. The governance entities `steward`, `successor`,
`removalRequest`, `auditLog`, `mergeConflict`, and `dismissedPair` each carry a
`familyId` column naming the family the record belongs to — the tenant boundary
— so a controller-side query can separate Family A governance records from
Family B's. `family` rows (primary key
`id`) carry `displayName`, `createdAt` (nanoseconds since epoch, `Int`),
`createdBy` (the creating principal, rendered as text), and `status`
(`\"active\"`/`\"archived\"`). `photo` rows are flattened
photo metadata: `key` (globally-unique \"<personId>:<id>\", the primary key),
`personId`, `id`, `filename`, `mimeType`, `uploadedAt` (nanoseconds since epoch,
`Int`), `uploadedBy` (the uploading principal, rendered as text), and
`isProfilePhoto` (`Bool`). `archiveItem` rows are flattened archive metadata:
`familyId` (the owning family id, the tenant boundary), `id` (the primary key),
`title`, `itemType`, `era`, `year` (optional year, `0`
when absent), `contributor` (the submitting principal, rendered as text),
`sourceStatus`, `privacyLevel`, `status`, `createdAt` (nanoseconds since
epoch, `Int`), `classification` (`\"Standard\"`/`\"OralHistory\"`), `primarySpeakerName` (the primary speaker's display name, `\"\"` when the item is
not Oral History), `mimeType` (the persisted validated MIME type, `\"\"` when
absent — e.g. for records created before the field existed), `filename` (the
persisted sanitized filename, `\"\"` when absent), and `tags` (the item's
canonical tag list joined with
`\", \"`, `\"\"` when the item has no tags). The raw blob bytes are not exposed.

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
`id`) carry `familyId` (the family whose activity produced the notification —
the tenant boundary), `recipient` (principal text), `notificationType`
(`\"ProfileClaimRequested\"`/`\"ProfileClaimReviewed\"`/`\"RelationshipRequested\"`/`\"RelationshipReviewed\"`/`\"BoardReply\"`/`\"BoardMention\"`/`\"NewMessage\"`/`\"ResearchSubmission\"`/`\"ResearchApproved\"`/`\"ResearchRejected\"`/`\"ArchiveApproved\"`/`\"ArchiveRejected\"`),
`message`, `createdAt` (nanoseconds since epoch, `Int`), and `read` (`Bool`).
The `notification` entity is `.controllerOnly()`, so only the platform
controller reads its rows through `schema()`/`execute()`; the `familyId` column
lets a controller-side query separate Family A notifications from Family B
notifications.
`account` rows (primary key `id`, the account's stable principal rendered as
text) carry `google` and `apple` (`Bool`, whether that authentication method is
bound to the account) and `createdAt` (nanoseconds since epoch, `Int`).

The governance entities are flattened views of the corresponding records.
`steward` rows (primary key `stewardAccountId`, the steward's account principal
rendered as text) carry `familyId` (the owning family id, the tenant boundary),
`roleStatus` (`\"Active\"`/`\"Removed\"`),
`successorPriority` (the steward's own designated successor priority, `0` when
none), `assignedBy` (the promoting steward's principal rendered as text), and
`assignedAt` (nanoseconds since epoch, `Int`). `foundingStewardState` rows
(primary key `familyId`, the tenant boundary) carry `state` — the family's
founding-Steward onboarding progress as tag text (`\"Undecided\"`,
`\"FounderAccepted\"`, `\"NominationPending\"`, or `\"Transferred\"`). This table
is PROGRESS TRACKING ONLY: it never grants or removes Steward authority, which
lives solely in the `steward` table. A family with no recorded state simply has
no row here (it reads as `#Undecided` through the API), and the default Norwood
family is never initialized into this state. `foundingStewardNomination` rows
(primary key `id`) carry `familyId` (the owning family id, the tenant boundary —
a nomination id alone never resolves across families), `founderAccountId` (the
nominating founder's principal rendered as text), `nomineePersonId`,
`nomineeAccountId` (the nominee's account principal rendered as text, `\"\"` when
the nominee profile is unclaimed), `nomineeEmail` (`\"\"` when none was
supplied), `status` (`\"Pending\"`/`\"Accepted\"`/`\"Declined\"`/`\"Cancelled\"`),
`createdAt`, and `updatedAt` (nanoseconds since epoch, `Int`). Both entities are
`.controllerOnly()`, matching the `steward` and `familyMembership` governance
entities. `successor` rows (primary key
`personId`) carry `familyId` (the owning family id, the tenant boundary),
`priority` (`Nat`, the order in which the successor should be
considered for activation), `assignedBy` (principal text), `assignedAt` (`Int`),
and `status` (`\"Designated\"`/`\"Activated\"`/`\"Removed\"`). `removalRequest`
rows (primary key `id`) carry `familyId` (the owning family id, the tenant
boundary — the target profile must belong to that family and only a Steward of
that family may review the request), `personId`, `requestingUserId` (principal
text), `reason`, `status` (`\"Pending\"`/`\"Approved\"`/`\"Rejected\"`),
`submittedDate` (`Int`), `reviewedBy` (principal text, `\"\"` when unreviewed),
and `reviewedDate` (`Int`, `0` when unreviewed). `auditLog` rows (primary key
`id`) carry `familyId` (the owning family id, the tenant boundary — every
governance action stamps the family it acted on), `actionType` (the audit action
tag text, e.g.
`\"ClaimApproved\"`/`\"StewardPromoted\"`/`\"ProfileArchived\"`/`\"DuplicateMerged\"`),
`actorAccountId` (principal text), `affectedPersonCount` (`Nat`, the number of
affected person ids), `timestamp` (nanoseconds since epoch, `Int`), and
`summary`. `mergeConflict` rows (primary key `id`) carry `familyId` (the owning
family id, the tenant boundary — stamped from the merge's family), `field`,
`canonicalValue`, `alternateValue`, `status` (`\"Pending\"`/`\"Resolved\"`),
`resolvedBy` (principal text, `\"\"` when unresolved), and `resolvedAt` (`Int`,
`0` when unresolved). `archivedProfile` rows (primary key `personId`) carry only
`personId` — the id of each archived profile. `dismissedPair` rows (primary key
`key`, the composite `\"<personIdA>:<personIdB>\"`) carry `familyId` (the owning
family id, the tenant boundary — a dismissal in one family never hides a
duplicate candidate in another), `personIdA`, and
`personIdB` — the two Person ids a steward dismissed as \"Not a duplicate\", so
the pair does not reappear in the duplicate review list.

The family-history entities are flattened views of the corresponding records.
`story` rows (primary key `id`) carry `familyId` (the owning family id, the
tenant boundary), `title`, `storyText`,
`relatedMemberCount` (`Nat`, the number of related member ids),
`era` (free text, `\"\"` when absent), `year` (`Nat`, `0` when absent),
`location` (`\"\"` when absent), `contributor` (principal text),
`evidenceStatus` (`\"Documented\"`/`\"FamilyHistory\"`/`\"PersonalMemory\"`/`\"Unresolved\"`),
`relatedArchiveItemCount` (`Nat`), `createdAt` (`Int`, nanoseconds since epoch),
`updatedAt` (`Int`), and `status` (`\"Pending\"`/`\"Approved\"`/`\"Rejected\"`).
`mystery` rows (primary key `id`) carry `familyId` (the owning family — the
tenant boundary), `title`, `description`,
`relatedMemberCount` (`Nat`), `relatedBranchId` (`\"\"` when absent),
`knownFactCount` (`Nat`), `possibilityCount` (`Nat`), `relatedSourceCount`
(`Nat`), `relatedArchiveItemCount` (`Nat`), `status`
(`\"Open\"`/`\"Researching\"`/`\"PartiallyResolved\"`/`\"Resolved\"`), `contributor`
(principal text), `createdAt` (`Int`), `updatedAt` (`Int`), and `resolved`
(`Bool`, whether the mystery has a resolution). `mysteryContribution` rows
(primary key `id`) carry `familyId` (the owning family — the tenant boundary),
`mysteryId` (`Nat`), `contributionType`
(`\"Note\"`/`\"Memory\"`/`\"Lead\"`/`\"Source\"`), `text`, `contributor` (principal
text), `status` (`\"Pending\"`/`\"Approved\"`/`\"Rejected\"`), `createdAt` (`Int`),
`reviewedBy` (principal text, `\"\"` when unreviewed), and `reviewedAt` (`Int`,
`0` when unreviewed). The array-valued fields (`relatedMemberIds`,
`knownFacts`, `possibilities`, `relatedSourceIds`, `relatedArchiveItemIds`)
are exposed as counts since OQL has no array value type. Both the `mystery` and
`mysteryContribution` entities are `.controllerOnly()`, so only the platform
controller reads their rows through `schema()`/`execute()`; end users read
Mystery data through the family-scoped Mystery API methods, which enforce the
same `familyId` boundary. The `familyId` column on each row is the tenant
boundary, so a controller-side query can separate Family A mysteries and
contributions from Family B's.

The recipe entity is a flattened view of the corresponding records. `recipe`
rows (primary key `recipeId`, a `Nat`) carry `familyId` (the tenant boundary —
the owning family id), `title`, `shortDescription`,
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
`boardPost` rows (primary key `postId`, a `Nat`) carry `familyId` (the owning
family id, the tenant boundary), `authorAccountId` (the
author's account principal rendered as text), `authorPersonId` (the canonical
Person id of the author), `title` (`\"\"` when absent), `body`, `postType`
(`\"General\"`/`\"Announcement\"`/`\"FamilyQuestion\"`/`\"ResearchHistory\"`/`\"PhotoIdentification\"`/`\"Recipe\"`/`\"ReunionEvent\"`/`\"Memorial\"`/`\"Other\"`),
`relatedPersonCount` (`Nat`, the number of related member ids),
`linkedMediaCount` (`Nat`, the number of linked Archive/media ids), `tags` (the
post's canonical tag list joined with `\", \"`, `\"\"` when the post has no
tags), `createdAt`
(`Int`, nanoseconds since epoch), `updatedAt` (`Int`), `status`
(`\"Active\"`/`\"Archived\"`), and `privacyScope` (`\"FamilyOnly\"`). The
array-valued fields (`relatedPersonIds`, `linkedMediaIds`) are exposed as counts
since OQL has no array value type. `boardReply` rows (primary key `replyId`, a
`Nat`) carry `familyId` (the owning family id, the tenant boundary), `postId`,
`authorAccountId` (principal text), `authorPersonId`,
`body`, and `createdAt` (`Int`). Both board entities are `.controllerOnly()`, so
only the platform controller reads their rows through `schema()`/`execute()`.
Board media/attachments are not a separate collection: a board post's
attachments are canonical Archive items referenced by `linkedMediaIds`, exposed
through the `archiveItem` entity (which carries `familyId`). Board moderation
actions (archive/restore post, remove reply) are recorded in the shared
governance `auditLog` entity, not a separate board-owned collection.

The messaging entities are flattened views of the corresponding records.
`conversation` rows (primary key `conversationId`, a `Nat`) carry `familyId`
(the owning family id, the tenant boundary), `participantCount` (`Nat`, the
number of participant account ids), `createdAt`
(`Int`), and `updatedAt` (`Int`). The array-valued fields
(`participantAccountIds`, `participantPersonIds`) are exposed as counts since
OQL has no array value type. `message` rows (primary key `messageId`, a `Nat`)
carry `familyId` (the owning family id, the tenant boundary), `conversationId`,
`senderAccountId` (principal text), `senderPersonId`,
`body`, `createdAt` (`Int`), `readAt` (`Int`, `0` when unread), and `status`
(`\"Sent\"`/`\"Blocked\"`). `block` rows (primary key `key`, the composite
`\"<blockerAccountId>:<blockedAccountId>\"`) carry `familyId` (the owning family
id, the tenant boundary), `blockerAccountId` (principal
text), `blockedAccountId` (principal text), and `createdAt` (`Int`). `report`
rows (primary key `reportId`, a `Nat`) carry `familyId` (the owning family id,
the tenant boundary), `reportingAccountId` (principal
text), `reportedMessageId` (`Nat`), `reason`, `createdAt` (`Int`), and `status`
(`\"Pending\"`/`\"Reviewed\"`/`\"Dismissed\"`).

The research-intake entities are flattened views of the corresponding records.
`researchSource` rows (primary key `id`, a `Nat`) carry `familyId` (the owning
family id, the tenant boundary), `title`, `sourceType`
(`\"CensusCitation\"`/`\"DeedPropertyReference\"`/`\"EmailThread\"`/`\"ResearchNotes\"`/`\"CertificateHeadstoneReference\"`/`\"UploadedDocumentImage\"`),
`description`, `archiveItemId` (`Nat`, `0` when the source links to no Archive
item), `contributor` (principal text), `status`
(`\"Pending\"`/`\"Approved\"`/`\"Rejected\"`/`\"Conflicting\"`), `createdAt`
(`Int`, nanoseconds since epoch), and `updatedAt` (`Int`). The `researchSource`
entity is `.controllerOrScoped()` with a family-membership row-visibility rule:
the platform controller reads all rows, while a signed-in caller reads only the
sources whose `familyId` is a family they are an approved member or active
Steward of, so a caller can never read another family's sources through OQL.
`proposedFinding`
rows (primary key `id`, a `Nat`) carry `familyId` (the owning family id, the
tenant boundary), `title`, `evidenceLabel`
(`\"Documented\"`/`\"FamilyHistoryOralHistory\"`/`\"PersonalMemory\"`/`\"Hypothesis\"`/`\"Conflicting\"`/`\"NeedsResearch\"`),
`findingType` (`\"PersonFact\"`/`\"Relationship\"`/`\"TimelineEvent\"`/`\"Story\"`/`\"Mystery\"`/`\"Source\"`),
`sourceId` (`Nat`), `personId` (`\"\"` when the finding matches no canonical
Person), `newPersonCandidateId` (`Nat`, `0` when none), `status`, `conflictReviewId`
(`Nat`, `0` when the finding is not linked to a Conflict Review item),
`submittedBy` (principal text), `submittedAt` (`Int`), `reviewedBy` (principal
text, `\"\"` when unreviewed), `reviewedAt` (`Int`, `0` when unreviewed), and
`updatedAt` (`Int`). The nested `content` variant is not exposed (OQL has no
variant value type); the `findingType` column carries the routing target.
`newPersonCandidate` rows (primary key `id`, a `Nat`) carry `familyId` (the
owning family id, the tenant boundary), `name`, `details`,
`sourceId`, `status`, `submittedBy` (principal text), `submittedAt` (`Int`),
`reviewedBy` (principal text, `\"\"` when unreviewed), and `reviewedAt` (`Int`,
`0` when unreviewed). `relationshipProposal` rows (primary key `id`, a `Nat`)
carry `fromPersonId`, `toPersonId`, `relationshipType`, `sourceId`, `status`,
`submittedBy` (principal text), `submittedAt` (`Int`), `reviewedBy` (principal
text, `\"\"` when unreviewed), and `reviewedAt` (`Int`, `0` when unreviewed).
`conflictReviewItem` rows (primary key `id`, a `Nat`) carry `findingId` (`Nat`),
`personId` (`\"\"` when the conflict targets no canonical Person), `field`,
`canonicalValue`, `proposedValue`, `existingSourceId` (`Nat`, `0` when the
existing canonical value's source is unknown), `proposedSourceId` (`Nat`, `0`
when the proposed finding has no source), `evidenceLabel`
(`\"Documented\"`/`\"FamilyHistoryOralHistory\"`/`\"PersonalMemory\"`/`\"Hypothesis\"`/`\"Conflicting\"`/`\"NeedsResearch\"`),
`stewardNotes`, `status`, `resolvedBy` (principal text, `\"\"` when unresolved),
and `resolvedAt` (`Int`, `0` when unresolved).
`researchAuditLog` rows (primary key `id`, a `Nat`) carry `action` (the audit
action tag text, e.g. `\"SourceCreated\"`/`\"FindingSubmitted\"`/`\"FindingApproved\"`/`\"FindingRoutedToConflict\"`/`\"ConflictResolved\"`),
`findingId` (`Nat`, `0` when the entry is not tied to a finding), `sourceId`
(`Nat`, `0` when the entry is not tied to a source), `actorId` (principal text),
`timestamp` (`Int`, nanoseconds since epoch), and `summary`.

The recovery entities are flattened views of the Phase 4A recovery records.
`recoveryRequest` rows (primary key `id`, a `Nat`) carry `familyId` (the owning
family id, the tenant boundary), `recoveryType`
(`\"AccountRecovery\"`/`\"StewardRecovery\"`), `personId` (the existing
Person/Profile whose ownership is at stake), `ownerAccountId` (the current owner
account principal rendered as text), `replacementAccountId` (the requested
replacement account principal rendered as text), `status`
(`\"Pending\"`/`\"AwaitingVerification\"`/`\"ReadyForApproval\"`/`\"Approved\"`/`\"Rejected\"`/`\"Cancelled\"`/`\"Expired\"`),
`requestedByAccountId` (principal text), `createdAt`/`updatedAt` (`Int`,
nanoseconds since epoch), `decidedByAccountId` (principal text, `\"\"` when
undecided), `decidedAt` (`Int`, `0` when undecided), and `transferredAt` (`Int`,
`0` until ownership has been transferred). `recoveryVerification` rows (primary
key `id`, a `Nat`) carry `familyId` (the tenant boundary), `recoveryId` (`Nat`),
`verifierAccountId` (principal text), `decision` (`\"Confirm\"`/`\"Reject\"`), and
`decidedAt` (`Int`). `recoveryAuditLog` rows (primary key `id`, a `Nat`) carry
`familyId` (the tenant boundary), `recoveryId` (`Nat`), `actionType` (the audit
action tag text, e.g.
`\"RequestCreated\"`/`\"VerificationRecorded\"`/`\"StewardDecisionRecorded\"`/`\"ResolutionRecorded\"`/`\"OwnershipTransferred\"`),
`actorAccountId` (principal text), `affectedPersonCount` (`Nat`, the number of
affected person ids), `timestamp` (`Int`, nanoseconds since epoch), and
`summary`. All three recovery entities are `.controllerOrScoped()` with a
family-membership row-visibility rule (their `familyId` column is the owner
column): the platform controller reads all rows, while a signed-in caller reads
only the recovery rows of a family they are an approved member or active Steward
of, so a caller can never read another family's recovery requests,
verifications, or audit history through OQL.

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

`getFamily` is a public read: any caller, including an anonymous one, may look
up a family by id. It performs no authorization check and mutates nothing.

**Temporary single-family authorization (Tenancy 1A).** Authorization is still
single-family in this build. Every existing authorization rule — approved family
membership, profile ownership, and Family Steward authority — is evaluated
against the one default `\"norwood\"` family and is unchanged by the tenancy
foundation. The `familyId` field now carried by `PersonProfile`, `ProfileClaim`,
`Relationship`, `RelationshipRequest`, `StewardRecord`, and `ArchiveItem` is
persisted and migrated, but no endpoint filters or scopes by it yet. A
family-creation surface now exists: `createFamilyWithFounder` creates a new
family with its founder profile and active founder membership (see the Family
Creation section), but it does not assign Stewardship, and the onboarding UI and
Steward selection remain future phases. Authorization is converted to
family-scoped authorization in Tenancy 1B; until then, callers must not assume
that a `familyId` value restricts what an authorized caller can read or write.

The photo mutation methods (`addPhoto`, `setProfilePhoto`, `removePhoto`) are
gated to the approved owner of the target claimed profile or a Family Steward.
Anonymous callers trap with `\"Unauthorized: You must be signed in\"`; any other
caller — including an approved family member who does not own the profile —
traps with `\"Unauthorized: Only the profile owner or a Family Steward can manage this profile's photos\"`.
For an unclaimed/historical profile only a Family Steward may mutate photos. The gallery read method `listPhotos` requires
an approved family member or a Family Steward (anonymous callers trap with
`\"Unauthorized: You must be signed in\"`, unapproved callers with
`\"Unauthorized: Only approved family members can view a photo gallery\"`). The
portrait read method `getProfilePhoto` stays public for an unclaimed/historical
profile so Add Myself / claim discovery works, but for a claimed profile it
requires an approved family member or a Family Steward under the same gallery
read rule. The access-control methods above
enforce the admin/user/guest model described in their entries.

The OQL methods (`schema`, `execute`) enforce authorization per entity against
the live caller. Most exposed entities — `family`, `photo`, `profile`,
`claim`, `relationshipRequest`, `confirmedRelationship`, `notification`,
`account`, `steward`, `foundingStewardState`, `foundingStewardNomination`,
`familyMembership`, `familyInvitation`, `membershipConfirmation`,
`membershipConfirmationResolution`, `successor`, `removalRequest`, `auditLog`,
`mergeConflict`, `archivedProfile`, `dismissedPair`, `story`, `mystery`,
`mysteryContribution`, `recipe`, `boardPost`, `boardReply`, `block`, and
`report` — are declared `.controllerOnly()`, so only the platform controller can read their
rows through `schema()`/`execute()`; end users do not read them directly. This
keeps the family, governance, board, block, and report metadata private
to the platform while still letting the Data Intelligence agent answer over it.
The `recoveryRequest`, `recoveryVerification`, and `recoveryAuditLog` entities
are declared `.controllerOrScoped()` with a family-membership row-visibility
rule: the platform controller reads all rows, while a signed-in caller reads
only the recovery rows whose `familyId` is a family they are an approved member
or active Steward of. A caller therefore can never read another family's
recovery requests, verifications, or audit history through OQL, matching the
family-scoped recovery API methods (`listRecoveryRequestsForFamily`,
`listRecoveryVerificationsForFamily`, `listRecoveryAuditForFamily`).
The `story` entity carries the tenant boundary `familyId` column, so a
controller-side query can separate Family A stories from Family B stories; the
direct Story API methods enforce the same boundary for end users (see the
Family Stories section).
The `archiveItem` entity is declared `.controllerOrScoped()` with a
privacy-reflecting row-visibility rule that mirrors the server-side archive
privacy enforcement: the platform controller reads all rows, while a signed-in
caller reads only the archive items they may see under the Public/FamilyOnly/
Private access model — `#Public` items to everyone, `#FamilyOnly` items to
approved family members (a caller holding at least one `#Approved` profile
claim) or Family Stewards, and `#Private` items to their contributor or a
Family Steward. This keeps the archive privacy enforcement consistent between
the direct API methods (`listApprovedArchiveItems`, `searchArchiveItems`) and
OQL. The `researchSource` entity is declared `.controllerOrScoped()` with a
family-membership row-visibility rule: the platform controller reads all rows,
while a signed-in caller reads only the sources whose `familyId` is a family
they are an approved member or active Steward of. A caller therefore can never
read another family's sources through OQL, matching the family-scoped source
reads (`listSourcesForFamily`, `getSourceForFamily`). The `conversation` entity
is declared `.controllerOrScoped()` with a
participant-only visibility rule: the platform controller reads all rows, while
a signed-in caller reads only the conversations they participate in. The
`message` entity is declared `.scopedPerUser()` with a participant-only
visibility rule, so a signed-in caller reads only the messages in conversations
they participate in and the platform controller/agent is blind to message
content. This preserves private-messaging privacy — no user can read another
user's private conversations or messages through OQL, and no private message
content is steward-readable unless reported.

The archive methods gate on sign-in and role, and every one of them is
family-scoped. `submitArchiveItemForFamily` requires a signed-in (non-anonymous)
caller and traps with `\"Unauthorized: You must be signed in\"` for an anonymous
caller. A signed-in caller who is not an approved member of the requested
`familyId` is denied with the stable, non-technical
`\"Family membership required. Claim your family profile and wait for Family
Steward approval before contributing family content.\"` — a distinguishable
outcome the frontend maps to a definitive family-membership-required message
(with the Add Myself / claim-profile action) instead of a generic retry. The
message carries no principal or account detail, and the caller is still denied.
It also validates the Oral History
speaker: it traps with `\"A primary speaker is required for Oral History
items\"` when `classification == #OralHistory` and `primarySpeaker` is `null`,
and with `\"A primary speaker is only allowed on Oral History items\"` when
`classification == #Standard` and `primarySpeaker` is not `null`. It also traps
with `\"Unauthorized: Related family members must belong to the same family\"`
when a `relatedMemberIds` entry does not belong to the requested `familyId`, so
Family A can never reference Family B people.
`listPendingArchiveItemsForFamily`,
`approveArchiveItemForFamily`, and `rejectArchiveItemForFamily` are active
Steward of `familyId` only and trap with
`\"Unauthorized: Only Family Stewards can perform this action\"` when the caller
is not an active Steward of that family (an ACTIVE persisted `StewardRecord`
whose `familyId` is the requested family). A Steward of one family cannot review
another family's items. The platform admin role does not grant these powers.
`listApprovedArchiveItemsForFamily`, `getArchiveItemForFamily`, and
`searchArchiveItemsForFamily` require an approved member or active Steward of
`familyId`, and enforce the archive privacy rules server-side: `#Public` items
are returned to everyone; `#FamilyOnly` items are returned only to approved
members of `familyId` (a caller holding at least one `#Approved` profile claim in
that family) or active Stewards of `familyId`; `#Private` items are returned only
to their contributor or an active Steward of `familyId`. Every returned record
must carry `ArchiveItem.familyId == familyId`, so an `archiveItemId` alone never
crosses the family boundary.

The single-family archive endpoints (`submitArchiveItem`,
`listPendingArchiveItems`, `approveArchiveItem`, `rejectArchiveItem`,
`listApprovedArchiveItems`) are TEMPORARY Tenancy 1C compatibility wrappers:
each delegates to its family-scoped counterpart with the default family id
(`\"norwood\"`), so current Norwood behavior is unchanged. They contain no
business logic of their own and will be removed once every caller passes an
explicit `familyId`.

The profile-claim and relationship-request methods gate on sign-in and role.
`requestProfileClaim`, `createMyself`, `proposeRelationship`, and
`updateOwnProfile` require a signed-in (non-anonymous) caller and return
`#err(#NotSignedIn)` for an anonymous caller (they do not trap). The Family
Steward review methods — `listProfileClaims`, `approveProfileClaim`,
`rejectProfileClaim`, `listRelationshipRequests`,
`approveRelationshipRequest`, `rejectRelationshipRequest`,
`setRelationshipRequestPending`, and `removeDuplicateProfile` — are Family
Steward only
and trap with `\"Unauthorized: Only Family Stewards can ...\"` when the caller
is not an active Family Steward (an ACTIVE persisted `StewardRecord`). `getPersonProfile`, `searchPossibleMatches`,
`getMyProfileClaim`, `getMyProfile`, `getMyRelationshipRequests`, and
`listNotifications` are readable by any caller (`getMyProfileClaim` returns only
the caller's own claim on the requested profile, `getMyProfile` returns only the
caller's own linked or pending profile, `getMyRelationshipRequests` returns only
the caller's own pending relationship requests, and `listNotifications` returns
only the caller's own records).

The notification methods are family-scoped and recipient-scoped. The canonical
reads — `listNotificationsForFamily`, `listUnreadNotificationsForFamily`,
`unreadNotificationCountForFamily`, and `getNotificationForFamily` — are
readable by any caller, including an anonymous one, but each returns only
records whose `familyId` equals the requested family AND whose `recipient` is
the caller, so an anonymous caller receives `[]`/`0`/`null` and never another
user's notifications. The canonical actions —
`markNotificationReadForFamily`, `markAllNotificationsReadForFamily`, and
`dismissNotificationForFamily` — likewise act only on the caller's own
notifications in the requested family; they do not trap for an anonymous caller,
they simply find no matching record and return `null`/`0`/`false`. The legacy
`listNotifications` and `markNotificationRead` are TEMPORARY Tenancy 1C
compatibility wrappers that delegate to the canonical methods with the default
family (`\"norwood\"`); they contain no logic of their own.

The Family Governance methods are steward-only. `listStewardsForFamily`,
`listStewards`, `promoteToStewardForFamily`, `promoteToSteward`, `removeSteward`,
`designateSuccessorForFamily`, `designateSuccessor`,
`activateSuccessorForFamily`, `activateSuccessor`,
`listSuccessorsForFamily`, `listSuccessors`, `getSingleStewardWarning`,
`listStewardIdentitiesForFamily`, `listStewardIdentities`,
`listEligibleStewardCandidates`, `listProfileRemovalRequests`,
`approveProfileRemoval`, `rejectProfileRemoval`, `archiveProfile`,
`restoreProfile`, `listArchivedProfiles`, `permanentlyDeleteProfile`,
`listDuplicateCandidates`, `notDuplicate`, `mergeProfiles`,
`resolveMergeConflict`, `listPersonRelationships`, `addRelationshipForFamily`,
`addRelationship`, `removeRelationship`, `correctRelationshipType`,
`listAuditHistoryForFamily`, and
`listAuditHistory` all trap
with `\"Unauthorized: Only Family Stewards can ...\"` when the caller is not an
active Family Steward (an ACTIVE persisted `StewardRecord`). The canonical
family-scoped forms (`promoteToStewardForFamily`, `designateSuccessorForFamily`,
`activateSuccessorForFamily`, `listSuccessorsForFamily`,
`listStewardIdentitiesForFamily`, `addRelationshipForFamily`,
`listAuditHistoryForFamily`) evaluate Steward
authority against the requested `familyId`, so a Steward of one family can never
promote, designate, activate, list, relate, or read the audit history of a
member of another family; the
legacy no-`familyId` forms are TEMPORARY Tenancy 1C
compatibility wrappers that delegate with the default family (`\"norwood\"`). The
platform admin role does not grant these powers. `getStewardAuditHistory` is
likewise Family Steward only: it traps with
`\"Unauthorized: You must be signed in\"` for an anonymous caller and
`\"Unauthorized: Only Family Stewards can view audit history\"` when the caller
is not an active Family Steward. `requestProfileRemoval` is the one governance
method a normal family
member calls: it requires a signed-in (non-anonymous) caller and returns
`#err(#NotSignedIn)` for an anonymous caller (it does not trap), and it only
ever requests removal of the caller's own claimed living profile.

The Family Steward authority methods are not gated to admin.
`isCallerSteward` and `hasActiveSteward` are readable by any caller (they return
`false` for an anonymous caller rather than trapping). `claimSteward` requires a
signed-in (non-anonymous) caller and returns `#err(#NotSignedIn)` for an
anonymous caller (it does not trap); it succeeds only while no active Steward
exists and permanently refuses afterward.

The Family Stories methods gate on sign-in and role, and every canonical Story
endpoint is family-scoped. The member methods — `listStoriesForFamily`,
`getStoryForFamily`, `listApprovedStoriesForFamily`, and
`submitStoryForFamily` (and their no-`familyId` TEMPORARY Tenancy 1C wrappers
`listApprovedStories` and `submitStory`) — resolve their membership gate through
the canonical family-scoped helper (`requireApprovedFamilyMemberForFamily`), so
they require a signed-in approved member or active Steward of the requested
`familyId`; they trap with `\"Unauthorized: You must be signed in\"` for an
anonymous caller and with the stable, non-technical `\"Family membership
required. Claim your family profile and wait for Family Steward approval before
contributing family content.\"` for a signed-in but unapproved caller. The
Steward methods — `listPendingStoriesForFamily`, `approveStoryForFamily`,
`rejectStoryForFamily`, `addCanonicalStoryForFamily`, and
`updateCanonicalStoryForFamily` (and their no-`familyId` wrappers
`listPendingStories`, `approveStory`, `rejectStory`, `addCanonicalStory`, and
`updateCanonicalStory`) — are active Steward of the requested family only and
trap with `\"Unauthorized: Only Family Stewards can perform this action\"` when
the caller is not an active Steward of that family (an ACTIVE persisted
`StewardRecord`). A Steward of one family can never review another family's
stories. Every returned or mutated story must carry `Story.familyId == familyId`,
so a `storyId` alone never crosses the family boundary.

The Family Mysteries methods gate on sign-in and role. Every canonical
family-scoped Mystery endpoint resolves its membership gate through the same
canonical family-scoped helper (`requireApprovedFamilyMemberForFamily`), so
`listMysteriesForFamily`, `getMysteryForFamily`,
`listMysteryContributionsForFamily`, `submitMysteryContributionForFamily`, and
`listTimelineEventsForFamily` require a signed-in approved member or Steward of
the requested family; an anonymous caller is rejected with a trap carrying
`\"Unauthorized: You must be signed in\"`, and a signed-in but unapproved caller
is rejected with the stable, non-technical family-membership-required message.
The Steward methods — `listPendingMysteryContributionsForFamily`,
`reviewMysteryContributionForFamily`, `createCanonicalMysteryForFamily`,
`updateCanonicalMysteryForFamily`, and `markMysteryResolvedForFamily` — are
active Steward of the requested family only and trap with
`\"Unauthorized: Only Family Stewards can perform this action\"` when the caller
is not an active Steward of that family (an ACTIVE persisted `StewardRecord`). A
Steward of one family can never review another family's mysteries. Every
returned or mutated mystery and contribution must carry `familyId == familyId`,
so a `mysteryId` or `contributionId` alone never crosses the family boundary.
The TEMPORARY Tenancy 1C wrappers `listMysteries` and `listTimelineEvents`
preserve their pre-tenancy behavior exactly: they were ungated public queries
and remain ungated, delegating to the canonical family-scoped logic with the
default family id (`\"norwood\"`).

The Family Recipes methods gate on sign-in and role. Every canonical
family-scoped recipe endpoint and every TEMPORARY Tenancy 1C wrapper resolves its
membership gate through the same canonical family-scoped helper
(`requireApprovedFamilyMemberForFamily`), so `submitRecipeForFamily`,
`listRecipesForFamily`, `listApprovedRecipesForFamily`, `getRecipeForFamily`, and
`listRecipesForPersonForFamily` (and their no-`familyId` wrappers) require a
signed-in approved member or Steward of the requested family; they trap with
`\"Unauthorized: You must be signed in\"` for an anonymous caller and with the
stable, non-technical `\"Family membership required. Claim your family profile and
wait for Family Steward approval before contributing family content.\"` for a
signed-in but unapproved caller. The Steward methods —
`listPendingRecipesForFamily`, `approveRecipeForFamily`, `rejectRecipeForFamily`,
and `publishRecipeForFamily` (and their no-`familyId` wrappers) — are active
Steward of the requested family only and trap with `\"Unauthorized: Only Family
Stewards can perform this action\"` when the caller is not an active Steward of
that family (an ACTIVE persisted `StewardRecord`). A Steward of one family can
never review another family's recipes.

The Family Message Board methods gate on sign-in and approved-membership. Every
canonical family-scoped board endpoint and every TEMPORARY Tenancy 1C wrapper
resolves its membership gate through the same canonical family-scoped helper
(`requireApprovedFamilyMemberForFamily`), so the member methods —
`listBoardPostsForFamily`, `getBoardPostForFamily`, `createBoardPostForFamily`,
`updateBoardPostForFamily`, `searchBoardPostsByTagsForFamily`,
`archiveBoardPostForFamily`, `listBoardRepliesForFamily`, and
`addBoardReplyForFamily` (and their no-`familyId` wrappers) —
require a signed-in approved family member and trap with `\"Unauthorized: You
must be signed in\"` for an anonymous caller and with the stable, non-technical
`\"Family membership required. Claim your family profile and wait for Family
Steward approval before contributing family content.\"` when the caller is a
signed-in but unapproved member of the requested `familyId`. `updateBoardPost`
additionally requires the caller to be the
post author (trapping with `\"Unauthorized: Only the post author can edit this
post\"`), and `archiveBoardPost` requires the author or a Family Steward
(trapping with `\"Unauthorized: Only the post author or a Family Steward can
archive this post\"`). The steward methods — `listHiddenBoardPosts`,
`restoreBoardPost` and
`removeBoardReply` — are Family Steward only and trap with `\"Unauthorized: Only
Family
Stewards can perform this action\"` when the caller is not an active Family
Steward (an ACTIVE persisted `StewardRecord`). Board
governance actions (`archiveBoardPost`, `restoreBoardPost`, `removeBoardReply`)
record audit entries in the steward-only audit log.

The Private Messaging methods gate on sign-in and approved-membership. Every
canonical family-scoped endpoint and every TEMPORARY Tenancy 1C wrapper resolves
its membership gate through the same canonical family-scoped helper
(`requireApprovedFamilyMemberForFamily`), so the member methods —
`listConversationsForFamily`, `getConversationForFamily`,
`listMessagesForFamily`, `createConversationForFamily`, `sendMessageForFamily`,
`markConversationReadForFamily`, `blockUserForFamily`, `unblockUserForFamily`,
`listBlockedUsersForFamily`, and `reportMessageForFamily` (and their
no-`familyId` wrappers) — trap with `\"Unauthorized: You must be signed in\"` for
an anonymous caller and with the stable, non-technical `\"Family membership
required. Claim your family profile and wait for Family Steward approval before
contributing family content.\"` when the caller is a signed-in but unapproved
member of the requested `familyId`. The denial message carries no family id or
principal. The two messageability reads are the exception: an anonymous caller
resolves `false` from `canMessagePersonForFamily` / `canMessagePerson` and `[]`
from `listMessageableMembersForFamily` / `listMessageableMembers` rather than
trapping; a signed-in but unapproved caller still traps with the stable
family-membership message. `getConversationForFamily` returns `null` (it does not
trap) when the caller is not a participant, and `markConversationReadForFamily`
traps with `\"Conversation not found\"` when the conversation does not belong to
`familyId` and `\"Unauthorized: Only participants can mark a conversation read\"`
when the caller is not a participant. `reportMessageForFamily` traps with
`\"Message not found\"` when the message does not belong to `familyId`,
`\"Conversation not found\"` when its conversation does not belong to `familyId`,
and `\"Unauthorized: Only conversation participants can report a message\"` when
the caller is not a participant of the message's conversation. The steward
methods — `listReportsForFamily`, `reviewReportForFamily`, and
`getReportedMessageForFamily` (and their no-`familyId` wrappers) — are active
Steward of `familyId` only and trap with `\"Unauthorized: You must be signed in\"`
for an anonymous caller and `\"Unauthorized: Only Family Stewards can perform
this action\"` when the caller is not an active Family Steward (an ACTIVE
persisted `StewardRecord`) of the requested `familyId`. A Steward of one family
can never moderate another family's reports or messages. Stewards cannot browse
arbitrary private conversations; they see reported message content only when a
report is filed (via `getReportedMessageForFamily`).

The Pending Contributions methods are family-scoped and Steward-only.
`getPendingContributionsCountForFamily` requires an active Steward of the
requested `familyId` and traps with `\"Unauthorized: You must be signed in\"` for
an anonymous caller and `\"Unauthorized: Only Family Stewards can perform this
action\"` when the caller is not an active Steward of that family.
`getPendingContributionsCount` is the TEMPORARY Tenancy 1C compatibility wrapper
delegating with the default family id (`\"norwood\"`); it traps with
`\"Unauthorized: You must be signed in\"` for an anonymous caller and
`\"Unauthorized: Only Family Stewards can view the pending contributions count\"`
when the caller is not an active Family Steward (an ACTIVE persisted
`StewardRecord`).

The Historical Research Intake methods gate on sign-in and role. The creation
methods — `createSource`, `createFindingForFamily`, `createNewPersonCandidate`,
and `createRelationshipProposal` — require an approved family member (a caller
holding at least one `#Approved` profile claim, or a Family Steward) and
return `#err(#notAuthorized)` for an anonymous or signed-in but unapproved
caller (they do not trap). The
Family Steward review methods — `listSourcesForFamily`,
`listFindingsForFamily`, `getFindingForFamily`, `approveFindingForFamily`,
`rejectFindingForFamily`, `needsResearchFindingForFamily`,
`listNewPersonCandidates`, `listRelationshipProposals`,
`listConflictReviewItems`, `resolveConflict`, `approveSourceForFamily`,
`rejectSourceForFamily`, `needsResearchSourceForFamily`,
`approveNewPersonCandidate`, `rejectNewPersonCandidate`,
`needsResearchNewPersonCandidate`, `approveRelationshipProposal`,
`rejectRelationshipProposal`, and `needsResearchRelationshipProposal` —
are Family Steward only and trap with `\"Unauthorized: You must be
signed in\"` for an anonymous caller and `\"Unauthorized: Only Family Stewards
can perform this action\"` when the caller is not an active Family Steward (an
ACTIVE persisted `StewardRecord`). A Steward of one family can never review
another family's finding: the family-scoped finding review methods evaluate
Steward authority against the requested `familyId`, and every returned or
mutated finding must carry `ProposedFinding.familyId == familyId`. The
family-scoped source reads
`listSourcesForFamily` and `getSourceForFamily` require an approved member or
active Steward of the requested `familyId` and trap with the stable
family-membership message for a signed-in but unapproved caller. The read methods
`getSource` and `getFinding` are readable by any caller (they are not gated to
admin). `listConflictsForPerson` and `listDisputedFactsForPerson` require a
signed-in (non-anonymous) caller and
return `[]` for an anonymous caller (they do not trap); they return only the
unresolved conflicts / disputed facts for the requested Person. The review surface methods
`getReviewQueueForFamily` and `getResearchAuditLogForFamily`
are Family Steward only — they expose contributor principals, proposed findings
content, and provenance, so they trap with `\"Unauthorized: You must be signed
in\"` for an anonymous caller and `\"Unauthorized: Only Family Stewards can
perform this action\"` when the caller is not an active Family Steward (an
ACTIVE persisted `StewardRecord`) of the requested family. The research audit
read is family-scoped: only entries whose `familyId` equals the requested
`familyId` are returned, so Family A audit activity is never exposed through
Family B. The research-intake OQL
entities (`proposedFinding`, `newPersonCandidate`,
`relationshipProposal`, `conflictReviewItem`, `researchAuditLog`) are all
declared `.controllerOnly()`, so only the platform controller can read their
rows through `schema()`/`execute()`; end users do not read them directly. The
`researchSource` entity is `.controllerOrScoped()` with a family-membership
row-visibility rule, so a signed-in caller reads only the sources of a family
they are an approved member or active Steward of and can never read another
family's sources through OQL. This
keeps the research intake data private to the platform while still letting the
Data Intelligence agent answer over it.

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
- `ArchiveItem` fields: `id` (`ArchiveItemId`), `title` (`Text`), `description`
  (`Text`), `itemType`, `blob` (the external storage reference), `mimeType`
  (`?Text`, the persisted validated MIME type, `null` for records created before
  the field existed), `filename` (`?Text`, the persisted sanitized filename,
  `null` for records created before the field existed), `era` (`Text`), `year`
  (`?Nat`), `tags` (`[Text]`), `contributor` (`Principal`), `relatedMemberIds`
  (`[Text]`), `relatedBranchId` (`?Text`), `sourceStatus`, `privacyLevel`,
  `status`, `createdAt` (`Int`), `classification`, `primarySpeaker`
  (`?OralHistorySpeaker`), and the reserved future-ready fields `transcript`,
  `searchableTranscript`, `chapterMarkers`, `aiSummary`, and `extractedNames`
  (all `null` and not populated by any logic yet).
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
  `#BoardReply`, `#BoardMention`, `#NewMessage`, `#ResearchSubmission`,
  `#ResearchApproved`, `#ResearchRejected`, `#ArchiveApproved`, or
  `#ArchiveRejected`.
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
- `Notification` fields: `familyId` (`Text`, the family whose activity produced
  the notification), `id` (`Nat`), `recipient` (`Principal`), `notificationType`,
  `message` (`Text`), `createdAt` (`Int`), and `read` (`Bool`). A notification is
  only ever read, counted, or mutated within its own `familyId`.
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
  `assignedBy` (`Principal`, the promoting steward), `assignedAt` (`Int`,
  nanoseconds since epoch), and `founding` (`Bool`, `true` only for a record
  created by the founding-Steward onboarding flow; a role-context marker that
  never changes authority). A caller is a Family Steward only when they match a
  `StewardRecord` with `roleStatus == #Active`; the platform admin role is never
  consulted.
- `StewardClaimResult` fields: `stewardAccountId` (`Principal`, the account that
  claimed the Family Steward role), `claimedBy` (`Principal`, the account that
  performed the claim — the same as `stewardAccountId`), and `claimedAt` (`Int`,
  nanoseconds since epoch).
- `StewardClaimError` is a variant: `#NotSignedIn` (the caller is anonymous),
  `#StewardAlreadyExists` (an active Family Steward already exists, so the
  one-time claim is permanently closed), or `#AlreadySteward` (the caller already
  holds an active Family Steward record).
- `SuccessorDesignation` fields: `familyId` (`Text`, the family the designation
  belongs to — the same `personId` may hold independent designations in different
  families), `personId` (`Text`), `priority` (`Nat`, the
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
- `StewardAuditKind` is a variant: `#Governance` or `#ConflictResolution`.
- `StewardAuditEntry` fields: `id` (`Nat`), `kind` (`StewardAuditKind`),
  `actionType` (`Text`, the governance action tag text for `#Governance`
  entries, or `\"ConflictResolved\"` for `#ConflictResolution` entries),
  `actorAccountId` (`Principal`, the acting steward's account — the governance
  `actorAccountId` or the research audit `actorId`), `timestamp` (`Int`,
  nanoseconds since epoch), `summary` (`Text`), `affectedPersonIds` (`[Text]`,
  the affected person ids; for a conflict entry this is the single affected
  person when known, else empty), and the conflict-specific optionals
  `personId` (`?Text`), `field` (`?Text`), `existingValue` (`?Text`, the
  canonical value being contradicted), `proposedValue` (`?Text`),
  `resolution` (`?Text`, the resolution action text — `KeepExisting`,
  `ReplaceExisting`, `PreserveBoth`, or `NeedsResearch`), `stewardNotes`
  (`?Text`), `existingSourceId` (`?Nat`), and `proposedSourceId` (`?Nat`).
  Fields not applicable to a given `kind` are `null`/empty.
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
- `Story` fields: `familyId` (`FamilyId`, the owning family — the tenant
  boundary; a story is only ever read, reviewed, or mutated through its own
  family, and records created before this field existed are migrated to the
  default family id `\"norwood\"`), `id` (`Nat`), `title` (`Text`), `storyText`
  (`Text`),
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
- `Mystery` fields: `familyId` (`FamilyId`, the owning family — the tenant
  boundary; pre-tenancy records migrate to the default family id `\"norwood\"`),
  `id` (`Nat`), `title` (`Text`), `description` (`Text`),
  `relatedMemberIds` (`[Text]`), `relatedBranchId` (`?Text`), `knownFacts`
  (`[Text]`), `possibilities` (`[Text]`, competing theories/possibilities kept
  separate from known facts), `relatedSourceIds` (`[Nat]`),
  `relatedArchiveItemIds` (`[Nat]`), `status`, `contributor` (`Principal`),
  `createdAt` (`Int`), `updatedAt` (`Int`), and `resolution` (`?Resolution`,
  `null` until resolved).
- `MysteryContribution` fields: `familyId` (`FamilyId`, the owning family — the
  tenant boundary; pre-tenancy records migrate to the default family id
  `\"norwood\"`), `id` (`Nat`), `mysteryId` (`Nat`),
  `contributionType`, `text` (`Text`), `contributor` (`Principal`), `status`,
  `createdAt` (`Int`), `reviewedBy` (`?Principal`, `null` when unreviewed), and
  `reviewedAt` (`?Int`, `null` when unreviewed).
- `RecipeId` is a `Nat`, unique across the whole recipe collection.
- `RecipeStatus` is a variant: `#Pending`, `#Approved`, `#Rejected`, or
  `#Archived`.
- `Recipe` fields: `familyId` (`FamilyId`, the owning family — the tenant
  boundary), `recipeId` (`Nat`), `title` (`Text`), `shortDescription`
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
  Archive/media records), `tags` (`[Text]`, free-form labels stored on the
  canonical post — never duplicated from Archive tags or media records),
  `createdAt` (`Int`, nanoseconds since epoch),
  `updatedAt` (`Int`), `status`, and `privacyScope`.
- `Reply` fields: `replyId` (`Nat`), `postId` (`Nat`), `authorAccountId`
  (`Principal`), `authorPersonId` (`Text`), `body` (`Text`), and `createdAt`
  (`Int`, nanoseconds since epoch).
- `BoardError` is a variant: `#NotSignedIn`, `#NotApprovedMember`,
  `#PostNotFound`, `#NotAuthor`, or `#NotSteward`.
- `ConversationId`, `MessageId`, and `ReportId` are `Nat`, unique across their
  respective collections.
- `Conversation` fields: `familyId` (`Text`, the tenant boundary — every
  family-scoped read and action requires it to equal the requested `familyId`;
  records created before this field existed are migrated to the default family
  id `\"norwood\"`), `conversationId` (`Nat`), `participantAccountIds`
  (`[Principal]`, exactly two for a 1:1 conversation), `participantPersonIds`
  (`[Text]`, the canonical Person ids of the two participants), `createdAt`
  (`Int`), and `updatedAt` (`Int`).
- `MessageStatus` is a variant: `#Sent` or `#Blocked` (a send attempt prevented
  because the recipient blocked the sender).
- `Message` fields: `familyId` (`Text`, the tenant boundary — always the
  `familyId` of its conversation), `messageId` (`Nat`), `conversationId` (`Nat`),
  `senderAccountId` (`Principal`), `senderPersonId` (`Text`), `body` (`Text`),
  `createdAt` (`Int`), `readAt` (`?Int`, `null` until read), and `status`.
- `Block` fields: `familyId` (`Text`, the tenant boundary), `blockerAccountId`
  (`Principal`), `blockedAccountId`
  (`Principal`), and `createdAt` (`Int`).
- `ReportStatus` is a variant: `#Pending`, `#Reviewed`, or `#Dismissed`.
- `Report` fields: `familyId` (`Text`, the tenant boundary), `reportId` (`Nat`),
  `reportingAccountId` (`Principal`),
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
- `SourceId` and `FindingId` are `Nat`, unique across their respective
  collections.
- `SourceType` is a variant: `#CensusCitation`, `#DeedPropertyReference`,
  `#EmailThread`, `#ResearchNotes`, `#CertificateHeadstoneReference`, or
  `#UploadedDocumentImage`.
- `EvidenceLabel` is a variant: `#Documented`, `#FamilyHistoryOralHistory`,
  `#PersonalMemory`, `#Hypothesis`, `#Conflicting`, or `#NeedsResearch`. Exactly
  one label is assigned per finding.
- `ReviewStatus` is a variant: `#Pending`, `#Approved`, `#Rejected`,
  `#Conflicting`, or `#NeedsResearch`. Everything enters as `#Pending` and is
  only ever promoted by an explicit steward action.
- `FindingType` is a variant: `#PersonFact`, `#Relationship`, `#TimelineEvent`,
  `#Story`, `#Mystery`, or `#Source`. It determines where an approved finding
  routes.
- `SourceRecord` fields: `familyId` (`Text`, the tenant boundary — every
  family-scoped read and review requires it to equal the requested `familyId`;
  records created before this field existed are migrated to the default family
  id `\"norwood\"`), `id` (`SourceId`), `title` (`Text`), `sourceType`,
  `description` (`Text`), `archiveItemId` (`?Nat`, `null` when the source links
  to no Archive item — a source may optionally link to an Archive item without
  requiring one), `contributor` (`Principal`), `status` (`ReviewStatus`),
  `createdAt` (`Int`, nanoseconds since epoch), and `updatedAt` (`Int`).
- `FindingContent` is a variant carrying the content of a proposed finding keyed
  by where it routes on approval: `#PersonFact` (`personId`, `field`, `value`),
  `#Relationship` (`fromPersonId`, `toPersonId`, `relationshipType`),
  `#TimelineEvent` (`personId`, `title`, `date` (`?Text`), `description`),
  `#Story` (`title`, `storyText`, `relatedPersonIds`), `#Mystery` (`title`,
  `description`, `relatedPersonIds`), or `#Source` (`title`, `sourceType`,
  `description`, `archiveItemId`).
- `ProposedFinding` fields: `id` (`FindingId`), `title` (`Text`),
  `evidenceLabel`, `findingType`, `content` (`FindingContent`), `sourceId`
  (`SourceId`, the required source link), `personId` (`?Text`, the matched
  canonical Person, `null` when none), `newPersonCandidateId` (`?Nat`, the New
  Person Candidate, `null` when none), `status` (`ReviewStatus`),
  `conflictReviewId` (`?Nat`, `null` until the finding is routed to a Conflict
  Review item), `submittedBy` (`Principal`), `submittedAt` (`Int`), `reviewedBy`
  (`?Principal`, `null` when unreviewed), `reviewedAt` (`?Int`, `null` when
  unreviewed), and `updatedAt` (`Int`).
- `NewPersonCandidate` fields: `familyId` (`Text`, the tenant boundary — every
  family-scoped read and review requires it to equal the requested `familyId`;
  records created before this field existed are migrated to the default family
  id `\"norwood\"`), `id` (`Nat`), `name` (`Text`), `details` (`Text`),
  `sourceId` (`SourceId`), `status` (`ReviewStatus`), `submittedBy`
  (`Principal`), `submittedAt` (`Int`), `reviewedBy` (`?Principal`), and
  `reviewedAt` (`?Int`). Approved candidates become canonical Person records in
  the candidate's own `familyId`.
- `RelationshipProposal` fields: `id` (`Nat`), `fromPersonId` (`Text`),
  `toPersonId` (`Text`), `relationshipType` (`Text`), `sourceId` (`SourceId`),
  `status` (`ReviewStatus`), `submittedBy` (`Principal`), `submittedAt` (`Int`),
  `reviewedBy` (`?Principal`), and `reviewedAt` (`?Int`). Approved proposals route
  to the family graph.
- `ConflictReviewItem` fields: `id` (`Nat`), `findingId` (`FindingId`),
  `personId` (`?Text`, the affected canonical Person, `null` when the finding
  targets no Person), `field` (`Text`), `canonicalValue` (`Text`),
  `proposedValue` (`Text`), `existingSourceId` (`?Nat`, the source of the
  existing canonical value when known, `null` otherwise), `proposedSourceId`
  (`?Nat`, the source of the proposed finding), `evidenceLabel`
  (`EvidenceLabel`, the proposed finding's evidence label), `stewardNotes`
  (`Text`, free-text notes recorded by the steward during resolution), `status`
  (`ReviewStatus`), `resolvedBy` (`?Principal`), and `resolvedAt` (`?Int`). A
  conflict item is created as `#Conflicting` (unresolved) instead of silently
  overwriting conflicting data; canonical data is never altered at creation.
- `ConflictResolutionAction` is a variant: `#KeepExisting`, `#ReplaceExisting`,
  `#PreserveBoth`, or `#NeedsResearch` — the explicit decision a Family Steward
  makes when resolving a conflict review item.
- `DisputedFact` fields: `field` (`Text`, the disputed fact/field name),
  `canonicalValue` (`Text`, the existing canonical value — blank when no
  canonical value exists yet and only a proposed value is present),
  `proposedValue` (`Text`), and `status` (`ReviewStatus`, `#Conflicting` or
  `#NeedsResearch` — both unresolved). Exposed by `listDisputedFactsForPerson`
  so the Person Profile can show a subtle disputed indicator on each disputed
  fact; resolved conflicts are never included.
- `ResearchAuditEntry` fields: `familyId` (`Text`, the tenant boundary — the
  family the audited action was performed in; entries created before this field
  existed are migrated to the default family id `\"norwood\"`), `id` (`Nat`),
  `action` (`Text`, the audit action
  tag, e.g. `\"SourceCreated\"`/`\"FindingSubmitted\"`/`\"FindingApproved\"`/`\"FindingRoutedToConflict\"`/`\"ConflictResolved\"`),
  `findingId` (`?FindingId`, `null` when not tied to a finding), `sourceId`
  (`?SourceId`, `null` when not tied to a source), `actorId` (`Principal`),
  `timestamp` (`Int`, nanoseconds since epoch), and `summary` (`Text`).
- `ReviewQueue` fields: `pending` (`Nat`), `approved` (`Nat`), `rejected`
  (`Nat`), `conflicting` (`Nat`), `needsResearch` (`Nat`), and `items`
  (`[ReviewQueueItem]`) — the aggregated review queue badge counts plus the full
  list of reviewable items. `pending` counts every item still awaiting steward
  review (including pending Sources); `needsResearch` counts items marked
  `#NeedsResearch`.
- `ReviewQueueItem` fields: `id` (`Nat`), `kind` (`ReviewItemKind`: `#Source`,
  `#Finding`, `#NewPersonCandidate`, `#RelationshipProposal`, or
  `#ConflictReview`), `title` (`Text`), `summary` (`Text`), `contributor`
  (`?Principal`, `null` when the item has no single contributor), `provenance`
  (`Text`), `createdAt` (`Int`, nanoseconds since epoch), `evidenceLabel`
  (`?EvidenceLabel`, `null` when not applicable), `status` (`ReviewStatus`), and
  `actions` (`[ReviewAction]`: `#Approve`, `#Reject`, and/or `#NeedsResearch`).
- `BoardMediaUpload` fields: `title` (`Text`), `description` (`Text`),
  `itemType` (`ArchiveItemType`), `mimeType` (`Text`, the caller-declared MIME
  type validated against the board attachment allowlist — images, videos, and
  documents: `application/pdf`, `text/plain`, `text/csv`,
  `application/msword`,
  `application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
  `application/vnd.ms-excel`, and
  `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`),
  `filename` (`Text`,
  the caller-supplied filename, sanitized before it is persisted on the created
  Archive item), `blob` (the external storage reference), `era` (`Text`), `year`
  (`?Nat`), `tags` (`[Text]`), `relatedMemberIds` (`[Text]`), `relatedBranchId`
  (`?Text`), `sourceStatus`, `privacyLevel`, `classification`, and
  `primarySpeaker` (`?OralHistorySpeaker`).
- `SourceUploadResult` fields: `source` (`SourceRecord`) and `archiveItem`
  (`ArchiveItem`) — the created Source record plus the canonical Archive item it
  links to.
- `ResearchError` is a variant: `#notAuthorized`, `#notFound : Nat`, or
  `#invalidState : Text`.

## Lifecycle and polling

Photo uploads are synchronous: `addPhoto` returns the stored photo once the
metadata is persisted. There is no async job to poll. The frontend can call
`listPhotos` or `getProfilePhoto` after an upload to confirm the result. The
first photo uploaded to a person's gallery is automatically selected as the
profile photo; a later photo becomes the profile photo only when the caller
explicitly calls `setProfilePhoto`.

Archive items follow a submit → approve/reject lifecycle, scoped to a family.
`submitArchiveItemForFamily` stores the item in `#Pending` state with
`familyId` set to the requested family. A Steward of that family then calls
`approveArchiveItemForFamily` or
`rejectArchiveItemForFamily` to move it to `#Approved` or `#Rejected`. Only
`#Approved` items are returned by `listApprovedArchiveItemsForFamily` (the
archive view). There is no
async job to poll; the frontend can call `listPendingArchiveItemsForFamily`
(steward) or `listApprovedArchiveItemsForFamily` to observe the current state.
Each successful
transition out of `#Pending` records exactly one `#ArchiveApproved` /
`#ArchiveRejected` notification to the item's contributor, readable via
`listNotificationsForFamily(familyId)` (or the TEMPORARY `listNotifications`
wrapper for the default family); a repeated approve/reject call on an
already-reviewed item
returns `null` and creates no duplicate notification. An Oral History item
(`classification == #OralHistory`) must carry exactly one primary speaker at
submission time; the speaker is fixed at submission and does not change through
the approval lifecycle. The single-family endpoints (`submitArchiveItem`,
`listPendingArchiveItems`, `approveArchiveItem`, `rejectArchiveItem`,
`listApprovedArchiveItems`) are TEMPORARY Tenancy 1C compatibility wrappers that
delegate with the default family id (`\"norwood\"`).

Profile claims follow a request → approve/reject lifecycle. `requestProfileClaim`
creates a `#Pending` claim without granting ownership. A Family Steward then
calls `approveProfileClaim` (marking the profile `#Claimed` and associating it
with the requesting user) or `rejectProfileClaim`. An approved claim unlocks
owner editing via `updateOwnProfile`; a Family Steward may also edit an
unclaimed/historical profile via `updateOwnProfile` (but never a profile claimed
by another user). A deceased profile can never be claimed
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

When a claim is approved, the pending `#ProfileClaimRequested` notification
(\"Your profile claim ... is pending review\") is reconciled so it no longer
remains actionable/current: `reconcileClaimNotificationsForFamily(familyId,
claimId)` (or its default-family wrapper `reconcileClaimNotifications(claimId)`)
marks it read/resolved, while the `#ProfileClaimReviewed` notification already
reflects the final approved state. The profile status stays `#Claimed` and no new
claim is created. Historical notification history may remain, but it clearly
shows the final resolved state and no longer implies the claim is pending.

Relationship requests follow a propose → approve/reject lifecycle.
`proposeRelationship` creates a `#Pending` request that is never treated as
confirmed. A Family Steward calls `approveRelationshipRequest` (adding the
relationship as `#Confirmed` to the shared family graph),
`rejectRelationshipRequest`, or `setRelationshipRequestPending` (returning it to
`#Pending`). Because all family views read the shared graph, an approved
relationship automatically appears in Explore Family, Family Tree, Heritage, and
profiles without a manual insertion step. There is no async job to poll; the
frontend can call `listProfileClaims` / `listRelationshipRequests` (steward) or
`listNotificationsForFamily(familyId)` (or the TEMPORARY `listNotifications`
wrapper for the default family) to observe current state. A regular signed-in
caller can
observe their own pending relationship state at any time via
`getMyRelationshipRequests` (returns only the caller's own pending requests)
without needing Family Steward privileges.

Family Steward authority is bootstrapped once and then permanent. While no
active Steward exists, `hasActiveSteward` returns `false` and any signed-in
account may call `claimSteward` to become the first active Steward; the claim
creates an ACTIVE `StewardRecord` and records the assignment in the audit log.
Once any active Steward exists, `hasActiveSteward` returns `true` and
`claimSteward` permanently refuses (`#err(#StewardAlreadyExists)` for a
non-steward caller, `#err(#AlreadySteward)` for an existing active steward).
`isCallerSteward` reflects the caller's current authority at any time. There is
no async job to poll; the frontend can call `hasActiveSteward` to decide whether
to show the one-time \"Claim Family Steward\" control and `isCallerSteward` to
gate Steward-only surfaces.

Governance actions follow steward-driven lifecycles. Steward succession:
`promoteToSteward` makes an approved claimed member an active steward directly;
`designateSuccessor` records a successor as a `#Designated` designation only,
and `activateSuccessor` promotes a designated successor into the active steward
role (marking the designation `#Activated`). The canonical family-scoped forms
`designateSuccessorForFamily` and `activateSuccessorForFamily` stamp and match
the designation's `familyId`, so a designation from one family can never
activate a Steward in another. A successor is never an active
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

The merged Family Steward Audit History (`getStewardAuditHistory`) is a
computed, read-only view derived on demand from the governance audit log and
the research audit log. It is not a separate persisted store — it merges every
governance `AuditEntry` with every research `ConflictResolved` entry (enriched
from the linked Conflict Review item) and returns them newest first. Because it
is computed, it always reflects the current audit records with no polling or
refresh step beyond calling it again; resolving a conflict via `resolveConflict`
immediately makes the corresponding `#ConflictResolution` entry appear in the
next call. The existing `listAuditHistory` (governance-only) is unchanged and
remains available.

Family Stories follow a submit → approve/reject lifecycle, scoped to a family.
`submitStoryForFamily` stores the story in `#Pending` state with `familyId` set
to the requested family. A Steward of that family then calls
`approveStoryForFamily` or `rejectStoryForFamily` to move it to `#Approved` or
`#Rejected`. Only `#Approved` stories are returned by
`listApprovedStoriesForFamily` (the Family Stories view). Stewards add canonical
stories directly via `addCanonicalStoryForFamily` (already `#Approved`) and edit
them via `updateCanonicalStoryForFamily`. There is no async job to poll; the
frontend can call `listPendingStoriesForFamily` (steward) or
`listApprovedStoriesForFamily` to observe the current state. The legacy
no-`familyId` wrappers (`submitStory`, `approveStory`, `rejectStory`,
`addCanonicalStory`, `updateCanonicalStory`, `listPendingStories`,
`listApprovedStories`) behave identically for the default Norwood family.

Family Mysteries follow a steward-driven lifecycle, scoped to a family. Stewards
create canonical mysteries via `createCanonicalMysteryForFamily` and edit them
via `updateCanonicalMysteryForFamily`. Family members contribute a note, memory,
possible lead, or source reference via `submitMysteryContributionForFamily`,
which stores the contribution in `#Pending` state with `familyId` set to the
requested family; a Steward of that family then calls
`reviewMysteryContributionForFamily` to approve or reject it before it alters the
canonical mystery record. A mystery's `status` moves through `#Open`,
`#Researching`, `#PartiallyResolved`, and `#Resolved`. Marking a mystery
`#Resolved` via `markMysteryResolvedForFamily` records a resolution summary and
supporting evidence while preserving the prior theories/history — the research
trail is never deleted. There is no async job to poll; the frontend can call
`listMysteriesForFamily` (members) or
`listPendingMysteryContributionsForFamily` (steward) to observe the current
state. The legacy no-`familyId` wrappers (`createCanonicalMystery`,
`updateCanonicalMystery`, `submitMysteryContribution`,
`reviewMysteryContribution`, `markMysteryResolved`, `listMysteries`,
`listPendingMysteryContributions`) behave identically for the default Norwood
family.

Family Recipes follow a submit → approve/reject lifecycle, scoped to a family.
`submitRecipeForFamily` stores the recipe in `#Pending` state in the requested
family. A Steward of that family then calls `approveRecipeForFamily` or
`rejectRecipeForFamily` to move it to `#Approved` or `#Rejected`. Only
`#Approved` recipes are returned by `listApprovedRecipesForFamily` (the Family
Recipes view) and by `listRecipesForPersonForFamily` (the per-person view).
Stewards publish canonical recipes directly via `publishRecipeForFamily` (already
`#Approved`). Approval transitions the same canonical Recipe record — it never
creates a second Recipe. There is no async job to poll; the frontend can call
`listPendingRecipesForFamily` (steward), `listApprovedRecipesForFamily`,
`getRecipeForFamily`, or `listRecipesForPersonForFamily` to observe the current
state. The legacy no-`familyId` wrappers behave identically for the default
Norwood family.

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

The Pending Contributions count is derived on demand and family-scoped.
`getPendingContributionsCountForFamily`
counts all current pending review items (pending archive/media, pending recipes,
pending stories, and pending mystery contributions) in the requested `familyId`
from canonical pending data.
Research Intake review items (Sources, Proposed Findings, New Person Candidates,
Relationship Proposals, and Conflict Review items) are deliberately excluded —
they resolve exclusively through the Research Review Queue (`getReviewQueue`),
so they never inflate the Pending Contributions badge. A pending Archive item
whose id is referenced by a Research Source's `archiveItemId` is excluded as
well, because it is reviewed through that same queue rather than in Pending
Contributions; the count therefore always agrees with the Pending Contributions
list (`listPendingArchiveItemsForFamily`).
It increments when a new pending item is submitted and decrements when an item is
approved or rejected, automatically — there is no separate counter to maintain.
The frontend calls it to render the Steward-facing Pending Contributions badge
and hides the badge when the count is `0`. The single-family
`getPendingContributionsCount` is a TEMPORARY Tenancy 1C compatibility wrapper
delegating with the default family id (`\"norwood\"`).

Historical Research Intake follows a submit → review lifecycle. A signed-in
caller creates a source (`createSource`) and then proposed findings
(`createFinding`), New Person candidates (`createNewPersonCandidate`), and
relationship proposals (`createRelationshipProposal`), each referencing a source
for provenance. Everything enters as `#Pending` and is never auto-approved. A
Family Steward then reviews each item: `approveSourceForFamily` approves a
pending source (transitioning it to `#Approved` so it becomes usable by Proposed
Findings, and cascading the same transition to its linked Archive item when one
exists in the same family), `rejectSourceForFamily` rejects it (transitioning to
`#Rejected`, and cascading to its linked Archive item when one exists in the same
family, without deleting the original Archive item), and
`needsResearchSourceForFamily` marks it as needing research
(transitioning to `#NeedsResearch` while preserving the source and its notes).
The single-family `approveSource`, `rejectSource`, and `needsResearchSource` are
TEMPORARY Tenancy 1C compatibility wrappers delegating with the default family id
(`\"norwood\"`).
`approveFinding` routes an approved finding to its target surface (Profile,
family graph, Timeline / Travel Through Time, Family Stories, Family Mysteries,
or Profile Sources / Archive), `rejectFinding` rejects it, and `resolveConflict`
applies the steward's explicit decision to a conflict review item: `#KeepExisting`
leaves canonical data unchanged and resolves the conflict, `#ReplaceExisting`
writes the proposed value into canonical data once, `#PreserveBoth` keeps both
values visible as an unresolved `#Conflicting` conflict, and `#NeedsResearch`
retains the conflict with `#NeedsResearch` status. A finding labelled
`#Conflicting` is
never approved directly — `approveFinding`
routes it to a Conflict Review item (marking the finding `#Conflicting` with a
`conflictReviewId`) instead of silently overwriting canonical data. New Person
candidates are reviewed via `approveNewPersonCandidate` (creates exactly one
canonical Person record preserving the candidate's Source/provenance and marks
the candidate `#Approved`), `rejectNewPersonCandidate` (marks `#Rejected` with no
Person created), and `needsResearchNewPersonCandidate` (marks `#NeedsResearch`
with no Person created). Approving a candidate never auto-creates relationships —
a relationship is only added when a separately approved Relationship Proposal
exists. Relationship proposals are reviewed via `approveRelationshipProposal`
(creates or updates the canonical relationship exactly once, updating the family
graph, and marks the proposal `#Approved`; duplicate canonical relationships are
prevented), `rejectRelationshipProposal` (marks `#Rejected` leaving the family
graph unchanged), and `needsResearchRelationshipProposal` (marks
`#NeedsResearch` leaving the canonical graph unchanged). Every
creation and review action records a `ResearchAuditEntry` in the research audit
log, written to the same family as the action and readable via
`getResearchAuditLogForFamily`. The review queue is
derived on demand via `getReviewQueue`, returning the pending/approved/rejected/
conflicting/needs-research counts plus the full list of reviewable items
(including pending Sources) with type, title/summary, contributor, provenance,
created date, evidence label, and available steward actions. There is
no async job to poll; the frontend can call the list methods (steward) or
`getReviewQueue`/`getResearchAuditLogForFamily` to observe the current state.

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
- `submitArchiveItemForFamily` is not idempotent: each call stores a new item
  with a fresh id. Retrying a submission that actually succeeded creates a
  duplicate item. For an Oral History item the `primarySpeaker` is validated at
  submission: it must be present (exactly one) when `classification ==
  #OralHistory` and must be `null` when `classification == #Standard`; a
  violation traps and stores nothing. A `relatedMemberIds` entry that does not
  belong to the requested `familyId` also traps and stores nothing.
- `approveArchiveItemForFamily` and `rejectArchiveItemForFamily` are idempotent:
  approving or rejecting an already-approved or already-rejected (or
  nonexistent, or other-family) item returns `null` and changes nothing. They
  only transition items currently in `#Pending` state that belong to the
  requested `familyId`. Neither is destructive — the item and its original file
  reference are preserved in either terminal state. Each successful transition
  records exactly one `#ArchiveApproved`/`#ArchiveRejected` notification to the
  item's contributor (never to any other user), and a repeated call on an
  already-reviewed item creates no duplicate notification.
- The single-family archive wrappers (`submitArchiveItem`, `approveArchiveItem`,
  `rejectArchiveItem`) have the same retry semantics as their family-scoped
  counterparts, applied to the default family (`\"norwood\"`).
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
  person. It only ever updates the caller's own living profile or, for a Family
  Steward, an unclaimed/historical profile, and never rewrites family
  relationships; any relationship addition or change must go through
  `proposeRelationship`.
- `markNotificationReadForFamily` is idempotent: marking an already-read
  notification read again returns the same notification and changes nothing. It
  returns `null` when no notification with that id belongs to the requested
  family and is addressed to the caller, so a retry that actually succeeded is
  safe and a foreign-family or foreign-recipient id is a no-op.
  `markAllNotificationsReadForFamily` is idempotent: a second call marks nothing
  and returns `0`. `dismissNotificationForFamily` is idempotent: dismissing an
  already-dismissed (or nonexistent, or other-family, or other-recipient)
  notification returns `false` and changes nothing. Dismissal is destructive and
  irreversible — the notification record is removed from the caller's list — but
  it never touches another family's or another recipient's notification.
- The TEMPORARY Tenancy 1C notification wrappers (`listNotifications`,
  `markNotificationRead`) have the same retry semantics as their family-scoped
  counterparts, applied to the default family (`\"norwood\"`).
- `bindAuthMethod` is idempotent: binding an authentication method that is
  already bound to the account is a no-op that returns the unchanged account.
  It never removes or replaces other bound methods, so a retry that actually
  succeeded does not duplicate a method.
- `claimSteward` is not idempotent in effect but guards against duplicates: it
  succeeds only while no active Steward exists, so a retry after a successful
  claim returns `#err(#AlreadySteward)` (for the claimer) or
  `#err(#StewardAlreadyExists)` (for anyone else) and creates no second steward
  record. It is a one-time bootstrap and permanently refuses once any active
  Steward exists.
- `isCallerSteward` and `hasActiveSteward` are read-only queries with no side
  effects; they are always idempotent.
- `promoteToSteward` is not idempotent in effect but guards against duplicates:
  it returns `#err(#AlreadySteward)` when the member's account is already an
  active steward, so a retry that actually succeeded does not create a second
  steward record.
- `removeSteward` is idempotent: removing an already-removed (or nonexistent)
  steward returns `#err(#NotSteward)` and changes nothing. It never allows the
  last active steward to be removed (`#err(#LastSteward)`).
- `designateSuccessor` is not idempotent: each call appends a new designation
  record for the person. `designateSuccessorForFamily` guards against a duplicate
  `#Designated` record for the same `(familyId, personId)` and returns
  `#err(#AlreadyDesignated)`. `activateSuccessor` is idempotent in effect — it
  returns `#err(#NotDesignated)` when the person has no `#Designated` record in
  the requested family, and `#err(#AlreadySteward)` when the member is already an
  active steward.
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
- `submitStoryForFamily` (and its TEMPORARY Tenancy 1C wrapper `submitStory`) is
  not idempotent: each call stores a new story with a fresh id.
  Retrying a submission that actually succeeded creates a duplicate story. A
  `relatedMemberIds` entry that does not belong to the requested `familyId`
  traps with `\"Unauthorized: Related family members must belong to the same
  family\"`, a related member that does not exist in the family traps with
  `\"Related family member not found\"`, and a `relatedArchiveItemIds` entry from
  another family traps with `\"Unauthorized: Linked media must belong to the same
  family\"` — each stores nothing.
- `approveStoryForFamily` and `rejectStoryForFamily` (and their TEMPORARY
  Tenancy 1C wrappers `approveStory` and `rejectStory`) are idempotent:
  approving or rejecting an
  already-approved or already-rejected (or nonexistent, or other-family) story
  returns `null` and
  changes nothing. They only transition stories currently in `#Pending` state
  that belong to the requested `familyId`.
  Neither is destructive — the story is preserved in either terminal state.
- `addCanonicalStoryForFamily` (and its TEMPORARY Tenancy 1C wrapper
  `addCanonicalStory`) is not idempotent: each call stores a new canonical story
  with a fresh id. `updateCanonicalStoryForFamily` (and its TEMPORARY Tenancy 1C
  wrapper `updateCanonicalStory`) is idempotent: applying the same edit
  again yields the same story, preserving the original `contributor` and
  `createdAt`. A story in another family is never touched — the update returns
  `null`.
- `submitMysteryContributionForFamily` (and its TEMPORARY Tenancy 1C wrapper
  `submitMysteryContribution`) is not idempotent: each call stores a new
  contribution with a fresh id. Retrying a submission that actually succeeded
  creates a duplicate contribution. The target mystery must belong to the
  requested `familyId`; a foreign-family `mysteryId` traps with
  `\"Mystery not found\"`.
- `reviewMysteryContributionForFamily` (and its TEMPORARY Tenancy 1C wrapper
  `reviewMysteryContribution`) is idempotent: reviewing an already-reviewed (or
  nonexistent) contribution returns `null` and changes nothing. It only
  transitions contributions currently in `#Pending` state that belong to the
  requested `familyId`.
- `createCanonicalMysteryForFamily` (and its TEMPORARY Tenancy 1C wrapper
  `createCanonicalMystery`) is not idempotent: each call stores a new mystery
  with a fresh id. `updateCanonicalMysteryForFamily` (and its TEMPORARY Tenancy
  1C wrapper `updateCanonicalMystery`) is idempotent: applying the same edit
  again yields the same mystery, preserving the original `contributor`,
  `createdAt`, and any existing `resolution`. A mystery in another family is
  never touched — the update returns `null`.
- `markMysteryResolvedForFamily` (and its TEMPORARY Tenancy 1C wrapper
  `markMysteryResolved`) is idempotent: marking an already-resolved (or
  nonexistent) mystery resolved returns `null` and changes nothing. It preserves
  the prior theories/history and never deletes the research trail. A mystery in
  another family is never touched.
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
- `getPendingContributionsCountForFamily` and its TEMPORARY Tenancy 1C
  compatibility wrapper `getPendingContributionsCount` are read-only queries with
  no side effects; they are always idempotent.
- `createSource`, `createFinding`, `createNewPersonCandidate`, and
  `createRelationshipProposal` are not idempotent: each call stores a new record
  with a fresh id. Retrying a submission that actually succeeded creates a
  duplicate record. `createFinding`, `createNewPersonCandidate`, and
  `createRelationshipProposal` validate the referenced source and return
  `#err(#notFound(sourceId))` (storing nothing) when it does not exist.
- `approveFinding` and `rejectFinding` are idempotent: approving or rejecting an
  already-reviewed (or nonexistent) finding returns `null` and changes nothing.
  They only transition findings currently in `#Pending` state. Approving a
  `#Conflicting`-labelled finding does not approve it — it routes the finding to
  a Conflict Review item and marks the finding `#Conflicting` instead of silently
  overwriting canonical data.
- `needsResearchFinding` is idempotent: marking an already-reviewed (or
  nonexistent) finding as needing research returns `null` and changes nothing.
  It only transitions findings currently in `#Pending` state, setting the
  finding's status to `#NeedsResearch` (with `reviewedBy`/`reviewedAt`/`updatedAt`
  recorded) while preserving the finding and its content, and records a
  `FindingNeedsResearch` audit entry.
- `resolveConflict` is idempotent: resolving an already-resolved conflict item
  applies the steward's chosen action again without corrupting data, and a
  nonexistent item returns `#err(#notFound(id))` and changes nothing. On the
  first resolution it applies the steward's chosen action: `#KeepExisting` and
  `#ReplaceExisting` mark the item `#Approved` (resolved) and record the reviewer
  and review time, with `#ReplaceExisting` also writing the proposed value into
  canonical data once; `#PreserveBoth` keeps the item `#Conflicting` (unresolved)
  and `#NeedsResearch` moves it to `#NeedsResearch` (unresolved), both leaving
  canonical data unchanged. A `#ReplaceExisting` resolution whose Person Fact
  field cannot be mapped to a canonical Person field returns
  `#err(#invalidState(...))`, leaves the conflict unresolved, and does not alter
  canonical data. Every resolution records an audit entry.
- `approveSourceForFamily`, `rejectSourceForFamily`, and
  `needsResearchSourceForFamily` are idempotent: acting on an already-reviewed
  (or nonexistent) source returns `null` and changes nothing. They only
  transition sources currently in `#Pending` state. `approveSourceForFamily` and
  `rejectSourceForFamily` also transition the source's linked Archive item (when
  `archiveItemId` is set and the item belongs to the same family) from `#Pending`
  to the matching status, so a Research upload needs only one Steward decision;
  the linked item keeps its metadata, blob, and ids and no Archive notification
  is emitted for it. An `archiveItemId` pointing at another family's item is
  never followed. `rejectSourceForFamily` never deletes the original Archive
  item; `needsResearchSourceForFamily` preserves the source and its notes. Each
  successful review records exactly one `#ResearchApproved`/`#ResearchRejected`
  notification to the contributor (approve/reject) without duplicates. The
  single-family `approveSource`, `rejectSource`, and `needsResearchSource` are
  TEMPORARY Tenancy 1C compatibility wrappers delegating with the default family
  id (`\"norwood\"`).
- `approveNewPersonCandidate`, `rejectNewPersonCandidate`, and
  `needsResearchNewPersonCandidate` are idempotent: acting on an already-reviewed
  (or nonexistent) candidate returns `null` and changes nothing. They only
  transition candidates currently in `#Pending` state. Approving a candidate
  creates exactly one canonical Person record (a fresh unclaimed living profile
  with a personId derived from the candidate's name, made unique against
  existing profiles) and records a `#ResearchApproved` notification to the
  contributor; it never auto-creates relationships. Rejecting and needs-research
  create no Person.
- `approveRelationshipProposal`, `rejectRelationshipProposal`, and
  `needsResearchRelationshipProposal` are idempotent: acting on an
  already-reviewed (or nonexistent) proposal returns `null` and changes nothing.
  They only transition proposals currently in `#Pending` state. Approving a
  proposal adds the canonical relationship to the family graph exactly once —
  when an identical confirmed relationship already exists, no second
  relationship is added — and records a `#ResearchApproved` notification to the
  contributor. Rejecting and needs-research leave the family graph unchanged.
- `createRelationshipProposalForFamily` requires an approved member of the
  requested `familyId` and returns `#err(#notAuthorized)` for an anonymous or
  signed-in but unapproved caller rather than trapping. Both referenced people
  must belong to `familyId` and the linked Source must belong to `familyId`;
  otherwise the call returns `#err(#notAuthorized)` (foreign person) or
  `#err(#notFound(sourceId))` (foreign or missing source) and stores nothing.
  The created proposal carries `familyId` equal to the requested family and
  enters as `#Pending`; no approval or confirmed relationship is created.
- `listRelationshipProposalsForFamily` and `getRelationshipProposalForFamily`
  are Steward-only reads of the requested `familyId`, preserving the
  pre-tenancy Steward-only proposal-read gate. A proposal whose `familyId`
  differs is never returned, so a `proposalId` alone cannot cross a family
  boundary. The single-family `createRelationshipProposal` and
  `listRelationshipProposals` are TEMPORARY Tenancy 1C compatibility wrappers
  delegating with the default family id (`\"norwood\"`).
- `approveRelationshipProposalForFamily` and `rejectRelationshipProposalForFamily`
  are the canonical family-scoped review actions: a Steward of one family can
  never approve or reject another family's proposal, and a proposal whose
  `familyId` differs from the requested family is treated as not found
  (`null`). Approval additionally re-checks that both referenced people still
  belong to the family and that the linked Source belongs to the family, and
  creates the confirmed relationship inside the requested family only. The
  single-family `approveRelationshipProposal` and `rejectRelationshipProposal`
  are TEMPORARY Tenancy 1C compatibility wrappers delegating with the default
  family id (`\"norwood\"`).
- `getSource`, `getFinding`, `getReviewQueue`, and
  `getResearchAuditLogForFamily` are
  read-only queries with no side effects; they are always idempotent.- `getStewardAuditHistory` is a read-only query with no side effects; it is
  always idempotent and never mutates or duplicates any audit record.

## Errors, traps, limits, and gotchas

- `getCallerUserRole` and `isCallerAdmin` trap with `\"User is not registered\"`
  for a signed-in but unregistered caller.
- `assignCallerUserRole` traps with `\"Unauthorized: Only admins can assign
  user roles\"` when the caller is not an admin.
- `setProfilePhoto` returns `null` (it does not trap) when the photo id does
  not exist in the person's gallery.
- `submitArchiveItemForFamily` traps with `\"A primary speaker is required for
  Oral History items\"` when `classification == #OralHistory` and
  `primarySpeaker` is `null`, and with `\"A primary speaker is only allowed on
  Oral History items\"` when `classification == #Standard` and `primarySpeaker`
  is not `null`. These traps store nothing, so a rejected submission leaves no
  partial item. It also traps with `\"Unauthorized: Related family members must
  belong to the same family\"` when a `relatedMemberIds` entry does not belong to
  the requested `familyId`. The
  speaker field is hidden in the UI for media not classified as Oral History,
  but the backend still enforces the invariant regardless of the client. It also
  traps when the upload fails validation (unsupported/forbidden MIME type, empty
  file, or over the surface byte ceiling) or when `filename` sanitizes to an
  empty value. The allowed document MIME list is `application/pdf`,
  `text/plain`, `text/csv`, `application/msword`,
  `application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
  `application/vnd.ms-excel`, and
  `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`; Word,
  Excel, and CSV files are stored but never rendered inline.
- `approveArchiveItemForFamily` and `rejectArchiveItemForFamily` notify only the
  item's `contributor`; contributor identity is never exposed to other users, and
  research-source notifications (`#ResearchSubmission`/`#ResearchApproved`/
  `#ResearchRejected`) are unchanged. An item that belongs to another family is
  treated exactly like a nonexistent item: the call returns `null` and changes
  nothing, so an `archiveItemId` alone never crosses the family boundary.
- The single-family archive wrappers (`submitArchiveItem`, `approveArchiveItem`,
  `rejectArchiveItem`) trap and return exactly as their family-scoped
  counterparts do, applied to the default family (`\"norwood\"`).
- Photo ids are per-person; the same numeric id can refer to different photos
  for different people.
- The OQL `photo` entity's primary key is the composite `key` field, not `id`,
  because `id` is only unique within a person.
- The Family Steward review methods trap with `\"Unauthorized: Only Family
  Stewards can ...\"` when the caller is not an active Family Steward (an ACTIVE
  persisted `StewardRecord`). The sign-in-gated
  ownership methods (`requestProfileClaim`, `createMyself`,
  `proposeRelationship`, `updateOwnProfile`) return `#err(#NotSignedIn)` for an
  anonymous caller rather than trapping.
- `requestProfileClaim` returns `#err(#DeceasedProfile)` for a deceased profile
  — deceased profiles can never be claimed. `updateOwnProfile` likewise returns
  `#err(#DeceasedProfile)` for a deceased profile and `#err(#NotOwner)` when the
  caller is neither the profile's owner nor a Family Steward editing an
  unclaimed profile.
- `approveProfileClaim`, `rejectProfileClaim`, `approveRelationshipRequest`,
  `rejectRelationshipRequest`, and `setRelationshipRequestPending` return `null`
  (they do not trap) when the target id does not exist or is not in the expected
  state.
- `removeDuplicateProfile` returns `#err(#NotSignedIn)` for an anonymous caller
  and `#err(#ProfileNotFound)` when the person is not tracked. It is Family
  Steward only and traps with `\"Unauthorized: Only Family Stewards can remove
  duplicate profiles\"` when the caller is not an active Family Steward (an
  ACTIVE persisted `StewardRecord`). It removes the profile
  plus any pending relationship request or pending claim tied only to it; it
  never removes the signed-in account and never alters confirmed relationships.
- The Family Governance methods trap with `\"Unauthorized: Only Family Stewards
  can ...\"` when the caller is not an active Family Steward (an ACTIVE persisted
  `StewardRecord`). The platform admin role does not grant these powers.
  `requestProfileRemoval` is the one
  governance method a normal family member calls; it returns `#err(#NotSignedIn)`
  for an anonymous caller rather than trapping, and only ever requests removal
  of the caller's own claimed living profile.
- `claimSteward` returns `#err(#NotSignedIn)` for an anonymous caller,
  `#err(#StewardAlreadyExists)` when an active Steward already exists and the
  caller is not one, and `#err(#AlreadySteward)` when the caller already holds
  an active Steward record. It does not trap. `isCallerSteward` and
  `hasActiveSteward` return `false` for an anonymous caller rather than
  trapping.
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
- The notification reads (`listNotificationsForFamily`,
  `listUnreadNotificationsForFamily`, `unreadNotificationCountForFamily`,
  `getNotificationForFamily`) and the TEMPORARY `listNotifications` wrapper
  return only the signed-in caller's own notification records in the requested
  family; they are not a global feed. A notification is only ever read, counted,
  or mutated when its `familyId` equals the requested family AND its `recipient`
  is the caller. A `notificationId` alone never crosses the family boundary: a
  foreign-family notification id behaves exactly like a not-found id — the
  single-record reads return `null`, the mutations return `null`/`0`/`false`,
  and no distinguishable error is produced — so a caller cannot use the response
  to learn whether another family's notification exists. The same account
  participating in two families receives its notifications separated by family,
  and marking a Family A notification read never marks a Family B notification
  read.
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
- The canonical Story methods trap with `\"Unauthorized: You must be signed in\"`
  for an anonymous caller and with the stable, non-technical `\"Family membership
  required. Claim your family profile and wait for Family Steward approval before
  contributing family content.\"` for a signed-in but unapproved caller. The
  Story Steward methods trap with `\"Unauthorized: Only Family Stewards can
  perform this action\"` when the caller is not an active Family Steward of the
  requested family (an ACTIVE persisted `StewardRecord`). A story that belongs to
  another family is treated exactly like a nonexistent story: the single-record
  reads return `null` and the mutations return `null` without touching the
  foreign record, so a `storyId` alone never crosses the family boundary.
  `submitMysteryContributionForFamily` (and its TEMPORARY Tenancy 1C wrapper
  `submitMysteryContribution`) traps with `\"Mystery not found\"` when the target
  mystery does not belong to the requested family. The Family
  Steward Mystery methods trap with `\"Unauthorized: Only Family Stewards
  can perform this action\"` when the caller is not an active Family Steward of
  the   requested family (an ACTIVE persisted `StewardRecord`). A mystery or
  contribution that belongs to another family is treated exactly like a
  nonexistent record: the single-record reads return `null` and the mutations
  return `null` without touching the foreign record, so a `mysteryId` or
  `contributionId` alone never crosses the family boundary. A foreign-family
  `mysteryId`/`contributionId` therefore resolves as not-found (`?null` or `[]`)
  rather than a distinguishable error, so a caller cannot use the response to
  learn whether another family's record exists. The one exception is
  `submitMysteryContributionForFamily` (and its TEMPORARY Tenancy 1C wrapper
  `submitMysteryContribution`), which traps with `\"Mystery not found\"` when the
  target mystery does not belong to the requested family — the same message it
  produces for a mystery that does not exist at all.
- `approveStoryForFamily`, `rejectStoryForFamily`,
  `updateCanonicalStoryForFamily` (and their TEMPORARY Tenancy 1C wrappers
  `approveStory`, `rejectStory`, `updateCanonicalStory`),
  `reviewMysteryContributionForFamily`, `updateCanonicalMysteryForFamily`, and
  `markMysteryResolvedForFamily` (and their TEMPORARY Tenancy 1C wrappers
  `reviewMysteryContribution`, `updateCanonicalMystery`, and
  `markMysteryResolved`) return `null` (they do not trap) when the target id does
  not exist, belongs to another family, or is not in the expected state.
- Stories and Mysteries reference existing person ids and archive item ids; they
  never create duplicate Person records or duplicate source files.
- `submitRecipe` requires an approved family member (a caller holding at least
  one `#Approved` profile claim, or a Family Steward); it traps with
  `\"Unauthorized: You must be signed in\"` for an anonymous caller and with the
  stable, non-technical `\"Family membership required. Claim your family profile
  and wait for Family Steward approval before contributing family content.\"`
  for a signed-in but unapproved caller. It also traps with `\"Originating family
  member not found\"` when
  `originatingPersonId` does not reference a tracked canonical Person record.
  `publishRecipe` traps with `\"Unauthorized: Only Family Stewards can publish
  recipes\"` when the caller is not an active Family Steward (an ACTIVE persisted
  `StewardRecord`), and with `\"Originating family
  member not found\"` when the originating person is not tracked. The Family
  Steward recipe methods (`listPendingRecipes`, `approveRecipe`, `rejectRecipe`,
  `publishRecipe`) trap with `\"Unauthorized: Only Family Stewards can ...\"`
  when the caller is not an active Family Steward (an ACTIVE persisted
  `StewardRecord`).
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
- The board and messaging methods gate on approved family membership through the
  canonical family-scoped helper (`requireApprovedFamilyMemberForFamily`). The
  member board and messaging methods trap with `\"Unauthorized: You must be
  signed in\"` for an anonymous caller and with the stable, non-technical
  `\"Family membership required. Claim your family profile and wait for Family
  Steward approval before contributing family content.\"` when the caller is a
  signed-in but unapproved member of the requested `familyId`. The steward
  board/messaging methods (`restoreBoardPost`, `removeBoardReply`, `listReports`,
  `reviewReport`, `getReportedMessage`) and the Pending Contributions methods
  (`getPendingContributionsCountForFamily` and its TEMPORARY Tenancy 1C wrapper
  `getPendingContributionsCount`) trap
  with `\"Unauthorized: Only Family Stewards can perform this action\"` (or the
  equivalent pending-count message) when the caller is not an active Family
  Steward (an ACTIVE persisted `StewardRecord`).
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
- The Historical Research Intake creation methods (`createSource`,
  `createFinding`, `createNewPersonCandidate`, `createRelationshipProposal`)
  return `#err(#notAuthorized)` for an anonymous or signed-in but unapproved
  caller rather than trapping.
  `createFinding`, `createNewPersonCandidate`, and
  `createRelationshipProposal` return `#err(#notFound(sourceId))` when the
  referenced source does not exist.
- The Family Steward research-intake review methods (`listSourcesForFamily`,
  `listFindings`, `listNewPersonCandidates`, `listRelationshipProposals`,
  `listConflictReviewItems`, `approveFinding`, `rejectFinding`,
  `needsResearchFinding`, `resolveConflict`, `approveNewPersonCandidate`,
  `rejectNewPersonCandidate`, `needsResearchNewPersonCandidate`,
  `approveRelationshipProposal`, `rejectRelationshipProposal`,
  `needsResearchRelationshipProposal`) trap with `\"Unauthorized: You must
  be signed in\"` for an
  anonymous caller and `\"Unauthorized: Only Family Stewards can perform this
  action\"` when the caller is not an active Family Steward (an ACTIVE persisted
  `StewardRecord`). The family-scoped source reads `listSourcesForFamily` and
  `getSourceForFamily` require an approved member or active Steward of the
  requested `familyId` and trap with the stable family-membership message for a
  signed-in but unapproved caller.
- `approveFinding`, `rejectFinding`, `needsResearchFinding`, `resolveConflict`,
  `approveNewPersonCandidate`, `rejectNewPersonCandidate`,
  `needsResearchNewPersonCandidate`, `approveRelationshipProposal`,
  `rejectRelationshipProposal`, and `needsResearchRelationshipProposal` return
  `null` (they do
  not trap) when the target id does not exist or is not in the expected state.
  `getSource` and `getFinding` return `null` when the target id does not exist.
- The research-intake OQL entities (`researchSource`, `proposedFinding`,
  `newPersonCandidate`, `relationshipProposal`, `conflictReviewItem`,
  `researchAuditLog`) are flattened views: enumerated variants render as their
  tag text, optional fields render as empty text or `0`, and the nested
  `content` variant on a proposed finding is not exposed (OQL has no variant
  value type) — the `findingType` column carries the routing target. The
  `researchSource` entity is `.controllerOrScoped()` with a family-membership
  row-visibility rule (its `familyId` column is the owner column), so a
  signed-in caller reads only their own family's sources through OQL; the other
  research-intake entities remain `.controllerOnly()`.
- `getStewardAuditHistory` is Family Steward only and traps with
  `\"Unauthorized: You must be signed in\"` for an anonymous caller and
  `\"Unauthorized: Only Family Stewards can view audit history\"` when the
  caller is not an active Family Steward (an ACTIVE persisted `StewardRecord`).
  It is a computed read over existing records — it
  never writes, duplicates, or deletes any audit entry, and it does not require
  a migration. A conflict-resolution entry's `resolution` field is derived from
  the research audit summary text (the parenthesized action), so it is `null`
  only when that summary does not carry a parenthesized action; the other
  conflict-specific fields are populated from the linked Conflict Review item
  and are `null` when no linked item exists.
"
  };
};
