import { describe, expect, it } from "vite-plus/test";
import { type DeploymentProfile } from "../../convex/deploymentProfile";
import {
  buildPathWithoutProdUiQuery,
  isProdUiModeActive,
  isProductionPublicHostname,
  shouldStripVisibleProdUiQuery,
} from "./prodUiMode";

const productionProfile = {
  kind: "production",
} satisfies DeploymentProfile;

const previewProfile = {
  kind: "preview",
} satisfies DeploymentProfile;

describe("prodUiMode", () => {
  it("recognizes the public production hostnames", () => {
    expect(isProductionPublicHostname("noter.md")).toBe(true);
    expect(isProductionPublicHostname("WWW.NOTER.MD")).toBe(true);
    expect(isProductionPublicHostname("preview.noter.md")).toBe(false);
  });

  it("activates prod UI by default on production surfaces", () => {
    expect(
      isProdUiModeActive({
        deploymentProfile: undefined,
        productionPublicOrigin: true,
        search: {},
      }),
    ).toBe(true);
    expect(
      isProdUiModeActive({
        deploymentProfile: productionProfile,
        productionPublicOrigin: false,
        search: {},
      }),
    ).toBe(true);
    expect(
      isProdUiModeActive({
        deploymentProfile: previewProfile,
        productionPublicOrigin: false,
        search: {},
      }),
    ).toBe(false);
  });

  it("strips the preview-only flag only from production-visible URLs", () => {
    expect(
      shouldStripVisibleProdUiQuery({
        deploymentProfile: productionProfile,
        productionPublicOrigin: false,
        search: "?prod-ui&dev",
      }),
    ).toBe(true);
    expect(
      shouldStripVisibleProdUiQuery({
        deploymentProfile: previewProfile,
        productionPublicOrigin: false,
        search: "?prod-ui&dev",
      }),
    ).toBe(false);
  });

  it("removes prod-ui without dropping other URL parts", () => {
    expect(
      buildPathWithoutProdUiQuery({
        pathname: "/",
        search: "?prod-ui&dev",
        hash: "top",
      }),
    ).toBe("/?dev#top");
  });
});
