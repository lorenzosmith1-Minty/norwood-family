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
import ObjectStorageLib "lib/object-storage";
import ArchiveLib "lib/archive";
import ObjectStorageApi "mixins/object-storage-api";
import ArchiveApi "mixins/archive-api";
import ApiDocMixin "mixins/api-doc";

actor {
  let accessControlState : AccessControl.AccessControlState;
  let galleries : Map.Map<Types.PersonId, Types.PhotoGallery>;
  let archiveItems : List.List<ArchiveTypes.ArchiveItem>;
  include MixinAuthorization(accessControlState, null);
  include Expose({
    entities = [
      OQL.Entity.build(
        OQL.Entity.new<Types.PhotoRow>(
          "photo",
          func() : Iter.Iter<Types.PhotoRow> = ObjectStorageLib.photoRows(galleries),
          "Photo",
          "key",
        ),
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
    ];
  });
  include MixinObjectStorage();
  include ObjectStorageApi(galleries);
  include ArchiveApi(accessControlState, archiveItems);
  include ApiDocMixin();
};
