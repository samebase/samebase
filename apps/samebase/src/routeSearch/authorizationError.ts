import {
  AUTHORIZATION_ERROR_QUERY_PARAM,
  AUTHORIZATION_PROVIDER_QUERY_PARAM,
  type AuthorizationError,
  type AuthorizationErrorCode,
  type AuthorizationProvider,
} from "../../shared/authorizationError";
import { applySearchPatch } from "@/routing/searchFlags";
import type { RootRouteSearch } from "./root";

export type AuthorizationErrorSearch = {
  [AUTHORIZATION_PROVIDER_QUERY_PARAM]?: AuthorizationProvider;
  [AUTHORIZATION_ERROR_QUERY_PARAM]?: AuthorizationErrorCode;
};

export function readAuthorizationError(
  search: AuthorizationErrorSearch,
): AuthorizationError | null {
  const provider = search[AUTHORIZATION_PROVIDER_QUERY_PARAM];
  const code = search[AUTHORIZATION_ERROR_QUERY_PARAM];
  if (provider === undefined || code === undefined) {
    return null;
  }
  return { provider, code };
}

export function clearAuthorizationErrorSearch(search: RootRouteSearch): RootRouteSearch {
  return applySearchPatch(search, {
    [AUTHORIZATION_ERROR_QUERY_PARAM]: null,
    [AUTHORIZATION_PROVIDER_QUERY_PARAM]: null,
  });
}
