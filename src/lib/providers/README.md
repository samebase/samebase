# React Query with Convex

This directory contains providers and utilities for using TanStack React Query with Convex.

## QueryProvider

The `QueryProvider` component wraps your application with React Query's `QueryClientProvider` and sets up the React Query DevTools. It provides a configured `QueryClient` instance with sensible defaults.

```tsx
// Default configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      refetchOnWindowFocus: false,
    },
  },
});
```

## Usage with Convex

React Query works well alongside Convex for several use cases:

1. **External API Data Fetching**: Use React Query for external API calls while using Convex for your database.
2. **Caching Convex Actions**: Wrap Convex actions with React Query to add caching, refetching, and other React Query features.
3. **Optimistic Updates**: Combine React Query's mutation capabilities with Convex's real-time updates.

### Example: Wrapping a Convex Action

```tsx
import { useQuery } from '@tanstack/react-query';
import { useAction } from 'convex/react';
import { api } from '../../../convex/_generated/api';

export function useGitHubRepositories() {
  const listRepositories = useAction(api.github.listRepositories);

  return useQuery({
    queryKey: ['github-repositories'],
    queryFn: async () => {
      try {
        return await listRepositories({});
      } catch (error) {
        throw error instanceof Error 
          ? error 
          : new Error('Failed to fetch repositories');
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}
```

### Benefits of Using React Query with Convex

1. **Caching**: React Query provides a powerful caching layer that can reduce the number of network requests.
2. **Automatic Refetching**: Configure when data should be refetched (on window focus, on reconnect, etc.).
3. **Loading and Error States**: Easy access to loading and error states.
4. **Pagination and Infinite Queries**: Built-in support for paginated and infinite scroll data.
5. **DevTools**: React Query DevTools for debugging and inspecting your queries.

### When to Use React Query vs. Convex Queries

- **Convex Queries**: Use for real-time database queries that need to update automatically when data changes.
- **React Query with Convex Actions**: Use for data that doesn't need real-time updates or for wrapping actions that fetch data from external sources.
- **React Query for External APIs**: Use for any non-Convex API calls.

## Further Resources

- [TanStack Query Documentation](https://tanstack.com/query/latest/docs/react/overview)
- [Convex Documentation](https://docs.convex.dev/) 