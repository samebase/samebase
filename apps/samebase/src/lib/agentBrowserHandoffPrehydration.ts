import {
  AGENT_BROWSER_HANDOFF_DEFAULT_RETURN_TO_PATH,
  AGENT_BROWSER_HANDOFF_RETURN_TO_FRAGMENT_KEY,
  AGENT_BROWSER_HANDOFF_ROUTE,
  AGENT_BROWSER_HANDOFF_TOKEN_FRAGMENT_KEY,
  AGENT_BROWSER_HANDOFF_TOKEN_PATTERN_SOURCE,
  isAgentBrowserHandoffTokenValue,
  normalizeAgentBrowserHandoffReturnToPath,
} from "../../shared/agentBrowserHandoff";

export const AGENT_BROWSER_HANDOFF_STORAGE_KEY = "samebase_agent_browser_handoff";
export const AGENT_BROWSER_HANDOFF_HISTORY_STATE_KEY = "samebaseAgentBrowserHandoff";

type AgentBrowserHandoffPrehydrationArgs = {
  defaultReturnToPath: string;
  historyStateKey: string;
  returnToFragmentKey: string;
  route: string;
  storageKey: string;
  tokenFragmentKey: string;
  tokenPatternSource: string;
};

const agentBrowserHandoffPrehydrationArgs = {
  defaultReturnToPath: AGENT_BROWSER_HANDOFF_DEFAULT_RETURN_TO_PATH,
  historyStateKey: AGENT_BROWSER_HANDOFF_HISTORY_STATE_KEY,
  returnToFragmentKey: AGENT_BROWSER_HANDOFF_RETURN_TO_FRAGMENT_KEY,
  route: AGENT_BROWSER_HANDOFF_ROUTE,
  storageKey: AGENT_BROWSER_HANDOFF_STORAGE_KEY,
  tokenFragmentKey: AGENT_BROWSER_HANDOFF_TOKEN_FRAGMENT_KEY,
  tokenPatternSource: AGENT_BROWSER_HANDOFF_TOKEN_PATTERN_SOURCE,
} satisfies AgentBrowserHandoffPrehydrationArgs;

function InlineScript_stripAgentBrowserHandoffFragment(args: AgentBrowserHandoffPrehydrationArgs) {
  function normalizeReturnToPath(value: string | null) {
    if (value === null) return args.defaultReturnToPath;

    const trimmed = value.trim();
    if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
      return args.defaultReturnToPath;
    }

    try {
      const baseOrigin = "https://samebase.local";
      const parsed = new URL(trimmed, baseOrigin);
      if (parsed.origin !== baseOrigin) {
        return args.defaultReturnToPath;
      }
      if (parsed.pathname === args.route || parsed.pathname === `${args.route}/`) {
        return args.defaultReturnToPath;
      }
      const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      if (new URL(normalized, baseOrigin).origin !== baseOrigin) {
        return args.defaultReturnToPath;
      }
      return normalized;
    } catch {
      return args.defaultReturnToPath;
    }
  }

  try {
    if (window.location.pathname !== args.route && window.location.pathname !== `${args.route}/`)
      return;

    const rawHash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const fragment = new URLSearchParams(rawHash);
    const token = fragment.get(args.tokenFragmentKey);
    const currentState = window.history.state;
    const nextState =
      currentState !== null && typeof currentState === "object"
        ? Object.assign({}, currentState)
        : {};

    if (token === null) return;
    if (!new RegExp(args.tokenPatternSource).test(token)) {
      window.history.replaceState(
        nextState,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
      return;
    }

    const handoff = {
      returnToPath: normalizeReturnToPath(fragment.get(args.returnToFragmentKey)),
      token,
    };

    nextState[args.historyStateKey] = handoff;

    try {
      window.sessionStorage.setItem(args.storageKey, JSON.stringify(handoff));
    } catch {}

    window.history.replaceState(
      nextState,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
  } catch {}
}

function parseStoredAgentBrowserHandoff(value: unknown) {
  if (value === null || typeof value !== "object") {
    return null;
  }
  if (!("token" in value) || !("returnToPath" in value)) {
    return null;
  }
  if (
    typeof value.token !== "string" ||
    !isAgentBrowserHandoffTokenValue(value.token) ||
    typeof value.returnToPath !== "string"
  ) {
    return null;
  }

  return {
    returnToPath: normalizeAgentBrowserHandoffReturnToPath(value.returnToPath),
    token: value.token,
  };
}

function readSessionStoredAgentBrowserHandoff() {
  try {
    const serialized = window.sessionStorage.getItem(AGENT_BROWSER_HANDOFF_STORAGE_KEY);
    if (serialized === null) {
      return null;
    }

    return parseStoredAgentBrowserHandoff(JSON.parse(serialized));
  } catch {
    return null;
  }
}

function readHistoryStoredAgentBrowserHandoff() {
  const state = window.history.state;
  if (
    state === null ||
    typeof state !== "object" ||
    !(AGENT_BROWSER_HANDOFF_HISTORY_STATE_KEY in state)
  ) {
    return null;
  }

  return parseStoredAgentBrowserHandoff(state[AGENT_BROWSER_HANDOFF_HISTORY_STATE_KEY]);
}

function clearHistoryStoredAgentBrowserHandoff() {
  const state = window.history.state;
  if (
    state === null ||
    typeof state !== "object" ||
    !(AGENT_BROWSER_HANDOFF_HISTORY_STATE_KEY in state)
  ) {
    return;
  }

  const nextState = { ...state };
  delete nextState[AGENT_BROWSER_HANDOFF_HISTORY_STATE_KEY];
  window.history.replaceState(
    nextState,
    "",
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
}

function readStoredAgentBrowserHandoff() {
  const storedHandoff = readSessionStoredAgentBrowserHandoff();
  if (storedHandoff !== null) {
    return storedHandoff;
  }

  return readHistoryStoredAgentBrowserHandoff();
}

export function clearStoredAgentBrowserHandoff() {
  try {
    window.sessionStorage.removeItem(AGENT_BROWSER_HANDOFF_STORAGE_KEY);
  } catch {}

  clearHistoryStoredAgentBrowserHandoff();
}

export function consumeStoredAgentBrowserHandoff() {
  const storedHandoff = readStoredAgentBrowserHandoff();
  clearStoredAgentBrowserHandoff();
  return storedHandoff;
}

export function stripAgentBrowserHandoffFragmentBeforeHydration() {
  // Fallback for clients where the inline head script did not run before hydration.
  InlineScript_stripAgentBrowserHandoffFragment(agentBrowserHandoffPrehydrationArgs);
}

export const agentBrowserHandoffPrehydrationScript = `(${InlineScript_stripAgentBrowserHandoffFragment.toString()})(${JSON.stringify(agentBrowserHandoffPrehydrationArgs)});`;
