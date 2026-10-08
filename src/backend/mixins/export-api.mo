import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Time "mo:core/Time";
import ExportTypes "../types/export";
import OwnershipTypes "../types/ownership";
import MembershipTypes "../types/family-membership";
import ArchiveTypes "../types/archive";
import ObjectStorageTypes "../types/object-storage";
import FamilyHistoryTypes "../types/family-history";
import RecipeTypes "../types/recipes";
import RecoveryTypes "../types/recovery";
import ResearchTypes "../types/research-intake";
import GovernanceTypes "../types/governance";
import FamilyTypes "../types/family";
import ExportLib "../lib/export";

/// Public Phase 5A Data Export / Portability API.
///
/// Two read-only export endpoints:
///
/// - `exportMyData(familyId)` — the authenticated requester's own Norwood
///   identity data in `familyId`. The caller's own Person/Profile is resolved
///   server-side; a caller-supplied person id is never accepted, so a known id
///   cannot bypass authorization.
/// - `exportFamilyArchive(familyId)` — the portable family-history dataset of
///   `familyId`, available only to an active Family Steward of that family.
///
/// Every export is family-scoped: a Family A export never includes Family B
/// data, and a known family id never bypasses authorization. The export
/// operation is read-only with respect to family/profile/archive data — the
/// only write is the export audit entry.
///
/// Portable record references are assigned from an export-local namespace: each
/// export builds its own reference tables and emits sequential tokens
/// (`person-1`, `membership-1`, …). Internal ids are used only to look up the
/// export-local token and are never serialized or encoded into a portable
/// reference, so the original internal id cannot be recovered from the output.
///
/// Every attempt (success AND failure) is recorded in the export audit history
/// with the scope, family, requesting account, timestamp, and status. The
/// exported payload itself is never stored in audit history.
mixin (
  exportAudit : List.List<ExportTypes.ExportAuditEntry>,
  exportInstances : List.List<ExportTypes.ExportInstance>,
  exportMediaBindings : List.List<ExportTypes.ExportMediaBinding>,
  families : Map.Map<FamilyTypes.FamilyId, FamilyTypes.Family>,
  profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
  claims : List.List<OwnershipTypes.ProfileClaim>,
  memberships : List.List<MembershipTypes.FamilyMembership>,
  confirmedRelationships : List.List<OwnershipTypes.Relationship>,
  archiveItems : List.List<ArchiveTypes.ArchiveItem>,
  stories : List.List<FamilyHistoryTypes.Story>,
  recipes : List.List<RecipeTypes.Recipe>,
  recoveryRequests : List.List<RecoveryTypes.RecoveryRequest>,
  recoveryVerifications : List.List<RecoveryTypes.RecoveryVerification>,
  researchSources : List.List<ResearchTypes.SourceRecord>,
  galleries : Map.Map<ObjectStorageTypes.PersonId, ObjectStorageTypes.PhotoGallery>,
  stewards : List.List<GovernanceTypes.StewardRecord>,
) {
  /// Exports the authenticated requester's own Norwood identity data in
  /// `familyId`.
  ///
  /// Authorization: only the authenticated requester's own data is included.
  /// Anonymous callers get `#err(#NotSignedIn)`. The caller's own Person/Profile
  /// is resolved in `familyId` via the family-scoped profile seam; a caller with
  /// no profile in this family gets `#err(#NotAuthorized)`. A caller-supplied
  /// person id is never accepted, so a known id cannot bypass authorization.
  ///
  /// Inclusion: the caller's own profile projection, their family memberships,
  /// relationships involving their Person/Profile, archive/history items
  /// authored by or attached to their profile, their own uploaded media
  /// metadata, and their own recovery history/status.
  ///
  /// Exclusion: other users' account principals, others' private recovery
  /// information, Steward-only governance records, secrets/tokens, and
  /// authentication-provider data.
  ///
  /// Read-only: no family/profile/archive data is mutated. The only write is the
  /// export audit entry recording the attempt.
  public shared ({ caller }) func exportMyData(
    familyId : FamilyTypes.FamilyId,
  ) : async Result.Result<ExportTypes.ExportEnvelope, ExportTypes.ExportError> {
    let result = ExportLib.buildMyDataExport(
      profiles,
      claims,
      memberships,
      confirmedRelationships,
      archiveItems,
      stories,
      recipes,
      recoveryRequests,
      recoveryVerifications,
      galleries,
      families.values().toList(),
      caller,
      familyId,
    );
    recordExportAudit(familyId, #MyData, caller, result);
    result;
  };

  /// Exports the portable FamilyArchive dataset of `familyId`.
  ///
  /// Authorization: requires an active Family Steward of `familyId`
  /// (`StewardAuthorityLib.isActiveStewardForFamily`). Anonymous callers get
  /// `#err(#NotSignedIn)`; a non-Steward, or a Steward of another family, gets
  /// `#err(#NotSteward)`. A known family id never bypasses authorization.
  ///
  /// Inclusion: family metadata, Person/Profile records, family relationships,
  /// archive/history entries, family stories, sources, photo/media metadata, and
  /// recipes/oral-history metadata present in that family.
  ///
  /// Exclusion: authentication credentials, invite tokens, recovery secrets,
  /// internal authorization secrets, raw account principals, and platform-only
  /// operational data.
  ///
  /// On success the result carries the existing versioned `envelope` plus an
  /// opaque `exportInstanceRef` that binds this generated manifest to later
  /// media retrieval. The reference reveals no family id, media/storage id,
  /// internal record id, or storage secret.
  ///
  /// Read-only with respect to family/profile/archive data. The writes are the
  /// export audit entry and the new export-instance mapping (instance record
  /// plus its media bindings).
  public shared ({ caller }) func exportFamilyArchive(
    familyId : FamilyTypes.FamilyId,
  ) : async Result.Result<ExportTypes.ExportFamilyArchiveResult, ExportTypes.ExportError> {
    // Bounded lazy cleanup: before minting a new export instance, drop any
    // expired instances and their media bindings so the temporary
    // export-retrieval mapping state cannot accumulate indefinitely. This
    // touches ONLY exportInstances/exportMediaBindings — never family archive
    // media, profile photos, archive items, export audit history, or media
    // bytes. No scheduler or background system is involved.
    ignore ExportLib.pruneExpiredExportInstances(exportInstances, exportMediaBindings, Time.now());
    let result = ExportLib.buildFamilyArchiveExport(
      profiles,
      memberships,
      confirmedRelationships,
      archiveItems,
      stories,
      researchSources,
      recipes,
      galleries,
      families.values().toList(),
      stewards,
      caller,
      familyId,
    );
    recordExportAudit(familyId, #FamilyArchive, caller, result);
    switch (result) {
      case (#err(e)) { #err(e) };
      case (#ok(envelope)) {
        // Bind this generated manifest to a fresh, opaque export instance so
        // later retrieval resolves media-N against THIS export, never a rebuilt
        // current manifest. The instance ref is a per-family counter token that
        // reveals no family id, media/storage id, internal record id, or secret.
        let exportInstanceRef = nextExportInstanceRef();
        let createdAt = Time.now();
        exportInstances.add(ExportLib.buildExportInstance(exportInstanceRef, familyId, createdAt));
        // Rebuild the exact source lists in the same order the manifest was
        // built (archive items first, then profile photos) so each media-N binds
        // to its exact source asset.
        let familyArchiveItems = ExportLib.archiveItemsForFamily(archiveItems, familyId);
        let familyProfilePhotos = ExportLib.profilePhotosForFamily(galleries, familyId);
        let bindings = ExportLib.buildExportMediaBindings(
          exportInstanceRef,
          familyId,
          familyArchiveItems,
          familyProfilePhotos,
        );
        for (binding in bindings.values()) {
          exportMediaBindings.add(binding);
        };
        #ok({ envelope; exportInstanceRef });
      };
    };
  };

  /// Retrieves the bytes of a single asset bound to a specific FamilyArchive
  /// export instance, for an active Family Steward of that instance's family.
  ///
  /// Authorization: requires an authenticated caller and an active Family
  /// Steward of the family recorded on the export instance. Anonymous callers
  /// get `#err(#NotSignedIn)`; a non-Steward, or a Steward of another family,
  /// gets `#err(#NotSteward)`. Possession of an export-instance reference alone
  /// never bypasses Steward authorization, and a Family A export instance never
  /// retrieves Family B assets.
  ///
  /// `exportInstanceRef` is the opaque reference returned by
  /// `exportFamilyArchive`; `mediaRef` is the export-local media token
  /// (`media-1`, `media-2`, …) from that instance's manifest. The token is
  /// resolved ONLY against the instance's stored bindings — never against a
  /// rebuilt current family-media manifest. An unknown instance gets
  /// `#err(#ExportInstanceNotFound)`; an expired instance gets
  /// `#err(#ExportInstanceExpired)`; a token not bound to that instance gets
  /// `#err(#MediaNotFound)`; a bound asset whose bytes are missing gets
  /// `#err(#MediaUnavailable)`.
  ///
  /// The asset's bytes are returned directly to the authorized caller for this
  /// call only. No public or permanent media URL is created and no storage
  /// secret is exposed.
  ///
  /// Read-only: no family/profile/archive/media data is mutated.
  public shared ({ caller }) func retrieveFamilyArchiveMedia(
    exportInstanceRef : ExportTypes.ExportInstanceRef,
    mediaRef : Text,
  ) : async Result.Result<ExportTypes.ExportMediaRetrieval, ExportTypes.ExportMediaRetrievalError> {
    // Bounded lazy cleanup: drop expired instances and their media bindings
    // before resolving, so retrieval never accumulates stale mapping state.
    // A ref that was expired and is pruned here resolves neutrally as
    // #ExportInstanceNotFound; a still-present expired ref resolves as
    // #ExportInstanceExpired. Neither path rebuilds against current media.
    ignore ExportLib.pruneExpiredExportInstances(exportInstances, exportMediaBindings, Time.now());
    ExportLib.retrieveFamilyArchiveMedia(
      exportInstances,
      exportMediaBindings,
      profiles,
      archiveItems,
      galleries,
      families.values().toList(),
      stewards,
      caller,
      exportInstanceRef,
      mediaRef,
    );
  };

  /// The next opaque export-instance reference: a single global monotonic
  /// counter token (`export-<n>`) over ALL export instances, regardless of
  /// family. A per-family counter would mint the same token (`export-1`) for two
  /// different families, and retrieval resolves an instance by ref alone, so a
  /// Family A steward presenting `export-1` could resolve to Family B's
  /// instance. A globally unique ref guarantees a generated instance always
  /// resolves to its own family's instance. It is a lookup key only and reveals
  /// no family id, media/storage id, internal record id, or storage secret.
  ///
  /// The counter is derived from the largest numeric suffix among the SURVIVING
  /// instances, not from the list size. The list size shrinks when
  /// `pruneExpiredExportInstances` removes expired instances, so a size-derived
  /// counter would re-emit a ref already held by a surviving active instance
  /// (for example, after `export-1` expires while `export-2`/`export-3` remain,
  /// the size is 2 and the next mint would be `export-3` again). Deriving from
  /// the maximum existing suffix keeps every minted ref strictly greater than
  /// every surviving ref, so a new instance is never shadowed by an older one
  /// and its media bindings stay reachable.
  func nextExportInstanceRef() : ExportTypes.ExportInstanceRef {
    var maxSuffix = 0;
    for (instance in exportInstances.values()) {
      switch (exportInstanceRefSuffix(instance.ref)) {
        case (?n) { if (n > maxSuffix) { maxSuffix := n } };
        case null {};
      };
    };
    "export-" # (maxSuffix + 1).toText();
  };

  /// Parses the numeric suffix of an export-instance ref (`"export-<n>"`).
  /// Returns `null` for a ref that does not carry the expected prefix or whose
  /// suffix is not a number, so an unexpected ref never corrupts the counter.
  func exportInstanceRefSuffix(ref : ExportTypes.ExportInstanceRef) : ?Nat {
    let prefix = "export-";
    if (not ref.startsWith(#text prefix)) {
      return null;
    };
    switch (ref.stripStart(#text prefix)) {
      case (?suffix) { suffix.toNat() };
      case null { null };
    };
  };

  /// Records an export audit entry for every attempt, success or failure.
  ///
  /// The entry captures the scope, family, requesting account, timestamp, and
  /// success/failure status. The exported payload is never stored. The audit
  /// write is the only mutation the export operation performs.
  func recordExportAudit(
    familyId : FamilyTypes.FamilyId,
    scope : ExportTypes.ExportScope,
    requester : Principal,
    result : Result.Result<ExportTypes.ExportEnvelope, ExportTypes.ExportError>,
  ) {
    let status : ExportTypes.ExportAuditStatus = switch (result) {
      case (#ok(_)) { #Succeeded };
      case (#err(_)) { #Failed };
    };
    exportAudit.add({
      familyId;
      id = nextExportAuditId(exportAudit);
      scope;
      requesterAccountId = requester;
      timestamp = Time.now();
      status;
    });
  };

  /// The next export audit id: one greater than the largest existing id, or `0`
  /// when the log is empty.
  func nextExportAuditId(audit : List.List<ExportTypes.ExportAuditEntry>) : Nat {
    var maxId = 0;
    var seen = false;
    for (entry in audit.values()) {
      if (not seen or entry.id >= maxId) {
        maxId := entry.id;
        seen := true;
      };
    };
    if (seen) { maxId + 1 } else { 0 };
  };
};
