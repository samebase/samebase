import { describe, expect, it } from "vite-plus/test";

import {
  CloudflarePagesApiError,
  isCloudflarePagesProjectNotFoundError,
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

  it("recognizes Cloudflare Pages project not-found errors", () => {
    expect(
      isCloudflarePagesProjectNotFoundError(
        new CloudflarePagesApiError({
          method: "DELETE",
          path: "/accounts/account-123/pages/projects/noter",
          details: [{ code: "8000007", message: "Project not found" }],
        }),
      ),
    ).toBe(true);
  });

  it("rejects non-not-found Cloudflare Pages errors", () => {
    expect(
      isCloudflarePagesProjectNotFoundError(
        new CloudflarePagesApiError({
          method: "DELETE",
          path: "/accounts/account-123/pages/projects/noter",
          details: [{ code: "10000", message: "Authentication error" }],
        }),
      ),
    ).toBe(false);
  });
});
