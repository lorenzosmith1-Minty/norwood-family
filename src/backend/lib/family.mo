import List "mo:core/List";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Time "mo:core/Time";
import Types "../types/family";

module {
  /// Returns the family with the given id, or `null` when it is not tracked.
  /// This is a read-only lookup — it never creates a family.
  public func getFamily(
    families : Map.Map<Types.FamilyId, Types.Family>,
    familyId : Types.FamilyId,
  ) : ?Types.Family {
    families.get(familyId);
  };

  /// Ensures the single default family exists, creating it only when missing.
  /// Repeated calls are idempotent: an existing default family is never
  /// overwritten, duplicated, or reset. Returns `true` when the family was
  /// created by this call.
  public func ensureDefaultFamily(
    families : Map.Map<Types.FamilyId, Types.Family>,
    createdBy : Principal.Principal,
  ) : Bool {
    switch (families.get(Types.DEFAULT_FAMILY_ID)) {
      case (?_) { false };
      case null {
        families.add(Types.DEFAULT_FAMILY_ID, {
          id = Types.DEFAULT_FAMILY_ID;
          displayName = Types.DEFAULT_FAMILY_DISPLAY_NAME;
          createdAt = Time.now();
          createdBy;
          status = #active;
        });
        true;
      };
    };
  };

  /// Builds a canonical, safe family id for a newly created family.
  ///
  /// The id is a slug of `displayName` (lowercased, every run of
  /// non-alphanumeric characters collapsed to a single hyphen, trimmed of
  /// leading/trailing hyphens, length-capped) plus a unique suffix. The suffix
  /// is derived from `nonce` and a deterministic hash of the caller principal,
  /// so two families with the same display name receive distinct ids and the
  /// id is never derived from the display name alone. The raw principal text is
  /// never embedded in the id.
  ///
  /// The generator is pure and deterministic given its inputs. It checks the
  /// existing `families` map for a collision and extends the suffix until the
  /// id is free, so the returned id is unique against current state.
  public func generateFamilyId(
    families : Map.Map<Types.FamilyId, Types.Family>,
    displayName : Text,
    caller : Principal.Principal,
    nonce : Nat,
  ) : Types.FamilyId {
    let base = slug(displayName);
    let suffix = suffixFor(caller, nonce);
    var candidate = base # "-" # suffix;
    var attempt = 0;
    while (families.get(candidate) != null) {
      attempt += 1;
      candidate := base # "-" # suffix # "-" # attempt.toText();
    };
    candidate;
  };

  /// Flattens every family into OQL-exposable rows.
  public func familyRows(
    families : Map.Map<Types.FamilyId, Types.Family>,
  ) : [Types.Family] {
    let rows = List.empty<Types.Family>();
    for ((_, family) in families.entries()) {
      rows.add(family);
    };
    rows.toArray();
  };

  /// Lowercases `text`, collapses every run of non-alphanumeric characters to a
  /// single hyphen, trims leading/trailing hyphens, and caps the length. Falls
  /// back to `"family"` when the display name yields nothing usable, so the
  /// slug is always a non-empty URL/storage-safe token.
  func slug(text : Text) : Text {
    let lowered = text.toLower();
    var out = "";
    var pendingHyphen = false;
    for (c in lowered.chars()) {
      if (isSlugChar(c)) {
        if (out.size() >= 40) {
          // Length cap reached: stop extending the slug.
          pendingHyphen := false;
        } else {
          if (pendingHyphen and out != "") {
            out := out # "-";
          };
          pendingHyphen := false;
          out := out # c.toText();
        };
      } else {
        pendingHyphen := true;
      };
    };
    if (out == "") { "family" } else { out };
  };

  /// Whether `c` is a lowercase letter or a digit — the only characters kept in
  /// a family-id slug.
  func isSlugChar(c : Char) : Bool {
    (c >= 'a' and c <= 'z') or (c >= '0' and c <= '9');
  };

  /// A deterministic, URL/storage-safe suffix derived from the caller principal
  /// and a nonce. The principal is hashed, never embedded as text, so the id
  /// never exposes an internal account principal.
  func suffixFor(caller : Principal.Principal, nonce : Nat) : Text {
    var h : Nat = 5381;
    for (b in caller.toBlob().values()) {
      h := (h * 33 + b.toNat()) % 1_000_000_007;
    };
    let mixed = (h * 1_000_003 + nonce) % 1_000_000_007;
    mixed.toText();
  };
};
