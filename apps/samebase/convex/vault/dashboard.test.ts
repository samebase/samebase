import { describe, expect, it } from "vite-plus/test";

import {
  buildConvexDeploymentDashboardUrl,
  buildConvexProjectSettingsDashboardUrl,
} from "./dashboard";

describe("buildConvexDeploymentDashboardUrl", () => {
  it("targets the project-scoped production deployment dashboard", () => {
    expect(
      buildConvexDeploymentDashboardUrl({
        teamSlug: "nicu",
        projectSlug: "nicu-chiciuc-tmp-96e7-dashboard-links-85",
        deploymentName: "patient-alligator-875",
      }),
    ).toBe(
      "https://dashboard.convex.dev/t/nicu/nicu-chiciuc-tmp-96e7-dashboard-links-85/patient-alligator-875",
    );
  });

  it("hides the link until the real dashboard slugs are known", () => {
    expect(
      buildConvexDeploymentDashboardUrl({
        teamSlug: undefined,
        projectSlug: "nicu-chiciuc-tmp-96e7-dashboard-links-85",
        deploymentName: "patient-alligator-875",
      }),
    ).toBeUndefined();
  });
});

describe("buildConvexProjectSettingsDashboardUrl", () => {
  it("targets the project-scoped settings dashboard", () => {
    expect(
      buildConvexProjectSettingsDashboardUrl({
        teamSlug: "nicu",
        projectSlug: "nicu-chiciuc-tmp-96e7-dashboard-links-85",
      }),
    ).toBe("https://dashboard.convex.dev/t/nicu/nicu-chiciuc-tmp-96e7-dashboard-links-85/settings");
  });

  it("hides the link until the real project dashboard slugs are known", () => {
    expect(
      buildConvexProjectSettingsDashboardUrl({
        teamSlug: "nicu",
        projectSlug: undefined,
      }),
    ).toBeUndefined();
  });
});
