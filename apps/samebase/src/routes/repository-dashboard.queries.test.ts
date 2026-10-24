import { QueryClient } from "@tanstack/react-query";
import { ConvexHttpClient } from "convex/browser";
import { ConvexReactClient } from "convex/react";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vite-plus/test";
import { api } from "../../convex/_generated/api";
import { observedBaseAlchemyRepositoryReply } from "../../convex/repository/fixtures/observedAlchemyState";
import { ALCHEMY_CONNECTION_UNAVAILABLE } from "../../shared/alchemyStateModel";
import { AUTHENTICATED_ACCOUNT_DELETED } from "../../shared/authenticatedAccountAvailability";
import {
  loadRepositoryAlchemyPage,
  loadRepositoryDashboard,
  loadRepositoryOverview,
} from "./repository-dashboard.queries";

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

const liveConnection = {
  store: "live",
  deploymentUrl: "https://brave-heron-201.convex.cloud",
  token: "reader-token",
  snapshot: observedBaseAlchemyRepositoryReply,
} as const;

/**
The loader of a page of samebase/base-alchemy for a member, with the dashboard queries answered from
the repository list: the repository is in the member's organization and has `convexTeamId`. The
viewer's client answers the store connection with `connect`.
*/
function loadPage(args: {
  convexTeamId: string | undefined;
  connect: () => Promise<unknown>;
  client: "server" | "browser";
  attachments?: true;
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: ({ queryKey }) => {
          switch (queryKey[1]) {
            case "users:currentViewerAccess":
              return { role: "role_member", accessKeys: ["access_dashboard"], termsAccepted: true };
            case "organizations:listForViewer":
              return [{ organizationId: "organization-a" }];
            case "repository:list":
              return [
                {
                  githubRepositoryFullName: "samebase/base-alchemy",
                  organizationId: "organization-a",
                  repositoryId: "repository-a",
                  convexTeamId: args.convexTeamId,
                },
              ];
            default:
              return [];
          }
        },
      },
    },
  });
  const serverHttpClient = new ConvexHttpClient("https://samebase-test.convex.cloud");
  const convexClient = new ConvexReactClient("https://samebase-test.convex.cloud");
  const action =
    args.client === "server"
      ? vi.spyOn(serverHttpClient, "action").mockImplementation(args.connect)
      : vi.spyOn(convexClient, "action").mockImplementation(args.connect);
  const context = {
    convexQueryClient: {
      convexClient,
      serverHttpClient: args.client === "server" ? serverHttpClient : undefined,
    },
    queryClient,
  };
  const params = { owner: "samebase", repository: "base-alchemy" };
  return {
    action,
    load: args.attachments
      ? loadRepositoryOverview({ context, params, deps: { attachments: true } })
      : loadRepositoryAlchemyPage({ context, params }),
  };
}

describe("loadRepositoryAlchemyPage", () => {
  it.each(["server", "browser"] as const)(
    "returns the store connection with its first read through the %s client",
    async (client) => {
      const { action, load } = loadPage({
        client,
        convexTeamId: "38516",
        connect: async () => liveConnection,
      });

      await expect(load).resolves.toEqual({
        state: "loaded",
        repositoryId: "repository-a",
        convexTeamId: "38516",
        connection: liveConnection,
      });
      expect(action).toHaveBeenCalledExactlyOnceWith(
        api.repository.alchemyState.connectWithSnapshot,
        { repositoryId: "repository-a" },
      );
    },
  );

  it.each([
    [new ConvexError(ALCHEMY_CONNECTION_UNAVAILABLE), ALCHEMY_CONNECTION_UNAVAILABLE],
    [new Error("[Request ID: 1] Server Error"), "Could not read Alchemy state."],
  ])("answers a store problem with a failed read: %s", async (error, message) => {
    const { load } = loadPage({
      client: "server",
      convexTeamId: "38516",
      connect: async () => {
        throw error;
      },
    });

    await expect(load).resolves.toEqual({
      state: "failed",
      repositoryId: "repository-a",
      convexTeamId: "38516",
      message,
    });
  });

  it("reads no store for a repository without a Convex team or with ?attachments", async () => {
    const withoutTeam = loadPage({
      client: "server",
      convexTeamId: undefined,
      connect: async () => liveConnection,
    });
    await expect(withoutTeam.load).resolves.toBeNull();
    const attachments = loadPage({
      client: "server",
      convexTeamId: "38516",
      connect: async () => liveConnection,
      attachments: true,
    });
    await expect(attachments.load).resolves.toBeNull();

    for (const { action } of [withoutTeam, attachments]) {
      expect(action).not.toHaveBeenCalled();
    }
  });
});
