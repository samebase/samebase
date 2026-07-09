import {
  AGENT_BROWSER_HANDOFF_DEFAULT_RETURN_TO_PATH,
  AGENT_BROWSER_HANDOFF_RETURN_TO_FRAGMENT_KEY,
  AGENT_BROWSER_HANDOFF_ROUTE,
  AGENT_BROWSER_HANDOFF_TOKEN_FRAGMENT_KEY,
  normalizeAgentBrowserHandoffReturnToPath,
  parseAgentBrowserHandoffFragment,
} from "../../shared/agentBrowserHandoff";

export const AGENT_BROWSER_HANDOFF_STORAGE_KEY = "samebase_agent_browser_handoff";
export const AGENT_BROWSER_HANDOFF_HISTORY_STATE_KEY = "samebaseAgentBrowserHandoff";

export type StoredAgentBrowserHandoff = {
  createdAt: number;
  returnToPath: string;
  token: string;
};

type AgentBrowserHandoffPrehydrationArgs = {
  defaultReturnToPath: string;
  historyStateKey: string;
  returnToFragmentKey: string;
  route: string;
  storageKey: string;
  tokenFragmentKey: string;
};

const agentBrowserHandoffPrehydrationArgs = {
  defaultReturnToPath: AGENT_BROWSER_HANDOFF_DEFAULT_RETURN_TO_PATH,
  historyStateKey: AGENT_BROWSER_HANDOFF_HISTORY_STATE_KEY,
  returnToFragmentKey: AGENT_BROWSER_HANDOFF_RETURN_TO_FRAGMENT_KEY,
  route: AGENT_BROWSER_HANDOFF_ROUTE,
  storageKey: AGENT_BROWSER_HANDOFF_STORAGE_KEY,
  tokenFragmentKey: AGENT_BROWSER_HANDOFF_TOKEN_FRAGMENT_KEY,
} satisfies AgentBrowserHandoffPrehydrationArgs;

function InlineScript_stripAgentBrowserHandoffFragment(args: AgentBrowserHandoffPrehydrationArgs) {
  function normalizeReturnToPath(value: string | null) {
    if (value === null) return args.defaultReturnToPath;

    const trimmed = value.trim();
    if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
      return args.defaultReturnToPath;
    }

    try {
      const parsed = new URL(trimmed, "https://samebase.local");
      if (parsed.origin !== "https://samebase.local") {
        return args.defaultReturnToPath;
      }
      if (parsed.pathname === args.route) {
        return args.defaultReturnToPath;
      }
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return args.defaultReturnToPath;
    }
  }

  try {
    if (window.location.pathname !== args.route) return;

    const rawHash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const fragment = new URLSearchParams(rawHash);
    const token = fragment.get(args.tokenFragmentKey);
    if (token === null || token.trim().length === 0) return;

    const handoff = {
      createdAt: Date.now(),
      returnToPath: normalizeReturnToPath(fragment.get(args.returnToFragmentKey)),
      token,
    };
    const currentState = window.history.state;
    const nextState =
      currentState !== null && typeof currentState === "object"
        ? Object.assign({}, currentState)
        : {};

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

function parseStoredAgentBrowserHandoff(value: unknown): StoredAgentBrowserHandoff | null {
  if (value === null || typeof value !== "object") {
    return null;
  }
  if (!("token" in value) || !("returnToPath" in value) || !("createdAt" in value)) {
    return null;
  }
  if (
    typeof value.token !== "string" ||
    value.token.trim().length === 0 ||
    typeof value.returnToPath !== "string" ||
    typeof value.createdAt !== "number" ||
    !Number.isFinite(value.createdAt)
  ) {
    return null;
  }

  return {
    createdAt: value.createdAt,
    returnToPath: normalizeAgentBrowserHandoffReturnToPath(value.returnToPath),
    token: value.token,
  };
}

function readSessionStoredAgentBrowserHandoff(): StoredAgentBrowserHandoff | null {
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

function readHistoryStoredAgentBrowserHandoff(): StoredAgentBrowserHandoff | null {
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

export function readStoredAgentBrowserHandoff(): StoredAgentBrowserHandoff | null {
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

export function consumeStoredAgentBrowserHandoff(): StoredAgentBrowserHandoff | null {
  const storedHandoff = readStoredAgentBrowserHandoff();
  clearStoredAgentBrowserHandoff();
  return storedHandoff;
}

export function stripAgentBrowserHandoffFragmentBeforeHydration() {
  if (window.location.pathname !== AGENT_BROWSER_HANDOFF_ROUTE) {
    return;
  }

  const fragment = parseAgentBrowserHandoffFragment(window.location.hash);
  if (fragment.token === null) {
    return;
  }

  const currentState = window.history.state;
  const nextState =
    currentState !== null && typeof currentState === "object" ? { ...currentState } : {};
  nextState[AGENT_BROWSER_HANDOFF_HISTORY_STATE_KEY] = {
    createdAt: Date.now(),
    returnToPath: fragment.returnToPath,
    token: fragment.token,
  } satisfies StoredAgentBrowserHandoff;

  try {
    window.sessionStorage.setItem(
      AGENT_BROWSER_HANDOFF_STORAGE_KEY,
      JSON.stringify(nextState[AGENT_BROWSER_HANDOFF_HISTORY_STATE_KEY]),
    );
  } catch {}

  window.history.replaceState(
    nextState,
    "",
    `${window.location.pathname}${window.location.search}`,
  );
}

export const agentBrowserHandoffPrehydrationScript = `(${InlineScript_stripAgentBrowserHandoffFragment.toString()})(${JSON.stringify(agentBrowserHandoffPrehydrationArgs)});`;
