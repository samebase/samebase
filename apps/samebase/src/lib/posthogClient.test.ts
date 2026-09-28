import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  buildSamebasePostHogInitConfig,
  captureSamebasePostHogPageview,
  readSamebasePostHogSettings,
  sanitizeSamebasePostHogPageviewUrl,
  setSamebasePostHogSessionRecording,
} from "./posthogClient";

const {
  postHogCaptureMock,
  postHogIdentifyMock,
  postHogInitMock,
  postHogResetMock,
  postHogStartSessionRecordingMock,
  postHogStopSessionRecordingMock,
} = vi.hoisted(() => ({
  postHogCaptureMock: vi.fn(),
  postHogIdentifyMock: vi.fn(),
  postHogInitMock: vi.fn(),
  postHogResetMock: vi.fn(),
  postHogStartSessionRecordingMock: vi.fn(),
  postHogStopSessionRecordingMock: vi.fn(),
}));

vi.mock("posthog-js", () => ({
  default: {
    capture: postHogCaptureMock,
    identify: postHogIdentifyMock,
    init: postHogInitMock,
    reset: postHogResetMock,
    startSessionRecording: postHogStartSessionRecordingMock,
    stopSessionRecording: postHogStopSessionRecordingMock,
  },
}));

describe("posthog client setup", () => {
  afterEach(() => {
    postHogCaptureMock.mockReset();
    postHogIdentifyMock.mockReset();
    postHogInitMock.mockReset();
    postHogResetMock.mockReset();
    postHogStartSessionRecordingMock.mockReset();
    postHogStopSessionRecordingMock.mockReset();
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

  it("keeps browser analytics non-persistent and limited to explicit events", () => {
    const config = buildSamebasePostHogInitConfig({
      apiHost: "https://posthog.samebase.com",
      dev: false,
    });

    expect(config).toMatchObject({
      advanced_disable_feature_flags: true,
      api_host: "https://posthog.samebase.com",
      autocapture: false,
      capture_exceptions: true,
      capture_heatmaps: false,
      capture_pageleave: true,
      capture_pageview: false,
      capture_performance: false,
      defaults: "2026-01-30",
      disable_persistence: true,
      disable_session_recording: true,
      respect_dnt: true,
      ui_host: "https://eu.posthog.com",
      session_recording: {
        blockSelector: "[data-posthog-block]",
        maskAllInputs: true,
        maskCapturedNetworkRequestFn: expect.any(Function),
        maskTextSelector: ".cm-editor, .monaco-editor, [data-posthog-mask]",
      },
    });
  });

  it("replaces invitation codes in PostHog event and person URL properties before send", () => {
    const config = buildSamebasePostHogInitConfig({
      apiHost: "https://posthog.samebase.com",
      dev: false,
    });
    const beforeSend = config.before_send;
    if (typeof beforeSend !== "function") {
      throw new Error("PostHog before_send is not configured as one function.");
    }

    const event = beforeSend({
      event: "$exception",
      properties: {
        $current_url: "https://samebase.com/invite/current-secret?prod-ui#continue",
        $initial_current_url: "https://samebase.com/invite/initial-secret",
        $initial_pathname: "/invite/initial-path-secret",
        $pathname: "/invite/path-secret",
        $prev_pageview_pathname: "/settings",
        $referrer: "https://samebase.com/invite/referrer-secret",
        $session_entry_pathname: "/invite/session-path-secret",
        $session_entry_url: "/invite/session-secret?source=github",
      },
      $set: {
        $current_url: "https://samebase.com/invite/set-secret",
        $pathname: "/invite/set-path-secret",
        $referrer: "https://samebase.com/invite/set-referrer-secret",
      },
      $set_once: {
        $initial_current_url: "https://samebase.com/invite/set-once-secret",
        $initial_pathname: "/invite/set-once-path-secret",
        $initial_referrer: "https://samebase.com/invite/set-once-referrer-secret",
      },
      uuid: "event-id",
    });

    expect(event).toMatchObject({
      properties: {
        $current_url: "https://samebase.com/invite/[invitation]?prod-ui#continue",
        $initial_current_url: "https://samebase.com/invite/[invitation]",
        $initial_pathname: "/invite/[invitation]",
        $pathname: "/invite/[invitation]",
        $prev_pageview_pathname: "/settings",
        $referrer: "https://samebase.com/invite/[invitation]",
        $session_entry_pathname: "/invite/[invitation]",
        $session_entry_url: "/invite/[invitation]?source=github",
      },
      $set: {
        $current_url: "https://samebase.com/invite/[invitation]",
        $pathname: "/invite/[invitation]",
        $referrer: "https://samebase.com/invite/[invitation]",
      },
      $set_once: {
        $initial_current_url: "https://samebase.com/invite/[invitation]",
        $initial_pathname: "/invite/[invitation]",
        $initial_referrer: "https://samebase.com/invite/[invitation]",
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

  it("sanitizes invitation URLs in consented session recordings", () => {
    const config = buildSamebasePostHogInitConfig({
      apiHost: "https://posthog.samebase.com",
      dev: false,
    });
    const maskRequest = config.session_recording?.maskCapturedNetworkRequestFn;
    const beforeSend = config.before_send;
    if (typeof maskRequest !== "function" || typeof beforeSend !== "function") {
      throw new Error("PostHog session recording privacy controls are not configured.");
    }
    const request = {
      duration: 0,
      entryType: "navigation",
      name: "https://samebase.com/invite/request-secret?prod-ui",
      startTime: 0,
      url: "/invite/request-path-secret#continue",
    };

    expect(maskRequest(request)).toMatchObject({
      name: "https://samebase.com/invite/[invitation]?prod-ui",
      url: "/invite/[invitation]#continue",
    });
    expect(
      beforeSend({
        event: "$snapshot",
        properties: {
          $snapshot_data: [
            {
              data: { href: "https://samebase.com/invite/replay-secret?prod-ui" },
              timestamp: 1,
              type: 4,
            },
          ],
        },
        uuid: "snapshot-event-id",
      })?.properties["$snapshot_data"],
    ).toEqual([
      {
        data: { href: "https://samebase.com/invite/[invitation]?prod-ui" },
        timestamp: 1,
        type: 4,
      },
    ]);
  });

  it("reports absolute pageview URLs to PostHog", async () => {
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

  it("starts and stops session recording through the initialized client", async () => {
    vi.stubEnv("VITE_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test");

    await setSamebasePostHogSessionRecording(true);
    await setSamebasePostHogSessionRecording(false);

    expect(postHogStartSessionRecordingMock).toHaveBeenCalledTimes(1);
    expect(postHogStopSessionRecordingMock).toHaveBeenCalledTimes(1);
  });

  it("strips agent handoff fragments from pageview URLs", () => {
    expect(
      sanitizeSamebasePostHogPageviewUrl(
        "/agents/connect#handoff=agbh_secret&returnTo=%2Frepository%2F",
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

  it("drops provider OAuth completion fragments from pageview and event URLs", () => {
    const config = buildSamebasePostHogInitConfig({
      apiHost: "https://posthog.samebase.com",
      dev: false,
    });
    const beforeSend = config.before_send;
    if (typeof beforeSend !== "function") {
      throw new Error("PostHog before_send is not configured as one function.");
    }

    expect(
      sanitizeSamebasePostHogPageviewUrl(
        "/oauth/provider-complete#provider=convex&state=state_secret&code=code_secret",
        "https://samebase.com",
      ),
    ).toBe("https://samebase.com/oauth/provider-complete");
    expect(
      beforeSend({
        event: "$pageleave",
        properties: {
          $current_url:
            "https://samebase.com/oauth/provider-complete#provider=convex&state=state_secret&code=code_secret",
          $session_entry_url: "/oauth/provider-complete?prod-ui#code=code_secret",
        },
        uuid: "pageleave-event-id",
      })?.properties,
    ).toMatchObject({
      $current_url: "https://samebase.com/oauth/provider-complete",
      $session_entry_url: "/oauth/provider-complete?prod-ui",
    });
  });

  it("replaces invitation codes in pageview URLs", () => {
    expect(
      sanitizeSamebasePostHogPageviewUrl(
        "/invite/invitation_secret?prod-ui#continue",
        "https://samebase.com",
      ),
    ).toBe("https://samebase.com/invite/[invitation]?prod-ui#continue");
    expect(
      sanitizeSamebasePostHogPageviewUrl("/invite/invitation_secret/", "https://samebase.com"),
    ).toBe("https://samebase.com/invite/[invitation]");
    expect(
      sanitizeSamebasePostHogPageviewUrl(
        "/INVITE/invitation_secret/details",
        "https://samebase.com",
      ),
    ).toBe("https://samebase.com/invite/[invitation]");
  });
});
