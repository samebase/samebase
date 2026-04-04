import type { PostHogConfig } from "posthog-js";

const configuredPostHogToken =
  import.meta.env.VITE_PUBLIC_POSTHOG_TOKEN?.trim() ?? "";
const configuredPostHogHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST?.trim();

export const isPostHogEnabled = configuredPostHogToken.length > 0;
export const posthogToken = configuredPostHogToken;

export const posthogConfig = {
  api_host: configuredPostHogHost || "https://eu.i.posthog.com",
  capture_pageview: "history_change",
  defaults: "2026-01-30",
  disable_session_recording: true,
  // Keep client persistence on-origin without enabling PostHog cookies.
  persistence: "localStorage",
} satisfies Partial<PostHogConfig>;
