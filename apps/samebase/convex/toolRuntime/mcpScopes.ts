import type { AccessKey } from "../../shared/accessModel";

export function mcpScopeAllowsAccess(access: AccessKey, grantedScopes: readonly string[]): boolean {
  return access === "access_public" || grantedScopes.includes(access);
}
