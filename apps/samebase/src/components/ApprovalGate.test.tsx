import { renderToStaticMarkup } from "react-dom/server";
import type { RouteAccessViewer } from "@/routing/permissions";
import type { ViewerRole } from "../../shared/accessModel";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ApprovalGate, ApprovalGateViewerAccessProvider } from "./ApprovalGate";

const viewerAccessState = vi.hoisted(
  (): {
    queryCalls: number;
    result:
      | (RouteAccessViewer & {
          role?: ViewerRole;
          termsAccepted?: boolean;
        })
      | undefined;
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
  useAppAuthActions: () => ({
    signOut: () => {},
  }),
}));

vi.mock("@/components/TermsAcceptanceGate", () => ({
  TermsAcceptanceScreen: () => <div>Terms acceptance</div>,
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

  it("renders the pending access state for pending-access viewers", () => {
    viewerAccessState.result = {
      role: "role_pending_access",
      accessKeys: ["access_public", "access_user_preferences"],
    };

    const markup = renderApprovalGate();

    expect(markup).toContain("Account access pending");
    expect(markup).not.toContain("Route child");
  });

  it("renders Terms acceptance for a Terms-pending viewer", () => {
    viewerAccessState.result = {
      role: "role_member",
      accessKeys: ["access_public", "access_dashboard"],
      termsAccepted: false,
    };

    const markup = renderApprovalGate();

    expect(markup).toContain("Terms acceptance");
    expect(markup).not.toContain("Route child");
  });

  it("renders children for viewers with any non-public access", () => {
    viewerAccessState.result = {
      role: "role_member",
      accessKeys: ["access_public", "access_mcp"],
    };

    const markup = renderApprovalGate();

    expect(markup).toContain("Route child");
    expect(markup).not.toContain("pending access");
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
