import Map "mo:core/Map";
import Principal "mo:core/Principal";

module {
  type UserRole = {
    #admin;
    #user;
    #guest;
  };

  type OldActor = {};

  type NewActor = {
    accessControlState : {
      var adminAssigned : Bool;
      userRoles : Map.Map<Principal, UserRole>;
    };
  };

  public func migration(_old : OldActor) : NewActor {
    {
      accessControlState = {
        var adminAssigned = false;
        userRoles = Map.empty();
      };
    };
  };
};
