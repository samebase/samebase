import { ConvexAuthProvider } from "@convex-dev/auth/react";
import type { ReactNode } from "react";
import { client } from "@/lib/convexClient";
import { QueryProvider } from "@/lib/providers/query-provider";
import { OptionalThemeProvider } from "@/lib/themeStorageFallback";

/**
 * Shared app-level providers for real client mounts.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <OptionalThemeProvider>
      <ConvexAuthProvider client={client}>
        <QueryProvider>{children}</QueryProvider>
      </ConvexAuthProvider>
    </OptionalThemeProvider>
  );
}
