import { removeAuthorizationSensitiveSearchParams } from "../../shared/authorizationError";

export function getCurrentRootRelativeUrl(): string {
  const search = removeAuthorizationSensitiveSearchParams(window.location.search);
  return `${window.location.pathname}${search}${window.location.hash}`;
}
