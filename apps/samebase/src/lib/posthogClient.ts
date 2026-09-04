import {
  hasAgentBrowserHandoffFragment,
  isAgentBrowserHandoffRoute,
} from "../../shared/agentBrowserHandoff";
import { isOrganizationInvitationPath } from "@/organization/organizationInvitationRoute";
import { isRecord } from "@samebase/dependent";
import type { BeforeSendFn as SamebasePostHogBeforeSend } from "posthog-js";

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
const POSTHOG_URL_PROPERTIES = [
  "$current_url",
  "$initial_current_url",
  "$initial_pathname",
  "$initial_referrer",
  "$pathname",
  "$prev_pageview_pathname",
  "$session_entry_url",
  "$session_entry_pathname",
  "$session_entry_referrer",
  "$referrer",
] as const;

let postHogClientPromise: Promise<SamebasePostHogClient | null> | null = null;

function sanitizeSamebasePostHogUrlLikeValue(value: string): string {
  const isPath = value.startsWith("/");
  let url: URL;
  try {
    url = isPath ? new URL(value, "https://samebase.invalid") : new URL(value);
  } catch {
    return value;
  }
  if (!isOrganizationInvitationPath(url.pathname)) {
    return value;
  }

  url.pathname = "/invite/[invitation]";
  return isPath ? `${url.pathname}${url.search}${url.hash}` : url.href;
}

function sanitizeSamebasePostHogCapturedNetworkRequest<
  Request extends { name: string; url?: string },
>(request: Request): Request {
  request.name = sanitizeSamebasePostHogUrlLikeValue(request.name);
  if (request.url !== undefined) {
    request.url = sanitizeSamebasePostHogUrlLikeValue(request.url);
  }
  return request;
}

function sanitizeSamebasePostHogSnapshotData(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.map((snapshot) => {
    if (!isRecord(snapshot)) {
      return snapshot;
    }
    const data = snapshot["data"];
    if (!isRecord(data) || typeof data["href"] !== "string") {
      return snapshot;
    }

    return {
      ...snapshot,
      data: {
        ...data,
        href: sanitizeSamebasePostHogUrlLikeValue(data["href"]),
      },
    };
  });
}

function sanitizeSamebasePostHogUrlProperties(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized = { ...properties };
  for (const propertyName of POSTHOG_URL_PROPERTIES) {
    const value = sanitized[propertyName];
    if (typeof value === "string") {
      sanitized[propertyName] = sanitizeSamebasePostHogUrlLikeValue(value);
    }
  }
  return sanitized;
}

const sanitizeSamebasePostHogEvent: SamebasePostHogBeforeSend = (event) => {
  if (event === null) {
    return null;
  }

  const properties = sanitizeSamebasePostHogUrlProperties(event.properties);
  properties["$snapshot_data"] = sanitizeSamebasePostHogSnapshotData(properties["$snapshot_data"]);

  return {
    ...event,
    properties,
    ...(event.$set ? { $set: sanitizeSamebasePostHogUrlProperties(event.$set) } : {}),
    ...(event.$set_once
      ? { $set_once: sanitizeSamebasePostHogUrlProperties(event.$set_once) }
      : {}),
  };
};

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
    advanced_disable_feature_flags: true,
    autocapture: false,
    before_send: sanitizeSamebasePostHogEvent,
    capture_exceptions: true,
    capture_heatmaps: false,
    capture_performance: false,
    // Samebase captures route pageviews from TanStack Router so the first
    // pageview is tied to app mount, not to PostHog's SDK boot heuristics.
    capture_pageview: false,
    // PostHog's default pageleave capture only runs when SDK pageview capture
    // is enabled. Keep pageviews router-owned while still sending pageleave on
    // browser unload so Web Analytics can compute bounce rate and duration.
    capture_pageleave: true,
    defaults: "2026-01-30",
    // Keep browser analytics free of cookies and local-storage identifiers. Samebase records
    // explicit pageviews and errors without storing an analytics identity on the device.
    disable_persistence: true,
    disable_session_recording: true,
    // Keep localhost sessions visible while developing instead of classifying
    // them as internal/test users under the defaults snapshot.
    internal_or_test_user_hostname: args.dev ? null : undefined,
    respect_dnt: true,
    ui_host: DEFAULT_POSTHOG_UI_HOST,
    session_recording: {
      blockSelector: "[data-posthog-block]",
      maskAllInputs: true,
      maskCapturedNetworkRequestFn: sanitizeSamebasePostHogCapturedNetworkRequest,
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
  if (isOrganizationInvitationPath(url.pathname)) {
    url.pathname = "/invite/[invitation]";
  }
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
 * Do not add repository/repo/branch/customer facts as person properties here. Those
 * are event or group dimensions, and the attribution PR should define their
 * names once the usage taxonomy exists.
 *
 * Docs: https://posthog.com/docs/getting-started/identify-users
 */
export async function identifySamebasePostHogUser(userId: string) {
  const posthog = await loadSamebasePostHogClient();
  posthog?.identify(userId);
}

export async function setSamebasePostHogSessionRecording(enabled: boolean) {
  const posthog = await loadSamebasePostHogClient();
  try {
    if (enabled) {
      posthog?.startSessionRecording();
    } else {
      posthog?.stopSessionRecording();
    }
  } catch {
    // Analytics is optional and cannot block app access.
  }
}

/**
 * Sign-out clears the PostHog identity without making auth code import the SDK
 * eagerly. This can no-op when the token is absent or the SDK import fails.
 */
export async function resetSamebasePostHogClient() {
  const posthog = await loadSamebasePostHogClient();
  try {
    posthog?.stopSessionRecording();
    posthog?.reset();
  } catch {
    // Analytics cleanup is best-effort; browser data cleanup must still continue.
  }
}
