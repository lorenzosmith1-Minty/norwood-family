import {
  type LoginOptions,
  useInternetIdentity,
} from "@caffeineai/core-infrastructure";

/**
 * Shared authentication foundation for the app. Wraps the platform's Internet
 * Identity hook and exposes the two consumer sign-in actions — Google and
 * Apple — plus a stable internal account ID.
 *
 * Internet Identity remains the underlying authentication mechanism: both
 * actions route through II's one-click OpenID flow and produce the same kind
 * of identity, so the working II implementation stays fully intact. The
 * account ID is the per-app ICP Principal, which is stable and distinct from
 * any Google/Apple identifier or email, so profile claims reference this
 * account ID rather than a provider identifier.
 */
export function useAuth() {
  const {
    identity,
    login,
    clear,
    isAuthenticated,
    isInitializing,
    isLoggingIn,
    isLoginError,
    loginError,
  } = useInternetIdentity();

  // Stable internal account ID: the per-app ICP Principal. Never a Google or
  // Apple identifier and never an email address.
  const accountId = identity?.getPrincipal().toString();

  const signInWithGoogle = () => login({ provider: "google" });

  // Apple routes through II's one-click OpenID flow (openIdProvider 'apple').
  //
  // VERIFIED runtime path (checked against the installed packages):
  //   - @caffeineai/core-infrastructure useInternetIdentity#login passes
  //     loginOptions.provider straight through to AuthClient.create's
  //     openIdProvider (dist/hooks/useInternetIdentity.js: openIdProvider:
  //     ssoDomain ? undefined : loginOptions?.provider) and to scopedKeys
  //     ({ openIdProvider: loginOptions.provider }).
  //   - @icp-sdk/auth declares `export type OpenIdProvider = 'google' |
  //     'apple' | 'microsoft'` and OPENID_PROVIDER_URLS includes 'apple', so
  //     the runtime resolves the Apple OpenID URL and scopes attribute keys to
  //     it.
  // The installed core-infrastructure LoginOptions type only lists
  // 'google' | 'microsoft', so this cast is a type-only widening of the same
  // option that the runtime already accepts — not an unverified assumption.
  const signInWithApple = () =>
    login({ provider: "apple" } as unknown as LoginOptions);

  const signOut = () => clear();

  return {
    accountId,
    isAuthenticated,
    isInitializing,
    isLoggingIn,
    isLoginError,
    loginError,
    signInWithGoogle,
    signInWithApple,
    signOut,
  };
}
