import { renderToStaticMarkup } from "react-dom/server";
import type { NoterRouteAccessViewer } from "@/lib/routePermissions";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ApprovalGate, ApprovalGateViewerAccessProvider } from "./ApprovalGate";

const viewerAccessState = vi.hoisted(
  (): {
    queryCalls: number;
    result: NoterRouteAccessViewer | undefined;
  } => ({
    queryCalls: 0,
    result: undefined,
  }),
);

vi.mock("convex/react", () => ({
  useQuery: (_query: unknown, args: unknown) => {
    if (args !== "skip") {
      viewerAccessState.queryCalls += 1;
    }
    return viewerAccessState.result;
  },
}));

vi.mock("@/authClient", () => ({
  useNoterAuthActions: () => ({
    signOut: () => {},
  }),
}));

function renderApprovalGate() {
  return renderToStaticMarkup(
    <ApprovalGate>
      <div>Route child</div>
    </ApprovalGate>,
  );
}

describe("ApprovalGate", () => {
  beforeEach(() => {
    viewerAccessState.queryCalls = 0;
    viewerAccessState.result = undefined;
  });

  it("renders nothing while viewer access loads", () => {
    expect(renderApprovalGate()).toBe("");
    expect(viewerAccessState.queryCalls).toBe(1);
  });

  it("renders the waitlist state for viewers with only public access", () => {
    viewerAccessState.result = { accessKeys: ["access_public"] };

    const markup = renderApprovalGate();

    expect(markup).toContain("waitlist");
    expect(markup).not.toContain("Route child");
  });

  it("renders children for viewers with any non-public access", () => {
    viewerAccessState.result = { accessKeys: ["access_public", "access_mcp"] };

    const markup = renderApprovalGate();

    expect(markup).toContain("Route child");
    expect(markup).not.toContain("waitlist");
  });

  it("uses provided route access without starting a duplicate query", () => {
    const markup = renderToStaticMarkup(
      <ApprovalGateViewerAccessProvider
        viewerAccess={{ accessKeys: ["access_public", "access_mcp"] }}
      >
        <ApprovalGate>
          <div>Route child</div>
        </ApprovalGate>
      </ApprovalGateViewerAccessProvider>,
    );

    expect(markup).toContain("Route child");
    expect(viewerAccessState.queryCalls).toBe(0);
  });
});
