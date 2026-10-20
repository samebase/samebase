type AppAuthPresentationSearchParams = {
  get(name: string): string | null;
};
type AppAuthPresentationSearchParamsConstructor = new (
  search: string,
) => AppAuthPresentationSearchParams;

export type AppAuthPresentationRuntimeHost = {
  URLSearchParams?: AppAuthPresentationSearchParamsConstructor;
};

export type AppAuthPresentationRuntimeLocalHint = { kind: "pending" } | { kind: "signedOut" };

/**
 * Inline-safe auth presentation runtime.
 *
 * This factory is serialized into the document head with `Function#toString`
 * by `buildAppAuthPresentationPrehydrationScript`, and is also imported by the
 * hydrated React app. Keep it self-contained: no runtime imports, no closed-over
 * module values, and no dependencies on bundled code. Any value it needs before
 * hydration must come from the optional `host` argument, browser globals, or
 * functions defined inside this factory.
 *
 * Returning the helpers lets the prehydration script and React auth state share
 * storage-key derivation and active auth-flow detection without duplicating them
 * in two places. Convex Auth 2 tokens carry no account label, so a stored session
 * only tells the page that the viewer may be signed in.
 */
export function Inlineable_createAppAuthPresentationRuntime(
  host: AppAuthPresentationRuntimeHost = {},
) {
  const convexAuthRefreshTokenStorageKeyPrefix = "__convexAuthRefreshToken";

  function convexAuthRefreshTokenStorageKey(storageNamespace: string) {
    return (
      convexAuthRefreshTokenStorageKeyPrefix + "_" + storageNamespace.replace(/[^a-zA-Z0-9]/g, "")
    );
  }

  function hasActiveAuthFlow(search: string) {
    if (!search) return false;

    const SearchParams = host.URLSearchParams ?? window.URLSearchParams;
    const searchParams = new SearchParams(search);
    const authProvider = searchParams.get("auth");
    return (
      authProvider === "google" ||
      authProvider === "github" ||
      searchParams.get("convexAuthCode") !== null ||
      searchParams.get("convexAuthError") !== null
    );
  }

  function readLocalAppAuthPresentationHint({
    search,
    storage,
    storageNamespace,
  }: {
    search: string;
    storage: Pick<Storage, "getItem">;
    storageNamespace: string;
  }): AppAuthPresentationRuntimeLocalHint {
    try {
      const refreshToken = storage.getItem(convexAuthRefreshTokenStorageKey(storageNamespace));
      if (refreshToken !== null && refreshToken.length > 0) {
        return { kind: "pending" };
      }

      return hasActiveAuthFlow(search) ? { kind: "pending" } : { kind: "signedOut" };
    } catch {
      return { kind: "pending" };
    }
  }

  return {
    convexAuthRefreshTokenStorageKey,
    hasActiveAuthFlow,
    readLocalAppAuthPresentationHint,
  };
}
