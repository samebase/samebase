import { parseSiteOrigin } from "./siteOrigin";

export const AGENT_BROWSER_HANDOFF_ROUTE = "/agents/connect";
export const AGENT_BROWSER_HANDOFF_TOKEN_FRAGMENT_KEY = "handoff";
export const AGENT_BROWSER_HANDOFF_RETURN_TO_FRAGMENT_KEY = "returnTo";
export const AGENT_BROWSER_HANDOFF_DEFAULT_RETURN_TO_PATH = "/repo/";
export const AGENT_BROWSER_HANDOFF_TOKEN_PATTERN_SOURCE = "^agbh_[A-Za-z0-9_-]{43}(?![\\s\\S])";
const AGENT_BROWSER_HANDOFF_RETURN_TO_BASE_ORIGIN = "https://samebase.local";

export function isAgentBrowserHandoffRoute(pathname: string): boolean {
  return pathname === AGENT_BROWSER_HANDOFF_ROUTE || pathname === `${AGENT_BROWSER_HANDOFF_ROUTE}/`;
}

export function hasAgentBrowserHandoffFragment(hash: string): boolean {
  const rawHash = hash.startsWith("#") ? hash.slice(1) : hash;
  return new URLSearchParams(rawHash).has(AGENT_BROWSER_HANDOFF_TOKEN_FRAGMENT_KEY);
}

export function isAgentBrowserHandoffTokenValue(value: string): boolean {
  return new RegExp(AGENT_BROWSER_HANDOFF_TOKEN_PATTERN_SOURCE).test(value);
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
    const parsed = new URL(trimmed, AGENT_BROWSER_HANDOFF_RETURN_TO_BASE_ORIGIN);
    if (parsed.origin !== AGENT_BROWSER_HANDOFF_RETURN_TO_BASE_ORIGIN) {
      return AGENT_BROWSER_HANDOFF_DEFAULT_RETURN_TO_PATH;
    }
    if (isAgentBrowserHandoffRoute(parsed.pathname)) {
      return AGENT_BROWSER_HANDOFF_DEFAULT_RETURN_TO_PATH;
    }
    const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (
      new URL(normalized, AGENT_BROWSER_HANDOFF_RETURN_TO_BASE_ORIGIN).origin !==
      AGENT_BROWSER_HANDOFF_RETURN_TO_BASE_ORIGIN
    ) {
      return AGENT_BROWSER_HANDOFF_DEFAULT_RETURN_TO_PATH;
    }
    return normalized;
  } catch {
    return AGENT_BROWSER_HANDOFF_DEFAULT_RETURN_TO_PATH;
  }
}

export function buildAgentBrowserHandoffUrl(args: {
  returnToPath: string | undefined;
  siteUrl: string;
  token: string;
}): string {
  const url = parseSiteOrigin(args.siteUrl);
  if (!isAgentBrowserHandoffTokenValue(args.token)) {
    throw new Error("Browser handoff token is invalid.");
  }
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

export function parseAgentBrowserHandoffFragment(hash: string) {
  const rawHash = hash.startsWith("#") ? hash.slice(1) : hash;
  const fragment = new URLSearchParams(rawHash);
  const token = fragment.get(AGENT_BROWSER_HANDOFF_TOKEN_FRAGMENT_KEY);
  return {
    token: token && isAgentBrowserHandoffTokenValue(token) ? token : null,
    returnToPath: normalizeAgentBrowserHandoffReturnToPath(
      fragment.get(AGENT_BROWSER_HANDOFF_RETURN_TO_FRAGMENT_KEY) ?? undefined,
    ),
  };
}
