import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Time "mo:core/Time";
import ConfirmationTypes "../types/membership-confirmation";
import MembershipTypes "../types/family-membership";
import OwnershipTypes "../types/ownership";
import GovernanceTypes "../types/governance";
import MembershipLib "family-membership";
import StewardAuthorityLib "steward-authority";
import RelationshipsLib "relationships";

/// Canonical MembershipConfirmation domain logic (Onboarding Phase 1D).
///
/// A pending new family member may be confirmed by an existing trusted relative.
/// If confirmations conflict, the case escalates to the Family Steward. One
/// relative can never permanently block legitimate access on their own.
///
/// Every lookup is family-scoped: a confirmation in Family A never satisfies a
/// membership in Family B, and a relationship in Family A never qualifies a
/// confirmation in Family B.
///
/// The `*ForFamily` functions below are the unrestricted, internal read
/// primitives. They are library-only and MUST NOT be exposed as public
/// endpoints: the public mixin wraps them with the caller-authorization gate.
module {
  /// INTERNAL (library-only, never a public endpoint). Returns the confirmation
  /// with `confirmationId` only when it belongs to `familyId`; a confirmation id
  /// from another family never resolves here.
  public func getConfirmationForFamily(
    confirmations : List.List<ConfirmationTypes.MembershipConfirmation>,
    familyId : ConfirmationTypes.FamilyId,
    confirmationId : Nat,
  ) : ?ConfirmationTypes.MembershipConfirmation {
    confirmations.find(func c = c.familyId == familyId and c.id == confirmationId);
  };

  /// INTERNAL (library-only, never a public endpoint). Returns every
  /// confirmation recorded for `membershipId` in `familyId` only. Confirmations
  /// from other families are never included.
  public func listConfirmationsForMembership(
    confirmations : List.List<ConfirmationTypes.MembershipConfirmation>,
    familyId : ConfirmationTypes.FamilyId,
    membershipId : Nat,
  ) : [ConfirmationTypes.MembershipConfirmation] {
    confirmations.toArray().filter(func c =
      c.familyId == familyId and c.membershipId == membershipId
    );
  };

  /// INTERNAL (library-only, never a public endpoint). Returns the confirmer's
  /// existing active decision for `membershipId` in `familyId`, or `null` when
  /// the confirmer has not yet decided. Used to enforce at most one active
  /// decision per confirmer per membership.
  public func getConfirmationByConfirmer(
    confirmations : List.List<ConfirmationTypes.MembershipConfirmation>,
    familyId : ConfirmationTypes.FamilyId,
    membershipId : Nat,
    confirmerAccountId : ConfirmationTypes.AccountId,
  ) : ?ConfirmationTypes.MembershipConfirmation {
    confirmations.find(func c =
      c.familyId == familyId
      and c.membershipId == membershipId
      and c.confirmerAccountId == confirmerAccountId
    );
  };

  /// INTERNAL (library-only, never a public endpoint). Returns the persisted
  /// Steward resolution for `membershipId` in `familyId`, or `null` when no
  /// Steward has resolved the case. A resolution from another family never
  /// resolves here.
  public func getResolutionForFamily(
    resolutions : List.List<ConfirmationTypes.MembershipConfirmationResolutionRecord>,
    familyId : ConfirmationTypes.FamilyId,
    membershipId : Nat,
  ) : ?ConfirmationTypes.MembershipConfirmationResolutionRecord {
    resolutions.find(func r = r.familyId == familyId and r.membershipId == membershipId);
  };

  /// INTERNAL (library-only, never a public endpoint). Derives the current
  /// confirmation state for `membershipId` in `familyId`.
  ///
  /// A persisted Steward resolution takes precedence: a `#Approve` or `#Reject`
  /// record yields `#ResolvedBySteward`. `#NeedsMoreInformation` writes no
  /// record, so the case stays open at `#StewardReviewRequired`.
  ///
  /// Otherwise the state is derived from the recorded decisions:
  /// `#AwaitingConfirmation` when there are none, `#ApprovedByRelative` when
  /// there is at least one `#Confirmed` and no `#Disputed`, and
  /// `#StewardReviewRequired` when a `#Disputed` exists (whether or not a
  /// `#Confirmed` also exists). Never duplicates `FamilyMembership.status`.
  public func confirmationStateForMembership(
    confirmations : List.List<ConfirmationTypes.MembershipConfirmation>,
    resolutions : List.List<ConfirmationTypes.MembershipConfirmationResolutionRecord>,
    familyId : ConfirmationTypes.FamilyId,
    membershipId : Nat,
  ) : ConfirmationTypes.MembershipConfirmationState {
    switch (getResolutionForFamily(resolutions, familyId, membershipId)) {
      case (?r) {
        switch (r.resolution) {
          case (#Approve) { return #ResolvedBySteward };
          case (#Reject) { return #ResolvedBySteward };
          case (#NeedsMoreInformation) {};
        };
      };
      case null {};
    };
    let decisions = listConfirmationsForMembership(confirmations, familyId, membershipId);
    if (decisions.size() == 0) {
      return #AwaitingConfirmation;
    };
    let hasDisputed = decisions.any(func c = c.decision == #Disputed);
    if (hasDisputed) {
      return #StewardReviewRequired;
    };
    #ApprovedByRelative;
  };

  /// Records a trusted relative's decision about a membership in `familyId`.
  /// The caller, the confirmer person, and the qualifying relationship are all
  /// derived server-side; no caller-supplied identity is trusted.
  ///
  /// A decision is accepted when the membership is `#Pending`, OR when it is
  /// `#Active` and the confirmation case shows it was activated through
  /// trusted-relative confirmation (`#ApprovedByRelative`) and has not been
  /// finally resolved by a Steward. This lets a later qualifying relative
  /// challenge a relative-activated membership. A Steward-approved final
  /// membership, a `#Suspended` membership unrelated to this confirmation case,
  /// and a `#Left` membership are all rejected.
  ///
  /// Rejects a membership that does not belong to `familyId`, a confirmer with
  /// no `#Active` membership in `familyId`, a confirmer with no qualifying
  /// confirmed relationship to the pending person, and self-confirmation. A
  /// confirmer may hold at most one active decision per membership: a duplicate
  /// is safely updated in place.
  ///
  /// When the resulting state is `#ApprovedByRelative` (at least one
  /// `#Confirmed` and no `#Disputed`), the membership is activated through the
  /// existing secure `FamilyMembership` activation path, recording `approvedBy`
  /// and `approvedAt` without bypassing profile-ownership invariants. If that
  /// activation fails, the case is NOT reported as `#ApprovedByRelative`; the
  /// decision is rolled back and `#err(#ActivationFailed)` is returned so the
  /// membership and confirmation state stay internally consistent.
  ///
  /// A valid `#Disputed` against a relative-activated `#Active` membership
  /// records the dispute, transitions the membership to `#Suspended`, and
  /// yields `#StewardReviewRequired`. The membership and every previously
  /// recorded confirmation are preserved.
  public func submitConfirmationForFamily(
    confirmations : List.List<ConfirmationTypes.MembershipConfirmation>,
    resolutions : List.List<ConfirmationTypes.MembershipConfirmationResolutionRecord>,
    memberships : List.List<MembershipTypes.FamilyMembership>,
    _profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    _claims : List.List<OwnershipTypes.ProfileClaim>,
    confirmedRelationships : List.List<OwnershipTypes.Relationship>,
    familyId : ConfirmationTypes.FamilyId,
    membershipId : Nat,
    caller : Principal,
    decision : ConfirmationTypes.ConfirmationDecision,
  ) : Result.Result<ConfirmationTypes.MembershipConfirmation, ConfirmationTypes.MembershipConfirmationError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    let membership = switch (MembershipLib.getMembershipByIdForFamily(memberships, familyId, membershipId)) {
      case (?m) m;
      case null { return #err(#MembershipNotFound) };
    };
    // A Steward resolution is final: no further relative decision is accepted.
    if (getResolutionForFamily(resolutions, familyId, membershipId) != null) {
      return #err(#MembershipNotPending);
    };
    let caseState = confirmationStateForMembership(confirmations, resolutions, familyId, membershipId);
    let isPending = membership.status == #Pending;
    let isChallengeableActive = membership.status == #Active and caseState == #ApprovedByRelative;
    if (not isPending and not isChallengeableActive) {
      return #err(#MembershipNotPending);
    };
    let confirmerMembership = switch (MembershipLib.getMembershipForFamily(memberships, familyId, caller)) {
      case (?m) m;
      case null { return #err(#NoActiveMembership) };
    };
    if (confirmerMembership.status != #Active) {
      return #err(#NoActiveMembership);
    };
    if (confirmerMembership.personId == membership.personId) {
      return #err(#SelfConfirmation);
    };
    let relationship = switch (
      RelationshipsLib.findConfirmedRelationshipBetween(
        confirmedRelationships,
        familyId,
        confirmerMembership.personId,
        membership.personId,
      )
    ) {
      case (?r) r;
      case null { return #err(#NoQualifyingRelationship) };
    };
    let now = Time.now();
    let existing = getConfirmationByConfirmer(confirmations, familyId, membershipId, caller);
    let record : ConfirmationTypes.MembershipConfirmation = switch (existing) {
      case (?c) {
        {
          id = c.id;
          familyId = c.familyId;
          membershipId = c.membershipId;
          pendingPersonId = c.pendingPersonId;
          confirmerAccountId = c.confirmerAccountId;
          confirmerPersonId = confirmerMembership.personId;
          decision;
          relationshipId = ?relationship.id;
          createdAt = c.createdAt;
          updatedAt = now;
        };
      };
      case null {
        {
          id = confirmationStateNextId(confirmations);
          familyId;
          membershipId;
          pendingPersonId = membership.personId;
          confirmerAccountId = caller;
          confirmerPersonId = confirmerMembership.personId;
          decision;
          relationshipId = ?relationship.id;
          createdAt = now;
          updatedAt = now;
        };
      };
    };
    replaceConfirmation(confirmations, record);
    let state = confirmationStateForMembership(confirmations, resolutions, familyId, membershipId);
    switch (state) {
      case (#ApprovedByRelative) {
        // Only a `#Pending` membership needs activation here; a membership that
        // is already `#Active` (challengeable case) is already active.
        if (membership.status == #Pending) {
          switch (MembershipLib.activateMembershipForFamily(memberships, familyId, membershipId, caller)) {
            case (#ok _) {};
            case (#err _) {
              // Do not report a successful relative approval when activation
              // failed. Roll the decision back so membership and confirmation
              // state stay consistent.
              rollbackConfirmation(confirmations, familyId, membershipId, caller, existing);
              return #err(#ActivationFailed);
            };
          };
        };
      };
      case (#StewardReviewRequired) {
        // A post-activation dispute suspends the relative-activated membership.
        if (membership.status == #Active) {
          switch (MembershipLib.suspendMembershipForFamily(memberships, familyId, membershipId)) {
            case (#ok _) {};
            case (#err _) {
              rollbackConfirmation(confirmations, familyId, membershipId, caller, existing);
              return #err(#ActivationFailed);
            };
          };
        };
      };
      case (#AwaitingConfirmation) {};
      case (#ResolvedBySteward) {};
    };
    #ok(record);
  };

  /// Resolves an escalated confirmation case for `membershipId` in `familyId`.
  /// Steward of `familyId` only: the caller must be an active Steward of the
  /// requested family, and the membership and every confirmation record must
  /// belong to that same family.
  ///
  /// `#Approve` activates a `#Pending` membership through the existing secure
  /// activation path, and restores a membership that was suspended by THIS
  /// confirmation dispute back to `#Active` through the narrow
  /// `restoreConfirmationSuspendedMembershipForFamily` path. A `#Suspended`
  /// membership is restored only when the confirmation case is at
  /// `#StewardReviewRequired` (a recorded `#Disputed` decision with no prior
  /// Steward resolution); a membership suspended for any other reason is left
  /// `#Suspended` and `#err(#MembershipNotPending)` is returned, so this is not
  /// an unrestricted reactivation path. Either way a successful resolution
  /// persists a resolution record, so the confirmation state reads
  /// `#ResolvedBySteward`. A real activation/restore failure is surfaced as
  /// `#err(#ActivationFailed)` rather than collapsed into `#MembershipNotPending`.
  ///
  /// `#Reject` leaves the membership non-`#Active` (a `#Pending` membership
  /// stays `#Pending`, a confirmation-suspended membership stays `#Suspended`,
  /// and a relative-activated `#Active` membership is suspended) and persists a
  /// resolution record, so the state reads `#ResolvedBySteward` and the
  /// rejection is distinguishable from `#NeedsMoreInformation`.
  ///
  /// `#NeedsMoreInformation` persists no record, keeping the membership
  /// `#Pending` or `#Suspended` as appropriate and the case open at
  /// `#StewardReviewRequired`. The membership is never deleted.
  public func resolveConfirmationForFamily(
    confirmations : List.List<ConfirmationTypes.MembershipConfirmation>,
    resolutions : List.List<ConfirmationTypes.MembershipConfirmationResolutionRecord>,
    memberships : List.List<MembershipTypes.FamilyMembership>,
    stewards : List.List<GovernanceTypes.StewardRecord>,
    familyId : ConfirmationTypes.FamilyId,
    membershipId : Nat,
    caller : Principal,
    resolution : ConfirmationTypes.MembershipConfirmationResolution,
  ) : Result.Result<MembershipTypes.FamilyMembership, ConfirmationTypes.MembershipConfirmationError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      return #err(#NotSteward);
    };
    let membership = switch (MembershipLib.getMembershipByIdForFamily(memberships, familyId, membershipId)) {
      case (?m) m;
      case null { return #err(#MembershipNotFound) };
    };
    switch (resolution) {
      case (#Approve) {
        switch (membership.status) {
          case (#Pending) {
            switch (MembershipLib.activateMembershipForFamily(memberships, familyId, membershipId, caller)) {
              case (#ok updated) {
                recordResolution(resolutions, familyId, membershipId, resolution, caller);
                #ok(updated);
              };
              case (#err _) { #err(#ActivationFailed) };
            };
          };
          case (#Suspended) {
            // Restore ONLY a membership suspended by THIS confirmation dispute:
            // the case must be open at `#StewardReviewRequired` (a recorded
            // `#Disputed` decision with no prior Steward resolution). A
            // membership suspended for any other reason is left `#Suspended`;
            // this is not a general reactivation path.
            let caseState = confirmationStateForMembership(confirmations, resolutions, familyId, membershipId);
            if (caseState != #StewardReviewRequired) {
              return #err(#MembershipNotPending);
            };
            switch (MembershipLib.restoreConfirmationSuspendedMembershipForFamily(memberships, familyId, membershipId, caller)) {
              case (#ok updated) {
                recordResolution(resolutions, familyId, membershipId, resolution, caller);
                #ok(updated);
              };
              case (#err _) { #err(#ActivationFailed) };
            };
          };
          case (#Active) {
            // Already active (e.g. a relative-activated case): record the
            // Steward approval without a redundant transition.
            recordResolution(resolutions, familyId, membershipId, resolution, caller);
            #ok(membership);
          };
          case (#Left) { #err(#MembershipNotPending) };
        };
      };
      case (#Reject) {
        // A resolved rejection must leave the membership non-`#Active`. A
        // `#Pending` or `#Suspended` membership is already non-active; an
        // `#Active` membership (a relative-activated case) is suspended so the
        // `#ResolvedBySteward` + `#Reject` invariant holds.
        switch (membership.status) {
          case (#Active) {
            switch (MembershipLib.suspendMembershipForFamily(memberships, familyId, membershipId)) {
              case (#ok updated) {
                recordResolution(resolutions, familyId, membershipId, resolution, caller);
                #ok(updated);
              };
              case (#err _) { #err(#ActivationFailed) };
            };
          };
          case (#Pending) {
            recordResolution(resolutions, familyId, membershipId, resolution, caller);
            #ok(membership);
          };
          case (#Suspended) {
            recordResolution(resolutions, familyId, membershipId, resolution, caller);
            #ok(membership);
          };
          case (#Left) {
            recordResolution(resolutions, familyId, membershipId, resolution, caller);
            #ok(membership);
          };
        };
      };
      case (#NeedsMoreInformation) {
        #ok(membership);
      };
    };
  };

  /// Persists (or replaces) the Steward resolution for `membershipId` in
  /// `familyId`. One resolution record per membership; a later Steward decision
  /// replaces the earlier one in place. Carries no sensitive relationship
  /// context.
  func recordResolution(
    resolutions : List.List<ConfirmationTypes.MembershipConfirmationResolutionRecord>,
    familyId : ConfirmationTypes.FamilyId,
    membershipId : Nat,
    resolution : ConfirmationTypes.MembershipConfirmationResolution,
    resolvedByAccountId : Principal,
  ) {
    let record : ConfirmationTypes.MembershipConfirmationResolutionRecord = {
      familyId;
      membershipId;
      resolution;
      resolvedByAccountId;
      resolvedAt = Time.now();
    };
    let snapshot = resolutions.toArray();
    resolutions.clear();
    var replaced = false;
    for (r in snapshot.values()) {
      if (r.familyId == familyId and r.membershipId == membershipId) {
        resolutions.add(record);
        replaced := true;
      } else {
        resolutions.add(r);
      };
    };
    if (not replaced) {
      resolutions.add(record);
    };
  };

  /// INTERNAL (library-only, never a public endpoint). Derives the privacy-safe
  /// list of confirmation requests the caller is currently eligible to act on in
  /// `familyId`.
  ///
  /// Eligibility is computed entirely from backend records — never from
  /// notification message text. The caller's own `#Active` membership in
  /// `familyId` supplies the caller's `personId`; a qualifying relationship is
  /// the confirmed relationship between the caller's person and the target
  /// membership's person in `familyId`.
  ///
  /// A case is actionable when the target membership is `#Pending`, or when it
  /// is `#Active` and the confirmation case is `#ApprovedByRelative` (still
  /// challengeable under the 1D-H rule). Excluded: the caller's own membership
  /// (self-confirmation), a case the caller has already decided, memberships of
  /// another family, Steward-resolved cases, `#Left` memberships, unrelated
  /// `#Suspended` memberships, and cases with no qualifying relationship.
  public func listEligibleConfirmationsForFamily(
    confirmations : List.List<ConfirmationTypes.MembershipConfirmation>,
    resolutions : List.List<ConfirmationTypes.MembershipConfirmationResolutionRecord>,
    memberships : List.List<MembershipTypes.FamilyMembership>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    confirmedRelationships : List.List<OwnershipTypes.Relationship>,
    familyId : ConfirmationTypes.FamilyId,
    caller : Principal,
  ) : [ConfirmationTypes.EligibleMembershipConfirmationView] {
    let callerMembership = switch (MembershipLib.getMembershipForFamily(memberships, familyId, caller)) {
      case (?m) m;
      case null { return [] };
    };
    if (callerMembership.status != #Active) {
      return [];
    };
    let callerPersonId = callerMembership.personId;
    let candidates = MembershipLib.listFamilyMembersForFamily(memberships, familyId);
    let eligible = List.empty<ConfirmationTypes.EligibleMembershipConfirmationView>();
    for (membership in candidates.values()) {
      // Never the caller's own membership (self-confirmation).
      if (membership.personId != callerPersonId) {
        // A Steward resolution is final: no further relative decision.
        if (getResolutionForFamily(resolutions, familyId, membership.id) == null) {
          // The caller must not have already recorded a decision on this case.
          if (getConfirmationByConfirmer(confirmations, familyId, membership.id, caller) == null) {
            let caseState = confirmationStateForMembership(confirmations, resolutions, familyId, membership.id);
            let isPending = membership.status == #Pending;
            let isChallengeableActive = membership.status == #Active and caseState == #ApprovedByRelative;
            if (isPending or isChallengeableActive) {
              switch (
                RelationshipsLib.findConfirmedRelationshipBetween(
                  confirmedRelationships,
                  familyId,
                  callerPersonId,
                  membership.personId,
                )
              ) {
                case (?relationship) {
                  let displayName = switch (profiles.get(membership.personId)) {
                    case (?p) p.name;
                    case null membership.personId;
                  };
                  eligible.add({
                    familyId;
                    membershipId = membership.id;
                    pendingPersonId = membership.personId;
                    displayName;
                    profilePhoto = null;
                    birthYear = null;
                    simpleRelationship = simpleRelationshipLabel(relationship.relationshipType);
                    confirmationState = caseState;
                  });
                };
                case null {};
              };
            };
          };
        };
      };
    };
    eligible.toArray();
  };

  /// Builds the OQL-exposable rows for every membership confirmation.
  public func confirmationRows(
    confirmations : List.List<ConfirmationTypes.MembershipConfirmation>,
  ) : [ConfirmationTypes.MembershipConfirmationRow] {
    confirmations.toArray().map(func c = {
      familyId = c.familyId;
      id = c.id;
      membershipId = c.membershipId;
      pendingPersonId = c.pendingPersonId;
      confirmerAccountId = c.confirmerAccountId.toText();
      confirmerPersonId = c.confirmerPersonId;
      decision = decisionText(c.decision);
      relationshipId = c.relationshipId ?? 0;
      createdAt = c.createdAt;
      updatedAt = c.updatedAt;
    });
  };

  /// Builds the redacted, applicant-safe view of a confirmation case for the
  /// pending membership's own account. It exposes only the derived case state,
  /// the caller's own decision and simple relationship label, and timestamps.
  /// It never exposes a confirmer account principal, sensitive relationship
  /// context, private notes, or unrelated profile information.
  public func applicantViewForMembership(
    confirmations : List.List<ConfirmationTypes.MembershipConfirmation>,
    resolutions : List.List<ConfirmationTypes.MembershipConfirmationResolutionRecord>,
    confirmedRelationships : List.List<OwnershipTypes.Relationship>,
    familyId : ConfirmationTypes.FamilyId,
    membershipId : Nat,
    caller : Principal,
  ) : ConfirmationTypes.MembershipConfirmationApplicantView {
    let state = confirmationStateForMembership(confirmations, resolutions, familyId, membershipId);
    let mine = getConfirmationByConfirmer(confirmations, familyId, membershipId, caller);
    let myRelationship = switch (mine) {
      case (?c) {
        switch (c.relationshipId) {
          case (?relationshipId) {
            switch (confirmedRelationships.find(func r = r.familyId == familyId and r.id == relationshipId)) {
              case (?r) ?simpleRelationshipLabel(r.relationshipType);
              case null null;
            };
          };
          case null null;
        };
      };
      case null null;
    };
    {
      state;
      myDecision = switch (mine) { case (?c) ?c.decision; case null null };
      myRelationship;
      myDecidedAt = switch (mine) { case (?c) ?c.updatedAt; case null null };
      createdAt = switch (mine) { case (?c) ?c.createdAt; case null null };
      updatedAt = switch (mine) { case (?c) ?c.updatedAt; case null null };
    };
  };

  /// Maps a stored relationship type to the SIMPLE relationship label
  /// (Parent/Child, Sibling, SpousePartner). Sensitive relationship context
  /// (Biological/Adoptive/Foster/Step/Guardian) is never represented or
  /// surfaced.
  public func simpleRelationshipLabel(
    relationshipType : OwnershipTypes.RelationshipType,
  ) : ConfirmationTypes.SimpleRelationshipType {
    switch (relationshipType) {
      case (#Parent) #Parent;
      case (#Child) #Child;
      case (#Sibling) #Sibling;
      case (#SpousePartner) #SpousePartner;
    };
  };

  /// Rolls back a just-recorded confirmation decision after a failed
  /// membership transition, restoring the confirmer's prior decision (or
  /// removing the new record when there was none). Keeps the confirmation list
  /// consistent with the unchanged membership state.
  func rollbackConfirmation(
    confirmations : List.List<ConfirmationTypes.MembershipConfirmation>,
    familyId : ConfirmationTypes.FamilyId,
    membershipId : Nat,
    confirmerAccountId : Principal,
    previous : ?ConfirmationTypes.MembershipConfirmation,
  ) {
    let snapshot = confirmations.toArray();
    confirmations.clear();
    for (c in snapshot.values()) {
      if (c.familyId == familyId and c.membershipId == membershipId and c.confirmerAccountId == confirmerAccountId) {
        switch (previous) {
          case (?p) { confirmations.add(p) };
          case null {};
        };
      } else {
        confirmations.add(c);
      };
    };
  };

  /// Computes the next confirmation id: one greater than the largest existing
  /// id, or `0` when there are no confirmations.
  func confirmationStateNextId(
    confirmations : List.List<ConfirmationTypes.MembershipConfirmation>,
  ) : Nat {
    var maxId = 0;
    for (c in confirmations.toArray().values()) {
      if (c.id >= maxId) { maxId := c.id + 1 };
    };
    maxId;
  };

  /// Inserts or replaces the stored confirmation with the same id, preserving
  /// list order. A first-time record (an id not yet present) is appended, so a
  /// new decision is never silently dropped; an existing confirmer's record is
  /// updated in place, preserving at most one active decision per confirmer per
  /// membership.
  func replaceConfirmation(
    confirmations : List.List<ConfirmationTypes.MembershipConfirmation>,
    updated : ConfirmationTypes.MembershipConfirmation,
  ) {
    let snapshot = confirmations.toArray();
    confirmations.clear();
    var replaced = false;
    for (c in snapshot.values()) {
      if (c.id == updated.id) {
        confirmations.add(updated);
        replaced := true;
      } else {
        confirmations.add(c);
      };
    };
    if (not replaced) {
      confirmations.add(updated);
    };
  };

  /// Renders a confirmation decision variant as its tag text for OQL rows.
  func decisionText(decision : ConfirmationTypes.ConfirmationDecision) : Text {
    switch (decision) {
      case (#Confirmed) "Confirmed";
      case (#Disputed) "Disputed";
    };
  };
};
