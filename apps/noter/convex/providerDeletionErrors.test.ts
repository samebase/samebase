import { describe, expect, it } from "vite-plus/test";

import {
  CloudflareApiError,
  isCloudflareWorkerNotFoundError,
} from "./cloudflareResources";
import {
  ConvexManagementApiError,
  isConvexManagementNotFoundError,
} from "./infraProviders";

describe("provider deletion errors", () => {
  it("recognizes Convex management not-found errors", () => {
    expect(
      isConvexManagementNotFoundError(
        new ConvexManagementApiError({
          status: 404,
          path: "/projects/project-123/delete",
          payload: { error: "not found" },
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
          payload: { error: "provider failure" },
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
