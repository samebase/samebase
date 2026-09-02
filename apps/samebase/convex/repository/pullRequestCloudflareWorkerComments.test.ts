import { describe, expect, it } from "vite-plus/test";

import {
  detectCloudflareWorkerCommentParseFailures,
  resolveCloudflareWorkerComments,
} from "./pullRequestCloudflareWorkerComments";

// Captured from https://github.com/samebase/samebase/pull/1343#issuecomment-5158532152.
const successWithoutPreviewComment = `## Deploying with &nbsp;<a href="https://workers.dev"><img alt="Cloudflare Workers" src="https://workers.cloudflare.com/logo.svg" width="16"></a> &nbsp;Cloudflare Workers
The latest updates on your project. Learn more about [integrating Git with Workers](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/).

| Status | Name | Latest Commit | Updated (UTC) |
| -|-|-|-|
| ✅ Deployment successful! <br>[View logs](https://dash.cloudflare.com/?to=/fe57d01d7ab41f60d00ba1aade20eb33/workers/services/view/samebase-posthog-proxy/production/builds/4b9d6a6f-d4d4-4f9d-8c73-da8a5b1525c8) | samebase-posthog-proxy | 0a7c7e5d | Aug 02 2026, 03:12 PM |`;

// Captured from https://github.com/samebase/samebase/pull/1343#issuecomment-5158540792.
const successWithPreviewComment = `## Deploying with &nbsp;<a href="https://workers.dev"><img alt="Cloudflare Workers" src="https://workers.cloudflare.com/logo.svg" width="16"></a> &nbsp;Cloudflare Workers
The latest updates on your project. Learn more about [integrating Git with Workers](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/).

| Status | Name | Latest Commit | Preview URL | Updated (UTC) |
| -|-|-|-|-|
| ✅ Deployment successful! <br>[View logs](https://dash.cloudflare.com/?to=/fe57d01d7ab41f60d00ba1aade20eb33/workers/services/view/samebase/production/builds/293779de-52eb-4232-9ddd-52937ac4a575) | samebase | 0a7c7e5d | <a href='https://aa8c36b0-samebase.pfp.workers.dev'>Commit Preview URL</a><br><br><a href='https://codex-preserve-pr-worker-root-groups-samebase.pfp.workers.dev'>Branch Preview URL</a> | Aug 02 2026, 03:13 PM |`;

// Captured from https://github.com/samebase/samebase/pull/1344#issuecomment-5158901210
// at 2026-08-02 16:16 UTC. The bot replaces this state after the build completes.
const inProgressComment = `## Deploying with &nbsp;<a href="https://workers.dev"><img alt="Cloudflare Workers" src="https://workers.cloudflare.com/logo.svg" width="16"></a> &nbsp;Cloudflare Workers
The latest updates on your project. Learn more about [integrating Git with Workers](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/).

| Status | Name | Latest Commit | Updated (UTC) |
| -|-|-|-|
| 🔵 In progress <br>[View logs](https://dash.cloudflare.com/?to=/fe57d01d7ab41f60d00ba1aade20eb33/workers/services/view/samebase/production/builds/24a3b9fa-0d08-47e9-9615-c96b08c8e70b) | samebase | 42f130ce | Aug 02 2026, 04:16 PM |`;

