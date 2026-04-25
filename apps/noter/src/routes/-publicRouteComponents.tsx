import { Suspense, useMemo, type ReactNode } from "react";
import { resolvePageMetadata } from "@/lib/pageMetadata";
import { usePageMetadata } from "@/lib/usePageMetadata";

/**
 * Shared route wrapper for public metadata and lazy child boundaries.
 */
export function RoutedPage(props: { children?: ReactNode; pathname: string }) {
  const metadata = useMemo(
    () =>
      resolvePageMetadata({
        pathname: props.pathname,
        isAuthenticated: false,
      }),
    [props.pathname],
  );
  usePageMetadata(metadata);

  return <Suspense fallback={null}>{props.children}</Suspense>;
}
