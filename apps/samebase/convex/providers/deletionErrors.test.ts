import { describe, expect, it } from "vite-plus/test";

import { CloudflareApiError, isCloudflareWorkerNotFoundError } from "../cloudflare/resources";
import {
  ConvexManagementApiError,
  isConvexManagementNotFoundError,
} from "../convexManagementApi/errors";

describe("provider deletion errors", () => {
  it("recognizes Convex management not-found errors", () => {
    expect(
      isConvexManagementNotFoundError(
        new ConvexManagementApiError({
          status: 404,
          path: "/projects/project-123/delete",
          responseBodySummary: "not found",
        }),
      ),
    ).toBe(true);
  });

  it("rejects non-not-found Convex management errors", () => {
    expect(
      isConvexManagementNotFoundError(
        new ConvexManagementApiError({
          status: 500,
          path: "/projects/project-123/delete",
          responseBodySummary: "provider failure",
        }),
      ),
    ).toBe(false);
  });

  it("recognizes Cloudflare Worker not-found errors", () => {
    expect(
      isCloudflareWorkerNotFoundError(
        new CloudflareApiError({
          method: "DELETE",
          path: "/accounts/account-123/workers/workers/noter",
          details: [{ code: "10007", message: "Worker not found" }],
        }),
      ),
    ).toBe(true);
    expect(
      isCloudflareWorkerNotFoundError(
        new CloudflareApiError({
          method: "GET",
          path: "/accounts/account-123/workers/workers/noter",
          details: [
            {
              code: "10007",
              message: "This Worker does not exist on your account.",
            },
          ],
        }),
      ),
    ).toBe(true);
    expect(
      isCloudflareWorkerNotFoundError(
        new CloudflareApiError({
          method: "GET",
          path: "/accounts/account-123/workers/workers/noter",
          details: [{ code: "10007", message: "Resource not found" }],
        }),
      ),
    ).toBe(true);
    expect(
      isCloudflareWorkerNotFoundError(
        new Error(
          "Cloudflare MCP tool call failed: Error: Cloudflare API error: 10007: This Worker does not exist on your account.",
        ),
      ),
    ).toBe(true);
  });

  it("rejects non-not-found Cloudflare errors", () => {
    expect(
      isCloudflareWorkerNotFoundError(
        new CloudflareApiError({
          method: "DELETE",
          path: "/accounts/account-123/workers/workers/noter",
          details: [{ code: "10000", message: "Authentication error" }],
        }),
      ),
    ).toBe(false);
  });
});