describe("resolveCloudflareWorkerComments", () => {
  it("parses separate Worker rows and keeps the stable branch alias", () => {
    expect(
      resolveCloudflareWorkerComments({
        state: "available",
        bodies: [successWithoutPreviewComment, successWithPreviewComment],
      }),
    ).toEqual({
      state: "available",
      workers: [
        {
          accountId: "fe57d01d7ab41f60d00ba1aade20eb33",
          buildState: "success",
          buildUuid: "293779de-52eb-4232-9ddd-52937ac4a575",
          logsUrl:
            "https://dash.cloudflare.com/?to=/fe57d01d7ab41f60d00ba1aade20eb33/workers/services/view/samebase/production/builds/293779de-52eb-4232-9ddd-52937ac4a575",
          name: "samebase",
          preview: {
            state: "available",
            url: "https://codex-preserve-pr-worker-root-groups-samebase.pfp.workers.dev",
            provenance: "selected_result",
          },
        },
        {
          accountId: "fe57d01d7ab41f60d00ba1aade20eb33",
          buildState: "success",
          buildUuid: "4b9d6a6f-d4d4-4f9d-8c73-da8a5b1525c8",
          logsUrl:
            "https://dash.cloudflare.com/?to=/fe57d01d7ab41f60d00ba1aade20eb33/workers/services/view/samebase-posthog-proxy/production/builds/4b9d6a6f-d4d4-4f9d-8c73-da8a5b1525c8",
          name: "samebase-posthog-proxy",
          preview: { state: "absent" },
        },
      ],
    });
  });

  it("validates Latest Commit syntax without matching it to the current pull request commits", () => {
    const proof = resolveCloudflareWorkerComments({
      state: "available",
      bodies: [successWithPreviewComment.replace("0a7c7e5d", "deadbee")],
    });

    expect(proof).toMatchObject({
      state: "available",
      workers: [{ name: "samebase", buildState: "success" }],
    });
  });

  it("retains an in-progress build without a preview", () => {
    expect(
      resolveCloudflareWorkerComments({ state: "available", bodies: [inProgressComment] }),
    ).toMatchObject({
      state: "available",
      workers: [{ name: "samebase", buildState: "running", preview: { state: "absent" } }],
    });
  });

  it("deduplicates equal branch preview anchors in one comment row", () => {
    const anchor =
      "<a href='https://codex-preserve-pr-worker-root-groups-samebase.pfp.workers.dev'>Branch Preview URL</a>";
    expect(
      resolveCloudflareWorkerComments({
        state: "available",
        bodies: [successWithPreviewComment.replace(anchor, `${anchor}<br>${anchor}`)],
      }),
    ).toMatchObject({
      state: "available",
      workers: [
        {
          name: "samebase",
          preview: {
            state: "available",
            url: "https://codex-preserve-pr-worker-root-groups-samebase.pfp.workers.dev",
            provenance: "selected_result",
          },
        },
      ],
    });
  });

  it("fails closed for unsafe aliases and conflicting rows", () => {
    for (const previewUrl of [
      "http://codex-preserve-pr-worker-root-groups-samebase.pfp.workers.dev",
      "https://user@codex-preserve-pr-worker-root-groups-samebase.pfp.workers.dev",
      "https://codex-preserve-pr-worker-root-groups-samebase.pfp.workers.dev:8443",
      "https://codex-preserve-pr-worker-root-groups-samebase.pfp.workers.dev/path",
      "https://codex-preserve-pr-worker-root-groups-samebase.pfp.workers.dev?source=comment",
      "https://codex-preserve-pr-worker-root-groups-samebase.pfp.workers.dev#preview",
      "https://codex-preserve-pr-worker-root-groups-samebase.example.com",
    ]) {
      expect(
        resolveCloudflareWorkerComments({
          state: "available",
          bodies: [
            successWithPreviewComment.replace(
              "https://codex-preserve-pr-worker-root-groups-samebase.pfp.workers.dev",
              previewUrl,
            ),
          ],
        }),
      ).toEqual({ state: "unavailable" });
    }
    expect(
      resolveCloudflareWorkerComments({
        state: "available",
        bodies: [
          successWithPreviewComment,
          successWithPreviewComment.replace(
            "https://codex-preserve-pr-worker-root-groups-samebase.pfp.workers.dev",
            "https://other-samebase.pfp.workers.dev",
          ),
        ],
      }),
    ).toEqual({ state: "unavailable" });
  });

  it("keeps the existing Worker comment format diagnostics", () => {
    const comments = {
      state: "available" as const,
      bodies: [
        successWithoutPreviewComment.replace("| Status | Name |", "| Status | Name | Name |"),
      ],
    };
    expect(
      detectCloudflareWorkerCommentParseFailures({
        comments,
        proof: resolveCloudflareWorkerComments(comments),
      }),
    ).toEqual([{ providerFormat: "cloudflare_workers", failureKind: "format_drift" }]);
  });
});
