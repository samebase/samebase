import { describe, expect, it } from "vite-plus/test";
import { buildSamebasePostHogInitConfig, readSamebasePostHogSettings } from "./posthogClient";

describe("posthog client setup", () => {
  it("does not initialize without a project token", () => {
    expect(readSamebasePostHogSettings({})).toBeNull();
  });

  it("uses the EU ingest host by default", () => {
    expect(
      readSamebasePostHogSettings({
        VITE_PUBLIC_POSTHOG_PROJECT_TOKEN: "phc_test",
      }),
    ).toEqual({
      apiHost: "https://eu.i.posthog.com",
      projectToken: "phc_test",
    });
  });

  it("honors an explicit ingest host", () => {
    expect(
      readSamebasePostHogSettings({
        VITE_PUBLIC_POSTHOG_HOST: "https://posthog.samebase.com",
        VITE_PUBLIC_POSTHOG_PROJECT_TOKEN: "phc_test",
      }),
    ).toEqual({
      apiHost: "https://posthog.samebase.com",
      projectToken: "phc_test",
    });
  });

  it("enables session replay with conservative masking", () => {
    expect(
      buildSamebasePostHogInitConfig({
        apiHost: "https://posthog.samebase.com",
        dev: false,
      }),
    ).toMatchObject({
      api_host: "https://posthog.samebase.com",
      capture_exceptions: true,
      capture_pageview: false,
      defaults: "2026-01-30",
      disable_session_recording: false,
      session_recording: {
        blockSelector: "[data-posthog-block]",
        maskAllInputs: true,
        maskTextSelector: ".cm-editor, .monaco-editor, [data-posthog-mask]",
      },
    });
  });

  it("keeps localhost visible in development analytics", () => {
    expect(
      buildSamebasePostHogInitConfig({
        apiHost: "https://posthog.samebase.com",
        dev: true,
      }),
    ).toMatchObject({
      internal_or_test_user_hostname: null,
    });
  });
});
