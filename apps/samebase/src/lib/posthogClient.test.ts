import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  buildSamebasePostHogInitConfig,
  captureSamebasePostHogPageview,
  readSamebasePostHogSettings,
  sanitizeSamebasePostHogPageviewUrl,
} from "./posthogClient";

const { postHogCaptureMock, postHogIdentifyMock, postHogInitMock, postHogResetMock } = vi.hoisted(
  () => ({
    postHogCaptureMock: vi.fn(),
    postHogIdentifyMock: vi.fn(),
    postHogInitMock: vi.fn(),
    postHogResetMock: vi.fn(),
  }),
);

vi.mock("posthog-js", () => ({
  default: {
    capture: postHogCaptureMock,
    identify: postHogIdentifyMock,
    init: postHogInitMock,
    reset: postHogResetMock,
  },
}));

describe("posthog client setup", () => {
  afterEach(() => {
    postHogCaptureMock.mockReset();
    postHogIdentifyMock.mockReset();
    postHogInitMock.mockReset();
    postHogResetMock.mockReset();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

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
      capture_pageleave: true,
      capture_pageview: false,
      defaults: "2026-01-30",
      disable_session_recording: false,
      ui_host: "https://eu.posthog.com",
      session_recording: {
        blockSelector: "[data-posthog-block]",
        maskAllInputs: true,
        maskInputFn: expect.any(Function),
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

  it("reports absolute pageview URLs to PostHog for heatmap ingestion", async () => {
    vi.stubEnv("VITE_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test");
    vi.stubGlobal("window", {
      location: {
        origin: "https://samebase.com",
      },
    });

    await captureSamebasePostHogPageview("/docs#samebase");

    expect(postHogCaptureMock).toHaveBeenCalledWith("$pageview", {
      $current_url: "https://samebase.com/docs#samebase",
    });
  });

  it("strips agent handoff fragments from pageview URLs", () => {
    expect(
      sanitizeSamebasePostHogPageviewUrl(
        "/agents/connect#handoff=agbh_secret&returnTo=%2Fvault%2F",
        "https://samebase.com",
      ),
    ).toBe("https://samebase.com/agents/connect");
    expect(
      sanitizeSamebasePostHogPageviewUrl(
        "/agents/connect/#handoff=agbh_secret",
        "https://samebase.com",
      ),
    ).toBe("https://samebase.com/agents/connect/");
    expect(
      sanitizeSamebasePostHogPageviewUrl("/docs#handoff=not-secret", "https://samebase.com"),
    ).toBe("https://samebase.com/docs#handoff=not-secret");
  });
});
