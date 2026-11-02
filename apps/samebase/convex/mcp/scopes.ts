export function parseScopeTokens(scope: string): string[] {
  return scope
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

/**
No cataloged tool takes this scope, so it is not supported any more. A client can still request it
from a cached scope list, and an existing grant can still store it. It gives no access.
*/
const RETIRED_MCP_SCOPE = "access_provider_connections";

/**
The scope string without the retired scope, in the same order. Authorization ignores that scope
instead of refusing it, and grant reuse ignores it too, so a stored grant stays reusable whether the
client still requests the scope or not.
*/
export function withoutRetiredMcpScope(scope: string): string {
  return parseScopeTokens(scope)
    .filter((token) => token.toLowerCase() !== RETIRED_MCP_SCOPE)
    .join(" ");
}
