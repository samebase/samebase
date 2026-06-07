import { describe, expect, it } from "vite-plus/test";
import { getRouter } from "@/router";
import { readRouteAddressReadiness } from "./routeAddress";

const routesByPath = getRouter().routesByPath;

function readRouteAddressReadinessForTest(args: {
  currentRouteAddress?: string;
  draftRouteAddress: string;
  viewerIsAdmin?: boolean;
}) {
  return readRouteAddressReadiness({
    currentRouteAddress: args.currentRouteAddress ?? "/privacy",
    draftRouteAddress: args.draftRouteAddress,
    origin: "http://localhost:5174",
    routesByPath,
    viewerIsAdmin: args.viewerIsAdmin ?? true,
  });
}

describe("readRouteAddressReadiness", () => {
  it("keeps partial known query keys local", () => {
    expect(
      readRouteAddressReadinessForTest({
        currentRouteAddress: "/logo",
        draftRouteAddress: "/logo?dar",
      }),
    ).toEqual({
      kind: "local",
      reason: "draftNotReady",
    });
  });

  it("applies complete presence query keys", () => {
    expect(
      readRouteAddressReadinessForTest({
        currentRouteAddress: "/logo",
        draftRouteAddress: "/logo?dark",
      }),
    ).toEqual({
      kind: "readyExact",
      routeAddress: "/logo?dark",
    });
  });

  it("keeps partial suggested query values local", () => {
    expect(
      readRouteAddressReadinessForTest({
        currentRouteAddress: "/logo",
        draftRouteAddress: "/logo?leftFace=s",
      }),
    ).toEqual({
      kind: "local",
      reason: "draftNotReady",
    });
  });

  it("applies complete suggested query values", () => {
    expect(
      readRouteAddressReadinessForTest({
        currentRouteAddress: "/logo",
        draftRouteAddress: "/logo?leftFace=secondary",
      }),
    ).toEqual({
      kind: "readyExact",
      routeAddress: "/logo?leftFace=secondary",
    });
  });

  it("keeps partial paths local", () => {
    expect(
      readRouteAddressReadinessForTest({
        draftRouteAddress: "/lo",
      }),
    ).toEqual({
      kind: "local",
      reason: "pathNotReady",
    });
  });

  it("applies loadable paths", () => {
    expect(
      readRouteAddressReadinessForTest({
        draftRouteAddress: "/logo",
      }),
    ).toEqual({
      kind: "readyExact",
      routeAddress: "/logo",
    });
  });

  it("distinguishes ready normalized drafts from exact drafts", () => {
    expect(
      readRouteAddressReadinessForTest({
        currentRouteAddress: "/privacy",
        draftRouteAddress: "/logo?dar",
      }),
    ).toEqual({
      kind: "readyNormalized",
      routeAddress: "/logo",
    });
  });

  it("expects the canonical route after conflicting theme flags clear each other", () => {
    expect(
      readRouteAddressReadinessForTest({
        currentRouteAddress: "/logo?dark",
        draftRouteAddress: "/logo?dark&light&",
      }),
    ).toEqual({
      kind: "readyNormalized",
      routeAddress: "/logo",
    });
  });

  it("expects the canonical route after numeric global params are normalized", () => {
    expect(
      readRouteAddressReadinessForTest({
        currentRouteAddress: "/logo?zoom=0.01",
        draftRouteAddress: "/logo?zoom=0.0",
      }),
    ).toEqual({
      kind: "readyNormalized",
      routeAddress: "/logo?zoom=0",
    });
  });

  it("keeps route-owned params while canonicalizing global params", () => {
    expect(
      readRouteAddressReadinessForTest({
        currentRouteAddress: "/logo",
        draftRouteAddress: "/pricing?checkout=success&zoom=0.0",
      }),
    ).toEqual({
      kind: "readyNormalized",
      routeAddress: "/pricing?checkout=success&zoom=0",
    });
  });

  it("replaces old root-owned aliases with canonical keys", () => {
    expect(
      readRouteAddressReadinessForTest({
        currentRouteAddress: "/logo",
        draftRouteAddress: "/logo?base=%23112233",
      }),
    ).toEqual({
      kind: "readyNormalized",
      routeAddress: "/logo?background=%23112233",
    });
  });
});
