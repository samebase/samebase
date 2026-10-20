import { ConvexQueryClient } from "@convex-dev/react-query";
import { QueryClient } from "@tanstack/react-query";
import { convexUrl } from "@/lib/convexUrl";

export type AppQueryClients = {
  convexQueryClient: ConvexQueryClient;
  queryClient: QueryClient;
};

/**
Start calls the router factory once per server request and once in the browser, so each render gets
its own clients and no server render shares a session or a cache with another one.
*/
export function createAppQueryClients(): AppQueryClients {
  const convexQueryClient = new ConvexQueryClient(convexUrl, {
    // Holds the first subscription until the session is known, so a page rendered as the user
    // gets the user's live answers; `SessionProvider` releases it for a visitor without one.
    expectAuth: true,
    // Convex mutations sync continuously; a broad pending-request unload prompt
    // makes ordinary tab closes feel unsafe even when app state is recoverable.
    unsavedChangesWarning: false,
  });
  // The router owns this QueryClient so TanStack Start can serialize and
  // hydrate the same cache that Convex query hooks read from after mount.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: convexQueryClient.queryFn(),
        queryKeyHashFn: convexQueryClient.hashFn(),
        refetchOnWindowFocus: false,
        staleTime: 60 * 1000,
      },
    },
  });

  convexQueryClient.connect(queryClient);

  return { convexQueryClient, queryClient };
}
