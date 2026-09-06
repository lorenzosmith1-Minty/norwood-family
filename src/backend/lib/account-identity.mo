import Iter "mo:core/Iter";
import List "mo:core/List";
import Map "mo:core/Map";
import Types "../types/account-identity";

module {
  /// Returns the account bound to the given account id, if one exists.
  public func getAccount(accounts : Map.Map<Types.AccountId, Types.Account>, id : Types.AccountId) : ?Types.Account {
    accounts.get(id);
  };

  /// Returns the authentication methods bound to an account.
  public func getAuthMethods(accounts : Map.Map<Types.AccountId, Types.Account>, id : Types.AccountId) : ?Types.AuthMethods {
    switch (accounts.get(id)) {
      case null null;
      case (?account) ?toAuthMethods(account);
    };
  };

  /// Binds an authentication method to an account, creating the account if it
  /// does not yet exist. The account id is the caller's stable principal.
  public func bindAuthMethod(accounts : Map.Map<Types.AccountId, Types.Account>, id : Types.AccountId, method : Types.AuthMethod, now : Int) : Types.Account {
    switch (accounts.get(id)) {
      case (?existing) {
        let updated : Types.Account = {
          id = existing.id;
          authMethods = addMethod(existing.authMethods, method);
          createdAt = existing.createdAt;
        };
        accounts.add(id, updated);
        updated;
      };
      case null {
        let account : Types.Account = {
          id;
          authMethods = [method];
          createdAt = now;
        };
        accounts.add(id, account);
        account;
      };
    };
  };

  /// Flattens every account into OQL-exposable rows. The account id is rendered
  /// as principal text; the bound authentication methods are exposed as
  /// booleans.
  public func accountRows(accounts : Map.Map<Types.AccountId, Types.Account>) : Iter.Iter<Types.AccountRow> {
    let rows = List.empty<Types.AccountRow>();
    for ((id, account) in accounts.entries()) {
      rows.add({
        id = id.toText();
        google = hasMethod(account.authMethods, #Google);
        apple = hasMethod(account.authMethods, #Apple);
        createdAt = account.createdAt;
      });
    };
    rows.toArray().values();
  };

  // --- helpers ---

  func toAuthMethods(account : Types.Account) : Types.AuthMethods {
    {
      google = hasMethod(account.authMethods, #Google);
      apple = hasMethod(account.authMethods, #Apple);
    };
  };

  func hasMethod(methods : [Types.AuthMethod], method : Types.AuthMethod) : Bool {
    methods.any(func m = m == method);
  };

  func addMethod(methods : [Types.AuthMethod], method : Types.AuthMethod) : [Types.AuthMethod] {
    if (hasMethod(methods, method)) {
      methods;
    } else {
      methods.concat([method]);
    };
  };
};
