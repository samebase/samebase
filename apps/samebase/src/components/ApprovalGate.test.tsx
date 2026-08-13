import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { api } from "../../convex/_generated/api";
import { ApprovalGate, ApprovalGateViewerAccessProvider } from "./ApprovalGate";

const viewerAccessState = vi.hoisted(
  (): { queryCalls: string[]; results: Map<string, unknown> } => ({
    queryCalls: [],
    results: new Map(),
  }),
);

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useQuery: (reference: Parameters<typeof actual.useQuery>[0], args: unknown) => {
      if (args === "skip") {
        return undefined;
      }
      const functionName = getFunctionName(reference);
      viewerAccessState.queryCalls.push(functionName);
      return viewerAccessState.results.get(functionName);
    },
  };
});

vi.mock("@/authClient", () => ({
  useAppAuthActions: () => ({
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
    viewerAccessState.queryCalls = [];
    viewerAccessState.results.clear();
  });

  it("renders nothing while viewer access loads", () => {
    expect(renderApprovalGate()).toBe("");
    expect(viewerAccessState.queryCalls).toEqual([getFunctionName(api.users.currentViewerAccess)]);
  });

  it("renders the pending access state for pending-access viewers", () => {
    viewerAccessState.results.set(getFunctionName(api.users.currentViewerAccess), {
      role: "role_pending_access",
      accessKeys: ["access_public", "access_user_preferences"],
    });
    viewerAccessState.results.set(getFunctionName(api.users.viewer), {
      _id: "pending-user",
      accountPresentation: {
        kind: "email",
        label: "pending@example.com",
      },
    });

    const markup = renderApprovalGate();

    expect(markup).toContain("Beta access pending");
    expect(markup).toContain(
      "Samebase is currently in private beta, so access is approved manually.",
    );
    expect(markup).toContain("You’re signed in as");
    expect(markup).toContain("pending@example.com");
    expect(markup).toContain("This page will update automatically when your account is approved.");
    expect(markup).toContain("Sign out");
    expect(markup).not.toContain("Route child");
  });

  it("renders children for viewers with any non-public access", () => {
    viewerAccessState.results.set(getFunctionName(api.users.currentViewerAccess), {
      role: "role_member",
      accessKeys: ["access_public", "access_mcp"],
    });

    const markup = renderApprovalGate();

    expect(markup).toContain("Route child");
    expect(markup).not.toContain("Beta access pending");
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
    expect(viewerAccessState.queryCalls).toEqual([]);
  });
});
