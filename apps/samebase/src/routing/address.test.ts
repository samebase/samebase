import { describe, expect, it } from "vite-plus/test";
import { getRouter } from "@/router";
import { readRouteAddressReadiness } from "./address";
import type { RouteAccessViewer } from "@/routing/permissions";
import { ROLE_ACCESS_GRANTS } from "../../shared/accessModel";

const routesByPath = getRouter().routesByPath;
const staffViewer = {
  accessKeys: ROLE_ACCESS_GRANTS.role_staff,
} as const satisfies RouteAccessViewer;
const memberViewer = {
  accessKeys: ROLE_ACCESS_GRANTS.role_member,
} as const satisfies RouteAccessViewer;

function readRouteAddressReadinessForTest(args: {
  currentRouteAddress?: string;
  draftRouteAddress: string;
  viewer?: RouteAccessViewer;
}) {
  return readRouteAddressReadiness({
    currentRouteAddress: args.currentRouteAddress ?? "/privacy",
    draftRouteAddress: args.draftRouteAddress,
    origin: "http://localhost:5174",
    routesByPath,
    viewer: args.viewer ?? staffViewer,
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
        draftRouteAddress: "/logo?leftFace=striped",
      }),
    ).toEqual({
      kind: "readyExact",
      routeAddress: "/logo?leftFace=striped",
    });
  });

  it("keeps hashes when applying complete suggested query values", () => {
    expect(
      readRouteAddressReadinessForTest({
        currentRouteAddress: "/logo",
        draftRouteAddress: "/logo?leftFace=striped#appearance",
      }),
    ).toEqual({
      kind: "readyExact",
      routeAddress: "/logo?leftFace=striped#appearance",
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

  it("applies hidden route paths and their query params", () => {
    // pathSuggestion: "hidden" hides the dropdown entry without blocking the
    // route: typing the MCP consent route or editing its theme must still commit.
    expect(
      readRouteAddressReadinessForTest({
        draftRouteAddress: "/oauth/mcp/consent",
      }),
    ).toEqual({
      kind: "readyExact",
      routeAddress: "/oauth/mcp/consent",
    });

    expect(
      readRouteAddressReadinessForTest({
        currentRouteAddress: "/oauth/mcp/consent",
        draftRouteAddress: "/oauth/mcp/consent?dark",
      }),
    ).toEqual({
      kind: "readyExact",
      routeAddress: "/oauth/mcp/consent?dark",
    });
  });

  it("keeps redirect-only paths local while typing through them", () => {
    expect(
      readRouteAddressReadinessForTest({
        draftRouteAddress: "/landing",
      }),
    ).toEqual({
      kind: "local",
      reason: "pathNotReady",
    });

    expect(
      readRouteAddressReadinessForTest({
        draftRouteAddress: "/landing-preview",
      }),
    ).toEqual({
      kind: "local",
      reason: "pathNotReady",
    });
  });

  it("applies member route grants to path readiness", () => {
    expect(
      readRouteAddressReadinessForTest({
        draftRouteAddress: "/vault",
        viewer: memberViewer,
      }),
    ).toEqual({
      kind: "readyExact",
      routeAddress: "/vault",
    });

    expect(
      readRouteAddressReadinessForTest({
        draftRouteAddress: "/org/samebase/new-app",
        viewer: memberViewer,
      }),
    ).toEqual({
      kind: "readyExact",
      routeAddress: "/org/samebase/new-app",
    });

    expect(
      readRouteAddressReadinessForTest({
        draftRouteAddress: "/pitch",
        viewer: memberViewer,
      }),
    ).toEqual({
      kind: "local",
      reason: "pathNotReady",
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
        draftRouteAddress: "/pricing?left&zoom=0.0",
      }),
    ).toEqual({
      kind: "readyNormalized",
      routeAddress: "/pricing?left&zoom=0",
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
        currentRouteAddress: "/settings?delete-account",
        draftRouteAddress: "/vault?delete-account",
      }),
    ).toEqual({
      kind: "readyNormalized",
      routeAddress: "/vault",
    });
  });

  it("drops stale route-owned params before navigating to pricing", () => {
    expect(
      readRouteAddressReadinessForTest({
        currentRouteAddress: "/settings?delete-account",
        draftRouteAddress: "/pricing?delete-account",
        viewer: memberViewer,
      }),
    ).toEqual({
      kind: "readyNormalized",
      routeAddress: "/pricing",
    });
  });

  it("keeps route-owned params the destination route accepts", () => {
    expect(
      readRouteAddressReadinessForTest({
        currentRouteAddress: "/vault",
        draftRouteAddress: "/settings?delete-account",
      }),
    ).toEqual({
      kind: "readyExact",
      routeAddress: "/settings?delete-account",
    });
  });

  it("keeps root-owned params on destination routes without their own schema", () => {
    expect(
      readRouteAddressReadinessForTest({
        currentRouteAddress: "/settings?delete-account",
        draftRouteAddress: "/vault?prod-ui&dark",
      }),
    ).toEqual({
      kind: "readyExact",
      routeAddress: "/vault?prod-ui&dark",
    });
  });

  it("keeps hidden root-owned params on every destination route", () => {
    expect(
      readRouteAddressReadinessForTest({
        currentRouteAddress: "/logo",
        draftRouteAddress: "/vault?devtools",
      }),
    ).toEqual({
      kind: "readyExact",
      routeAddress: "/vault?devtools",
    });
  });

  it("drops query keys no route schema accepts", () => {
    expect(
      readRouteAddressReadinessForTest({
        draftRouteAddress: "/vault?unknownKey=1",
      }),
    ).toEqual({
      kind: "readyNormalized",
      routeAddress: "/vault",
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
