import Map "mo:core/Map";
import Result "mo:core/Result";
import Time "mo:core/Time";
import Types "../types/account-identity";
import AccountIdentityLib "../lib/account-identity";

mixin (accounts : Map.Map<Types.AccountId, Types.Account>) {
  /// Returns the stable account id of the signed-in caller. Anonymous callers
  /// receive #NotSignedIn.
  public query ({ caller }) func getMyAccountId() : async Result.Result<Types.AccountId, Types.AccountError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    #ok(caller);
  };

  /// Returns the authentication methods bound to the signed-in caller's account.
  public query ({ caller }) func getMyAuthMethods() : async Result.Result<Types.AuthMethods, Types.AccountError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    switch (AccountIdentityLib.getAuthMethods(accounts, caller)) {
      case null #err(#AccountNotFound);
      case (?methods) #ok(methods);
    };
  };

  /// Binds an authentication method (Google or Apple) to the signed-in caller's
  /// account. The account id is the caller's stable principal, so the same
  /// person profile stays intact if the provider changes.
  public shared ({ caller }) func bindAuthMethod(method : Types.AuthMethod) : async Result.Result<Types.Account, Types.AccountError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    #ok(AccountIdentityLib.bindAuthMethod(accounts, caller, method, Time.now()));
  };
};
