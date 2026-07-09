import {
  hasAgentBrowserHandoffFragment,
  isAgentBrowserHandoffRoute,
} from "../../shared/agentBrowserHandoff";

type SamebasePostHogClient = (typeof import("posthog-js"))["default"];
type SamebasePostHogInitConfig = NonNullable<Parameters<SamebasePostHogClient["init"]>[1]>;

type SamebasePostHogSettings = {
  apiHost: string;
  projectToken: string;
};
type SamebasePostHogEnv = {
  readonly VITE_PUBLIC_POSTHOG_HOST?: string;
  readonly VITE_PUBLIC_POSTHOG_PROJECT_TOKEN?: string;
};

const DEFAULT_POSTHOG_API_HOST = "https://eu.i.posthog.com";
const DEFAULT_POSTHOG_UI_HOST = "https://eu.posthog.com";

let postHogClientPromise: Promise<SamebasePostHogClient | null> | null = null;

/**
 * Keep PostHog as an optional browser capability. Local/dev/preview builds can
 * omit the token, and callers should still be able to call the helper methods
 * without feature flags around every analytics touchpoint.
 */
export function readSamebasePostHogSettings(
  env: SamebasePostHogEnv,
): SamebasePostHogSettings | null {
  const projectToken = env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (!projectToken) {
    return null;
  }

  return {
    apiHost: env.VITE_PUBLIC_POSTHOG_HOST || DEFAULT_POSTHOG_API_HOST,
    projectToken,
  };
}

export function buildSamebasePostHogInitConfig(args: {
  apiHost: string;
  dev: boolean;
}): SamebasePostHogInitConfig {
  return {
    api_host: args.apiHost,
    capture_exceptions: true,
    // Samebase captures route pageviews from TanStack Router so the first
    // pageview is tied to app mount, not to PostHog's SDK boot heuristics.
    capture_pageview: false,
    // PostHog's default pageleave capture only runs when SDK pageview capture
    // is enabled. Keep pageviews router-owned while still sending pageleave on
    // browser unload so Web Analytics can compute bounce rate and duration.
    capture_pageleave: true,
    defaults: "2026-01-30",
    // Replays still require "Record user sessions" in PostHog project settings.
    // This keeps Samebase app code from disabling the recorder once the project
    // is configured. Docs: https://posthog.com/docs/libraries/js/usage#session-replay
    disable_session_recording: false,
    // Keep localhost sessions visible while developing instead of classifying
    // them as internal/test users under the defaults snapshot.
    internal_or_test_user_hostname: args.dev ? null : undefined,
    ui_host: DEFAULT_POSTHOG_UI_HOST,
    session_recording: {
      // Add data-posthog-block to a wrapper when the whole subtree should be
      // removed from replay, for example a temporary credential preview.
      blockSelector: "[data-posthog-block]",
      // Form controls often contain credentials, prompts, or provider IDs; keep
      // those masked before they leave the browser.
      maskAllInputs: true,
      // Inputs stay masked by default. Add data-posthog-unmask only when the
      // control is explicitly reviewed as safe for replay, such as the route
      // URL editor. Docs: https://posthog.com/docs/session-replay/privacy
      maskInputFn: (text, element) => {
        if (element?.hasAttribute("data-posthog-unmask")) {
          return text;
        }

        return "*".repeat(text.length);
      },
      // Editor DOM is not always an <input>. CodeMirror/ProseMark and Monaco can
      // render repository files, prompts, assistant output, and provider data as
      // normal text nodes, so mask those surfaces by default.
      // Docs: https://posthog.com/docs/session-replay/privacy
      maskTextSelector: ".cm-editor, .monaco-editor, [data-posthog-mask]",
    },
  };
}

export async function loadSamebasePostHogClient(): Promise<SamebasePostHogClient | null> {
  const settings = readSamebasePostHogSettings(import.meta.env);
  if (settings === null) {
    return null;
  }

  if (postHogClientPromise === null) {
    postHogClientPromise = import("posthog-js")
      .then((module) => {
        module.default.init(
          settings.projectToken,
          buildSamebasePostHogInitConfig({
            apiHost: settings.apiHost,
            dev: import.meta.env.DEV,
          }),
        );
        return module.default;
      })
      .catch(() => null);
  }

  return await postHogClientPromise;
}

export async function captureSamebasePostHogPageview(href: string) {
  const posthog = await loadSamebasePostHogClient();
  posthog?.capture("$pageview", {
    $current_url: sanitizeSamebasePostHogPageviewUrl(href, window.location.origin),
  });
}

export function sanitizeSamebasePostHogPageviewUrl(href: string, origin: string): string {
  const url = new URL(href, origin);
  if (isAgentBrowserHandoffRoute(url.pathname) && hasAgentBrowserHandoffFragment(url.hash)) {
    url.hash = "";
  }

  return url.href;
}

/**
 * Identify with the Convex `users._id` only.
 *
 * Example attribution path:
 * - browser calls `posthog.identify("user_123")`
 * - a future server-side usage event is captured with `distinct_id: "user_123"`
 * - PostHog can connect frontend events, replays, errors, and backend usage to
 *   the same person without a second user-id property.
 *
 * Do not add vault/repo/branch/customer facts as person properties here. Those
 * are event or group dimensions, and the attribution PR should define their
 * names once the usage taxonomy exists.
 *
 * Docs: https://posthog.com/docs/getting-started/identify-users
 */
export async function identifySamebasePostHogUser(userId: string) {
  const posthog = await loadSamebasePostHogClient();
  posthog?.identify(userId);
}

/**
 * Sign-out clears the PostHog identity without making auth code import the SDK
 * eagerly. This can no-op when the token is absent or the SDK import fails.
 */
export function resetSamebasePostHogClient() {
  void loadSamebasePostHogClient().then((posthog) => {
    posthog?.reset();
  });
}
