import { QueryClient } from "@tanstack/react-query";
import { ConvexError } from "convex/values";
import { describe, expect, it } from "vite-plus/test";
import { AUTHENTICATED_ACCOUNT_DELETED } from "../../shared/authenticatedAccountAvailability";
import { loadRoot } from "./root.queries";

function queryClientFailingWith(error: Error) {
  return new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: () => {
          throw error;
        },
      },
    },
  });
}

describe("loadRoot", () => {
  it("renders a session whose account was deleted and leaves its viewer queries to the browser", async () => {
    const queryClient = queryClientFailingWith(new ConvexError(AUTHENTICATED_ACCOUNT_DELETED));

    await loadRoot({ queryClient, token: "session-token" });

    expect(queryClient.getQueryCache().getAll()).toEqual([]);
  });

  it("fails the render for any other viewer error", async () => {
    const queryClient = queryClientFailingWith(new Error("Server Error"));

    await expect(loadRoot({ queryClient, token: "session-token" })).rejects.toThrow("Server Error");
  });
});
