import List "mo:core/List";
import Map "mo:core/Map";
import Result "mo:core/Result";
import FamilyTypes "../types/family";
import OwnershipTypes "../types/ownership";
import MembershipTypes "../types/family-membership";
import CreationTypes "../types/family-creation";
import FamilyCreationLib "../lib/family-creation";

/// Public API for the canonical zero-to-family creation transaction.
///
/// `createFamilyWithFounder` is the foundation of onboarding: it creates a new
/// family, the founder's first person profile inside it, and an `#Active`
/// membership linking the authenticated caller to that profile — in one atomic
/// step. It intentionally does NOT assign Stewardship; Steward selection is a
/// later onboarding phase.
///
/// The caller does not need to belong to any existing family, and an account
/// that already belongs to another family (including Norwood) can create a new
/// family without changing its existing membership or data.
mixin (
  families : Map.Map<FamilyTypes.FamilyId, FamilyTypes.Family>,
  profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
  memberships : List.List<MembershipTypes.FamilyMembership>,
  familyCreationIdempotency : Map.Map<Text, Text>,
  familyCreationState : { var nextFamilyNonce : Nat },
) {
  /// Creates a brand-new family with the authenticated caller as its founder.
  ///
  /// The transaction creates exactly three linked records: the `Family`, the
  /// founder's `PersonProfile` inside that family, and an `#Active`
  /// `FamilyMembership` linking the caller to the founder profile. It returns
  /// all three together so a later onboarding UI can continue.
  ///
  /// Anonymous callers receive `#err(#NotSignedIn)`. A blank display name or a
  /// missing first/last name receives `#err(#InvalidInput)`; nothing is created
  /// in either case. The founder account is always the authenticated caller —
  /// there is no account parameter, so a caller can never name another account
  /// as founder.
  ///
  /// `idempotencyKey` is REQUIRED and must be non-empty. When it was already
  /// used by this caller, the previously created family/profile/membership are
  /// returned instead of creating duplicate records, so a retried or
  /// double-submitted onboarding attempt is safe. A blank or whitespace-only key
  /// receives `#err(#InvalidInput)` and creates nothing, so the canonical
  /// creation path can never create a family without retry protection.
  ///
  /// No `StewardRecord` is created by this operation.
  public shared ({ caller }) func createFamilyWithFounder(
    displayName : Text,
    input : CreationTypes.FounderProfileInput,
    idempotencyKey : Text,
  ) : async Result.Result<CreationTypes.FamilyCreationResult, CreationTypes.FamilyCreationError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    let outcome = FamilyCreationLib.createFamilyWithFounder(
      families,
      profiles,
      memberships,
      familyCreationIdempotency,
      caller,
      displayName,
      input,
      idempotencyKey,
      familyCreationState.nextFamilyNonce,
    );
    // Advance the family-creation nonce only when a NEW family was actually
    // created; an idempotent replay returns the original records and must not
    // consume a nonce.
    if (outcome.created) {
      familyCreationState.nextFamilyNonce += 1;
    };
    outcome.result;
  };
};
