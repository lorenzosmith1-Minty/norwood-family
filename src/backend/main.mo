import AccessControl "mo:caffeineai-authorization/access-control";
import MixinAuthorization "mo:caffeineai-authorization/MixinAuthorization";
import Expose "mo:caffeineai-oql/Expose";
import OQL "mo:caffeineai-oql";
import Entity "mo:caffeineai-oql/Entity";
import RecordValue "mo:caffeineai-oql/RecordValue";
import TextValue "mo:caffeineai-oql/TextValue";
import IntValue "mo:caffeineai-oql/IntValue";
import BoolValue "mo:caffeineai-oql/BoolValue";
import PrincipalValue "mo:caffeineai-oql/PrincipalValue";
import MixinObjectStorage "mo:caffeineai-object-storage/Mixin";
import Iter "mo:core/Iter";
import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Types "types/object-storage";
import ArchiveTypes "types/archive";
import OwnershipTypes "types/ownership";
import AccountIdentityTypes "types/account-identity";
import ObjectStorageLib "lib/object-storage";
import ArchiveLib "lib/archive";
import OwnershipLib "lib/ownership";
import AccountIdentityLib "lib/account-identity";
import ObjectStorageApi "mixins/object-storage-api";
import ArchiveApi "mixins/archive-api";
import OwnershipApi "mixins/ownership-api";
import RelationshipsApi "mixins/relationships-api";
import NotificationsApi "mixins/notifications-api";
import AccountIdentityApi "mixins/account-identity-api";
import ApiDocMixin "mixins/api-doc";

actor {
  let accessControlState : AccessControl.AccessControlState;
  let galleries : Map.Map<Types.PersonId, Types.PhotoGallery>;
  let archiveItems : List.List<ArchiveTypes.ArchiveItem>;
  let profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>;
  let claims : List.List<OwnershipTypes.ProfileClaim>;
  let relationshipRequests : List.List<OwnershipTypes.RelationshipRequest>;
  let confirmedRelationships : List.List<OwnershipTypes.Relationship>;
  let notifications : List.List<OwnershipTypes.Notification>;
  let accounts : Map.Map<AccountIdentityTypes.AccountId, AccountIdentityTypes.Account>;
  include MixinAuthorization(accessControlState, null);
  include Expose({
    entities = [
      OQL.Entity.build(
        OQL.Entity.new<Types.PhotoRow>(
          "photo",
          func() : Iter.Iter<Types.PhotoRow> = ObjectStorageLib.photoRows(galleries),
          "Photo",
          "key",
        )
        .sample({
          key = "";
          personId = "";
          id = 0;
          filename = "";
          mimeType = "";
          uploadedAt = 0;
          uploadedBy = Principal.fromText("aaaaa-aa");
          isProfilePhoto = false;
        })
        .controllerOnly(),
      ),
      OQL.Entity.manual<ArchiveTypes.ArchiveItemRow>(
        "archiveItem",
        func() : Iter.Iter<ArchiveTypes.ArchiveItemRow> = ArchiveLib.archiveRows(archiveItems),
        "ArchiveItem",
        "id",
      )
      .sample({
        id = 0;
        title = "";
        itemType = "";
        era = "";
        year = null;
        contributor = Principal.fromText("aaaaa-aa");
        sourceStatus = "";
        privacyLevel = "";
        status = "";
        createdAt = 0;
      })
      .payload("id", func r = r.id)
      .payload("title", func r = r.title)
      .payload("itemType", func r = r.itemType)
      .payload("era", func r = r.era)
      .payload("year", func r = r.year ?? 0)
      .payload("contributor", func r = r.contributor)
      .payload("sourceStatus", func r = r.sourceStatus)
      .payload("privacyLevel", func r = r.privacyLevel)
      .payload("status", func r = r.status)
      .payload("createdAt", func r = r.createdAt)
      .controllerOnly()
      .build(),
      OQL.Entity.new<OwnershipTypes.ProfileRow>(
        "profile",
        func() : Iter.Iter<OwnershipTypes.ProfileRow> = OwnershipLib.profileRows(profiles),
        "PersonProfile",
        "personId",
      )
      .sample({
        personId = "";
        name = "";
        livingStatus = "";
        claimStatus = "";
        claimedByUserId = "";
        preferredName = "";
        firstName = "";
        middleName = "";
        lastName = "";
        suffix = "";
        nickname = "";
        story = "";
        shortBio = "";
        longerStory = "";
        occupation = "";
        birthInfo = "";
        birthDate = "";
        birthplace = "";
        currentLocation = "";
        privacySettings = "";
      })
      .controllerOnly()
      .build(),
      OQL.Entity.new<OwnershipTypes.ClaimRow>(
        "claim",
        func() : Iter.Iter<OwnershipTypes.ClaimRow> = OwnershipLib.claimRows(claims),
        "ProfileClaim",
        "id",
      )
      .sample({
        id = 0;
        personId = "";
        requestingUserId = "";
        status = "";
        submittedDate = 0;
        reviewedBy = "";
        reviewedDate = 0;
      })
      .controllerOnly()
      .build(),
      OQL.Entity.new<OwnershipTypes.RelationshipRequestRow>(
        "relationshipRequest",
        func() : Iter.Iter<OwnershipTypes.RelationshipRequestRow> = OwnershipLib.relationshipRequestRows(relationshipRequests),
        "RelationshipRequest",
        "id",
      )
      .sample({
        id = 0;
        requestingPersonId = "";
        relatedPersonId = "";
        proposedRelationship = "";
        status = "";
        submittedDate = 0;
        reviewer = "";
        reviewedDate = 0;
      })
      .controllerOnly()
      .build(),
      OQL.Entity.new<OwnershipTypes.RelationshipRow>(
        "confirmedRelationship",
        func() : Iter.Iter<OwnershipTypes.RelationshipRow> = OwnershipLib.relationshipRows(confirmedRelationships),
        "Relationship",
        "id",
      )
      .sample({
        id = 0;
        fromPersonId = "";
        toPersonId = "";
        relationshipType = "";
        status = "";
      })
      .controllerOnly()
      .build(),
      OQL.Entity.new<OwnershipTypes.NotificationRow>(
        "notification",
        func() : Iter.Iter<OwnershipTypes.NotificationRow> = OwnershipLib.notificationRows(notifications),
        "Notification",
        "id",
      )
      .sample({
        id = 0;
        recipient = "";
        notificationType = "";
        message = "";
        createdAt = 0;
        read = false;
      })
      .controllerOnly()
      .build(),
      OQL.Entity.new<AccountIdentityTypes.AccountRow>(
        "account",
        func() : Iter.Iter<AccountIdentityTypes.AccountRow> = AccountIdentityLib.accountRows(accounts),
        "Account",
        "id",
      )
      .sample({
        id = "";
        google = false;
        apple = false;
        createdAt = 0;
      })
      .controllerOnly()
      .build(),
    ];
  });
  include MixinObjectStorage();
  include ObjectStorageApi(galleries);
  include ArchiveApi(accessControlState, archiveItems);
  include OwnershipApi(accessControlState, profiles, claims, confirmedRelationships, relationshipRequests, notifications);
  include RelationshipsApi(relationshipRequests, confirmedRelationships);
  include NotificationsApi(notifications);
  include AccountIdentityApi(accounts);
  include ApiDocMixin();
};
