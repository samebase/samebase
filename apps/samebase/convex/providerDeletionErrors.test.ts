import { describe, expect, it } from "vite-plus/test";

import {
  ConvexManagementApiError,
  isConvexManagementNotFoundError,
} from "./convexManagementApi/errors";

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
});
