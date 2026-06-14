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

  it("keeps hashes when applying complete suggested query values", () => {
    expect(
      readRouteAddressReadinessForTest({
        currentRouteAddress: "/logo",
        draftRouteAddress: "/logo?leftFace=secondary#appearance",
      }),
    ).toEqual({
      kind: "readyExact",
      routeAddress: "/logo?leftFace=secondary#appearance",
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

  it("drops the unsupported base query key", () => {
    expect(
      readRouteAddressReadinessForTest({
        draftRouteAddress: "/logo?base=%23112233",
      }),
    ).toEqual({
      kind: "readyNormalized",
      routeAddress: "/logo",
    });
  });

  it("drops route-owned params the destination route does not accept", () => {
    expect(
      readRouteAddressReadinessForTest({
        currentRouteAddress: "/machines?machineId=sample-machine",
        draftRouteAddress: "/home?machineId=sample-machine",
      }),
    ).toEqual({
      kind: "readyNormalized",
      routeAddress: "/home",
    });
  });

  it("keeps route-owned params the destination route accepts", () => {
    expect(
      readRouteAddressReadinessForTest({
        currentRouteAddress: "/home",
        draftRouteAddress: "/machines?machineId=sample-machine&threadId=sample-thread",
      }),
    ).toEqual({
      kind: "readyExact",
      routeAddress: "/machines?machineId=sample-machine&threadId=sample-thread",
    });
  });

  it("keeps root-owned params on destination routes without their own schema", () => {
    expect(
      readRouteAddressReadinessForTest({
        currentRouteAddress: "/machines?machineId=sample-machine",
        draftRouteAddress: "/home?prod-ui&dark",
      }),
    ).toEqual({
      kind: "readyExact",
      routeAddress: "/home?prod-ui&dark",
    });
  });

  it("keeps hidden root-owned params on every destination route", () => {
    expect(
      readRouteAddressReadinessForTest({
        currentRouteAddress: "/machines",
        draftRouteAddress: "/home?devtools",
      }),
    ).toEqual({
      kind: "readyExact",
      routeAddress: "/home?devtools",
    });
  });

  it("drops query keys no route schema accepts", () => {
    expect(
      readRouteAddressReadinessForTest({
        draftRouteAddress: "/home?unknownKey=1",
      }),
    ).toEqual({
      kind: "readyNormalized",
      routeAddress: "/home",
    });
  });

  it("keeps iso renderer params on the iso route and drops them on other logo routes", () => {
    expect(
      readRouteAddressReadinessForTest({
        currentRouteAddress: "/logo",
        draftRouteAddress: "/logo/iso?isoStyle=shaded-edge",
      }),
    ).toEqual({
      kind: "readyExact",
      routeAddress: "/logo/iso?isoStyle=shaded-edge",
    });

    expect(
      readRouteAddressReadinessForTest({
        currentRouteAddress: "/logo/iso?isoStyle=shaded-edge",
        draftRouteAddress: "/logo?isoStyle=shaded-edge",
      }),
    ).toEqual({
      kind: "readyNormalized",
      routeAddress: "/logo",
    });
  });
});
