import { QueryClient } from "@tanstack/react-query";
import { ConvexError } from "convex/values";
import { describe, expect, it } from "vite-plus/test";
import { AUTHENTICATED_ACCOUNT_DELETED } from "../../shared/authenticatedAccountAvailability";
import { loadRepositoryDashboard } from "./repository-dashboard.queries";

function loadAs(
  viewerAccess:
    | { role: string; accessKeys: string[]; termsAccepted: boolean }
    | ConvexError<string>,
) {
  const queried: unknown[] = [];
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: ({ queryKey }) => {
          queried.push(queryKey[1]);
          if (queryKey[1] !== "users:currentViewerAccess") {
            return [];
          }
          if (viewerAccess instanceof ConvexError) {
            throw viewerAccess;
          }
          return viewerAccess;
        },
      },
    },
  });
  return { queried, load: loadRepositoryDashboard({ context: { queryClient } }) };
}

describe("loadRepositoryDashboard", () => {
  it("queries nothing that the server denies a viewer whose terms are pending", async () => {
    const { queried, load } = loadAs({
      role: "role_terms_pending",
      accessKeys: ["access_public", "access_account_deletion", "access_account_settings"],
      termsAccepted: false,
    });

    await load;

    expect(queried).toEqual(["users:currentViewerAccess"]);
  });

  it("queries nothing more for a session whose account was deleted", async () => {
    const { queried, load } = loadAs(new ConvexError(AUTHENTICATED_ACCOUNT_DELETED));

    await load;

    expect(queried).toEqual(["users:currentViewerAccess"]);
  });

  it("loads the dashboard data for a viewer with dashboard access", async () => {
    const { queried, load } = loadAs({
      role: "role_member",
      accessKeys: ["access_public", "access_dashboard"],
      termsAccepted: true,
    });

    await load;

    expect(new Set(queried)).toEqual(
      new Set([
        "organizations:listForViewer",
        "repository/folders:getRepositoryFolderState",
        "repository/organizationTree:getRepositoryOrganizationTreeSettings",
        "repository:list",
        "users:currentViewerAccess",
      ]),
    );
  });
});
