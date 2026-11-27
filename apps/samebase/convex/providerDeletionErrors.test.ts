import { describe, expect, it } from "vite-plus/test";

import { ConvexManagementApiError, isConvexManagementNotFoundError } from "./convexManagementApi";

describe("provider deletion errors", () => {
  it("recognizes Convex management not-found errors", () => {
    expect(
      isConvexManagementNotFoundError(
        new ConvexManagementApiError({
          status: 404,
          message: "Convex Management API POST /projects/{project_id}/delete failed.",
        }),
      ),
    ).toBe(true);
  });

  it("rejects non-not-found Convex management errors", () => {
    expect(
      isConvexManagementNotFoundError(
        new ConvexManagementApiError({
          status: 500,
          message: "Convex Management API POST /projects/{project_id}/delete failed.",
        }),
      ),
    ).toBe(false);
  });
});
