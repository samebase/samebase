export const AGENT_BROWSER_HANDOFF_ROUTE = "/agents/connect";
export const AGENT_BROWSER_HANDOFF_TOKEN_FRAGMENT_KEY = "handoff";
export const AGENT_BROWSER_HANDOFF_RETURN_TO_FRAGMENT_KEY = "returnTo";
export const AGENT_BROWSER_HANDOFF_DEFAULT_RETURN_TO_PATH = "/vault/";

export type AgentBrowserHandoffFragment = {
  returnToPath: string;
  token: string | null;
};

export function hasAgentBrowserHandoffFragment(hash: string): boolean {
  const rawHash = hash.startsWith("#") ? hash.slice(1) : hash;
  return new URLSearchParams(rawHash).has(AGENT_BROWSER_HANDOFF_TOKEN_FRAGMENT_KEY);
}

export function normalizeAgentBrowserHandoffReturnToPath(value: string | undefined): string {
  if (value === undefined) {
    return AGENT_BROWSER_HANDOFF_DEFAULT_RETURN_TO_PATH;
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return AGENT_BROWSER_HANDOFF_DEFAULT_RETURN_TO_PATH;
  }

  try {
    const parsed = new URL(trimmed, "https://samebase.local");
    if (parsed.origin !== "https://samebase.local") {
      return AGENT_BROWSER_HANDOFF_DEFAULT_RETURN_TO_PATH;
    }
    if (parsed.pathname === AGENT_BROWSER_HANDOFF_ROUTE) {
      return AGENT_BROWSER_HANDOFF_DEFAULT_RETURN_TO_PATH;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return AGENT_BROWSER_HANDOFF_DEFAULT_RETURN_TO_PATH;
  }
}

export function buildAgentBrowserHandoffUrl(args: {
  returnToPath: string;
  siteUrl: string;
  token: string;
}): string {
  const url = new URL(args.siteUrl);
  url.pathname = AGENT_BROWSER_HANDOFF_ROUTE;
  url.search = "";
  const fragment = new URLSearchParams();
  fragment.set(AGENT_BROWSER_HANDOFF_TOKEN_FRAGMENT_KEY, args.token);
  fragment.set(
    AGENT_BROWSER_HANDOFF_RETURN_TO_FRAGMENT_KEY,
    normalizeAgentBrowserHandoffReturnToPath(args.returnToPath),
  );
  url.hash = fragment.toString();
  return url.toString();
}

export function parseAgentBrowserHandoffFragment(hash: string): AgentBrowserHandoffFragment {
  const rawHash = hash.startsWith("#") ? hash.slice(1) : hash;
  const fragment = new URLSearchParams(rawHash);
  const token = fragment.get(AGENT_BROWSER_HANDOFF_TOKEN_FRAGMENT_KEY);
  return {
    token: token && token.trim().length > 0 ? token : null,
    returnToPath: normalizeAgentBrowserHandoffReturnToPath(
      fragment.get(AGENT_BROWSER_HANDOFF_RETURN_TO_FRAGMENT_KEY) ?? undefined,
    ),
  };
}
