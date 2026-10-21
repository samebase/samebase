export type AgentBrowserHandoffFragmentScriptArgs = {
  defaultReturnToPath: string;
  historyStateKey: string;
  returnToFragmentKey: string;
  route: string;
  storageKey: string;
  tokenFragmentKey: string;
  tokenPatternSource: string;
};

/**
Removes an agent browser handoff token from the URL fragment of `/agents/connect` before the page
paints, keeps it in session storage and the history entry for the page to redeem, and removes a
malformed token. The page's head runs it as an inline script, compiled from this file
(dev/inlineScriptPlugin.ts), and the client entry runs it again before hydration for a page where the
inline script did not run. Keep it self-contained: it reads only browser globals and `args`.
*/
export default function stripAgentBrowserHandoffFragment(
  args: AgentBrowserHandoffFragmentScriptArgs,
) {
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
