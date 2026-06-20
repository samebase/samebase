import { ConvexQueryClient } from "@convex-dev/react-query";
import { QueryClient } from "@tanstack/react-query";
import { client } from "@/lib/convexClient";

export type AppQueryClients = {
  convexQueryClient: ConvexQueryClient;
  queryClient: QueryClient;
};

export function createAppQueryClients(): AppQueryClients {
  const convexQueryClient = new ConvexQueryClient(client);
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
