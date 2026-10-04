import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import ConfirmationTypes "../types/membership-confirmation";
import MembershipTypes "../types/family-membership";
import OwnershipTypes "../types/ownership";
import GovernanceTypes "../types/governance";
import ConfirmationLib "../lib/membership-confirmation";
import MembershipLib "../lib/family-membership";
import StewardAuthorityLib "../lib/steward-authority";

/// Public MembershipConfirmation API (Onboarding Phase 1D): trusted-relative
/// confirmation of a `#Pending` FamilyMembership.
///
/// Every endpoint is family-scoped and evaluates authority against the requested
/// `familyId`; a membership, relationship, or Steward role in one family never
/// grants access in another.
///
/// Confirmation data is not public directory data. Reads are split by audience:
/// the applicant-facing read returns a redacted view that never exposes a
/// confirmer account principal, sensitive relationship context, private notes,
/// or unrelated profile information; the Steward-authorized read returns the
/// full family-scoped record. Confirmation APIs expose only simple relationship
/// labels and never sensitive relationship context
/// (Biological/Adoptive/Foster/Step/Guardian).
mixin (
  confirmations : List.List<ConfirmationTypes.MembershipConfirmation>,
  resolutions : List.List<ConfirmationTypes.MembershipConfirmationResolutionRecord>,
  memberships : List.List<MembershipTypes.FamilyMembership>,
  profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
  claims : List.List<OwnershipTypes.ProfileClaim>,
  confirmedRelationships : List.List<OwnershipTypes.Relationship>,
  stewards : List.List<GovernanceTypes.StewardRecord>,
) {
  /// Records the signed-in caller's trusted-relative decision about a membership
  /// in `familyId`. A decision is accepted when the membership is `#Pending`, or
  /// when it is `#Active` and the confirmation case shows it was activated by
  /// relative confirmation and has not been finally resolved by a Steward. The
  /// confirmer identity and the qualifying relationship are derived server-side;
  /// the caller can never spoof another confirmer. Anonymous callers get
  /// `#err(#NotSignedIn)`.
  public shared ({ caller }) func confirmPendingMembership(
    familyId : ConfirmationTypes.FamilyId,
    membershipId : Nat,
    decision : ConfirmationTypes.ConfirmationDecision,
  ) : async Result.Result<ConfirmationTypes.MembershipConfirmation, ConfirmationTypes.MembershipConfirmationError> {
    ConfirmationLib.submitConfirmationForFamily(
      confirmations,
      resolutions,
      memberships,
      profiles,
      claims,
      confirmedRelationships,
      familyId,
      membershipId,
      caller,
      decision,
    );
  };

  /// Resolves an escalated confirmation case for `membershipId` in `familyId`.
  /// Steward of `familyId` only; anonymous callers get `#err(#NotSignedIn)` and
  /// non-Stewards get `#err(#NotSteward)`. `#Approve` activates a `#Pending`
  /// membership or restores a membership suspended by this confirmation dispute
  /// back to `#Active`; `#Reject` leaves the membership non-`#Active` with a
  /// resolved rejection recorded; `#NeedsMoreInformation` leaves the membership
  /// `#Pending` or `#Suspended` and the case open.
  public shared ({ caller }) func resolveMembershipConfirmation(
    familyId : ConfirmationTypes.FamilyId,
    membershipId : Nat,
    resolution : ConfirmationTypes.MembershipConfirmationResolution,
  ) : async Result.Result<MembershipTypes.FamilyMembership, ConfirmationTypes.MembershipConfirmationError> {
    ConfirmationLib.resolveConfirmationForFamily(
      confirmations,
      resolutions,
      memberships,
      stewards,
      familyId,
      membershipId,
      caller,
      resolution,
    );
  };

  /// Returns the REDACTED, applicant-safe confirmation view for `membershipId`
  /// in `familyId`: the derived case state, the caller's own decision and simple
  /// relationship label, and timestamps. It never exposes a confirmer account
  /// principal, sensitive relationship context, private notes, or unrelated
  /// profile information. Allowed only when the caller is the pending
  /// membership's own account; anonymous callers get `#err(#NotSignedIn)` and
  /// any other caller gets `#err(#NotAuthorized)`. A confirmation in another
  /// family is never returned.
  public query ({ caller }) func getMyMembershipConfirmationState(
    familyId : ConfirmationTypes.FamilyId,
    membershipId : Nat,
  ) : async Result.Result<ConfirmationTypes.MembershipConfirmationApplicantView, ConfirmationTypes.MembershipConfirmationError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    let membership = switch (MembershipLib.getMembershipByIdForFamily(memberships, familyId, membershipId)) {
      case (?m) m;
      case null { return #err(#MembershipNotFound) };
    };
    if (membership.accountId != caller) {
      return #err(#NotAuthorized);
    };
    #ok(ConfirmationLib.applicantViewForMembership(
      confirmations,
      resolutions,
      confirmedRelationships,
      familyId,
      membershipId,
      caller,
    ));
  };

  /// Returns the FULL, Steward-authorized confirmation record for `membershipId`
  /// in `familyId`: the derived case state, every recorded decision, and any
  /// persisted Steward resolution. Allowed only when the caller is an active
  /// Steward of `familyId`; anonymous callers get `#err(#NotSignedIn)` and any
  /// other caller gets `#err(#NotAuthorized)`. Confirmations and resolutions
  /// from other families are never returned.
  public query ({ caller }) func getMembershipConfirmationStateForSteward(
    familyId : ConfirmationTypes.FamilyId,
    membershipId : Nat,
  ) : async Result.Result<(ConfirmationTypes.MembershipConfirmationState, [ConfirmationTypes.MembershipConfirmation], ?ConfirmationTypes.MembershipConfirmationResolutionRecord), ConfirmationTypes.MembershipConfirmationError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      return #err(#NotAuthorized);
    };
    switch (MembershipLib.getMembershipByIdForFamily(memberships, familyId, membershipId)) {
      case (?_) {};
      case null { return #err(#MembershipNotFound) };
    };
    let state = ConfirmationLib.confirmationStateForMembership(confirmations, resolutions, familyId, membershipId);
    let decisions = ConfirmationLib.listConfirmationsForMembership(confirmations, familyId, membershipId);
    let resolution = ConfirmationLib.getResolutionForFamily(resolutions, familyId, membershipId);
    #ok((state, decisions, resolution));
  };

  /// Returns the privacy-safe list of confirmation requests the signed-in caller
  /// is currently eligible to act on in `familyId`.
  ///
  /// The caller is derived server-side; the frontend never passes a confirmer
  /// account, confirmer person, or relationship id. Eligibility is computed from
  /// the caller's own `#Active` `FamilyMembership` in `familyId`, the caller's
  /// `personId`, the confirmed relationships in `familyId`, and the target
  /// membership's state — never from notification message text.
  ///
  /// Returns only actionable cases: `#Pending` memberships awaiting
  /// trusted-relative confirmation, and `#Active` memberships approved by a
  /// relative that remain challengeable under the 1D-H rule. Excludes
  /// self-confirmation, cases the caller has already decided, other-family
  /// memberships, Steward-resolved cases, `#Left` memberships, unrelated
  /// `#Suspended` memberships, and cases with no qualifying relationship.
  ///
  /// Each returned `EligibleMembershipConfirmationView` carries only the family
  /// id, membership id, pending person id, display name, optional profile photo,
  /// optional birth year, the simple relationship label, and the derived case
  /// state. It never exposes an applicant or confirmer account principal, raw
  /// relationship context, sensitive relationship metadata, private profile
  /// notes, or unrelated family data. Anonymous callers get
  /// `#err(#NotSignedIn)`; a caller with no `#Active` membership in `familyId`
  /// gets `#err(#NoActiveMembership)`.
  public query ({ caller }) func listMyEligibleMembershipConfirmationsForFamily(
    familyId : ConfirmationTypes.FamilyId,
  ) : async Result.Result<[ConfirmationTypes.EligibleMembershipConfirmationView], ConfirmationTypes.MembershipConfirmationError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    switch (MembershipLib.getMembershipForFamily(memberships, familyId, caller)) {
      case (?m) {
        if (m.status != #Active) {
          return #err(#NoActiveMembership);
        };
      };
      case null { return #err(#NoActiveMembership) };
    };
    #ok(ConfirmationLib.listEligibleConfirmationsForFamily(
      confirmations,
      resolutions,
      memberships,
      profiles,
      confirmedRelationships,
      familyId,
      caller,
    ));
  };

  /// Returns the privacy-safe list of unresolved confirmation cases in
  /// `familyId` that require Steward review.
  ///
  /// Allowed only when the caller is an active Steward of `familyId`; anonymous
  /// callers get `#err(#NotSignedIn)` and any other caller gets
  /// `#err(#NotAuthorized)`. The caller identity is derived server-side from the
  /// query `{ caller }` parameter, never from a caller-supplied id, and a Steward
  /// of another family cannot read this family's cases.
  ///
  /// Only cases whose derived confirmation state is `#StewardReviewRequired`
  /// (a conflicting `#Confirmed` + `#Disputed`) or `#RejectedByRelative` (a
  /// standalone trusted-relative rejection/dispute) are returned;
  /// `#ResolvedBySteward`, `#ApprovedByRelative`, and `#AwaitingConfirmation`
  /// cases are excluded. Each
  /// `MembershipConfirmationReviewView` carries only the family id, membership
  /// id, pending person id, applicant display name, the simple relationship
  /// label, the membership status, the confirmation/dispute history (each entry
  /// with a simple relationship label, a server-resolved confirmer display name,
  /// the decision, and the decision timestamp), the confirmed/disputed counts,
  /// and the derived case state. It never exposes an applicant or confirmer
  /// account principal, a confirmer person id, a relationship id, raw
  /// relationship context, sensitive relationship metadata, private profile
  /// notes, or unrelated family data.
  public query ({ caller }) func listMembershipConfirmationReviewsForSteward(
    familyId : ConfirmationTypes.FamilyId,
  ) : async Result.Result<[ConfirmationTypes.MembershipConfirmationReviewView], ConfirmationTypes.MembershipConfirmationError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      return #err(#NotAuthorized);
    };
    #ok(ConfirmationLib.listReviewsForSteward(
      confirmations,
      resolutions,
      memberships,
      profiles,
      confirmedRelationships,
      familyId,
    ));
  };

  /// Returns the signed-in caller's own recorded decision for `membershipId` in
  /// `familyId`, or `null` when the caller has not decided. Anonymous callers
  /// get `#err(#NotSignedIn)`.
  public query ({ caller }) func getMyConfirmationForMembership(
    familyId : ConfirmationTypes.FamilyId,
    membershipId : Nat,
  ) : async Result.Result<?ConfirmationTypes.MembershipConfirmation, ConfirmationTypes.MembershipConfirmationError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    #ok(ConfirmationLib.getConfirmationByConfirmer(confirmations, familyId, membershipId, caller));
  };
};
