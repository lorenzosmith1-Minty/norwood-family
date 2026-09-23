import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Types "../types/research-intake";
import OwnershipTypes "../types/ownership";
import FamilyTypes "../types/family";
import TenancyLib "tenancy";

/// Tenancy 1C-B2-B2 canonical family-scoped New Person Candidate domain logic.
///
/// Every function here takes an explicit `familyId` and only ever considers a
/// `NewPersonCandidate` whose `familyId` equals it. A `candidateId` alone is
/// never a tenant boundary: a lookup that finds a candidate belonging to another
/// family behaves exactly like a lookup that found nothing. The API mixin owns
/// authorization and state wiring; this module is pure over the injected
/// collections.
module {
  /// Whether a New Person candidate belongs to `familyId`. The single
  /// family-boundary predicate every family-scoped candidate read and review
  /// funnels through.
  public func belongsToFamily(candidate : Types.NewPersonCandidate, familyId : Text) : Bool {
    candidate.familyId == familyId;
  };

  /// Lists every New Person candidate in `familyId`. A candidate whose
  /// `familyId` differs is never returned, so Family A candidates never appear
  /// in a Family B call.
  public func listForFamily(
    candidates : List.List<Types.NewPersonCandidate>,
    familyId : Text,
  ) : [Types.NewPersonCandidate] {
    candidates.toArray().filter(func c = belongsToFamily(c, familyId));
  };

  /// Returns the candidate with `id` when it belongs to `familyId`, or `null`
  /// otherwise. A record that exists under another family is never returned.
  public func getForFamily(
    candidates : List.List<Types.NewPersonCandidate>,
    familyId : Text,
    id : Nat,
  ) : ?Types.NewPersonCandidate {
    candidates.find(func c = c.id == id and belongsToFamily(c, familyId));
  };

  /// Creates a new New Person candidate in `familyId` and appends it to the
  /// collection. The candidate enters as `#Pending` and its stored `familyId` is
  /// the requested `familyId`.
  public func createForFamily(
    candidates : List.List<Types.NewPersonCandidate>,
    nextId : { var next : Nat },
    familyId : Text,
    name : Text,
    details : Text,
    sourceId : Types.SourceId,
    submittedBy : Principal,
    now : Int,
  ) : Types.NewPersonCandidate {
    let id = nextId.next;
    nextId.next += 1;
    let candidate : Types.NewPersonCandidate = {
      familyId;
      id;
      name;
      details;
      sourceId;
      status = #Pending;
      submittedBy;
      submittedAt = now;
      reviewedBy = null;
      reviewedAt = null;
    };
    candidates.add(candidate);
    candidate;
  };

  /// Approves the pending candidate with `id` in `familyId`, transitioning it to
  /// `#Approved`. Returns the updated candidate, or `null` when no pending
  /// candidate with that id belongs to `familyId`.
  public func approveForFamily(
    candidates : List.List<Types.NewPersonCandidate>,
    familyId : Text,
    id : Nat,
    reviewer : Principal,
    now : Int,
  ) : ?Types.NewPersonCandidate {
    transitionForFamily(candidates, familyId, id, #Approved, reviewer, now);
  };

  /// Rejects the pending candidate with `id` in `familyId`, transitioning it to
  /// `#Rejected`. Returns the updated candidate, or `null` when no pending
  /// candidate with that id belongs to `familyId`.
  public func rejectForFamily(
    candidates : List.List<Types.NewPersonCandidate>,
    familyId : Text,
    id : Nat,
    reviewer : Principal,
    now : Int,
  ) : ?Types.NewPersonCandidate {
    transitionForFamily(candidates, familyId, id, #Rejected, reviewer, now);
  };

  /// Marks the pending candidate with `id` in `familyId` as `#NeedsResearch`.
  /// Returns the updated candidate, or `null` when no pending candidate with
  /// that id belongs to `familyId`.
  public func needsResearchForFamily(
    candidates : List.List<Types.NewPersonCandidate>,
    familyId : Text,
    id : Nat,
    reviewer : Principal,
    now : Int,
  ) : ?Types.NewPersonCandidate {
    transitionForFamily(candidates, familyId, id, #NeedsResearch, reviewer, now);
  };

  /// Transitions the pending candidate with `id` in `familyId` to `status`,
  /// recording the reviewer and timestamp. A candidate whose `familyId` differs
  /// is never touched, so a `candidateId` alone cannot cross a family boundary.
  /// Returns the updated candidate, or `null` when no pending candidate with
  /// that id belongs to `familyId`.
  public func transitionForFamily(
    candidates : List.List<Types.NewPersonCandidate>,
    familyId : Text,
    id : Nat,
    status : Types.ReviewStatus,
    reviewer : Principal,
    now : Int,
  ) : ?Types.NewPersonCandidate {
    var updated : ?Types.NewPersonCandidate = null;
    let snapshot = candidates.toArray();
    candidates.clear();
    for (c in snapshot.values()) {
      if (c.id == id and belongsToFamily(c, familyId) and c.status == #Pending) {
        let transitioned : Types.NewPersonCandidate = {
          c with
          status;
          reviewedBy = ?reviewer;
          reviewedAt = ?now;
        };
        candidates.add(transitioned);
        updated := ?transitioned;
      } else {
        candidates.add(c);
      };
    };
    updated;
  };

  /// Derives a deterministic personId from a candidate's name: lower-cases,
  /// keeps only alphanumeric characters, and concatenates the words (e.g.
  /// "Lorenzo Smith Jr." -> "lorenzosmithjr").
  public func personIdFromName(name : Text) : Text {
    let words = List.empty<Text>();
    for (word in name.toLower().tokens(#predicate (func ch = ch.isWhitespace()))) {
      var clean = "";
      for (ch in word.chars()) {
        if (ch.isAlphabetic() or ch.isDigit()) {
          clean := clean # ch.toText();
        };
      };
      if (clean.size() > 0) {
        words.add(clean);
      };
    };
    words.toArray().values().join("");
  };

  /// Returns a personId derived from the candidate's name that is guaranteed not
  /// to collide with an existing canonical Person record **in `familyId`**. The
  /// collision check is family-qualified through `TenancyLib.getProfileForFamily`,
  /// so a same-personId profile in another family never blocks the new id and a
  /// new profile never overwrites a same-personId profile in another family.
  public func uniquePersonIdForFamily(
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    familyId : FamilyTypes.FamilyId,
    name : Text,
  ) : Text {
    let base = personIdFromName(name);
    var candidate = base;
    var suffix = 1;
    while (TenancyLib.getProfileForFamily(profiles, familyId, candidate) != null) {
      candidate := base # suffix.toText();
      suffix += 1;
    };
    candidate;
  };

  /// Creates exactly one canonical Person record (PersonProfile) from an
  /// approved New Person candidate, in the candidate's own `familyId`, using the
  /// family-qualified profile storage (`TenancyLib.putProfileForFamily`). The
  /// candidate's Source/provenance is preserved on the candidate record. The new
  /// profile is unclaimed and living by default. A candidate from Family A never
  /// creates or alters a Family B profile.
  public func createCanonicalPersonForFamily(
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    candidate : Types.NewPersonCandidate,
    familyId : FamilyTypes.FamilyId,
  ) {
    let personId = uniquePersonIdForFamily(profiles, familyId, candidate.name);
    let profile : OwnershipTypes.PersonProfile = {
      familyId;
      personId;
      name = candidate.name;
      livingStatus = #Living;
      claimStatus = #Unclaimed;
      claimedByUserId = null;
      preferredName = null;
      firstName = null;
      middleName = null;
      lastName = null;
      suffix = null;
      nickname = null;
      story = null;
      shortBio = null;
      longerStory = null;
      occupation = null;
      birthInfo = null;
      birthDate = null;
      birthplace = null;
      currentLocation = null;
      timeline = null;
      privacySettings = null;
    };
    TenancyLib.putProfileForFamily(profiles, familyId, profile);
  };

  /// Whether a candidate's name/details duplicate an existing canonical Person
  /// profile **in `familyId`**. Comparison is family-scoped: only profiles whose
  /// `familyId` equals `familyId` are considered, so a same name/person details
  /// in another family never blocks approval. Empty/missing comparison fields
  /// continue to follow the existing duplicate-profile rules: an empty candidate
  /// name never matches, and an empty candidate `details` constrains the match
  /// by name alone rather than matching every profile.
  public func isDuplicateInFamily(
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    familyId : FamilyTypes.FamilyId,
    name : Text,
    details : Text,
  ) : Bool {
    let cleanName = name.toLower();
    if (cleanName == "") {
      return false;
    };
    let cleanDetails = details.toLower();
    profiles.any(func(_, profile) =
      profile.familyId == familyId and
      profile.name.toLower() == cleanName and
      (cleanDetails == "" or (profile.shortBio ?? "").toLower() == cleanDetails)
    );
  };

};
