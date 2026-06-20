import { describe, expect, it } from "vite-plus/test";
import { type DeploymentProfile } from "../../convex/deploymentProfile";
import {
  buildPathWithoutProdUiQuery,
  isProdUiModeActive,
  isProdUiModeEnabled,
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
    expect(isProductionPublicHostname("samebase.com")).toBe(true);
    expect(isProductionPublicHostname("WWW.SAMEBASE.COM")).toBe(true);
    expect(isProductionPublicHostname("preview.samebase.com")).toBe(false);
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

  it("reads prod-ui mode by key presence", () => {
    expect(isProdUiModeEnabled({ "prod-ui": false })).toBe(true);
    expect(isProdUiModeEnabled({ "prod-ui": "0" })).toBe(true);
    expect(isProdUiModeEnabled({ "prod-ui": undefined })).toBe(false);
    expect(isProdUiModeEnabled({ "prod-ui": null })).toBe(false);
    expect(isProdUiModeEnabled({})).toBe(false);
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
