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
      advanced_disable_feature_flags: true,
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

  it("replaces invitation codes in PostHog URL properties before send", () => {
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
        $set_once: {
          $current_url: "https://samebase.com/invite/set-once-secret",
          $pathname: "/invite/set-once-path-secret",
          $referrer: "https://samebase.com/invite/set-once-referrer-secret",
        },
      },
      uuid: "event-id",
    });

    expect(event?.properties).toMatchObject({
      $current_url: "https://samebase.com/invite/[invitation]?prod-ui#continue",
      $initial_current_url: "https://samebase.com/invite/[invitation]",
      $initial_pathname: "/invite/[invitation]",
      $pathname: "/invite/[invitation]",
      $prev_pageview_pathname: "/settings",
      $referrer: "https://samebase.com/invite/[invitation]",
      $session_entry_pathname: "/invite/[invitation]",
      $session_entry_url: "/invite/[invitation]?source=github",
      $set_once: {
        $current_url: "https://samebase.com/invite/[invitation]",
        $pathname: "/invite/[invitation]",
        $referrer: "https://samebase.com/invite/[invitation]",
      },
    });
  });

  it("replaces invitation codes in session replay request URLs", () => {
    const config = buildSamebasePostHogInitConfig({
      apiHost: "https://posthog.samebase.com",
      dev: false,
    });
    const maskRequest = config.session_recording?.maskCapturedNetworkRequestFn;
    if (typeof maskRequest !== "function") {
      throw new Error("PostHog session replay request masking is not configured.");
    }
    const request = {
      duration: 0,
      entryType: "navigation",
      name: "https://samebase.com/invite/meta-secret?prod-ui",
      startTime: 0,
      url: "/invite/compatibility-secret#continue",
    };

    const maskedRequest = maskRequest(request);

    expect(maskedRequest?.name).toBe("https://samebase.com/invite/[invitation]?prod-ui");
    expect(request.url).toBe("/invite/[invitation]#continue");
  });

  it("replaces invitation codes in replay snapshots and heatmap keys", () => {
    const config = buildSamebasePostHogInitConfig({
      apiHost: "https://posthog.samebase.com",
      dev: false,
    });
    const beforeSend = config.before_send;
    if (typeof beforeSend !== "function") {
      throw new Error("PostHog before_send is not configured as one function.");
    }

    const event = beforeSend({
      event: "$snapshot",
      properties: {
        $heatmap_data: {
          "https://samebase.com/INVITE/first-secret": [{ type: "click", x: 1, y: 2 }],
          "https://samebase.com/invite/second-secret/details": [{ type: "mousemove", x: 3, y: 4 }],
        },
        $snapshot_data: [
          {
            data: { href: "https://samebase.com/invite/replay-secret?prod-ui", width: 1280 },
            timestamp: 1,
            type: 4,
          },
          { data: { source: 1 }, timestamp: 2, type: 3 },
        ],
      },
      uuid: "event-id",
    });

    expect(event?.properties["$snapshot_data"]).toEqual([
      {
        data: { href: "https://samebase.com/invite/[invitation]?prod-ui", width: 1280 },
        timestamp: 1,
        type: 4,
      },
      { data: { source: 1 }, timestamp: 2, type: 3 },
    ]);
    expect(event?.properties["$heatmap_data"]).toEqual({
      "https://samebase.com/invite/[invitation]": [
        { type: "click", x: 1, y: 2 },
        { type: "mousemove", x: 3, y: 4 },
      ],
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
