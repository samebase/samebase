import {
  AGENT_BROWSER_HANDOFF_DEFAULT_RETURN_TO_PATH,
  AGENT_BROWSER_HANDOFF_RETURN_TO_FRAGMENT_KEY,
  AGENT_BROWSER_HANDOFF_ROUTE,
  AGENT_BROWSER_HANDOFF_TOKEN_FRAGMENT_KEY,
  AGENT_BROWSER_HANDOFF_TOKEN_PATTERN_SOURCE,
  isAgentBrowserHandoffTokenValue,
  normalizeAgentBrowserHandoffReturnToPath,
} from "../../shared/agentBrowserHandoff";
import stripAgentBrowserHandoffFragment, {
  type AgentBrowserHandoffFragmentScriptArgs,
} from "@/lib/agentBrowserHandoffFragmentScript";
import stripAgentBrowserHandoffFragmentSource from "@/lib/agentBrowserHandoffFragmentScript?inline-script";

export const AGENT_BROWSER_HANDOFF_STORAGE_KEY = "samebase_agent_browser_handoff";
export const AGENT_BROWSER_HANDOFF_HISTORY_STATE_KEY = "samebaseAgentBrowserHandoff";

const agentBrowserHandoffPrehydrationArgs = {
  defaultReturnToPath: AGENT_BROWSER_HANDOFF_DEFAULT_RETURN_TO_PATH,
  historyStateKey: AGENT_BROWSER_HANDOFF_HISTORY_STATE_KEY,
  returnToFragmentKey: AGENT_BROWSER_HANDOFF_RETURN_TO_FRAGMENT_KEY,
  route: AGENT_BROWSER_HANDOFF_ROUTE,
  storageKey: AGENT_BROWSER_HANDOFF_STORAGE_KEY,
  tokenFragmentKey: AGENT_BROWSER_HANDOFF_TOKEN_FRAGMENT_KEY,
  tokenPatternSource: AGENT_BROWSER_HANDOFF_TOKEN_PATTERN_SOURCE,
} satisfies AgentBrowserHandoffFragmentScriptArgs;

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
  stripAgentBrowserHandoffFragment(agentBrowserHandoffPrehydrationArgs);
}

export const agentBrowserHandoffPrehydrationScript = `(${stripAgentBrowserHandoffFragmentSource})(${JSON.stringify(agentBrowserHandoffPrehydrationArgs)});`;
